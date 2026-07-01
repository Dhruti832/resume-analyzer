data "archive_file" "cognito_post_confirmation" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/cognitoPostConfirmation"
  output_path = "${path.module}/build/cognitoPostConfirmation.zip"
}

resource "aws_lambda_function" "cognito_post_confirmation" {
  function_name    = "cognitoPostConfirmation"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.cognito_post_confirmation.output_path
  source_code_hash = data.archive_file.cognito_post_confirmation.output_base64sha256
  timeout          = 10
}

# Cognito needs explicit permission to invoke this trigger Lambda
resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_cloudwatch_log_group" "cognito_post_confirmation" {
  name              = "/aws/lambda/${aws_lambda_function.cognito_post_confirmation.function_name}"
  retention_in_days = 14
}
