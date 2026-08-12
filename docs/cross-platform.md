# Cross-Platform Compatibility

## Platform Support Matrix

| Feature | Claude Code | Cursor | Codex | OpenCode | Gemini CLI | AGENTS.md hosts |
|---------|:-----------:|:------:|:-----:|:--------:|:----------:|:--------------:|
| **Skills** | Full | Native Agent Skills + scoped rules | Full | Full | Bootstrap context | AGENTS.md |
| **Bootstrap anchor** | SessionStart | `.mdc` fallback + hook manifest | Scoped `AGENTS.md` + skill | TS plugin system prompt | `GEMINI.md` extension context | Scoped `AGENTS.md` |
| **Hooks / plugins** | Full | Partial | Native plugins | TS plugin | Extension manifest | No |
| **Agents** | Full | Subagents | No | No | No | No |
| **MCP servers** | Full | Full | Full | No | Extension-supported | No |
| **Marketplace** | Native | Native | Native | Generated plugin | Generated extension | Manual |
| **Auto-update** | Yes | Yes | Yes | Host-dependent | Host-dependent | No |

## Projection Model

A canonical `SKILL.md.tmpl` is projected into one or more host-native artifact
kinds. Each host declares its projection kinds in `hosts/<name>.ts`:

| Host | Projection kinds | Output location |
|------|------------------|-----------------|
| Claude Code | `skill` | `skills/<category>/<skill>/SKILL.md` (in place) |
| Cursor | `skill` + filtered `rule` | `output/cursor/.agents/skills/<skill>/SKILL.md` + `output/cursor/rules/<skill>.mdc` for glob/always-on rules |
| Codex | `skill` | `output/codex/.agents/skills/<skill>/SKILL.md` |
| OpenCode | `skill` + plugin template | `output/opencode/skills/<skill>/SKILL.md` + `output/opencode/plugins/<plugin>/index.ts` |
| Gemini CLI | `gemini-extension` | `output/gemini/plugins/<plugin>/gemini-extension.json` + `GEMINI.md` |
| Generic (AGENTS.md) | `agents-section` | `output/agents/AGENTS.md` + `output/agents/plugins/<plugin>/AGENTS.md` |

The generator (`scripts/gen-skills.ts`) parses each template once, resolves
placeholders, then fans out across the host's declared projection kinds.

### Cursor skills and Project Rules

Cursor receives native Agent Skills under
`output/cursor/.agents/skills/<skill>/SKILL.md`. The Cursor plugin manifest
points at `./.agents/skills/<skill>` so Cursor gets frontmatter limited to the
fields it reads: `name`, `description`, `paths`, `disable-model-invocation`,
and `metadata` when present. The shared Claude/Codex bundle skills remain under
`plugins/<plugin>/skills/`.

Project Rules are emitted in addition to skills only when they add deterministic
context: file-glob auto-attach (`activation.globs`) or an explicit always-on
anchor such as `using-trove`. Pathless procedural skills ship as SKILL.md
only, so full workflow bodies are not duplicated as both a rule and a skill.
For rule-emitting skills, frontmatter is mapped from canonical metadata:

| Skill metadata | MDC frontmatter |
|----------------|-----------------|
| `description:` (block scalar or inline) | `description:` (single quoted line) |
| `paths:` (comma-separated globs) | `globs:` (comma-separated unquoted patterns, single line) |
| no `paths:`, no `user-invocable:` | `globs:` omitted, `alwaysApply: false` (Agent Requested) |
| `user-invocable: true`, no `paths:` | `globs:` omitted, `alwaysApply: false` (Manual / Agent Requested) |
| explicit `user-invocable: false`, no `paths:` | `globs:` omitted, `alwaysApply: true` (discipline anchors only) |

The frontmatter shape follows [Cursor's official docs](https://cursor.com/docs/context/rules): `description` is a quoted string, `globs` is a comma-separated unquoted string (not a YAML array — Cursor's MDC parser splits on commas), and `alwaysApply` is an unquoted boolean.

`alwaysApply: true` ("Always" rules) is intentionally limited to explicit,
pathless, non-user-invocable discipline anchors such as `using-trove`.
Ordinary pathless skills remain agent-requested so they do not burn context on
every request.

The legacy `.cursorrules` flat file is **not** produced.

### Codex skills

Codex skills live under `output/codex/.agents/skills/<skill>/SKILL.md` so
that workflow playbooks stay visually and structurally separate from
plugin/integration metadata, which lives in
`plugins/<plugin>/.codex-plugin/plugin.json` (emitted by `gen-plugins.ts`).
Codex frontmatter is intentionally minimal: `name` and `description` only.

### Scoped AGENTS.md

Tools that consume `AGENTS.md` (GitHub Copilot, Windsurf, Aider, JetBrains
Junie) use **nearest-scope precedence**: the closest file to the working
directory wins. The build mirrors that model:

```
output/agents/
├── AGENTS.md                                  # short index, links only
└── plugins/
    ├── trove-dev/AGENTS.md                     # only trove-dev's skills
    ├── trove-design/AGENTS.md                  # only trove-design's skills
    └── …
```

The root file deliberately stays under 50 lines — it's an index, not an
aggregate — and per-plugin files include only the skills owned by that
plugin (resolved via each plugin's `plugin.yaml > skills`). A skill that
declares `platforms:` excluding `agents` does not appear in any scoped file.

### OpenCode plugin bootstrap

OpenCode does not consume the Claude/Cursor hook envelope. For plugins with a
`using-*` anchor, the build emits `output/opencode/plugins/<plugin>/index.ts`.
That TypeScript plugin reads the generated anchor skill, prepends it through
the host's system-prompt path, and exposes a `use_skill` tool for the plugin's
skills.

### Gemini extension context

Gemini CLI extensions load a context file named by `gemini-extension.json`.
For plugins with a `using-*` anchor, the build emits
`output/gemini/plugins/<plugin>/gemini-extension.json` with
`contextFileName: "GEMINI.md"` and writes `GEMINI.md` from the compiled anchor
body.

## Frontmatter transforms per host

| Field | Claude | Cursor skill | Cursor rule | Codex skill | Generic section |
|---|---|---|---|---|---|
| `allowed-tools` | Keep | Strip | Strip | Strip | Strip |
| `context: fork` | Keep | Strip | Strip | Strip | Strip |
| `effort:` | Keep | Strip | Strip | Strip | Strip |
| `disable-model-invocation` | Keep | Keep/generated | Strip | Strip | Strip |
| `${CLAUDE_SKILL_DIR}` | Keep | Rewrite -> `[skill-dir]` | Rewrite -> `[skill-dir]` | Rewrite -> `[skill-dir]` | Strip |
| `activation.globs` | Keep | Map -> `paths:` | Map -> `globs:` | Strip | Strip |
| `user-invocable:` | Keep | `false` maps to `disable-model-invocation: true` | Read for always-on selection | Strip | Strip |
| `name:` | Keep | Keep | Drop | Keep | Section heading |
| `description:` | Keep | Flatten to one line | Flatten to one line | Flatten to one line | Italicized one-liner |

## Build pipeline

```
SKILL.md.tmpl
  └─ resolve placeholders ({{PREAMBLE}}, …)
       ├─ Claude Code   → SKILL.md (in-place)
       ├─ Cursor        → output/cursor/.agents/skills/<skill>/SKILL.md
       │                  + output/cursor/rules/<skill>.mdc where needed
       ├─ OpenAI Codex  → output/codex/.agents/skills/<skill>/SKILL.md
       ├─ OpenCode      → output/opencode/skills/<skill>/SKILL.md + plugin TS
       ├─ Gemini CLI    → output/gemini/plugins/<plugin>/GEMINI.md
       └─ Generic       → output/agents/{AGENTS.md, plugins/<plugin>/AGENTS.md}
```

Skills are written once and projected to each host's native surface. Authors
edit only the `.tmpl` file.

## Adding a new platform

1. Create `hosts/<platform>.ts` implementing `HostConfig`. Declare its
   `projections` array — pick from `skill`, `rule`, `agents-section`, or
   `gemini-extension`. Add a new kind only if the platform truly does not fit
   an existing projection.
2. Register in `hosts/index.ts`.
3. If the platform consumes a marketplace catalog, add a generator in
   `scripts/gen-marketplace.ts`. Add a `plugin.json` generator in
   `scripts/gen-plugins.ts` if it has plugin-level metadata.
4. Update the setup script and add a projection snapshot test.
