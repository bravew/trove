---
name: trove-principle-type-discipline
description: "Type System Discipline — treat the type checker as a proof assistant: make illegal states unrepresentable, brand semantic primitives, parse external data at boundaries, exhaust variants, don't lie to the compiler. Applies to any statically typed language. Use when designing types or a signature in TypeScript, Python (hints/Pydantic), Swift, or similar."
when_to_use: "design these types; make illegal states unrepresentable; type system discipline"
user-invocable: true
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

# Principle: Type System Discipline

The type checker is a proof assistant. Spend the budget so wrong states don't compile.

- **Make illegal states unrepresentable.** `{ completed: boolean; completedAt?: Date }` admits the meaningless `true/undefined`; model it as a tagged union instead.
- **Brand semantic primitives** so a `UserId` can't be passed where an `OrderId` is expected.
- **Parse external data at the boundary** into domain types; don't thread raw `unknown`/`any` inward.
- **Exhaust variants** (a `never` check in the default branch) so a new case is a compile error, not a silent fallthrough.
- **Don't lie to the compiler.** The cast you bury today is the postmortem you write next week.

Language-specific syntax lives in the stack skill (`trove-typescript` for TS); this principle is the cross-language rule.
