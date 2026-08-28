---
name: trove-user-story
description: "User story writing skill. Generates well-structured user stories with acceptance criteria, edge cases, and test scenarios."
when_to_use: "user story; acceptance criteria; write a story"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# User Story Conventions

## Format

```
As a [persona/role],
I want to [action/capability],
so that [benefit/value].
```

## Acceptance Criteria (Given-When-Then)

```
Given [precondition],
When [action],
Then [expected outcome].
```

## Story Quality Checklist

- [ ] **Independent** — can be developed without other stories
- [ ] **Negotiable** — details can be discussed with the team
- [ ] **Valuable** — delivers clear user/business value
- [ ] **Estimable** — team can estimate effort
- [ ] **Small** — completable in one sprint
- [ ] **Testable** — acceptance criteria are verifiable

## Edge Cases to Consider

Always include scenarios for:
- Empty/null/missing data
- Permission denied
- Network failure
- Concurrent access
- First-time vs returning users
