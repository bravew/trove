# Trove

Open-source plugin marketplace for AI coding assistants. Author skills once in Markdown — ship them to **Claude Code**, **Cursor**, **OpenAI Codex**, **OpenCode**, **Gemini CLI**, and any tool that reads `AGENTS.md`.

**6 first-party plugins, 52 first-party skills, 6 projection surfaces.** Optional MCP connector metadata lives on the role plugins until a curated third-party entry projects as a real installable plugin.

## Install

Copilot CLI reads the generic `AGENTS.md` fallback. Current GitHub docs do not process command output from `sessionStart`, so headless Copilot sessions cannot use the same runtime `additionalContext` path as Claude Code.

```bash
# Claude Code
/plugin marketplace add bravew/trove
/plugin install trove-dev@trove
/plugin install trove-workflow@trove

# Cursor
cursor plugin marketplace add bravew/trove
cursor plugin install trove-dev@trove
cursor plugin install trove-workflow@trove

# Universal — clones, auto-detects supported local installers
git clone https://github.com/bravew/trove.git ~/.trove
cd ~/.trove && ./setup
```

The universal `setup` script installs Claude Code, Cursor, Codex, Copilot/AGENTS.md, and generic AGENTS.md outputs. Pass repeated `--host claude` / `--host cursor` / `--host codex` / `--host copilot` flags to scope, or `--role dev` / `--role design` / `--role pm` to install only role-specific plugins. OpenCode and Gemini artifacts are generated under `output/` for host-specific installation.

## Upgrade

Match the upgrade command to how you installed:

```bash
# Claude Code marketplace install — open /plugin and pick Update from
# the menu, or force a fresh fetch by removing and re-adding:
/plugin marketplace remove trove
/plugin marketplace add bravew/trove
/plugin install trove-dev@trove
/plugin install trove-workflow@trove   # repeat for other enabled plugins

# Cursor marketplace install — open the Plugins panel and Update,
# or remove + re-add via `cursor plugin marketplace add bravew/trove`.

# Universal ./setup clone (recommended for most users)
cd ~/.trove && git pull && ./setup
# or, equivalently, the install-aware upgrader:
./bin/trove upgrade                         # interactive; --check for dry-run
./bin/trove doctor                          # read-only health check
```

`trove upgrade` detects the install type (git-backed clone vs. vendored copy) and refuses to act when uncertain — see [docs/self-upgrade.md](docs/self-upgrade.md). Upgrades never touch your `~/.claude/skills/`, `~/.claude/commands/`, or other user-authored config; plugin contents live in host-managed namespaces (`trove-dev:*`) or the namespaced `~/.claude/skills/trove/` symlink directory.

## Plugins

| Plugin | For | What you get |
|--------|-----|--------------|
| **trove-dev** | Engineers | Python, React, Vue, Swift, Lambda — plus review, commit, and explain workflows |
| **trove-workflow** | Engineers | Session bootstrap, skill discipline, brainstorm, plan, debug, dispatch, verify, worktree, and skill-authoring workflows |
| **trove-design** | Designers | Component specs, accessibility checks, design review |
| **trove-product** | PMs | Specs, user stories, release notes |
| **trove-security** | All | Security review, secret scanning, OWASP / STRIDE patterns |
| **trove-infra** | DevOps | Terraform, AWS CDK, Docker patterns |

Optional MCP connector metadata lives on role plugins such as `trove-design`, `trove-product`, and `trove-security`. Curated external plugins are added only when they project as installable marketplace entries.

## Platforms

| Platform | Skills | Hooks | Agents | MCP | Marketplace |
|----------|:------:|:-----:|:------:|:---:|:-----------:|
| Claude Code | ✅ | ✅ | ✅ | ✅ | native |
| Cursor | ✅ native skills + scoped rules | partial | subagents | ✅ | native |
| OpenAI Codex | ✅ | — | — | ✅ | native |
| OpenCode | ✅ | bootstrap plugin | — | — | generated |
| Gemini CLI | bootstrap context | — | — | ✅ via extension | generated |
| Copilot / Windsurf / Aider / Junie | `AGENTS.md` fallback | — | — | — | manual |

Full feature matrix in [docs/cross-platform.md](docs/cross-platform.md).

## What's a skill?

A skill is a Markdown file with frontmatter that an AI assistant loads as context when relevant. Authors edit one canonical template; the build projects it into each platform's native format.

```yaml
---
name: trove-python
description: Python/FastAPI conventions — async, type hints, Pydantic, logging.
preamble-tier: 2
activation:
  globs: ["**/*.py"]
triggers:
  - python conventions
  - fastapi patterns
---

{{PREAMBLE}}

# Python / FastAPI Conventions
…
```

Skills can **auto-attach** by file glob, **auto-trigger** by natural-language phrasing, or be manually invoked. See [docs/skill-authoring.md](docs/skill-authoring.md).

## Develop

```bash
bun install
bun run build                # 5-stage pipeline: skills → plugins → marketplace → routing → deps
bun run validate             # frontmatter, naming, hooks, MCP, secret scan
bun run dev                  # watch mode

# Scaffold
bun run scaffold:plugin -- --name trove-testing --role dev
bun run scaffold:skill -- --plugin trove-dev --name trove-debug

# Browse the catalog
./bin/trove search "security"
./bin/trove list --role=dev
./bin/trove info trove-dev

# Local install / health / upgrade
./bin/trove doctor        # read-only diagnostic
./bin/trove upgrade       # detection-first upgrade (git-backed vs vendored)
./bin/trove config list   # ~/.trove/config.yaml — local prefs
```

**Tech stack:** Bun ≥1.0 runtime, TypeScript, YAML manifests, `@anthropic-ai/sdk` for LLM-as-judge evals. Zero non-stdlib dependencies in the CLI surface.

## Architecture

```
skills/<category>/<skill>/SKILL.md.tmpl   ─┐
plugins/<plugin>/plugin.yaml              ─┼─►  bun run build  ─►  per-platform output
marketplace.yaml                          ─┘
                                                                  ├─ Claude Code:  in-place SKILL.md, .claude-plugin/marketplace.json
                                                                  ├─ Cursor:       output/cursor/.agents/skills/<skill>/SKILL.md + filtered rules
                                                                  ├─ Codex:        output/codex/.agents/skills/<skill>/SKILL.md
                                                                  ├─ OpenCode:     output/opencode/plugins/<plugin>/index.ts + skills
                                                                  ├─ Gemini CLI:   output/gemini/plugins/<plugin>/gemini-extension.json
                                                                  └─ AGENTS.md:    output/agents/AGENTS.md + per-plugin scoped files
```

Each host adapter (`hosts/<name>.ts`) declares its projection kinds and frontmatter transforms. Adding a new platform = one new host file + one entry in `hosts/index.ts`. See [docs/cross-platform.md](docs/cross-platform.md).

## Release model

The release flow is **automated on merge to `main`** — don't hand-bump VERSION in feature branches.

```
PR → main           feature work, no VERSION bump, no CHANGELOG header
   │
   ▼ merge
release.yml         build → validate → eval:gate → bump-version → tag → force-push canary
   │
   ▼ 48h soak
canary              early adopters; auto-update for users tracking canary
   │
   ▼ bun run promote-stable
stable              promoted manually after soak passes
```

Calendar-versioned (`YYYY.M.D`). The `release.yml` workflow owns `VERSION`, the tag, and the canary push. See [docs/contributing.md](docs/contributing.md).

## Documentation

**Get started**
- [Getting Started](docs/getting-started.md) — install, first plugin, basic usage
- [Contributing](docs/contributing.md) — PR workflow, naming, release channels

**Author**
- [Plugin Authoring](docs/plugin-authoring.md) — scaffold a plugin, manifest reference
- [Skill Authoring](docs/skill-authoring.md) — frontmatter v2, decision gates, projection
- [Preamble Tiers](docs/preamble-tiers.md) — the four `{{PREAMBLE:N}}` levels and when to pick each
- [Hooks](docs/hooks.md) — lifecycle events, matchers, anti-patterns
- [MCP Integration](docs/mcp-integration.md) — declare external servers; per-host projection
- [Orchestration](docs/orchestration.md) — meta-skills, sub-agent delegation, `benefits-from` graph
- [Eval System](docs/eval-system.md) — per-skill rubrics, LLM-as-judge, gate-blocking criteria

**Cross-cutting**
- [Cross-Platform Guide](docs/cross-platform.md) — host capabilities, projection model, frontmatter transforms
- [Routing Index](docs/routing.md) — auto-generated; lists every skill's triggers + paths
- [User Config](docs/user-config.md) — `~/.trove/config.yaml` schema
- [Self-Upgrade & Doctor](docs/self-upgrade.md) — `trove upgrade`, install-type detection
- [Project Learnings](docs/learnings.md) — local, append-only insights store

## Inspired by

Trove's committed-distribution-artifact layout (marketplace catalogs and
per-plugin bundles checked into the repo, read directly by clients with no
build step) follows the pattern used by
[anthropics/claude-code](https://github.com/anthropics/claude-code)'s
plugin marketplace support and
[anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official).
The bundled `trove-react-best-practices` skill is adapted from
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
under its original MIT license, with attribution preserved in the skill's
frontmatter (`metadata.source`).

## License

[MIT](LICENSE)
