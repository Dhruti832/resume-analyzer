const { mockClient } = require("aws-sdk-client-mock");
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfnMock = mockClient(SFNClient);

process.env.STATE_MACHINE_ARN = "arn:aws:states:us-east-1:123456789:stateMachine:ResumeAnalysis";

const { handler } = require("../lambdas/ingestUpload/index");

function s3Event(key, bucket = "test-bucket") {
  return {
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key: encodeURIComponent(key).replace(/%2F/g, "/") },
        },
      },
    ],
  };
}

beforeEach(() => {
  sfnMock.reset();
  sfnMock.on(StartExecutionCommand).resolves({ executionArn: "arn:aws:states:us-east-1:123:execution:test:abc" });
});

describe("parseKey — current 4-segment format", () => {
  test("extracts userId, candidateId, jobId, resumeId from resumes/{userId}/{candidateId}/{jobId}/{resumeId}.pdf", async () => {
    await handler(s3Event("resumes/user-1/cand-1/job-1/res-1.pdf"));

    const call = sfnMock.commandCalls(StartExecutionCommand)[0];
    const input = JSON.parse(call.args[0].input.input);
    expect(input.userId).toBe("user-1");
    expect(input.candidateId).toBe("cand-1");
    expect(input.jobId).toBe("job-1");
    expect(input.resumeId).toBe("res-1");
  });

  test("passes the bucket name into Step Functions input", async () => {
    await handler(s3Event("resumes/user-1/cand-1/job-1/res-1.pdf", "my-resume-bucket"));

    const input = JSON.parse(sfnMock.commandCalls(StartExecutionCommand)[0].args[0].input.input);
    expect(input.bucket).toBe("my-resume-bucket");
  });

  test("passes the full S3 key into Step Functions input", async () => {
    await handler(s3Event("resumes/user-1/cand-1/job-1/res-1.pdf"));

    const input = JSON.parse(sfnMock.commandCalls(StartExecutionCommand)[0].args[0].input.input);
    expect(input.key).toBe("resumes/user-1/cand-1/job-1/res-1.pdf");
  });

  test("starts one Step Functions execution per S3 record", async () => {
    const event = {
      Records: [
        { s3: { bucket: { name: "b" }, object: { key: "resumes/u1/c1/j1/r1.pdf" } } },
        { s3: { bucket: { name: "b" }, object: { key: "resumes/u2/c2/j2/r2.pdf" } } },
      ],
    };
    await handler(event);
    expect(sfnMock.commandCalls(StartExecutionCommand)).toHaveLength(2);
  });
});

describe("parseKey — legacy 3-segment format (no userId)", () => {
  test("falls back to userId: unknown for resumes/{candidateId}/{jobId}/{resumeId}.pdf", async () => {
    await handler(s3Event("resumes/cand-1/job-1/res-1.pdf"));

    const input = JSON.parse(sfnMock.commandCalls(StartExecutionCommand)[0].args[0].input.input);
    expect(input.userId).toBe("unknown");
    expect(input.candidateId).toBe("cand-1");
    expect(input.jobId).toBe("job-1");
    expect(input.resumeId).toBe("res-1");
  });
});

describe("parseKey — legacy 2-segment format (no userId, no jobId)", () => {
  test("falls back to userId: unknown and jobId: general for resumes/{candidateId}/{resumeId}.pdf", async () => {
    await handler(s3Event("resumes/cand-1/res-1.pdf"));

    const input = JSON.parse(sfnMock.commandCalls(StartExecutionCommand)[0].args[0].input.input);
    expect(input.userId).toBe("unknown");
    expect(input.candidateId).toBe("cand-1");
    expect(input.jobId).toBe("general");
    expect(input.resumeId).toBe("res-1");
  });
});

describe("unrecognised S3 key", () => {
  test("skips execution and does not call Step Functions for unrecognised key patterns", async () => {
    await handler(s3Event("uploads/some-random-file.pdf"));
    expect(sfnMock.commandCalls(StartExecutionCommand)).toHaveLength(0);
  });

  test("still processes subsequent valid records after skipping an invalid one", async () => {
    const event = {
      Records: [
        { s3: { bucket: { name: "b" }, object: { key: "bad/path.pdf" } } },
        { s3: { bucket: { name: "b" }, object: { key: "resumes/u1/c1/j1/r1.pdf" } } },
      ],
    };
    await handler(event);
    expect(sfnMock.commandCalls(StartExecutionCommand)).toHaveLength(1);
  });
});

describe("URL-encoded S3 keys", () => {
  test("decodes percent-encoded characters in the S3 key", async () => {
    const event = {
      Records: [{
        s3: {
          bucket: { name: "b" },
          object: { key: "resumes/user+1/cand-1/job-1/res-1.pdf" },
        },
      }],
    };
    await handler(event);
    const input = JSON.parse(sfnMock.commandCalls(StartExecutionCommand)[0].args[0].input.input);
    expect(input.key).toBe("resumes/user 1/cand-1/job-1/res-1.pdf");
  });
});
