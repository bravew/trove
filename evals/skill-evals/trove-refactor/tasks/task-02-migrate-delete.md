Prompt: "I'm replacing the internal `buildPrompt(parts)` helper with `composePrompt(spec)`. There are 8 callers. How do I land this?"

Expected behavior: The assistant pins behavior, migrates all 8 callers to `composePrompt`, and deletes `buildPrompt` in the same wave (no wrapper shim), then proves output unchanged. It does not leave both helpers in the codebase.
