const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const sns = new SNSClient({});
const TOPIC_ARN = process.env.TOPIC_ARN;

exports.handler = async (event) => {
  const { candidateId, resumeId, matchScore, summary } = event;

  await sns.send(
    new PublishCommand({
      TopicArn: TOPIC_ARN,
      Subject: "Your resume analysis is ready",
      Message:
        `candidateId=${candidateId}\nresumeId=${resumeId}\nmatchScore=${matchScore}\n\n${summary || ""}`,
    })
  );

  return { candidateId, resumeId, matchScore };
};
