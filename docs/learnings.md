# Project Learnings

A small append-only log of durable insights about a project. Stored locally,
keyed per-project by repo slug, never silently exported.

## Location

```
~/.trove/projects/<slug>/learnings.jsonl
```

`<slug>` is derived from the project's git remote (preferred) or the working
directory name (fallback). Example slugs:

| Repo | Slug |
|---|---|
| `https://github.com/bravew/trove.git` | `trove-trove` |
| Local-only project at `/Users/x/code/myapp` | `myapp` |

`TROVE_HOME` overrides the parent directory; tests rely on this.

## Entry shape

One JSON object per line:

```json
{
  "ts": "2026-04-30T12:00:00Z",
  "skill": "trove-review",
  "type": "pattern",
  "key": "python-ruff-required",
  "insight": "Run ruff before finalizing Python changes.",
  "confidence": 4
}
```

Field meanings:

| Field | Required | Notes |
|---|:---:|---|
| `ts` | Yes | ISO-8601 timestamp. Auto-set if omitted on append. |
| `skill` | Yes | Skill that produced or owns the learning. |
| `type` | Yes | `pattern` (reusable approach), `pitfall` (what NOT to do), `preference` (user-stated), `architecture`, `tool`, `operational`. |
| `key` | Yes | Short stable identifier (kebab-case). |
| `insight` | Yes | One-sentence description. |
| `confidence` | Yes | 1-5 integer. 1 = guess; 5 = verified by user. |

## CLI

```bash
trove learnings log '{"skill":"trove-review","type":"pattern","key":"x","insight":"y","confidence":3}'
trove learnings search                       # most recent N (default 3, capped by learnings_max_results)
trove learnings search --skill trove-review   # filter by skill
trove learnings search --type pitfall        # filter by type
trove learnings search --query ruff          # case-insensitive substring on insight + key
```

## Privacy

- Local-first. The CLI never uploads.
- Append-only. There is no `learnings delete`. To prune, edit the JSONL.
- Per-project. A learning logged in repo A does not leak into repo B.
- Capped retrieval. `learnings_max_results` (default 3) prevents the prompt
  context from being flooded.
- `learnings_enabled: false` short-circuits search — useful when you want a
  clean slate without deleting the log.

## When to log

Log when you discovered something **durable** — a project-specific quirk, a
non-obvious convention, a debug story the next session would benefit from.
Don't log:

- One-shot bug fixes (the commit message captures that)
- Obvious facts ("the codebase is in TypeScript")
- Per-session noise

## When to read

Read at the start of a relevant skill workflow, not on every prompt. The
typical pattern is one `learnings search --skill <skill-name>` at the
beginning of a session, with the cap honored.
