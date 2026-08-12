---
description: Commit staged changes, push, and create PR
argument-hint: "[pr-title]"
allowed-tools: Bash(git *), Bash(gh pr *), Read, Glob, Grep
---

# Ship: Commit → Push → PR

## Context

- Branch: !`git branch --show-current`
- Status: !`git status --short`
- Staged: !`git diff --staged --stat`

Optional PR title override: $ARGUMENTS

## Steps

1. **Commit** — Analyze staged changes and create atomic commit with conventional message
2. **Push** — Push to remote with upstream tracking
3. **PR** — Create PR with comprehensive description

Commit message follows conventional commits format. NEVER mention Claude Code or Anthropic.

**PR Description Best Practices:**

- Clear, concise summary of changes
- Explain motivation and context
- List key technical changes
- Include test plan with project-appropriate validation commands
- Note any breaking changes or migrations needed
- Reference related issues if applicable

## Run

### Step 1: Detect Project Stack

Detect the project type to determine the correct validation and scope conventions:

```bash
# Detect project type from config files
if [ -f "Package.swift" ]; then
  echo "STACK=swift"
elif [ -f "pyproject.toml" ] || [ -f "setup.py" ]; then
  echo "STACK=python"
elif [ -f "next.config.js" ] || [ -f "next.config.ts" ] || [ -f "next.config.mjs" ]; then
  echo "STACK=nextjs"
elif [ -f "package.json" ]; then
  echo "STACK=node"
fi
```

### Step 2: Analyze Staged Changes

```bash
git branch --show-current
git status
git diff --staged --stat
git diff --staged
```

### Step 3: Create Commit

Examine staged changes and determine type, scope, and description:

- **Type**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `style`, `chore`
- **Scope** (optional): derive from the primary area affected
- **Description**: concise summary of what changed and why

```bash
git commit -m "<type>(<scope>): <description>"
```

### Step 4: Push to Remote

```bash
git push -u origin HEAD
```

### Step 5: Detect Base Branch

```bash
# Fetch known integration branches
git fetch origin --no-tags 2>/dev/null

BASE=staging
best_distance=""
for candidate in staging production main master develop; do
  mb=$(git merge-base HEAD "origin/$candidate" 2>/dev/null) || continue
  distance=$(git rev-list --count "$mb"..HEAD 2>/dev/null) || continue
  if [[ -z "$best_distance" ]] || [[ "$distance" -lt "$best_distance" ]]; then
    best_distance=$distance
    BASE=$candidate
  fi
done
echo "Detected base: $BASE"
git log $BASE..HEAD --oneline
git diff $BASE...HEAD --stat
```

### Step 6: Create PR

Analyze **all** commits in the branch (not just the latest) to generate the PR description.

Include project-appropriate validation commands in the testing section:

| Stack | Validation Commands |
|-------|-------------------|
| Python | `ruff check .`, `ruff format --check .`, `pytest -v` |
| Node/React/Vue | `pnpm lint` or `npm run lint`, `pnpm type-check`, `pnpm test:run`, `pnpm build` |
| Next.js | `npm run lint`, `npm run type-check`, `npm run build` |
| Swift | `swift build`, `swift test`, `swiftlint` |

```bash
gh pr create --base "$BASE" --title "<PR title>" --body "$(cat <<'EOF'
## Summary

[1-3 sentence overview of what this PR accomplishes and why]

## Changes

- [Key technical change 1 with file references]
- [Key technical change 2 with file references]

## Technical Details

### Modified Modules
- `path/to/module` - [What changed and why]

### Architectural Decisions
[Any significant technical decisions or patterns used]

## Testing

**Automated:**
- [ ] Lint/format passes
- [ ] Type checking passes
- [ ] Tests pass
- [ ] Build succeeds

**Manual:**
- [ ] [Specific flow tested]
- [ ] [Edge case tested]

## Breaking Changes

[List any breaking changes or "None"]

## Migration Required

[List any migration steps or "None"]

EOF
)"
```

## Critical Rules

1. Commit MUST follow conventional commits format
2. Commit MUST be atomic (one logical change)
3. MUST NOT mention Claude Code or Anthropic
4. PR description MUST analyze ALL commits in branch
5. MUST note breaking changes if any

## Report

After completion, provide:

1. **Commit**: hash, message, files changed
2. **Push**: branch name, tracking status
3. **PR**: URL, title, base branch
