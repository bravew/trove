# Host Matrix

What each supported host discovers, where, and which frontmatter it honors —
with the source consulted and the date it was verified.

This file is the reference the projection code is written against. When a
vendor changes something, update the row **and** its `Verified` date in the
same commit as the code change, so drift is deliberate rather than silent.

Related: `scripts/lib/projection.ts` (per-host field allowlists),
`scripts/lib/agent-skills-spec.ts` (`SPEC_REVISION`, the blocking spec gate).

## Projection profiles

| Profile | Emitted frontmatter | Used by |
|---|---|---|
| `strict` | `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` | Codex, OpenCode, Gemini, AGENTS.md, uploads |
| `claude` | spec fields plus Claude Code's documented fields (`paths`, `when_to_use`, invocation controls, `context`, `model`, `hooks`, …) | Claude Code |
| `cursor` | `name`, `description`, `paths`, `disable-model-invocation`, `icon`, `color`, `metadata` | Cursor |

Trove's authoring vocabulary — `preamble-tier`, `activation`, `triggers`,
`benefits-from`, `host-overrides` — is a build input and reaches no host.
`activation.globs` becomes `paths`; `triggers` becomes `when_to_use` for Claude
and folds into `description` for strict hosts, which have no equivalent field.

## Hosts

| Host | Generated output | Install target | Discovery root (documented) | Honored frontmatter | How it is tested | Source | Verified |
|---|---|---|---|---|---|---|---|
| Claude Code | `skills/**/SKILL.md` in place, `plugins/*/.claude-plugin/plugin.json` | marketplace, else `~/.claude/skills/<skill>/` | `~/.claude/skills/<skill>/SKILL.md`; `.claude/skills/` per project | full Claude reference (see profile above) | `claude plugin validate --strict`; `tests/acceptance/setup-links.sh` | code.claude.com/docs/en/skills, /plugins-reference, /plugin-marketplaces | 2026-08-28 |
| Cursor | `output/cursor/.agents/skills/<skill>/SKILL.md` + `output/cursor/rules/<skill>.mdc` | `~/.cursor/skills/trove/<skill>/` | Cursor skills root, **recursive grouping supported** | `name`, `description`, `paths`, `disable-model-invocation`, `icon`, `color`, `metadata` | `tests/projection.test.ts`; `tests/acceptance/setup-links.sh` | cursor.com/docs/skills, /docs/context/rules | 2026-08-28 |
| OpenAI Codex | `output/codex/.agents/skills/<skill>/SKILL.md`, `plugins/*/.codex-plugin/plugin.json` | `~/.agents/skills/<skill>/` | `~/.agents/skills/<skill>/SKILL.md` (USER scope) | Agent Skills spec fields | in-repo spec gate in `bun run validate`; `tests/acceptance/setup-links.sh` | developers.openai.com/codex/skills, /plugins/build/plugins | 2026-08-28 |
| OpenCode | `output/opencode/.agents/skills/<skill>/SKILL.md`, `output/opencode/plugins/<plugin>/index.ts` | `~/.config/opencode/skills/<skill>/` | project: `.opencode/skills`, `.claude/skills`, `.agents/skills`; global: `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | `name`, `description`, `license`, `compatibility`, `metadata` — "unknown frontmatter fields are ignored" | in-repo spec gate; `tests/acceptance/setup-links.sh` | opencode.ai/docs/skills | 2026-08-28 |
| Gemini CLI | `output/gemini/.agents/skills/<skill>/SKILL.md`, `output/gemini/plugins/<plugin>/` (extension) | `gemini extensions link`, else `~/.gemini/extensions/<plugin>/` | extensions from `<home>/.gemini/extensions`, skills inside one from `skills/<name>/SKILL.md`; workspace `.agents/skills` takes precedence over `.gemini/skills` | Agent Skills spec fields | in-repo spec gate; manifest checks in `bun run validate` | geminicli.com/docs/cli/skills, /docs/extensions/reference | 2026-08-28 |
| Generic (AGENTS.md) | `output/agents/AGENTS.md` + `output/agents/plugins/<plugin>/AGENTS.md` | copied into project roots | nearest-scope `AGENTS.md` | n/a — prose only | `tests/projection.test.ts` | AGENTS.md convention (Copilot, Windsurf, Aider, Junie) | 2026-08-28 |

## Fields that are deliberately not emitted

| Field | Where | Why |
|---|---|---|
| `allowed-tools` | Codex, OpenCode, Gemini, AGENTS.md | The spec encodes it as a space-separated list, which cannot represent an authored pattern containing whitespace such as `Bash(git *)`. Hosts that ignore the field get nothing rather than a corrupt token. Tracked by `HostCapabilities.supportsToolAllowlistMetadata`. |
| `disable-model-invocation` | everywhere, unless explicitly authored | It means manual-only. `user-invocable: false` means the opposite — model-only. Translating one into the other inverted 22 skills in Cursor. Author manual-only intent as `activation.manual: true`, or per host via `host-overrides`. |
| `version` | everywhere | Removed from the authoring vocabulary: it reached no host and duplicated the repository `VERSION`, which is what every generated manifest is stamped from. |

## Installer layout

`./setup` records every symlink it creates in `~/.trove/installed-links.tsv`,
never overwrites an entry it did not create, and `./setup --uninstall` removes
exactly what it installed. `tests/acceptance/setup-links.sh` proves all three in
a disposable `HOME`.
