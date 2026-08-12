---
name: trove-release-notes
description: "Release notes generator. Creates user-facing release notes from git history, PR descriptions, and changelog entries."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

# Release Notes Conventions

## Format

```markdown
# Release [version] — [date]

## Highlights
One-paragraph summary of the most impactful changes.

## New Features
- **[Feature Name]** — Brief description of what users can now do

## Improvements
- **[Area]** — What got better and why it matters

## Bug Fixes
- Fixed [issue] where [symptom] occurred when [trigger]

## Breaking Changes
- **[Change]** — What changed, migration steps

## Known Issues
- [Issue] — workaround if available
```

## Writing Guidelines

- Write for users, not developers
- Lead with benefits, not implementation details
- Use active voice ("You can now..." not "Added ability to...")
- Group related changes together
- Include screenshots/GIFs for visual changes

## Changelog Updates

When asked to update `CHANGELOG.md`, derive the version from the repo's
existing versioning policy. For Trove CalVer, use `YY.M.DD` and append
`.patch` only when a release for the same date already exists. Insert the new
section directly below the changelog title, include only sections supported by
the actual git history, and commit only when the user explicitly asked for a
commit.
