const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfn = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

// Resume keys are written by createUploadUrl as resumes/{candidateId}/{resumeId}.pdf
function parseKey(key) {
  const match = key.match(/^resumes\/([^/]+)\/([^/]+)\.pdf$/);
  if (!match) return null;
  return { candidateId: match[1], resumeId: match[2] };
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const ids = parseKey(key);

    if (!ids) {
      console.warn(`Skipping object with unexpected key format: ${key}`);
      continue;
    }

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        input: JSON.stringify({ bucket, key, ...ids }),
      })
    );
    console.log(`Started analysis for candidateId=${ids.candidateId} resumeId=${ids.resumeId}`);
  }
};
