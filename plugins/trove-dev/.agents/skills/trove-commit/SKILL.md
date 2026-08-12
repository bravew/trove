---
name: trove-commit
description: "Git commit workflow and message conventions. Use when creating, drafting, or reviewing atomic commits with conventional messages."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Commit Message Conventions

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Types

| Type | When to Use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, deps, config changes |
| `perf` | Performance improvement |
| `style` | Code style (formatting, semicolons) |
| `ci` | CI/CD configuration |

## Rules

1. **Subject line**: imperative mood, lowercase, no period, max 72 chars
2. **Body**: explain WHY, not WHAT (the diff shows what changed)
3. **Scope**: optional, identifies the module/area (e.g., `auth`, `api`, `ui`)
4. **Breaking changes**: add `BREAKING CHANGE:` in footer

## Stacking and prose

Commit liberally and treat each commit as a future PR: prefer several small, ordered, independently reviewable commits over one fat commit. Rebase them into a clean sequence before opening the PR. Run the message body through `trove-unslop` (its `benefits-from`) so it reads as plain prose — explain the why, drop boilerplate.

## Direct Commit Workflow

When invoked as an action, create a commit only for a single logical change.

1. Inspect `git status --short`, recent commits, and the relevant diff.
2. If paths are provided, limit the review and staging to those paths.
3. Stage specific files with `git add <paths>`; avoid `git add -A` unless the whole working tree is clearly one change.
4. Create the commit with the conventional subject and a body when the why is not obvious.
5. Report the commit hash, message, and files committed.

If the working tree mixes unrelated changes, stop and name the smaller commit slices. Never include AI-generated or co-author boilerplate.

## Examples

```
feat(auth): add OAuth2 PKCE flow for mobile clients

The implicit grant flow is deprecated by OAuth 2.1. PKCE provides
better security for public clients without a client secret.

Closes #234
```

```
fix(api): prevent duplicate webhook processing

Add idempotency check using event ID before processing.
Previously, retried webhooks could create duplicate records.
```
