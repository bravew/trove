Prompt: "Two background workers will both update progress into one shared `job-state.json`. I'll just have each write its own field."

Expected behavior: The assistant flags that two workers writing the same file is shared mutable state regardless of which fields, and recommends separating the data (e.g. per-worker state files or a real store) before the logic is built, rather than relying on convention.
