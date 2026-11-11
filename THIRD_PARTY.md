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

## ffmpeg-skill

`trove-ffmpeg` in `trove-media` is vendored from
[kajisho5/ffmpeg-skill](https://github.com/kajisho5/ffmpeg-skill) at
`6e42a79247909659b3d80833120b272fb5e46aba` (3.2.3), under the MIT license.
The 3.0 release requires FFmpeg 6.1 or newer and Python 3.10 or newer, and it
changed the cut defaults; the Trove front states both requirements.

**Trove redistributes upstream code, not only adapted prose.** The selection
carries upstream's `scripts/` Python engine (42 tools plus shared modules),
`references/`, and `templates/`, byte-for-byte apart from two recorded
`replace-literal` transforms. `references/LICENSE.md` carries the upstream MIT
notice, and `THIRD_PARTY.md` and `upstream.yaml` record the pinned revision, so
the notice obligation travels with every host bundle.

Upstream's own `SKILL.md` exceeds the Trove body budget, so it is byte-synced to
`references/runtime-spec.md` and a Trove-authored `SKILL.md.tmpl` front (kept
outside the sync lock) points at it. Both transforms exist because the vendored
tree relocates `templates/` into `scripts/` and moves the spec under
`references/`; each transform fails closed if upstream renames the line it
matches.

The following upstream directories are deliberately not vendored: `mcp` (a
contract-derived MCP server, deferred with a path rewrite in plan §5.5), `docs`,
`assets`, `evals`, `tests`, `demos`, `examples`, `bin`, `.claude`, and `.github`.
They are omissions by decision, and `upstream.yaml`'s `not_vendored` list records
them.

## diagram-design

`trove-diagram-design` in `trove-design` is vendored from
[cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
at `f2496acbde9f45ccb55c24d4f75210c8a1355df8` (2.6), under the MIT license.

**Trove redistributes upstream code, not only adapted prose.** The selection
carries upstream's `references/`, its eight Python `scripts/`
(self-check, geometry verifier, SVG and PNG export, and the draw.io, Mermaid,
Excalidraw, and PlantUML extractors), and from `assets/` the five HTML templates
and `icons.html`, byte-for-byte with no transforms or patches.
`references/LICENSE.md` carries the upstream MIT notice, so the notice
obligation travels with every host bundle.

Upstream's own `SKILL.md` exceeds the Trove body budget, so it is byte-synced to
`references/runtime-spec.md` and a Trove-authored `SKILL.md.tmpl` front (kept
outside the sync lock) points at it.

Deliberately not vendored: the example gallery (`assets/example-*.html` and
`assets/index.html`, about 4.4 MB), which exceeds the manifest's artifact size
limit. `upstream.yaml`'s `not_vendored` list records the omission. PNG export
uses Playwright, an optional external tool that Trove neither ships nor
installs.

## pstack principles

`trove-why` is original Trove work and is not byte-pinned. It was inspired by Lauren Tan's pstack why skill, and Trove deliberately narrowed its scope.

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
at `7869eb17144789b843e6655c41bd3d570aa2288a` (nine commits after `v3.32.0`).
Trove vendors `references/` and `scripts/` and authors a wrapper
`SKILL.md.tmpl` that is local-only (outside the sync lock).

The browser-cookie and Chrome DevTools lanes are excluded:
`scripts/lib/agentcookie.py`, `scripts/lib/chrome_cdp.py`, and
`scripts/box_chrome_login.py`. A local patch removes the setup wizard's
description of them and drops `BROWSER_CDP_URL` from the research keys. The
cookie modules Trove already shipped are kept.

The vendored tree includes `scripts/lib/vendor/bird-search`, an MIT-licensed
Node client (`engines.node >= 22`, ~116 KB) used for X/Twitter search. A sync
whose `changed_paths` touch `scripts/lib/vendor/**` is a named review trigger.

Not vendored: `mcp/`, `tests/`, `assets/`, `agents/`, `.grok-plugin/`, and
translated READMEs.

### trove-pulse-cn

Adapted from [Jesseovo/last30days-skill-cn](https://github.com/Jesseovo/last30days-skill-cn)
at `e0e41410de18466aceb505faee5ef998cacee1e8` (24 commits after `v4.0.0`). That repository is
itself an MIT fork of `mvanhorn/last30days-skill`. The upstream `LICENSE`
naming both copyright holders is preserved in the vendored tree.

Not vendored: `assets/`, `tests/`, `fixtures/`, `hooks/`, `agents/`, and the
root development copies (the installable payload under `skills/last30days/` is
what Trove vendors). The hot-board image `scripts/lib/hot_board_cat.png` is
excluded.

## Obsidian skills

The five skills in `trove-doc` are adapted from
[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills/tree/3ccff5338ea700537839b21900aa5358a0402c98)
at `3ccff5338ea700537839b21900aa5358a0402c98`, under the MIT license.
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

## video-shotcraft

Four skills in `trove-media` are adapted from
[Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft)
at `3ac67b75dd0b3bc2fd807c17f6b7ce35373eef3d`, under the Apache-2.0 license,
Copyright 2026 Wei Yihao. Each adapted skill carries the full Apache-2.0 notice
plus a "changes made" statement in `references/LICENSE.md`, which is copied into
host bundles. Nothing is relicensed: Trove's MIT license covers Trove's own
authored text, and the Apache-2.0 notice governs the adapted material.

Trove ships the methodology and the protocol for using the upstream library, not
a copy of it. `trove-product-video`, `trove-shot-recipes`, `trove-beat-sync`, and
`trove-video-review` are written in English from the Chinese source and call
`trove-ffmpeg` scripts instead of running raw `ffmpeg`. The source entry in
`upstream.yaml` is a curated adaptation with `artifacts: []`; each skill row pins
the reviewed revision in `evidence_sha`.

Deliberately excluded: the `assets/` audio and texture library, the `template/`
project, the `demos/` tree, the `workbench/` app, gallery media, the CapCut and
剪映 export path, and the upstream author-promotion step. Cards and their
reference implementations are read from the user's own checkout when one is
present, never vendored.

The upstream `references/shots/ATTRIBUTION.md` records that card techniques were
studied from published promos and reimplemented from scratch. Trove does not
restate that table and implies no endorsement by any rightsholder. The
[mapping plan](dev-doc/2026-09-video-shotcraft-media-plan.md) records the
selection, the per-document adaptation, and the corrections.

## BuildLoop video skills

`trove-take-cut`, `trove-broll-ingest`, and `trove-video-edit` are original skills. The BuildLoop video skills were the reference for the techniques, and
each skill records that with `metadata.inspired-by`. No prose is taken from the
source.

The four LUTs under `skills/media/trove-broll-ingest/assets/luts/` are the
exception. They are BuildLoop's cinematic grade, shipped byte for byte under
neutral filenames by maintainer decision on 2026-11-09. The filenames are the
only change.

## Curated plugin records

The Sentry and Figma curated records point to external repositories at the full
commit revisions recorded in `upstream.yaml`. The Linear record points to a
hosted MCP endpoint and has no repository revision.
