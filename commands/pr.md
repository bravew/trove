---
description: Create Pull Request with comprehensive description
argument-hint: "[pr-title]"
allowed-tools: Bash(git *), Bash(gh pr *), Read, Glob, Grep
---

# Create Pull Request

PR Title (if provided): $ARGUMENTS

## Process

1. **Detect base branch and verify state**

   ```bash
   git branch --show-current
   git status

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
   echo "Detected base branch: $BASE"
   ```

2. **Review changes**

   ```bash
   git diff $BASE...HEAD --stat
   git log $BASE..HEAD --oneline
   ```

3. **Ensure commits are ready**
   - Stage any uncommitted changes if needed
   - Create atomic commits with conventional commit messages

4. **Run validation** using project-appropriate tools:

   | Stack | Commands |
   |-------|----------|
   | Python | `ruff check . && ruff format --check . && pytest -v` |
   | Node/React/Vue | `pnpm lint && pnpm type-check && pnpm test:run && pnpm build` |
   | Next.js | `npm run lint && npm run type-check && npm run build` |
   | Swift | `swift build && swift test` |

5. **Push to remote**

   ```bash
   git push -u origin HEAD
   ```

6. **Create PR** targeting the detected base branch

   ```bash
   gh pr create --base "$BASE" --title "<title>" --body "$(cat <<'EOF'
   ## Summary
   [Brief description of what this PR does]

   ## Changes
   - [List key changes with file references]

   ## Testing

   **Automated:**
   - [ ] Lint/format passes
   - [ ] Type checking passes
   - [ ] Tests pass
   - [ ] Build succeeds

   **Manual:**
   - [ ] [Specific flow tested]
   - [ ] Manual testing completed

   ## Breaking Changes
   [List any breaking changes or "None"]

   ## Checklist
   - [ ] Code follows project conventions
   - [ ] Self-reviewed
   - [ ] Tests added/updated
   EOF
   )"
   ```

## Output

Report the PR URL when created.
