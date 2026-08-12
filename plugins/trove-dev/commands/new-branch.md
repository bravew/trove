---
description: Create a conventional git branch from user request
argument-hint: "<description>"
allowed-tools: Bash(git *)
---

# Create Git Branch

Generate a conventional branch name based on user request and create a new git branch.

## Variables

User request: $ARGUMENTS

## Instructions

**Step 1: Check Current Branch**

- Check current branch: `git branch --show-current`
- Warn (but proceed) if not on a standard base branch (staging, production, main, master, develop)

**Step 2: Generate Branch Name**

**Prefixes:**

- `feat/` - New feature or enhancement
- `fix/` - Bug fix
- `chore/` - Maintenance tasks (dependencies, configs, etc.)
- `docs/` - Documentation only changes
- `refactor/` - Code refactoring (no functionality change)
- `test/` - Adding or updating tests
- `perf/` - Performance improvements

**Naming Rules:**

- Use kebab-case (lowercase with hyphens)
- Be descriptive but concise (max 50 characters)
- No special characters except hyphens, no spaces

**Examples:**

- "Add user settings page" → `feat/add-user-settings`
- "Fix SSE stream disconnect" → `fix/sse-stream-disconnect`
- "Update README documentation" → `docs/update-readme`
- "Refactor state management" → `refactor/state-management`

**Step 3: Check Branch Exists**

If the branch name already exists, append `-v2`, `-v3`, etc. until unique:

```bash
if git show-ref --verify --quiet refs/heads/<branch-name>; then
  COUNTER=2
  while git show-ref --verify --quiet refs/heads/<branch-name>-v$COUNTER; do
    COUNTER=$((COUNTER + 1))
  done
  BRANCH_NAME="<branch-name>-v$COUNTER"
fi
```

**Step 4: Create and Checkout Branch**

```bash
git checkout -b <branch-name>
git branch --show-current
```

**Important:** Branch is created locally only — push happens later via the `pr` or `ship` command.

## Report

Output the branch name and confirm checkout.
