---
name: trove-component-spec
description: "Generate component specifications from design requirements. Produces structured specs with props, states, interactions, and accessibility requirements."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Component Specification Generator

## Spec Template

When creating a component spec, include:

```markdown
# Component: [Name]

## Purpose
What this component does and when to use it.

## Props / API
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| variant | 'primary' \| 'secondary' | 'primary' | Visual variant |

## States
- Default
- Hover
- Focus
- Active
- Disabled
- Loading
- Error

## Responsive Behavior
- Mobile: [description]
- Tablet: [description]
- Desktop: [description]

## Accessibility
- Role: [ARIA role]
- Keyboard: [interactions]
- Screen reader: [announcements]

## Design Tokens
- Colors: [token names]
- Spacing: [token names]
- Typography: [token names]
```
