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
