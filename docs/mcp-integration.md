# MCP Integration

[Model Context Protocol](https://modelcontextprotocol.io) servers expose
external systems (Linear, Notion, Sentry, Figma, Slack, …) as tools the
agent can call. This repo declares the relationship in plugin metadata
once; host adapters render the host-native invocation form.

## Canonical schema

In `plugin.yaml`:

```yaml
mcp_servers:
  linear:
    type: http
    url: https://mcp.linear.app/mcp
    optional: true
    description: "Linear issue tracking via OAuth."
    tools:
      - list_issues
      - get_issue
      - create_issue
      - update_issue
```

| Field | Required | Notes |
|---|:---:|---|
| `url` *or* `command` | One of | HTTP server vs stdio (command-launched). |
| `type` | No | Free-form string (`http`, `stdio`, etc.). Most common: `http`. |
| `optional` | No | When `true`, missing the server is fine; the plugin still installs. |
| `description` | No | One-line, surfaced in routing/info. |
| `tools` | No | Canonical tool list for documentation, projection, and `trove info`. |

## Per-host projection

Skills should reference tools **semantically** ("use the `list_issues`
tool from the Linear server") rather than locking the body to one
host's invocation syntax. The build's projection helpers render the
host-native form for documentation and CLI surfaces:

| Host | Form |
|---|---|
| Claude Code | `mcp__<server>__<tool>` (e.g., `mcp__linear__list_issues`) |
| Cursor | `<server>.<tool>` (Cursor surfaces MCP via its own UI; tool name verbatim) |
| OpenAI Codex | `<server>.<tool>` (Codex CLI uses canonical names) |
| Generic AGENTS.md | Prose form: "Use the linear MCP server. Available tools: …" |

Projection lives in `scripts/lib/mcp.ts:projectMcpServers`. It
returns an `McpProjection[]` with per-host `examples` arrays. Today
this is consumed by docs and the CLI; future surfaces (a routing
appendix, a per-skill MCP hint block) consume the same shape.

## Validation

`bun run validate` checks:

- `mcp_servers:` is a YAML object keyed by server name.
- Each server has either `url` (HTTP) or `command` (stdio).
- `optional` is boolean if present.
- `tools:` is an array of tool-identifier strings (alphanumeric + `_ . -`).
  Names that don't match the identifier shape produce a warning, not an error.
- Duplicate tool names within one server's list produce a warning.

Permissive on purpose: the validator doesn't second-guess URL choices,
and missing `tools:` is fine — older entries pre-date the schema.

## Authoring guidance

- **Cap `tools:` to the ones you actually rely on.** A 30-tool list
  isn't useful documentation; it's a wall the next reader skims past.
- **Prefer `optional: true` for third-party servers.** Plugin authors
  shouldn't make the install fail because someone's Linear OAuth is
  pending.
- **Keep `description:` one line.** It surfaces inline in `bun run validate`
  and `trove info`; longer prose belongs in plugin docs.
- **Don't reference tools by host-specific syntax in skill bodies.**
  Write "use the `get_issue` tool from the linear server" — the host
  adapter handles `mcp__linear__get_issue` rendering.

## What this *does not* do

- No automatic MCP server install — that's a host concern.
- No per-tool permission scoping in metadata yet (deferred).
- No execution path through the metadata; this is documentation +
  routing surface, not a runtime feature.
