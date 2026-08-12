# Task: IPC token auth

Write a Lambda handler that accepts an HTTP-triggered event from the backend. Validate the `BACKEND_IPC_TOKEN` from the request headers before doing any work; reject with 401 otherwise. Use Powertools logger for the rejection.
