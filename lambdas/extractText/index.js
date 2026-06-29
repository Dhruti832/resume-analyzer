const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");

const textract = new TextractClient({});

exports.handler = async (event) => {
  const { bucket, key } = event;

  const response = await textract.send(
    new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: bucket, Name: key } },
    })
  );

  const resumeText = (response.Blocks || [])
    .filter((block) => block.BlockType === "LINE")
    .map((block) => block.Text)
    .join("\n");

  return { ...event, resumeText };
};
