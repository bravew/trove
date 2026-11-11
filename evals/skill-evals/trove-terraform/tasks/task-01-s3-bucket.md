# Task: S3 bucket module and root configuration

Write a reusable Terraform module for an S3 bucket with `name`, `versioning_enabled`, and `force_destroy` variables. Block public access by default. Output the bucket ARN.

Also write the root configuration that uses it. Store Terraform state remotely in S3 with locking, and give the deployment role access only to this bucket's objects and state resources. Do not grant `*` on `Resource` where the bucket, key prefix, or table can be named.
