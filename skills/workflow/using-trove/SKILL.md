---
name: using-trove
description: "Skill discipline anchor for the Trove marketplace. Loaded once per session; routes the agent to the right trove-* skill before code, planning, review, or git actions."
when_to_use: "session start; skill routing; trove bootstrap"
user-invocable: false
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

# using-trove

User instructions outrank Trove skills, and Trove skills outrank default model behavior. When a user instruction conflicts with a skill, ask a concise clarifying question or name the conflict before continuing. Never silently downgrade a user instruction.

Before code changes, planning work, code review, debugging, skill authoring, delegation, or git actions, check whether a `trove-*` skill applies. If one applies, name the selected skill once in your response, invoke that skill through the available skill-loading mechanism, and follow it. Do not reinvent the skill guidance inline and do not paraphrase this anchor back to the user.

Routing source: read the generated routing fragment `routing.md` next to the plugin manifest when this plugin is installed. The repository aggregate lives at `docs/routing.md`; use it as the fallback when the plugin fragment is not present.

When a workflow skill matches, follow its steps in order; if you skip one, say so in a line rather than dropping it silently. When a `trove-principle-*` skill shaped a decision, name it and the specific choice it changed (a principle cited with no concrete decision behind it was not applied). Run prose you produce — replies, PR text, release notes — through `trove-unslop`. Proceed on reversible work and present the result for course-correction; still confirm before irreversible or destructive actions per the hard rules below.

Decision gates use the standard format documented in `scripts/lib/decision-gate.ts`: context, question, options, and default. Link to or invoke the relevant skill instead of duplicating gate wording from another skill.

Hard rules: do not rewrite tracked files without a user prompt, do not run destructive git without explicit confirmation, do not use `--no-verify`, and do not claim completion until the relevant verification has actually run or the gap is clearly stated.
