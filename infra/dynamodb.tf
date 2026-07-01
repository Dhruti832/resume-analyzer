resource "aws_dynamodb_table" "jobs" {
  name         = "JobsTable"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
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

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI for recruiter ranked view: query all results for a given job, sorted by score
  global_secondary_index {
    name            = "jobId-matchScore-index"
    hash_key        = "jobId"
    range_key       = "matchScore"
    projection_type = "ALL"
  }

  # GSI for student history: query all results for a given user, sorted by date
  global_secondary_index {
    name            = "userId-createdAt-index"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}
