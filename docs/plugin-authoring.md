# Plugin Authoring Guide

Plugins bundle skills, hooks, agents, and MCP server declarations. One plugin manifest, ships to every host.

## Create a new plugin

### 1. Scaffold

```bash
bun run scaffold:plugin -- --name trove-testing --role dev --category development
```

Creates:

```
plugins/trove-testing/
├── plugin.yaml          # manifest — edit this
├── README.md            # plugin docs
├── skills/              # Claude/Codex SKILL.md files copied here at build time
├── .agents/skills/      # Cursor-projected SKILL.md files copied here at build time
├── hooks/               # shell scripts for lifecycle events
├── agents/              # agent definitions (Claude/Cursor)
├── commands/            # legacy Claude slash commands; prefer skills
├── mcp/                 # MCP server configs
└── rules/               # Cursor-specific rule files
```

### 2. Add a skill

```bash
bun run scaffold:skill -- --plugin trove-testing --name trove-unit-test --auto-attach "**/*.test.ts"
```

Creates a `SKILL.md.tmpl` template and registers it in the plugin's `plugin.yaml`.

### 3. Write the skill body

Edit `skills/<category>/<skill-name>/SKILL.md.tmpl`:

```markdown
---
name: trove-unit-test
description: Unit testing conventions and patterns. Auto-activates on test files.
preamble-tier: 2
activation:
  globs: ["**/*.test.ts", "**/*.spec.ts"]
triggers:
  - unit test conventions
  - test this function
benefits-from:
  - trove-review
---

{{PREAMBLE}}

# Unit Testing Conventions

…
```

See [skill-authoring.md](./skill-authoring.md) for the full frontmatter reference.

### 4. Build and validate

```bash
bun run build         # runs all 5 stages
bun run validate      # frontmatter, naming, hooks, MCP, secrets
```

> **Where a bundled skill's source comes from.** `build:plugins` copies each
> skill's generated `SKILL.md` into `plugins/<plugin>/skills/<name>/` from the
> **canonical** `skills/<category>/<name>` source, so editing a template
> refreshes the bundle on the next build. The plugin-local copy is only treated
> as the source when it has its *own* `SKILL.md.tmpl` — i.e. a skill authored
> directly in the plugin, such as the `trove-dev` deprecation-alias stubs. A
> plugin-local dir holding only a generated `SKILL.md` is the copy destination,
> never the source. (Note: only `build:skills` has a CI freshness check today;
> `build:plugins` freshness is a tracked TODO, so re-run `bun run build` and
> commit the refreshed bundles when you change an existing skill.)
>
> Cursor gets a separate bundle copy at
> `plugins/<plugin>/.agents/skills/<name>/SKILL.md`. Its plugin manifest points
> there so Cursor sees only Cursor-supported frontmatter while Claude and Codex
> keep using `plugins/<plugin>/skills/<name>/`.

### 5. Test locally

```bash
# Claude Code — point at your local checkout
/plugin marketplace add /path/to/trove
/plugin install trove-testing@trove

# Or symlink for fast iteration on a single skill
# Personal skills are discovered at ~/.claude/skills/<skill>/SKILL.md — a
# grouping folder in between is read as a skill directory with no SKILL.md.
ln -sf /path/to/trove/skills/coding/trove-unit-test \
  ~/.claude/skills/trove-unit-test
```

## `plugin.yaml` reference

```yaml
name: trove-testing                       # required, kebab-case, trove- prefix
                                          # no `version` — generated manifests
                                          # are stamped from the VERSION file
description: "Testing skills and patterns"
author:
  name: Trove Contributors
homepage: https://github.com/bravew/trove
license: MIT
keywords: [testing, unit-test, e2e]
category: development                    # development | design | product | security | infrastructure | observability | research
roles: [dev]                             # dev | design | pm | devops

skills:
  - path: ./skills/trove-unit-test        # relative to plugin root
    platforms: [claude, cursor, codex, agents, gemini]
    auto_attach:
      globs: ["**/*.test.ts"]            # mirrors the skill's own activation.globs

# Lifecycle hooks (Claude Code surface; partial Cursor support; ignored elsewhere).
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      command: "${PLUGIN_ROOT}/hooks/auto-lint.sh"
      description: "Auto-lint after file writes"

# MCP servers — projected to host-native invocation form by the build.
mcp_servers:
  test-runner:
    type: http
    url: https://example.com/mcp
    optional: true
    description: "Optional test runner integration."
    tools: [run_tests, get_results]

# Per-host overrides (rare).
platforms:
  claude: { strict: true }
  cursor: { rules_dir: ./rules/ }        # emitted only when rules are copied
```

Supported skill `platforms:` keys are `claude`, `cursor`, `codex`, `agents`,
`opencode`, and `gemini`. Most ordinary skills should target
`[claude, cursor, codex, agents]`; add `opencode` when the skill should be
available through the generated OpenCode plugin. `gemini` is currently used
for workflow bootstrap context rather than general skill invocation.

Claude slash commands are legacy-compatible, but first-party plugins should
model repeatable workflows as skills. Use `user-invocable: true` and, for
user-only entry points, `disable-model-invocation: true` instead of adding a
new command prompt.

The validator (`scripts/validate.ts`) enforces:

- Plugin name uses `trove-` prefix (warning if not — for first-party plugins)
- Skill paths exist and have a readable `SKILL.md.tmpl`
- Hook events are in the supported list (see [hooks.md](./hooks.md))
- Hook scripts exist at the resolved path (error) and are executable (warning)
- MCP `url` or `command` is present (one of)
- No `..` path traversal in skill `path:` entries
- Skill body has no unresolved `{{...}}` tokens after build

## Skill quality checklist

Before merging a new skill or major skill update:

- [ ] Name is `trove-<thing>`, kebab-case, ≤ 64 chars
- [ ] `description:` is 1–3 sentences saying *what it does* and *when it activates* (≤ 1024 chars)
- [ ] Body is under 500 lines (warning past that)
- [ ] `{{PREAMBLE}}` is at the top of the body — pick the smallest tier that fits ([preamble-tiers.md](./preamble-tiers.md))
- [ ] `activation.globs:` is set if the skill should auto-attach to specific files
- [ ] `triggers:` has 2–4 natural-phrasing prompts, no slash-command syntax
- [ ] `benefits-from:` lists clear pairings only — not speculative
- [ ] Long supporting docs live in `references/`, not inline
- [ ] Long scripts live in `scripts/`, not inline code blocks
- [ ] AI gotchas section included for stack-specific skills (e.g., "models often write blocking calls in async contexts")
- [ ] `bun run validate` passes
- [ ] `bun test` passes (skill schema and projection tests)

## Template placeholders

Resolved by `scripts/resolvers/index.ts` at build time:

| Placeholder | Resolves to |
|-------------|-------------|
| `{{PREAMBLE}}` | Tier-2 preamble (default) |
| `{{PREAMBLE:1}}` | Tier 1 — minimal version stamp |
| `{{PREAMBLE:3}}` | Tier 3 — adds routing pointer |
| `{{PREAMBLE:4}}` | Tier 4 — orchestrator delegation reminder |
| `{{VERSION}}` | Contents of the marketplace `VERSION` file |

Add a new placeholder by adding a key to `resolvers` in `scripts/resolvers/index.ts`.

## Register in the marketplace

After scaffolding, add the plugin to `marketplace.yaml`:

```yaml
plugins:
  - name: trove-testing
    source: trove-testing                 # path under plugins/, or a github source object for curated externals
    description: "Testing skills and patterns"
    category: development
    tags: [testing, unit-test, e2e]
    roles: [dev]
```

For curated third-party plugins, only add an entry when it projects as a real
installable plugin for at least one host, and pin the SHA on the source ref:

```yaml
- name: sentry-tools
  source:
    source: github
    repo: getsentry/sentry-for-ai
    ref: main
    sha: 72aadac7a1f4c7ae6b6c1bf8794aff2265b1f151    # required — validate errors without it
```

Then `bun run build` to regenerate marketplace catalogs across every platform.
