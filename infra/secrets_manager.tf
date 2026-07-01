resource "aws_secretsmanager_secret" "hf_token" {
  name                    = "resume-analyzer/hf-token"
  description             = "Hugging Face API token used by the parseScore Lambda"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "hf_token" {
  count         = var.hf_token != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.hf_token.id
  secret_string = jsonencode({ token = var.hf_token })
}
