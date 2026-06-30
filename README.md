# AI Resume Analyzer & Job Matcher

Serverless AI-powered resume screening system built on AWS using Terraform, with
Cognito-backed auth for two user roles: students (self-upload, see own score)
and recruiters (post jobs, bulk-upload resumes, view ranked candidates per job).

## Architecture

Upload PDF → S3 → Step Functions → Textract → Hugging Face LLM → DynamoDB → SNS email

Auth: Cognito Hosted UI (implicit flow) → API Gateway JWT authorizer → group-based
authorization (`students` / `recruiters`) enforced inside each Lambda.

The static frontend is served over HTTPS via a dedicated API Gateway + Lambda
(`serveFrontend`) that reads pages from a private S3 bucket — this Learner Lab
account blocks `cloudfront:CreateDistribution`, so CloudFront could not be used
as the HTTPS-terminating layer Cognito requires for callback URLs.

## Services Used

- AWS Lambda, API Gateway (HTTP API, JWT authorizer), S3, DynamoDB, Step Functions, Textract, SNS, EventBridge, Cognito
- Hugging Face Inference API (Qwen/Qwen2.5-7B-Instruct)
- Terraform (IaC), GitHub Actions (CI/CD)

## API Endpoints

All routes require a Cognito-issued JWT (`Authorization: Bearer <token>`).

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /upload | any | Get presigned S3 URL for PDF upload (optional `jobId` in body for recruiter bulk uploads) |
| GET | /jobs | any | List all job postings |
| POST | /jobs | recruiters | Post a new job opening |
| GET | /results/{candidateId} | any | Get analysis result for a candidate |
| GET | /jobs/{jobId}/results | recruiters | Ranked candidate list for a job (highest score first) |

## Deploy

```bash
cd infra
terraform init
terraform apply -auto-approve
```

> **Note:** AWS Academy Learner Lab credentials expire every ~4 hours.
> Update `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`
> in GitHub repository secrets before each deploy session.
