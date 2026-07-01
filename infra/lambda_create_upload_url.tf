data "archive_file" "create_upload_url" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/createUploadUrl"
  output_path = "${path.module}/build/createUploadUrl.zip"
}

resource "aws_lambda_function" "create_upload_url" {
  function_name    = "createUploadUrl"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.create_upload_url.output_path
  source_code_hash = data.archive_file.create_upload_url.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      BUCKET_NAME   = aws_s3_bucket.resumes.bucket
      JOBS_TABLE    = aws_dynamodb_table.jobs.name
      RESULTS_TABLE = aws_dynamodb_table.results.name
    }
  }
}

resource "aws_cloudwatch_log_group" "create_upload_url" {
  name              = "/aws/lambda/${aws_lambda_function.create_upload_url.function_name}"
  retention_in_days = 14
}
