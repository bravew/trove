# Upstream sync operations

The updater is deterministic. It selects upstream files, applies declared
transformations, replays checked-in patches, and stops before writing on a
conflict, license change, unsafe path, unexpected file type, or size limit.
No model decides which bytes enter the repository.

## Local commands

Run the offline lock gate without network access:

```sh
bun run sync:upstream -- --check --offline
```

Fetch current upstream heads and write stable JSON and Markdown reports:

```sh
bun run sync:upstream -- --check \
  --json upstream-report.json \
  --markdown upstream-report.md
```

Update one artifact from a clean worktree:

```sh
bun run sync:upstream -- --update trove-react-view-transitions \
  --json upstream-report.json \
  --markdown upstream-report.md
```

Update mode writes only after the candidate patch applies cleanly. It then runs
the build, full test suite, and validation. A failed check restores the complete
tracked worktree snapshot.

## Automation rollout

The weekly `check` job has `contents: read`, holds no model secret, and uploads
the machine report. An available update is a report result, not a failing job.

The manual `update` job remains disabled until the repository variable
`UPSTREAM_SYNC_WRITES_ENABLED` is set to `true`. Enable it only after two weekly
check runs complete successfully and their artifacts have been inspected.

Before enabling writes, create `UPSTREAM_SYNC_TOKEN` as a fine-scoped automation
token limited to this repository with contents and pull-request write access.
The update job has no OIDC permission and receives no interactive subscription
credential.

Each update run handles one artifact. Its branch name includes the full
candidate SHA, so reruns converge on the same branch and open at most one pull
request. No-op, conflict, license-change, and validation-failure results create
no branch.

## Monitoring

The code owner reviews changes to the manifest, patches, updater, and workflow.
Dependabot proposes updates to pinned GitHub Actions. Review the new action
commit before merging and keep the workflow reference pinned to a full SHA.

Inspect the first two scheduled report artifacts manually. After write mode is
enabled, exercise workflow dispatch for no-op, clean update, conflict, and
validation-failure fixture branches before scheduling update jobs. Scheduled
updates remain disabled until that track record exists.

The `workflow_dispatch` `artifact` input is free-form: any artifact id from
`upstream.yaml`. The default remains `trove-react-view-transitions`. The
scheduled `check` job walks the whole manifest, so newly enrolled artifacts
appear in `upstream-report.json` with no workflow-logic change.

## Manifest keys that change lock coverage

Canonical artifact paths are `SKILL.md.tmpl`, `references/**`, and
`scripts/**`. Everything else is rejected.

### `replace-literal`

A deterministic, path-scoped string rewrite. It fails closed when the mapped
path is missing, is not canonical, or the occurrence count is below
`minimum_occurrences`.

```yaml
- kind: replace-literal
  path: references/runtime-spec.md
  from: "`/last30days"
  to: "`/trove-research:trove-pulse"
  minimum_occurrences: 1
```

Keep the list short. Start with the slash-command form only when renaming an
invocation; a bare `/name` substring will also rewrite GitHub URLs and
`~/.config/name` paths.

### `local_only`

Paths that `walkLocal` still validates for safety and file type, but omits from
`local_tree_digest` and from the reconstruction comparison. Use this for
Trove-authored files that sit next to a vendored tree (the `trove-pulse`
wrapper `SKILL.md.tmpl`). Drift in `local_only` content is caught by
`bun run validate` / `bun test`, not by the sync lock.

### Per-artifact `policy`

Optional. Overrides `maximum_file_bytes` and `maximum_artifact_bytes` for one
artifact. An override may only *raise* a global limit; lowering one fails at
parse. Record a rationale comment next to the block. Omitting the block
preserves the manifest defaults.

## Sync acceptance protocol

A deterministic byte update is only half of a sync. Every accepted update runs
this protocol in the same PR as the byte change.

1. **Read the change, not just the digest.** From `upstream-report.md`, take
   `changed_paths` and the upstream commit range. Classify each change:

   | Upstream change | Trove obligation |
   |---|---|
   | New source, flag, or mode | Name it in the wrapper's invocation section if a user would ask for it by name; otherwise the vendored spec covers it. |
   | New or renamed env var / credential | Update the wrapper's Configuration section **and** `docs/user-config.md`. |
   | New external binary or vendored dependency | Review it explicitly (`scripts/lib/vendor/**` is a named review trigger), add it to prerequisites and `THIRD_PARTY.md`. |
   | Changed output contract or invocation shape | Re-check the wrapper's Trove-overrides list. |
   | New consent or data-access behavior | Re-check the first-run Decision Gate. Any new access to local data defaults to off. |
   | Engine-internal refactor only | No wrapper change. Say so in the PR. |

2. **Re-project to every runtime.** `bun run build` regenerates host outputs.
   Confirm each declared host actually received the `scripts/` tree and a
   `SKILL.md` projected through its own profile:

   ```sh
   bun run build && bun run validate && bun test
   bun run build:skills -- --dry-run
   bun run validate:claude-manifests
   for skill in trove-pulse trove-pulse-cn; do
     ls output/{cursor,codex,opencode,gemini}/.agents/skills/$skill/scripts >/dev/null || echo "MISSING: $skill"
     ls plugins/trove-research/skills/$skill/scripts >/dev/null || echo "MISSING bundle: $skill"
   done
   ```

3. **Match Trove's voice and conventions.** The vendored spec keeps upstream's
   voice. Anything Trove authors stays inside the 500-line / ~5,000-token
   budget, uses the documented Decision Gate format, references
   `${CLAUDE_SKILL_DIR}`, and keeps `triggers` at four or fewer.

4. **Re-run the skill** when `changed_paths` touch the engine entry point,
   pipeline, renderer, or env module. Live run plus the health check
   (`doctor` / `--diagnose`) on at least one host, with the output in the PR.

5. **Record it.** Bump `metadata.upstream-version` (wrapper for `trove-pulse`,
   `local.patch` frontmatter for `trove-pulse-cn`) when upstream cuts a
   release, add a `CHANGELOG.md` entry when a user-visible capability changed,
   and state in the PR which of steps 1–4 applied. "No wrapper change needed"
   is a valid outcome; an unstated one is not.

`bun test` asserts that each pulse artifact's `metadata.upstream-version`
matches the upstream `version` it was built from (`references/runtime-spec.md`
for `trove-pulse`, `SKILL.md.tmpl` for `trove-pulse-cn`).

