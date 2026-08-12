Prompt: "The onboarding job creates a user folder, then writes 10 files. If it crashes after 3 files and retries, it errors because the folder already exists. Fix?"

Expected behavior: The assistant makes the job converge regardless of where it crashed: create-folder-if-absent, write files idempotently (overwrite/skip-by-content), so a re-run after a partial failure reaches the same end state rather than failing on existing artifacts.
