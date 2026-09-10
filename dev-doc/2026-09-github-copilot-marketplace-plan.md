# GitHub Copilot marketplace integration and quality automation plan

Date: 2026-09-09
Revised: 2026-09-09 — repository and CLI review; concrete decision recommendations, release boundaries, and verification corrections added.
Status: Implementation in progress on `feat/github-copilot-marketplace`
Scope: First-class GitHub Copilot support, skill quality gates, monitoring, external plugin governance, and selective upstream adoption

## Executive decision

Trove should treat GitHub Copilot support as a promotion from incidental compatibility to an explicitly generated, tested, and documented host.

The current repository already works with Copilot CLI. An isolated local test with Copilot CLI 1.0.69 added Trove's existing `.claude-plugin/marketplace.json`, browsed the catalog, and installed all seven Trove plugins. Copilot found these files through its documented Claude-compatible fallback discovery paths.[^copilot-plugin-reference] This is a useful bootstrap result, but it is not a durable integration contract.

The recommended first release adds Copilot to the host registry, emits Copilot-native manifests and a marketplace catalog, installs through `copilot plugin`, and verifies the result in an isolated home directory. It preserves the generic `AGENTS.md` output as a separate fallback. It does not immediately migrate every host to the Agent Plugins specification.

Quality automation should build on Trove's existing validator and evaluation runner. Add Vally as a pinned second opinion, not as the source of truth. Deterministic checks must block pull requests. LLM-assisted duplicate, staleness, and review workflows should initially be advisory. External plugin intake and six-month review should follow only after Trove decides to accept third-party remote plugins.

## Release boundary

Recommended first release: checkpoints 1–4, including deterministic freshness,
structural checks, and pinned tooling. Checkpoint 5 is a follow-up for calibrated
lint and quality reporting; checkpoints 6–7 are optional later work. The native
Copilot release does not depend on a scorecard, model credentials, external
intake, privileged comments, or upstream imports.

## Outcomes

The overall roadmap is complete when the following are true; the first release requires the first five outcomes plus deterministic changed-scope checks and the checkpoint 4 acceptance criteria.

- `copilot` is a first-class host accepted by generators, validators, setup, documentation, and tests.
- Trove emits a Copilot-native plugin manifest for every plugin and a Copilot-native marketplace catalog.
- A clean Copilot CLI environment can add the local marketplace and install every first-party plugin without authentication.
- Copilot-specific skill metadata, hooks, agents, and path variables are validated against documented behavior.
- Generated artifact freshness is enforced. Repository version and generated manifest versions cannot drift.
- Changed skills receive deterministic structural, security, projection, install, and behavioral checks.
- A scheduled report records structured quality scores and trends without turning the score into a substitute for hard gates.
- External plugins, if enabled, use immutable revisions, isolated smoke tests, explicit review dates, and a documented re-review lifecycle.
- Candidate upstream skills are adopted only after overlap, licensing, provenance, and maintenance review.

## Investigation method

This plan combines four evidence sources.

1. The local `awesome-copilot` sample, especially its [repository instructions](../_sample/awesome-copilot/AGENTS.md) and all 50 files under [`.github/workflows`](../_sample/awesome-copilot/.github/workflows).
2. Trove's generators, host model, setup path, acceptance tests, release workflows, validators, and current generated artifacts.
3. A live, isolated installation test with the locally installed Copilot CLI.
4. Current GitHub, Agent Plugins, GitHub Agentic Workflows, and Microsoft Vally documentation.[^copilot-about-plugins][^agent-plugins-spec][^gh-aw-about][^vally]

## Current-state findings

### Trove already installs in Copilot

The following sequence succeeded with temporary `HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` directories.

```sh
copilot plugin marketplace add "$PWD"
copilot plugin marketplace browse trove
copilot plugin install trove-workflow@trove
copilot plugin install trove-dev@trove
copilot plugin install trove-design@trove
copilot plugin install trove-product@trove
copilot plugin install trove-security@trove
copilot plugin install trove-infra@trove
copilot plugin install trove-research@trove
copilot plugin list
```

Copilot reported all seven plugins at version `2026.7.4`. This used Trove's [Claude marketplace](../.claude-plugin/marketplace.json) and per-plugin `.claude-plugin/plugin.json` files. GitHub documents `.claude-plugin` as the last-priority discovery location for both plugin and marketplace manifests.[^copilot-plugin-reference]

This proves baseline compatibility. It does not prove that all component semantics are correct. Copilot uses first-found behavior for skills and agents, last-found behavior for MCP servers, and may silently shadow plugin components with project or personal customizations.[^copilot-plugin-reference] A native projection and collision tests are therefore required.

### Copilot is currently modeled as generic AGENTS.md

The current [host type](../hosts/types.ts) has no `copilot` host or Copilot projection profile. The [host registry](../hosts/index.ts) contains Claude, Cursor, Codex, generic agents, OpenCode, and Gemini. The [setup script](../setup) routes Copilot to the generic AGENTS installer. The [acceptance harness](../tests/acceptance/harness-bootstrap.sh) says Copilot headless acceptance is unsupported and only checks a manual transcript.

The generic fallback remains useful, but current Copilot supports native plugins, marketplaces, skills, agents, hooks, and MCP integration.[^copilot-about-plugins] Setup and documentation should distinguish native plugin installation from portable AGENTS fallback.

**Revised.** Trove is closer to Copilot than the AGENTS routing suggests. Copilot
documents `.agents/skills` as a project skill root, and Trove already generates
that layout for Codex, OpenCode, and Gemini. Copilot's documented skill
frontmatter is also a subset of Trove's existing `strict` profile. So the gap is
not "Copilot needs a new content projection" — it is "Copilot needs a host entry,
native manifests, and a native install path". That reframing is what shrinks
checkpoint 2.

### Generated versions are stale

The repository [VERSION](../VERSION) and `package.json` report `2026.8.29`. Every committed Claude plugin manifest reports `2026.7.4`. This demonstrates why CI needs a full generated-artifact freshness check. The plan does not assume why these files are stale. It makes that state impossible to merge or release unnoticed.

### Trove already owns much of the quality stack

Trove already has:

- Agent Skills frontmatter validation in [`scripts/lib/agent-skills-spec.ts`](../scripts/lib/agent-skills-spec.ts)
- schema, hook, MCP, secret, dependency, and skill-budget validation in [`scripts/validate.ts`](../scripts/validate.ts)
- structural and model-backed evaluations in [`scripts/eval-runner.ts`](../scripts/eval-runner.ts)
- upstream provenance inventory in [`upstream.yaml`](../upstream.yaml)
- build freshness support in several generators
- artifact and host acceptance harnesses under [`tests/acceptance`](../tests/acceptance)

The quality design should extend these contracts and produce structured results. It should not replace them with output parsed from another CLI's console text.

## What the sample repository gets right

### Source-first composition

`awesome-copilot` keeps reusable sources at the repository top level and composes distributable plugins during publishing. Its marketplace branch contains materialized plugin content. This creates a clear source versus distribution boundary.

Trove uses a different but valid model. It commits generated host artifacts. A wholesale copy of the sample's publish branch architecture would add migration cost without solving the immediate Copilot problem. Trove should adopt its separation principles and freshness checks while retaining the current committed-artifact model.

### Privilege separation

The sample commonly separates an unprivileged pull-request analyzer from a privileged `workflow_run` writer. The writer checks out trusted default-branch code and consumes an artifact to update comments or labels. The strongest implementation is [external-plugin-pr-quality-gates-writer.yml](../_sample/awesome-copilot/.github/workflows/external-plugin-pr-quality-gates-writer.yml), which validates workflow identity, pull request state, head repository, head ref, head SHA, base SHA, schema version, and artifact size before writing.

GitHub explicitly warns that artifacts from untrusted workflows must be treated as untrusted input and that privileged workflows must not execute fork code.[^actions-secure][^pull-request-target] Trove should copy this provenance validation whenever it adds a writer workflow.

### External plugin state machine

The external plugin workflows use labels and commands to make intake, submitter fixes, maintainer approval, rejection, and periodic review visible. The supporting scripts centralize state transitions. This is much safer than distributing state logic across YAML expressions.

Trove should keep the state-machine idea. It should store `reviewed_at`, `next_review_at`, and the immutable reviewed revision explicitly. The sample resets GitHub's `closed_at` timestamp by reopening and reclosing an issue. That works, but it hides domain state inside issue mechanics.

### Deterministic and agentic separation

The sample compiles GitHub Agentic Workflow Markdown sources into lock workflows and blocks contributors from directly changing generated YAML. GitHub's guidance positions agentic workflows for tasks requiring judgment, while ordinary Actions remain the right tool for deterministic builds, tests, and linting.[^gh-aw-how][^gh-aw-compile]

Trove should use deterministic jobs for required gates. Semantic duplication, nuanced staleness review, and ecosystem research are reasonable later candidates for agentic workflows with safe outputs.

## Problems to avoid copying

### The sample skill gate appears advisory even when lint fails

[skill-check.yml](../_sample/awesome-copilot/.github/workflows/skill-check.yml) captures Vally's exit code and writes a report, but it does not exit the job with that code. A lint failure can therefore leave the analyzer job successful. Trove must explicitly fail required criteria.

The workflow also uses Node 20. The Vally core package declares Node.js 22 or
newer, and the CLI wraps it.[^vally] Trove should pin Vally and its runtime or
call its programmatic API from the Bun toolchain. Confirm before integrating
that Bun's Node compatibility surface covers what Vally uses; if it does not,
run Vally on a pinned `actions/setup-node@v6` Node 22 step and hand its JSON
output to the Bun-based report generator, rather than bending the toolchain.

### Quality reporting parses presentation text

[skill-quality-report.yml](../_sample/awesome-copilot/.github/workflows/skill-quality-report.yml) infers totals from emoji and console text, then uses a simplified CODEOWNERS match. This is fragile. Trove should generate a versioned JSON result first and render Markdown from it. Ownership must use repository metadata or a correct CODEOWNERS implementation.

### External plugin validation needs a stronger sandbox

The sample's external gate clones a remote repository, runs Vally, and performs a Copilot marketplace install in an ephemeral home. This is a strong functional test. It also processes untrusted plugin content. Trove must use a runner with no secrets, read-only permissions, bounded disk and time, and constrained network access. The Copilot CLI and all actions must be pinned.

### Re-review time should be explicit data

[external-plugin-rereview.yml](../_sample/awesome-copilot/.github/workflows/external-plugin-rereview.yml) interprets 183 days since issue closure as the review interval. Trove should use explicit review metadata so reports, migrations, and policy changes remain understandable.

## Target architecture

```text
plugin.yaml + canonical skills + hooks + agents
                    |
                    v
            host projection layer
                    |
       +------------+-------------+
       |                          |
       v                          v
.plugin/plugin.json       .copilot/skills/<name>/
per Trove plugin          bundled Copilot SKILL.md
       |                          |
       +------------+-------------+
                    |
                    v
      .github/plugin/marketplace.json
                    |
                    v
        copilot plugin marketplace add
        copilot plugin install <name>@trove
```

The project-copy output is separately generated at
`output/copilot/.agents/skills/<name>/`. Inside each distributable plugin,
use `.copilot/skills/` and explicit manifest paths to avoid overwriting the
existing Claude `skills/` or other hosts’ `.agents/skills/` projections.

### Manifest strategy

**Revised.** GitHub documents these discovery orders.[^copilot-plugin-reference]

| Manifest | Search order |
| --- | --- |
| Plugin | `.plugin/plugin.json` → `plugin.json` → `.github/plugin/plugin.json` → `.claude-plugin/plugin.json` |
| Marketplace | `marketplace.json` → `.plugin/marketplace.json` → `.github/plugin/marketplace.json` → `.claude-plugin/marketplace.json` |

Generate `.plugin/plugin.json` for each plugin. That is the highest-priority
plugin path, so a Copilot manifest always wins over the `.claude-plugin`
fallback Trove already commits.

For the repository marketplace, generate `.github/plugin/marketplace.json`.
This is third in the search order, not first. The choice is deliberate: a root
`marketplace.json` would sit in the repository root next to `catalog.json` and
`VERSION` with no namespacing, and `.plugin/marketplace.json` collides
conceptually with the per-plugin `.plugin/` directories. Third position still
resolves ahead of `.claude-plugin/marketplace.json`, which is the only
competing file Trove emits. Record this in `docs/host-matrix.md` so a future
reader does not mistake it for an oversight.

Use explicit component paths in the Copilot manifest. Documented `plugin.json`
fields: `name` required (kebab-case, 64 characters maximum); component paths
`agents`, `skills`, `commands`, `hooks`, `extensions`, `mcpServers`,
`lspServers`; metadata `description`, `version`, `author`, `homepage`,
`repository`, `license`, `keywords`, `category`, `tags`. Validation should
reject anything outside that set rather than passing canonical Trove fields
through.

**Revised — path variables.** The original plan said not to assume
`${CLAUDE_PLUGIN_ROOT}` works outside the fallback parser. That is now wrong.
Since Copilot CLI 1.0.26, plugin hooks receive `PLUGIN_ROOT`,
`COPILOT_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_ROOT`, all set to the plugin's
installation directory.[^copilot-cli-1026] Trove should still emit
`${PLUGIN_ROOT}` in Copilot output as the vendor-neutral name, but the
compatibility risk this guarded against does not exist, so it is not a reason
to block on a native projection. Treat 1.0.26 only as the introduction of those variables, not as the
minimum for every feature in this plan. Start checkpoint 1 with the installed
1.0.69 as a candidate baseline; publish a minimum only after the complete
install, lifecycle, projection, and hook contract passes on that exact version.

The Agent Plugins 1.0 specification is a worthwhile longer-term portability target. It defines a root `plugin.json`, standard portable fields, and reverse-domain client extensions.[^agent-plugins-manifest] It should be a separate architecture decision because Trove already has a canonical `plugin.yaml`, several host-specific component models, and generated host manifests. The first Copilot release should not couple success to a cross-host manifest migration.

### Skill projection

**Revised — this is the largest correction in the plan, and it removes work.**

The original plan proposed a new `copilot` projection profile carrying
`argument-hint`, `user-invocable`, and `disable-model-invocation`. Those are
Claude Code fields. GitHub's skills documentation for Copilot CLI documents
exactly four `SKILL.md` frontmatter fields: `name` (required, lowercase,
hyphenated), `description` (required), `license` (optional), and
`allowed-tools` (optional).[^copilot-add-skills]

That set is a strict subset of Trove's existing `strict` profile in
`scripts/lib/projection.ts` (`name`, `description`, `license`,
`compatibility`, `allowed-tools`, `metadata`). Copilot should therefore
declare `skillProjection: "strict"` and **no new profile is added**.
`ProjectionProfile` stays a three-value union. Reuse the allowlist, but add host-specific content rewrites, capability
settings, and plugin materialization. A host entry alone does not implement
those behaviors.

`compatibility` and `metadata` are not documented as honored by Copilot.
Do not claim they are proven inert: test acceptance on the pinned CLI and
omit them from Copilot output if rejected, without changing other hosts.

For the first release, set `supportsToolAllowlistMetadata: false` for Copilot.
GitHub describes `allowed-tools` as pre-approval, so carrying Claude tool names
or widening `Bash(git *)` into unrestricted `shell` would change permissions.
Omitting it preserves normal host permission handling. Add explicit, tested
Copilot tool mappings later if needed.[^copilot-add-skills]

**Revised — discovery root.** Copilot documents `.github/skills`,
`.claude/skills`, and `.agents/skills` as project skill roots, and
`~/.copilot/skills` and `~/.agents/skills` as personal roots.[^copilot-add-skills]
Trove already emits `.agents/skills` for Codex, OpenCode, and Gemini. Copilot
should reuse that layout (`skillOutputDir: ".agents/skills"`) rather than
introduce a different project installation convention. The generator still
creates a distinct `output/copilot/` tree; it does not share generated bytes
with other hosts. Skills delivered *inside* a plugin
are located by the manifest's `skills` path and are unaffected either way; the
`.agents/skills` decision governs the non-plugin, copy-into-project fallback.

Generate one Copilot skill directory per attached skill. Preserve supporting
files. Add collision tests showing what happens when a project or personal
skill has the same name as an installed plugin skill — Copilot resolves
skills and agents first-found-wins, so a project skill silently shadows the
plugin's.[^copilot-plugin-reference]

### Hooks and agents

GitHub supports plugin hooks and accepts both camelCase and PascalCase
Claude-compatible event names, but command, HTTP, and prompt hooks have
different environments and failure behavior.[^copilot-hooks]

**Revised — verified event set.** Available in CLI and cloud agent:
`sessionStart`/`SessionStart`, `sessionEnd`/`SessionEnd`,
`userPromptSubmitted`/`UserPromptSubmit`, `userPromptTransformed`,
`preToolUse`/`PreToolUse`, `postToolUse`/`PostToolUse`,
`postToolUseFailure`/`PostToolUseFailure`, `agentStop`/`Stop`,
`subagentStart`, `subagentStop`/`SubagentStop`,
`errorOccurred`/`ErrorOccurred`, `preCompact`/`PreCompact`. CLI only:
`permissionRequest`/`PermissionRequest`, `notification`. A validator that
accepts only the Claude PascalCase set would reject valid Copilot hooks and
miss `userPromptTransformed`, `subagentStart`, `permissionRequest`, and
`notification` entirely.

**Revised — verified failure semantics**, which the fixtures in checkpoint 1
should encode directly:

| Exit code | Behavior |
| --- | --- |
| `0` | Success; stdout parsed as JSON |
| `2` | Warning, logged. For `permissionRequest` and `preToolUse`, treated as deny |
| Other non-zero | Fail-open, except `preToolUse`, which fails closed as deny |
| Timeout | Always fail-open, including `preToolUse` and admin policy hooks |

Default timeout is 30 seconds. Hook output is bounded at 10 MiB per
invocation, and `additionalContext` is capped at 10 KB merged across hooks.
After 8 consecutive `"block"` continuations on `agentStop`, the CLI overrides
and ends the turn.

**Revised — plugin hooks do not reach the cloud agent at all.** The cloud
agent loads hooks only from `.github/hooks/*.json` in the cloned
repository.[^copilot-hooks] Plugin-supplied `hooks.json` is a CLI-only
surface. The original plan framed this as "cloud versus local CLI
differences"; the correct statement is that Trove's plugin hooks have no cloud
execution path, so no cloud coverage is owed and none should be claimed.

Validation must cover:

- the verified Copilot event names above, both casings
- `${PLUGIN_ROOT}` path resolution, with `COPILOT_PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` accepted as documented aliases
- the exit-code and timeout table, including `preToolUse` fail-closed on non-zero but fail-open on timeout
- no secret-bearing environment interpolation
- output size bounds
- interactive-only behavior of prompt `sessionStart`

Prompt hooks fire only on `sessionStart` and only in interactive sessions.
They do not fire in programmatic `-p` mode, and `notification` hooks do not
fire there either.[^copilot-hooks] Acceptance tests must not claim full
coverage from a headless prompt. Command hook scripts can still be tested
deterministically with fixture JSON. A small documented interactive check
remains necessary for prompt-only behavior.

The current warning at `setup:406` — "Copilot CLI sessionStart command output
is not processed by current GitHub docs" — is now factually wrong: command
hooks on `sessionStart` have their stdout parsed as JSON. Checkpoint 3 must
delete it rather than reword it.

### Setup behavior

`./setup --host copilot` should perform native plugin installation.

1. Detect `copilot`, report its version, and check the version and capabilities established in checkpoint 1 before changing user state.
2. Add or update the Trove marketplace from the repository path.
3. Install plugins selected by role.
4. Verify installed plugin names and versions.
5. Record only Trove-owned state for uninstall.
6. Leave existing unrelated marketplaces, plugins, and customizations untouched.

**Review finding — documented commands are unavailable locally.** GitHub
documents `copilot plugins list --json`, but the installed CLI 1.0.69 returns
`The plugins command is not available.` for `copilot plugins list --help`.
Its `copilot plugin --help` lists singular `install`, `list`, `uninstall`, and
`update`. Do not make the plural commands a requirement without testing a
released version that provides them.[^copilot-cli-commands]

Recommend retaining 1.0.69 as the initial candidate and using its singular
lifecycle commands. Checkpoint 1 must establish an inventory adapter using a
verified JSON option or schema-validated installed manifests; save fixtures
and fail on unknown layouts rather than scrape presentation text. Prefer the
documented JSON surface once available and tested. It does not enumerate
custom agents or session hooks, which need separate checks.

Record marketplace identity/source, plugin name, version, and pre-existing
ownership before setup. Uninstall only installations created by Trove setup,
using marketplace-qualified names and the tested CLI command. A pre-existing
`trove` marketplace with a different source is a conflict, not permission to
replace it. Roll back newly created state on partial failure; preserve prior
installations. Add repeat-install, role-change, collision, and partial-failure
fixtures.

Generic `AGENTS.md` installation remains available through `--host agents`. If Copilot is missing, setup should print an actionable fallback rather than silently changing installation mode.

## Quality, rating, monitoring, and review design

### Required pull-request gates

Run changed-scope analysis first, then execute only affected checks plus global catalog invariants.

| Gate | Blocking condition | Implementation |
| --- | --- | --- |
| Canonical schema | Invalid metadata, missing files, bad names, dependency cycles | Existing Trove validator |
| Security | Secret pattern, unsafe hook path, prohibited executable reference | Existing validator plus Copilot rules |
| Projection | Stale or invalid host output | Build dry-run and manifest schema validation |
| Independent lint (checkpoint 5) | An explicitly adopted deterministic Vally rule fails | Pin version/runtime; baseline the catalog, then enable reviewed rules |
| Eval structure | Missing required suite, invalid task/rubric, or deterministic assertion failure | Extend runner with explicit structural gate; model scoring stays advisory |
| Install smoke | Marketplace add, browse, install, or inventory mismatch | Isolated Copilot CLI harness |
| Release integrity | Version or generated artifact drift | Full build freshness comparison |

Warnings may be reported without blocking. Errors and hard policy violations must never be hidden inside a weighted score.

Changed scope must use the PR merge base and head, including renames and
supporting files. Changes to shared generators, hooks, schemas, or host configs
fan out to all affected plugins. Diff failures must fail the check. The current
runner uses `HEAD~1 HEAD`, exits successfully for missing changed suites, and
only fails findings under `--gate`; `eval:changed` alone is not a blocking gate.
Without `ANTHROPIC_API_KEY`, it performs structural checks only. Report
`passed`, `failed`, `skipped`, and `unavailable` distinctly, and never supply
model credentials to fork PR analyzers.

### Scorecard

Start with raw findings and coverage. Publish a score from 0 to 100 only after checkpoint 5 defines a versioned normalization formula and calibrates it against the catalog. The weights below are proposed, not validated quality measures.

| Dimension | Weight | Evidence |
| --- | ---: | --- |
| Structure and specification | 20 | Trove schema and Agent Skills validation |
| Host projections and installation | 20 | Generated manifests and host smoke matrix |
| Independent lint quality | 15 | Pinned Vally structured findings |
| Behavioral evidence | 25 | Eval coverage, pass rate, and required cases |
| Documentation, routing, and ownership | 10 | Routing index, owner, examples, freshness |
| Provenance and supply chain | 10 | Origin, license, immutable revision, review age |

Record tool versions, commit SHA, scope, rule IDs, and per-dimension numerator/denominator. Missing evidence is unavailable, not a pass or zero; show coverage and suppress the overall score until required dimensions are comparable. Compare trends only across matching schema, rules, and scope.

Hard blockers remain independent of the score. They include a schema error, secret finding, installation failure, missing required evaluation, mutable external revision, prohibited license, and unresolved critical security finding.

Write a versioned machine-readable artifact such as `quality-report.v1.json`, then render the check summary, PR comment, and scheduled Markdown report from it. Keep trend history as Actions artifacts for at least 90 days or in an append-only repository dataset if long-term history is required.

### Reporting cadence

- Pull request checks report only changed plugins and skills.
- A nightly or weekly full scan reports catalog health and deltas from the previous run.
- Start with job summaries and artifacts. A rolling Discussion or Issue can be added with the deferred writer; do not require write permissions for initial reporting.
- GitHub Actions metrics should monitor job duration, queue time, failure rate, and runner consumption.[^actions-metrics]
- Copilot usage metrics may be offered as an optional enterprise administration plugin. They are not evidence of skill quality.
- A weekly host-drift job should compare documented runtime requirements, supported fields, hook behavior, CLI smoke tests, and pinned tool versions.

### Safe comment writer

If PR comments and labels are desired, use two workflows.

1. A read-only analyzer runs against pull-request content with no secrets and uploads bounded JSON.
2. A `workflow_run` writer checks out the trusted default branch, validates artifact provenance and current PR head state, then updates a marker-delimited comment.

The writer must reject stale head SHAs, unexpected workflow identities, fork mismatches, oversized artifacts, schema mismatches, invalid PR numbers, and closed or superseded pull requests.

### External plugin governance

Do not enable public external intake until policy and isolation are approved. When enabled, require:

- GitHub-hosted source and explicit subdirectory
- exact 40-character commit SHA for the reviewed release[^copilot-plugin-reference]
- detected license and compatibility decision
- manifest and skill validation
- isolated Copilot installation smoke test
- no runner secrets and read-only repository permission
- maintainer approval after automated checks
- explicit `reviewed_at`, `next_review_at`, reviewer, revision, and disposition
- scheduled re-review, defaulting to six months
- idempotent removal pull requests for abandoned or unsafe plugins

Infrastructure failures must remain distinct from submitter-fix failures. Manual overrides must be visible, permission-checked, and auditable.

## Candidate skills and plugins from awesome-copilot

These are adoption candidates, not pre-approved dependencies. Each needs license, provenance, overlap, eval, and maintenance review.

| Candidate | Recommendation | Reason |
| --- | --- | --- |
| `github-actions-hardening` | Pilot first | Directly supports workflow security review and complements the proposed gates |
| `test-gap-audit` | Pilot first | Adds focused missing-test analysis without duplicating TDD execution |
| `docs-sync-audit` | Pilot first | Fits host matrix, generated docs, and vendor drift maintenance |
| `github-actions-efficiency` | Evaluate | Useful after metrics establish a baseline for CI cost and latency |
| `dependabot` | Evaluate | Useful workflow maintenance guidance, though Trove already has dependency automation |
| `agent-skill-stack` | Adapt concepts | Its compatibility and conflict analysis overlaps Trove routing and could improve discovery |
| `agent-supply-chain` | Adapt requirements | Provenance goals are strong, but Trove should prefer signed Git evidence and immutable SHAs over a parallel custom integrity file |
| `copilot-usage-metrics` | Optional plugin | Useful only for eligible GitHub Enterprise administrators and unrelated to marketplace quality |
| `repo-actions-hub` | Backlog | A Canvas workflow browser is strategically interesting but requires a new extension surface |
| `technical-spike` | Evaluate | May fill a product discovery gap if it does not overlap existing brainstorm and plan skills |
| `quality-playbook` | Do not import wholesale | Large overlap with Trove TDD, review, verify, and eval workflows |
| `agentic-eval` | Do not import wholesale | Trove already has an evaluation runner and needs integration, not a second methodology |
| `security-review` | Do not import wholesale | Substantial overlap with `trove-security` |
| `suggest-awesome-github-copilot-skills` | Use as research input | Trove should own provenance-aware discovery rather than ship a marketplace-specific recommender |
| `verify-agent-action` | Backlog | Valuable but narrow, with overlap in safety and approval auditing |

The recommended pilot imports no more than three candidates. Each pilot should record origin revision, license, local modifications, owning Trove plugin, required evals, and removal criteria.

## Complete workflow inventory and disposition

The sample contains 50 workflow files. Generated `.lock.yml` files are listed separately because their source and review rules matter.

| Workflow | Purpose | Trove disposition |
| --- | --- | --- |
| `advanced-copilot-cli-sync.md` | Agentic upstream content sync source | Adapt later for vendor drift |
| `advanced-copilot-cli-sync.lock.yml` | Compiled sync workflow | Generate only if gh-aw is adopted |
| `agentics-maintenance.yml` | Maintains agentic workflow outputs and reports | Adapt later |
| `check-line-endings.yml` | Enforces repository line endings | Adopt if existing validation lacks it |
| `check-plugin-structure.yml` | Enforces source versus materialized plugin layout | Adapt to Trove's committed-artifact model |
| `cli-for-beginners-sync.md` | Agentic upstream content sync source | Do not adopt as-is |
| `cli-for-beginners-sync.lock.yml` | Compiled sync workflow | Do not adopt as-is |
| `codeowner-update.md` | Agentic CODEOWNERS maintenance source | Adapt later if ownership becomes generated |
| `codeowner-update.lock.yml` | Compiled CODEOWNERS workflow | Generate only if source is adopted |
| `codespell.yml` | Spelling validation | Optional low-cost gate |
| `contributor-check-writer.yml` | Privileged comment and label writer | Adapt only with provenance checks |
| `contributor-check.yml` | Assesses contributor trust signals | Defer, avoid reputation as a merge gate |
| `contributors.yml` | Updates contributor presentation | Not relevant to Copilot support |
| `copilot-setup-steps.yml` | Prepares Copilot coding agent environment | Adopt after native support lands |
| `copilot-workshops-sync.md` | Agentic workshop content sync source | Not relevant |
| `copilot-workshops-sync.lock.yml` | Compiled workshop sync workflow | Not relevant |
| `deploy-website-preview.yml` | Deploys website previews | Not relevant unless Trove adds a site |
| `deploy-website.yml` | Deploys the production website | Not relevant unless Trove adds a site |
| `duplicate-resource-detector.md` | Semantically finds duplicate resources | Adapt later as advisory |
| `duplicate-resource-detector.lock.yml` | Compiled duplicate detector | Generate only if source is adopted |
| `external-plugin-approval-command.yml` | Normalizes state after approved merge | Adapt with external intake |
| `external-plugin-command-router.yml` | Routes maintainer and submitter commands | Adapt with centralized state logic |
| `external-plugin-intake.yml` | Validates new external plugin issues | Adapt after public intake decision |
| `external-plugin-pr-quality-gates-writer.yml` | Safely writes PR results from artifacts | Adopt its provenance pattern |
| `external-plugin-pr-quality-gates.yml` | Checks external plugin record changes | Adapt after public intake decision |
| `external-plugin-quality-gates.yml` | Reusable clone, lint, install, and version gate | Adapt with stronger isolation and pins |
| `external-plugin-rereview-command.yml` | Handles keep, fix, and remove commands | Adapt with explicit review timestamps |
| `external-plugin-rereview.yml` | Schedules six-month external re-review | Adapt after public intake decision |
| `label-pr-intent-writer.yml` | Privileged PR intent label writer | Optional, low priority |
| `label-pr-intent.yml` | Agent-assisted PR intent classification | Optional, advisory only |
| `learning-hub-updater.md` | Agentic learning content update source | Not relevant |
| `learning-hub-updater.lock.yml` | Compiled learning update workflow | Not relevant |
| `pr-duplicate-check-writer.yml` | Privileged duplicate-report writer | Adapt only with safe artifact handling |
| `pr-duplicate-check.md` | Agentic duplicate PR analysis source | Adapt later as advisory |
| `pr-duplicate-check.lock.yml` | Compiled duplicate PR workflow | Generate only if source is adopted |
| `pr-risk-scan-comment.yml` | Writes risk scan comments | Adapt its writer split if needed |
| `pr-risk-scan.yml` | Assesses pull request risk | Consider after deterministic gates |
| `publish.yml` | Materializes and publishes marketplace branch | Do not copy wholesale |
| `resource-staleness-report.md` | Agentic resource age and relevance review | Adapt with longer, evidence-based thresholds |
| `resource-staleness-report.lock.yml` | Compiled staleness workflow | Generate only if source is adopted |
| `setup-labels.yml` | Creates workflow state labels | Adapt if label state machines are adopted |
| `skill-check-comment.yml` | Writes Vally skill-check comments and labels | Adapt with stronger provenance validation |
| `skill-check.yml` | Lints changed skills with Vally | Adopt after fixing exit behavior and runtime pinning |
| `skill-quality-report.yml` | Scheduled catalog quality report | Adapt to structured data and correct ownership |
| `traffic-reporting.yml` | Reports repository traffic | Optional project-health metric, not quality |
| `validate-agentic-workflows-pr.yml` | Blocks generated agentic workflow edits and compiles sources | Adopt if gh-aw is introduced |
| `validate-canvas-extensions.yml` | Validates Canvas extension metadata and assets | Defer until Trove supports extensions |
| `validate-plugins.yml` | Validates plugin and marketplace structure | Adapt into existing Trove validator |
| `validate-readme.yml` | Checks generated README content | Adapt as generated-doc freshness gate |
| `webhook-caller.yml` | Calls an external webhook | Do not adopt without a concrete integration |

## Implementation plan

### Checkpoint 1: Pin the Copilot contract and regression fixtures

Files and subsystems:

- `docs/host-matrix.md`
- `tests/acceptance/fixtures/copilot/`
- new Copilot manifest, marketplace, hook, and collision fixtures
- `scripts/lib/agent-skills-spec.ts`
- `scripts/lib/hooks.ts`

Work:

- Record supported skill fields, discovery paths, component precedence, hook events, runtime differences, and minimum tested Copilot CLI version.
- Add fixtures for valid and invalid manifests, skills, agents, hooks, path variables, duplicate names, and plugin versions.
- Capture the current Claude-fallback installation as a regression fixture.

Observable result:

- Tests express the Copilot contract before generator changes.
- The known fallback installation stays green.

Verification:

```sh
bun test
bun run validate
```

### Checkpoint 2: Add the Copilot host and native generated artifacts

Files and subsystems:

- new `hosts/copilot.ts`
- `hosts/types.ts`
- `hosts/index.ts`
- `scripts/lib/projection.ts`
- `scripts/gen-skills.ts`
- `scripts/gen-plugins.ts`
- `scripts/gen-marketplace.ts`
- `scripts/validate.ts`
- generated `.plugin/`, `.github/plugin/`, and Copilot skill outputs

Work:

- Add `"copilot"` to the `HostName` union in `hosts/types.ts` and register `hosts/copilot.ts`. **Revised:** do not add a `ProjectionProfile` member — Copilot uses the existing `strict` profile (see Skill projection above).
- Generate `.plugin/plugin.json` per plugin and `.github/plugin/marketplace.json` at repository scope.
- Project attached skills and supporting files with Copilot's allowlisted metadata, platform filters, content rewrites, and tool-preapproval omission. Materialize them under each plugin’s `.copilot/skills/`, with no cross-host overwrites.
- Generate Copilot hook paths with `${PLUGIN_ROOT}`.
- Validate manifest references, component inventory, schema, and marketplace-to-plugin version equality.
- Detect missing, changed, and obsolete generated files, including supporting files. CI must check the committed state before a build repairs it; a build followed only by dry-run proves idempotency, not committed freshness.
- Extend dry-run freshness to every generated stage. **Revised — this is a real gap, not a formality.** Only `gen-skills.ts`, `gen-routing.ts`, and `gen-deps.ts` accept `--dry-run` today. `gen-plugins.ts` and `gen-marketplace.ts` do not, leaving those generated manifests outside the current freshness checks. This is a coverage gap; it does not establish the historical cause of the drift. Adding `--dry-run` to both is a prerequisite for the freshness gate, not an optional extra.

Observable result:

- `bun run build` emits a complete native Copilot catalog.
- Re-running every generator in dry-run mode reports no changes.
- Every generated manifest version equals `VERSION`.

Verification:

```sh
bun run build
bun run validate
bun run build:skills -- --dry-run
bun run build:plugins -- --dry-run      # new in this checkpoint
bun run build:marketplace -- --dry-run  # new in this checkpoint
bun run build:routing -- --dry-run
bun run build:deps -- --dry-run
git diff --check
```

### Checkpoint 3: Make setup and documentation first-class

Files and subsystems:

- `setup`
- setup state and uninstall helpers
- `README.md`
- `docs/getting-started.md`
- `docs/cross-platform.md`
- `docs/host-matrix.md`
- `docs/plugin-authoring.md`
- `docs/skill-authoring.md`
- `docs/bootstrap.md`
- `docs/self-upgrade.md`

Work:

- Replace the Copilot-to-AGENTS alias with native marketplace add and role-filtered plugin install.
- Preserve `--host agents` as the explicit generic fallback.
- Make repeated setup convergent and uninstall ownership-aware.
- Document local development install, marketplace install, update, uninstall, component precedence, and prompt-hook limits.
- Correct the blanket statement that Copilot lacks session-start support. Document the interactive, programmatic, and cloud distinctions.

Observable result:

- A user can select Copilot explicitly and receives native plugins.
- Repeated setup and uninstall do not alter unrelated user state.

Verification:

```sh
tests/acceptance/setup-links.sh
bun test
```

### Checkpoint 4: Add isolated Copilot acceptance and CI

Files and subsystems:

- `tests/acceptance/harness-bootstrap.sh`
- `tests/acceptance/run-artifact-checks.sh`
- new Copilot installation smoke script
- `.github/workflows/validate.yml`
- `.github/workflows/release.yml`

Work:

- Use a temporary fixture working directory outside the repository and its ancestors, plus isolated home, XDG config/data/cache, `COPILOT_HOME`, and `COPILOT_CACHE_HOME` directories. Clear inherited plugin/skill configuration overrides and credentials. Verify no reads or writes escape the fixture; temporary HOME alone does not isolate project discovery or every cache.
- Add the local marketplace, browse it, install all first-party plugins, and compare installed inventory and versions with `marketplace.yaml`.
- Verify each installed skill, agent, hook, and supporting file.
- Test hook scripts with fixture payloads. Keep prompt-only interactive coverage documented separately.
- Pin the Copilot CLI version in CI and provide a scheduled canary job for latest-version drift.
- Pin a tested exact Bun version across the seven runtime call sites in validate, release, and upstream-sync workflows.
- Add an explicit deterministic eval-structure gate with merge-base changed scope, failure on missing required suites, and a distinct skipped-model result. Include `scripts/eval-runner.ts` and its fixtures in this checkpoint; `eval:changed` alone is insufficient.
- Make generated artifact freshness and Copilot smoke required before release.

Observable result:

- CI proves all seven plugins install without touching a developer's real Copilot state.
- Release cannot proceed with stale manifests or a broken Copilot catalog.

Verification:

```sh
bun run test:acceptance:artifacts
bun run test:acceptance:setup
tests/acceptance/copilot-install-smoke.sh  # new: real isolated install/inventory test
bun run eval:changed  # diagnostic today; add the explicit structural gate described above
```

A committed sample transcript tests the transcript parser only. Any claimed
interactive bootstrap coverage needs a newly captured transcript recording CLI
version, artifact revision, and invocation. Installation and hook-script unit
tests do not prove model activation or end-to-end hook context injection.

### Checkpoint 5: Add deterministic skill gates and structured quality reporting

Files and subsystems:

- new `scripts/quality-report.ts`
- new versioned report schema and tests
- `.github/workflows/skill-check.yml`
- optional `.github/workflows/skill-check-comment.yml`
- `.github/workflows/skill-quality-report.yml`
- `package.json`

Work:

- Reuse Trove validation and evaluation results.
- Integrate a pinned Vally version under a supported runtime.
- Fail explicitly on blocking findings.
- Emit JSON first and render Markdown from it.
- Add the scorecard, hard blockers, changed-scope execution, artifact retention, and trend comparison.
- If comments are enabled, implement the two-workflow analyzer and trusted-writer design.

Observable result:

- A broken changed skill fails the check.
- A warning remains visible without failing.
- Nightly reports are reproducible and comparable over time.

Verification:

```sh
bun run validate
bun run eval:changed  # diagnostic today; add the explicit structural gate described above
bun test
```

Use fixture pull requests or local event payloads to prove stale and forged writer artifacts are rejected.

### Checkpoint 6: Add external plugin intake only after policy approval

Files and subsystems:

- marketplace external-source schema
- new external quality-gate script
- intake, command router, writer, and re-review workflows
- policy documentation and fixtures

Work:

- Decide whether Trove accepts external plugins and what licenses, hosts, and component types are allowed.
- Add immutable source and explicit review metadata.
- Run clone, validation, and Copilot install in an isolated unprivileged environment.
- Implement maintainer commands and an idempotent six-month review process.
- Separate infrastructure errors from submitter action items.

Observable result:

- An external plugin cannot enter the catalog without a reviewed immutable revision.
- Every approval, override, re-review, and removal is auditable.

Verification:

- Exercise valid, mutable-ref, missing-license, malicious-path, install-failure, infrastructure-failure, stale-review, keep, needs-changes, and remove fixtures.
- Confirm fork pull requests never receive secrets or a write token.

### Checkpoint 7: Add advisory agentic maintenance and pilot upstream skills

Files and subsystems:

- optional `.github/workflows/*.md` gh-aw sources and generated lock files
- `upstream.yaml`
- selected canonical skill sources and evals
- ownership and maintenance documentation

Work:

- Pilot semantic duplicate detection, staleness review, and vendor drift as advisory workflows.
- Require safe outputs and prevent direct edits to generated lock workflows.
- Pilot at most `github-actions-hardening`, `test-gap-audit`, and `docs-sync-audit` after review.
- Record provenance, license, overlap decision, local patches, evals, owner, and removal criteria.

Observable result:

- Agentic findings inform maintainers without blocking deterministic delivery.
- Every adopted skill has traceable origin and behavioral evidence.

Verification:

```sh
bun run sync:upstream -- --check
bun run build
bun run validate
bun test
bun run eval:gate
```

## Upstream sync workflow changes

`.github/workflows/upstream-sync.yml` is the mechanism checkpoint 7 depends
on, and it needs work before `awesome-copilot` becomes a source. Reviewed
against the current file.

### What already holds up

Top-level `permissions: contents: read` with per-job restatement; every third-party
action pinned to a full commit SHA; write path gated behind both
`workflow_dispatch` and a `vars.UPSTREAM_SYNC_WRITES_ENABLED == 'true'`
repository variable; deterministic JSON plus rendered Markdown, matching the
"structured data first" rule this plan applies elsewhere; a branch-exists check
that refuses to overwrite an automation branch whose content differs.

### Required before adding `awesome-copilot`

1. **Set `persist-credentials: false` on the `check` job checkout.** The check
   job runs `sync:upstream --check`, which clones third-party repositories.
   With the default `persist-credentials: true`, the `GITHUB_TOKEN` is written
   into `.git/config` in a job that then processes untrusted upstream content.
   The job never pushes, so it has no need of the credential. This is the
   plan's own "treat cloned repositories as untrusted input" guardrail applied
   to the one workflow that actually clones them. *(Present in the pre-existing working-tree change; not applied by this plan review.)*

2. **Surface scheduled drift where a human sees it.** A weekly run that finds
   drift currently uploads an artifact and exits successfully. Nobody opens
   artifacts on a green run. Append the rendered Markdown report to
   `$GITHUB_STEP_SUMMARY` so the run page itself shows the finding.
   *(Present in the pre-existing working-tree change.)*

3. **Confirm the policy block covers `awesome-copilot`'s shape.**
   `upstream.yaml` sets `maximum_file_bytes: 262144`,
   `maximum_artifact_bytes: 4194304`, `allow_binary: false`,
   `allow_generated: false`. The `awesome-copilot` repository contains
   generated `.lock.yml` workflows and website assets. Vendoring a skill
   subtree should be unaffected, but checkpoint 7 must verify per-artifact
   `include`/`exclude` globs actually exclude them before the first sync runs,
   rather than discovering it from a failed scheduled job.

4. **Record the three pilot skills as `upstream.yaml` artifacts, not ad-hoc
   copies.** `github-actions-hardening`, `test-gap-audit`, and
   `docs-sync-audit` each need `base_sha`, `base_tree_digest`,
   `local_tree_digest`, `patch_digest`, `license`, and `status`, exactly like
   the existing `vercel-agent-skills` and `last30days-skill` entries. This is
   what makes the provenance dimension of the scorecard measurable instead of
   aspirational.

### Runtime pinning and deferred privilege separation

**Pinning `bun-version` moves into checkpoint 4.** Pin one tested exact Bun
version across all seven current call sites in `validate.yml`, `release.yml`,
and `upstream-sync.yml`. Use a shared version file where practical, frozen
lockfile installation, and a scheduled upgrade/canary process. An exact version
must be selected from a passing baseline, not guessed in this document.

**Untrusted clones in the `update` job.** The update job holds
`contents: write`, `pull-requests: write`, and `UPSTREAM_SYNC_TOKEN`, and it
also clones upstream. Splitting it into an unprivileged fetch-and-diff job plus
a privileged `workflow_run` committer is the same analyzer/writer pattern this
plan adopts for PR comments. It is worth doing, but it is a larger change than
the Copilot work requires, and the existing manual dispatch plus
`UPSTREAM_SYNC_WRITES_ENABLED` gate bounds the exposure meanwhile. Schedule it
with checkpoint 5, where the writer pattern is being built anyway.

## Throughput review

### Can independent work run in parallel?

After checkpoint 1 defines the contract, checkpoint 3 documentation can begin alongside checkpoint 2 implementation. The scorecard schema in checkpoint 5 can be designed alongside checkpoint 4. External intake and agentic workflows should not start early because they depend on stable native artifacts and quality results.

### Can validation move earlier?

Yes. Manifest, projection, and hook fixtures belong in checkpoint 1. Isolated fallback installation should remain a baseline test throughout the work. Quality report schemas and hard-blocker semantics should be tested before workflow YAML is written.

### Can feedback loops be shortened?

Yes. Keep local checks ordered from cheapest to most expensive. Run schema and changed-scope validation first, then build freshness, isolated install smoke, and model-backed evals. Run the full catalog and latest Copilot canary on a schedule.

### Are there unnecessary hard dependencies?

The native Copilot host does not require public external submissions, gh-aw, a website, Canvas extensions, or a full Agent Plugins migration. These remain separate decisions.

## Security and operational guardrails

- Pin third-party Actions to full commit SHAs.[^actions-secure]
- Pin Copilot CLI and Vally in required workflows. Test latest versions separately.
- Give analyzers `contents: read` and no secrets.
- Never execute pull-request code in a privileged `workflow_run` or `pull_request_target` writer.
- Treat artifacts, issue bodies, comments, plugin manifests, and cloned repositories as untrusted input.
- Apply file-count, byte-size, path traversal, timeout, and process limits.
- Avoid mutable external refs in accepted marketplace entries.
- Preserve unrelated developer plugin state during setup and tests.
- Make automation branches and comments idempotent.
- Keep required gates deterministic and inspectable.

## Decisions required before execution

The following are recommended defaults based on this review. They resolve the
plan's design choices for implementation planning; they do not record approval
to publish, enable external intake, or start implementation in this review task.

| # | Decision | Recommendation and rationale | Execution consequence |
| --- | --- | --- | --- |
| 1 | Native manifest layout | Use per-plugin `.plugin/plugin.json` and repository `.github/plugin/marketplace.json`; defer Agent Plugins migration. Both precede Trove’s existing fallback. | Checkpoints 1–2 test discovery precedence and reject accidental higher-priority competing catalogs. |
| 2 | Setup meaning | Make `--host copilot` native; retain explicit `--host agents` fallback. This gives users a predictable installation contract. | Checkpoint 3 uses tested singular lifecycle commands, ownership records, and convergent setup. |
| 3 | Quality comments and labels | Defer. Job summaries and artifacts provide useful results without a privileged writer. | Omit comment/label workflows from the first release; add only when report usage demonstrates a need. |
| 4 | External third-party plugins | Defer public intake and remote catalog entries. First-party native support is the release scope. | Checkpoint 6 is a separate governance project, with immutable revisions and isolation before enablement. |
| 5 | Upstream pilot | Retain the three-candidate shortlist for evaluation; start with `github-actions-hardening`, then assess `test-gap-audit` and `docs-sync-audit`. Prefer extending existing skills where overlap is substantial. | No copies in the first release. Each later adoption needs a source SHA, license review, owner, overlap decision, and eval evidence. |
| 6 | Skill projection | Reuse `strict` and the `.agents/skills` project convention; create separate Copilot output and plugin bundles. Omit tool pre-approval initially and test undocumented metadata acceptance. | No new projection profile by default; add host config, content rewrites, packaging, and compatibility fixtures. |
| 7 | Bun version | Pin one tested exact version repository-wide, with deliberate upgrade PRs and a nonblocking latest canary. Reproducibility outweighs automatic runtime upgrades in required checks. | Include all seven current workflow call sites in checkpoint 4. |

Two technical acceptance conditions remain to be measured, rather than decided
by preference: the exact Copilot version/inventory contract in checkpoint 1,
and the exact Bun/Vally versions that pass their baselines. Recommend starting
Copilot tests at installed 1.0.69, retaining its supported singular commands,
and raising the minimum only if a required feature cannot be implemented and
tested there. The hook-variable release 1.0.26 is not a sufficient minimum.

## Plan readiness gate

**Recommendation: A, proceed with checkpoint 1 when implementation is requested.**
The seven choices above have concrete defaults; none requires another design
round before contract testing. Checkpoints 2–4 proceed only after checkpoint 1
resolves the observed CLI/documentation mismatch and packaging fixtures pass.
Checkpoint 5 follows native support; checkpoints 6–7 remain deferred.

This review updates the plan only. It does not claim Copilot support, new CI
gates, or upstream imports have been implemented or verified end to end.

## Sources

[^copilot-about-plugins]: GitHub Docs, [About plugins](https://docs.github.com/en/copilot/concepts/agents/about-plugins).
[^copilot-plugin-creating]: GitHub Docs, [Creating plugins for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating).
[^copilot-marketplace]: GitHub Docs, [Creating and sharing plugin marketplaces](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace).
[^copilot-plugin-reference]: GitHub Docs, [Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference).
[^copilot-hooks]: GitHub Docs, [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-reference).
[^copilot-customization]: GitHub Docs, [Customization cheat sheet](https://docs.github.com/en/copilot/reference/customization-cheat-sheet).
[^agent-plugins-spec]: Agent Plugins, [Specification](https://agent-plugins.org/specification).
[^agent-plugins-manifest]: Agent Plugins, [Plugin manifest](https://agent-plugins.org/plugin-authors/manifest).
[^gh-aw-about]: GitHub Agentic Workflows, [About](https://github.github.com/gh-aw/about/).
[^gh-aw-how]: GitHub Agentic Workflows, [How they work](https://github.github.com/gh-aw/introduction/how-they-work/).
[^gh-aw-compile]: GitHub Agentic Workflows, [Compilation process](https://github.github.com/gh-aw/reference/compilation-process/).
[^actions-secure]: GitHub Docs, [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).
[^pull-request-target]: GitHub Docs, [Secure use of pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
[^actions-metrics]: GitHub Docs, [Actions metrics](https://docs.github.com/en/actions/concepts/metrics).
[^vally]: Microsoft, [Vally CLI package](https://www.npmjs.com/package/@microsoft/vally-cli). The core `@microsoft/vally` package declares Node.js >= 22; the CLI wraps it, so the same floor applies. Verified 2026-09-09.
[^copilot-add-skills]: GitHub Docs, [Adding agent skills for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills). Source for the four documented `SKILL.md` frontmatter fields and the `.github/skills` / `.claude/skills` / `.agents/skills` discovery roots. Verified 2026-09-09.
[^copilot-cli-commands]: GitHub Docs, [Copilot CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference). Source for `copilot plugins list --json`, `enable`, `disable`, `remove`. Verified 2026-09-09.
[^copilot-cli-1026]: GitHub, [Copilot CLI release 1.0.26](https://github.com/github/copilot-cli/releases/tag/v1.0.26) — plugin hooks receive `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, and `CLAUDE_PLUGIN_ROOT`. Verified 2026-09-09.

### Verification log

Pages re-read on 2026-09-09: CLI plugin reference, hooks reference, plugin
creation how-to, add-skills how-to, CLI command reference, customization cheat
sheet, Vally package. Local Copilot CLI at time of writing: 1.0.69.

Review evidence added in this pass: inspected host configuration, skill/plugin
generators, eval-runner exit and changed-scope behavior, acceptance harness,
package scripts, VERSION, and all three runtime-bearing workflows. Re-read
GitHub plugin, skills, hook, and command references. Locally confirmed CLI
1.0.69 and singular plugin help; plural plugin help failed as described above.
The earlier seven-plugin installation report is retained as historical evidence
and was not rerun during this document review.
