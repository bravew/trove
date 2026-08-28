# Trove Modernization Plan, August 2026

**Status:** Revised, implementation-ready draft
**Reviewed:** 2026-08-28
**Repository baseline:** `main` at `dcfade2`, `VERSION` `2026.7.4`
**Baseline verification:** `bun run validate` passes (51 first-party skill registrations,
102 skill files, 0 errors)

This revision was checked against the repository and current primary documentation. It
separates confirmed defects from compatibility improvements and removes several claims
that the code or vendor documentation does not support.

## 1. Outcome

Modernize Trove's generated artifacts without replacing its working build topology:

- keep `SKILL.md.tmpl` as the authoring source;
- make every emitted artifact conform to the target host's documented schema;
- add native Gemini skill output and a supported OpenCode delivery layout;
- preserve the already-valid Codex plugin implementation;
- validate generated Claude and Agent Skills artifacts with first-party/reference tools;
- refresh dependencies and skill content in separately reviewable waves.

The first release should fix the two confirmed behavior defects in the current
projection pipeline. Broader manifest and content work follows only after golden tests
pin existing behavior.

## 2. Evidence-backed findings

Severity means:

- **P0:** a declared Trove behavior is broken in a primary host;
- **P1:** a supported output or installation path is incomplete or incompatible;
- **P2:** maintainability, freshness, or optional distribution improvement.

| ID | Severity | Finding | Repository evidence | Disposition |
|---|---:|---|---|---|
| F1 | **P0** | Claude skills with `auto_attach.globs` do not emit Claude's documented `paths` field. | `hosts/claude.ts:31-35` keeps all authoring frontmatter; `scripts/gen-skills.ts:65-78` does not map `activation.globs` for Claude. | Fix first and add golden tests. |
| F2 | **P0** | Cursor reverses the meaning of `user-invocable: false` by emitting `disable-model-invocation: true`. | `scripts/gen-skills.ts:86-106`; Cursor documents the latter as manual-only. | Stop translating the field; omit it for Cursor unless an explicit manual-only authoring field is present. |
| F3 | **P1** | Claude-generated skills cannot be uploaded through claude.ai, the Skills API, or `package_skill.py` because they contain non-spec keys. | Claude uses `mode: "keep"`; templates contain `version`, `preamble-tier`, `activation`, `triggers`, and `benefits-from`. | Add a strict spec projection. The current Claude Code plugin output is not invalid. Claude Code accepts extensions and unknown metadata differently from upload paths. |
| F4 | **P1** | Gemini receives only the `using-trove` `GEMINI.md` extension; it receives none of the 51 on-demand skills. | `hosts/gemini.ts:17-27`; `scripts/gen-plugins.ts:417-437`; only `output/gemini/plugins/trove-workflow/` exists. | Bundle skills in Gemini extensions or emit a documented `.agents/skills` layout. Keep `GEMINI.md` only for persistent bootstrap context. |
| F5 | **P1** | OpenCode skill files are generated under `output/opencode/skills`, which is not itself a documented discovery root, and `setup` has no OpenCode path. | `hosts/opencode.ts:17-18`; `setup:282-291`. The custom workflow plugin references the sibling directory, but no supported install step delivers the tree. | Choose and test one supported delivery: extension bundle or `.opencode/skills`/`.agents/skills`. |
| F6 | **P1, verify at runtime** | Fallback setup nests Claude and Codex symlinks under `.../skills/trove/<skill>`. The vendor docs show direct `<skills-root>/<skill>/SKILL.md` entries and do not document category folders at those user roots. | `setup:160-186`, `setup:233-258`. Cursor explicitly supports recursive grouping, so its nested layout is valid. | Add disposable-home acceptance tests; flatten Claude/Codex only if the host cannot discover the nested links. Do not present this as a confirmed defect before that test. |
| F7 | **P2** | Claude command files duplicate parts of the skill inventory, but commands remain supported. | `plugins/trove-dev/plugin.yaml` declares 9 commands; Claude documents commands as legacy-compatible and recommends skills for new work. Several commands have no exact same-name skill. | Inventory behavior and migrate one-for-one before deleting anything. No bulk deletion or `renames` assumption. |
| F8 | **P2** | Version fields are confusing but generated plugin update detection is already correct. | `plugin.yaml` uses `0.1.0`/`1.0.0`, skill templates use `1.0.0`, while `scripts/gen-plugins.ts:23-45` intentionally derives shipped plugin versions from `VERSION`. | Document or remove redundant authoring versions; do not classify this as a runtime update bug. |
| F9 | **P2** | The eval default is active but legacy, not invalid. | `scripts/eval-runner.ts:10,34` uses `claude-sonnet-4-6`. Anthropic's Sonnet 5 page documents the `claude-sonnet-4-6` → `claude-sonnet-5` swap as a drop-in migration, so 4-6 is active, not retired. | Upgrade in an eval-only change and compare scores/cost before changing the gate. See F13 for the specific truncation hazard. |
| F10 | **P2** | Dependencies are behind current registry releases. | `@anthropic-ai/sdk ^0.92.0` vs `0.122.0`; `typescript ^6.0.3` vs `7.0.2`, verified with `npm view` on 2026-08-28. | Upgrade independently. TypeScript 7 has no stable programmatic API until 7.1, so first confirm no tool imports `typescript` (verified: none does) and use `@typescript/typescript6` if a tool later needs the 6.0 API. |
| F11 | **P2** | Repository guidance and old fixtures have drifted. | `CLAUDE.md` describes four hosts while `hosts/index.ts:8-15` exports six; 12 trigger fixtures remain under `tests/skill-triggering/stan-*`/`using-stanwith`. | Refresh after host behavior is stable. |
| F12 | **P2** | Claude's marketplace and plugin schemas expose useful metadata and validation that Trove does not yet use. | `.claude-plugin/marketplace.json` drops category/tags and CI does not run `claude plugin validate`. | Add only fields Trove has a use for; prefer schema validation over modeling every optional/experimental feature. |
| F13 | **P2** | Switching the eval model to Sonnet 5 can truncate the judge response and read as a quality regression. | `scripts/eval-runner.ts:192` hardcodes `max_tokens: 1024` and the judge must return parseable JSON. On Sonnet 5 adaptive thinking is on by default and `max_tokens` caps thinking **plus** output; its tokenizer also emits ~30% more tokens for the same text. | Before comparing scores, either send `thinking: {type: "disabled"}` or raise `max_tokens`, then assert the judge JSON still parses. No blocker from sampling parameters: the repo sets no `temperature`/`top_p`/`top_k` anywhere, so the Sonnet 5 400-error constraint does not apply. |
| F14 | **P2** | `skills-ref` is unsuitable as a release gate, in either distribution. | The reference implementation (`agentskills/agentskills/skills-ref`) is Python, Apache-2.0, v0.1.0, and its README states it is "intended for demonstration purposes only. It is not meant to be used in production." The npm package of the same name is v0.1.5, MIT, and publishes no `repository` or `homepage` field, so its provenance is unestablished. | Own the blocking gate in-repo; keep the reference tool advisory only. See Checkpoint 3. |

### Corrections to the earlier draft

- Agent Skills is an **open standard**; the source does not call it “ratified.”
- Trove's `.codex-plugin/plugin.json` is not fictional. OpenAI currently requires that
  manifest, and the repository's single-string `skills: "./skills/"`, `interface`, and
  `.agents/plugins/marketplace.json` shapes match the published examples.
- The `optional`, `description`, and `tools` MCP properties in `plugin.yaml` are
  Trove-side catalog metadata. `filterRegisterableMcpServers()` currently removes every
  optional server before Claude/Cursor output, and Codex emits none of them. There is no
  malformed generated MCP block to fix today.
- Claude commands are legacy-compatible, not removed. Migration is worthwhile only
  after exact invocation and argument behavior is covered by tests.
- The three version layers do not currently freeze updates because emitted plugin
  versions already come from `VERSION`.
- A TypeScript 7 bump is not purely mechanical: the native compiler has no stable API
  in 7.0. The repository does not currently import `typescript`, but its toolchain still
  needs a full test pass.

## 3. Target contract

Keep the internal authoring vocabulary, but make it explicitly internal. A private
authoring DSL is useful; leaking it into host wire formats is the defect.

| Layer | Accepted fields | Purpose |
|---|---|---|
| Authoring | Agent Skills fields plus `version`, `preamble-tier`, `activation`, `triggers`, `benefits-from`, `host-overrides` | Trove build inputs only |
| Spec projection | `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` | Codex, OpenCode, Gemini, uploads, and any strict Agent Skills consumer |
| Claude projection | Spec fields plus documented Claude fields such as `paths`, `when_to_use`, invocation controls, `context`, `model`, and `hooks` | Claude Code plugin/standalone delivery |
| Cursor projection | `name`, `description`, `paths`, `disable-model-invocation`, `icon`, `color`, `metadata` | Cursor native skills |

Projection rules:

1. Map `activation.globs` to `paths` for Claude and Cursor.
2. Map `triggers` to Claude `when_to_use`; for strict projections, fold concise trigger
   language into `description` and enforce the 1,024-character spec limit.
3. Preserve `user-invocable: false` only for Claude. Cursor has no equivalent; omission
   retains model invocation. Represent manual-only behavior separately and emit
   `disable-model-invocation: true` only when explicitly authored.
4. Put Trove metadata into `metadata` only when useful to a consumer, using string keys
   and string values. Do not serialize arrays or nested objects into a field the spec
   defines as `string -> string` without a documented encoding.
5. Validate skill names against `^[a-z0-9]+(-[a-z0-9]+)*$`, match them to the parent
   directory, and enforce description/compatibility limits.
6. Keep generated files deterministic and add one golden fixture per host before
   broadening the schema.

## 4. Throughput checkpoint

- **Blocking first step:** pin current projection behavior and introduce a typed
  authoring-to-output contract. Every later host change depends on it.
- **Independent workstreams:** after that contract lands, Claude/Cursor fixes, Gemini,
  OpenCode, manifest metadata, and dependency/content refreshes can proceed in parallel
  if they use disjoint fixtures and generated-output directories.
- **Shared mutable state:** `hosts/types.ts`, `scripts/lib/skill-parser.ts`,
  `scripts/gen-skills.ts`, generated plugin skill copies, and snapshots are shared.
  Serialize changes to those files; never run two build-producing branches in the same
  worktree.
- **Smallest safe decomposition:** seven checkpoints below. Each has a static and an
  artifact/runtime verification before the next begins.

## 5. Implementation checkpoints

### Checkpoint 1: Contract and regression harness

**Likely files:** `hosts/types.ts`, `scripts/lib/skill-parser.ts`, `scripts/schema.ts`,
`tests/projection.test.ts`, new per-host golden fixtures.

**Observable result:** the authoring schema and each host's emitted-field allowlist are
explicit; tests reproduce F1 and F2 before their fixes and assert current Codex output.

**Verify:** `bun test tests/projection.test.ts tests/p0-foundation.test.ts` and
`bun run build:skills -- --dry-run`.

### Checkpoint 2: Claude and Cursor behavior fixes

**Likely files:** `hosts/claude.ts`, `hosts/cursor.ts`, `scripts/gen-skills.ts`, projection
fixtures, affected generated `SKILL.md`/`.mdc` files.

**Observable result:** Claude emits `paths` for every declared glob; Cursor no longer
turns model-only skills into manual-only skills; no unrelated frontmatter changes.

**Verify:** projection golden tests, `bun run build`, `bun run validate`, and assertions
that Claude/Cursor path lists equal the `auto_attach.globs` inventory.

### Checkpoint 3: Strict Agent Skills projection and validators

**Decision (2026-08-28):** the blocking gate is an **in-repo validator written from the
published specification**. `skills-ref` is used only as an **advisory cross-check**, and
only as the vendored Python reference pinned to a reviewed commit. Rationale in F14: the
reference implementation self-declares as non-production, and the same-named npm package
has a different version and license and publishes no repository link, so pinning it would
not establish its provenance. The spec surface is small enough to own outright.

**Likely files:** `hosts/types.ts`, a new spec host/projection or shared projection
builder, `scripts/schema.ts`, `scripts/validate.ts`, `.github/workflows/validate.yml`.

**Observable result:** every strict artifact contains only the six standard fields;
internal fields never leak; schema length/name constraints fail with actionable errors.

**The gate implements exactly the published contract:**

| Rule | Constraint |
|---|---|
| `name` | required; 1–64 chars; `^[a-z0-9]+(-[a-z0-9]+)*$` (rejects leading/trailing and consecutive hyphens); must equal the parent directory name |
| `description` | required; 1–1024 chars; non-empty |
| `compatibility` | optional; ≤500 chars |
| `metadata` | optional; string keys to string values |
| `license`, `allowed-tools` | optional; `allowed-tools` is space-separated and marked experimental in the spec |
| any other key | **rejected** in the strict projection |

**Verify:** `bun run validate` with a negative-fixture suite covering each rule above
(over-length name, uppercase name, consecutive hyphens, name/directory mismatch,
1025-char description, non-string `metadata` value, leaked internal key). Run the
advisory `skills-ref` cross-check as a separate non-blocking CI step; a disagreement
between it and the in-repo gate is a signal to re-read the spec, not an automatic
failure. Record the pinned reference-tool commit and the spec revision the gate was
written from, so a spec change is a deliberate edit rather than silent drift.

### Checkpoint 4: Host delivery for Gemini, OpenCode, and setup

**Likely files:** `hosts/gemini.ts`, `hosts/opencode.ts`, `scripts/gen-skills.ts`,
`scripts/gen-plugins.ts`, `setup`, `tests/acceptance/**`.

**Observable result:** Gemini extensions expose the intended plugin skills on demand;
OpenCode output lands in a documented install/discovery layout; disposable-home tests
prove Claude, Cursor, and Codex setup discovery and determine whether F6 requires
flattening.

**Verify:** build artifacts plus host CLI listing/smoke tests where the CLI is available
(`gemini skills list`, OpenCode skill listing, Claude/Codex disposable-home checks).
When a CLI is unavailable in CI, validate structure and keep a documented manual gate.

### Checkpoint 5: Plugin and marketplace conformance

**Likely files:** `hosts/types.ts`, `scripts/gen-plugins.ts`,
`scripts/gen-marketplace.ts`, `marketplace.yaml`, generated manifests, CI.

**Observable result:** useful existing metadata reaches Claude and Codex manifests;
redundant version inputs cannot drift; commands remain until one-for-one migration tests
pass; optional experimental Claude surfaces remain out of scope.

**Verify:** `claude plugin validate <plugin-dir> --strict` for all six plugins,
JSON/schema fixtures for Codex manifests and marketplace policy, then a local
marketplace install smoke test for both hosts.

### Checkpoint 6: Dependencies, eval model, docs, and CI hygiene

**Likely files:** `package.json`, `bun.lock`, `scripts/eval-runner.ts`, `CLAUDE.md`,
`docs/skill-authoring.md`, `docs/plugin-authoring.md`, `docs/cross-platform.md`, CI.

**Observable result:** the SDK upgrade is isolated; TypeScript 7 is adopted only if the
repo and tooling pass (otherwise use the documented `@typescript/typescript6`
compatibility package, which ships a `tsc6` binary and re-exports the 6.0 API);
CI uses `bun ci`; the eval model change has before/after evidence; docs describe six
hosts and current commands.

**Eval model change is its own commit** and must handle F13 before any score comparison
is meaningful: on Sonnet 5 adaptive thinking is on by default and `max_tokens` caps
thinking plus output, so the hardcoded `max_tokens: 1024` at `scripts/eval-runner.ts:192`
can truncate the judge's JSON. Disable thinking or raise the cap, then confirm the JSON
parses on a sample before reading any score delta. Expect token counts, and therefore
cost per run, to move for reasons unrelated to quality: Sonnet 5's tokenizer emits ~30%
more tokens for the same text at $2/$10 per Mtok versus Sonnet 4.6's $3/$15.

**Verify:** `bun ci`, `bun test`, `bun run build`, `bun run validate`,
`bunx tsc --noEmit`, acceptance tests, and an eval comparison artifact recording both
scores and token usage. Do not combine SDK, TypeScript, and model changes in one commit.

### Checkpoint 7: Skill-content refresh

**Likely files:** `skills/**`, corresponding plugin copies generated by the build,
`evals/**`, provenance metadata from the upstream-sync plan.

**Observable result:** each skill is reviewed against its actual upstream or authoritative
technology docs, long bodies use progressive disclosure, and no unverified version/API
claim is added. Vendored skills sync before local editorial changes.

**Verify:** per-skill evals and sample execution, `bun run build`, `bun run validate`,
full tests, and a review record naming the source and verification date. Version-agnostic
workflow skills need behavioral evals, not arbitrary “current version” labels.

## 6. Scope and release gates

### Included

- F1–F14 as sequenced above;
- an in-repo Agent Skills validator as the blocking gate, plus `claude plugin validate`
  for Claude manifests and an advisory `skills-ref` cross-check;
- a host matrix recording discovery roots, supported fields, test method, source URL,
  and verification date;
- upstream provenance work described in the companion plan.

### Excluded from this cycle

- new skills or plugins;
- redesign of the three-stage build;
- adoption of every Claude experimental surface (`themes`, `monitors`, `channels`);
- automatic deletion of commands or upstream-removed files;
- automatic publication to public plugin directories.

### Release gates

1. Checkpoints 1–2 may ship as a behavior-fix release after the glob scope is reviewed.
2. Checkpoints 3–5 require cross-host acceptance evidence and should ship as a minor or
   major release according to installation-layout changes.
3. Checkpoints 6–7 land in small independent changes; content refreshes never block a
   critical projection fix.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Correcting Claude `paths` activates broad rules such as `**/*.py` for users who previously received no auto-attachment. | Review every glob, add positive/negative path tests, and call out the behavior change in release notes. |
| A universal “spec” output could discard useful host controls. | Keep separate strict, Claude, and Cursor projections; test the emitted fields per host. |
| Flattening setup links can collide with existing user skills. | Test first, detect collisions, never overwrite non-Trove entries, and record installed links for reversible cleanup. |
| TypeScript 7 can break tools that require the compiler API. | Search imports, run the complete suite, and use the TypeScript 6 compatibility package side-by-side if necessary. |
| Vendor docs change faster than this plan. | Store URL and `verified_at`; make the host-matrix check report drift without scraping prose into automatic code changes. |
| An in-repo validator drifts from the specification it was written against. | Record the spec revision in the validator source, keep the advisory `skills-ref` cross-check in CI as a non-blocking second opinion, and re-read the spec whenever the two disagree. |
| A same-named package of unestablished provenance is pulled into CI. | Never install a validator by bare name. Vendor the reviewed reference implementation at a pinned commit, or write the check in-repo. |
| A 51-skill refresh becomes an unreviewable rewrite. | Sync vendored sources first and land small skill groups with their eval evidence. |

## 8. Primary sources reviewed on 2026-08-28

All URLs below returned HTTP 200 when re-checked on 2026-08-28.

- [Agent Skills specification](https://agentskills.io/specification). Six-field
  frontmatter contract, naming/length rules, progressive disclosure, `skills-ref`.
- [Claude Code skills](https://code.claude.com/docs/en/skills). Covers `paths`,
  `when_to_use`, invocation semantics, upload restrictions, locations, symlinks.
  (`/docs/en/slash-commands` also resolves to this page; `/docs/en/skills` is canonical.)
- [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference) and
  [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces). Covers schemas, path
  merge behavior, version resolution, strict validation.
- [Cursor Agent Skills](https://cursor.com/docs/skills). Covers discovery roots, recursive
  grouping, supported frontmatter, and rule/command migration behavior.
- [OpenAI skill authoring](https://learn.chatgpt.com/docs/build-skills) and
  [plugin packaging](https://developers.openai.com/plugins/build/plugins). Covers Codex skill
  roots, `agents/openai.yaml`, `.codex-plugin/plugin.json`, and repo marketplace schema.
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/skills/) and
  [extensions](https://geminicli.com/docs/extensions/). Covers native/extension skills and
  discovery tiers.
- [OpenCode Agent Skills](https://opencode.ai/docs/skills/). Covers discovery roots and
  recognized frontmatter.
- [Anthropic model IDs](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)
  and [What's new in Claude Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5).
  Source of the drop-in `claude-sonnet-4-6` → `claude-sonnet-5` migration, adaptive
  thinking defaults, the `max_tokens` thinking-plus-output cap, tokenizer change, and
  pricing used in F9/F13.
- [TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
  and [Bun CI installs](https://bun.sh/docs/pm/cli/install). `bun ci` exists as an alias
  for `install --frozen-lockfile` from Bun 1.2.19.
- [`agentskills/agentskills` `skills-ref`](https://github.com/agentskills/agentskills/tree/main/skills-ref).
  Python, Apache-2.0, v0.1.0; README declares it demonstration-only. The npm `skills-ref`
  (v0.1.5, MIT, no repository field) is a distinct artifact of unestablished provenance.
  Basis for F14 and the Checkpoint 3 decision.

## Decision gate

The plan is concrete enough to execute checkpoint-by-checkpoint. Default recommendation:
approve Checkpoint 1, then review its golden fixtures before allowing behavior changes in
Checkpoint 2.

## 9. Implementation status — 2026-08-28

| Checkpoint | Status | Evidence |
|---|---|---|
| 1. Contract and regression harness | Done | `scripts/lib/projection.ts` (typed authoring contract + per-host allowlists), `scripts/lib/agent-skills-spec.ts`; `tests/agent-skills-spec.test.ts` (27 cases) |
| 2. Claude and Cursor behavior fixes | Done | F1 and F2 fixed; `tests/projection.test.ts` asserts the emitted `paths` equal the `auto_attach.globs` inventory in both directions, and that `user-invocable: false` alone never becomes manual-only |
| 3. Strict projection and validators | Done | Blocking in-repo gate in `bun run validate` (102 artifacts, `SPEC_REVISION` recorded); advisory `skills-ref` cross-check pinned at `f130f34`, `continue-on-error` in CI |
| 4. Gemini, OpenCode, and setup | Done | Gemini extensions bundle skills and declare required manifest fields; OpenCode and Gemini emit to `.agents/skills`; `tests/acceptance/setup-links.sh` (13 checks) confirms F6 and the flattened layout |
| 5. Plugin and marketplace conformance | Done | `claude plugin validate --strict` passes for all six plugins and the marketplace, wired into CI; `category`/`keywords` reach the manifests; F8 collapsed onto `VERSION`. Commands left in place per F7 — no migration tests exist yet, so nothing was deleted |
| 6. Dependencies, eval model, docs, CI | Done except the eval comparison | SDK 0.122, TypeScript 7 (no compiler-API imports; no compatibility package needed), `bun ci`, `docs/host-matrix.md`, six-host docs, `stan-*` fixtures renamed. **The before/after eval run has not been performed** — no `ANTHROPIC_API_KEY` was available. F13 is handled in code (adaptive thinking, 8192-token cap, an explicit failure on `stop_reason: "max_tokens"`, token usage recorded in `evals/results.json`); the comparison itself still needs `EVAL_MODEL=claude-sonnet-4-6 bun run eval:gate` and `EVAL_MODEL=claude-sonnet-5 bun run eval:gate` with a key |
| 7. Skill-content refresh | Not started | Gated on the companion upstream-sync plan ("vendored skills sync before local editorial changes") and on per-skill evals, which need an API key. Release gate 3 puts it in small independent changes that never block a projection fix |

### Findings resolved against the code

F1, F2, F3, F4, F5, F6, F8, F9, F10, F11, F12, F13, F14 are implemented. F7 is a
deliberate no-op: the disposition is "inventory behavior and migrate one-for-one before
deleting anything", and no migration tests exist, so all nine commands remain.

### Corrections to the plan found while implementing

- **The Gemini extension manifest was invalid, not merely thin.** F4 describes Gemini as
  receiving only `GEMINI.md`. The generated `gemini-extension.json` also omitted `name`,
  `version`, and `description`, all three of which the extension schema requires — so the
  extension declared nothing loadable, not just nothing on-demand.
- **`allowed-tools` cannot round-trip into a strict artifact.** The target contract in §3
  lists `allowed-tools` as a spec-projection field. The spec encodes it as a
  space-separated list, and Trove's authored patterns contain whitespace (`Bash(git *)`),
  so four skills were emitting corrupt two-token values. The field is now withheld from
  hosts that do not honor it, tracked by the existing `HostCapabilities` flag.
- **F6 is confirmed, and the documentation settles it without a runtime test.** Claude
  Code documents a personal skill at `~/.claude/skills/<skill-name>/SKILL.md`, and the
  reserved `synced` folder name confirms a subdirectory there is read as a skill
  directory. The disposable-home acceptance test was still written, and now guards the
  flattened layout, collision handling, and reversibility.
