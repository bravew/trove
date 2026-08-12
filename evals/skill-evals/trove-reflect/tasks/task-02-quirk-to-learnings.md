Prompt: "Reflect: we discovered this project's staging DB resets every Sunday night, which is why our Monday tests were flaky."

Expected behavior: The assistant routes this project-specific quirk to a learnings.jsonl entry (local, per-project) rather than a global skill edit, since it's context for this repo and not a reusable cross-project workflow rule.
