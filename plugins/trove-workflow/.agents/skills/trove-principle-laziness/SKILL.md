---
name: trove-principle-laziness
description: "Laziness Protocol — aim for the most result with the least code and complexity; bias toward deletion and the smallest change that solves the problem. Use when refactoring, weighing diff size, or tempted to add abstractions, layers, or signal threading."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

# Principle: Laziness Protocol

Aim for the most result with the least code and complexity. The best change is often a deletion.

- Prefer removing code to adding it. Minimize the diff that solves the problem.
- Don't add abstractions, layers, or config for a single caller or a hypothetical future.
- **Borrow a maintainer's fatigue.** If tracing how an answer is produced requires jumping through more than ~3 files or layers, flatten it.
- Three similar lines beat a premature abstraction.

Prime directive: if a human maintainer would find it exhausting to hold this in their head, it's too complex — simplify before shipping.
