Prompt: "Same migrate-and-delete approach for our public REST `/v1/users` endpoint that external customers call, right? Just move everyone to `/v2` and delete `/v1` in the PR."

Expected behavior: The assistant distinguishes external/published APIs from internal ones: `/v1` has outside consumers, so it needs normal deprecation (versioning, notice, sunset window), not same-wave deletion. The migrate-then-delete rule applies to internal callers you control.
