# Dropping the `trove-` Prefix from Skill Names

**Status:** Proposed. The decision in §6 is open — §§7–11 are written against Option C
(pure rename) because that is the option under evaluation, not because it is approved.
**Reviewed:** 2026-09-10
**Repository baseline:** `feat/github-copilot-marketplace` at `bbc9644`, `VERSION` `2026.8.29`
**Companions:** [2026-09-github-copilot-marketplace-plan.md](./2026-09-github-copilot-marketplace-plan.md),
[upstream-provenance-audit.md](./upstream-provenance-audit.md)
**Constraint accepted by the owner:** existing installs may break. Migration is
"remove the plugin, install again"; no compatibility shim, no alias period.

The ask: invocation reads `/trove-dev:trove-test-gap-audit`, and the `trove` is in there
twice. Make it `/trove-dev:test-gap-audit`.

The prefix is redundant on exactly the install paths that carry a namespace, and
load-bearing on the ones that do not. This document quantifies what "load-bearing" costs
if we drop it anyway, then specifies the migration.

## 1. Where a skill name is resolved, per install path

`name` in the frontmatter is not a display string. The Agent Skills spec requires it to
**match the parent directory name**, and `scripts/lib/agent-skills-spec.ts` gates that in
`bun run validate`. So the name *is* the install directory, and the install directory is
what the host resolves.

| Install path | Where the directory lands | Namespace | Prefix redundant? |
|---|---|---|---|
| Claude Code — marketplace | inside the plugin | `trove-dev:<skill>` | **yes** |
| Claude Code — `./setup` symlink | `~/.claude/skills/<skill>/` | none — flat, global | no |
| Copilot CLI — plugin install | `.copilot/skills/` in plugin | plugin-scoped | **yes** |
| Copilot CLI — personal / project | `~/.copilot/skills`, `~/.agents/skills`, `.github/skills` | none — flat, first-found | no |
| Codex | `~/.agents/skills/<skill>/` | none — flat, global, vendor-neutral | no |
| OpenCode | `~/.config/opencode/skills/<skill>/` | none — flat, global | no |
| Cursor | `~/.cursor/skills/trove/<skill>/` | directory groups, model still sees bare `name` | partial |
| Gemini CLI | `~/.gemini/extensions/<plugin>/skills/<skill>/` | extension-scoped, but workspace `.agents/skills` takes precedence | partial |

Sources: `docs/host-matrix.md`; `setup:346-419`; `agentskills.io/specification`;
`code.claude.com/docs/en/plugins-reference`.

`setup:346` carries a comment recording that a `~/.claude/skills/trove/` grouping folder
was **removed** because Claude discovers personal skills only at
`~/.claude/skills/<skill-name>/SKILL.md`. A grouping directory with no `SKILL.md` is read
as a broken skill. There is no way to reintroduce a namespace on that path.

## 2. What a collision actually does — six failure modes

Not one failure. Six, with different blast radii and different detectability.

### 2.1 Silent non-install (`./setup`)

`setup:92-112` (`link_skill`) skips any target it did not create:

```
elif [[ -e "$target" ]]; then
  warn "Skipping $(basename "$target"): $target already exists and is not a Trove link"
  return 0
```

A user with `awesome-copilot`'s `test-gap-audit` already at `~/.agents/skills/` runs
`./setup` and gets **one warn line inside a 54-skill install log**, then a Trove install
that is silently missing that skill. `./setup --uninstall` will not clean it up either,
because it was never recorded in `installed-links.tsv`. Detectability: low. The user
believes they have Trove's skill.

### 2.2 Silent wrong-skill execution (runtime, all flat-root hosts)

Copilot and Codex resolve skills **first-found** across roots — project `.github/skills`
beats `.claude/skills` beats `.agents/skills` beats personal. `docs/host-matrix.md`
records this: *"Skills and agents resolve first-found, so project or personal
customizations can silently shadow an installed plugin component."*

So a project-local `test-gap-audit/` shadows the installed Trove one with **no warning at
all**. The user asks for a test-gap audit, a skill named `test-gap-audit` runs, output
appears, and nothing anywhere indicates whose skill it was. This is the worst mode: it is
undetectable from inside the session and produces plausible-looking output.

### 2.3 Fork/origin indistinguishability — self-inflicted, today

This is not hypothetical and it is not about third parties. `upstream.yaml:307` records:

```
{ local_path: skills/review/trove-docs-sync-audit, origin: adapted,
  source_id: awesome-copilot, upstream_path: skills/docs-sync-audit, ... }
```

Both skills this PR adds are **adapted forks of `awesome-copilot` skills of the same
name**. Measured — stripping `trove-` from all 54 skill names and diffing against the 418
skills in `_sample/awesome-copilot`:

```
docs-sync-audit
refactor
security-review
test-gap-audit
```

Four exact collisions against **one** catalog, two of them introduced by this very PR.
After a rename, Trove's fork and its own upstream occupy the same directory name with
divergent content — the Trove versions carry the preamble tier and the discipline anchor,
the upstream ones do not. Whichever install ran last wins, and the two are
indistinguishable by name.

### 2.4 The generic-name tail is worse than the exact-collision head

The four exact hits are the visible part. The real exposure is the bare-name list itself:

```
a11y architect arena autoplan brainstorm cdk commit component-spec debug design-review
dispatch docker docs-sync-audit execute-plan explain lambda perf plan
principle-* pulse pulse-cn python react react-best-practices react-native
react-view-transitions receive-review refactor reflect release-notes review secret-scan
security-review ship show-work spec swift tdd terraform test-gap-audit typescript unslop
user-story verify visual-parity vue why worktree write-skill
```

`python`, `react`, `vue`, `swift`, `debug`, `plan`, `review`, `commit`, `spec`,
`refactor`, `verify`, `explain`, `perf`, `terraform`, `docker`, `lambda`, `cdk`, `tdd`,
`typescript` are the single most likely names any other publisher picks. Crowding in the
same catalog, counting skills whose name *starts with* one of our bare tokens:

| token | `awesome-copilot` skills starting with it |
|---|---|
| react | 11 |
| python | 3 |
| refactor | 3 |
| review | 2 |
| plan | 2 |
| swift, commit, verify, typescript, terraform | 1 each |

Zero exact hits on `react` today. Eleven neighbours. The probability that one of 418 →
1000+ skills lands on the bare word is not small, and it only ever goes up.

### 2.5 Provenance and sync machinery keys on the local name

`upstream.yaml` maps `local_path` → `upstream_path`, and `upstream-patches/` is keyed by
the local skill name:

```
upstream-patches/trove-docs-sync-audit/local.patch
upstream-patches/trove-test-gap-audit/local.patch
upstream-patches/trove-react-best-practices/  trove-react-native/
upstream-patches/trove-react-view-transitions/  trove-pulse-cn/
```

Rename and `local_path` becomes `skills/review/docs-sync-audit` while `upstream_path`
stays `skills/docs-sync-audit` — identical basenames on both sides of a provenance
mapping whose whole job is telling fork from origin. `bun run sync:upstream` and the
weekly workflow need the patch directories moved in the same commit or they silently stop
matching.

### 2.6 The `trove-*` routing heuristic stops being a heuristic

`skills/workflow/using-trove/SKILL.md.tmpl:21`:

> check whether a `trove-*` skill applies

and line 3 of its description. The anchor's cheapest signal is a name pattern. Bare names
remove it, so the anchor must be reworded to route by an explicit list — which means the
generated routing fragment becomes load-bearing where a glob used to do the job. Also
`scripts/scaffold-skill.ts:39` and `scripts/scaffold-plugin.ts:36` auto-prefix, and
`scripts/validate.ts:207` warns on unprefixed *plugin* names.

### 2.7 What does **not** break

Worth stating plainly, so the risk is not overstated:

- Claude Code marketplace installs cannot collide. Plugin skills are always namespaced
  `plugin-name:skill-name`, and both `/skill-name` and the plugin copy stay reachable.
- Copilot plugin-bundle installs cannot collide — `.copilot/skills/` is plugin-scoped.
- Cursor's `~/.cursor/skills/trove/<skill>/` grouping prevents a *filesystem* collision,
  though two skills named `review` still both register with the model.
- Nothing here corrupts data or loses work. Every failure mode is "wrong skill ran" or
  "skill missing", not "repo damaged".

## 3. Precedent

`_sample/awesome-copilot` — 418 skills, GitHub's own catalog — uses **no publisher
prefix** but leans on topical prefixes (`arize-*`, `acreadiness-*`, `agent-*`,
`ai-team-*`). It also ships `plugins/ai-team-orchestration/` containing a skill named
`ai-team-orchestration` — the exact plugin/skill repetition under discussion here,
accepted upstream.

So "no `trove-` prefix" is a mainstream convention. "No prefix **and** single generic
words" is not; the catalogs that drop the publisher prefix replace it with a topical one.

## 4. The internal inconsistency is not an accident

`scripts/validate.ts:261-264` already warns on a redundant prefix — for **commands**:

```
// No prefix needed — plugin namespacing handles conflict avoidance
// Warn if using a redundant prefix that duplicates the plugin name
```

Which is why commands are `/trove-dev:commit`, not `/trove-dev:trove-commit`. That rule is
correct *because commands only ever exist inside a plugin namespace* — `commands/` is
never installed into a shared root. Skills are the opposite case. The split is principled;
it is just undocumented, which is why it reads as inconsistency.

## 5. Options

| | Invocation | Flat-root safety | Cost |
|---|---|---|---|
| **A** keep prefix | `/trove-dev:trove-test-gap-audit` | safe | 6 redundant chars on 2 of 8 paths |
| **B** dual identity via projection | short on plugin hosts, prefixed on flat hosts | safe | one skill, two names — *on the same host*, since Claude Code has both install paths |
| **C1** rename to bare names | `/trove-dev:test-gap-audit` | 4 known collisions + a generic tail | §7 migration; §2 risk is permanent |
| **C2** rename + distinctiveness rule | `/trove-dev:test-gap-audit` | fewer collisions | `python`/`react`/`vue`/`swift` have no distinctive long form that is not just re-prefixing |

B is rejected: a marketplace user would say `/trove-dev:test-gap-audit` and a `./setup`
user `trove-test-gap-audit` on the same host, and 54 skills' worth of in-body
cross-references (`use trove-tdd to write the test`, `benefits-from`, `docs/routing.md`)
would need projection-time regex rewriting.

C2 is the honest version of C: it keeps the ergonomic win where it is safe and admits that
the framework skills cannot be de-prefixed safely. It costs a split convention.

## 6. Decision — OPEN

**Recommendation: A**, on the evidence in §2. The win is 6 characters on 2 of 8 install
paths; the cost is §2.2 (silent wrong-skill execution, undetectable) and §2.3 (Trove's own
forks shadowing their own upstreams), and neither is fixable by us afterwards.

**If the owner picks C anyway**, §§7–11 are the plan, and C2's distinctiveness rule (§9)
should be adopted with it rather than C1 bare. Record the choice here before Checkpoint 1
starts.

```
Decision:            [x] A   [ ] B   [ ] C1   [ ] C2
Decided by:          repository owner
Date:                2026-09-10
Rationale:           The win is 6 characters on 2 of 8 install paths. The cost is
                     §2.2 (silent wrong-skill execution, undetectable from inside a
                     session) and §2.3 (Trove's own forks shadowing their own
                     upstreams), neither fixable after the fact. Migration cost was
                     explicitly waived by the owner and was never the deciding
                     factor.
```

**Landed with the decision** (`feat/github-copilot-marketplace`):

- `scripts/validate.ts` — skill `name` must start with `trove-` (error; `using-`
  anchors exempt), mirroring the inverted command rule at `validate.ts:261` and
  citing this plan in the failure message.
- `docs/skill-authoring.md` — the existing naming section re-grounded on the
  mechanism (spec `name` == directory, flat shared roots, first-found
  resolution) and the measured collisions, replacing the weaker
  "substantial refactor / cost-benefit" wording.
- `docs/host-matrix.md` — a Naming section stating the rule alongside the
  discovery roots that motivate it.

§§7–11 stay as written. They are the migration spec if this is ever revisited,
and §11 records that reversal is cheap only before a canary release.

**Live upstream escape hatch.** `docs/skill-authoring.md` tracks
[`require-namespace: true`](https://github.com/anthropics/claude-code/issues/43695),
a proposed Claude Code frontmatter field that suppresses the unqualified short
form. If it ships, it removes the stutter *without* renaming anything — which is
the outcome Option C was reaching for, at none of its cost. That is the thing to
watch, not a rename.

## 7. Migration surface

427 tracked files reference a `trove-<skill>` name. They split cleanly:

**Hand-authored — must be edited (or moved) by the migration:**

| Surface | Count | Change |
|---|---|---|
| `skills/*/*/SKILL.md.tmpl` | 55 of 55 | directory rename + `name:` + `benefits-from:` + in-body cross-references |
| `plugins/*/plugin.yaml` | 7 of 7 | `path: ./skills/<new-name>` |
| `evals/skill-evals/<skill>/` | 55 dirs, 10 files with refs | directory rename + `rubric.yaml` refs |
| `upstream.yaml` | 82 refs | `local_path` for every vendored skill |
| `upstream-patches/<skill>/` | 6 dirs | directory rename |
| `tests/*.ts` | 24 files, 115 name literals | assertion updates |
| `scripts/` | 13 files | `scaffold-skill.ts:39`, `validate.ts` rules, any hardcoded names |
| `docs/` | 17 files | prose + `docs/bootstrap.md` anchor references |
| `marketplace.yaml` | 14 refs | skill lists |
| `README.md` | 25 refs | examples |
| `quality/vally-baseline.v1.json` | 1 | re-anchor after paths move (same shape as `bbc9644`) |
| `skills/workflow/using-trove/SKILL.md.tmpl` | 2 refs | reword the `trove-*` glob (§2.6) |

**Generated — rebuild, never hand-edit** (660 tracked files): `plugins/*/skills/`,
`plugins/*/.copilot/`, `plugins/*/.plugin/`, `plugins/*/.claude-plugin/`, `output/**`,
`.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`,
`.github/plugin/marketplace.json`, `catalog.json`, `deps.json`, `docs/routing.md`.

The generated half is why this is mechanically safe: `bun run verify:generated` fails if
any of it drifts from the sources, so a missed rename in the hand-authored half surfaces
as a build diff rather than a runtime surprise.

## 8. Naming rules after the change

Replaces the implicit `trove-` convention. Enforced in `scripts/validate.ts`, not prose —
per `trove-principle-encode-in-structure`.

1. Skill `name` matches its parent directory (already spec-gated).
2. Lowercase kebab-case, no colons, ≤64 chars (already enforced).
3. **New (error):** must not start with `trove-`, mirroring the command rule at
   `validate.ts:261`, with a message naming the plugin namespace as the reason.
4. **New (error), C2 only:** must be ≥2 hyphen-separated tokens. Blocks `review`,
   `commit`, `debug`, `plan`, `spec`, `refactor`, `verify`, `explain`, `perf`, `python`,
   `react`, `vue`, `swift`, `docker`, `terraform`, `lambda`, `cdk`, `tdd`, `a11y`,
   `arena`, `why`, `ship`, `unslop`, `reflect`.
5. **New (warn):** name must not collide with a known-catalog name. Seed the deny-list
   from `_sample/awesome-copilot/skills` and refresh it in the weekly upstream sync.

Rule 4 is where C2 costs something: `trove-python` has no good two-token bare form.
`python-conventions`, `fastapi-conventions`, `react-conventions` are the candidates and
they are worse names than `trove-python` was. Decide these 24 by hand in Checkpoint 1, not
by a script.

## 9. Checkpoints

Each checkpoint ends green — `bun run build && bun run validate && bun test` — before the
next starts. One commit per checkpoint.

**Checkpoint 1 — name table.** Produce `dev-doc/2026-09-skill-rename-map.tsv`
(`old_name  new_name  plugin  rationale`) for all 54 skills. Hand-decide the 24 single-token
names from §8 rule 4. No code changes. **Gate: owner signs off on the table.** Everything
after this is mechanical; this is the only step with judgment in it.

**Checkpoint 2 — sources.** Rename `skills/<category>/<old>/` → `<new>/` with `git mv`,
rewrite `name:` and every in-body cross-reference, update `plugins/*/plugin.yaml` paths and
`benefits-from`. Rebuild. Verify: `bun run verify:generated` clean; `bun run validate` clean;
`docs/routing.md`, `deps.json`, `catalog.json` regenerate with the new names and no
`{{...}}` leakage.

**Checkpoint 3 — provenance.** `git mv upstream-patches/<old>/ <new>/`; update every
`local_path` in `upstream.yaml`. Verify: `bun run sync:upstream --dry-run` resolves all
six vendored skills; `bun test tests/upstream-sync.test.ts`.

**Checkpoint 4 — evals and quality.** `git mv evals/skill-evals/<old>/ <new>/`; update
`rubric.yaml` references. Re-anchor `quality/vally-baseline.v1.json` the same way `bbc9644`
did. Verify: `bun run eval:structure` clean; `bun run quality:report`.

**Checkpoint 5 — rules.** Add §8 rules 3–5 to `scripts/validate.ts`; invert
`scaffold-skill.ts:39` to reject rather than add the prefix; reword the two `trove-*`
references in `using-trove`. Verify: a fixture skill named `trove-foo` errors; a fixture
named `review` errors under rule 4; `bun test`.

**Checkpoint 6 — tests and docs.** Update the 115 name literals across 24 test files,
`README.md`, `docs/**`. Add the naming rules and the §2 rationale to
`docs/skill-authoring.md` and a Naming row to `docs/host-matrix.md`, so §2 does not have
to be rediscovered. Verify: full `bun run build && bun run validate && bun test &&
bun run verify:generated && bun run test:acceptance:artifacts`.

**Checkpoint 7 — install acceptance.** `bun run test:acceptance:setup` (disposable HOME),
`bun run test:acceptance:copilot`. Then a live install of Claude Code and Copilot CLI from
the local checkout, confirming `/trove-dev:test-gap-audit` resolves and the `using-trove`
anchor still fires. Verify §2.1 explicitly: pre-seed `~/.agents/skills/test-gap-audit/` in
the disposable HOME, run `./setup`, and assert the skip warning is emitted — the collision
path should be *tested*, not merely accepted.

## 10. Migration for existing users

Per the owner's constraint, no shim. Release note text:

> Skill names dropped the redundant `trove-` prefix — `/trove-dev:trove-review` is now
> `/trove-dev:review`. Remove and reinstall the plugins:
> `/plugin marketplace remove trove` then `/plugin marketplace add bravew/trove`.
> `./setup` users: run `./setup --uninstall` **before** pulling, then `./setup` again.

The ordering matters. `./setup --uninstall` removes exactly what
`~/.trove/installed-links.tsv` records; if the user pulls first, the manifest lists old
names that no longer exist in the checkout and the old symlinks are orphaned in
`~/.agents/skills/` — where they become the §2.2 shadowing hazard against the new install.
Checkpoint 7 must cover this sequence.

## 11. Reversal cost

Low before release, high after. Checkpoints 2–4 are `git mv` plus regeneration and can be
reverted as one commit while unreleased. Once a canary release ships, reversing means a
second breaking rename and a second "remove and reinstall" for the same users, so treat
the merge to `main` as the point of no return.

## 12. Sources

- Agent Skills specification — <https://agentskills.io/specification> (`name` must match
  parent directory; 1–64 chars; no consecutive hyphens)
- Claude Code plugins reference — <https://code.claude.com/docs/en/plugins-reference>
  (plugin skills always namespaced `plugin-name:skill-name`)
- Claude Code skills — <https://code.claude.com/docs/en/skills>
- Copilot CLI plugin reference —
  <https://docs.github.com/copilot/reference/copilot-cli-reference/cli-plugin-reference>
- `github/awesome-copilot` — <https://github.com/github/awesome-copilot> (418 skills,
  no publisher prefix, topical prefixes; measured at `_sample/awesome-copilot`)
- In-repo: `docs/host-matrix.md`, `setup:92-112`, `setup:346-419`,
  `scripts/validate.ts:206-264`, `scripts/lib/agent-skills-spec.ts`, `upstream.yaml:307`
