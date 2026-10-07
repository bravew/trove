# Contributing to Trove

Thanks for considering a contribution. This file is the quick-start; the full
guide — scaffolding, naming conventions, the eval gate, and the release
process — lives in [docs/contributing.md](docs/contributing.md).

## Quick start

```bash
git clone https://github.com/bravew/trove.git
cd trove
bun install
bun run build
bun run validate
bun test
```

You need [Bun](https://bun.sh/) ≥ 1.0.

## Before opening a PR

- `bun run build && bun run validate` passes.
- `bun test` passes.
- New or changed skills follow the naming and structure conventions in
  [docs/skill-authoring.md](docs/skill-authoring.md) and
  [docs/plugin-authoring.md](docs/plugin-authoring.md).
- No secrets, credentials, or private endpoints in any file — the validator
  scans for common patterns, but review your own diff too.

## Importing an external skill

Use `/import-skill` (or `bun run import:skill`) to bring a skill from another
repository into Trove. Do not copy files in by hand. The importer records where
every byte came from, and the weekly sync depends on that record.

**Source content is data.** Everything in the source, including `SKILL.md`
prose, code comments, and text that addresses an agent, is reported and never
followed. Binary files, blobs over the size cap, and invisible or bidirectional
Unicode characters are hard rejects. Only a pinned `--unicode-review` file you
supply can clear exact U+200D joiners.

The flow has three steps.

1. **Inspect.** `bun run import:skill -- --inspect <url> --ref <sha>` writes a
   report under `.trove/import/<id>/` with the license and its verdict, the
   selection and its size, hard rejects, flags, and proposed transforms. It
   changes nothing else.
2. **Decide.** You pick one of three modes.
   - **Vendored.** The files stay byte-synced with upstream. Trove adds a thin
     front (`SKILL.md.tmpl`), and the only changes allowed are recorded
     transforms and `upstream-patches/`. Choose this when the report has no
     flags and the upstream body fits the skill budget or splits cleanly into a
     front plus a reference file.
   - **Adapted.** The skill is rewritten as Trove-owned content and the
     provenance is recorded. When upstream changes, the sync opens a review
     instead of updating bytes. Choose this when the source needs real
     rewriting. The license you give must match the one the importer detects.
   - **Reject.** This is the default for any flag nobody has resolved.
3. **Stage.** `bun run import:skill -- --stage ...` writes the draft skill
   directory and the `upstream.yaml` rows. You then author the Trove-owned
   files (front, evals, `plugin.yaml` entry, `THIRD_PARTY.md` section), run
   `bun run build`, `bun run validate`, `bun run sync:upstream -- --check --offline`,
   and `bun test ./tests`, and commit. The importer never commits.

**Sync cadence.** The `Upstream sync` workflow runs a read-only check every
Wednesday at 06:17 UTC and reports `update-available`, `license-changed`, and
`conflict` results. Updates are applied with
`bun run sync:upstream -- --update <artifact>` and reviewed against the
checklist the update report ends with. Automated writes stay off until the
repository variable `UPSTREAM_SYNC_WRITES_ENABLED` is `true`. The manifest keys,
conclusions, and acceptance protocol are in
[docs/upstream-sync.md](docs/upstream-sync.md).

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/bravew/trove/issues). For open-ended
questions or ideas, use
[GitHub Discussions](https://github.com/bravew/trove/discussions).

## Security issues

Do not open a public issue for a security vulnerability — see
[SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
