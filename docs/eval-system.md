# Eval System

Per-skill workflow rubrics with LLM-as-judge scoring. Replaces the older
generic-quality judge so each skill is graded against criteria that
actually matter for that workflow.

## Layout

```
evals/
  judge-prompts/
    code-quality-judge.md      # Default judge prompt
  skill-evals/
    <skill-name>/
      rubric.yaml              # Criteria, weights, min_pass_score
      tasks/
        task-01-foo.md         # Concrete tasks, 1+ per skill
        task-02-bar.md
```

Every maintained skill has a `rubric.yaml` plus at least 3 tasks. The
runner (`scripts/eval-runner.ts`) discovers them by directory name.

## Rubric format

```yaml
criteria:
  follows_async_patterns:
    weight: 3
    description: "Uses httpx.AsyncClient, asyncio.sleep, async with — never blocking calls in async"
  uses_type_hints:
    weight: 2
    description: "All function signatures have type hints (params + return)"
  proper_logging:
    weight: 2
    description: "Uses logger.exception in except blocks, static messages for warning/error"

min_pass_score: 7.0
```

| Field | Notes |
|---|---|
| `criteria.<name>.weight` | Integer. Higher weight = matters more in the weighted average. |
| `criteria.<name>.description` | One sentence stating *what good looks like*. The judge sees this verbatim. |
| `min_pass_score` | 0-10. Below this, the skill fails the gate. |

### Criterion writing guidance

- **Be concrete.** "Uses async/await correctly" is too vague.
  "Uses httpx.AsyncClient, asyncio.sleep, async with — never blocking
  calls in async" gives the judge something to check.
- **Cap at 5-7 criteria.** More than that and weights stop being
  meaningful.
- **Keep the rubric domain-relevant.** A rubric for `trove-commit`
  shouldn't grade "uses type hints" — that's `trove-python`'s problem.

## Task format

```markdown
# Task: Write a commit message for this diff

Given the following git diff, write an appropriate commit message:

```diff
…
```
```

Tasks should be:
- **Concrete.** Real diffs, real code, real prompts — not "imagine you got asked to…".
- **Short.** 10-30 lines. Long tasks dilute the criterion-by-criterion grading signal.
- **Cover one rubric criterion at a time** where possible. Three tasks each
  exercising a different criterion is more useful than one big task that touches
  everything.
- **Include regressions.** When a real bug surfaces in skill behavior, add a
  task that pins the fixed behavior so it doesn't regress.

## Runner

```bash
# Run all skill evals
bun run scripts/eval-runner.ts

# Run only changed skills (PR-friendly)
bun run eval:changed

# Run gate-level evals — blocks release if structure or scores fail
bun run eval:gate
```

`--changed` detects skills whose `SKILL.md.tmpl` (or anything under
`skills/<…>/<skill>/`) was modified relative to `HEAD~1`. Without an
`ANTHROPIC_API_KEY`, the runner falls back to a structure check (rubric +
tasks + skill body present); with an API key, it scores tasks against
the rubric.

## CI

The PR `validate` workflow runs `bun run eval:changed`. If
`ANTHROPIC_API_KEY` is set as a repo secret, scoring runs; otherwise the
structure check runs. Either way, broken eval shape (missing rubric,
zero tasks) fails the PR.

The post-merge `eval-gate` job runs the full sweep on `main`.

The `skill-triggering` job is separate from rubric scoring. It runs
`tests/skill-triggering/run.sh` and is intentionally `continue-on-error: true`
for the first stable week after bootstrap rollout. Without
`RUN_SKILL_TRIGGERING_LIVE=1`, the runner performs structure checks only:
each skill needs `prompts.md`, at least three `Prompt:` lines, at least three
H2 prompt sections, and boolean `skill_invoked` / `before_first_edit` fields
in `expected.yaml`.

When live mode is enabled, the runner executes the prompts through headless
Claude and requires at least 2/3 prompts per skill to satisfy the expected
skill invocation and before-first-edit behavior. After one stable week of
green live runs, flip the CI job to `continue-on-error: false` and record the
promotion date in the next release note. If flakiness exceeds 10% after
promotion, demote the job back to warn-only and tune the prompts before
re-promoting.

## Judge

`evals/judge-prompts/code-quality-judge.md` is the default judge system
prompt. The runner sends `[skill body, task content, rubric criteria]`
and asks for JSON `{ scores, weighted_average, pass, rationale }`.

The runner recomputes `weighted_average` from per-criterion `scores` to
defend against the judge stating one number while reporting different
ones — the math is authoritative.

## What this *does not* cover

- Statistical-confidence framework. Each task runs once; aggregate
  variance is not measured. Adequate for catching gross regressions; not
  adequate for fine-grained A/B comparisons.
- Cost dashboards. Token usage isn't tracked beyond what the SDK reports
  in the response.
- Multi-judge consensus. P5 leaves the system at one judge; cross-model
  agreement is a future enhancement.
