---
title: Hoist callbacks to the root of lists
impact: MEDIUM
impactDescription: Fewer re-renders and faster lists
tags: lists, callbacks, useCallback, memo, performance
---

## List performance callbacks

**Impact: HIGH (Fewer re-renders and faster lists)**

When passing callback functions to list items, create a single stable instance
at the root of the list and have each item call it with its own identifier.
Combined with a memoized item component, this avoids re-rendering every row on
every parent render.

**Incorrect (new callback per row on every render):**

```tsx
return (
  <FlashList
    data={items}
    renderItem={({ item }) => {
      // bad: new function reference for every row, every render
      const onPress = () => handlePress(item.id)
      return <Item item={item} onPress={onPress} />
    }}
  />
)
```

**Correct (stable callback hoisted to the root, memoized item):**

```tsx
const onPress = useCallback((id: string) => {
  handlePress(id)
}, [handlePress])

return (
  <FlashList
    data={items}
    renderItem={({ item }) => <Item item={item} onPress={onPress} />}
    keyExtractor={(item) => item.id}
  />
)

const Item = memo(
  ({ item, onPress }: { item: Item; onPress: (id: string) => void }) => (
    <Pressable onPress={() => onPress(item.id)}>
      <Text>{item.title}</Text>
    </Pressable>
  )
)
```

`onPress` is stable across renders; `Item` only re-renders when its `item` prop
changes. The inline `() => onPress(item.id)` inside the memoized child is fine
because the child only renders when `item` changes anyway.

If React Compiler is enabled, the `useCallback` is unnecessary — the compiler
hoists the function for you.

Reference: [React docs — useCallback](https://react.dev/reference/react/useCallback)
