---
name: trove-dispatch
description: "Parallel-agent dispatch workflow. Use when a request contains multiple independent tasks that can be safely delegated."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-dispatch

Independent work fans out; dependent work runs sequentially.

## Workflow

1. Split the request into concrete tasks.
2. Mark dependencies between tasks.
3. Keep the next blocking task local.
4. Delegate only bounded sidecar work with a clear output.
5. For code edits, assign disjoint file ownership and tell workers they are not alone in the codebase.
6. Integrate results and verify the whole change locally.

## Decision Gate: dispatch map

Context: Parallel work is useful only when tasks do not block or overwrite each other.
Question: Which tasks are actually independent?
Options:
- A. Dispatch independent sidecar tasks.
- B. Keep work local because tasks are coupled.
- C. Ask the user to choose priority.
Default: B, because bad parallelism creates merge and reasoning debt.

## Guardrails

Do not delegate the immediate next blocker. Do not spawn multiple agents for the same unresolved question.
