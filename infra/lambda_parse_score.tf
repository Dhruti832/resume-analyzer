data "archive_file" "parse_score" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/parseScore"
  output_path = "${path.module}/build/parseScore.zip"
}

resource "aws_lambda_function" "parse_score" {
  function_name    = "parseScore"
  role              = data.aws_iam_role.lab_role.arn
  runtime           = "nodejs20.x"
  handler           = "index.handler"
  filename          = data.archive_file.parse_score.output_path
  source_code_hash  = data.archive_file.parse_score.output_base64sha256
  timeout           = 60

  environment {
    variables = {
      JOBS_TABLE        = aws_dynamodb_table.jobs.name
      RESULTS_TABLE     = aws_dynamodb_table.results.name
      HF_MODEL          = var.hf_model
      HF_TOKEN_SECRET_ID = "resume-analyzer/hf-token"
      # Node's native fetch (undici) can attempt IPv6 first inside Lambda's
      # network sandbox, where IPv6 egress isn't supported, causing a
      # generic "fetch failed" with no useful detail. Force IPv4 lookups.
      NODE_OPTIONS = "--dns-result-order=ipv4first"
    }
  }
}

resource "aws_cloudwatch_log_group" "parse_score" {
  name              = "/aws/lambda/${aws_lambda_function.parse_score.function_name}"
  retention_in_days = 14
}
