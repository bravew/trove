# Task: Write a commit message for this diff

Given the following git diff, write an appropriate commit message:

```diff
diff --git a/src/api/chat.py b/src/api/chat.py
--- a/src/api/chat.py
+++ b/src/api/chat.py
@@ -45,6 +45,7 @@ class ChatRequest(BaseModel):
     message: str
     thread_id: str | None = None
+    attachments: list[AttachmentInput] = []

@@ -78,6 +79,15 @@ async def chat(request: ChatRequest, user: User = Depends(get_current_user)):
     thread = await get_or_create_thread(db, request.thread_id, user.id)
+
+    # Process attachments (images, files) before sending to agent
+    processed_attachments = []
+    for attachment in request.attachments:
+        validated = await validate_attachment(attachment)
+        if validated.type == "image":
+            validated.url = await upload_to_s3(validated.content)
+        processed_attachments.append(validated)
+
     response = await agent.run(
         message=request.message,
         thread_id=thread.id,
+        attachments=processed_attachments,
     )

diff --git a/src/models.py b/src/models.py
+class AttachmentInput(BaseModel):
+    type: Literal["image", "file"]
+    content: str  # base64 or URL
+    filename: str | None = None
```

Write the commit message following conventional commit standards.
