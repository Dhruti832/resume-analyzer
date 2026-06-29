data "archive_file" "ingest_upload" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/ingestUpload"
  output_path = "${path.module}/build/ingestUpload.zip"
}

resource "aws_lambda_function" "ingest_upload" {
  function_name    = "ingestUpload"
  role              = data.aws_iam_role.lab_role.arn
  runtime           = "nodejs20.x"
  handler           = "index.handler"
  filename          = data.archive_file.ingest_upload.output_path
  source_code_hash  = data.archive_file.ingest_upload.output_base64sha256
  timeout           = 10
}

resource "aws_cloudwatch_log_group" "ingest_upload" {
  name              = "/aws/lambda/${aws_lambda_function.ingest_upload.function_name}"
  retention_in_days = 14
}

resource "aws_lambda_permission" "allow_s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest_upload.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.resumes.arn
}

resource "aws_s3_bucket_notification" "resume_upload" {
  bucket = aws_s3_bucket.resumes.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.ingest_upload.arn
    events              = ["s3:ObjectCreated:Put"]
  }

  depends_on = [aws_lambda_permission.allow_s3_invoke]
}
