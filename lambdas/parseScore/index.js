const { DynamoDBClient, GetItemCommand, ScanCommand, PutItemCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
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

// Used when a specific job is targeted (student custom description or recruiter bulk upload)
function buildSingleJobPrompt(resumeText, job) {
  const skills = job.requiredSkills?.length ? `Required skills: ${job.requiredSkills.join(", ")}` : "";
  return `You are a resume screening assistant. Score the candidate's resume against the job posting below.
Return ONLY a JSON object (no markdown, no extra commentary) with this exact shape:
{
  "matchScore": <0-100 integer>,
  "skills": [<skills extracted from the resume>],
  "summary": "<2-3 sentence overall assessment of fit>",
  "strengths": ["<specific thing from the resume that matches the job>", ...],
  "gaps": ["<specific requirement from the job that the resume is missing or weak on>", ...],
  "recommendations": ["<concrete actionable suggestion to improve the resume for this role>", ...]
}

Rules:
- strengths: 2-4 items, each referencing something specific in the resume that aligns with the job.
- gaps: 2-4 items, each naming a specific job requirement that is missing or under-demonstrated.
- recommendations: 2-4 items, each a concrete, actionable suggestion (e.g. "Add a bullet about X", "Quantify Y with numbers").

Job title: ${job.title}
${job.description ? `Job description: ${job.description}` : ""}
${skills}

Resume:
${resumeText}`;
}

// Used when no specific job is given — score against all available postings
function buildMultiJobPrompt(resumeText, jobs) {
  const jobsList = jobs
    .map((j) => `- ${j.jobId}: ${j.title} (required skills: ${(j.requiredSkills || []).join(", ")})`)
    .join("\n");

  return `You are a resume screening assistant. Given a candidate's resume and a list of job postings, return ONLY a JSON object (no markdown, no commentary) with this exact shape:
{
  "matchScore": <0-100 integer>,
  "skills": [<extracted skills>],
  "matches": [{"jobId": "<id>", "score": <0-100>}],
  "summary": "<2-3 sentence summary>",
  "strengths": ["<strength>", ...],
  "gaps": ["<gap>", ...],
  "recommendations": ["<recommendation>", ...]
}

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
  const { candidateId, resumeId, resumeText, jobId = "general", userId = "unknown", bucket = "", key = "" } = event;

  // Build prompt: targeted for a specific job, or general across all jobs
  let prompt;
  if (jobId !== "general") {
    const item = await dynamodb.send(new GetItemCommand({
      TableName: JOBS_TABLE,
      Key: { jobId: { S: jobId } },
    }));
    const job = item.Item ? unmarshall(item.Item) : null;
    prompt = job ? buildSingleJobPrompt(resumeText, job) : buildMultiJobPrompt(resumeText, []);
  } else {
    const jobsResponse = await dynamodb.send(new ScanCommand({ TableName: JOBS_TABLE }));
    const jobs = (jobsResponse.Items || []).map(unmarshall).filter((j) => !j.isPrivate);
    prompt = buildMultiJobPrompt(resumeText, jobs);
  }

  const hfToken = await getHfToken();

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

  // Fetch candidateName seeded at upload time (may not exist for older uploads)
  let candidateName = "";
  try {
    const seed = await dynamodb.send(new GetItemCommand({
      TableName: RESULTS_TABLE,
      Key: { candidateId: { S: candidateId }, resumeId: { S: resumeId } },
      ProjectionExpression: "candidateName",
    }));
    candidateName = seed.Item?.candidateName?.S || "";
  } catch (_) {}

  await dynamodb.send(
    new PutItemCommand({
      TableName: RESULTS_TABLE,
      Item: marshall({
        candidateId,
        resumeId,
        jobId,
        userId,
        candidateName,
        matchScore: result.matchScore,
        skills: result.skills || [],
        matches: result.matches || [],
        summary: result.summary || "",
        strengths: result.strengths || [],
        gaps: result.gaps || [],
        recommendations: result.recommendations || [],
        createdAt: new Date().toISOString(),
        ...(key ? { s3Key: key } : {}),
      }),
    })
  );

  return { ...event, matchScore: result.matchScore, summary: result.summary };
};
