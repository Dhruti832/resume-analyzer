exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    console.log(`Resume uploaded: bucket=${bucket} key=${key}`);
    // Day 3: replace this log with sfn:StartExecution against
    // ResumeAnalysisStateMachine, passing { bucket, key }.
  }
};
