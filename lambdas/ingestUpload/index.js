const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfn = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

function parseKey(key) {
  // Current format: resumes/{userId}/{candidateId}/{jobId}/{resumeId}.pdf
  const m4 = key.match(/^resumes\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\.pdf$/);
  if (m4) return { userId: m4[1], candidateId: m4[2], jobId: m4[3], resumeId: m4[4] };

  // Legacy: resumes/{candidateId}/{jobId}/{resumeId}.pdf (no userId)
  const m3 = key.match(/^resumes\/([^/]+)\/([^/]+)\/([^/]+)\.pdf$/);
  if (m3) return { userId: "unknown", candidateId: m3[1], jobId: m3[2], resumeId: m3[3] };

  // Legacy: resumes/{candidateId}/{resumeId}.pdf (no userId, no jobId)
  const m2 = key.match(/^resumes\/([^/]+)\/([^/]+)\.pdf$/);
  if (m2) return { userId: "unknown", candidateId: m2[1], resumeId: m2[2], jobId: "general" };

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
    console.log(`Started analysis: candidateId=${ids.candidateId} jobId=${ids.jobId} userId=${ids.userId}`);
  }
};
