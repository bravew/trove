---
name: trove-why
description: "Reconstruct design rationale and decision history from evidence — source control, issue tracker (Linear), docs (Notion), chat (Slack), error tracking (Sentry) — with calibrated confidence. Use for \"why does X work this way\", \"why did we pick Y\", regressions, and postmortems. Use trove-explain for how it works now."
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run build:skills -->

> Trove · v2026.7.4

## Session Init

This skill ships Trove conventions. Prefer existing project patterns over generic best practices when they conflict.

If a sibling skill in this plugin matches the request more directly, defer to it. See `AGENTS.md` (or `docs/routing.md` in the marketplace) for the per-plugin routing index.

# trove-why

Reconstruct *intent* from fragmentary historical evidence. Never infer intent from the code's current shape — that tells you what is, not why.

## Evidence sources

Query the evidence sources that are actually available, one bounded read-only pass each (delegate in parallel when several apply — see [docs/orchestration.md](../../docs/orchestration.md)):

| Category | Where | Tools (fully-qualified) |
|---|---|---|
| Source control | git log/blame, PRs | `git`, `gh` |
| Issue tracker | Linear | `Linear:list_issues`, `Linear:get_issue` |
| Long-form docs | Notion | `Notion:search_pages`, `Notion:get_page` |
| Real-time chat | Slack | `Slack:search_messages`, `Slack:get_thread` |
| Error tracking | Sentry | `Sentry:search_issues`, `Sentry:get_issue` |

Reference MCP tools by their fully-qualified `Server:tool` name — bare names fail to resolve when several servers are loaded. Keep queries targeted (a specific issue, a dated thread); do not pull whole issue lists or entire docs into context (MCP calls are token-expensive). A server that isn't connected is a null result to report, not an error.

## Output

Separate what you know from what you're guessing:

- **What we found** — direct evidence, each claim cited to its source.
- **What we can reasonably infer** — clearly labeled as inference, not fact.
- **Competing hypotheses** — when the evidence is ambiguous, list them; don't collapse to one.
- **Sources consulted** — which sources were available, which were queried, and which returned nothing. A null result is first-class evidence.

Don't fabricate a rationale to fill a gap. "No evidence found; here is the most likely explanation, low confidence" is a valid and honest answer.

See [references/sources.md](references/sources.md) for per-source query tips.
