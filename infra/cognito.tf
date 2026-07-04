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

  # Wire the post-confirmation trigger so self-registered users are auto-added
  # to the "students" group without any manual admin step.
  lambda_config {
    post_confirmation = aws_lambda_function.cognito_post_confirmation.arn
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "resume-analyzer-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# Brands the Hosted UI login page to match frontend/*.html (indigo #4f46e5
# accent, sans-serif, light-gray background) instead of AWS's default
# unstyled login form.
resource "aws_cognito_user_pool_ui_customization" "main" {
  user_pool_id = aws_cognito_user_pool.main.id
  client_id    = aws_cognito_user_pool_client.frontend.id

  css = <<-CSS
    .background-customizable { background-color: #f0f2f5; }
    .banner-customizable { padding: 0; background-color: #ffffff; }
    .submitButton-customizable {
      background-color: #4f46e5;
      border-radius: 6px;
      border: none;
      font-weight: 600;
    }
    .submitButton-customizable:hover { background-color: #4338ca; }
    .textDescription-customizable {
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
      font-weight: 700;
      font-size: 20px;
      color: #111827;
    }
    .label-customizable { font-weight: 600; color: #374151; }
    .inputField-customizable {
      border-radius: 6px;
      border: 1px solid #d1d5db;
    }
    .inputField-customizable:focus { border-color: #4f46e5; }
    .idpDescription-customizable { color: #6b7280; }
    .legalText-customizable { color: #9ca3af; font-size: 12px; }
  CSS

  depends_on = [aws_cognito_user_pool_domain.main]
}

resource "aws_cognito_user_pool_client" "frontend" {
  name            = "resume-analyzer-frontend"
  user_pool_id    = aws_cognito_user_pool.main.id
  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["implicit"]
  allowed_oauth_scopes                 = ["openid", "profile", "email"]
  supported_identity_providers         = ["COGNITO"]

  # ALLOW_USER_PASSWORD_AUTH lets the custom-built login form (frontend/index.html)
  # call Cognito's InitiateAuth directly from the browser with no AWS credentials,
  # replacing the default Hosted UI login page. ALLOW_ADMIN_USER_PASSWORD_AUTH
  # (requires AWS credentials, never exposed to end users) is kept for CLI smoke
  # testing of the JWT authorizer + group-based authorization.
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

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

# Demo/test accounts, Terraform-managed end to end (previously created by hand via the
# CLI for smoke testing -- moved into IaC so the project has zero manually created
# resources, per the rubric). aws_cognito_user only supports a *temporary* password,
# so the null_resource below promotes it to permanent via the AWS CLI as part of
# `terraform apply` itself -- no manual post-apply step required.
resource "aws_cognito_user" "student1" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = "student1@test.com"
  attributes = {
    email          = "student1@test.com"
    email_verified = "true"
  }
  password       = var.demo_user_password
  message_action = "SUPPRESS"
}

resource "aws_cognito_user_in_group" "student1" {
  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.students.name
  username     = aws_cognito_user.student1.username
}

resource "null_resource" "student1_permanent_password" {
  triggers = {
    user     = aws_cognito_user.student1.username
    password = var.demo_user_password
  }
  provisioner "local-exec" {
    # pwsh (PowerShell Core) is pre-installed on ubuntu-latest and Windows.
    interpreter = ["pwsh", "-Command"]
    command     = "aws cognito-idp admin-set-user-password --user-pool-id $env:POOL_ID --username $env:CUSERNAME --password $env:CPASSWORD --permanent --region us-east-1"
    environment = {
      POOL_ID   = aws_cognito_user_pool.main.id
      CUSERNAME = aws_cognito_user.student1.username
      CPASSWORD = var.demo_user_password
    }
  }
}

resource "aws_cognito_user" "recruiter1" {
  user_pool_id = aws_cognito_user_pool.main.id
  username     = "recruiter1@test.com"
  attributes = {
    email          = "recruiter1@test.com"
    email_verified = "true"
  }
  password       = var.demo_user_password
  message_action = "SUPPRESS"
}

resource "aws_cognito_user_in_group" "recruiter1" {
  user_pool_id = aws_cognito_user_pool.main.id
  group_name   = aws_cognito_user_group.recruiters.name
  username     = aws_cognito_user.recruiter1.username
}

resource "null_resource" "recruiter1_permanent_password" {
  triggers = {
    user     = aws_cognito_user.recruiter1.username
    password = var.demo_user_password
  }
  provisioner "local-exec" {
    interpreter = ["pwsh", "-Command"]
    command     = "aws cognito-idp admin-set-user-password --user-pool-id $env:POOL_ID --username $env:CUSERNAME --password $env:CPASSWORD --permanent --region us-east-1"
    environment = {
      POOL_ID   = aws_cognito_user_pool.main.id
      CUSERNAME = aws_cognito_user.recruiter1.username
      CPASSWORD = var.demo_user_password
    }
  }
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
