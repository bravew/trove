---
name: trove-ship
description: "Front-door ship workflow. Prepare a change for landing by composing the review and commit skills, surfacing a final Decision Gate before any destructive action. Thin orchestrator — defers detail to leaf skills."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

You are an orchestrator: when a step maps to another skill (e.g., review, security-review, design-review), call out the delegation explicitly rather than re-implementing it inline.

# trove-ship — Pre-Land Preparation

`trove-ship` is an **orchestrator**, not a leaf skill. It walks a diff
through review → commit → ship-readiness check and stops at a final
Decision Gate before anything destructive (push, PR, tag).

> The repo's `release.yml` workflow handles the actual version bump and
> tag. `trove-ship` prepares the diff up to "ready to push"; the user (or
> CI on merge) handles publish.

## Inputs

- A working tree with uncommitted or branch-local changes.
- Optional: target base branch, scope of the change (feature / fix / chore).

## Workflow

### Stage 1 — Review the diff

Hand off to **`trove-review`**. Walk the diff through the standard checklist
(correctness, security, performance, maintainability, testing). If the
diff touches sensitive surfaces (auth, payments, secrets), also delegate
to **`trove-security-review`** for a second pass — this is in `trove-review`'s
`benefits-from` for exactly this reason.

> Optional: dispatch a read-only sub-agent to verify a specific concern
> the review surfaced (e.g., "is this the only callsite of the legacy
> function?"). See [docs/orchestration.md](../../docs/orchestration.md)
> for delegation phrasing.

### Stage 2 — Author the commit

Hand off to **`trove-commit`**. Generate the conventional-commit message
from the diff. Don't substitute your own format — `trove-commit` owns the
conventions (type, scope, body, footer).

### Stage 3 — Ship-readiness gate

Before pushing, surface the Decision Gate below. The gate exists because
"ready to push" is a one-way door from the user's perspective: once the
PR is open, reviewers will look.

## Decision Gate: ready to push

Context: The next step is `git push` and PR creation. Reviewers will see this branch.
Question: Are review and commit message both clean?
Options:
- A. Yes — push and open the PR.
- B. No — loop back. Name the issue (failing test, unclear commit, scope creep) and fix it.
Default: B, because a moment's pause on a one-way door is cheaper than withdrawing a PR.

## Output

After the gate clears:

```markdown
# Ready to ship

## Review summary
<from trove-review — issues found, severity, status>

## Commit message
<from trove-commit — final wording, ready to use as `git commit -m`>

## Push command
<git push -u origin <branch>>
```

If the user chooses option A at the gate, push the current branch with upstream
tracking and open a PR with `gh pr create`. Detect the likely base branch from
`staging`, `production`, `main`, `master`, or `develop` using merge-base
distance. The PR body should include a terse summary, key changes, tests run,
and breaking changes or migrations. Analyze all branch commits, not just the
latest commit.

## PR shape

Prefer small, stacked PRs over one fat PR. Each commit is a future PR: a reviewer should be able to read one focused change at a time. When a branch has grown to cover several concerns, split it. Run the PR description through `trove-unslop` (its `benefits-from`) and drop Summary/Test-plan boilerplate that adds nothing.

## Anti-patterns

- **Don't skip the review** even on a "trivial" change. `trove-ship` exists
  precisely because trivial changes are where most regressions hide.
- **Don't write the commit before the review.** A review can change scope;
  the commit message should reflect the final state.
- **Don't auto-push.** The Decision Gate is the whole point — a human
  confirms before the one-way door.
- **Don't bump VERSION here.** This repo's `release.yml` owns version on
  merge to main; `trove-ship` is pre-merge.
