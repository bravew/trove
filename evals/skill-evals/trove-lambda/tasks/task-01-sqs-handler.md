# Task: SQS handler

Write a Lambda handler that consumes an SQS queue. Each record's body is JSON `{ user_id: string, action: string }`. Process each record with a `process(user_id, action)` call and return partial-batch failures correctly.
