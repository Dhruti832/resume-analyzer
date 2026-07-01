data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "resumes" {
  bucket = "resume-analyzer-resumes-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Protects against accidental overwrite/delete of uploaded resumes (Reliability pillar).
resource "aws_s3_bucket_versioning" "resumes" {
  bucket = aws_s3_bucket.resumes.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Allows the browser to PUT directly to the presigned URL from the deployed frontend origin only.
resource "aws_s3_bucket_lifecycle_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = [aws_apigatewayv2_api.frontend.api_endpoint]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}
