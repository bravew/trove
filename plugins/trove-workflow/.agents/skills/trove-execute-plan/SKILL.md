---
name: trove-execute-plan
description: "Execute an approved implementation plan one checkpoint at a time with verification before advancing."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-execute-plan

Run one checkpoint at a time; verify before moving on.

## Workflow

1. Identify the current checkpoint and its verification.
2. Make only the edits needed for that checkpoint.
3. Run or perform the stated verification.
4. Record the result and any uncovered risk.
5. Move to the next checkpoint only after verification passes or the user accepts the risk.

## Decision Gate: checkpoint advance

Context: Continuing after a failed or skipped check compounds uncertainty.
Question: Should execution advance to the next checkpoint?
Options:
- A. Advance - verification passed.
- B. Fix the current checkpoint.
- C. Pause and ask the user to accept a known verification gap.
Default: B, because a failed checkpoint invalidates downstream assumptions.

## Completion

Before saying the plan is complete, invoke `trove-verify` and include the final verification summary.
