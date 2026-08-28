---
name: trove-review
description: "Code review skill that checks for common issues, security vulnerabilities, and style violations. Use when reviewing code changes or PRs."
when_to_use: "code review; review this diff; check this code"
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - "Bash(git *)"
  - "Bash(gh pr *)"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Code Review Guidelines

## Review Checklist

When reviewing code, check for these categories in order:

If a PRP or implementation plan drove the change, read it first and review
against its requirements. With no explicit scope, review staged changes; with a
PR number, inspect the PR metadata and files; with paths, read those files in
full before judging.

### 1. Correctness
- Does the code do what it claims to do?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled correctly?

### 2. Security
- No hardcoded secrets, API keys, or credentials
- Input validation on all external data
- SQL injection prevention (parameterized queries)
- XSS prevention (proper escaping/sanitization)
- Authentication/authorization checks in place

### 3. Performance
- No N+1 queries
- Appropriate use of caching
- No unnecessary re-renders (React) or re-computations
- Pagination for large datasets

### 4. Maintainability
- Clear naming (variables, functions, files)
- Reasonable function length (under 50 lines preferred)
- No code duplication
- Appropriate abstraction level

### 5. Testing
- Tests cover the happy path
- Tests cover error/edge cases
- Mocks are used appropriately
- Test names describe the behavior being tested

### 6. Reader load
- **Layers to trace** — flag one-caller wrappers and indirection that exists only to forward a call; collapse them.
- **State to hold** — flag mutable scope wider than it needs to be.
- The <30s test: can a new reader answer "where does X come from?" and "what can change X?" without spelunking? If not, say where it breaks.

## Deep mode (adversarial, optional)

On request ("tear this apart", "stress test", "find blind spots") or for sensitive surfaces, run a deeper pass: review the change through several independent lenses (correctness, security, failure modes, maintainability), optionally via read-only sub-agents on disjoint concerns. State the change's intent first so the review challenges the execution, not the goal. Synthesize one verdict and sort every finding into **Act on / Consider / Noted / Dismissed**. Do not silently rewrite the diff — the deliverable is the verdict. For a true multi-model cloud review, point the user at `/code-review ultra`.

## Delegated exploration

When the diff is wide enough that linear reading is wasteful, dispatch
read-only sub-agents in parallel for **bounded** investigation. Examples
of good delegations:

- "Map every callsite of the modified function in `services/`. Return file:line."
- "Verify whether the new validation path is reachable from the public API
  surface. Read-only. Yes/no plus one cite."
- "Check the test files touched in this diff for missing edge-case
  coverage (empty input, boundary values). Return findings or 'no gaps'."

Each delegation should declare scope, expected output shape, and a depth
budget. Don't delegate "review the whole diff" — that's the parent's job.
Anti-patterns and host-specific examples are in
[docs/orchestration.md](../../docs/orchestration.md).

For sensitive surfaces (auth, payments, secret handling, untrusted input),
also run `trove-security-review` and `trove-secret-scan` — those are this
skill's `benefits-from`.

## Review Output Format

Structure your review as:

```markdown
## Summary
One-paragraph overview of the changes.

## Issues Found
### 🔴 Critical (must fix)
- [file:line] Description

### 🟡 Important (should fix)
- [file:line] Description

### 🔵 Suggestion (nice to have)
- [file:line] Description

## Positive Observations
- Things done well worth calling out
```
