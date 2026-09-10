# TypeScript Patterns

## Contents
- Discriminated unions
- Branded types
- `satisfies` over `as`
- Exhaustiveness with `never`
- Verified type guards
- Parse, don't validate (boundary parsing)
- Schema-derived types

## Discriminated unions

Model mutually exclusive states with a shared tag so impossible combinations can't be constructed.

```ts
type Fetch<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function render<T>(s: Fetch<T>) {
  switch (s.status) {
    case 'idle': return null;
    case 'loading': return spinner();
    case 'success': return view(s.data); // s.data only exists here
    case 'error': return errorView(s.error);
  }
}
```

## Branded types

Give semantically distinct primitives nominal identity so a `UserId` can't be passed where an `OrderId` is expected.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
type UserId = Brand<string, 'UserId'>;
type OrderId = Brand<string, 'OrderId'>;

const asUserId = (s: string): UserId => s as UserId; // the one sanctioned cast, at the constructor
```

## `satisfies` over `as`

`satisfies` checks the value conforms to a type while preserving the narrowest inferred literals. `as` throws away safety.

```ts
// `as` widens and can lie:
const a = { fg: '#fff' } as Record<string, string>; // a.fg: string

// `satisfies` keeps literals AND checks the shape:
const palette = { fg: '#fff', bg: '#000' } satisfies Record<string, string>;
palette.fg; // type is '#fff', and a typo key is a compile error
```

## Exhaustiveness with `never`

Force the compiler to flag an unhandled union member when a variant is added later.

```ts
function area(s: Shape): number {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'square': return s.side ** 2;
    default: {
      const _exhaustive: never = s; // compile error if a new Shape kind is added
      throw new Error(`unhandled: ${(s as { kind: string }).kind}`);
    }
  }
}
```

## Verified type guards

A guard must actually narrow; don't bury an `as` inside it.

```ts
function isUser(x: unknown): x is User {
  return typeof x === 'object' && x !== null
    && 'id' in x && typeof (x as { id: unknown }).id === 'string';
}
```

Prefer a schema parser (below) over hand-rolled guards for anything non-trivial.

## Parse, don't validate

A validator says "this is fine, continue" and discards what it learned. A parser returns a more precise type or fails. Keep a hard boundary between `unknown` (outside) and your domain types (trusted).

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  createdAt: z.coerce.date(),
});

function loadUser(raw: unknown): User {
  return UserSchema.parse(raw); // unknown -> User at the boundary, or throws
}
```

## Schema-derived types

Derive the static type from the schema so there's one source of truth.

```ts
type User = z.infer<typeof UserSchema>; // never drifts from the parser
```
