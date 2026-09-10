#!/usr/bin/env bash
# Prove the committed generated artifacts match a build of their sources, then
# prove the generators are deterministic.
#
# The distribution artifacts under version control (marketplace manifests,
# per-plugin skill bundles, catalog.json, deps.json, docs/routing.md) are read
# directly by every host with no build step, so a stale committed copy is a
# shipped bug. `output/` is build-only and git-ignored, which is why the
# generators' `--dry-run` freshness modes cannot be trusted on a fresh checkout:
# they compare against files a clean tree has never had. Building and then
# looking at what the build changed catches exactly the case those modes were
# reaching for, and it works from any checkout.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# A snapshot of everything the working tree says about tracked content, so the
# comparison sees a repaired byte inside an already-modified file, not just a
# newly modified path.
snapshot() {
  git status --porcelain=v1 --untracked-files=all
  echo "--- diff ---"
  git --no-pager diff HEAD
}

BEFORE="$(mktemp)"
AFTER="$(mktemp)"
trap 'rm -f "$BEFORE" "$AFTER"' EXIT

snapshot > "$BEFORE"
bun run build
snapshot > "$AFTER"

# Only what the build itself changed is a stale artifact. Comparing against the
# starting state keeps a developer's own work in progress out of the verdict.
if ! cmp -s "$BEFORE" "$AFTER"; then
  echo "" >&2
  echo "The build had to repair committed generated artifacts. Run 'bun run build' and commit the result:" >&2
  diff -u "$BEFORE" "$AFTER" >&2 || true
  exit 1
fi

# The tree is now freshly built, so every generator's --dry-run must agree that
# its own output is already in place. A disagreement here means a generator is
# not deterministic.
for stage in skills plugins marketplace routing deps; do
  bun run "build:$stage" -- --dry-run
done

echo "✓ Committed generated artifacts are current and the generators are deterministic"
