const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, GetItemCommand, ScanCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { marshall } = require("@aws-sdk/util-dynamodb");

const ddbMock = mockClient(DynamoDBClient);
const smMock = mockClient(SecretsManagerClient);

process.env.JOBS_TABLE = "JobsTable";
process.env.RESULTS_TABLE = "ResultsTable";
process.env.HF_MODEL = "test-model";
process.env.HF_TOKEN_SECRET_ID = "test-secret";

const { handler } = require("../lambdas/parseScore/index");

const mockFetch = jest.fn();
global.fetch = mockFetch;

const baseEvent = {
  candidateId: "cand-1",
  resumeId: "res-1",
  resumeText: "Software engineer with 5 years AWS experience",
  jobId: "job-1",
  userId: "user-1",
  bucket: "test-bucket",
  key: "resumes/user-1/cand-1/job-1/res-1.pdf",
};

function hfResponse(content) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
  };
}

function llmJson(overrides = {}) {
  return JSON.stringify({
    matchScore: 80,
    skills: ["Node.js", "AWS"],
    summary: "Strong candidate",
    strengths: ["AWS experience"],
    gaps: ["Missing Python"],
    recommendations: ["Add Python projects"],
    ...overrides,
  });
}

beforeEach(() => {
  ddbMock.reset();
  smMock.reset();
  mockFetch.mockReset();

  smMock.on(GetSecretValueCommand).resolves({
    SecretString: JSON.stringify({ token: "hf_test_token" }),
  });

  // First GetItem: job lookup; Second GetItem: candidateName seed lookup
  ddbMock
    .on(GetItemCommand)
    .resolvesOnce({ Item: marshall({ title: "Software Engineer", requiredSkills: ["Node.js", "AWS"] }) })
    .resolvesOnce({ Item: marshall({ candidateName: "Jane Doe" }) });

  ddbMock.on(PutItemCommand).resolves({});
});

describe("extractJson", () => {
  test("parses clean JSON from LLM response", async () => {
    mockFetch.mockResolvedValue(hfResponse(llmJson({ matchScore: 85 })));
    const result = await handler(baseEvent);
    expect(result.matchScore).toBe(85);
    expect(result.summary).toBe("Strong candidate");
  });

  test("extracts JSON embedded in markdown code fence", async () => {
    const fenced = "```json\n" + llmJson({ matchScore: 72 }) + "\n```";
    mockFetch.mockResolvedValue(hfResponse(fenced));
    const result = await handler(baseEvent);
    expect(result.matchScore).toBe(72);
  });

  test("extracts JSON when LLM adds preamble text before the object", async () => {
    const withPreamble = "Here is the analysis:\n" + llmJson({ matchScore: 60 });
    mockFetch.mockResolvedValue(hfResponse(withPreamble));
    const result = await handler(baseEvent);
    expect(result.matchScore).toBe(60);
  });

  test("throws when LLM returns no JSON object", async () => {
    mockFetch.mockResolvedValue(hfResponse("I cannot evaluate this resume."));
    await expect(handler(baseEvent)).rejects.toThrow("No JSON object found");
  });

  test("throws when LLM returns malformed JSON", async () => {
    mockFetch.mockResolvedValue(hfResponse('{"matchScore": 70, "skills": [broken}'));
    await expect(handler(baseEvent)).rejects.toThrow("Failed to parse JSON");
  });
});

describe("DynamoDB writes", () => {
  test("writes status: completed to ResultsTable", async () => {
    mockFetch.mockResolvedValue(hfResponse(llmJson()));
    await handler(baseEvent);

    const puts = ddbMock.commandCalls(PutItemCommand).filter(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(puts.length).toBe(1);
    expect(puts[0].args[0].input.Item.status.S).toBe("completed");
  });

  test("includes matchScore in the DynamoDB record", async () => {
    mockFetch.mockResolvedValue(hfResponse(llmJson({ matchScore: 91 })));
    await handler(baseEvent);

    const put = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(put.args[0].input.Item.matchScore.N).toBe("91");
  });

  test("defaults skills/strengths/gaps to empty arrays when missing from LLM response", async () => {
    mockFetch.mockResolvedValue(hfResponse(JSON.stringify({ matchScore: 50, summary: "Partial" })));
    await handler(baseEvent);

    const put = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(put.args[0].input.Item.skills.L).toEqual([]);
    expect(put.args[0].input.Item.strengths.L).toEqual([]);
    expect(put.args[0].input.Item.gaps.L).toEqual([]);
  });

  test("stores s3Key when key is present in event", async () => {
    mockFetch.mockResolvedValue(hfResponse(llmJson()));
    await handler(baseEvent);

    const put = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(put.args[0].input.Item.s3Key.S).toBe(baseEvent.key);
  });

  test("omits s3Key when key is absent from event", async () => {
    mockFetch.mockResolvedValue(hfResponse(llmJson()));
    await handler({ ...baseEvent, key: "" });

    const put = ddbMock.commandCalls(PutItemCommand).find(
      (c) => c.args[0].input.TableName === "ResultsTable"
    );
    expect(put.args[0].input.Item.s3Key).toBeUndefined();
  });
});

describe("general jobId path", () => {
  test("scans all jobs when jobId is 'general'", async () => {
    ddbMock.reset();
    smMock.on(GetSecretValueCommand).resolves({ SecretString: JSON.stringify({ token: "hf_test_token" }) });
    ddbMock.on(ScanCommand).resolves({ Items: [marshall({ jobId: "j1", title: "Dev", isPrivate: false })] });
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ candidateName: "" }) });
    ddbMock.on(PutItemCommand).resolves({});
    mockFetch.mockResolvedValue(hfResponse(llmJson()));

    await handler({ ...baseEvent, jobId: "general" });

    expect(ddbMock.commandCalls(ScanCommand).length).toBe(1);
  });
});
