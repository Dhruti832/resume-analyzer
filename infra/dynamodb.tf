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

  attribute {
    name = "jobId"
    type = "S"
  }

  attribute {
    name = "matchScore"
    type = "N"
  }

  # GSI for recruiter ranked view: query all results for a given job, sorted by score
  global_secondary_index {
    name            = "jobId-matchScore-index"
    hash_key        = "jobId"
    range_key       = "matchScore"
    projection_type = "ALL"
  }
}
