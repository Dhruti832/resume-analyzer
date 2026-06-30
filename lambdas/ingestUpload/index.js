const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfn = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

function parseKey(key) {
  // Format with jobId:    resumes/{candidateId}/{jobId}/{resumeId}.pdf
  const m3 = key.match(/^resumes\/([^/]+)\/([^/]+)\/([^/]+)\.pdf$/);
  if (m3) return { candidateId: m3[1], jobId: m3[2], resumeId: m3[3] };

  // Format without jobId: resumes/{candidateId}/{resumeId}.pdf  (student upload)
  const m2 = key.match(/^resumes\/([^/]+)\/([^/]+)\.pdf$/);
  if (m2) return { candidateId: m2[1], resumeId: m2[2], jobId: "general" };

  return null;
}

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const ids = parseKey(key);

    if (!ids) { console.warn(`Skipping unexpected key: ${key}`); continue; }

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        input: JSON.stringify({ bucket, key, ...ids }),
      })
    );
    console.log(`Started analysis: candidateId=${ids.candidateId} jobId=${ids.jobId}`);
  }
};
