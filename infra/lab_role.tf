# AWS Academy Learner Lab forbids iam:CreateRole — every resource must run
# under the pre-provisioned LabRole instead of a Terraform-managed role.
data "aws_iam_role" "lab_role" {
  name = "LabRole"
}
