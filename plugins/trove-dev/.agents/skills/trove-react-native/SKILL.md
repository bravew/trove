---
name: trove-react-native
description: "React Native and Expo best practices for building performant mobile apps. Use when building React Native components, optimizing list/scroll performance, implementing Reanimated animations, or working with native modules. Triggers on tasks involving React Native, Expo, mobile performance, FlashList, or native platform APIs. User-invocable; no auto-attach (no RN project in the current Trove workspace)."
metadata:
  source: vercel-labs/agent-skills
  upstream-version: 1.0.0
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# React Native Skills

Best practices for React Native and Expo applications, organized by impact. Each rule has a detailed reference file under `references/` with incorrect/correct code examples.

## When to Apply

- Building React Native or Expo apps
- Optimizing list and scroll performance (FlashList, virtualization)
- Implementing animations with Reanimated and Gesture Handler
- Working with images and media (expo-image, Galeria)
- Configuring native modules, custom fonts, or platform integrations
- Structuring monorepo projects with native dependencies

> **Note:** This skill is user-invocable rather than glob-auto-attached, since React Native projects are less common than web React ones — invoke it explicitly for ad-hoc RN work or new projects.

## Rule Categories by Priority

| Priority | Category         | Impact   | Prefix               |
| -------- | ---------------- | -------- | -------------------- |
| 1        | List Performance | CRITICAL | `list-performance-`  |
| 2        | Animation        | HIGH     | `animation-`         |
| 3        | Navigation       | HIGH     | `navigation-`        |
| 4        | UI Patterns      | HIGH     | `ui-`                |
| 5        | State Management | MEDIUM   | `react-state-`       |
| 6        | Rendering        | MEDIUM   | `rendering-`         |
| 7        | Monorepo         | MEDIUM   | `monorepo-`          |
| 8        | Configuration    | LOW      | `fonts-`, `imports-` |

## Quick Reference

### 1. List Performance (CRITICAL)

- `list-performance-virtualize` — Use FlashList for large lists
- `list-performance-item-memo` — Memoize list item components
- `list-performance-callbacks` — Stabilize callback references
- `list-performance-inline-objects` — Avoid inline style objects
- `list-performance-function-references` — Extract functions outside render
- `list-performance-images` — Optimize images in lists
- `list-performance-item-expensive` — Move expensive work outside items
- `list-performance-item-types` — Use item types for heterogeneous lists

### 2. Animation (HIGH)

- `animation-gpu-properties` — Animate only transform and opacity
- `animation-derived-value` — Use `useDerivedValue` for computed animations
- `animation-gesture-detector-press` — Use `Gesture.Tap` instead of `Pressable`

### 3. Navigation (HIGH)

- `navigation-native-navigators` — Use native stack and native tabs over JS navigators

### 4. UI Patterns (HIGH)

- `ui-expo-image` — Use expo-image for all images
- `ui-image-gallery` — Use Galeria for image lightboxes
- `ui-pressable` — Use Pressable over TouchableOpacity
- `ui-safe-area-scroll` — Handle safe areas in ScrollViews
- `ui-scrollview-content-inset` — Use contentInset for headers
- `ui-menus` — Use native context menus
- `ui-native-modals` — Use native modals when possible
- `ui-measure-views` — Use onLayout, not measure()
- `ui-styling` — Use `StyleSheet.create` or Nativewind

### 5. State Management (MEDIUM)

- `react-state-minimize` — Minimize state subscriptions
- `react-state-dispatcher` — Use dispatcher pattern for callbacks
- `react-state-fallback` — Show fallback on first render
- `react-compiler-destructure-functions` — Destructure for React Compiler
- `react-compiler-reanimated-shared-values` — Handle shared values with compiler

### 6. Rendering (MEDIUM)

- `rendering-text-in-text-component` — Wrap text in `Text` components
- `rendering-no-falsy-and` — Avoid falsy `&&` for conditional rendering

### 7. Monorepo (MEDIUM)

- `monorepo-native-deps-in-app` — Keep native dependencies in app package
- `monorepo-single-dependency-versions` — Use single versions across packages

### 8. Configuration (LOW)

- `fonts-config-plugin` — Use config plugins for custom fonts
- `imports-design-system-folder` — Organize design system imports
- `js-hoist-intl` — Hoist `Intl` object creation

## How to Use

Read individual rule files for detailed explanations and code examples:

```
references/list-performance-virtualize.md
references/animation-gpu-properties.md
references/ui-expo-image.md
```

Each rule contains: brief explanation, incorrect example, correct example, references.

## Source

Upstream: [vercel-labs/agent-skills · react-native-skills](https://github.com/vercel-labs/agent-skills) (MIT). Adapted for the Trove marketplace.
