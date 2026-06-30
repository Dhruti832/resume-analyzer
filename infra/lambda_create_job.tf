data "archive_file" "create_job" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/createJob"
  output_path = "${path.module}/build/createJob.zip"
}

resource "aws_lambda_function" "create_job" {
  function_name    = "createJob"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.create_job.output_path
  source_code_hash = data.archive_file.create_job.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      JOBS_TABLE = aws_dynamodb_table.jobs.name
    }
  }
}

resource "aws_cloudwatch_log_group" "create_job" {
  name              = "/aws/lambda/${aws_lambda_function.create_job.function_name}"
  retention_in_days = 14
}
