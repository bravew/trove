Prompt: "I added a selectinload to kill the N+1 on the posts query. Write up the result."

Expected behavior: The assistant reports the perf result with baseline, post-fix, and delta numbers and the path to the supporting artifact (query count / timing run), and notes the fix is tied to the measured N+1 — not just 'it should be faster now'.
