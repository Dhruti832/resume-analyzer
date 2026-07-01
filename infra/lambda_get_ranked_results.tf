data "archive_file" "get_ranked_results" {
  type        = "zip"
  source_dir  = "${path.module}/../lambdas/getRankedResults"
  output_path = "${path.module}/build/getRankedResults.zip"
}

resource "aws_lambda_function" "get_ranked_results" {
  function_name    = "getRankedResults"
  role             = data.aws_iam_role.lab_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.get_ranked_results.output_path
  source_code_hash = data.archive_file.get_ranked_results.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      RESULTS_TABLE = aws_dynamodb_table.results.name
      RESUME_BUCKET = aws_s3_bucket.resumes.bucket
    }
  }
}

resource "aws_cloudwatch_log_group" "get_ranked_results" {
  name              = "/aws/lambda/${aws_lambda_function.get_ranked_results.function_name}"
  retention_in_days = 14
}
