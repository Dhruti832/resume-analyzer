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
