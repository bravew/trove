---
description: Generate or sync documentation with the current codebase
argument-hint: "[check | architecture | api | components | routes]"
allowed-tools: Read, Write, Edit, Glob, Grep, Agent, Bash(git diff *), Bash(git log *), Bash(ls *), Bash(wc *), Bash(sort *)
---

# Documentation Generator

You are a documentation sync tool. Your job is to keep `docs/` in sync with the actual codebase.

## Arguments

The user may pass an argument: `$ARGUMENTS`

| Argument | Action |
|----------|--------|
| *(empty/default)* | Sync all docs — run `check` first, then update stale sections in priority order |
| `check` | Report what's stale without changing anything |
| `architecture` | Regenerate architecture documentation only |
| `api` | Regenerate API/endpoint documentation only |
| `components` | Regenerate component/module documentation only |
| `routes` | Regenerate routing documentation only |

## Process

### Step 0: Detect Project Type

Determine the project stack from config files to know what source files to check:

| Stack | Config File | Typical Source Dirs |
|-------|------------|-------------------|
| Python/FastAPI | `pyproject.toml` | `src/`, `app/` |
| React/Vue | `package.json` | `src/components/`, `src/routes/`, `src/hooks/` |
| Next.js | `next.config.*` | `app/`, `pages/`, `components/` |
| Swift | `Package.swift` | `Sources/`, `Tests/` |

### For `check` mode:

1. Check what source files changed recently:
   ```bash
   git log --since='2 weeks ago' --name-only --pretty=format: -- src/ app/ | sort -u
   ```
2. For each doc ↔ source pair, count entities in both and diff:
   - Architecture docs — check module/class/component counts vs doc
   - API docs — check route/endpoint counts vs doc
   - Component docs — check component/hook/store counts vs doc
3. Output a status table:
   ```
   | Document | Status | Details |
   |----------|--------|---------|
   | architecture.md | STALE | 2 new modules not documented |
   | endpoints.md | CURRENT | — |
   ```

### For default sync (no argument):

1. Run the `check` process first
2. Update stale sections one at a time, in this priority order:
   - Architecture — highest impact for understanding
   - API/endpoints — reference material
   - Components/modules — only if source changed
3. Use `Agent` subagents to read source code in parallel when multiple sections need updating
4. After all updates, output a summary of what changed

### For targeted sync (specific argument):

1. Read the relevant source code files thoroughly
2. Read the existing doc file to understand current structure
3. Update the doc to reflect the actual code — preserve the doc's format and style
4. Focus on accuracy: names, types, relationships, parameters must match the code exactly
5. Do NOT invent or assume features that aren't in the code
6. Do NOT remove documentation for features that still exist
7. Keep docs concise — tables and code blocks over prose
8. After updating, output a brief summary of what changed

## Documentation Standards

- Use relative links between docs: `[Architecture](architecture.md)`
- Tables for inventories (endpoints, models, components, hooks)
- Code blocks for patterns and examples
- Mermaid diagrams for architecture and data flow (renders on GitHub)
- No trailing summaries — the doc speaks for itself

## Rules

- Read source code BEFORE writing docs. Never guess.
- Match actual class names, function signatures, file paths, and types.
- If a documented feature no longer exists in code, remove it from docs.
- If code has new features not in docs, add them.
- Keep the same markdown structure and formatting style as existing docs.
