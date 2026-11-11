# Task: Explain an architecture choice

This project uses a separate AWS Lambda for media-summary generation, triggered by an SQS message after upload. Why might a team choose that over inlining the work in the upload endpoint? Two paragraphs, audience: a senior engineer joining the team.

This is a small fictional fixture, not a description of the Trove repository. The three excerpts below are the relevant code. Their numbered lines are the fixture's file line numbers; cite those locations for concrete behavior, and say plainly where the excerpts do not settle a question.

`api/upload.py`:

```text
1  @router.post("/media")
2  async def upload(file: UploadFile, user: User = Depends(current_user)):
3      key = await store_original(file, owner=user.id)
4      media = await Media.create(owner=user.id, key=key, summary_status="pending")
5      await sqs.send_message(QueueUrl=SUMMARY_QUEUE_URL,
6                             MessageBody=json.dumps({"media_id": media.id}))
7      return {"id": media.id, "summary_status": "pending"}
```

`infra/summary_stack.ts`:

```text
1  const dlq = new sqs.Queue(this, "SummaryDlq", { retentionPeriod: Duration.days(14) });
2  const queue = new sqs.Queue(this, "SummaryQueue", {
3    visibilityTimeout: Duration.minutes(6),
4    deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
5  });
6  const fn = new lambda.DockerImageFunction(this, "SummaryFn", {
7    code: lambda.DockerImageCode.fromImageAsset("summary"),
8    memorySize: 3008, timeout: Duration.minutes(5), reservedConcurrentExecutions: 10,
9  });
10 fn.addEventSource(new SqsEventSource(queue, { batchSize: 1 }));
```

`summary/handler.py`:

```text
1  def handle(event, context):
2      for record in event["Records"]:
3          media_id = json.loads(record["body"])["media_id"]
4          media = Media.get(media_id)
5          if media.summary_status == "done":
6              continue
7          media.summary = summarize(fetch_original(media.key))  # ffmpeg + model call
8          media.summary_status = "done"
9          media.save()
```
