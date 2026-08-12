---
title: Use .get() and .set() for Reanimated Shared Values (not .value)
impact: LOW
impactDescription: required for React Compiler compatibility
tags: reanimated, react-compiler, shared-values
---

## Use .get() and .set() for Shared Values with React Compiler

**Applies only when React Compiler is enabled.** On stock React Native without
the compiler, `.value` is still the canonical API and works fine.

With React Compiler enabled, prefer `.get()` and `.set()` over reading or
writing `.value` directly on Reanimated shared values. The compiler does not
track property access through `.value`, so it cannot see that those reads/writes
participate in render — explicit methods give the compiler the signal it needs.

**Not tracked by React Compiler (when compiler is on):**

```tsx
import { useSharedValue } from 'react-native-reanimated'

function Counter() {
  const count = useSharedValue(0)

  const increment = () => {
    count.value = count.value + 1 // not tracked by React Compiler
  }

  return <Button onPress={increment} title={`Count: ${count.value}`} />
}
```

**Correct (React Compiler compatible):**

```tsx
import { useSharedValue } from 'react-native-reanimated'

function Counter() {
  const count = useSharedValue(0)

  const increment = () => {
    count.set(count.get() + 1)
  }

  return <Button onPress={increment} title={`Count: ${count.get()}`} />
}
```

See the
[Reanimated docs](https://docs.swmansion.com/react-native-reanimated/docs/core/useSharedValue/#react-compiler-support)
for more.
