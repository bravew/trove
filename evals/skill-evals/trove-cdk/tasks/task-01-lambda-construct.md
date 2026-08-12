# Task: Lambda construct

Write a CDK TypeScript construct for a Lambda function that consumes an SQS queue. Grant least-privilege IAM (queue read + DLQ send). Use Node 20 runtime; set logRetention to 7 days in dev, 30 in prod.
