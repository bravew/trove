/**
 * MCP server/tool canonical metadata + per-host projection.
 *
 * Plugins declare MCP servers in `plugin.yaml` as:
 *
 *   mcp_servers:
 *     <server-name>:
 *       type: http
 *       url: https://mcp.example.com/mcp
 *       optional: true
 *       description: "..."
 *       tools: [list_issues, get_issue]   # P5 addition — canonical
 *
 * The `tools:` list is the canonical surface. Skills should reference
 * tools semantically ("use the `list_issues` tool from the linear
 * server"); host adapters can render the host-native invocation form
 * (Claude: `mcp__linear__list_issues`; AGENTS.md: prose).
 */

import type { HostName } from "../../hosts/types";

export type McpFinding = { severity: "error" | "warning"; message: string };

export interface McpServer {
  type?: string;
  url?: string;
  optional?: boolean;
  description?: string;
  tools?: string[];
  /** Future: command-launched servers (stdio); we accept the field but don't validate it deeply yet. */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Validate the `mcp_servers:` section of a plugin.yaml. The schema is
 * intentionally permissive — the goal is to catch obvious typos in
 * canonical fields, not to second-guess a plugin author's URL choices.
 */
export function validateMcpMetadata(mcpServers: unknown): McpFinding[] {
  if (mcpServers === undefined || mcpServers === null) return [];
  const findings: McpFinding[] = [];

  if (typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    findings.push({ severity: "error", message: "`mcp_servers:` must be an object keyed by server name" });
    return findings;
  }

  for (const [name, raw] of Object.entries(mcpServers as Record<string, unknown>)) {
    const where = `mcp_servers.${name}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      findings.push({ severity: "error", message: `${where} must be an object` });
      continue;
    }
    const server = raw as Record<string, unknown>;

    // Either an HTTP-style server (url) or a command-style server (command)
    // is acceptable. Reject if neither is present.
    const hasUrl = typeof server.url === "string" && server.url.trim().length > 0;
    const hasCommand = typeof server.command === "string" && server.command.trim().length > 0;
    if (!hasUrl && !hasCommand) {
      findings.push({
        severity: "error",
        message: `${where}: must declare either 'url' (HTTP) or 'command' (stdio)`,
      });
    }

    if (server.type !== undefined && typeof server.type !== "string") {
      findings.push({ severity: "error", message: `${where}.type must be a string` });
    }
    if (server.optional !== undefined && typeof server.optional !== "boolean") {
      findings.push({ severity: "error", message: `${where}.optional must be a boolean` });
    }
    if (server.description !== undefined && typeof server.description !== "string") {
      findings.push({ severity: "warning", message: `${where}.description must be a string if present` });
    }

    if (server.tools !== undefined) {
      if (!Array.isArray(server.tools)) {
        findings.push({ severity: "error", message: `${where}.tools must be an array of strings` });
      } else {
        const seen = new Set<string>();
        for (const t of server.tools as unknown[]) {
          if (typeof t !== "string" || t.trim().length === 0) {
            findings.push({ severity: "error", message: `${where}.tools entries must be non-empty strings` });
            continue;
          }
          // Tool names should be valid identifiers. Real MCP servers use
          // snake_case (`list_issues`) or kebab-case (`notion-fetch`);
          // both are fine here. Dots are NOT permitted — Claude's
          // dispatcher renders tools as `mcp__<server>__<tool>` with `__`
          // as the separator, and a dot in the tool segment has no
          // documented meaning and silently breaks the invocation form.
          if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t)) {
            findings.push({
              severity: "error",
              message: `${where}.tools includes '${t}' which is not a valid identifier (allowed: alphanumeric, _, -; no dots, spaces, or path chars)`,
            });
          }
          if (seen.has(t)) {
            findings.push({ severity: "warning", message: `${where}.tools includes duplicate '${t}'` });
          }
          seen.add(t);
        }
      }
    }
  }

  return findings;
}

// ─── Projection ─────────────────────────────────────────────

/** Concise summary of an MCP server suitable for routing/info surfaces. */
export interface McpProjection {
  server: string;
  tools: string[];
  description: string | null;
  optional: boolean;
  /** Per-host invocation hints. Each entry is a renderable string. */
  examples: Partial<Record<HostName, string[]>>;
}

/**
 * Project canonical MCP metadata into per-host invocation examples.
 *
 *   Claude     → `mcp__<server>__<tool>` form
 *   Cursor     → tool names verbatim (Cursor surfaces MCP via its own UI)
 *   Codex      → tool names verbatim (Codex CLI uses canonical names)
 *   Generic    → semantic prose (no direct invocation syntax)
 *
 * The output is informational; nothing in the build wires these strings
 * into the inline skill body. They surface in `docs/mcp-integration.md`
 * and (in P5+) the CLI info command.
 */
export function projectMcpServers(mcpServers: Record<string, McpServer>): McpProjection[] {
  const projections: McpProjection[] = [];

  for (const [name, server] of Object.entries(mcpServers)) {
    const tools = (server.tools ?? []).filter((t) => typeof t === "string");
    const examples: Partial<Record<HostName, string[]>> = {};

    if (tools.length > 0) {
      examples.claude = tools.map((t) => `mcp__${name}__${t}`);
      examples.cursor = tools.map((t) => `${name}.${t}`);
      examples.codex = tools.map((t) => `${name}.${t}`);
      examples.agents = [
        `Use the ${name} MCP server. Available tools: ${tools.join(", ")}.`,
      ];
    } else {
      // Server with no tools list — generic guidance only.
      examples.agents = [`Use the ${name} MCP server (tool list not declared in metadata).`];
    }

    projections.push({
      server: name,
      tools,
      description: server.description ?? null,
      optional: Boolean(server.optional),
      examples,
    });
  }

  return projections;
}
