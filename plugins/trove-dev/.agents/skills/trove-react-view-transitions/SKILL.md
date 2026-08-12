---
name: trove-react-view-transitions
description: "Implement smooth, native-feeling animations with React's View Transition API (`<ViewTransition>`, `addTransitionType`, CSS view-transition pseudo-elements). Use for page transitions, shared element morphs, Suspense reveals, list identity, or animating between React UI states without a third-party animation library."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# React View Transitions

Animate between UI states using the browser's native View Transition API.
Declare what animates with `<ViewTransition>`, trigger when with
`startTransition`, `useDeferredValue`, or `Suspense`, and control how with CSS
classes from `references/css-recipes.md`. Unsupported browsers skip animations.

## Stack Notes

This skill assumes a Vite-based React 19 app (React Router, not Next.js
App Router). The React `<ViewTransition>` component is canary-only for Vite; use
`react@canary react-dom@canary` and verify with `npm ls react`. The
`references/nextjs.md` file is only for future Next.js work.

## Load On Demand

- `references/implementation.md` - required workflow when adding transitions.
- `references/css-recipes.md` - CSS recipes to copy into the global stylesheet.
- `references/patterns.md` - examples, events API, timing, and troubleshooting.
- `references/nextjs.md` - Next.js App Router reference only.

Do not inline those references into the conversation. Load the relevant file
when the implementation step needs it.

## When To Animate

Every transition must communicate continuity or spatial relationship. If you
cannot name what the motion communicates, skip it.

Apply every fitting pattern in this order:

| Priority | Pattern | Communicates |
|---|---|---|
| 1 | Shared element (`name`) | Same thing, going deeper |
| 2 | Suspense reveal | Data loaded |
| 3 | List identity (`key`) | Same items, new arrangement |
| 4 | State change (`enter`/`exit`) | Something appeared/disappeared |
| 5 | Route change | Going to a new place |

Use directional slides only for hierarchy or ordered sequences. Lateral tabs
should use a cross-fade or no animation.

## Implementation Workflow

1. Load `references/implementation.md` and start with the audit. Map every
   `<Link>`, router navigation, `<Suspense>` boundary, page component,
   persistent element, and shared visual element.
2. Copy the complete CSS recipe set from `references/css-recipes.md` into the
   global stylesheet before wiring components.
3. Isolate persistent headers, navbars, sidebars, sticky controls, and matching
   skeleton/content controls with `viewTransitionName`.
4. For hierarchical route changes, tag direction with `addTransitionType` inside
   `startTransition`, then wrap page components, not layouts, in a type-keyed
   `<ViewTransition>`.
5. For Suspense, wrap fallback and content separately. Use string props, not
   type maps; Suspense resolves fire as separate transitions without route type.
6. For shared elements, use globally unique `name` values such as
   `photo-${id}` and add fallback `enter`/`exit` when a pair might not form.
7. Verify every row in the navigation map: mount/unmount behavior, named-pair
   formation, `default="none"`, persistent element isolation, and reduced
   motion.

## Non-Negotiable Rules

- Only `startTransition`, `useDeferredValue`, or `Suspense` activate React view
  transitions. Regular `setState` does not animate.
- `<ViewTransition>` must appear before any DOM node it needs to animate.
  Wrapping the VT inside a `<div>` suppresses enter/exit.
- Use `default="none"` and explicit triggers. Bare VTs cross-fade on every
  transition, including revalidation and background updates.
- Type-keyed props must include `default: "none"` unless broad cross-fades are
  intentional.
- Pair `enter` with `exit`; otherwise the old page vanishes while the new one
  animates.
- Never use a fade-out exit on pages with shared morphs. Use a directional exit
  so the morph stays visually coherent.
- `router.back()` and browser back/forward do not trigger view transitions;
  navigate to an explicit URL instead.
- Nested VTs inside an exiting parent do not run their own enter/exit. Avoid
  layout-level wrappers around page content.

## Verification

Run the app and inspect the real transitions, including reduced-motion mode.
Check desktop and mobile viewports. Confirm that unsupported browsers degrade
to no animation rather than broken layout or invisible content.

## Source

Upstream: `vercel-labs/agent-skills` `react-view-transitions` (MIT). Adapted
for the Trove marketplace.
