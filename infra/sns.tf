resource "aws_sns_topic" "resume_notifications" {
  name = "resume-analysis-notifications"
}

# AWS requires manual confirmation (click the link in your inbox) for email
# subscriptions — Terraform can create the subscription request but cannot
# confirm it on your behalf.
resource "aws_sns_topic_subscription" "email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.resume_notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
