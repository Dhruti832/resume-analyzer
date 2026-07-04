# AI Resume Analyzer & Job Matcher

Serverless AI-powered resume screening system built on AWS using Terraform IaC.
Two user roles: **students** (upload resume, see their own AI score and feedback)
and **recruiters** (post jobs, bulk-upload resumes, view ranked candidates with charts).

## Architecture

```
Student/Recruiter Browser
        â”‚
        â–¼
API Gateway (HTTP API) â”€â”€JWT authorizerâ”€â”€â–¶ Cognito User Pool
        â”‚                                  (students / recruiters groups)
   â”Œâ”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚  POST /upload     GET /jobs    POST /jobs        â”‚
   â”‚  GET /results     GET /my-results                â”‚
   â”‚  GET /jobs/{id}/results                          â”‚
   â””â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚
   Lambda Functions
        â”‚
        â”œâ”€ createUploadUrl â”€â”€â–¶ S3 presigned PUT URL â”€â”€â–¶ Resume S3 Bucket
        â”‚                       (seeds ResultsTable: status=pending)
        â”‚
        â”œâ”€ S3 Event â”€â”€â–¶ ingestUpload â”€â”€â–¶ Step Functions State Machine
        â”‚                                       â”‚
        â”‚                         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚                    ExtractText    ParseAndScore  NotifyResult
        â”‚                    (Textract)   (HF LLM via     (SNS email)
        â”‚                                Secrets Manager)
        â”‚                         â”‚
        â”‚                    MarkFailedStep (DynamoDB SDK) â”€â”€â–¶ NotifyErrorStep (SNS)
        â”‚                    [on any error]
        â”‚
        â”œâ”€ queryApi â”€â”€â–¶ DynamoDB ResultsTable / JobsTable
        â”œâ”€ getRankedResults â”€â”€â–¶ DynamoDB GSI (jobId-matchScore-index, sorted desc)
        â””â”€ createJob â”€â”€â–¶ DynamoDB JobsTable

DynamoDB ResultsTable: PK=candidateId, SK=resumeId
  GSIs: userId-createdAt-index (student history), jobId-matchScore-index (recruiter ranking)

Monitoring: CloudWatch Alarms on all 8 Lambdas + Step Functions failures + DynamoDB throttles
```

The frontend is served via a dedicated Lambda (`serveFrontend`) reading from a private S3 bucket
through API Gateway â€” CloudFront is not available in AWS Academy Learner Lab.

## Features

**Student portal**
- Upload resume as PDF against any posted job or paste a custom job description
- Real-time analysis progress stepper (Upload â†’ Textract â†’ AI Scoring â†’ Complete)
- History tab showing all past analyses with status (pending / completed / failed)
- Per-analysis: match score, matched skills, strengths, gaps, and improvement recommendations
- Resume PDF download

**Recruiter portal**
- Post job openings with required skills and location
- Drag-and-drop bulk resume upload (multiple PDFs at once)
- Ranked candidates page with:
  - Stat cards (total applicants, average score, top score, strong matches â‰¥70)
  - Score distribution bar chart + top skills frequency chart (Chart.js)
  - Ranked table with score pill, mini progress bar, skills, and summary

**Infrastructure**
- Cognito-backed auth with Post-Confirmation Lambda for automatic group assignment
- Step Functions error handling: failed analyses update DynamoDB (`status=failed`) and send SNS alert
- S3 lifecycle: 30-day noncurrent version expiry, 7-day incomplete multipart cleanup
- API Gateway throttling: 100 rps / 50 burst
- HF API token stored in AWS Secrets Manager (never in code or IaC)
- Security headers on all frontend responses (HSTS, X-Frame-Options, CSP)

## Services Used

| Category | Services |
|---|---|
| Compute | AWS Lambda (Node.js 20.x) |
| Orchestration | AWS Step Functions (Standard Workflows) |
| API | Amazon API Gateway (HTTP API, JWT authorizer) |
| Storage | Amazon S3 (resumes + frontend), Amazon DynamoDB |
| AI/ML | Amazon Textract, Hugging Face Inference API (Qwen/Qwen2.5-7B-Instruct) |
| Auth | Amazon Cognito (User Pool, Hosted UI, groups) |
| Messaging | Amazon SNS |
| Secrets | AWS Secrets Manager |
| Monitoring | Amazon CloudWatch (10 metric alarms) |
| IaC / CI | Terraform, GitHub Actions |

## API Endpoints

All routes require `Authorization: Bearer <cognito-id-token>`.

| Method | Path | Role | Description |
|---|---|---|---|
| POST | /upload | any | Presigned S3 PUT URL; seeds `status=pending` in ResultsTable |
| GET | /jobs | any | List all public job postings |
| POST | /jobs | recruiters | Create a job posting |
| GET | /results/{candidateId} | owner only | Get analysis result (403 if not owner) |
| GET | /my-results | students | Paginated history with job details and download URLs |
| GET | /jobs/{jobId}/results | recruiters | Ranked candidates for a job (ownership enforced) |

Pagination: `?limit=N&nextToken=<base64url>` on `/my-results` and `/jobs/{jobId}/results`.

## Running Tests

```bash
npm install
npm test
```

Tests use [aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock) to mock
all AWS SDK calls â€” no AWS credentials needed.

```
Test Suites: 6 passed
Tests:       71 passed
```

## Deploy

### Prerequisites

- Terraform â‰¥ 1.9
- AWS CLI with Learner Lab credentials
- `infra/terraform.tfvars` (gitignored):

```hcl
demo_user_password = "YourPassword123!"
notification_email = "you@example.com"   # optional â€” SNS alert recipient
hf_token           = "hf_..."            # Hugging Face API token
```

### Steps

```bash
cd infra
terraform init
terraform apply -auto-approve
```

> **AWS Academy Learner Lab:** credentials expire every ~4 hours.
> Update `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`
> in GitHub repository secrets before each CI deploy.

### Demo accounts

Two Terraform-managed accounts are created automatically:

| Role | Email | Password |
|---|---|---|
| Student | student1@test.com | `demo_user_password` from tfvars |
| Recruiter | recruiter1@test.com | `demo_user_password` from tfvars |

## CI/CD

GitHub Actions runs on every push to `main`:

1. **Unit tests** â€” `npm test` must pass before deploy starts
2. **Terraform apply** â€” deploys infra and Lambda code changes to AWS

Secrets required in GitHub repository settings:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
`DEMO_USER_PASSWORD`, `HF_TOKEN`
