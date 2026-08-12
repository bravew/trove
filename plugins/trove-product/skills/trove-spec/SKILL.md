---
name: trove-spec
description: |
  Product spec writing skill. Generates structured feature specifications
  with user stories, acceptance criteria, and technical considerations.
version: 1.0.0
preamble-tier: 2
triggers:
  - product spec
  - feature spec
  - write a spec
benefits-from:
  - trove-user-story
  - trove-unslop
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Product Spec Template

## Structure

```markdown
# Feature: [Name]

## Problem Statement
What problem does this solve? Who experiences it? How severe is it?

## Proposed Solution
High-level description of the solution.

## User Stories
- As a [role], I want to [action] so that [benefit]

## Acceptance Criteria
- [ ] Given [context], when [action], then [outcome]

## Out of Scope
What this feature explicitly does NOT include.

## Technical Considerations
- Dependencies on other systems/features
- Data model changes
- API changes
- Performance implications

## Success Metrics
| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|

## Timeline
| Phase | Scope | Duration |
|-------|-------|----------|

## Open Questions
- [ ] Question 1
- [ ] Question 2
```

## Best Practices

- Keep specs under 2 pages (focus on what matters)
- Write acceptance criteria as testable assertions
- Include "Out of Scope" to prevent scope creep
- Link to designs/mockups rather than describing visuals
