---
name: trove-design-review
description: "Design review skill for evaluating UI/UX implementations against design specs. Checks visual fidelity, interaction patterns, and design system compliance."
when_to_use: "design review; review the design; visual fidelity check"
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Design Review Guidelines

## Review Dimensions

### 1. Visual Fidelity
- Does the implementation match the Figma design?
- Are spacing, colors, and typography consistent with the design system?
- Are responsive breakpoints handled correctly?

### 2. Interaction Design
- Do hover/focus/active states match specs?
- Are transitions and animations smooth and purposeful?
- Is loading state handled gracefully?

### 3. Accessibility
- Color contrast meets WCAG 2.1 AA (4.5:1 for text, 3:1 for large text)
- Interactive elements have visible focus indicators
- Images have meaningful alt text
- Form fields have associated labels

### 4. Design System Compliance
- Using design system components (not custom implementations)
- Following spacing scale (4px grid)
- Using design tokens for colors, typography, shadows

## Findings

Every finding carries a severity and a location.

- **Severity.** `blocker` breaks the spec for a user, for example a missing
  keyboard path or contrast below AA. `important` is visible drift from the
  spec or a hardcoded value where a token exists. `suggestion` is polish the
  spec does not require.
- **Location.** Give `file:line` when you have the code. Otherwise name the
  screen and component, and say that no file was supplied.
- **Expected vs actual.** Quote the spec value or token and the implemented
  value. For a value that has no token, say so and name the nearest one.

One drift often hides another. A hardcoded color usually means the hover,
focus, and active states built from that color drifted too, and an off-scale
spacing value usually repeats elsewhere. Name the related places to check, and
mark them unverified until you have seen them.

## Output Format

```markdown
## Design Review: [Component/Page Name]

### Match Score: X/10

### Findings
- [blocker|important|suggestion] [file:line or screen > component]
  Expected: <spec or token>. Actual: <implemented value>. Fix: <change>.

### Accessibility Issues
- [blocker|important|suggestion] [WCAG criterion] [location] Description

### Related places to check
- <state or screen>: unverified

### Recommendations
- Suggested improvements, ordered by severity
```
