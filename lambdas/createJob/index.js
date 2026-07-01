const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const JOBS_TABLE = process.env.JOBS_TABLE;

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
  // API Gateway's JWT authorizer stringifies array claims Go-style, e.g. "[recruiters, students]"
  return claim.replace(/^\[|\]$/g, "").split(",").map((g) => g.trim()).filter(Boolean);
}

exports.handler = async (event) => {
  if (!getUserGroups(event).includes("recruiters")) {
    return respond(403, { error: "Recruiters only" });
  }

  const body = JSON.parse(event.body || "{}");
  const { jobId, title, description, requiredSkills, location } = body;
  const ownerId = event.requestContext?.authorizer?.jwt?.claims?.sub || "unknown";

  if (!jobId || !title) {
    return respond(400, { error: "jobId and title are required" });
  }

  await dynamodb.send(
    new PutItemCommand({
      TableName: JOBS_TABLE,
      Item: marshall({
        jobId,
        title,
        description: description || "",
        requiredSkills: requiredSkills || [],
        location: location || "Remote",
        ownerId,
        createdAt: new Date().toISOString(),
      }),
    })
  );

  return respond(201, { jobId, title });
};
