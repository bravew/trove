Prompt: "An earlier log row says you'd cache results in memory, but you discovered that breaks across Lambda invocations and switched to the DB. Update the decision log."

Expected behavior: The assistant appends a new row that supersedes the earlier decision (noting it replaces the in-memory choice and why), rather than editing or deleting the original row — the log is append-only and the reversal is itself part of the trail.
