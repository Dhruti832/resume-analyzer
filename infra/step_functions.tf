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
          Next        = "NotifyErrorStep"
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
          Next        = "NotifyErrorStep"
          ResultPath  = "$.error"
        }]
      }
      NotifyResultStep = {
        Type     = "Task"
        Resource = aws_lambda_function.notify_result.arn
        End      = true
        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "NotifyErrorStep"
          ResultPath  = "$.error"
        }]
      }
      NotifyErrorStep = {
        Type     = "Task"
        Resource = "arn:aws:states:::sns:publish"
        Parameters = {
          TopicArn = aws_sns_topic.resume_notifications.arn
          "Message.$" = "States.Format('Resume analysis failed for candidateId: {}. Error: {}', $.candidateId, $.error.Cause)"
          Subject = "Resume Analysis Failed"
        }
        End = true
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
