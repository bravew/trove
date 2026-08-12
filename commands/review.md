---
description: Code review with best practices and project-aware checklist
argument-hint: "[files | PR# | branch]"
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(gh pr *)
---

# Code Review

Review scope: $ARGUMENTS

If a PRP file was used for implementation, read it first to understand the requirements.

## Process

1. **Identify changes to review:**
   - No args: review staged changes via `git diff --staged`
   - File paths: read the specified files
   - PR number: `gh pr view <number> --json files,additions,deletions`
   - Branch: detect base branch, then `git diff origin/$BASE...HEAD`

2. **Detect project stack** from config files (pyproject.toml, package.json, Package.swift,
   next.config.*, etc.) to apply stack-specific review criteria.

3. **Read the FULL context** — read complete files to understand structure and data flow before
   flagging issues. Verify issues are ACTUAL bugs, not false positives.

4. **Apply project rules** — if `.claude/rules/` exists, read and apply all rules found there.

5. **Run quality checks** using project-appropriate tooling:

   | Stack | Commands |
   |-------|----------|
   | Python | `ruff check .`, `ruff format --check .` |
   | Node/React/Vue | `pnpm lint` or `npm run lint`, `pnpm type-check` |
   | Next.js | `npm run lint`, `npm run type-check` |
   | Swift | `swiftlint`, `swift build` |

## Universal Review Focus

### 1. Code Quality
- Naming: clear, consistent, follows project conventions
- Structure: well-organized, single responsibility
- Error handling: comprehensive, no silent failures
- Type safety: proper types, no unsafe casts or `any`

### 2. Security
- No exposed secrets, API keys, tokens, or credentials in code or logs
- Input validation on all user-facing boundaries
- Authentication/authorization correctly enforced
- Injection prevention (SQL, XSS, command injection)

### 3. Performance
- No unnecessary allocations or re-renders
- No N+1 queries or unbounded loops
- Proper caching and memoization where appropriate

### 4. Stack-Specific Patterns

**Python/FastAPI:**
- Top-level imports only (no inline imports)
- Async patterns: proper `await`, no blocking calls in async
- SQLAlchemy: eager loading, proper transactions
- Logging: `logger.exception()` in handlers, `extra={}` for WARNING/ERROR

**React/Vue:**
- Immutable state updates
- Effect cleanup (useEffect return, onUnmounted)
- Proper component composition and hook extraction
- No state mutation or stale closure bugs

**Swift:**
- Proper `@Observable` / `@State` / `@Binding` usage
- Structured concurrency (`async/await`, no data races)
- Memory management (weak self in closures)

**Next.js:**
- Correct use of Server vs Client Components
- Proper data fetching patterns (RSC, Route Handlers)
- Metadata and SEO considerations

### 5. Testing
- New/changed logic has corresponding tests
- Edge cases covered
- No flaky test patterns

## Output

```markdown
# Code Review

## Status

STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT

## Summary

[2-3 sentence overview]

## Issues Found

### Critical (Must Fix)

- [Issue with file:line and suggested fix]

### Important (Should Fix)

- [Issue with file:line and suggested fix]

### Minor (Consider)

- [Improvement suggestions]

## Checklist

- [ ] No mutation / race condition bugs
- [ ] Error handling covers edge cases
- [ ] No memory or resource leaks
- [ ] Types correct and complete
- [ ] No security issues (XSS, injection, exposed secrets)
- [ ] No unnecessary performance costs
- [ ] Code is readable and well-structured
- [ ] Tests cover new/changed behavior
- [ ] Lint/format passes
- [ ] Project conventions followed
```

Save report to `.claude/reviews/review-[#].md` (check existing files first).

## Escalation

If uncertain after 3 investigation attempts, STOP and escalate:

```
STATUS: BLOCKED
REASON: [1-2 sentences]
ATTEMPTED: [what was tried]
RECOMMENDATION: [what the user should do next]
```
