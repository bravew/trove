#!/usr/bin/env bash
# Run Claude Code's own strict manifest validator over every generated plugin
# manifest and the marketplace. Complements the in-repo checks: this one is the
# host's opinion of its own schema, which no amount of local modeling replaces.
#
# Skipped with a clear message when the CLI is unavailable, so a contributor
# without Claude Code installed still gets a usable `bun run validate` run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v claude &>/dev/null; then
  echo "claude CLI not found — skipping strict manifest validation."
  echo "Install Claude Code to run this gate locally; CI runs it on every PR."
  exit 0
fi

status=0
for plugin_dir in "$ROOT"/plugins/*/; do
  name=$(basename "$plugin_dir")
  if claude plugin validate "$plugin_dir" --strict; then
    echo "✓ $name"
  else
    echo "✗ $name"
    status=1
  fi
done

if claude plugin validate "$ROOT" --strict; then
  echo "✓ marketplace"
else
  echo "✗ marketplace"
  status=1
fi

exit "$status"
