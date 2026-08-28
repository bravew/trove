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
