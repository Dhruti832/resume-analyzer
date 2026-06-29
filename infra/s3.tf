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

# Allows the browser to PUT directly to the presigned URL from any origin.
# Tighten Allowed-Origins to the CloudFront/S3 frontend URL once it exists.
resource "aws_s3_bucket_cors_configuration" "resumes" {
  bucket = aws_s3_bucket.resumes.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    max_age_seconds = 3000
  }
}
