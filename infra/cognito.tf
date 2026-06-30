resource "aws_cognito_user_pool" "main" {
  name = "resume-analyzer-users"

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }

  auto_verified_attributes = ["email"]
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "resume-analyzer-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "frontend" {
  name            = "resume-analyzer-frontend"
  user_pool_id    = aws_cognito_user_pool.main.id
  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["implicit"]
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  supported_identity_providers         = ["COGNITO"]

  # Admin-initiated auth (requires AWS credentials, not exposed to end users)
  # lets us smoke-test the JWT authorizer + group-based authorization via CLI.
  explicit_auth_flows = ["ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  callback_urls = [
    "${aws_apigatewayv2_api.frontend.api_endpoint}/callback.html"
  ]
  logout_urls = [
    "${aws_apigatewayv2_api.frontend.api_endpoint}/index.html"
  ]
}

resource "aws_cognito_user_group" "students" {
  name         = "students"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Students who upload their own resumes for job matching"
}

resource "aws_cognito_user_group" "recruiters" {
  name         = "recruiters"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Recruiters who manage job postings and bulk-analyze resumes"
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.frontend.id
}

output "cognito_hosted_ui_base" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.us-east-1.amazoncognito.com"
}
