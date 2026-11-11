---
name: trove-principle-idempotency
description: "Make Operations Idempotent — design commands, lifecycle steps, and processing loops to converge to the same end state regardless of how many times they run or where a previous run stopped. Use when designing operations that run amid crashes, restarts, and retries (jobs, deploys, lifecycle steps, queues)."
metadata:
  trove-category: code
  trove-category-label: Code
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# Principle: Make Operations Idempotent

An operation should converge to the correct end state no matter how many times it runs or where a previous run stopped.

Derive each step from the state you observe, not from an assumption about where the last run stopped. A step that checks what is already true and does only the remaining work converges on its own. A step that assumes a fresh start needs a guard, and a guard is one more thing that can be wrong after a crash.

Before shipping an operation, run it twice, kill it halfway and run it again, and confirm both end at the same state.

Highly relevant to `trove-jobs` (SQS/SNS retries), CDK/Terraform deploys, and Lambda handlers — anything the platform will retry on your behalf.
