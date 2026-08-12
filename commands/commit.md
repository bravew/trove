---
description: Create an atomic git commit with conventional message
argument-hint: "[files or scope]"
allowed-tools: Bash(git *), Read, Glob, Grep
---

# Create Git Commit

## Context

- Current status: !`git status --short`
- Recent commits: !`git log --oneline -5`

## Task

Create an atomic git commit for the uncommitted changes, or for these specific files if provided:

$ARGUMENTS

**Commit Message Format:** `<type>(<scope>): <description>`

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`
- Scope (optional): derive from the primary area/module affected by the change
- Present tense, imperative mood
- 72 chars or less for subject (aim for 50)
- Lowercase, no period at end

**Rules:**

- One logical change per commit
- Prefer staging specific files over `git add -A`
- NEVER mention Claude Code, Anthropic, co-authored by, or AI-generated

## Steps

1. Review changes with `git diff HEAD`
2. Determine type and scope from the changed files
3. Stage relevant files with `git add <files>`
4. Create commit with `git commit -m "<type>(<scope>): <description>"`

## Report

End with explicit status:

- **DONE**: Commit hash, message, files committed
- **BLOCKED**: Why commit failed, what was attempted, recommendation
