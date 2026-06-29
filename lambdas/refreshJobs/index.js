const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const JOBS_TABLE = process.env.JOBS_TABLE;

const JOBS = [
  {
    jobId: "job-001",
    title: "Backend Engineer",
    description: "Build scalable REST APIs and microservices on AWS.",
    requiredSkills: ["Node.js", "AWS", "DynamoDB", "REST APIs", "Docker"],
    location: "Remote",
  },
  {
    jobId: "job-002",
    title: "Data Scientist",
    description: "Develop ML models and data pipelines at scale.",
    requiredSkills: ["Python", "Machine Learning", "SQL", "TensorFlow", "AWS SageMaker"],
    location: "Remote",
  },
  {
    jobId: "job-003",
    title: "Cloud Solutions Architect",
    description: "Design cloud-native architectures on AWS using IaC.",
    requiredSkills: ["AWS", "Terraform", "Kubernetes", "CI/CD", "Security"],
    location: "Remote",
  },
];

exports.handler = async () => {
  await Promise.all(
    JOBS.map((job) =>
      dynamodb.send(new PutItemCommand({ TableName: JOBS_TABLE, Item: marshall(job) }))
    )
  );
  console.log(`Refreshed ${JOBS.length} jobs in ${JOBS_TABLE}`);
  return { refreshed: JOBS.length };
};
