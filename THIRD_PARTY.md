# Third-party provenance

Trove records machine-readable provenance and lock state in `upstream.yaml`.
This file provides the corresponding human-readable attribution.

## Vercel Agent Skills

The React performance, React Native, and React view-transition skills are
adapted from [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills).
Each selected upstream skill declares the MIT license in its `SKILL.md`
frontmatter. The upstream repository did not contain a top-level license file
when the evidence revision in `upstream.yaml` was reviewed.

Trove renames the skills, injects marketplace guidance, maps upstream `rules/`
files to `references/`, and maintains local changes as patch sets. See each
artifact entry in `upstream.yaml` for the selected files and exact revision.

## pstack principles

Six Trove principle skills are adapted from Lauren Tan's pstack principle set,
distributed in the [Cursor plugins repository](https://github.com/cursor/plugins/tree/main/pstack)
under the MIT license. Exact source paths and the reviewed revision are recorded
in `upstream.yaml`.

## Curated plugin records

The Sentry and Figma curated records point to external repositories at the full
commit revisions recorded in `upstream.yaml`. The Linear record points to a
hosted MCP endpoint and has no repository revision.
