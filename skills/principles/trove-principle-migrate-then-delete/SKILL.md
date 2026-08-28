---
name: trove-principle-migrate-then-delete
description: "Migrate Callers Then Delete Legacy APIs — when introducing a new internal API while old callers exist, migrate every caller and delete the old API in the same refactor wave instead of leaving a compatibility layer. Use when replacing an internal API, function, or module that has no external dependents."
when_to_use: "migrate callers; remove the legacy api; no compatibility shim"
user-invocable: true
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

# Principle: Migrate Callers Then Delete Legacy APIs

For an internal API with no external consumers, migrate and delete in one wave. Don't leave a compatibility shim behind "for safety" — the shim becomes permanent.

1. **Inventory** every caller of the old API.
2. **Migrate** them to the new one.
3. **Delete** the old API in the same change, including tests that protected its pre-refactor implementation details.

The result feels append-only: there is one way to do the thing, not two. This is the core discipline behind the workspace's in-flight migrations (Vue→React, Lambda→jobs). For external/published APIs, normal deprecation rules still apply.
