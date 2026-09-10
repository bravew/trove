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

## last30days research engines

Two skills in `trove-research` are adapted from MIT-licensed last-30-days
research engines. Exact selection, transforms, patches, and lock digests live
in `upstream.yaml`.

### trove-pulse

Adapted from [mvanhorn/last30days-skill](https://github.com/mvanhorn/last30days-skill)
at `a218edadbc3361672f5e5e2cd72a8212b0b3fbb8` (`v3.21.1`). Trove vendors
`references/` and `scripts/` and authors a wrapper `SKILL.md.tmpl` that is
local-only (outside the sync lock).

The vendored tree includes `scripts/lib/vendor/bird-search`, an MIT-licensed
Node client (`engines.node >= 22`, ~116 KB) used for X/Twitter search. A sync
whose `changed_paths` touch `scripts/lib/vendor/**` is a named review trigger.

Not vendored: `mcp/`, `tests/`, `assets/`, `agents/`, `.grok-plugin/`, and
translated READMEs.

### trove-pulse-cn

Adapted from [Jesseovo/last30days-skill-cn](https://github.com/Jesseovo/last30days-skill-cn)
at `1a8a04c3c347defbcdbb8da26d7cf1a531426b1f` (`v3.2.0`). That repository is
itself an MIT fork of `mvanhorn/last30days-skill`. The upstream `LICENSE`
naming both copyright holders is preserved in the vendored tree.

Not vendored: `assets/`, `tests/`, `fixtures/`, `hooks/`, `agents/`, and the
root development copies (the installable payload under `skills/last30days/` is
what Trove vendors).

## Obsidian skills

The five skills in `trove-doc` are adapted from
[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills/tree/a1dc48e68138490d522c04cbf5822214c6eb1202)
at `a1dc48e68138490d522c04cbf5822214c6eb1202`, under the MIT license.
Copyright (c) 2026 Steph Ango (@kepano). Every adapted skill carries the full
upstream notice in `references/LICENSE.md`, which is copied into host bundles.

Trove retains the Markdown, Bases, JSON Canvas, and CLI scopes and exposes
the upstream `defuddle` workflow as `trove-web-clip`. The workflows and focused
references are maintained as local adaptations with pinned provenance in
`upstream.yaml`; they are not enrolled in automatic byte synchronization.
The [extraction review](dev-doc/2026-09-obsidian-skills-extraction.md) records
the selection, behavioral changes, and official references used for corrections.

Defuddle and Obsidian are optional external tools and are not vendored.
The upstream marketplace manifests and installation instructions are not shipped.

## Curated plugin records

The Sentry and Figma curated records point to external repositories at the full
commit revisions recorded in `upstream.yaml`. The Linear record points to a
hosted MCP endpoint and has no repository revision.
