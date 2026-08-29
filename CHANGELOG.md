# Changelog

All notable changes to Trove will be documented here. Calendar-versioned
(`YYYY.M.D`) — see [docs/contributing.md](docs/contributing.md) for the
release process.

## Unreleased

### Behavior changes — read before upgrading

- **Auto-attach now works in Claude Code.** Skills declaring
  `auto_attach.globs` never emitted Claude's `paths` field, so they never
  auto-attached. They do now. Ten skills are affected, several with broad
  patterns: `trove-typescript` (`**/*.ts`, `**/*.tsx`), `trove-python`
  (`**/*.py`), `trove-react` (`**/*.tsx`, `**/*.jsx`), `trove-a11y`
  (`**/*.tsx`, `**/*.jsx`, `**/*.vue`, `**/*.html`), `trove-vue`,
  `trove-swift`, `trove-lambda`, `trove-terraform`, `trove-cdk`,
  `trove-docker`. If you do not want a skill loading automatically in matching
  files, remove its `auto_attach` block from `plugin.yaml` and rebuild.
- **Cursor no longer marks model-only skills as manual-only.** `user-invocable:
  false` was being emitted as `disable-model-invocation: true`, which means the
  opposite — 22 skills were hidden from the model and offered to the user
  instead. Manual-only is now an explicit declaration
  (`activation.manual: true`, or per host via `host-overrides`).
- **Installer link layout changed for Claude Code and Codex.** Fallback
  symlinks moved from `~/.claude/skills/trove/<skill>` and
  `~/.agents/skills/trove/<skill>` to `~/.claude/skills/<skill>` and
  `~/.agents/skills/<skill>`. Both hosts document a skill as
  `<root>/<skill>/SKILL.md`, so the grouping folder was read as a skill
  directory with no `SKILL.md` and nothing under it was discovered. Cursor
  keeps its grouped layout, which it documents as supported. Re-run `./setup`;
  stale links under the old paths can be removed by hand.
- **`version:` removed from `plugin.yaml` and skill templates.** Generated
  manifests have always been stamped from the repository `VERSION` file, so the
  authored values only ever drifted — `trove list` reported `v0.1.0` for a
  plugin shipping `v2026.7.4`. Validation now rejects a `version:` in
  `plugin.yaml`.

### Added

- Agent Skills spec conformance is a blocking gate. `bun run validate` checks
  every strict artifact against `scripts/lib/agent-skills-spec.ts`, written
  in-repo from the published specification and pinned to a recorded
  `SPEC_REVISION`. `skills-ref` runs as a non-blocking advisory cross-check in
  CI only.
- `trove-research` plugin with two vendored last-30-days skills: `trove-pulse`
  (global/English platforms, wrapper + on-demand spec) and `trove-pulse-cn`
  (Chinese platforms, direct import). Neither auto-attaches; both run keyless
  with stdlib Python. Cookie/browser access is opt-in, default off.
- Gemini CLI receives skills. Extensions now bundle their plugin's skills under
  `skills/`, declare the required `name`/`version`/`description`, and the same
  files are written to the `.agents/skills` workspace root. Previously Gemini
  received only `GEMINI.md`.
- OpenCode skills moved to `.agents/skills`, one of its documented discovery
  roots; `output/opencode/skills` was not a discovery root at all.
- `./setup` gained `--host opencode`, `--host gemini`, and `--uninstall`. Every
  link it creates is recorded in `~/.trove/installed-links.tsv`, and an entry it
  did not create is never overwritten.
- `docs/host-matrix.md` — discovery roots, honored frontmatter, test method,
  source URL, and verification date per host.
- `bun run validate:claude-manifests` runs `claude plugin validate --strict`
  over all plugins and the marketplace; CI runs it on every PR.
- `bun run test:acceptance:setup` proves the installer layout, collision
  handling, idempotence, and reversibility in a disposable `HOME`.
- Marketplace manifests now carry the `category` and `keywords` Trove already
  curates in `marketplace.yaml`.

### Changed

- Upstream sync can vendor `scripts/**`, apply `replace-literal` rewrites,
  exclude Trove-authored files from the lock via `local_only`, and raise size
  caps per artifact. `bun run validate` secret-scans skill `scripts/**`
  `.py` / `.js` / `.mjs` files.
- Host frontmatter is rebuilt from an explicit per-host allowlist
  (`scripts/lib/projection.ts`) rather than string-stripped in place. Trove's
  authoring vocabulary — `preamble-tier`, `activation`, `triggers`,
  `benefits-from`, `host-overrides` — no longer reaches any host. `triggers`
  becomes Claude's `when_to_use` and folds into `description` for strict hosts.
- `allowed-tools` is withheld from hosts that ignore it. The spec's
  space-separated encoding cannot represent `Bash(git *)`, so those hosts were
  receiving corrupt tokens.
- Eval judge runs on `claude-sonnet-5` with adaptive thinking and an 8192-token
  cap. On Sonnet 5 `max_tokens` bounds thinking plus output, so the previous
  1024 could truncate the judge's JSON and read as a quality regression; a
  truncated response now fails with that explanation. Token usage is recorded in
  `evals/results.json` so a model change can be read as score-vs-cost.
- Dependencies: `@anthropic-ai/sdk` 0.92 → 0.122, TypeScript 6 → 7. No tool
  imports the compiler API, so the TypeScript 7 bump needed no compatibility
  package. CI installs with `bun ci`.
- Skill-triggering fixtures renamed from the project's former `stan-*` naming to
  the `trove-*` skills they actually test; the runner now rejects a fixture that
  does not name a real skill.

### Notes

- Initial public release.
## [2026.8.29] - 2026-08-29

### What's Changed
* Host projection contract, Agent Skills conformance, and installer layout fixes by @bravew in https://github.com/bravew/trove/pull/1
* feat(upstream): add deterministic vendored skill sync by @bravew in https://github.com/bravew/trove/pull/2
* build(deps): bump actions/upload-artifact from 4.6.2 to 7.0.1 by @dependabot[bot] in https://github.com/bravew/trove/pull/3
* build(deps): bump actions/checkout from 4.4.0 to 7.0.1 by @dependabot[bot] in https://github.com/bravew/trove/pull/4
* feat(research): vendor last30days as trove-pulse and trove-pulse-cn by @bravew in https://github.com/bravew/trove/pull/5
* fix(ci): unblock release push to protected main by @bravew in https://github.com/bravew/trove/pull/6

### New Contributors
* @bravew made their first contribution in https://github.com/bravew/trove/pull/1
* @dependabot[bot] made their first contribution in https://github.com/bravew/trove/pull/3

**Full Changelog**: https://github.com/bravew/trove/commits/v2026.8.29

