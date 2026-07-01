const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
const RESULTS_TABLE = process.env.RESULTS_TABLE;
const RESUME_BUCKET = process.env.RESUME_BUCKET;

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

  const jobId = event.pathParameters?.jobId;
  if (!jobId) return respond(400, { error: "Missing jobId" });

  const result = await dynamodb.send(
    new QueryCommand({
      TableName: RESULTS_TABLE,
      IndexName: "jobId-matchScore-index",
      KeyConditionExpression: "jobId = :jid",
      ExpressionAttributeValues: { ":jid": { S: jobId } },
      ScanIndexForward: false,
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
            { expiresIn: 3600 }
          );
        } catch (_) {}
      }
      return { ...r, ...(downloadUrl ? { downloadUrl } : {}) };
    })
  );

  return respond(200, items);
};
