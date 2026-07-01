const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const ddbMock = mockClient(DynamoDBClient);

process.env.JOBS_TABLE = "JobsTable";

const { handler } = require("../lambdas/createJob/index");

function makeEvent({ groups = ["recruiters"], body = {}, sub = "recruiter-1" } = {}) {
  const groupClaim = Array.isArray(groups) ? `[${groups.join(", ")}]` : groups;
  return {
    body: JSON.stringify(body),
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            sub,
            "cognito:groups": groupClaim,
          },
        },
      },
    },
  };
}

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(PutItemCommand).resolves({});
});

describe("authorization", () => {
  test("returns 403 when caller is not in recruiters group", async () => {
    const res = await handler(makeEvent({ groups: ["students"] }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("Recruiters only");
  });

  test("returns 403 when groups claim is missing", async () => {
    const event = {
      body: JSON.stringify({ jobId: "j1", title: "Dev" }),
      requestContext: { authorizer: { jwt: { claims: { sub: "user-1" } } } },
    };
    const res = await handler(event);
    expect(res.statusCode).toBe(403);
  });

  test("allows recruiter with stringified array group claim", async () => {
    const res = await handler(makeEvent({
      groups: ["recruiters", "admins"],
      body: { jobId: "j1", title: "Dev" },
    }));
    expect(res.statusCode).toBe(201);
  });
});

describe("input validation", () => {
  test("returns 400 when jobId is missing", async () => {
    const res = await handler(makeEvent({ body: { title: "Dev" } }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/jobId/);
  });

  test("returns 400 when title is missing", async () => {
    const res = await handler(makeEvent({ body: { jobId: "j1" } }));
    expect(res.statusCode).toBe(400);
  });

  test("returns 400 when both jobId and title are missing", async () => {
    const res = await handler(makeEvent({ body: {} }));
    expect(res.statusCode).toBe(400);
  });
});

describe("successful job creation", () => {
  const validBody = {
    jobId: "swe-2026",
    title: "Software Engineer",
    description: "Build backend services",
    requiredSkills: ["Node.js", "AWS"],
    location: "Halifax",
  };

  test("returns 201 with jobId and title", async () => {
    const res = await handler(makeEvent({ body: validBody }));
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBe("swe-2026");
    expect(body.title).toBe("Software Engineer");
  });

  test("stores ownerId from JWT sub claim", async () => {
    await handler(makeEvent({ body: validBody, sub: "rec-99" }));
    const put = ddbMock.commandCalls(PutItemCommand)[0];
    expect(put.args[0].input.Item.ownerId.S).toBe("rec-99");
  });

  test("stores requiredSkills as a list", async () => {
    await handler(makeEvent({ body: validBody }));
    const put = ddbMock.commandCalls(PutItemCommand)[0];
    expect(put.args[0].input.Item.requiredSkills.L).toHaveLength(2);
  });

  test("defaults location to Remote when not provided", async () => {
    const { location: _, ...bodyWithoutLocation } = validBody;
    await handler(makeEvent({ body: bodyWithoutLocation }));
    const put = ddbMock.commandCalls(PutItemCommand)[0];
    expect(put.args[0].input.Item.location.S).toBe("Remote");
  });

  test("defaults description to empty string when not provided", async () => {
    const { description: _, ...bodyWithoutDesc } = validBody;
    await handler(makeEvent({ body: bodyWithoutDesc }));
    const put = ddbMock.commandCalls(PutItemCommand)[0];
    expect(put.args[0].input.Item.description.S).toBe("");
  });
});
