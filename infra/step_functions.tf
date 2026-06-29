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
      }
      NotifyResultStep = {
        Type     = "Task"
        Resource = aws_lambda_function.notify_result.arn
        End      = true
      }
    }
  })
}

resource "aws_cloudwatch_log_group" "resume_analysis_sfn" {
  name              = "/aws/states/ResumeAnalysisStateMachine"
  retention_in_days = 14
}
