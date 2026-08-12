# Getting Started

The Trove delivers coding skills, workflow bootstrap, hooks, agents, and MCP server hookups to your AI coding assistant. One marketplace, six projection surfaces — Claude Code, Cursor, OpenAI Codex, OpenCode, Gemini CLI, and any tool that reads `AGENTS.md` (Copilot, Windsurf, Aider, Junie).

## Install

### Claude Code (recommended)

```bash
# Add the marketplace
/plugin marketplace add bravew/trove

# Install plugins by role
/plugin install trove-dev@trove        # Engineers
/plugin install trove-workflow@trove   # Workflow bootstrap
/plugin install trove-design@trove     # Designers
/plugin install trove-product@trove    # PMs
/plugin install trove-security@trove   # Everyone
/plugin install trove-infra@trove      # DevOps
```

### Cursor

```bash
cursor plugin marketplace add bravew/trove
cursor plugin install trove-dev@trove
cursor plugin install trove-workflow@trove
```

### Universal — auto-detect

```bash
git clone https://github.com/bravew/trove.git ~/.trove
cd ~/.trove && ./setup
```

The `setup` script auto-detects supported local installers: Claude Code,
Cursor, Codex, Copilot/AGENTS.md, and generic AGENTS.md. Scope it with flags:

```bash
./setup --host claude                # only Claude Code
./setup --host cursor --host codex   # multiple hosts
./setup --role dev                   # only dev plugins
```

OpenCode and Gemini artifacts are generated under `output/opencode/` and
`output/gemini/` for host-specific installation.

## What you get

| Plugin | For | Skill highlights |
|--------|-----|------------------|
| `trove-dev` | Engineers | Python · React · Vue · Swift · Lambda · TypeScript · TDD · architect · perf · review · commit · explain |
| `trove-workflow` | Engineers | using-trove bootstrap · brainstorm · plan · execute · debug · dispatch · verify · worktree · ship · autoplan · why · refactor · unslop · reflect · show-work · arena · 6 design-discipline principles |
| `trove-design` | Designers | Component specs · accessibility · design review · visual parity |
| `trove-product` | PMs | Specs · user stories · release notes |
| `trove-security` | All | Security review · secret scanning |
| `trove-infra` | DevOps | Terraform · AWS CDK · Docker |

**52 first-party skills** total. Optional MCP connector metadata lives on the role plugins; curated third-party entries are added only after they project as real installable plugins.

For the full skill inventory with file-glob auto-attach and natural-language triggers, see [routing.md](./routing.md) — it's auto-generated from skill frontmatter.

## How it works

1. **Skills** are Markdown files with YAML frontmatter (`SKILL.md.tmpl`) — coding conventions, review checklists, workflow playbooks.
2. **Plugins** bundle related skills, hooks, agents, and MCP servers (e.g., `trove-dev` ships coding conventions while `trove-workflow` ships methodology and bootstrap).
3. The **marketplace** is a catalog (`marketplace.yaml`) your AI tool reads to discover and install plugins.
4. Skills **activate** in three ways depending on frontmatter:
   - **Auto-attach** by file glob — `trove-python` activates whenever `**/*.py` is open
   - **Trigger phrases** — `trove-review` fires on "review this diff" or "code review"
   - **Manual** — `user-invocable: true` skills only run when explicitly asked

## Updating

Releases are automated. On every merge to `main`, `release.yml` runs validate → build → eval:gate → version bump → tag → force-push to the `canary` branch. Users tracking `canary` get updates as soon as they land.

To force a refresh:

```bash
# Claude Code
/plugin marketplace update trove

# Cursor
cursor plugin marketplace add bravew/trove
cursor plugin install trove-dev@trove
cursor plugin install trove-workflow@trove

# Universal install
cd ~/.trove && git pull && ./setup
```

After this upgrade, `trove-dev` no longer ships legacy Claude command prompts
or the deprecated `trove-autoplan` / `trove-ship` aliases. Invoke the replacement
skills directly: `trove-commit`, `trove-ship`, `trove-review`,
`trove-release-notes`, `trove-worktree`, `trove-plan`, and
`trove-execute-plan`. Cursor users should refresh to pick up native
`.agents/skills/` bundles and the reduced `.mdc` rule set.

For the `stable` channel, the marketplace is promoted from `canary` after a 48-hour soak — see [contributing.md](./contributing.md#release-channels).

## Browse the catalog

```bash
# CLI search (alias: ./bin/trove)
trove search "security"
trove list --role=dev
trove info trove-dev
```

The CLI reads `catalog.json` — generated at build time from every plugin's manifest, with skill descriptions, triggers, paths, and `benefits-from` cross-references.

## Health check & upgrade

The `trove` umbrella CLI manages the local install:

```bash
trove doctor      # read-only — Bun toolchain, generated outputs, host adapter dirs, config
trove upgrade     # detection-first — handles git-backed vs vendored vs marketplace-managed
trove config list # ~/.trove/config.yaml — auto-update prefs, learnings cap, host list
```

Doctor never modifies state. Upgrade refuses to act when it can't tell which install path applies.

## Next

- [Plugin Authoring](./plugin-authoring.md) — create your own plugin
- [Skill Authoring](./skill-authoring.md) — frontmatter v2 fields and projection rules
- [Cross-Platform Guide](./cross-platform.md) — what works where
- [Contributing](./contributing.md) — PR flow and release channels
