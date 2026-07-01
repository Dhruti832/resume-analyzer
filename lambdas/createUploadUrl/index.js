const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
const { randomUUID } = require("crypto");

const s3 = new S3Client({});
const dynamodb = new DynamoDBClient({});
const BUCKET_NAME = process.env.BUCKET_NAME;
const JOBS_TABLE = process.env.JOBS_TABLE;

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  const userId = claims.sub || "unknown";
  const userEmail = claims.email || claims["cognito:username"] || userId;

  let { jobId, jobDescription } = body;

  // Student provided a custom job description — store it as a private job entry
  // so parseScore can fetch it by jobId like any other job.
  if (!jobId && jobDescription && jobDescription.trim()) {
    jobId = randomUUID();
    // Derive a readable title from the first non-empty line of the description
    const firstLine = jobDescription.trim().split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) || "";
    const customTitle = firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine || "Custom Job";
    await dynamodb.send(new PutItemCommand({
      TableName: JOBS_TABLE,
      Item: marshall({
        jobId,
        title: customTitle,
        description: jobDescription.trim(),
        requiredSkills: [],
        isPrivate: true,
        ownerId: userId,
        createdAt: new Date().toISOString(),
      }),
    }));
  }

  if (!jobId) jobId = "general";

  const candidateId = randomUUID();
  const resumeId = randomUUID();
  const candidateName = (body.candidateName || "").trim().slice(0, 120);

  // Seed the ResultsTable so downstream lambdas can look up the original filename
  if (candidateName) {
    await dynamodb.send(new PutItemCommand({
      TableName: process.env.RESULTS_TABLE,
      Item: marshall({ candidateId, resumeId, candidateName, jobId, userId }),
    }));
  }
  // userId is encoded in the key so ingestUpload can pass it through Step Functions
  const key = `resumes/${userId}/${candidateId}/${jobId}/${resumeId}.pdf`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadUrl, candidateId, resumeId, key, jobId }),
  };
};
