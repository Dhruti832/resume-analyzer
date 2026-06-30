const { DynamoDBClient, ScanCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const dynamodb = new DynamoDBClient({});
const secretsManager = new SecretsManagerClient({});

const JOBS_TABLE = process.env.JOBS_TABLE;
const RESULTS_TABLE = process.env.RESULTS_TABLE;
const HF_MODEL = process.env.HF_MODEL;
const HF_TOKEN_SECRET_ID = process.env.HF_TOKEN_SECRET_ID;

let cachedHfToken;

async function getHfToken() {
  if (cachedHfToken) return cachedHfToken;
  const secret = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: HF_TOKEN_SECRET_ID })
  );
  cachedHfToken = JSON.parse(secret.SecretString).token;
  return cachedHfToken;
}

function buildPrompt(resumeText, jobs) {
  const jobsList = jobs
    .map((j) => `- ${j.jobId}: ${j.title} (required skills: ${(j.requiredSkills || []).join(", ")})`)
    .join("\n");

  return `You are a resume screening assistant. Given a candidate's resume text and a list of job postings, return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{"matchScore": <0-100 integer>, "skills": [<extracted skills>], "matches": [{"jobId": "<id>", "score": <0-100>}], "summary": "<2-3 sentence summary>"}

Resume:
${resumeText}

Job postings:
${jobsList}`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in LLM response: ${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

exports.handler = async (event) => {
  const { candidateId, resumeId, resumeText, jobId = "general" } = event;

  const jobsResponse = await dynamodb.send(new ScanCommand({ TableName: JOBS_TABLE }));
  const jobs = (jobsResponse.Items || []).map((item) => unmarshall(item));

  const hfToken = await getHfToken();
  const prompt = buildPrompt(resumeText, jobs);

  // Use the unified chat-completions endpoint (OpenAI-compatible) so the HF
  // router auto-selects whichever Inference Provider actually hosts this
  // model, instead of pinning to a single provider that may not host it.
  let hfResponse;
  try {
    hfResponse = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
      }),
    });
  } catch (err) {
    console.error("Fetch to Hugging Face failed:", err, "cause:", err.cause);
    throw err;
  }

  if (!hfResponse.ok) {
    throw new Error(`Hugging Face API error: ${hfResponse.status} ${await hfResponse.text()}`);
  }

  const hfBody = await hfResponse.json();
  const generatedText = hfBody.choices[0].message.content;
  const result = extractJson(generatedText);

  await dynamodb.send(
    new PutItemCommand({
      TableName: RESULTS_TABLE,
      Item: marshall({
        candidateId,
        resumeId,
        jobId,
        matchScore: result.matchScore,
        skills: result.skills || [],
        matches: result.matches || [],
        summary: result.summary || "",
        createdAt: new Date().toISOString(),
      }),
    })
  );

  return { ...event, matchScore: result.matchScore, summary: result.summary };
};
