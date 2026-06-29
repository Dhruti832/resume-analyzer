data "archive_file" "notify_result" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/notifyResult"
  output_path = "${path.module}/build/notifyResult.zip"
}

resource "aws_lambda_function" "notify_result" {
  function_name    = "notifyResult"
  role              = data.aws_iam_role.lab_role.arn
  runtime           = "nodejs20.x"
  handler           = "index.handler"
  filename          = data.archive_file.notify_result.output_path
  source_code_hash  = data.archive_file.notify_result.output_base64sha256
  timeout           = 10

  environment {
    variables = {
      TOPIC_ARN = aws_sns_topic.resume_notifications.arn
    }
  }
}

resource "aws_cloudwatch_log_group" "notify_result" {
  name              = "/aws/lambda/${aws_lambda_function.notify_result.function_name}"
  retention_in_days = 14
}
