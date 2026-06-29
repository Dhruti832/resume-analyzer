data "archive_file" "refresh_jobs" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/refreshJobs"
  output_path = "${path.module}/build/refreshJobs.zip"
}

resource "aws_lambda_function" "refresh_jobs" {
  function_name    = "refreshJobs"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.refresh_jobs.output_path
  source_code_hash = data.archive_file.refresh_jobs.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      JOBS_TABLE = aws_dynamodb_table.jobs.name
    }
  }
}

resource "aws_cloudwatch_log_group" "refresh_jobs" {
  name              = "/aws/lambda/${aws_lambda_function.refresh_jobs.function_name}"
  retention_in_days = 14
}

resource "aws_cloudwatch_event_rule" "daily_refresh" {
  name                = "daily-job-refresh"
  description         = "Trigger refreshJobs Lambda every 24 hours to keep JobsTable current"
  schedule_expression = "rate(24 hours)"
}

resource "aws_cloudwatch_event_target" "refresh_jobs" {
  rule      = aws_cloudwatch_event_rule.daily_refresh.name
  target_id = "refreshJobs"
  arn       = aws_lambda_function.refresh_jobs.arn
}

resource "aws_lambda_permission" "allow_eventbridge_refresh_jobs" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.refresh_jobs.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_refresh.arn
}
