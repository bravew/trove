---
description: Create comprehensive implementation PRP with deep codebase analysis
argument-hint: "<feature description>"
allowed-tools: Read, Grep, Glob, Write, Agent, WebSearch, WebFetch, Bash(git *), Bash(mkdir *)
---

# Create Feature PRP

## Feature: $ARGUMENTS

## Mission

Transform a feature request into a **comprehensive implementation PRP** (Pull Request Plan) through
systematic codebase analysis, external research, and strategic planning.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a battle-tested,
context-rich implementation plan that enables one-pass implementation success.

**Key Philosophy**: Context is King. The PRP must contain ALL information needed for
implementation — patterns, gotchas, documentation, validation commands — so the execution agent
succeeds on the first attempt.

## Planning Process

### Phase 1: Feature Understanding

- Extract the core problem being solved
- Identify user value and business impact
- Determine feature type: New Capability / Enhancement / Refactor / Bug Fix
- Assess complexity: Low / Medium / High
- Map affected systems and components

### Phase 2: Codebase Intelligence Gathering

Use specialized agents and parallel analysis:

**1. Project Structure Analysis**

- Check CLAUDE.md / project rules for conventions
- Read config files (package.json, pyproject.toml, Package.swift, etc.)
- Map directory structure, module organization, and routing patterns
- Identify the project's validation commands (lint, type-check, test, build)

**2. Pattern Recognition** (use subagents when beneficial)

- Search for similar implementations in the codebase
- Identify coding conventions (naming, structure, error handling, testing)
- Extract common patterns for the feature's domain
- Document anti-patterns to avoid

**3. Dependency Analysis**

- Catalog external libraries relevant to the feature
- Understand how libraries are integrated
- Note library versions and compatibility requirements

**4. Testing Patterns**

- Identify the project's test framework and structure
- Find similar test examples for reference
- Note validation commands

**5. Integration Points**

- Identify existing files that need updates
- Determine new files that need creation and their locations
- Map routing, state management, and API patterns if applicable

**Clarify Ambiguities:**

- If requirements are unclear, ask the user to clarify before continuing
- Get specific implementation preferences (libraries, approaches, patterns)

### Phase 3: External Research & Documentation

Use subagents when beneficial for external research:

- Research latest library versions and best practices
- Find official documentation with specific section anchors
- Locate implementation examples
- Identify common gotchas and known issues

### Phase 4: Deep Strategic Thinking

Think hard about:

- How does this feature fit into the existing architecture?
- What are the critical dependencies and order of operations?
- What could go wrong? (Edge cases, race conditions, errors)
- How will this be tested comprehensively?
- Are there security or performance implications?

### Phase 5: PRP Generation

````markdown
# Feature: <feature-name>

## Feature Description

<Detailed description, purpose, and user value>

## Feature Metadata

**Type**: [New Capability/Enhancement/Refactor/Bug Fix]
**Complexity**: [Low/Medium/High]
**Affected Areas**: [Components, modules, routes affected]
**Dependencies**: [External libraries or services required]

---

## CONTEXT REFERENCES

### Files to Modify

- `path/to/file` (lines N-M) - Why: [reason]

### Files to Create

- `path/to/new-file` - Purpose: [what it does]

### Patterns to Follow

- Pattern from `path/to/similar` - [specific pattern to mirror]

### Relevant Documentation

- [Doc Link](https://example.com/docs#section) - Why: [reason]

---

## STEP-BY-STEP TASKS

### Task 1: {ACTION} {target}

- **IMPLEMENT**: {Specific implementation detail}
- **PATTERN**: {Reference to existing pattern - file:line}
- **GOTCHA**: {Known issues or constraints}
- **VALIDATE**: `{project-appropriate validation command}`

### Task 2: {ACTION} {target}

...continue for all tasks in dependency order...

---

## VALIDATION GATES

### Level 1: Syntax & Style

```bash
<project-appropriate lint/format commands>
```

### Level 2: Tests

```bash
<project-appropriate test commands>
```

### Level 3: Build

```bash
<project-appropriate build command>
```

---

## ACCEPTANCE CRITERIA

- [ ] [Specific criterion 1]
- [ ] [Specific criterion 2]
- [ ] All validation gates pass

---

## COMPLETION CHECKLIST

- [ ] All tasks completed
- [ ] Validation gates pass
- [ ] Acceptance criteria met
````

## Task Rules

1. Each task is atomic and independently testable
2. Tasks are ordered by dependency (execute top-to-bottom)
3. Use action verbs: CREATE, UPDATE, ADD, REMOVE, REFACTOR, MIRROR
4. Include specific implementation details from codebase analysis
5. Every task has an executable validation command

## Output

Save as: `.claude/PRPs/{kebab-case-descriptive-name}.md`
Create the `.claude/PRPs/` directory if it doesn't exist.

## Success Metrics

- **Implementation Ready**: Another developer could execute without additional context
- **Validation Complete**: Every task has at least one working validation command
- **Pattern Consistent**: Tasks follow existing codebase conventions
