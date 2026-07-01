# ── Lambda error alarms ───────────────────────────────────────────────────────

locals {
  lambda_names = [
    aws_lambda_function.create_upload_url.function_name,
    aws_lambda_function.query_api.function_name,
    aws_lambda_function.create_job.function_name,
    aws_lambda_function.get_ranked_results.function_name,
    aws_lambda_function.ingest_upload.function_name,
    aws_lambda_function.extract_text.function_name,
    aws_lambda_function.parse_score.function_name,
    aws_lambda_function.notify_result.function_name,
  ]
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(local.lambda_names)

  alarm_name          = "${each.key}-errors"
  alarm_description   = "Lambda ${each.key} error rate > 0 over 5 minutes"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.notification_email != "" ? [aws_sns_topic.resume_notifications.arn] : []
}

# ── Step Functions failure alarm ──────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "sfn_failures" {
  alarm_name          = "ResumeAnalysis-StepFunctions-Failures"
  alarm_description   = "Step Functions execution failures for ResumeAnalysisStateMachine"
  namespace           = "AWS/States"
  metric_name         = "ExecutionsFailed"
  dimensions          = { StateMachineArn = aws_sfn_state_machine.resume_analysis.arn }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.notification_email != "" ? [aws_sns_topic.resume_notifications.arn] : []
}

# ── DynamoDB throttle alarm ───────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  alarm_name          = "ResultsTable-Throttles"
  alarm_description   = "DynamoDB throttled requests on ResultsTable"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  dimensions          = { TableName = aws_dynamodb_table.results.name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = var.notification_email != "" ? [aws_sns_topic.resume_notifications.arn] : []
}
