# Contributing to Trove

## Getting Started

```bash
git clone https://github.com/bravew/trove.git
cd trove
bun install
bun run build
bun run validate
bun test
```

You need [Bun](https://bun.sh/) ≥ 1.0. Everything else (TypeScript, YAML parser, Anthropic SDK) installs via `bun install`.

## Making changes

### Add a skill to an existing plugin

```bash
bun run scaffold:skill -- --plugin trove-dev --name trove-debug
# edit skills/<category>/trove-debug/SKILL.md.tmpl
bun run build && bun run validate
# open a PR against main
```

### Create a new plugin

```bash
bun run scaffold:plugin -- --name trove-analytics --role pm
# add skills, hooks, MCP servers as needed
# register in marketplace.yaml
bun run build && bun run validate
# open a PR against main
```

### Update an existing skill

```bash
# edit skills/<category>/<skill-name>/SKILL.md.tmpl
bun run build:skills        # regenerate just the skill projections
bun run validate            # check frontmatter, decision gates, secrets
```

### Add a curated third-party plugin

External plugins live as JSON stubs in `curated/`. Each requires a SHA pin on `source.ref` before inclusion in `marketplace.yaml`. This is the staging area before official adoption.

## PR workflow

```
   feature branch
        │
        ▼  open PR against main
   ┌──────────────┐
   │  validate.yml │   bun run validate → build → build:skills --dry-run (freshness)
   └──────────────┘
        │
        ▼  peer review
   merge to main
        │
        ▼  release.yml fires
   build → validate → eval:gate → bump-version → update CHANGELOG → tag → publish Release → force-push canary
        │
        ▼  48-hour soak
   bun run promote-stable   →  stable channel
```

**Don't bump `VERSION` or write a `## [x.y.z]` CHANGELOG header in your PR.** `release.yml` owns both — it bumps on merge, prepends the auto-generated release notes (PR-driven, grouped by label) to `CHANGELOG.md`, commits, tags, force-pushes the result to `canary`, and publishes a GitHub Release with the same body. The in-repo `CHANGELOG.md` and the [Releases page](https://github.com/bravew/trove/releases) stay in lockstep. Hand-bumping in a feature branch collides with the release workflow.

CalVer (`YYYY.M.D`) means same-day merges share a tag. The first merge of the day creates the GitHub Release and the `CHANGELOG.md` entry with notes covering commits since the previous day's tag; subsequent same-day merges land on `main` and `canary` but don't open a new tag, release, or CHANGELOG entry — those late merges roll into the next day's entry. If a busy day's release should reflect every merge, edit the Release and the CHANGELOG entry manually after the day rolls over.

## Naming conventions

| Layer | Convention | Example |
|-------|------------|---------|
| Plugin name | `trove-<name>` (kebab-case) | `trove-dev` |
| Skill name | `trove-<name>` (kebab-case, ≤ 64 chars, no colons) | `trove-python` |
| Category | One of: `development`, `design`, `product`, `security`, `infrastructure`, `observability` | `development` |
| Role | One of: `dev`, `design`, `pm`, `devops` | `dev` |
| Branch | `feat/<thing>`, `fix/<thing>`, `chore/<thing>` | `feat/p6-routing-graph` |

Colons (`:`) are namespace separators in slash-command syntax (`trove-dev:commit`); they are **not** part of skill names.

## Code review checklist

- [ ] Skill follows naming conventions (kebab-case, `trove-` prefix)
- [ ] `description:` is specific about *what* the skill does and *when* it activates
- [ ] Body is under 500 lines (warning past that)
- [ ] No secrets or credentials in any file (validator scans for them)
- [ ] Works on every target platform — `bun run build && bun run validate`
- [ ] Tests pass — `bun test`
- [ ] Eval rubric + tasks added for high-usage skills (see [eval-system.md](./eval-system.md))
- [ ] If new skill auto-attaches: `activation.globs:` set (canonical v2)
- [ ] If skill orchestrates others: `benefits-from:` lists clear pairings only

## Eval gate

`bun run eval:gate` runs on push to `main`. If `ANTHROPIC_API_KEY` is set as a repo secret, it scores changed skills against their rubrics; otherwise it runs a structure check (rubric + tasks + skill body present). Either way, broken eval shape (missing rubric, zero tasks) fails CI.

To run locally:

```bash
export ANTHROPIC_API_KEY=...
bun run eval:changed       # only skills changed since HEAD~1
bun run eval:gate          # full sweep
```

See [eval-system.md](./eval-system.md) for rubric and task format.

## Release channels

- **canary** — auto-deployed on merge to `main` (force-push from `release.yml`). Early adopters track this branch and get updates immediately.
- **stable** — promoted manually from `canary` after a ~48-hour soak. Run `bun run promote-stable` from `main` or `canary` once the soak passes without regressions.

There is no per-PR version bump. Every merge to `main` produces exactly one canary release.

## Questions?

Open a [GitHub Discussion](https://github.com/bravew/trove/discussions) or an issue.
