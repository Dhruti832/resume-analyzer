data "archive_file" "extract_text" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/extractText"
  output_path = "${path.module}/build/extractText.zip"
}

resource "aws_lambda_function" "extract_text" {
  function_name    = "extractText"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.extract_text.output_path
  source_code_hash = data.archive_file.extract_text.output_base64sha256
  timeout          = 30
}

resource "aws_cloudwatch_log_group" "extract_text" {
  name              = "/aws/lambda/${aws_lambda_function.extract_text.function_name}"
  retention_in_days = 14
}
