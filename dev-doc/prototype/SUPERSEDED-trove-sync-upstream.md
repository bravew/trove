---
description: Check vendored skills against their upstream repos, apply safe updates, and open a PR
argument-hint: "[skill-name | --source <id> | --report-only]"
allowed-tools: Bash(gh api:*), Bash(gh pr *), Bash(git *), Bash(bun run *), Bash(diff:*), Bash(mkdir:*), Bash(cp:*), Bash(rm -rf /tmp/trove-sync*), Read, Write, Edit, Glob, Grep
---

# Sync Vendored Skills With Upstream

## Context

- Manifest: @upstream.yaml
- Branch: !`git branch --show-current`
- Working tree: !`git status --short`
- Today: !`date -u +%Y-%m-%d`

Scope override (a skill name, `--source <id>`, or `--report-only`): $ARGUMENTS

## Task

`upstream.yaml` declares every file in this repo that originated elsewhere, each
pinned to an upstream commit SHA. Upstream moves; this repo does not. Find the
drift, apply what is safe to apply, and put the rest in front of a human.

You are a **librarian, not an author**. Do not improve, reword, or reformat
upstream content while syncing. Do not fix unrelated problems you notice. A sync
PR that also contains hand edits is unreviewable.

## Non-negotiable rules

1. **SHA and content hash are the only drift signals.** Never trust an upstream
   `metadata.version` string. `vercel-labs/agent-skills` still declares
   `version: "1.0.0"` for a skill whose body has tripled in length.
2. **Never silently revert a declared divergence.** Every entry has a
   `divergence:` list — the local changes that are deliberate (the `trove-`
   rename, the `{{PREAMBLE}}` placeholder, added stack notes). If an upstream
   change collides with one, do not resolve it yourself: leave the local version
   in place and record the collision in the PR body under **Needs a decision**.
3. **Never edit generated output.** Source of truth is `SKILL.md.tmpl`. Change
   the template, then run `bun run build`. Files under `output/`,
   `plugins/*/skills/`, and `plugins/*/.agents/` are build artifacts.
4. **Re-verify the license every run.** If an upstream skill's frontmatter no
   longer declares the license recorded in `upstream.yaml`, stop syncing that
   skill, leave the pin untouched, and raise it in the PR body. Do not guess a
   license from a repo that has none.
5. **One concern per commit.** One commit per synced skill, plus one commit for
   manifest/pin updates. No mixed commits.
6. **Entries with `sync: false` are provenance records only.** Report nothing
   for them beyond an open `todo:`.

## Steps

### 1. Read the manifest

Parse `upstream.yaml`. Build the work list from `sources[].skills[]` and
`curated[]`, skipping anything with `sync: false`. Apply `$ARGUMENTS` as a
filter if one was given.

### 2. Detect drift (read-only)

For each source repo, resolve the current `ref` head:

```
gh api repos/<repo>/commits/<ref> --jq '.sha'
```

For each tracked skill, get the newest commit touching its upstream path:

```
gh api "repos/<repo>/commits?path=<upstream_path>&per_page=1" --jq '.[0] | {sha:.sha, date:.commit.committer.date}'
```

If that SHA equals `pinned_sha`, the skill is current — record and move on.

Otherwise fetch both trees and compare file-by-file. Classify every file:

| Class | Meaning | Action |
|---|---|---|
| `unchanged` | identical after `path_map` | none |
| `upstream-only-change` | upstream edited, no local divergence touches it | **apply** |
| `new-upstream-file` | file exists upstream, not locally | **apply** (respecting `path_map`) |
| `removed-upstream` | file gone upstream, still local | **report**, do not delete |
| `collision` | upstream edited a region a `divergence:` entry covers | **report**, keep local |
| `local-only` | Trove-authored addition | none |

Work in `/tmp/trove-sync-<run-id>/`. Never clone into the repo.

### 3. Apply what is safe

Only `upstream-only-change` and `new-upstream-file` are applied automatically.

- Apply to the **template** (`SKILL.md.tmpl`) and to `references/`, translating
  paths through `path_map`.
- Preserve the local frontmatter wholesale — `name`, `{{PREAMBLE}}`, Trove
  metadata. Take upstream's **body** only.
- If upstream added a `references/` file, add it and add the link to it in the
  body only if upstream's body links it.

If a skill's body would grow past 500 lines, do not truncate it — apply the
change and flag it in the PR body as a `trove-write-skill` budget follow-up.

### 4. Rebuild and validate

```
bun run build
bun run validate
```

Both must pass. If `validate` fails, do not open a PR with a red tree: fix only
what the sync introduced, or drop the offending skill from this run and report
why.

### 5. Update the pins

For every skill actually synced, write back `pinned_sha`, `pinned_date`, and
clear any `status: stale`. Update the source's `head:` and `checked:` to today.
For skills you did **not** sync, leave the pin untouched — a pin means "this is
what we have", not "this is what we looked at".

Also refresh `curated[].verified` after confirming each pinned SHA still
resolves:

```
gh api repos/<repo>/commits/<sha> --jq '.commit.committer.date'
```

A pin that no longer resolves is a **blocking** finding, not a warning.

### 6. Report new upstream skills

List upstream skill directories absent from both `skills[]` and `not_vendored[]`.
These are candidates, not work — name them in the PR body and stop.

### 7. Open the PR

Skip entirely if nothing changed. Otherwise:

```
git checkout -b chore/upstream-sync-<YYYY-MM-DD>
```

Commit per skill: `chore(upstream): sync <skill> to <short-sha>`, then
`chore(upstream): update pins`. Open with `gh pr create`.

**PR body must contain, in this order:**

- **Synced** — table: skill · old SHA → new SHA · upstream commit date · files changed
- **Needs a decision** — every `collision`, with the divergence rule it hit and both versions quoted
- **Removed upstream** — files gone upstream that we still ship
- **New upstream skills** — candidates not yet vendored
- **License check** — one line per source: confirmed, or what changed
- **Verification** — the exact `bun run build && bun run validate` output

Label the PR `upstream-sync`. Never enable auto-merge.

## Report

- **DONE** — PR URL, skills synced, count of items needing a decision
- **NO-OP** — every pin current; say which SHAs were checked
- **BLOCKED** — what failed (unresolvable pin, license change, red validate), what was attempted, and what a human should do

## Running unattended

This command is safe on a schedule because it never force-pushes, never merges,
never deletes a local file, and stops at a PR. Two failure modes to watch for in
CI: a scheduled GitHub Actions run is attributed to the user who last edited the
`cron` line, and if that account is a bot the action rejects it unless listed in
`allowed_bots`; and GitHub disables schedules on public repos after 60 days of
no repository activity.
