jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://mock-presigned.s3.amazonaws.com/resume.pdf"),
}));

const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, GetItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");
const { marshall } = require("@aws-sdk/util-dynamodb");

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

process.env.RESULTS_TABLE = "ResultsTable";
process.env.JOBS_TABLE = "JobsTable";
process.env.RESUME_BUCKET = "test-bucket";

const { handler } = require("../lambdas/getRankedResults/index");

function makeEvent({ groups = ["recruiters"], sub = "rec-1", jobId = "job-1", qs = {} } = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub, "cognito:groups": `[${groups.join(", ")}]` } },
      },
    },
    pathParameters: { jobId },
    queryStringParameters: qs,
  };
}

const candidateItem = (overrides = {}) =>
  marshall({
    candidateId: "cand-1",
    resumeId: "res-1",
    jobId: "job-1",
    matchScore: 75,
    status: "completed",
    skills: ["Node.js"],
    s3Key: "resumes/user-1/cand-1/job-1/res-1.pdf",
    ...overrides,
  });

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
});

describe("authorization", () => {
  test("returns 403 for non-recruiter", async () => {
    const res = await handler(makeEvent({ groups: ["students"] }));
    expect(res.statusCode).toBe(403);
  });

  test("returns 403 when groups claim is absent", async () => {
    const event = {
      requestContext: { authorizer: { jwt: { claims: { sub: "x" } } } },
      pathParameters: { jobId: "job-1" },
      queryStringParameters: {},
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
  });
});

describe("job ownership check", () => {
  test("returns 404 when job does not exist", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: undefined });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
  });

  test("returns 403 when job is owned by a different recruiter", async () => {
    ddbMock.on(GetItemCommand).resolves({
      Item: marshall({ ownerId: "other-recruiter" }),
    });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/do not own/);
  });

  test("allows access when recruiterId matches ownerId", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ ownerId: "rec-1" }) });
    ddbMock.on(QueryCommand).resolves({ Items: [candidateItem()] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    expect(res.statusCode).toBe(200);
  });

  test("allows access when job has no ownerId set (legacy jobs)", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ jobId: "job-1" }) });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
  });
});

describe("results response", () => {
  beforeEach(() => {
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ ownerId: "rec-1" }) });
  });

  test("returns items array in response", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [candidateItem(), candidateItem({ matchScore: 60, candidateId: "cand-2" })] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(2);
  });

  test("returns empty items array when no candidates", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.items).toEqual([]);
  });

  test("includes downloadUrl for items that have s3Key", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [candidateItem()] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.items[0].downloadUrl).toBe("https://mock-presigned.s3.amazonaws.com/resume.pdf");
  });

  test("omits downloadUrl for items without s3Key", async () => {
    const { s3Key: _, ...withoutKey } = marshall({ candidateId: "c1", matchScore: 70, jobId: "job-1" });
    ddbMock.on(QueryCommand).resolves({ Items: [marshall({ candidateId: "c1", matchScore: 70, jobId: "job-1" })] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.items[0].downloadUrl).toBeUndefined();
  });
});

describe("pagination", () => {
  beforeEach(() => {
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ ownerId: "rec-1" }) });
  });

  test("includes nextToken in response when LastEvaluatedKey is present", async () => {
    const lastKey = marshall({ candidateId: "last", jobId: "job-1", matchScore: 40 });
    ddbMock.on(QueryCommand).resolves({ Items: [candidateItem()], LastEvaluatedKey: lastKey });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeDefined();
  });

  test("omits nextToken when no more pages", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [candidateItem()] });
    const res = await handler(makeEvent({ sub: "rec-1" }));
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeUndefined();
  });

  test("decodes nextToken and passes as ExclusiveStartKey", async () => {
    const lastKey = { candidateId: { S: "last" }, jobId: { S: "job-1" }, matchScore: { N: "40" } };
    const token = Buffer.from(JSON.stringify(lastKey)).toString("base64url");
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ ownerId: "rec-1" }) });
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    await handler(makeEvent({ sub: "rec-1", qs: { nextToken: token } }));

    const query = ddbMock.commandCalls(QueryCommand)[0];
    expect(query.args[0].input.ExclusiveStartKey).toEqual(lastKey);
  });
});
