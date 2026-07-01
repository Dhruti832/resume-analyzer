const { DynamoDBClient, ScanCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
const JOBS_TABLE = process.env.JOBS_TABLE;
const RESULTS_TABLE = process.env.RESULTS_TABLE;
const RESUME_BUCKET = process.env.RESUME_BUCKET;

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const routeKey = event.routeKey;

  if (routeKey === "GET /jobs") {
    const result = await dynamodb.send(new ScanCommand({
      TableName: JOBS_TABLE,
      FilterExpression: "attribute_not_exists(isPrivate) OR isPrivate = :f",
      ExpressionAttributeValues: { ":f": { BOOL: false } },
    }));
    return respond(200, (result.Items || []).map(unmarshall));
  }

  if (routeKey === "GET /results/{candidateId}") {
    const candidateId = event.pathParameters?.candidateId;
    if (!candidateId) return respond(400, { error: "Missing candidateId" });

    const result = await dynamodb.send(
      new QueryCommand({
        TableName: RESULTS_TABLE,
        KeyConditionExpression: "candidateId = :id",
        ExpressionAttributeValues: { ":id": { S: candidateId } },
      })
    );

    const items = (result.Items || []).map(unmarshall);
    if (items.length === 0) return respond(404, { error: "No results found" });

    const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return respond(200, sorted[0]);
  }

  if (routeKey === "GET /my-results") {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return respond(401, { error: "Unauthorized" });

    const result = await dynamodb.send(new QueryCommand({
      TableName: RESULTS_TABLE,
      IndexName: "userId-createdAt-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": { S: userId } },
      ScanIndexForward: false,
    }));

    // Fetch full job details — "description" and "location" are DynamoDB reserved
    // words so they must be aliased via ExpressionAttributeNames.
    const jobsResult = await dynamodb.send(new ScanCommand({
      TableName: JOBS_TABLE,
      ProjectionExpression: "jobId, title, #desc, requiredSkills, #loc",
      ExpressionAttributeNames: { "#desc": "description", "#loc": "location" },
    }));
    const jobMap = {};
    (jobsResult.Items || []).forEach((item) => {
      const j = unmarshall(item);
      jobMap[j.jobId] = j;
    });

    const items = await Promise.all((result.Items || []).map(async (item) => {
      const r = unmarshall(item);
      const job = jobMap[r.jobId] || {};

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

      return {
        ...r,
        jobTitle: job.title || r.jobId,
        jobDescription: job.description || "",
        jobRequiredSkills: job.requiredSkills || [],
        jobLocation: job.location || "",
        ...(downloadUrl ? { downloadUrl } : {}),
      };
    }));

    return respond(200, items);
  }

  return respond(404, { error: "Route not found" });
};
