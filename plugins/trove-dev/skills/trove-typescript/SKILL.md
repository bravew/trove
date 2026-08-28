---
name: trove-typescript
description: "TypeScript type-system discipline for any .ts/.tsx file: make illegal states unrepresentable, validate at boundaries, avoid as/any. Use when reading or editing TypeScript that isn't covered by a framework-specific skill. Defers to trove-react / trove-react-best-practices on .tsx component work."
paths:
  - "**/*.ts"
  - "**/*.tsx"
when_to_use: "typescript best practices; type this correctly; make illegal states unrepresentable"
user-invocable: false
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# TypeScript Type-System Discipline

The type checker is a proof assistant. Model the domain so wrong states don't compile. On `.tsx`, defer to `trove-react` / `trove-react-best-practices` for component patterns; this skill owns the plain type discipline underneath them.

## Core rules

| Rule | Do | Not |
|---|---|---|
| Illegal states | Discriminated union with a `kind`/`status` tag | `boolean` + optional field pairs |
| Identity | Branded primitives (`string & { readonly __brand: 'UserId' }`) | bare `string` for ids |
| External data | `unknown` + parse at the boundary | `any` |
| Casts | `satisfies` to check shape while keeping literals | `as SomeType` |
| Exhaustiveness | `const _exhaustive: never = x` in the default branch | unhandled union members |
| Type guards | Guards that actually narrow and are verified | `x as Foo` inside the guard |
| Derive | Types derived from a schema (Zod/valibot `infer`) | hand-kept parallel types |

## The canonical example

```ts
// BAD — admits the meaningless { completed: true, completedAt: undefined }
type Task = { completed: boolean; completedAt?: Date };

// GOOD — the bad state cannot be constructed
type Task =
  | { status: 'open' }
  | { status: 'done'; completedAt: Date };
```

## Boundaries

Validate once, at the edge (network, config, user input). Past the boundary, trust your domain types and keep logic pure. "Parse, don't validate": a parser returns a more precise type or fails; it doesn't just check and discard what it learned.

```ts
function parseUser(raw: unknown): User {
  return UserSchema.parse(raw); // unknown -> User, or throws at the boundary
}
```

See [references/patterns.md](references/patterns.md) for the full pattern set with worked examples.

## AI Gotchas

- **`as` to silence an error** hides the bug you'll debug next week. Reach for narrowing or `satisfies` first.
- **`any` on external data** erases the boundary. Use `unknown` and parse.
- **Non-exhaustive `switch`** over a union compiles today and breaks when a variant is added. Add the `never` guard.
- **Parallel hand-maintained types** drift. Derive from the schema.
