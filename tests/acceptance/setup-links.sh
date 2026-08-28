#!/usr/bin/env bash
# ─── Acceptance: installer link layout in a disposable HOME ───
#
# Checkpoint 4 / F6. The vendor docs put a personal skill at
# `<skills-root>/<skill>/SKILL.md` with no grouping folder for Claude and
# Codex, while Cursor documents recursive grouping. These assertions pin the
# resulting on-disk layout, prove a non-Trove entry is never overwritten, and
# prove `--uninstall` reverses exactly what was installed.
#
# Usage: tests/acceptance/setup-links.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE_HOME="$TMP/home"
FAKE_BIN="$TMP/bin"
mkdir -p "$FAKE_HOME" "$FAKE_BIN"

pass=0
fail=0
check() {
  if eval "$2"; then
    echo "  ✓ $1"
    pass=$((pass + 1))
  else
    echo "  ✗ $1"
    fail=$((fail + 1))
  fi
}

# A `claude` that reports no marketplace support, so the installer takes the
# symlink fallback — the path F6 is about.
cat > "$FAKE_BIN/claude" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$FAKE_BIN/claude"

echo "── Installing into a disposable HOME ──"
# A pre-existing personal skill that Trove must not clobber.
mkdir -p "$FAKE_HOME/.claude/skills/trove-python"
echo "mine, not Trove's" > "$FAKE_HOME/.claude/skills/trove-python/SKILL.md"

env HOME="$FAKE_HOME" TROVE_HOME="$FAKE_HOME/.trove" PATH="$FAKE_BIN:$PATH" \
  "$REPO/setup" --host claude --host cursor --host codex --host opencode >"$TMP/install.log" 2>&1 ||
  { cat "$TMP/install.log"; echo "setup failed"; exit 1; }

echo "── Layout ──"
check "Claude links are flat under ~/.claude/skills" \
  '[ -f "$FAKE_HOME/.claude/skills/trove-commit/SKILL.md" ]'
check "Claude has no 'trove' grouping directory" \
  '[ ! -e "$FAKE_HOME/.claude/skills/trove" ]'
check "Codex links are flat under ~/.agents/skills" \
  '[ -f "$FAKE_HOME/.agents/skills/trove-commit/SKILL.md" ]'
check "Codex has no 'trove' grouping directory" \
  '[ ! -e "$FAKE_HOME/.agents/skills/trove" ]'
check "Cursor keeps its documented recursive grouping" \
  '[ -f "$FAKE_HOME/.cursor/skills/trove/trove-commit/SKILL.md" ]'
check "OpenCode links into its global skills root" \
  '[ -f "$FAKE_HOME/.config/opencode/skills/using-trove/SKILL.md" ]'

echo "── Collisions ──"
check "a pre-existing non-Trove skill is left untouched" \
  'grep -q "mine, not Trove" "$FAKE_HOME/.claude/skills/trove-python/SKILL.md"'
check "the collision is reported, not silent" \
  'grep -q "Skipping trove-python" "$TMP/install.log"'

echo "── Idempotence ──"
before=$(wc -l < "$FAKE_HOME/.trove/installed-links.tsv")
env HOME="$FAKE_HOME" TROVE_HOME="$FAKE_HOME/.trove" PATH="$FAKE_BIN:$PATH" \
  "$REPO/setup" --host claude --host cursor --host codex --host opencode >"$TMP/reinstall.log" 2>&1
after=$(wc -l < "$FAKE_HOME/.trove/installed-links.tsv")
check "re-running does not duplicate manifest rows" '[ "$before" -eq "$after" ]'

echo "── Reversibility ──"
check "the installer records what it linked" \
  '[ -s "$FAKE_HOME/.trove/installed-links.tsv" ]'

env HOME="$FAKE_HOME" TROVE_HOME="$FAKE_HOME/.trove" PATH="$FAKE_BIN:$PATH" \
  "$REPO/setup" --uninstall >"$TMP/uninstall.log" 2>&1

check "uninstall removes the links it created" \
  '[ ! -e "$FAKE_HOME/.agents/skills/trove-commit" ]'
check "uninstall leaves the user's own skill alone" \
  '[ -f "$FAKE_HOME/.claude/skills/trove-python/SKILL.md" ]'
check "uninstall clears the manifest" \
  '[ ! -e "$FAKE_HOME/.trove/installed-links.tsv" ]'

echo ""
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
