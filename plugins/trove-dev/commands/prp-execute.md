---
description: Execute a PRP implementation plan until fully complete
argument-hint: "<prp-file-path>"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Bash
---

# Execute PRP

## PRP File: $ARGUMENTS

## Mission: One-Pass Implementation Success

PRPs enable working code on the first attempt through:

- **Context Completeness**: Everything needed, nothing guessed
- **Progressive Validation**: Multi-level gates catch errors early
- **Pattern Consistency**: Follow existing codebase approaches

**Your Goal**: Transform the PRP into working code that passes all validation gates.

## Execution Process

### 1. Load PRP

- Read the specified PRP file completely
- Absorb all context, patterns, requirements
- Use the provided documentation references and file patterns
- Trust the PRP's strategic direction, but verify tactical details (imports, paths, names)

### 2. Pre-Implementation Check

- Verify all referenced files exist
- Check that patterns mentioned are accessible
- Detect project stack and confirm validation commands match
- Run any pre-requisite setup commands

### 3. Task-by-Task Implementation

For each task in the STEP-BY-STEP TASKS section:

**a) Understand** — Read task requirements and referenced patterns

**b) Implement** — Follow the specified pattern and project conventions:
   - Check CLAUDE.md or project rules for naming conventions
   - Apply the documented approach
   - Handle edge cases mentioned

**c) Validate immediately** — Run the task's validation command
   - If validation fails, fix and re-validate
   - Don't proceed until current task passes

**d) Mark complete** — Update todo list to track progress

### 4. Full Validation

After all tasks complete, run every validation gate from the PRP:

```
Level 1: Lint/format
Level 2: Tests
Level 3: Build
Level 4: Manual validation (if specified)
```

Each level must pass before proceeding to the next.

### 5. Completion

- Work through the PRP's completion checklist
- Verify all acceptance criteria met
- Move completed PRP: `mv .claude/PRPs/{file}.md .claude/PRPs/completed/`

## Execution Rules

- **Validation Gates**: Each task must pass validation; iterate until passed
- **Pattern Adherence**: Follow existing patterns, don't create new ones
- **No Shortcuts**: Complete all validation steps
- **If the PRP has errors**: Fix the tactical details and note deviations in report

## Failure Handling

When a task fails validation:

1. Read the error message carefully
2. Check the pattern reference again
3. Investigate the codebase for correct approach
4. Fix and re-validate
5. If stuck after 3 attempts, check similar implementations

## Report

After completion:

**Summary:**
- Feature: {name}
- Tasks completed: {count}
- Files created/modified: {list}

**Validation:**
```
Lint/format: Passed
Type checking: Passed
Tests: X/X passed
Build: Passed
```

**Adjustments** (if any):
- Note any PRP details that were incorrect and how you fixed them

**Files Changed:**
```bash
git diff --stat
```
