---
name: trove-worktree
description: "Git worktree workflow for spikes, risky experiments, and broad refactors that should not disturb the user's current branch."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-worktree

Spike or risky work goes in a worktree, never on the user's branch.

## Workflow

1. Check the current branch and worktree status.
2. Propose a worktree path and branch name.
3. Create the worktree before edits when the user approves or when the request already asked for a spike.
4. Keep generated or experimental churn inside the worktree.
5. When done, summarize what to keep and what to discard.

## Decision Gate: worktree needed

Context: Experiments can dirty unrelated files or block the user's branch.
Question: Should this work happen in a separate git worktree?
Options:
- A. Yes - create the worktree first.
- B. No - continue in the current checkout.
- C. Ask the user because the branch state is unclear.
Default: A for spikes and risky cross-system refactors.

## Cleanup

Do not remove a worktree without explicit confirmation. Preserve user changes.

## Branch Naming

For a branch-only request, generate a local branch name from the user's request:
`feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, or `perf/` plus a
short kebab-case description. Check whether it already exists and append
`-v2`, `-v3`, and so on until unique. Create it locally only; push later through
the ship workflow.
