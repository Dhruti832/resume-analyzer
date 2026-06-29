resource "aws_dynamodb_table" "jobs" {
  name         = "JobsTable"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }
}

resource "aws_dynamodb_table" "results" {
  name         = "ResultsTable"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "candidateId"
  range_key    = "resumeId"

  attribute {
    name = "candidateId"
    type = "S"
  }

  attribute {
    name = "resumeId"
    type = "S"
  }
}
