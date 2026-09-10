# Obsidian skills extraction

Reviewed on 2026-09-10 from `_sample/obsidian-skills`, a clean checkout of
`https://github.com/kepano/obsidian-skills.git` at
`a1dc48e68138490d522c04cbf5822214c6eb1202`. The source plugin declares version
`1.0.1`. Its MIT license names Steph Ango (@kepano), copyright 2026.

## Selection

Create `trove-doc` as a documentation and knowledge-artifact plugin. Each
source skill has a distinct task and dependency boundary, so all five are
useful as separate, independently discoverable skills.

| Source skill | Trove skill | Value and adaptation |
| --- | --- | --- |
| `obsidian-markdown` | `trove-obsidian-markdown` | Linked notes, properties, embeds, and callouts; preserve vault conventions and restrict activation to Obsidian context |
| `obsidian-bases` | `trove-obsidian-bases` | Structured views over notes; retain YAML/formula guidance with missing-value handling and runtime verification limits |
| `json-canvas` | `trove-json-canvas` | Portable visual boards; correct ID constraints, preserve extensions and z-order, validate edge references |
| `obsidian-cli` | `trove-obsidian-cli` | Live vault search and requested edits; establish capabilities, exact targets, literal arguments, and read-back verification |
| `defuddle` | `trove-web-clip` | Web-to-Markdown extraction beyond Obsidian; make the executable optional and use available host readers as fallbacks |

The first three author file formats and work without a running app. CLI
operations require Obsidian desktop CLI support. Clipping requires access to
the requested source, with Defuddle as an optional convenience.

The plugin name leaves room for additional document workflows, but this
version does not claim Word, PDF, slide, or general repository-doc authoring.
`trove-docs-sync-audit` stays in `trove-dev` because its task is a code-to-docs
comparison. Moving it would change existing installations without improving
the extracted skill set.

## Corrections and boundaries

- JSON Canvas IDs are unique strings. The sample describes 16-character hex
  IDs as required; the [1.0 specification](https://jsoncanvas.org/spec/1.0/)
  does not impose that format. Existing IDs and custom fields are preserved.
- The sample recommends wikilinks for all internal notes. Obsidian supports
  [both internal link styles](https://help.obsidian.md/links), so the adaptation
  follows the vault's configured convention.
- The sample forbids a digit as the first tag character. The
  [tag rules](https://help.obsidian.md/tags) instead require at least one
  nonnumeric character. The adapted guidance uses that rule.
- Bases guards distinguish absent values from zero. Duration arithmetic uses
  numeric fields before rounding. The focused reference retains useful
  [formula and view syntax](https://help.obsidian.md/bases/syntax) without
  copying the entire function catalog.
- The sample's CLI examples use `silent` and assume the most recently focused
  vault. [Current CLI documentation](https://help.obsidian.md/cli) describes
  cwd-aware vault selection and commands with `open` flags. Trove requires
  installed help and explicit vault/path targeting instead of depending on
  those defaults. Literal shell arguments and read-back checks prevent command
  substitution and accidental duplicate appends.
- The sample's Defuddle skill directs a global install and broadly replaces
  WebFetch. Trove uses an installed [Defuddle CLI](https://github.com/kepano/defuddle)
  when available and supports host-reader fallbacks. Raw Markdown URLs with
  query strings bypass extraction. Saving requires a persistence request.
- Markdown does not auto-attach to every `.md` file. Bases and JSON Canvas
  use format-specific globs. CLI and clipping have no file-glob activation.
- Notes and web pages are treated as task data. Instructions embedded in them
  cannot authorize commands, local-file disclosure, or changed destinations.

Official references above were checked during this review. The local source
revision remains the provenance anchor; live docs inform the named corrections.

## Packaging and maintenance

Canonical sources live in `skills/documentation/`, registered by
`plugins/trove-doc/plugin.yaml` and `marketplace.yaml`. The existing generators
produce manifests, catalogs, routing, dependencies, and bundles for all seven
projection surfaces. There are no new hooks, MCP servers, executables, or
runtime packages.

Packaging checks exposed missing support files in scoped `AGENTS.md` output.
The marketplace generator now carries each skill's `references/` tree into
that plugin's scoped directory and rewrites inline reference links to the
owning skill's copy. This preserves licenses and avoids collisions between
skills with the same reference filename. A regression test first failed on
the missing links and then verifies both their targets and copied bytes.

Each adapted skill includes the exact upstream MIT notice under
`references/LICENSE.md`, so it survives standalone skill installation and
host projection. `THIRD_PARTY.md` and `upstream.yaml` record the attribution
and full source revision. Upstream manifests and install instructions are
excluded because Trove owns those surfaces.

These are curated local adaptations, following the existing pstack provenance
shape with `artifacts: []`. They are not automatic byte-sync imports. Future
updates require comparing the pinned skill with upstream, reviewing relevant
official format/CLI documentation, updating the local workflow and evals, and
advancing its evidence revision after review. A sync lock is not claimed.

## Verification contract

Each skill has a rubric and concrete task prompts written before its body.
Cases cover creation, preservation, malformed data, absent tools, non-trigger
requests, and embedded instructions. Structure checks establish that the
evals are runnable; they do not establish scored model behavior.

Build and validate the marketplace, run the unit suite and eval structure
checks, and inspect the resulting host bundles and license copies. Check the
published JSON/YAML examples as parsed artifacts. Live Obsidian rendering,
CLI operations in a real vault, and web extraction require separate runtime
checks; do not infer those outcomes from a successful build.

## Results from this extraction

- `bun run build` passed, including all seven projection surfaces.
- `bun run validate` passed with zero errors and warnings.
- `bun test ./tests` passed 305 tests, including five new documentation-skill
  tests for reference packaging, routing, provenance, and example syntax.
- `bun run eval:structure` passed for all 60 maintained skills. The five new
  skills contribute five rubrics and 19 task prompts; no model scoring ran.
- `./node_modules/.bin/tsc --noEmit` and
  `bun run validate:claude-manifests` passed.
- All five build stages passed their `--dry-run` freshness checks.
- `./bin/trove info trove-doc` and `./bin/trove search obsidian` found the
  plugin with all five skills and all seven platforms.
- Tests were scoped to `./tests` because plain `bun test` also discovers
  unrelated, incompatible tests in the ignored `_sample` checkouts. The build
  and test setup needed sandbox escalation to regenerate `.agents` artifacts.
- The optional standalone `plugin-creator` Python validator could not run
  because that Python environment lacks PyYAML. Repository and native Claude
  manifest validation passed; that separate check is not claimed.
- Live Obsidian rendering, real-vault CLI operations, and a live Defuddle clip
  were not exercised. The plugin packages instructions, not those runtimes.
