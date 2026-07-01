const { DynamoDBClient, QueryCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall, marshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
const RESULTS_TABLE = process.env.RESULTS_TABLE;
const JOBS_TABLE = process.env.JOBS_TABLE;
const RESUME_BUCKET = process.env.RESUME_BUCKET;
const DEFAULT_LIMIT = 50;

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getUserGroups(event) {
  const claim = event.requestContext?.authorizer?.jwt?.claims?.["cognito:groups"];
  if (!claim) return [];
  if (Array.isArray(claim)) return claim;
  return claim.replace(/^\[|\]$/g, "").split(",").map((g) => g.trim()).filter(Boolean);
}

exports.handler = async (event) => {
  if (!getUserGroups(event).includes("recruiters")) {
    return respond(403, { error: "Recruiters only" });
  }

  const recruiterId = event.requestContext?.authorizer?.jwt?.claims?.sub;
  const jobId = event.pathParameters?.jobId;
  if (!jobId) return respond(400, { error: "Missing jobId" });

  // Verify the requesting recruiter owns this job
  const jobItem = await dynamodb.send(new GetItemCommand({
    TableName: process.env.JOBS_TABLE,
    Key: { jobId: { S: jobId } },
    ProjectionExpression: "ownerId",
  }));
  if (!jobItem.Item) return respond(404, { error: "Job not found" });
  const jobOwnerId = jobItem.Item.ownerId?.S;
  if (jobOwnerId && jobOwnerId !== recruiterId) {
    return respond(403, { error: "You do not own this job" });
  }

  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit, 10) || DEFAULT_LIMIT, 100);
  let exclusiveStartKey;
  if (qs.nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(qs.nextToken, "base64url").toString("utf8"));
    } catch (_) {}
  }

  const result = await dynamodb.send(
    new QueryCommand({
      TableName: RESULTS_TABLE,
      IndexName: "jobId-matchScore-index",
      KeyConditionExpression: "jobId = :jid",
      ExpressionAttributeValues: { ":jid": { S: jobId } },
      ScanIndexForward: false,
      Limit: limit,
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    })
  );

  const items = await Promise.all(
    (result.Items || []).map(async (item) => {
      const r = unmarshall(item);
      let downloadUrl = null;
      if (r.s3Key && RESUME_BUCKET) {
        try {
          downloadUrl = await getSignedUrl(
            s3,
            new GetObjectCommand({ Bucket: RESUME_BUCKET, Key: r.s3Key }),
            { expiresIn: 600 }
          );
        } catch (err) {
          console.error("Failed to generate presigned URL for", r.s3Key, err);
        }
      }
      return { ...r, ...(downloadUrl ? { downloadUrl } : {}) };
    })
  );

  const response = { items };
  if (result.LastEvaluatedKey) {
    response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64url");
  }

  return respond(200, response);
};
