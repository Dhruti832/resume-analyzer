terraform {
  required_version = ">= 1.5.0"

  # Remote state stored in S3 so GitHub Actions and local runs share the same state.
  # Bootstrap: aws s3api create-bucket --bucket resume-analyzer-tfstate-648958477449 --region us-east-1
  # Then migrate once: terraform init -migrate-state
  backend "s3" {
    bucket = "resume-analyzer-tfstate-648958477449"
    key    = "infra/terraform.tfstate"
    region = "us-east-1"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}
