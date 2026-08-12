---
title: Use a List Virtualizer for Any List
impact: HIGH
impactDescription: reduced memory, faster mounts
tags: lists, performance, virtualization, scrollview
---

## Use a List Virtualizer for Any List

Use a list virtualizer like LegendList or FlashList instead of ScrollView with
mapped children—even for short lists. Virtualizers only render visible items,
reducing memory usage and mount time. ScrollView renders all children upfront,
which gets expensive quickly.

**Incorrect (ScrollView renders all items at once):**

```tsx
function Feed({ items }: { items: Item[] }) {
  return (
    <ScrollView>
      {items.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}
    </ScrollView>
  )
}
// 50 items = 50 components mounted, even if only 10 visible
```

**Correct (FlashList — recommended):**

```tsx
import { FlashList } from '@shopify/flash-list'

function Feed({ items }: { items: Item[] }) {
  return (
    <FlashList
      data={items}
      // if you aren't using React Compiler, wrap these with useCallback
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
    />
  )
}
// Only the visible window is mounted
```

FlashList v2 requires the React Native New Architecture and **does not** take
`estimatedItemSize` (the prop was removed in v2 — sizes are inferred
automatically). For older v1 codebases on the legacy bridge, `estimatedItemSize`
is still required.

**Alternative (LegendList):**

```tsx
import { LegendList } from '@legendapp/list'

function Feed({ items }: { items: Item[] }) {
  return (
    <LegendList
      data={items}
      renderItem={({ item }) => <ItemCard item={item} />}
      keyExtractor={(item) => item.id}
      estimatedItemSize={80}
    />
  )
}
```

LegendList still uses `estimatedItemSize`. Pick FlashList unless you need a
LegendList-specific feature; FlashList v2 is the more widely deployed default
on the New Architecture.

Benefits apply to any screen with scrollable content—profiles, settings, feeds,
search results. Default to virtualization.
