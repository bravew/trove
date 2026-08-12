---
name: trove-principle-idempotency
description: "Make Operations Idempotent — design commands, lifecycle steps, and processing loops to converge to the same end state regardless of how many times they run or where they start from. Use when designing operations that run amid crashes, restarts, and retries (jobs, deploys, lifecycle steps, queues)."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

# Principle: Make Operations Idempotent

An operation should converge to the correct end state no matter how many times it runs or where it starts from.

Three-question test before shipping an operation:

1. What happens if it runs **twice**?
2. What happens if it **crashes halfway** and re-runs?
3. Does it **converge** to the same state either way?

Techniques: dedupe with an idempotency key before acting; detect stale locks by PID rather than presence; clean up by content/checksum rather than assuming a fresh start; add an explicit reconciliation step when convergence isn't otherwise guaranteed.

Highly relevant to `trove-jobs` (SQS/SNS retries), CDK/Terraform deploys, and Lambda handlers — anything the platform will retry on your behalf.
