---
name: trove-receive-review
description: Review-feedback handling workflow. Use when the user provides PR comments, code review feedback, or requested changes.
version: 1.0.0
preamble-tier: 3
user-invocable: true
triggers:
  - address review
  - pr comments
  - code review feedback
  - requested changes
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-receive-review

Address every comment explicitly, even when declining.

## Workflow

1. Number each review comment or requested change.
2. Classify it as accept, clarify, or decline.
3. For accepted comments, make the smallest relevant change.
4. For declined comments, give a technical reason and offer an alternative if useful.
5. Verify the affected behavior.
6. Report per-comment status.

## Decision Gate: review disposition

Context: Batched "fixed all comments" replies hide missed or intentionally declined feedback.
Question: Does every review item have an explicit disposition?
Options:
- A. Yes - summarize status and verification.
- B. No - continue mapping comments.
- C. A comment is ambiguous - ask for clarification.
Default: B, because untracked feedback becomes review churn.
