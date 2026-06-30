const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const RESULTS_TABLE = process.env.RESULTS_TABLE;

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

  const jobId = event.pathParameters?.jobId;
  if (!jobId) return respond(400, { error: "Missing jobId" });

  const result = await dynamodb.send(
    new QueryCommand({
      TableName: RESULTS_TABLE,
      IndexName: "jobId-matchScore-index",
      KeyConditionExpression: "jobId = :jid",
      ExpressionAttributeValues: { ":jid": { S: jobId } },
      ScanIndexForward: false, // highest score first
    })
  );

  return respond(200, (result.Items || []).map(unmarshall));
};
