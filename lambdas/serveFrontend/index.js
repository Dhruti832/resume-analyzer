const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({});
const BUCKET = process.env.FRONTEND_BUCKET;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
};

function contentTypeFor(key) {
  const ext = key.slice(key.lastIndexOf("."));
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

exports.handler = async (event) => {
  let path = event.rawPath || "/";
  if (path === "/" || path === "") path = "/index.html";
  const key = path.replace(/^\//, "");

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await obj.Body.transformToString();
    return {
      statusCode: 200,
      headers: { "Content-Type": contentTypeFor(key), "Cache-Control": "no-cache" },
      body,
    };
  } catch (err) {
    return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "Not found" };
  }
};
