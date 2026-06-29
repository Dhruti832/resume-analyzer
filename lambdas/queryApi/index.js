const { DynamoDBClient, ScanCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const JOBS_TABLE = process.env.JOBS_TABLE;
const RESULTS_TABLE = process.env.RESULTS_TABLE;

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
    const result = await dynamodb.send(new ScanCommand({ TableName: JOBS_TABLE }));
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

    // Return the most recent result for this candidate
    const sorted = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return respond(200, sorted[0]);
  }

  return respond(404, { error: "Route not found" });
};
