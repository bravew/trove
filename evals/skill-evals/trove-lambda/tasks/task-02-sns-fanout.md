# Task: SNS fan-out

Write a Lambda handler that receives `user_signup` events and enqueues two follow-up SQS messages: one to `email-queue`, one to `analytics-queue`.

This is a fictional fixture. The backend publishes each signup to the `user-events` SNS topic, which is subscribed by the `signup-intake` SQS queue (raw message delivery off). That queue triggers the Lambda. By team convention the backend attaches its IPC token as the SNS message attribute `ipc_token`, and the Lambda has `BACKEND_IPC_TOKEN` in its environment. An event whose token is missing or wrong must not be fanned out.

One delivered record body looks like this:

```json
{
  "Type": "Notification",
  "TopicArn": "arn:aws:sns:us-east-1:123456789012:user-events",
  "Message": "{\"type\": \"user_signup\", \"user_id\": \"u_481\", \"email\": \"ada@example.test\", \"plan\": \"free\"}",
  "MessageAttributes": {
    "ipc_token": { "Type": "String", "Value": "<token>" }
  }
}
```
