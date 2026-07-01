data "archive_file" "query_api" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/queryApi"
  output_path = "${path.module}/build/queryApi.zip"
}

resource "aws_lambda_function" "query_api" {
  function_name    = "queryApi"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.query_api.output_path
  source_code_hash = data.archive_file.query_api.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      JOBS_TABLE    = aws_dynamodb_table.jobs.name
      RESULTS_TABLE = aws_dynamodb_table.results.name
      RESUME_BUCKET = aws_s3_bucket.resumes.bucket
    }
  }
}

resource "aws_cloudwatch_log_group" "query_api" {
  name              = "/aws/lambda/${aws_lambda_function.query_api.function_name}"
  retention_in_days = 14
}
