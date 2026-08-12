---
description: Generate changelog for a new release version
allowed-tools: Read, Edit, Bash(git *)
---

# Generate Changelog

You are updating the changelog for a new release.

## Versioning Scheme

This project uses **Calendar Versioning (CalVer)** with the format: `YY.M.DD[.patch]`

- `YY` - Two-digit year (e.g., 26 for 2026)
- `M` - Month without leading zero (1-12)
- `DD` - Day of month with leading zero (01-31)
- `.patch` - Optional patch number for multiple releases on the same day (starts at 1)

Examples:

- `26.1.29` - First release on January 29, 2026
- `26.1.29.1` - Second release on January 29, 2026
- `26.2.1` - First release on February 1, 2026

## Instructions

1. Determine the new version based on today's date
2. Check if a release already exists for today — if so, increment the patch number
3. Update CHANGELOG.md to add a new section for the new version at the top of the file, right after
   the '# Changelog' heading and before any existing version sections

Review the recent commits and merged pull requests since the last release to generate meaningful
changelog content. Follow the existing format in CHANGELOG.md with sections like:

- Breaking Changes (if any)
- New Features
- Bug Fixes
- Documentation
- Internal/Other changes

Include only the sections that are relevant based on the actual changes. Write clear, user-focused
descriptions.

After updating CHANGELOG.md, commit the changes with: `docs: update changelog for v{new_version}`
