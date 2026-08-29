# User Config

Trove persists user preferences in a single YAML file. Config is local-first
and opt-in — nothing in the marketplace requires it. Everything that reads
config also has a default.

## Location

```
~/.trove/config.yaml
```

Override the home directory by exporting `TROVE_HOME`:

```bash
export TROVE_HOME=/tmp/trove-test
```

Tests and CI use this override to avoid polluting the real home directory.

## Schema

All keys are optional. Defaults shown below.

```yaml
# Hosts setup will install to when --host is not specified.
# Empty array → autodetect (which CLIs are on PATH).
hosts:
  - claude
  - cursor

# When true, `trove upgrade` runs without confirmation.
auto_upgrade: false

# When true, the umbrella CLI nudges about new versions.
update_check: true

# When true, skills may consume project learnings.
learnings_enabled: true

# Cap on results returned by `trove learnings search`.
learnings_max_results: 3

# Display preference. `terse` shortens generated output; `normal` is default.
detail_level: normal
```

## CLI

```bash
trove config list                  # Show effective config (defaults + overrides)
trove config get <key>             # Read a single value
trove config set <key> <value>     # Persist a value
```

`<key>` accepts dotted paths for the few cases where future schemas grow:
`trove config set hosts claude,cursor` writes the array form.

## Why YAML

Two reasons:
1. The marketplace already depends on `yaml` for `marketplace.yaml` and
   `plugin.yaml`. Reusing the parser keeps the dependency surface small.
2. Hand-editing is fine — the file is small enough that someone resolving a
   merge conflict on it shouldn't need a tool.

## What this config is *not*

- Not a runtime feature flag system. Skills don't branch on config keys.
- Not a way to override host capability flags (those live in `hosts/*.ts`).
- Not exported anywhere by default — `learnings_enabled: true` controls
  whether skills *read* learnings, not whether they're sent to a server.

## Skill secrets and consent (not this file)

`~/.trove/config.yaml` does not store API keys, cookies, or per-skill engine
config. Skills that need credentials read their own documented locations.
Do not copy those keys into Trove's YAML — a cloned repo or a shared
`TROVE_HOME` is the wrong place for them.

### `trove-pulse` (global / English platforms)

- Config file: `~/.config/last30days/.env` (mode 0600). That upstream path is
  the source of truth for this skill.
- Precedence: per-run flag > process env > that `.env` > defaults.
- Keyless baseline works (Reddit, Hacker News, web). No `pip install`.
- Optional keys worth adding first: `SCRAPECREATORS_API_KEY`, then
  `AUTH_TOKEN` / `CT0` for X.
- Cookie/browser-profile reading is opt-in. The skill's Decision Gate defaults
  to skip. Leave `LAST30DAYS_TRUST_PROJECT_CONFIG` unset so a cloned repo
  cannot carry config the user did not write.
- Health check: `python3 ${CLAUDE_SKILL_DIR}/scripts/last30days.py doctor`
  (topic-word `doctor`, no cookies) and `--diagnose`.

### `trove-pulse-cn` (Chinese platforms)

- Config file: `~/.config/last30days-cn/.env`, or `LAST30DAYS_CN_CONFIG_DIR`.
- Keyless baseline works. Python 3.9+. Optional pip: `jieba`, `playwright`
  (never a setup step — `--diagnose` reports which are active).
- `ZHIHU_COOKIE` is a session cookie the user pastes. The engine does not
  read the browser for it.
- Upstream also loads `.claude/last30days-cn.env` by walking up from the
  process cwd, with no trust flag equivalent to
  `LAST30DAYS_TRUST_PROJECT_CONFIG`. Prefer the home config file. Do not
  keep secrets in a cloned repo's `.claude/last30days-cn.env`.
- Health check: `python3 ${CLAUDE_SKILL_DIR}/scripts/last30days.py --diagnose`.

### Shared names

`SCRAPECREATORS_API_KEY` and `XIAOHONGSHU_API_BASE` are read by **both**
engines. Config directories are separate. Setting a shared key in the wrong
file looks like a broken skill.
