# AI Resume Analyzer & Job Matcher

Serverless AI-powered resume screening system built on AWS using Terraform IaC.
Two user roles: **students** (upload resume, see their own AI score and feedback)
and **recruiters** (post jobs, bulk-upload resumes, view ranked candidates with charts).

## Architecture

```
Student/Recruiter Browser
        │
        ▼
API Gateway (HTTP API) ──JWT authorizer──▶ Cognito User Pool
        │                                  (students / recruiters groups)
   ┌────┴────────────────────────────────────────────┐
   │  POST /upload     GET /jobs    POST /jobs        │
   │  GET /results     GET /my-results                │
   │  GET /jobs/{id}/results                          │
   └────┬────────────────────────────────────────────┘
        │
   Lambda Functions
        │
        ├─ createUploadUrl ──▶ S3 presigned PUT URL ──▶ Resume S3 Bucket
        │                       (seeds ResultsTable: status=pending)
        │
        ├─ S3 Event ──▶ ingestUpload ──▶ Step Functions State Machine
        │                                       │
        │                         ┌─────────────┼─────────────┐
        │                    ExtractText    ParseAndScore  NotifyResult
        │                    (Textract)   (HF LLM via     (SNS email)
        │                                Secrets Manager)
        │                         │
        │                    MarkFailedStep (DynamoDB SDK) ──▶ NotifyErrorStep (SNS)
        │                    [on any error]
        │
        ├─ queryApi ──▶ DynamoDB ResultsTable / JobsTable (also mints presigned S3 GET URLs)
        ├─ getRankedResults ──▶ DynamoDB GSI (jobId-matchScore-index, sorted desc)
        ├─ createJob ──▶ DynamoDB JobsTable
        └─ EventBridge (rate: 24h) ──▶ refreshJobs ──▶ DynamoDB JobsTable

DynamoDB ResultsTable: PK=candidateId, SK=resumeId
  GSIs: userId-createdAt-index (student history), jobId-matchScore-index (recruiter ranking)

Monitoring: CloudWatch Alarms on all 8 Lambdas + Step Functions failures + DynamoDB throttles
```

The frontend is served via a dedicated Lambda (`serveFrontend`) reading from a private S3 bucket
through API Gateway — CloudFront is not available in AWS Academy Learner Lab.

## Features

**Student portal**
- Upload resume as PDF against any posted job or paste a custom job description
- Real-time analysis progress stepper (Upload → Textract → AI Scoring → Complete)
- History tab showing all past analyses with status (pending / completed / failed)
- Per-analysis: match score, matched skills, strengths, gaps, and improvement recommendations
- Resume PDF download

**Recruiter portal**
- Post job openings with required skills and location
- Drag-and-drop bulk resume upload (multiple PDFs at once)
- Ranked candidates page with:
  - Stat cards (total applicants, average score, top score, strong matches ≥70)
  - Score distribution bar chart + top skills frequency chart (Chart.js)
  - Ranked table with score pill, mini progress bar, skills, summary, and resume PDF download

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
| Scheduling | Amazon EventBridge (24h rule seeds baseline job postings) |
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
all AWS SDK calls — no AWS credentials needed.

```
Test Suites: 6 passed
Tests:       71 passed
```

## Deploy

### Prerequisites

- Terraform ≥ 1.9
- AWS CLI with Learner Lab credentials
- `infra/terraform.tfvars` (gitignored):

```hcl
demo_user_password = "YourPassword123!"
notification_email = "you@example.com"   # optional — SNS alert recipient
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

1. **Unit tests** — `npm test` must pass before deploy starts
2. **Terraform apply** — deploys infra and Lambda code changes to AWS

Secrets required in GitHub repository settings:
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`,
`DEMO_USER_PASSWORD`, `HF_TOKEN`
