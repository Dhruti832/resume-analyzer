jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://mock-bucket.s3.amazonaws.com/presigned"),
}));

const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { S3Client } = require("@aws-sdk/client-s3");

const ddbMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

process.env.BUCKET_NAME = "test-bucket";
process.env.JOBS_TABLE = "JobsTable";
process.env.RESULTS_TABLE = "ResultsTable";

const { handler } = require("../lambdas/createUploadUrl/index");

const authEvent = (body = {}, claims = {}) => ({
  body: JSON.stringify(body),
  requestContext: {
    authorizer: {
      jwt: { claims: { sub: "user-abc", email: "user@test.com", ...claims } },
    },
  },
});

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  ddbMock.on(PutItemCommand).resolves({});
});

describe("response shape", () => {
  test("returns uploadUrl, candidateId, resumeId, key, jobId", async () => {
    const res = await handler(authEvent({ jobId: "job-1" }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.uploadUrl).toBe("https://mock-bucket.s3.amazonaws.com/presigned");
    expect(body.candidateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.resumeId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.jobId).toBe("job-1");
    expect(body.key).toMatch(/^resumes\/user-abc\//);
  });

  test("falls back to jobId: general when neither jobId nor jobDescription provided", async () => {
    const res = await handler(authEvent({}));
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe("general");
  });
});

describe("pending seed in ResultsTable", () => {
  test("always writes status: pending to ResultsTable", async () => {
    await handler(authEvent({ jobId: "job-1" }));

    const resultsPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(resultsPut).toBeDefined();
    expect(resultsPut.args[0].input.Item.status.S).toBe("pending");
  });

  test("includes userId from JWT claims in the seed record", async () => {
    await handler(authEvent({ jobId: "job-1" }, { sub: "user-xyz" }));

    const resultsPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(resultsPut.args[0].input.Item.userId.S).toBe("user-xyz");
  });

  test("includes candidateName in seed when provided", async () => {
    await handler(authEvent({ jobId: "job-1", candidateName: "Alice Smith" }));

    const resultsPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(resultsPut.args[0].input.Item.candidateName.S).toBe("Alice Smith");
  });

  test("omits candidateName from seed when not provided", async () => {
    await handler(authEvent({ jobId: "job-1" }));

    const resultsPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(resultsPut.args[0].input.Item.candidateName).toBeUndefined();
  });
});

describe("custom jobDescription path", () => {
  test("creates a private job entry in JobsTable when jobDescription provided", async () => {
    await handler(authEvent({ jobDescription: "Looking for a senior Node.js developer" }));

    const jobPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "JobsTable"
    );
    expect(jobPut).toBeDefined();
    expect(jobPut.args[0].input.Item.isPrivate.BOOL).toBe(true);
  });

  test("derives a title from the first line of the job description", async () => {
    await handler(authEvent({ jobDescription: "Senior Backend Engineer\n\nWe are hiring..." }));

    const jobPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "JobsTable"
    );
    expect(jobPut.args[0].input.Item.title.S).toBe("Senior Backend Engineer");
  });

  test("truncates job title to 60 chars with ellipsis when first line is long", async () => {
    const longLine = "A".repeat(70);
    await handler(authEvent({ jobDescription: longLine }));

    const jobPut = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "JobsTable"
    );
    const title = jobPut.args[0].input.Item.title.S;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith("…")).toBe(true);
  });

  test("uses a UUID as jobId when a custom description is provided", async () => {
    const res = await handler(authEvent({ jobDescription: "React developer needed" }));
    const body = JSON.parse(res.body);
    expect(body.jobId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("S3 key format", () => {
  test("key encodes userId, candidateId, jobId, resumeId", async () => {
    const res = await handler(authEvent({ jobId: "job-99" }, { sub: "usr-1" }));
    const { key, candidateId, resumeId } = JSON.parse(res.body);
    expect(key).toBe(`resumes/usr-1/${candidateId}/job-99/${resumeId}.pdf`);
  });
});
