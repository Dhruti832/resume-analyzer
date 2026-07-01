resource "aws_apigatewayv2_api" "main" {
  name          = "resume-analyzer-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

# JWT authorizer — validates Cognito access tokens on every route
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.frontend.id]
    issuer   = "https://cognito-idp.us-east-1.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# --- POST /upload -> createUploadUrl ---

resource "aws_apigatewayv2_integration" "create_upload_url" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_upload_url.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "upload" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /upload"
  target             = "integrations/${aws_apigatewayv2_integration.create_upload_url.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_apigw_create_upload_url" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_upload_url.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# --- GET /jobs and GET /results/{candidateId} -> queryApi ---

resource "aws_apigatewayv2_integration" "query_api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.query_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_jobs" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /jobs"
  target             = "integrations/${aws_apigatewayv2_integration.query_api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_results" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /results/{candidateId}"
  target             = "integrations/${aws_apigatewayv2_integration.query_api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_my_results" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /my-results"
  target             = "integrations/${aws_apigatewayv2_integration.query_api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_apigw_query_api" {
  statement_id  = "AllowAPIGatewayInvokeQueryApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.query_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# --- POST /jobs -> createJob ---

resource "aws_apigatewayv2_integration" "create_job" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_job.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_jobs" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "POST /jobs"
  target             = "integrations/${aws_apigatewayv2_integration.create_job.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_apigw_create_job" {
  statement_id  = "AllowAPIGatewayInvokeCreateJob"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_job.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# --- GET /jobs/{jobId}/results -> getRankedResults ---

resource "aws_apigatewayv2_integration" "get_ranked_results" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_ranked_results.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_ranked_results" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "GET /jobs/{jobId}/results"
  target             = "integrations/${aws_apigatewayv2_integration.get_ranked_results.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_apigw_get_ranked_results" {
  statement_id  = "AllowAPIGatewayInvokeGetRankedResults"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_ranked_results.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

output "api_base_url" {
  value = aws_apigatewayv2_api.main.api_endpoint
}
