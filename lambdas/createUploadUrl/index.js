const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { randomUUID } = require("crypto");

const s3 = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME;
const UPLOAD_URL_EXPIRY_SECONDS = 300;

exports.handler = async (event) => {
  const candidateId = randomUUID();
  const resumeId = randomUUID();
  const key = `resumes/${candidateId}/${resumeId}.pdf`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadUrl, candidateId, resumeId, key }),
  };
};
