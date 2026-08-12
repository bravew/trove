---
title: Use Transitions for Non-Urgent Updates
impact: MEDIUM
impactDescription: maintains UI responsiveness
tags: rerender, transitions, startTransition, performance
---

## Use Transitions for Non-Urgent Updates

Mark frequent, non-urgent state updates as transitions to maintain UI responsiveness.

**Incorrect (blocks UI on every scroll):**

```tsx
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

**Correct (non-blocking updates):**

```tsx
import { startTransition } from 'react'

function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => {
    const handler = () => {
      startTransition(() => setScrollY(window.scrollY))
    }
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])
}
```

> **For continuous-firing event handlers (scroll, mousemove, resize) the
> idiomatic React 19 fix is `useDeferredValue`, not wrapping every event in
> `startTransition`.** See `rerender-use-deferred-value` — let the raw value
> update synchronously and defer the expensive consumer. Reach for
> `startTransition` here only when the state really is "this single update is
> non-urgent" (e.g., applying a filter on submit), not "this firehose of
> updates is non-urgent".
