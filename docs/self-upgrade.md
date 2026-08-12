# Self-Upgrade & Doctor

Two read-mostly utilities for keeping the marketplace install healthy.

## `trove doctor`

Read-only diagnostic. Always safe to run — never modifies state.

```bash
trove doctor
```

Checks:

| Check | What it verifies |
|---|---|
| Bun toolchain | `bun --version` succeeds and is recent enough |
| Workspace root | `package.json` + `marketplace.yaml` are present |
| Generated outputs | `catalog.json`, `deps.json`, `docs/routing.md` exist and are non-empty |
| Host adapter dirs | `output/<host>/` directories exist for every host in config |
| Config readability | `~/.trove/config.yaml` parses if it exists |
| Learnings store | `~/.trove/projects/<slug>/learnings.jsonl` exists or is absent (both fine) |
| Install consistency | `VERSION` file present and parses as semver |

Each check prints a `✓` or `⚠`/`✗` line and a one-line diagnosis. Exit code:

- `0` — all checks passed (warnings allowed)
- `1` — at least one check produced an error

## `trove upgrade`

Upgrade the locally-installed marketplace. Detection-first, action-second.

```bash
trove upgrade           # interactive — confirms before pulling
trove upgrade --force   # honors auto_upgrade=true equivalent
trove upgrade --check   # detect + report only, no action
```

### Install-type detection

The flow first determines how the marketplace is installed:

| Type | How it's detected | Upgrade path |
|---|---|---|
| **git-backed** | `.git/` exists in workspace root and origin is reachable | `git fetch && git pull --ff-only` |
| **vendored** | No `.git/`, but `VERSION` file is present | Stop with diagnosis — vendored installs need to be re-pulled by the parent project |
| **marketplace-managed** | Future: a sentinel file from a host marketplace | Defer to host-native update |
| **unclear** | None of the above match | Stop. Print every signal that was checked. |

### Host marketplace refresh

For host-managed installs, use the host's marketplace flow:

```bash
# Claude Code
/plugin marketplace update trove
# If the plugin list still shows stale commands, remove and reinstall:
/plugin marketplace remove trove
/plugin marketplace add bravew/trove
/plugin install trove-dev@trove
/plugin install trove-workflow@trove

# Cursor
cursor plugin marketplace add bravew/trove
cursor plugin install trove-dev@trove
cursor plugin install trove-workflow@trove

# Codex / local projection
cd ~/.trove && git pull && ./setup --host codex
```

This upgrade removes the legacy `trove-dev` Claude command prompts and the
`trove-dev` aliases for `trove-autoplan` and `trove-ship`. Use the skill forms
instead: `trove-commit`, `trove-ship`, `trove-review`, `trove-release-notes`,
`trove-worktree`, `trove-plan`, and `trove-execute-plan`. Cursor updates also pick
up the native `.agents/skills/` bundles and the smaller filtered `.mdc` rule
surface.

### Snooze

`~/.trove/update-snoozed` is a sentinel file. If present and recent
(< 7 days old), `trove upgrade` exits silently unless `--force` is
passed. Setting `auto_upgrade: true` in config bypasses snooze.

To clear: `rm ~/.trove/update-snoozed`.

### Why detect first

The plan ([P4](../dev-doc/phases/p4-persistent-state-and-self-management.md))
calls this out explicitly: a wrong upgrade path can corrupt a vendored copy
or fight with a parent project's package manager. Doctor is fully read-only
by design; upgrade refuses to act when uncertain.

## What this *does not* do

- No automatic rollback on failure (manual: `git reflog` for git-backed installs).
- No background polling — `update_check: true` only reminds when CLIs run.
- No host-native marketplace upgrade orchestration (that's host territory).
