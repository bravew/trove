---
name: trove-principle-data-shape
description: "Foundational Thinking — get the data shape right before writing logic. Choose core types and structures first; a late data-structure change is a rewrite, early it is a one-line diff. Use before writing logic, choosing core types, or sequencing scaffold-vs-feature work."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

# Principle: Foundational Thinking

Get the data shape right before writing logic. Structural decisions protect option value: a data-structure change made late is a rewrite; made early it is often a one-line diff.

- Name the core types and how data flows between them before writing behavior.
- **Scaffold-first test:** does every subsequent phase benefit from this structure existing? If yes, build it first.
- Ask what concurrent actors share before you let them share it.
- Subtraction precedes scaffolding: remove dead weight, then build on the simpler base.

Pairs with `trove-architect` (sketch the shape) and `trove-principle-type-discipline` (make the shape honest).
