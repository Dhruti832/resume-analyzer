# AI Resume Analyzer & Job Matcher

Serverless AI-powered resume screening system built on AWS using Terraform.

## Architecture

Upload PDF → S3 → Step Functions → Textract → Hugging Face LLM → DynamoDB → SNS email

## Services Used

- AWS Lambda, API Gateway, S3, DynamoDB, Step Functions, Textract, SNS, EventBridge
- Hugging Face Inference API (Qwen/Qwen2.5-7B-Instruct)
- Terraform (IaC), GitHub Actions (CI/CD)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /upload | Get presigned S3 URL for PDF upload |
| GET | /jobs | List all job postings |
| GET | /results/{candidateId} | Get analysis result for a candidate |

## Deploy

```bash
cd infra
terraform init
terraform apply -auto-approve
```

> **Note:** AWS Academy Learner Lab credentials expire every ~4 hours.
> Update `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`
> in GitHub repository secrets before each deploy session.
