#!/usr/bin/env bash
# ─── Advisory cross-check against the Agent Skills reference tool ───
#
# NOT a gate. The blocking conformance check is scripts/lib/agent-skills-spec.ts,
# written in-repo from the published specification. This script is a second
# opinion whose only job is to make a spec misreading visible.
#
# Why it is only advisory:
#   - The reference implementation (agentskills/agentskills, skills-ref, Apache-2.0)
#     states in its README that it is "intended for demonstration purposes only.
#     It is not meant to be used in production."
#   - The npm package of the same name is a different artifact (different version,
#     different license, no `repository` or `homepage` field), so installing it by
#     bare name would establish nothing about its provenance.
#
# So: vendor the reviewed Python reference at a pinned commit, never install by
# name, and treat any disagreement as a prompt to re-read the spec.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Pinned commit of agentskills/agentskills touching skills-ref.
# Re-pin deliberately, recording the date it was reviewed.
SKILLS_REF_REPO="https://github.com/agentskills/agentskills.git"
SKILLS_REF_SHA="f130f348f502d9804278a617f86929846896d2e9"
SKILLS_REF_REVIEWED="2026-08-28"

echo "Advisory cross-check — skills-ref @ ${SKILLS_REF_SHA} (reviewed ${SKILLS_REF_REVIEWED})"
echo "Blocking gate remains scripts/lib/agent-skills-spec.ts."
echo ""

if ! command -v python3 &>/dev/null || ! command -v git &>/dev/null; then
  echo "python3 and git are required for the cross-check — skipping."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if ! git -c advice.detachedHead=false clone --quiet --filter=blob:none --no-checkout \
  "$SKILLS_REF_REPO" "$WORK/agentskills" 2>/dev/null; then
  echo "Could not clone the reference repository — skipping (advisory only)."
  exit 0
fi

if ! (cd "$WORK/agentskills" && git sparse-checkout set --no-cone skills-ref >/dev/null 2>&1 &&
      git checkout --quiet "$SKILLS_REF_SHA" 2>/dev/null); then
  echo "Could not check out the pinned commit — skipping (advisory only)."
  exit 0
fi

REF_DIR="$WORK/agentskills/skills-ref"
if [[ ! -d "$REF_DIR" ]]; then
  echo "Pinned commit has no skills-ref directory — re-pin before trusting this check."
  exit 0
fi

python3 -m venv "$WORK/venv" >/dev/null 2>&1 || { echo "venv unavailable — skipping."; exit 0; }
# shellcheck disable=SC1091
source "$WORK/venv/bin/activate"
pip install --quiet "$REF_DIR" >/dev/null 2>&1 || {
  echo "Could not install the vendored reference — skipping (advisory only)."
  exit 0
}

disagreements=0
checked=0
for skill_dir in "$ROOT"/output/codex/.agents/skills/*/ "$ROOT"/output/opencode/.agents/skills/*/; do
  [[ -f "$skill_dir/SKILL.md" ]] || continue
  checked=$((checked + 1))
  if ! output=$(skills-ref validate "$skill_dir" 2>&1); then
    echo "  ⚠ disagreement: $(basename "$skill_dir")"
    echo "$output" | sed 's/^/      /'
    disagreements=$((disagreements + 1))
  fi
done

echo ""
echo "Checked $checked artifact(s); $disagreements disagreement(s) with the in-repo gate."
if [[ "$disagreements" -gt 0 ]]; then
  echo "Re-read https://agentskills.io/specification and reconcile deliberately."
  echo "This step does not fail the build."
fi
exit 0
