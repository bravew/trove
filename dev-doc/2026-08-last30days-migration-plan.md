# Vendoring the last30days Research Skills (global + Chinese platforms)

**Status:** Approved; decisions recorded in §13. Implementation starts at Checkpoint 2 (§10).
**Reviewed:** 2026-08-28
**Repository baseline:** `main` at `2f9a093`, `VERSION` `2026.7.4`
**Upstream baselines:** `mvanhorn/last30days-skill` at
`a218edadbc3361672f5e5e2cd72a8212b0b3fbb8` (2026-08-26, `v3.21.1`), MIT ·
`Jesseovo/last30days-skill-cn` at `1a8a04c3c347defbcdbb8da26d7cf1a531426b1f`
(2026-07-20, `v3.2.0`), MIT fork of the former (§8)
**Companions:** [2026-08-upstream-sync-plan.md](./2026-08-upstream-sync-plan.md),
[2026-08-modernization-plan.md](./2026-08-modernization-plan.md)

This plan migrates two upstream Agent Skills into Trove as vendored, deterministically
synced artifacts — `trove-pulse` (global platforms) and `trove-pulse-cn` (Chinese
platforms), shipped as siblings in one `trove-research` plugin — and enrolls both in the
existing weekly `.github/workflows/upstream-sync.yml` job. §§1–7 and 9–14 are written
against the English artifact, which is the harder of the two; §8 covers the Chinese fork
and the ways it differs.

It is not a copy-paste import. The upstream package violates four Trove invariants as
shipped, and the sync engine currently refuses every path that is not `SKILL.md.tmpl` or
`references/**`. Those gaps are the bulk of the work; the skill content itself is the
smaller half.

## 1. What the upstream package actually is

Measured on the clone in `_sample/last30days-skill` at `a218eda`.

| Property | Value | Consequence for Trove |
|---|---|---|
| License | MIT, top-level `LICENSE` **and** `license: MIT` in `skills/last30days/SKILL.md` frontmatter | Vendorable. `upstream-sync.ts` reads the license from the selected `SKILL.md` frontmatter, so the guard works unchanged. |
| Shape | One skill directory: `skills/last30days/{SKILL.md, scripts/**, references/**, assets/**, agents/**}` | Maps onto one Trove skill directory. |
| `SKILL.md` | 2,296 lines / 229,438 bytes (~57k tokens) | **Blocks.** `scripts/lib/skill-budget.ts` errors above 500 body lines and ~5,000 body tokens. Also 88% of `maximum_file_bytes` (262,144). |
| Engine | 100 Python files, `scripts/` = 2.4 MB | **Blocks.** `transformSelection`, `walkLocal`, and `patchEntries` in `scripts/lib/upstream-sync.ts` reject any path outside `SKILL.md.tmpl` / `references/`. |
| Python deps | **None.** Every import resolves to the stdlib or `lib.*` (`typing`, `urllib`, `json`, `sqlite3`, `concurrent.futures`, …). `pyproject.toml` declares `dependencies = []` | No package installation, no lockfile, no virtualenv to ship. This is what makes vendoring viable. |
| Python floor | 3.12+, with an automatic `uv`-managed 3.12 fallback when the host has no system 3.12 | Documentable prerequisite; no Trove build dependency. |
| Node | Optional. Vendored X client `scripts/lib/vendor/bird-search` (MIT, 116 KB, `engines.node >= 22`) | Optional runtime prerequisite; vendored, not fetched. |
| Other binaries | Optional: `yt-dlp` (YouTube), `digg-pp-cli` (Digg), macOS `security` / `pass` (credential storage) | All gated behind `shutil.which` on the agent subprocess PATH. |
| Credentials | All optional. 25 env names in `scripts/lib/env.py`; `SCRAPECREATORS_API_KEY` is primary; keyless Reddit/HN/web paths work with zero keys | Ship key-free by default; never require a key to install. |
| Binary / generated files | None under `scripts/` or `references/`. All binaries are in `assets/` (14 MB of demo media) | Exclude `assets/` and `agents/`; the remaining selection passes `allowBinary: false` and the generated-file heuristic. |
| Churn | 263 commits in the last 60 days; releases roughly weekly (`v3.21.1` … `v3.18.1`) | The weekly check will report `update-available` most weeks. Local modifications must be near-zero or every sync conflicts. |
| Not vendored | `mcp/` (Go MCP server), `tests/` (89 pytest files), `assets/`, `agents/openai.yaml`, `.grok-plugin/`, translated READMEs | Record in `upstream.yaml` `not_vendored` and `THIRD_PARTY.md`. |

Two upstream design facts shape everything below:

1. **The engine is the product's memory; `SKILL.md` is its instruction manual.** The
   2,296-line `SKILL.md` is a runtime spec the model reads in full — invocation contract,
   query planning, pre-flight resolution, output laws. It is not padding, and slimming it
   by hand would fork the project.
2. **`SKILL.md` and `scripts/` are always siblings.** Every install layout upstream
   supports relies on that, and Trove's layout satisfies it (`gen-skills.ts` `SUPPORT_DIRS`
   already copies `scripts/`, and `gen-plugins.ts` copies it into plugin bundles).

## 2. Outcome

- Two vendored skills in one `trove-research` plugin, installable through `./setup` on every
  host Trove supports, each runnable with **zero API keys and zero package installs** on a
  machine with Python (3.12+ for `trove-pulse`, 3.9+ for `trove-pulse-cn`).
- Provenance, license, selection, and lock state recorded in `upstream.yaml`, verifiable
  offline.
- The existing weekly workflow reports upstream drift for this artifact with no workflow
  edits, and the gated one-artifact updater can open its update PR.
- Trove's authored surface stays inside Trove's budgets; the upstream 57k-token spec is
  loaded on demand, not on every session.

### 2.1 Rules this plan holds to

These are Trove's existing conventions, restated as the constraints this migration is
judged against. Every design choice below traces to one of them; a proposal that needs an
exception needs a decision, not a workaround.

1. **No model in the merge path.** Upstream bytes enter through
   `scripts/lib/upstream-sync.ts` only — selected, transformed, patch-replayed, digest-
   verified. Nothing is hand-copied, and no agent decides what to import. If the checked-in
   tree does not equal `replay(base) + patches`, the import is wrong.
2. **Fail closed.** Size caps, binary and generated-file rejection, symlink and traversal
   rejection, license mismatch, patch conflict — each stops the sync before a write. Widen a
   limit only with a recorded rationale in `upstream.yaml`; never to make a red run green.
3. **Minimize the local patch surface.** `patches: []` is the target for a fast-moving
   upstream. Local intent belongs in Trove-authored files (a wrapper, the plugin manifest,
   the docs), not in edits to vendored bytes. A growing patch set is the early signal of a
   fork.
4. **Author once, project per host.** Frontmatter is rebuilt from the authoring contract
   through `scripts/lib/projection.ts` allowlists. No host-specific field is hand-written
   into a skill, and no authoring-private key (`preamble-tier`, `activation`, `triggers`,
   `benefits-from`) may reach a generated artifact.
5. **Respect the budgets.** 500 body lines and ~5,000 body tokens are errors, not
   guidelines. Content that does not fit moves into `references/` for on-demand loading.
   Exempting one skill makes the budget advisory for all of them.
6. **Earn activation.** No `auto_attach.globs` on a skill that runs a network research
   engine. It is `user-invocable`, discovered by description and triggers, and costs one
   index line when idle.
7. **Consent before local data.** Reading cookies, browser profiles, or repo-local config
   is opt-in, defaulted off, and surfaced through the documented Decision Gate format —
   never a silent capability of the first run.
8. **Provenance is a file, not a memory.** `upstream.yaml` records source, revision,
   selection, and lock; `THIRD_PARTY.md` records attribution in prose, including a fork
   chain where one exists.
9. **Tests precede engine changes.** Each change to the sync engine lands with tests for
   both the accepted and the rejected case, in `tests/upstream-sync.test.ts`.
10. **A sync is accepted, not merged.** Bytes updating is necessary and not sufficient —
    §11 defines what else must be true before an update PR lands.

## 3. Naming

Upstream's name `last30days` is a good product name and a poor Trove skill name: it
describes a time window rather than the job, and it carries no `trove-` prefix (required by
`docs/skill-authoring.md` for flat-namespace hosts).

| Candidate | Slash form | Read |
|---|---|---|
| **`trove-pulse`** (recommended) | `/trove-research:trove-pulse` | Short, memorable, verb-adjacent ("take the pulse"). Time window belongs in the description, where it can change without a rename. |
| `trove-last30days` | `/trove-research:trove-last30days` | Maximum continuity with upstream and its docs; awkward, and wrong the day upstream adds a window flag. |
| `trove-signal-scan` | `/trove-research:trove-signal-scan` | Descriptive, slightly generic against `trove-secret-scan`. |
| `trove-recon` | `/trove-research:trove-recon` | Reads as security reconnaissance. Rejected. |

**Chosen: `trove-pulse`**, with discovery carried by `triggers:` — `last 30 days`,
`what are people saying`, `social research`, `trend check` — and the upstream name kept in
`description` and `metadata.source` so a user searching "last30days" still finds it. The
maintainer confirmed this name on 2026-08-28 (§13); every identifier below uses it.

The Chinese sibling takes the same stem: **`trove-pulse-cn`** — the `-cn` suffix is the
convention a reader can extend to a future locale without renaming anything (§8.2).

Plugin: a new **`trove-research`** plugin (confirmed, §13) (`category: research`, `roles: [pm, dev]`).
No existing plugin fits — this is neither a coding convention (`trove-dev`) nor a delivery
methodology (`trove-workflow`) — and a dedicated plugin lets a user install the research
lane alone.

## 4. Architecture: two import shapes, one plugin

### 4.1 Choosing the import shape

Both artifacts are vendored engines with an upstream-authored spec. They differ in two
measurements, and those two measurements — not taste — pick the shape:

| Measurement | Direct import (`SKILL.md` → `SKILL.md.tmpl`) | Wrapper + `references/runtime-spec.md` |
|---|---|---|
| Upstream spec fits the 500-line / 5k-token budget | required | not required |
| Upstream churn | low enough that a small patch survives | high; any patch on the spec conflicts |
| Local patch surface | a few lines of frontmatter | one added file, `patches: []` |
| Sync lock coverage | the whole local tree | everything except the wrapper (`local_only`) |
| Cost at runtime | none | one extra `Read` before the first engine call |

`trove-pulse-cn` takes the **direct** shape: 159-line spec, 10 commits per 90 days (§8).
`trove-pulse` takes the **wrapper** shape: 2,296-line spec, 263 commits per 60 days.
The rule generalizes to the next vendored skill, and is the reason this plan does not force
one shape onto both.

### 4.2 The wrapper shape, in detail (`trove-pulse`)

```
skills/research/trove-pulse/
  SKILL.md.tmpl              ← Trove-authored, ≤500 lines, local-only (not upstream)
  SKILL.md                   ← generated for Claude by build:skills
  references/
    runtime-spec.md          ← vendored: upstream SKILL.md, path-mapped
    save-html-brief.md       ← vendored verbatim
  scripts/                   ← vendored engine (2.4 MB, stdlib-only Python + node client)
```

The wrapper is what the host loads. It carries the Trove preamble, the frontmatter Trove
projects per host, the prerequisite check, the key-free default, and one instruction:
read `references/runtime-spec.md` before executing, and treat it as authoritative for
engine behavior. Everything under `references/` and `scripts/` is upstream bytes.

Why this shape and not the alternatives:

- **Verbatim import of upstream `SKILL.md` as our `SKILL.md.tmpl`** fails
  `validateSkillBudget` (2,296 lines vs. a 500-line error) and would put 57k tokens into
  every host's skill surface. Suppressing the budget for one skill would make the budget
  advisory for all of them.
- **Hand-splitting the upstream spec into Trove-sized reference files** produces a
  0.5–2 MB local diff against a repository landing ~4 commits a day. Every weekly sync
  would conflict, and the artifact would be dead within a month.
- **Path-mapping the spec into `references/` and authoring a small wrapper** keeps the
  local diff at *one added file*. Upstream can rewrite its spec freely; our patch surface
  does not move.

Trade-off, stated plainly: a Claude session pays one extra `Read` before the first engine
call, and the wrapper must stay honest about which sections of the vendored spec Trove
overrides (§6.3). That is the cost of a sync that survives upstream's velocity.

## 5. Required engine changes

Ordered by dependency. Each is small, each needs a test in `tests/upstream-sync.test.ts`,
and each is independently reviewable.

### E1 — Allow `scripts/**` in canonical artifact content (P0)

`scripts/lib/upstream-sync.ts` hard-codes the canonical path predicate in four places:
`transformSelection` (the post-`path_map` guard), `walkLocal` (local tree walk),
`patchEntries` (twice, over `diff --git` and `---`/`+++` headers).

Extract one predicate and widen it:

```ts
const CANONICAL_PREFIXES = ["references/", "scripts/"] as const;
export function isCanonicalArtifactPath(candidate: string): boolean {
  return candidate === "SKILL.md.tmpl" ||
    CANONICAL_PREFIXES.some((prefix) => candidate.startsWith(prefix));
}
```

Keep every other guard exactly as is: symlink rejection, `..`/absolute rejection, mode
restricted to `100644`/`100755`, binary rejection, generated-file rejection, size caps.
`writeEntries` already honors `100755`, so upstream execute bits survive; the selection
below contains no executable files, and a test should assert both modes round-trip.

Tests: a selection containing `scripts/lib/x.py` round-trips through
`transformSelection` → `writeEntries` → `walkLocal` with a stable digest; a patch touching
`scripts/**` applies; a path outside the prefixes still throws; a `120000` mode still throws.

### E2 — Local-only paths (P0)

The wrapper `SKILL.md.tmpl` is Trove-authored and will be edited often, but `walkLocal`
feeds every local file into `local_tree_digest` and `checkOnlineArtifact` requires the
local tree to equal `replay(base) + patches` byte for byte. Two ways to satisfy that:

- **(a) `local_only` selection (recommended).** Add an optional artifact key,
  `local_only: [SKILL.md.tmpl]`, of the same restricted pattern grammar as `include`.
  `walkLocal` still validates path safety and file type for those files but omits them from
  the digest and from the reconstruction comparison. The wrapper is then a normal file that
  anyone can edit, and drift in it is caught by `bun run validate` / `bun test` like any
  other skill.
- **(b) Wrapper delivered by patch.** No engine change: `upstream-patches/trove-pulse/local.patch`
  creates `SKILL.md.tmpl` as a pure addition, which cannot conflict. Rejected as the primary
  path because editing a 400-line skill through a patch file is hostile to authors and
  invites patch/worktree divergence.

Choose (a). Record in the manifest docs that `local_only` content is outside the sync lock
and inside the ordinary build/validate gates.

### E3 — `replace-literal` transform (P0 for the CN artifact, P1 for EN)

The vendored spec refers to itself as `/last30days` and to `last30days` install paths
throughout. `rename-skill` only rewrites `SKILL.md.tmpl`, which this artifact does not
receive from upstream. Add a third transform kind:

```yaml
- kind: replace-literal
  path: references/runtime-spec.md
  from: "/last30days"
  to: "/trove-research:trove-pulse"
  minimum_occurrences: 1
```

Deterministic, asserts a hit (so a silent upstream rename fails the sync instead of
producing wrong text), and scoped to one mapped path. The CN artifact cannot be imported
without it: its `SKILL.md` carries `{{SKILL_DIR}}` / `{{USER_TOPIC}}` placeholders that
collide with Trove's template resolver, and invokes `python` rather than `python3` (§8.3). Keep the replacement list short —
every entry is a thing that can break. Start with the slash-command form only, and let the
wrapper explain the rest (§6.3).

### E4 — Per-artifact policy overrides (P1)

`policy` in `upstream.yaml` is global: `maximum_file_bytes: 262144`,
`maximum_artifact_bytes: 4194304`. This artifact measures **229,438 bytes** for the spec
(88% of the file cap) and **~2.6 MB** for the whole selection (63% of the artifact cap),
both of which grow weekly. Raising the globals would weaken the guard for the three Vercel
artifacts, which are two orders of magnitude smaller.

Add an optional per-artifact `policy:` block, strict-keyed like the rest of the schema:

```yaml
policy:
  maximum_file_bytes: 524288
  maximum_artifact_bytes: 8388608
```

`validateEntries` takes the effective policy (artifact override, else manifest default).
Overrides may only be recorded with a rationale comment; a test asserts an override cannot
*lower* a limit into a silent skip and that omitting the block preserves today's behavior.

### E5 — Secret scanning over vendored scripts (P2)

`scanForSecrets` in `scripts/validate.ts` runs only on `SKILL.md*` and `plugin.yaml`.
We are about to vendor 100 Python files that handle cookies and API keys. A dry run of the
current `SECRET_PATTERNS` over `skills/last30days/{scripts,references,SKILL.md}` at `a218eda`
returns **zero matches**, so enabling the scan costs nothing today and catches a bad upstream
day later. Extend the walk to `scripts/**` inside skill directories; keep the code-fence
stripping for Markdown and apply raw matching to `.py`/`.js`/`.mjs`.

## 6. Vendoring specification: `trove-pulse` (wrapper shape)

### 6.1 `upstream.yaml` source and artifact

```yaml
  - id: last30days-skill
    repository: https://github.com/mvanhorn/last30days-skill.git
    ref: main
    license:
      expression: MIT
      evidence: LICENSE          # also declared per-skill in skills/last30days/SKILL.md
    artifacts:
      - id: trove-pulse
        upstream_path: skills/last30days
        local_path: skills/research/trove-pulse
        base_sha: a218edadbc3361672f5e5e2cd72a8212b0b3fbb8
        # base_tree_digest / local_tree_digest / patch_digest: computed at import (Checkpoint 5)
        include:
          - SKILL.md
          - references/**
          - scripts/**
        exclude:
          - scripts/build-skill.sh
          - scripts/compare.sh
          - scripts/test-v1-vs-v2.sh
          - scripts/setup-pass.sh
          - scripts/setup-keychain.sh
          - scripts/evaluate_search_quality.py
          - scripts/test_device_auth.py
          - scripts/verify_v3.py
        path_map:
          SKILL.md: references/runtime-spec.md
        local_only:
          - SKILL.md.tmpl
        transforms:
          - kind: replace-literal
            path: references/runtime-spec.md
            from: "/last30days"
            to: "/trove-research:trove-pulse"
            minimum_occurrences: 1
        policy:
          maximum_file_bytes: 524288
          maximum_artifact_bytes: 8388608
        patches: []
        status: active
```

Notes on the selection:

- `assets/**` (14 MB of demo media) and `agents/openai.yaml` are outside `include`, so they
  never enter the tree. This is what keeps `allow_binary: false` satisfiable.
- The eight excluded scripts are upstream's dev/eval/keychain helpers — the same set
  upstream's own `.skillignore` keeps out of install-time scans. They are also the only
  files carrying an execute bit.
- `scripts/lib/vendor/bird-search/**` **is** included: it is the X search client, MIT, 116 KB,
  and the skill degrades without it.
- No `inject-preamble` transform: the wrapper carries `{{PREAMBLE}}` itself.
- `patches: []` is the goal state and the health metric. If this list grows, the artifact is
  drifting toward the fork this design exists to avoid.

Also add to `upstream.yaml`:

```yaml
skills:
  - { local_path: skills/research/trove-pulse, origin: adapted, source_id: last30days-skill,
      upstream_path: skills/last30days, evidence_sha: a218edadbc3361672f5e5e2cd72a8212b0b3fbb8 }

not_vendored:
  last30days-skill: [mcp, tests, assets, agents, .grok-plugin, translated-readmes]
```

`tests/upstream-sync.test.ts` already asserts the manifest covers every canonical template,
so this entry is mandatory, not optional bookkeeping.

### 6.2 Wrapper frontmatter

```yaml
---
name: trove-pulse
description: |
  Research what people actually said about a topic in the last 30 days across Reddit, X,
  YouTube, Hacker News, GitHub, Polymarket, and the web, ranked by real engagement rather
  than editorial pick. Use for market and competitor checks, sentiment reads, launch
  reception, and "what changed recently" questions.
preamble-tier: 2
user-invocable: true
triggers:
  - last 30 days
  - what are people saying
  - social research
  - trend check
allowed-tools: [Bash, Read, Write, WebSearch, AskUserQuestion]
license: MIT
metadata:
  source: mvanhorn/last30days-skill
  upstream-version: "3.21.1"
---
```

Projection check against `scripts/lib/projection.ts`: `strict` hosts (Codex, OpenCode,
Gemini, AGENTS.md) receive `name`, `description`, `license`, `allowed-tools`, `metadata`;
Claude additionally receives `when_to_use` (folded from `triggers`) and `user-invocable`;
Cursor receives its own narrower set. No authoring-private key leaks. Verify
`description` + `when_to_use` stays under 1,536 characters — the draft above is close to
the limit and must be measured, not eyeballed.

`argument-hint` is not in the Claude allowlist as a derived field; if the maintainer wants
upstream's hint text, reach it through `host-overrides.claude`, not by widening the profile.

### 6.3 Wrapper body (outline, ≤500 lines / ~5,000 tokens)

1. **What this is** — one paragraph, plus the fact that the engine is vendored upstream and
   synced weekly.
2. **Prerequisites and preflight** — `python3 --version` ≥ 3.12 (with the `uv` fallback
   note); optional `node` ≥ 22 for X; optional `yt-dlp`; the exact `--doctor` command to
   diagnose a broken source. State plainly: **no keys required**, and no `pip install`.
3. **Invocation** — the canonical `python3 ${CLAUDE_SKILL_DIR}/scripts/last30days.py "<topic>"`
   form. `${CLAUDE_SKILL_DIR}` is rewritten to `[skill-dir]` for Cursor and Codex by the
   existing `contentRewrites`; the wrapper must therefore also state the resolution rule in
   words, because those hosts get a placeholder rather than a variable.
4. **Read the spec** — load `references/runtime-spec.md` before the first engine call; it is
   authoritative for flags, query planning, and the output contract.
5. **Trove overrides** — the short, explicit list of vendored-spec sections Trove supersedes:
   the stale-clone self-check and cache-layout probing (Trove installs through `./setup`,
   not `npx skills add`), the `/last30days` invocation name, and upstream's install
   instructions. Everything else in the spec stands.
6. **Configuration** — precedence (`flag > env > ~/.config/last30days/.env > defaults`),
   the keyless baseline, and the optional keys worth adding first
   (`SCRAPECREATORS_API_KEY`, then `AUTH_TOKEN`/`CT0` for X). Point at
   `docs/user-config.md` for where Trove expects user secrets to live.
7. **Decision Gate: first-run setup** — in Trove's documented gate format, since upstream's
   consent-driven onboarding asks to read browser cookies. Default: skip cookie access;
   run keyless.
8. **Failure modes** — Python too old, `node` missing (X silently degrades), rate limits,
   empty result sets.

### 6.4 Plugin and marketplace wiring

- `plugins/trove-research/plugin.yaml`: one skill entry, `platforms: [claude, cursor, codex,
  agents, gemini, opencode]`, **no `auto_attach.globs`** — this skill must never fire from a
  file open. No hooks, no MCP, no agents.
- `marketplace.yaml`: new plugin block, `category: research`, `roles: [pm, dev]`,
  tags `[research, reddit, trends, social, competitive-analysis]`.
- `bun run scaffold:plugin -- --name trove-research --role pm` first; hand-edit after.
- `deps.json` is generated — do not edit. `benefits-from:` on the wrapper stays empty unless
  a real pairing exists.
- Confirm `./setup --role pm` and `--role dev` both install it, and that `bin/trove search
  "research"` surfaces it from the regenerated `catalog.json`.

## 7. Environment and dependency findings: `trove-pulse`

What a user must have, and what they can skip. All verified against the clone.

**Required**

- `python3` ≥ 3.12. Stdlib only — `urllib.request` for HTTP, `sqlite3` for the local store,
  `concurrent.futures` for fan-out. No `requests`, no `httpx`, no virtualenv, no lockfile.
  Trove ships no Python tooling and gains no Python build step.
- Network egress from the agent's Bash subprocess.
- A host that grants the skill `Bash` (and `Write`, for saved briefs).

**Optional, feature-gated by `shutil.which` on the agent subprocess PATH**

- `node` ≥ 22 → X/Twitter search via the vendored `bird-search` client. Absent: X is skipped.
- `yt-dlp` → YouTube transcripts and comments.
- `digg-pp-cli` → Digg. Upstream installs it via `@mvanhorn/printing-press-library` into
  `$HOME/.local/bin`; several agent gateways do not have that directory on PATH, so a binary
  can exist on disk and still be inactive. The wrapper's preflight must report PATH
  visibility, not file existence.
- macOS `security` / `pass` → credential storage instead of a plaintext `.env`.

**Credentials — every one optional**

`SCRAPECREATORS_API_KEY` (primary; TikTok/Instagram/Threads/Pinterest, free tier available),
`AUTH_TOKEN` + `CT0` (X cookies), `BSKY_HANDLE` + `BSKY_APP_PASSWORD`, `GITHUB_TOKEN`
(raises the unauthenticated rate limit), and LLM/search backends
(`OPENAI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `PERPLEXITY_API_KEY`,
`PARALLEL_API_KEY`, `BRAVE_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`, `APIFY_API_TOKEN`,
`BRIGHTDATA_API_KEY`, `XQUIK_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`,
`TRUTHSOCIAL_TOKEN`, `XIAOHONGSHU_API_BASE`). Behavior knobs:
`LAST30DAYS_MEMORY_DIR`/`LAST30DAYS_STORE`, `INCLUDE_SOURCES`,
`LAST30DAYS_KEYCHAIN_ALIASES`, `LAST30DAYS_PASS_PREFIX`,
`LAST30DAYS_TRUST_PROJECT_CONFIG`.

Precedence: per-run flag > process env > `~/.config/last30days/.env` (mode 0600) > defaults.

**Security posture to state in the docs, not bury**

- The skill can read browser cookies to authenticate X, and on macOS that needs Full Disk
  Access. Trove must surface this as an explicit consent step (§6.3 item 7), defaulting to
  off — it is the single most invasive thing this skill can do.
- Trove's `.env` guidance must not conflict with upstream's `~/.config/last30days/.env`.
  Document upstream's location as the source of truth for this skill.
- `LAST30DAYS_TRUST_PROJECT_CONFIG` opts into reading repo-local config; leave it unset and
  say why (a cloned repo could otherwise carry config the user did not write).
- The engine executes vendored JavaScript through `node`. That is 116 KB of third-party code
  entering Trove; it must be named in `THIRD_PARTY.md` and re-reviewed on any sync whose
  `changed_paths` touch `scripts/lib/vendor/**`.

## 8. The Chinese-platform variant: `trove-pulse-cn`

`_sample/last30days-skill-cn` (`Jesseovo/last30days-skill-cn`, `1a8a04c`, 2026-07-20,
release `v3.2.0`) is a Chinese-localization **fork** of the same project — MIT, with the
license file naming both copyright holders and the fork relationship explicitly. It is not
a translation: the engine was rewritten around eight Chinese platforms (Weibo, Xiaohongshu,
Bilibili, Zhihu, Douyin, WeChat public accounts, Baidu, Toutiao) with its own 24-module
`lib/`, its own scoring, and its own HTML report.

### 8.1 Measured profile, against the English artifact

| Property | `last30days-skill` (EN) | `last30days-skill-cn` |
|---|---|---|
| `SKILL.md` | 2,296 lines / 229 KB | **159 lines / ~7 KB** — fits Trove's 500-line, 5k-token budget as-is |
| Engine | 100 files / 2.4 MB | 31 files / 352 KB; largest file 42 KB |
| Python floor | 3.12+ | **3.9+** (CI matrix: ubuntu + windows × 3.9, 3.12) |
| Python deps | none | none required; **optional pip**: `jieba` (better CJK segmentation), `playwright` + chromium (browser crawler mode) |
| Other binaries | `node` ≥22, `yt-dlp`, `digg-pp-cli` | none |
| Churn | 263 commits / 60 days | **10 commits / 90 days**; last commit 2026-07-20 |
| Layout | one skill dir | root `SKILL.md` + `scripts/` are the source of truth; `skills/last30days/` is the installable payload built by `scripts/build_payload.py`. Verified byte-identical at `1a8a04c`. |
| Binaries / generated markers in the payload | none | none |
| Credentials | 25 optional names | 13 optional: `WEIBO_ACCESS_TOKEN`, `ZHIHU_COOKIE`, `TIKHUB_API_KEY`, `DOUYIN_API_KEY`, `WECHAT_API_KEY`, `TOUTIAO_API_KEY`, `BAIDU_API_KEY`/`BAIDU_SECRET_KEY`, `SCRAPECREATORS_API_KEY`, `XIAOHONGSHU_API_BASE`, `LAST30DAYS_CN_CONFIG_DIR` |

### 8.2 Same plugin, sibling skill

**Ship it as a second skill inside `trove-research`: `trove-pulse` and `trove-pulse-cn`.**

Rejected alternatives, with the reason each fails:

- **One skill with a `--locale` / `--cn` flag.** These are two independent codebases with
  disjoint source coverage, different Python floors, different optional dependencies, and
  maintainers who do not coordinate releases. Presenting them as one skill means Trove
  writes and maintains the dispatcher — a third codebase, and a fork of both upstreams in
  everything but name. It also destroys the sync model: one skill directory cannot have two
  upstream artifacts.
- **A separate `trove-research-cn` plugin.** Trove's plugins are install units organized by
  *role*, not by locale (`dev`, `design`, `pm`, `devops`). A user researching a market wants
  both lanes present and to pick per question; two plugins means two installs for one job.
  The idle cost of the extra skill is one description line in the host's skill index — it
  has no `auto_attach.globs` and never fires on its own. That cost does not justify a
  second install surface.
- **Vendor CN and drop EN** (or the reverse). Coverage is disjoint. A China-market question
  answered from Reddit and X is wrong in a way the user cannot see.

Disambiguation between the siblings is carried by description and triggers, not by the
model guessing:

- `trove-pulse` — global/English-language platforms. Triggers: `last 30 days`,
  `what are people saying`, `social research`, `trend check`.
- `trove-pulse-cn` — Chinese platforms. Triggers: `中文平台舆情`, `微博 小红书 知乎`,
  `chinese social research`, `china market sentiment`.

Each wrapper body states in one line when to hand off to the other. Do **not** wire them
together with `benefits-from` — a mutual pairing is a cycle, which `bun run validate`
reports as a warning and `gen-deps.ts` renders ambiguously. Prose is the right tool here.

### 8.3 Vendoring specification: `trove-pulse-cn` (direct shape)

The CN artifact is materially easier than the EN one and takes the **Vercel-style direct
import**, not the wrapper indirection:

```yaml
  - id: last30days-skill-cn
    repository: https://github.com/Jesseovo/last30days-skill-cn.git
    ref: main
    license:
      expression: MIT
      evidence: LICENSE          # names both copyright holders and the fork relationship
    artifacts:
      - id: trove-pulse-cn
        upstream_path: skills/last30days      # the installable payload; byte-identical to the root source of truth
        local_path: skills/research/trove-pulse-cn
        base_sha: 1a8a04c3c347defbcdbb8da26d7cf1a531426b1f
        include:
          - SKILL.md
          - scripts/**
        exclude: []
        path_map:
          SKILL.md: SKILL.md.tmpl
        transforms:
          - kind: rename-skill
            from: last30days-cn
            to: trove-pulse-cn
          - kind: inject-preamble
            marker: "{{PREAMBLE}}"
          - kind: replace-literal
            path: SKILL.md.tmpl
            from: "python {{SKILL_DIR}}"
            to: "python3 ${CLAUDE_SKILL_DIR}"
            minimum_occurrences: 10
          - kind: replace-literal
            path: SKILL.md.tmpl
            from: "{{USER_TOPIC}}"
            to: "<topic>"
            minimum_occurrences: 1
        patches:
          - upstream-patches/trove-pulse-cn/local.patch   # triggers, preamble-tier, sibling pointer
        status: active
```

Because the spec fits Trove's budget, CN needs **no wrapper, no `local_only`, and no policy
override**. Its whole tree stays inside the sync lock — a stronger guarantee than the EN
artifact gets, and affordable precisely because upstream moves slowly.

Three CN-specific findings that would each have broken a naive import:

1. **`{{SKILL_DIR}}` and `{{USER_TOPIC}}` collide with Trove's template resolver.** The
   upstream `SKILL.md` uses `{{...}}` placeholders its own harness substitutes. Trove's
   `scripts/resolvers/index.ts` does not know them, and `scripts/validate.ts` errors on any
   unresolved `{{...}}` left in a generated `.md`. This makes the `replace-literal`
   transform (E3) **required for CN**, not optional — and it is exactly the right fix,
   because `${CLAUDE_SKILL_DIR}` is already rewritten per host by `contentRewrites`.
2. **`python`, not `python3`.** The repository is Windows-developed and its `SKILL.md`
   invokes `python`, which does not exist on a stock macOS or most Linux images. The same
   transform corrects it. Assert the occurrence count so a silent upstream rewrite fails
   the sync instead of shipping a broken command.
3. **The vendored directory is a generated payload.** `build_payload.py` produces
   `skills/last30days/` from the root tree; the two are byte-identical at `1a8a04c`, and the
   payload carries no `@generated` / `do not edit` header (so `allow_generated: false`
   passes today). If upstream ever stamps one, the sync fails closed and the answer is to
   vendor from the root tree — which needs `upstream_path` support for the repository root,
   an engine change `readGitSelection` does not have today. Record this as a known
   follow-up rather than pre-building it.

### 8.4 Environment and dependencies

- **Required:** `python3` ≥ 3.9. Stdlib only. No pip install to run.
- **Optional, pip:** `jieba` (better Chinese segmentation; without it the engine falls back
  to CJK bigrams) and `playwright` + `python -m playwright install chromium` (browser
  crawler mode for platforms needing rendered or logged-in pages). Both are real installs
  into the user's environment — the wrapper must present them as opt-in enhancements with
  the exact commands, never as setup steps, and `--diagnose` reports which are active.
- **Optional credentials:** the 13 names in §8.1. `ZHIHU_COOKIE` is a session cookie the
  user pastes; treat it with the same consent discipline as the EN skill's cookie reading —
  documented, never auto-collected.
- **Shared names with the EN skill:** `SCRAPECREATORS_API_KEY` and `XIAOHONGSHU_API_BASE`
  are read by both engines; config directories are separate
  (`LAST30DAYS_CN_CONFIG_DIR` / `LAST30DAYS_CONFIG_DIR` vs. the EN skill's
  `~/.config/last30days/.env`). `docs/user-config.md` must state which skill reads which,
  or a user will set a key in the wrong place and conclude the skill is broken.
- **Health check:** `python3 ${CLAUDE_SKILL_DIR}/scripts/last30days.py --diagnose`.

### 8.5 Attribution

`THIRD_PARTY.md` records the chain, not just the immediate source: `trove-pulse-cn` is
adapted from `Jesseovo/last30days-skill-cn`, itself an MIT fork of
`mvanhorn/last30days-skill`, and the upstream `LICENSE` naming both authors is preserved
verbatim in the vendored tree. `upstream.yaml` gets its own `not_vendored` entry for
`assets/`, `tests/`, `fixtures/`, `hooks/`, `agents/`, and the root development copies.

### 8.6 Sequencing: land CN first

CN needs only **E1** (allow `scripts/**`) and **E3** (`replace-literal`). It needs no
`local_only` (E2), no policy override (E4), and its 352 KB / 31-file tree is small enough to
review by hand. EN needs all five.

So import CN first, as the proving ground for the engine changes: a full sync round-trip —
import, offline check, live run, dispatched update — on an artifact where a mistake is
cheap and legible. Then import EN with E2 and E4 on top. This inverts the original
checkpoint order and is the main change §10 absorbs.

CN-specific risks: the fork is one maintainer and five weeks stale, so a stall is plausible
— the artifact holds at its pinned SHA and keeps working, which is the correct failure mode;
anti-scraping breakage on Chinese platforms is upstream's problem to fix and shows up as a
`--diagnose` failure, not a Trove one; and if the fork diverges from MIT or the license file
changes, `checkOnlineArtifact` returns `license-changed` and writes nothing.

## 9. Repository impact

| Effect | Measure | Assessment |
|---|---|---|
| Repo size | +~2.6 MB (`trove-pulse`) +~0.35 MB (`trove-pulse-cn`) ≈ **+3.0 MB tracked** | Accept. Roughly doubles a text-only repo but stays small in absolute terms. |
| `bun run build` | Copies `scripts/` into `plugins/trove-research/skills/` and into 4–5 host output trees | Expect a measurable build-time increase from ~120 files × ~6 destinations. Measure before and after; if it hurts, teach `gen-plugins.ts` to skip byte-identical copies. |
| `build:skills --dry-run` freshness check | `syncSupportFiles` compares support files as UTF-8 | Safe for this selection (no binaries). Do not add binary support files without fixing that comparison first. |
| Git history | Weekly PRs touching up to 100 files | Expected. Reviewers read the sync report, not the diff. |
| Execute bits | None in either selection | Verify after each import: `git ls-files -s skills/research/trove-pulse*` should show only `100644`. |

## 10. Implementation checkpoints

Eleven checkpoints, in order: engine → small artifact → engine → large artifact →
hygiene → run → automation → docs → evals. The Chinese artifact lands first on purpose (§8.6) — it exercises the engine changes
on a tree small enough to review by hand.

**Definition of done, every checkpoint.** One PR, one concern; conventional commit subject;
no checkpoint merges red or with a skipped step silently dropped.

```sh
bun run build && bun test && bun run validate
bun run build:skills -- --dry-run     # no stale host artifact
bun run validate:claude-manifests
bun run sync:upstream -- --check --offline   # from any checkpoint that touches the lock
```

A checkpoint that changes digests re-records them in the same PR. A checkpoint that adds or
edits a vendored artifact names, in its PR body, which host outputs it verified.

**Checkpoint 1 — Decide.** *Complete* — see §13. Name `trove-pulse`, plugin `trove-research`,
`local_only` engine support, weekly check with dispatched updates.

**Checkpoint 2 — Engine, first wave (E1, E3).** Widen canonical paths to `scripts/**` and
add the `replace-literal` transform — the two changes both artifacts need. Tests first:
they are cheap here and the failure mode (silently accepting an unsafe path) is expensive.
No manifest entry yet.

**Checkpoint 3 — Import `trove-pulse-cn` (§8).** The small artifact proves E1 and E3 end to
end: source and artifact in `upstream.yaml`, materialized tree, offline check green, plugin `trove-research`
created here with its first skill, `local.patch` limited to `triggers`,
`preamble-tier`, and the sibling pointer. Run it live with no keys before moving on.

**Checkpoint 4 — Engine, second wave (E2, E4).** Add `local_only` and per-artifact policy —
needed only by the EN artifact.

**Checkpoint 5 — Import `trove-pulse`.** Add the source and artifact, compute `base_tree_digest`,
`local_tree_digest`, `patch_digest`, and materialize `skills/research/trove-pulse/` from the
pinned SHA. `bun run sync:upstream -- --check --offline` must pass. Nothing hand-copied:
if the checked-in tree does not equal `replay(base)`, the import is wrong.

**Checkpoint 6 — Wrapper and plugin.** Author `SKILL.md.tmpl` (§6.3), add `trove-pulse` to
`plugins/trove-research/` (created at Checkpoint 3), update the `marketplace.yaml` entry, and
regenerate routing and deps. Confirm the budget (`validateSkillBudget` passes on the
wrapper), the projection per host, and that the two siblings' descriptions and triggers do
not overlap in the regenerated routing index.

**Checkpoint 7 — Hygiene (E5).** Extend secret scanning over vendored scripts in both
artifacts. Re-run the offline check; digests change, so re-record them in the same PR.

**Checkpoint 8 — Install and run.** `bun run test:acceptance:setup` for the link layout,
then a real end-to-end run of **both** skills with no API keys — `/trove-research:trove-pulse`
(Python 3.12) and `/trove-research:trove-pulse-cn` (Python 3.9+), each on a live topic, plus
their health checks (`--doctor` and `--diagnose`). At least one of the two runs on a
non-Claude host, to prove the `[skill-dir]` rewrite path. Capture the output
in the PR. **Nothing ships without this**: everything before it verifies bytes, not that the
skill works.

**Checkpoint 9 — Weekly sync.** No workflow file change is required — the `check` job walks
the manifest. Two confirmations: the scheduled `check` includes `trove-pulse` in
`upstream-report.json` and `trove-pulse-cn`, and a manual `workflow_dispatch` for each
artifact id produces a clean update PR against a fresh upstream SHA. Update
`.github/workflows/upstream-sync.yml`'s `artifact` input description to say the id is
free-form (its default remains `trove-react-view-transitions`). Land the acceptance
protocol of §11 in the same PR — an update that only moves bytes is not an accepted sync.

**Checkpoint 10 — Docs.** `THIRD_PARTY.md` (both artifacts, including the CN fork chain and
the vendored node client),
`docs/upstream-sync.md` (`local_only`, per-artifact policy, `replace-literal`),
`docs/skill-authoring.md` (script-bearing skills, and the import-shape rule of §4.1),
`docs/user-config.md` (each skill's env surface, config location, and consent defaults —
including the two shared key names, §8.4), `README.md`, `CHANGELOG.md`.

**Checkpoint 11 — Evals (optional, follow-up).** `evals/skill-evals/trove-pulse{,-cn}/` with a
rubric and two tasks. Keep them offline-deterministic or excluded from `eval:gate`; a live
network eval in a CI gate is a flaky gate.

## 11. Sync acceptance protocol

A deterministic byte update is only half of a sync. Upstream ships user-visible features
weekly — new sources, new flags, new env vars, changed output contracts — and a merged
update PR that leaves the wrapper, the docs, and the other host runtimes describing the old
skill is a regression that validation cannot see. Every accepted update runs this protocol,
in the same PR as the byte change.

**1. Read the change, not just the digest.** From `upstream-report.md`, take
`changed_paths` and the upstream commit range. Classify each change:

| Upstream change | Trove obligation |
|---|---|
| New source, flag, or mode | Name it in the wrapper's invocation section if a user would ask for it by name; otherwise the vendored spec covers it. |
| New or renamed env var / credential | Update the wrapper's Configuration section **and** `docs/user-config.md`. A key the user cannot discover does not exist. |
| New external binary or a new vendored dependency | Review it explicitly (`scripts/lib/vendor/**` is a named review trigger), add it to the prerequisites list, add it to `THIRD_PARTY.md`. |
| Changed output contract or invocation shape | Re-check the wrapper's Trove-overrides list (§6.3 item 5) — the sections we supersede may have moved or been rewritten. |
| New consent or data-access behavior | Re-check the first-run Decision Gate. Any new access to local data defaults to off. |
| Engine-internal refactor only | No wrapper change. Say so in the PR. |

**2. Re-project to every runtime.** `bun run build` regenerates all host outputs; the
update job already runs it, but the reviewer must confirm the artifact actually reached
each host rather than trusting a green job:

```sh
bun run build && bun run validate && bun test
bun run build:skills -- --dry-run          # freshness: no stale host artifact
bun run validate:claude-manifests
for skill in trove-pulse trove-pulse-cn; do
  ls output/{cursor,codex,opencode,gemini}/.agents/skills/$skill/scripts >/dev/null || echo "MISSING: $skill"
  ls plugins/trove-research/skills/$skill/scripts >/dev/null || echo "MISSING bundle: $skill"
done
```

Every host that declares the skill must have the **same** `scripts/` tree and a `SKILL.md`
projected through its own profile. A host missing the support files is a broken skill on
that host, not a cosmetic gap.

**3. Match Trove's voice and conventions.** The vendored spec keeps upstream's voice — it
is upstream's file. Anything Trove authors or edits follows Trove's text conventions:
the wrapper stays inside the 500-line / ~5,000-token budget, uses the documented Decision
Gate format, references `${CLAUDE_SKILL_DIR}` (never a hard-coded path), and keeps
`triggers` at four or fewer. If the wrapper grows past the budget because upstream grew,
move detail into `references/`, not into an exemption.

**4. Re-run the skill.** Checkpoint 8's end-to-end run is not a one-time gate. Any update
whose `changed_paths` touch the engine entry point, pipeline, renderer, or env module
(`scripts/last30days.py`, `scripts/lib/{pipeline,render,env}.py` for `trove-pulse`;
`scripts/last30days.py`, `scripts/lib/{render,score,env}.py` for `trove-pulse-cn`) gets a
live run plus its health check (`--doctor` / `--diagnose`) on at least one host before
merge, with the output in the PR.

**5. Record it.** Bump `metadata.upstream-version` (in the wrapper for `trove-pulse`, in the
`local.patch` frontmatter for `trove-pulse-cn`) when upstream cuts a release, add a `CHANGELOG.md` entry when a user-visible capability changed, and state in
the PR body which of steps 1–4 applied and which were no-ops. "No wrapper change needed"
is a valid outcome; an unstated one is not.

A cheap enforcement to add at Checkpoint 9: a test asserting that each artifact's
`metadata.upstream-version` matches the upstream `version` it was built from — the
`version` field in `references/runtime-spec.md` frontmatter for `trove-pulse`, and in
`SKILL.md.tmpl` for `trove-pulse-cn`. It makes the most common form of drift — bytes
updated, wrapper untouched — fail `bun test` instead of shipping quietly.

## 12. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Weekly upstream churn makes syncs noisy | High (263 commits / 60 days) | `patches: []`. Batch acceptance — the check job reports; a human dispatches the update when they want it. Consider monthly acceptance even though the check runs weekly. |
| Upstream `SKILL.md` grows past 512 KB or the selection past 8 MB | Medium | Sync fails closed with a clear message. Revisit the override with a recorded rationale rather than raising it reflexively. |
| Upstream force-push makes `base_sha` unreachable | Low | `prepareRemote` fetches `base_sha` explicitly and fails loudly. Recovery: re-establish the base from a newer SHA in a reviewed PR. |
| Vendored JS or a new vendored dependency arrives in a sync | Medium | Named review trigger on `scripts/lib/vendor/**` in `changed_paths`; binary and generated-file guards stay on. |
| Upstream adds a Python package dependency | Low today (`dependencies = []`) | Detectable: a non-stdlib import in the diff. Trove's answer is to hold the artifact at the last stdlib-only SHA, not to add a Python toolchain. |
| Skill misfires on unrelated work | Low | No `auto_attach.globs`; `user-invocable: true`; narrow triggers. |
| Cookie-reading capability surprises a user | Medium | Consent gate defaulting to off, documented in the wrapper and `docs/user-config.md`. |
| Cursor/Codex `[skill-dir]` placeholder breaks the invocation | Medium | The wrapper states the resolution rule in prose; Checkpoint 8 runs the skills on at least one non-Claude host. |
| CN fork stalls or is abandoned (one maintainer, 10 commits / 90 days) | Medium | The artifact holds at its pinned SHA and keeps working. Re-evaluate if the check reports no upstream movement for a quarter. |
| CN anti-scraping breakage on Chinese platforms | High over time | Upstream's problem; surfaces as `--diagnose` failures. Do not patch scrapers locally — that is the fork this design avoids. |
| A user sets a shared key (`SCRAPECREATORS_API_KEY`) in the wrong skill's config | Medium | `docs/user-config.md` states per-skill config locations explicitly (§8.4). |
| The two research skills are confused for each other | Medium | Disjoint triggers, explicit sibling pointer in each body, and a routing-index review at Checkpoint 6. |

## 13. Decisions

Recorded 2026-08-28 by the maintainer.

| # | Question | Decision |
|---|---|---|
| 1 | Skill name | **`trove-pulse`** — slash form `/trove-research:trove-pulse`. |
| 2 | Plugin | **New `trove-research`** plugin (`category: research`, `roles: [pm, dev]`). |
| 3 | Wrapper mechanism | **`local_only` engine support** (§5 E2a). The wrapper is an ordinary editable file, excluded from the sync lock and covered by build/validate/test. |
| 4 | Sync cadence | **Weekly `check`, human-dispatched updates.** No scheduled writes. Every dispatched update runs the acceptance protocol in §11. |
| 5 | Chinese variant | **Sibling skill `trove-pulse-cn` in the same `trove-research` plugin** (§8.2), vendored from `Jesseovo/last30days-skill-cn` as its own upstream artifact, and imported **first** as the engine-change proving ground (§8.6). |

Standing requirement attached to decision 4: a sync is accepted only when the upstream
change has been carried through to every agent runtime Trove projects to, and any Trove
text it touches reads as Trove's own. §11 is that requirement written as a procedure.

## 14. Sources reviewed on 2026-08-28

- `_sample/last30days-skill` at `a218edadbc3361672f5e5e2cd72a8212b0b3fbb8`; `git ls-remote`
  confirmed the same SHA as the current public `HEAD`.
- Upstream `AGENTS.md`, `pyproject.toml`, `LICENSE`, `.claude-plugin/plugin.json`,
  `skills/last30days/SKILL.md`, `skills/last30days/.skillignore`, `scripts/lib/env.py`,
  `scripts/lib/vendor/bird-search/package.json`.
- `_sample/last30days-skill-cn` at `1a8a04c3c347defbcdbb8da26d7cf1a531426b1f`; upstream
  `CLAUDE.md`, `LICENSE`, `SKILL.md`, `requirements.txt`, `.claude-plugin/plugin.json`,
  `scripts/lib/env.py`, `scripts/lib/cjk.py`, `scripts/lib/doctor.py`,
  `.github/workflows/ci.yml`. Payload/root equality verified with `diff -rq`.
- Trove `scripts/lib/upstream-sync.ts`, `scripts/lib/upstream-manifest.ts`,
  `scripts/lib/projection.ts`, `scripts/lib/skill-budget.ts`, `scripts/gen-skills.ts`,
  `scripts/gen-plugins.ts`, `scripts/validate.ts`, `upstream.yaml`,
  `.github/workflows/upstream-sync.yml`, `tests/upstream-sync.test.ts`,
  `docs/upstream-sync.md`, `docs/skill-authoring.md`.
- Measurements in §1, §8, and §9 were taken from the clone, not from upstream documentation.
