resource "aws_sfn_state_machine" "resume_analysis" {
  name     = "ResumeAnalysisStateMachine"
  role_arn = data.aws_iam_role.lab_role.arn

  definition = jsonencode({
    Comment = "Resume upload -> Textract -> Hugging Face scoring -> SNS notification"
    StartAt = "ExtractTextStep"
    States = {
      ExtractTextStep = {
        Type     = "Task"
        Resource = aws_lambda_function.extract_text.arn
        Next     = "ParseAndScoreStep"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 2
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "MarkFailedStep"
          ResultPath  = "$.error"
        }]
      }
      ParseAndScoreStep = {
        Type     = "Task"
        Resource = aws_lambda_function.parse_score.arn
        Next     = "NotifyResultStep"
        Retry = [{
          ErrorEquals     = ["States.TaskFailed"]
          IntervalSeconds = 3
          MaxAttempts     = 2
          BackoffRate     = 2.0
        }]
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "MarkFailedStep"
          ResultPath  = "$.error"
        }]
      }
      NotifyResultStep = {
        Type     = "Task"
        Resource = aws_lambda_function.notify_result.arn
        End      = true
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "MarkFailedStep"
          ResultPath  = "$.error"
        }]
      }
      # Uses Step Functions SDK integration to update DynamoDB directly — no extra Lambda needed.
      # ResultPath null keeps the original state (including $.candidateId) flowing to NotifyErrorStep.
      MarkFailedStep = {
        Type     = "Task"
        Resource = "arn:aws:states:::dynamodb:updateItem"
        Parameters = {
          TableName = aws_dynamodb_table.results.name
          Key = {
            candidateId = { "S.$" = "$.candidateId" }
            resumeId    = { "S.$" = "$.resumeId" }
          }
          UpdateExpression                   = "SET #st = :failed"
          ExpressionAttributeNames           = { "#st" = "status" }
          ExpressionAttributeValues          = { ":failed" = { S = "failed" } }
          ConditionExpression                = "attribute_exists(candidateId)"
        }
        ResultPath = null
        Next       = "NotifyErrorStep"
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "NotifyErrorStep"
          ResultPath  = null
        }]
      }
      NotifyErrorStep = {
        Type     = "Task"
        Resource = "arn:aws:states:::sns:publish"
        Parameters = {
          TopicArn    = aws_sns_topic.resume_notifications.arn
          "Message.$" = "States.Format('Resume analysis failed for candidateId: {}. Error: {}', $.candidateId, $.error.Cause)"
          Subject     = "Resume Analysis Failed"
        }
        End = true
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "AnalysisFailed"
          ResultPath  = null
        }]
      }
      AnalysisFailed = {
        Type  = "Fail"
        Error = "AnalysisFailed"
        Cause = "All error-handling paths exhausted"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.resume_analysis_sfn.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }
}

resource "aws_cloudwatch_log_group" "resume_analysis_sfn" {
  name              = "/aws/states/ResumeAnalysisStateMachine"
  retention_in_days = 14
}
