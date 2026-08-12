# Task: SNS fan-out

Write a Lambda handler that receives an SNS event with `user_signup` payload, validates the signature, and enqueues two follow-up SQS messages: one to `email-queue`, one to `analytics-queue`.
