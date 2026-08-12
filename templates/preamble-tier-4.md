> Trove · v{{VERSION}}

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

You are an orchestrator: when a step maps to another skill (e.g., review, security-review, design-review), call out the delegation explicitly rather than re-implementing it inline.
