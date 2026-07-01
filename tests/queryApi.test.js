jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://mock-presigned.s3.amazonaws.com/resume.pdf"),
}));

const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, ScanCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");
const { marshall } = require("@aws-sdk/util-dynamodb");

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

process.env.JOBS_TABLE = "JobsTable";
process.env.RESULTS_TABLE = "ResultsTable";
process.env.RESUME_BUCKET = "test-bucket";

const { handler } = require("../lambdas/queryApi/index");

function makeEvent(routeKey, { sub = "user-1", pathParams = {}, qs = {} } = {}) {
  return {
    routeKey,
    requestContext: {
      authorizer: { jwt: { claims: { sub } } },
    },
    pathParameters: pathParams,
    queryStringParameters: qs,
  };
}

const jobItem = (overrides = {}) =>
  marshall({ jobId: "job-1", title: "Software Engineer", description: "Build things", isPrivate: false, ...overrides });

const resultItem = (overrides = {}) =>
  marshall({
    candidateId: "cand-1",
    resumeId: "res-1",
    jobId: "job-1",
    userId: "user-1",
    matchScore: 80,
    status: "completed",
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  });

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
});

describe("GET /jobs", () => {
  test("returns 200 with all non-private jobs", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [jobItem(), jobItem({ jobId: "job-2", isPrivate: false })] });
    const res = await handler(makeEvent("GET /jobs"));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(2);
  });

  test("returns empty array when no jobs exist", async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler(makeEvent("GET /jobs"));
    expect(JSON.parse(res.body)).toEqual([]);
  });

  test("returns empty array when Items is undefined", async () => {
    ddbMock.on(ScanCommand).resolves({});
    const res = await handler(makeEvent("GET /jobs"));
    expect(JSON.parse(res.body)).toEqual([]);
  });
});

describe("GET /results/{candidateId}", () => {
  test("returns 404 when no results found for candidateId", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await handler(makeEvent("GET /results/{candidateId}", { pathParams: { candidateId: "cand-99" } }));
    expect(res.statusCode).toBe(404);
  });

  test("returns 403 when result userId does not match requester", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [resultItem({ userId: "other-user" })],
    });
    const res = await handler(
      makeEvent("GET /results/{candidateId}", { sub: "user-1", pathParams: { candidateId: "cand-1" } })
    );
    expect(res.statusCode).toBe(403);
  });

  test("returns 200 when result userId matches requester", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [resultItem({ userId: "user-1" })] });
    const res = await handler(
      makeEvent("GET /results/{candidateId}", { sub: "user-1", pathParams: { candidateId: "cand-1" } })
    );
    expect(res.statusCode).toBe(200);
  });

  test("returns most recent result when multiple exist for same candidateId", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        resultItem({ createdAt: "2026-07-01T10:00:00.000Z", matchScore: 60 }),
        resultItem({ createdAt: "2026-07-01T12:00:00.000Z", matchScore: 85, resumeId: "res-2" }),
      ],
    });
    const res = await handler(
      makeEvent("GET /results/{candidateId}", { sub: "user-1", pathParams: { candidateId: "cand-1" } })
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).matchScore).toBe(85);
  });

  test("returns 400 when candidateId path param is missing", async () => {
    const res = await handler(makeEvent("GET /results/{candidateId}", { pathParams: {} }));
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /my-results", () => {
  test("returns 401 when sub claim is missing", async () => {
    const event = { routeKey: "GET /my-results", requestContext: { authorizer: { jwt: { claims: {} } } }, queryStringParameters: {} };
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
  });

  test("returns 200 with items array", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [resultItem()] });
    ddbMock.on(ScanCommand).resolves({ Items: [jobItem()] });
    const res = await handler(makeEvent("GET /my-results"));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  test("enriches results with job title from JobsTable", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [resultItem({ jobId: "job-1" })] });
    ddbMock.on(ScanCommand).resolves({ Items: [jobItem({ jobId: "job-1", title: "Backend Dev" })] });
    const res = await handler(makeEvent("GET /my-results"));
    const { items } = JSON.parse(res.body);
    expect(items[0].jobTitle).toBe("Backend Dev");
  });

  test("falls back to jobId as jobTitle when job not found in JobsTable", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [resultItem({ jobId: "unknown-job" })] });
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler(makeEvent("GET /my-results"));
    const { items } = JSON.parse(res.body);
    expect(items[0].jobTitle).toBe("unknown-job");
  });

  test("includes nextToken when LastEvaluatedKey is present", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [resultItem()],
      LastEvaluatedKey: marshall({ candidateId: "last", userId: "user-1", createdAt: "2026-07-01T00:00:00Z" }),
    });
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler(makeEvent("GET /my-results"));
    expect(JSON.parse(res.body).nextToken).toBeDefined();
  });

  test("omits nextToken when no more pages", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [resultItem()] });
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await handler(makeEvent("GET /my-results"));
    expect(JSON.parse(res.body).nextToken).toBeUndefined();
  });

  test("decodes nextToken into ExclusiveStartKey on query", async () => {
    const lastKey = { candidateId: { S: "c-last" }, userId: { S: "user-1" }, createdAt: { S: "2026-07-01T00:00:00Z" } };
    const token = Buffer.from(JSON.stringify(lastKey)).toString("base64url");
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(ScanCommand).resolves({ Items: [] });

    await handler(makeEvent("GET /my-results", { qs: { nextToken: token } }));

    const q = ddbMock.commandCalls(QueryCommand)[0];
    expect(q.args[0].input.ExclusiveStartKey).toEqual(lastKey);
  });
});

describe("unknown routes", () => {
  test("returns 404 for unrecognised route key", async () => {
    const res = await handler(makeEvent("DELETE /something"));
    expect(res.statusCode).toBe(404);
  });
});
