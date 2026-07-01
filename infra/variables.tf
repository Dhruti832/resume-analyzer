variable "notification_email" {
  description = "Email address subscribed to the resume-analysis SNS topic. Leave empty to skip creating a subscription."
  type        = string
  default     = ""
}

variable "hf_model" {
  description = "Hugging Face model id used for resume scoring."
  type        = string
  default     = "Qwen/Qwen2.5-7B-Instruct"
}

variable "demo_user_password" {
  description = "Permanent password for the two Terraform-managed demo/test Cognito users (student1@test.com, recruiter1@test.com). Must satisfy the user pool's password policy. No default on purpose -- set via terraform.tfvars locally (gitignored) or a TF_VAR_demo_user_password CI secret."
  type        = string
  sensitive   = true
}
