# Skill Authoring Guide

The canonical skill source is `skills/<category>/<skill>/SKILL.md.tmpl`. The build (`bun run build`) projects each template into host-native artifacts (Claude `SKILL.md`, Cursor `.agents/skills` plus filtered `.mdc` rules, Codex `.agents/skills/...`, OpenCode skills, Gemini extension context, and scoped `AGENTS.md`). Author once, ship everywhere.

## Frontmatter (v2)

The v2 schema is **additive over v1**: every field is optional, and the legacy `paths:` field is still tolerated. Prefer the v2 fields for new skills.

```yaml
---
name: trove-example                 # required, kebab-case, no colons
description: |                     # required, 1–3 sentences
  What this skill does and when it activates.
  Used as the Cursor skill/rule description and the AGENTS.md section header.
version: 1.0.0                     # optional, semver
preamble-tier: 2                   # optional, 1-4 (default 2)
user-invocable: false              # optional; true = manual / agent-requested only
activation:                        # optional v2 block
  globs:                           #   auto-attach file globs
    - "**/*.ts"
    - "**/*.tsx"
  manual: false                    #   if true, skill never auto-attaches
triggers:                          # optional, 2-4 natural-phrasing prompts
  - example workflow
  - run example
benefits-from:                     # optional, advisory cross-skill links
  - trove-review
  - trove-secret-scan
allowed-tools:                     # optional Claude-only field; stripped for other hosts
  - Read
  - Bash
---
```

| Field | Purpose | Used by |
|---|---|---|
| `name` | Stable identifier | All hosts |
| `description` | One-paragraph summary | Cursor skill/rule `description`, AGENTS.md header, routing index, CLI |
| `version` | Skill semver | Tooling that compares skill changes |
| `preamble-tier` | Which `{{PREAMBLE:N}}` tier to inject | Build (resolver) — see [preamble-tiers.md](./preamble-tiers.md) |
| `user-invocable` | If `true`, skill only runs on explicit ask | Cursor skill/rule mode, Claude routing |
| `activation.globs` | Auto-attach file globs (canonical v2) | Cursor skill `paths:` + rule `globs:`, Claude attach surface, routing index |
| `activation.manual` | If `true`, never auto-attach regardless of globs | Build, routing index |
| `triggers` | Natural-phrasing prompts for routing | Routing index, AGENTS.md summaries |
| `benefits-from` | Advisory cross-skill pairings | Validate (cycle check), CLI `info`, routing reverse-lookup |
| `allowed-tools` | Restrict the agent's tool surface (Claude only) | Claude only — stripped from Cursor/Codex/AGENTS |
| `paths` *(legacy v1)* | Same as `activation.globs` — comma-separated string | Still read; emit `activation.globs` for new skills |

`triggers:` are flexibly matched by the host, **not** exact slash-command names. Keep them short (2–4), favor natural phrasing, avoid overlap with sibling skills, don't stuff aliases — cap is 4.

`benefits-from:` is **advisory only**. Nothing auto-runs the listed skills. Cycles and references to unknown skills surface as warnings during `bun run validate`. See [orchestration.md](./orchestration.md#benefits-from-metadata).

## Skill naming and the `trove-` prefix

Skills inside `trove-*` plugins are named with a `trove-` prefix (e.g., `trove-ship`, `trove-commit`). On Claude Code this produces a stuttered invocation form such as `/trove-workflow:trove-ship` or `/trove-dev:trove-commit`. **This is intentional.** The prefix is the only disambiguator on hosts that expose skills or rules in a flat namespace:

| Host | Disambiguation primitive | Why the prefix is needed |
|---|---|---|
| Claude Code | `plugin:skill` qualified form | Not needed — but kept for cross-host consistency |
| OpenAI Codex | None — flat `$skill-name` invocation | Prefix prevents collisions across plugins |
| Cursor | None — flat skill/rule names | Prefix prevents collisions across plugins |
| OpenCode | None — generated `use_skill` takes flat skill names | Prefix prevents collisions across plugins |
| Gemini CLI | Extension context only for bootstrap today | Prefix keeps generated context grep-able and future-proof |
| AGENTS.md | Per-plugin file path | Not needed for invocation, kept for grep-ability |

Removing the prefix to clean up the Claude form would require per-host folder namespacing in the build pipeline (substantial refactor) and a breaking change for users. The cost-benefit doesn't favor that today.

**Watch for the upstream fix.** Anthropic is tracking [`require-namespace: true`](https://github.com/anthropics/claude-code/issues/43695) — a frontmatter field that suppresses the unqualified short form on Claude Code. When that ships, set it on prefixed skills to drop the stutter without renaming anything: `/trove-workflow:trove-ship` would still resolve and the prefix continues to namespace on Codex/Cursor.

## Body

```markdown
{{PREAMBLE}}

# <Skill Name> — <one-line purpose>

## …content…
```

`{{PREAMBLE}}` is replaced with the **tier-2 preamble** by default (`templates/preamble-tier-2.md`). To override, write `{{PREAMBLE:1}}`, `{{PREAMBLE:3}}`, or `{{PREAMBLE:4}}`, **or** set `preamble-tier:` in frontmatter and keep the `{{PREAMBLE}}` token unannotated. See [preamble-tiers.md](./preamble-tiers.md).

`{{VERSION}}` resolves to the marketplace `VERSION` file's contents.

Add new placeholders in `scripts/resolvers/index.ts`.

## Decision Gates

When a skill needs to pause and ask the user, use the standard format:

```markdown
## Decision Gate: test strategy

Context: This change affects deployment confidence.
Question: Should I optimize for iteration speed or broader regression coverage?
Options:
- A. Add broader tests before shipping.
- B. Ship the fix with narrow tests only.
Default: A, because it lowers regression risk.
```

The lint in `scripts/validate.ts` checks for:

- `## Decision Gate: <topic>` heading
- `Context:` line — *warns* if missing
- `Question:` line — *warns* if missing
- `Options:` header followed by at least two lettered bullets (`- A.`, `- B.`) — *errors* if missing
- `Default:` line — *warns* if missing

The "errors on missing options" rule is intentional: a gate without options is unusable. Everything else is a warning so authors can drop in gates incrementally.

## Activation: when does this skill fire?

| Frontmatter shape | Cursor output | Claude behavior |
|---|---|---|
| `activation.globs:` set | SKILL.md with `paths:` plus `.mdc` Auto Attached rule; explicit `user-invocable: false` also maps to `disable-model-invocation: true` | Surfaced when matching files are open |
| no `activation.globs`, `user-invocable: true` | SKILL.md only | User must @-reference / ask |
| no `activation.globs`, `user-invocable: false` (or unset) | SKILL.md only; explicit `false` maps to `disable-model-invocation: true` | Agent fetches by description |
| `activation.manual: true` | SKILL.md only | Manual (overrides globs) |

`alwaysApply: true` ("Always" rules in Cursor terms) is produced only for
explicit, pathless, non-user-invocable discipline anchors such as
`using-trove`. Do not use it for ordinary skills; it burns context on every
request.

## Cross-host projection

The build emits host-native artifacts from the canonical template (full table in [cross-platform.md](./cross-platform.md)):

- **Claude Code** → `skills/<category>/<skill>/SKILL.md` (in place)
- **Cursor** → `output/cursor/.agents/skills/<skill>/SKILL.md` plus `output/cursor/rules/<skill>.mdc` only for glob/always-on context
- **OpenAI Codex** → `output/codex/.agents/skills/<skill>/SKILL.md`
- **OpenCode** → `output/opencode/skills/<skill>/SKILL.md` plus plugin bootstrap TS where applicable
- **Gemini CLI** → `output/gemini/plugins/<plugin>/GEMINI.md` for bootstrap anchors
- **Generic AGENTS.md** → contributes a section to `output/agents/plugins/<plugin>/AGENTS.md`

You can inspect the projected output for a single host:

```bash
bun run build:skills -- --host cursor
```

## Routing index

`bun run build:routing` regenerates [routing.md](./routing.md) from every skill's `name`, `description`, `triggers`, and `activation.globs`. CI runs it in dry-run mode; if your template change makes the index stale, the build fails. Re-run `bun run build:routing` to refresh.

## Common workflows

### Add a new skill to an existing plugin

```bash
bun run scaffold:skill -- --plugin trove-dev --name trove-debug
# edit skills/<category>/trove-debug/SKILL.md.tmpl
bun run build && bun run validate && bun test
```

### Update an existing skill

```bash
# edit skills/<category>/<skill>/SKILL.md.tmpl
bun run build       # regenerates host outputs
bun run validate    # frontmatter + decision-gate lint
```

### Author a Decision Gate

1. Heading: `## Decision Gate: <short topic>`
2. Add `Context:`, `Question:`, `Options:` (with `- A.`/`- B.` bullets), `Default:`
3. `bun run validate` — warns on missing pieces, errors on missing options

## What you should *not* author

- Don't hand-roll routing pointers across skills. Add `triggers:` to your frontmatter and let `gen-routing.ts` produce the index.
- Don't duplicate tier preamble content in skill bodies — pick a tier instead.
- Don't add `paths:` for new skills — use `activation.globs:`. (`paths:` still works for legacy v1 skills; the build mirrors v1 → v2 automatically.)
- Don't list five potentially-related skills in `benefits-from:` to look thorough. The list grows stale and the cycle warning fires.
