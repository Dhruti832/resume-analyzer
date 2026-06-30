data "archive_file" "serve_frontend" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/serveFrontend"
  output_path = "${path.module}/build/serveFrontend.zip"
}

resource "aws_lambda_function" "serve_frontend" {
  function_name    = "serveFrontend"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.serve_frontend.output_path
  source_code_hash = data.archive_file.serve_frontend.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      FRONTEND_BUCKET = aws_s3_bucket.frontend.bucket
    }
  }
}

resource "aws_cloudwatch_log_group" "serve_frontend" {
  name              = "/aws/lambda/${aws_lambda_function.serve_frontend.function_name}"
  retention_in_days = 14
}

# CloudFront is blocked in this Learner Lab account, so the static frontend
# is served over HTTPS through its own API Gateway + Lambda instead — the S3
# bucket stays fully private and only this Lambda reads from it.
resource "aws_apigatewayv2_api" "frontend" {
  name          = "resume-analyzer-frontend"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "frontend_default" {
  api_id      = aws_apigatewayv2_api.frontend.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "serve_frontend" {
  api_id                 = aws_apigatewayv2_api.frontend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.serve_frontend.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "frontend_root" {
  api_id    = aws_apigatewayv2_api.frontend.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.serve_frontend.id}"
}

resource "aws_apigatewayv2_route" "frontend_proxy" {
  api_id    = aws_apigatewayv2_api.frontend.id
  route_key = "GET /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.serve_frontend.id}"
}

resource "aws_lambda_permission" "allow_apigw_serve_frontend" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.serve_frontend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.frontend.execution_arn}/*/*"
}

output "frontend_url" {
  value = aws_apigatewayv2_api.frontend.api_endpoint
}
