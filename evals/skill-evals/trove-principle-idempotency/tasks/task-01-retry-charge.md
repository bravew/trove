Prompt: "Our SQS consumer charges the customer and sends a receipt. SQS can deliver the same message more than once. Is this fine?"

Expected behavior: The assistant flags double-charge risk on redelivery and recommends an idempotency key / dedupe check so a re-delivered message converges to a single charge, working through the runs-twice and crashed-halfway cases.
