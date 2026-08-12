/**
 * Hook schema validation.
 *
 * Hooks are deterministic shell scripts the host runs at lifecycle
 * boundaries. We only support the documented Claude Code hook events;
 * other hosts can map a subset to their own surfaces but the canonical
 * event names live here.
 *
 * See `docs/hooks.md` for the on-disk contract and good-vs-bad uses.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Supported hook event names. Matches Claude Code's documented hook
 * lifecycle. Adding a new event name here is intentional — it must
 * correspond to a real host-supported event, not speculative behavior.
 */
export const HOOK_EVENTS = [
  "SessionStart",
  "Setup",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "MessageDisplay",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "Elicitation",
  "ElicitationResult",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

const TOOL_MATCHER_EVENTS = new Set<string>([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
]);

/** Single hook entry inside `hooks: <event>: [...]`. */
export interface HookEntry {
  /** Tool-name regex; required for PreToolUse / PostToolUse, ignored otherwise. */
  matcher?: string;
  /** Shell command to invoke. May reference `${PLUGIN_ROOT}`. */
  command: string;
  /** One-line author note. */
  description?: string;
}

export type HookFinding = { severity: "error" | "warning"; message: string };

/**
 * Validate the `hooks:` section of a plugin.yaml. Returns structured
 * findings; the caller decides how to surface them.
 *
 * @param hooks    The hooks object from plugin.yaml (untyped because it
 *                 may contain author errors).
 * @param pluginDir Plugin directory (used to resolve `${PLUGIN_ROOT}`
 *                  references when checking that command files exist).
 */
export function validateHooks(
  hooks: unknown,
  pluginDir: string,
): HookFinding[] {
  if (hooks === undefined || hooks === null) return [];
  const findings: HookFinding[] = [];

  if (typeof hooks !== "object" || Array.isArray(hooks)) {
    findings.push({ severity: "error", message: "`hooks:` must be an object keyed by event name" });
    return findings;
  }

  const eventSet = new Set<string>(HOOK_EVENTS);

  for (const [event, entries] of Object.entries(hooks as Record<string, unknown>)) {
    if (!eventSet.has(event)) {
      findings.push({
        severity: "error",
        message: `unknown hook event '${event}' (valid: ${HOOK_EVENTS.join(", ")})`,
      });
      continue;
    }

    if (!Array.isArray(entries)) {
      findings.push({
        severity: "error",
        message: `hook event '${event}' must map to an array of entries`,
      });
      continue;
    }

    entries.forEach((raw, idx) => {
      const where = `hooks.${event}[${idx}]`;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        findings.push({ severity: "error", message: `${where} must be an object` });
        return;
      }
      const entry = raw as Record<string, unknown>;

      // command is required.
      if (typeof entry.command !== "string" || entry.command.trim().length === 0) {
        findings.push({ severity: "error", message: `${where}.command is required (string)` });
      } else {
        validateCommandFile(entry.command, pluginDir, `${where}.command`, findings);
      }

      // matcher is recommended for tool-call hooks, otherwise optional.
      const wantsMatcher = TOOL_MATCHER_EVENTS.has(event);
      if (entry.matcher !== undefined) {
        if (typeof entry.matcher !== "string") {
          findings.push({
            severity: "error",
            message: `${where}.matcher must be a string (regex, e.g. "Write|Edit")`,
          });
        } else {
          try {
            new RegExp(entry.matcher);
          } catch (e) {
            findings.push({
              severity: "error",
              message: `${where}.matcher is not a valid regex: ${(e as Error).message}`,
            });
          }
        }
      } else if (wantsMatcher) {
        findings.push({
          severity: "warning",
          message: `${where}.matcher is recommended for ${event} (e.g. "Write|Edit") — without it the hook fires on every tool call`,
        });
      }

      if (entry.description !== undefined && typeof entry.description !== "string") {
        findings.push({ severity: "warning", message: `${where}.description must be a string if present` });
      }
    });
  }

  return findings;
}

/**
 * Resolve `${PLUGIN_ROOT}/...` command references to on-disk paths and
 * verify each script exists. Other shell-syntax forms (raw command names,
 * env-vars besides PLUGIN_ROOT) are intentionally not validated — we'd
 * false-positive on tools available via PATH.
 *
 * Validates **every** `${PLUGIN_ROOT}/...` occurrence in the command, so
 * `${PLUGIN_ROOT}/run.sh ${PLUGIN_ROOT}/config.json` checks both files,
 * not just the first.
 */
function validateCommandFile(
  command: string,
  pluginDir: string,
  where: string,
  findings: HookFinding[],
): void {
  const trimmed = command.trim();
  if (!trimmed.includes("${PLUGIN_ROOT}")) return;

  // Match every `${PLUGIN_ROOT}/<path>` occurrence. The `/` is required
  // immediately after the variable so a bare `${PLUGIN_ROOT}` (no path)
  // doesn't silently pass — we catch that case explicitly below.
  const matches = [...trimmed.matchAll(/\$\{PLUGIN_ROOT\}(\/\S*)?/g)];

  for (const match of matches) {
    const relSuffix = match[1];
    if (!relSuffix || relSuffix === "/") {
      findings.push({
        severity: "error",
        message: `${where}: '${trimmed}' uses \${PLUGIN_ROOT} but provides no script path`,
      });
      continue;
    }

    const relativePath = relSuffix.replace(/^\/+/, "");
    const fullPath = path.join(pluginDir, relativePath);

    if (!fs.existsSync(fullPath)) {
      findings.push({
        severity: "error",
        message: `${where}: script does not exist at ${path.relative(process.cwd(), fullPath)}`,
      });
      continue;
    }

    // Best-effort executable check — a non-executable script will fail
    // at runtime in a confusing way. This warning catches it early. We
    // only check the first reference (typically the script being run);
    // additional references are usually data files (configs, fixtures)
    // for which executability isn't meaningful.
    if (match === matches[0]) {
      try {
        const stat = fs.statSync(fullPath);
        const mode = stat.mode & 0o111;
        if (mode === 0) {
          findings.push({
            severity: "warning",
            message: `${where}: script is not executable — chmod +x ${path.relative(process.cwd(), fullPath)}`,
          });
        }
      } catch {
        // Unreadable stat is rare; the existence check above is the main signal.
      }
    }
  }
}
