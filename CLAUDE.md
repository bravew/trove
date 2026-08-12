# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Trove — an open-source plugin marketplace for AI coding assistants. Plugins and skills are authored once and compiled to platform-specific formats for Claude Code, Cursor, OpenAI Codex, and a generic AGENTS.md fallback (Copilot/Windsurf/others).

## Common Commands

```bash
bun install                   # Install dependencies
bun run build                 # Full 3-stage build (skills → plugins → marketplace)
bun run build:skills          # Stage 1 only: resolve templates → SKILL.md
bun run build:plugins         # Stage 2 only: assemble plugin manifests + copy skills
bun run build:marketplace     # Stage 3 only: generate per-platform marketplace.json + catalog.json
bun run validate              # Validate all structure, naming, frontmatter, secrets
bun run validate:plugins      # Validate plugins only
bun run validate:market       # Validate marketplace only
bun run dev                   # Watch mode (rebuilds on change)
bun test                      # Run tests

# Scaffolding
bun run scaffold:plugin -- --name trove-testing --role dev
bun run scaffold:skill -- --plugin trove-dev --name trove-debug

# Evals
bun run eval:gate             # Quality gate (CI blocker on main)
bun run eval:changed          # Eval only changed skills

# CLI
./bin/trove search "security"
./bin/trove list --role=dev
./bin/trove info trove-dev

# Release
bun run bump-version          # Auto-bump VERSION file
bun run promote-stable        # Promote canary to stable

# Setup (installs to detected hosts)
./setup                       # Auto-detect Claude/Cursor/Codex
./setup --host claude         # Claude Code only
./setup --role dev            # Developer plugins only
```

## Architecture

### Three-Stage Build Pipeline

```
skills/**/*.tmpl  →  gen-skills.ts   →  SKILL.md per platform
plugins/*/plugin.yaml  →  gen-plugins.ts  →  plugin.json + copied skills per platform
marketplace.yaml  →  gen-marketplace.ts  →  marketplace.json per platform + catalog.json
```

Each stage must run in order. `bun run build` runs all three sequentially.

### Host Adapter System (`hosts/`)

Four host configs (`claude.ts`, `cursor.ts`, `codex.ts`, `agents.ts`) each define:
- Where outputs land (`pluginSubdir`, `marketplaceSubdir`)
- Supported features (hooks, agents, MCP, rules, marketplace — varies per platform)
- Frontmatter transforms: Claude keeps all fields; Cursor strips `allowed-tools`, `context`, `effort`; Codex/Agents strip frontmatter entirely
- Content rewrites: e.g., Cursor rewrites `${CLAUDE_SKILL_DIR}` → `[skill-dir]`

### Skill Authoring

Source of truth: `skills/<category>/<skill-name>/SKILL.md.tmpl`

Templates use YAML frontmatter (`name`, `description`, `user-invocable`, `paths`) and `{{PLACEHOLDER}}` tokens resolved via `scripts/resolvers/index.ts`. Currently only `{{PREAMBLE}}` exists (injects `templates/preamble.md`). New placeholders are added by adding a key to the resolvers map.

Generated output: Claude gets `SKILL.md` in-place next to the template. Other hosts get `output/<host>/<skill>/SKILL.md`.

### Plugin Structure (`plugins/<name>/`)

```
plugin.yaml          # Manifest: name, version, skills[], hooks{}, platforms{}
skills/              # Generated — SKILL.md files copied here by build:plugins
hooks/               # Shell scripts (e.g., auto-lint.sh)
rules/               # Cursor-specific rule files
agents/              # Agent definitions
mcp/                 # MCP server configs
```

Plugin names must use `trove-` prefix (enforced by validation as a warning). Platform filtering is per-skill — a single plugin can contain skills targeting different platform subsets via `platforms: [claude, cursor]` in the skill's plugin.yaml entry. Skills auto-attach via `auto_attach.globs` (e.g., `**/*.py` activates trove-python).

### Curated Third-Party Plugins (`curated/`)

JSON stubs for external plugins (figma, linear, sentry) not yet in `marketplace.yaml`. Each requires a SHA pin on `source.ref` before inclusion. This is a staging area before official adoption.

### Output Layout

- `.claude-plugin/marketplace.json` — Claude Code marketplace manifest
- `.cursor-plugin/marketplace.json` — Cursor marketplace manifest
- `output/agents/`, `output/cursor/`, `output/codex/` — per-platform skill outputs
- `catalog.json` — flat catalog used by the CLI (the CLI's only data source at runtime)

### Validation Rules (`scripts/validate.ts`)

- Frontmatter required with `name` + `description`
- Skill names: lowercase kebab-case, no colons, max 64 chars
- Body under 500 lines (warning)
- No unresolved `{{...}}` in generated `.md` files
- No `..` path traversal in sources
- Secret scanning (strips code blocks to reduce false positives)
- Curated external plugins must have SHA pins

### Eval System (`evals/`)

LLM-as-judge evaluation: `evals/judge-prompts/code-quality-judge.md` scores 0–10 per criterion, outputs JSON with `weighted_average` and `pass: bool`. Skill-specific evals live in `evals/skill-evals/<skill>/` with `rubric.yaml` + `tasks/`. CI runs `eval:gate` on push to main as a release quality gate.

### CI/CD (`.github/workflows/`)

- **validate.yml** (PR/push): validate → build → build:skills --dry-run (freshness check) → eval:gate (main only)
- **release.yml** (push to main): build → validate → eval:gate → auto-bump VERSION → commit + tag → force-push to `canary` branch
