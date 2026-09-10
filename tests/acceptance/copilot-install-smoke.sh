#!/usr/bin/env bash
# Real Copilot CLI marketplace/install smoke with isolated state and working tree.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE_TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
FIXTURE_ROOT="$(mktemp -d "$BASE_TMP/trove-copilot-smoke.XXXXXX")"
EXPECTED_CLI_VERSION="${COPILOT_EXPECTED_VERSION:-1.0.69}"

cleanup() {
  [[ "${KEEP_COPILOT_FIXTURE:-}" == "1" ]] || rm -rf "$FIXTURE_ROOT"
}
trap cleanup EXIT

mkdir -p \
  "$FIXTURE_ROOT/work" \
  "$FIXTURE_ROOT/home" \
  "$FIXTURE_ROOT/xdg-config" \
  "$FIXTURE_ROOT/xdg-data" \
  "$FIXTURE_ROOT/xdg-cache" \
  "$FIXTURE_ROOT/copilot-home" \
  "$FIXTURE_ROOT/copilot-cache" \
  "$FIXTURE_ROOT/tmp"

case "$(cd "$FIXTURE_ROOT/work" && pwd -P)/" in
  "$ROOT"/*) echo "Fixture working directory must be outside the repository" >&2; exit 1 ;;
esac

isolated() {
  env \
    -u COPILOT_GITHUB_TOKEN -u GH_TOKEN -u GITHUB_TOKEN \
    -u COPILOT_CONFIG_DIR -u COPILOT_SKILLS_DIR -u CLAUDE_CONFIG_DIR -u CODEX_HOME \
    HOME="$FIXTURE_ROOT/home" \
    XDG_CONFIG_HOME="$FIXTURE_ROOT/xdg-config" \
    XDG_DATA_HOME="$FIXTURE_ROOT/xdg-data" \
    XDG_CACHE_HOME="$FIXTURE_ROOT/xdg-cache" \
    COPILOT_HOME="$FIXTURE_ROOT/copilot-home" \
    COPILOT_CACHE_HOME="$FIXTURE_ROOT/copilot-cache" \
    TMPDIR="$FIXTURE_ROOT/tmp" \
    "$@"
}

command -v copilot >/dev/null || { echo "copilot CLI not found" >&2; exit 127; }
actual_version="$(copilot --version | sed -nE 's/.* ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' | head -n1)"
if [[ "$EXPECTED_CLI_VERSION" != "latest" && "$actual_version" != "$EXPECTED_CLI_VERSION" ]]; then
  echo "Expected Copilot CLI $EXPECTED_CLI_VERSION, got ${actual_version:-unknown}" >&2
  exit 1
fi

git -C "$ROOT" status --porcelain=v1 --untracked-files=all > "$FIXTURE_ROOT/status.before"
cd "$FIXTURE_ROOT/work"
isolated copilot plugin marketplace add "$ROOT" >/dev/null
isolated copilot plugin marketplace browse trove > "$FIXTURE_ROOT/browse.txt"

plugins=()
while IFS= read -r plugin; do
  [[ -n "$plugin" ]] && plugins+=("$plugin")
done < <(bun "$ROOT/scripts/select-plugins.ts" all copilot)
for plugin in "${plugins[@]}"; do
  grep -Fq "$plugin" "$FIXTURE_ROOT/browse.txt" || { echo "browse omitted $plugin" >&2; exit 1; }
  isolated copilot plugin install "$plugin@trove" >/dev/null
done

isolated bun "$ROOT/scripts/verify-copilot-install.ts" "$ROOT" "$FIXTURE_ROOT/copilot-home"
git -C "$ROOT" status --porcelain=v1 --untracked-files=all > "$FIXTURE_ROOT/status.after"
cmp "$FIXTURE_ROOT/status.before" "$FIXTURE_ROOT/status.after" >/dev/null || {
  echo "Copilot smoke modified the repository" >&2
  diff -u "$FIXTURE_ROOT/status.before" "$FIXTURE_ROOT/status.after" || true
  exit 1
}

echo "✓ Copilot CLI ${actual_version:-unknown} isolated marketplace smoke passed"
