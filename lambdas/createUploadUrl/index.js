const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME;

exports.handler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const jobId = body.jobId || null;

  const candidateId = randomUUID();
  const resumeId = randomUUID();

  // Encode jobId in the S3 key so ingestUpload can extract it from the S3 event
  // without needing a separate metadata lookup.
  const key = jobId
    ? `resumes/${candidateId}/${jobId}/${resumeId}.pdf`
    : `resumes/${candidateId}/${resumeId}.pdf`;

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
