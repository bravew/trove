/**
 * Frontmatter v2 schema helpers.
 *
 * Returns structured diagnostics rather than throwing so callers can
 * collect errors and warnings into a single validation report.
 *
 * The v2 schema is **additive** over v1: every field is optional, and
 * legacy `paths:` is still tolerated alongside `activation.globs`. The
 * generator and routing index prefer v2 fields when both are present.
 */

import { ALL_HOST_NAMES } from "../hosts/index";

/** Tools recognized in `allowed-tools`. Mirrors the Claude Code surface. */
const KNOWN_TOOLS = new Set<string>([
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  // `Task` and `Agent` both refer to the sub-agent dispatch tool; Claude
  // Code has used both names across versions, so accept either.
  "Task",
  "Agent",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "NotebookEdit",
]);

function isKnownToolReference(value: string): boolean {
  const exact = value.trim();
  if (KNOWN_TOOLS.has(exact)) return true;

  const match = exact.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\(.*\))$/);
  return match ? KNOWN_TOOLS.has(match[1]) : false;
}

/** Allowed preamble tier range — matches `templates/preamble-tier-{N}.md`. */
const MIN_PREAMBLE_TIER = 1;
const MAX_PREAMBLE_TIER = 4;

/** Severity-tagged validation finding. */
export interface SchemaFinding {
  severity: "error" | "warning";
  message: string;
}

export interface SchemaReport {
  errors: SchemaFinding[];
  warnings: SchemaFinding[];
}

function emptyReport(): SchemaReport {
  return { errors: [], warnings: [] };
}

function fail(report: SchemaReport, message: string): void {
  report.errors.push({ severity: "error", message });
}

function warnFinding(report: SchemaReport, message: string): void {
  report.warnings.push({ severity: "warning", message });
}

/** Best-effort semver check — accepts MAJOR.MINOR.PATCH with optional prerelease. */
function isSemver(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.trim());
}

/**
 * Validate v2-specific frontmatter fields.
 *
 * @param parsed - Parsed YAML frontmatter (best-effort, may be partial).
 * @param knownSkills - Skill names that exist in the workspace, used to
 *                      resolve `benefits-from` references. Pass an empty
 *                      Set to skip the cross-skill check.
 */
export function validateV2Frontmatter(
  parsed: Record<string, unknown>,
  knownSkills: Set<string>,
): SchemaReport {
  const report = emptyReport();

  // version: optional, but must parse as semver if present.
  if ("version" in parsed) {
    if (!isSemver(parsed.version)) {
      fail(report, `'version' must be semver (got: ${JSON.stringify(parsed.version)})`);
    }
  }

  // preamble-tier: optional, must be an integer in [1, 4].
  if ("preamble-tier" in parsed) {
    const tier = parsed["preamble-tier"];
    if (typeof tier !== "number" || !Number.isInteger(tier)) {
      fail(report, `'preamble-tier' must be an integer (got: ${JSON.stringify(tier)})`);
    } else if (tier < MIN_PREAMBLE_TIER || tier > MAX_PREAMBLE_TIER) {
      fail(
        report,
        `'preamble-tier' must be in [${MIN_PREAMBLE_TIER}..${MAX_PREAMBLE_TIER}] (got: ${tier})`,
      );
    }
  }

  // triggers: optional, must be an array of short strings.
  if ("triggers" in parsed) {
    const triggers = parsed.triggers;
    if (!Array.isArray(triggers)) {
      fail(report, `'triggers' must be an array of strings`);
    } else {
      for (const t of triggers) {
        if (typeof t !== "string") {
          fail(report, `'triggers' entries must be strings (got: ${JSON.stringify(t)})`);
        } else if (t.length > 80) {
          warnFinding(report, `trigger '${t.slice(0, 40)}…' is longer than 80 chars`);
        }
      }
      if (triggers.length > 8) {
        warnFinding(report, `'triggers' has ${triggers.length} entries — recommended cap is 4-6`);
      }
    }
  }

  // activation.globs: optional, must be a non-empty array of strings if present.
  if ("activation" in parsed) {
    const activation = parsed.activation;
    if (!activation || typeof activation !== "object") {
      fail(report, `'activation' must be an object`);
    } else {
      const globs = (activation as { globs?: unknown }).globs;
      if (globs !== undefined) {
        if (!Array.isArray(globs) || globs.length === 0) {
          fail(report, `'activation.globs' must be a non-empty array of strings`);
        } else {
          for (const g of globs) {
            if (typeof g !== "string") {
              fail(
                report,
                `'activation.globs' entries must be strings (got: ${JSON.stringify(g)})`,
              );
            }
          }
        }
      }
      const manual = (activation as { manual?: unknown }).manual;
      if (manual !== undefined && typeof manual !== "boolean") {
        fail(report, `'activation.manual' must be a boolean if present`);
      }
    }
  }

  // allowed-tools: optional, only known tool names.
  if ("allowed-tools" in parsed) {
    const tools = parsed["allowed-tools"];
    if (!Array.isArray(tools)) {
      fail(report, `'allowed-tools' must be an array of strings`);
    } else {
      for (const t of tools) {
        if (typeof t !== "string") {
          fail(report, `'allowed-tools' entries must be strings`);
          continue;
        }
        if (!isKnownToolReference(t)) {
          warnFinding(report, `'allowed-tools' references unknown tool '${t}'`);
        }
      }
    }
  }

  // benefits-from: optional, references must resolve to known skills (when
  // a knownSkills set is supplied).
  if ("benefits-from" in parsed) {
    const benefits = parsed["benefits-from"];
    if (!Array.isArray(benefits)) {
      fail(report, `'benefits-from' must be an array of skill names`);
    } else {
      for (const b of benefits) {
        if (typeof b !== "string") {
          fail(report, `'benefits-from' entries must be strings`);
          continue;
        }
        if (knownSkills.size > 0 && !knownSkills.has(b)) {
          warnFinding(report, `'benefits-from' references unknown skill '${b}'`);
        }
      }
    }
  }

  // host-overrides: optional, keys must be known host names.
  if ("host-overrides" in parsed) {
    const overrides = parsed["host-overrides"];
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      fail(report, `'host-overrides' must be an object keyed by host name`);
    } else {
      for (const key of Object.keys(overrides)) {
        if (!ALL_HOST_NAMES.includes(key as (typeof ALL_HOST_NAMES)[number])) {
          fail(
            report,
            `'host-overrides' references unknown host '${key}' (valid: ${ALL_HOST_NAMES.join(", ")})`,
          );
        }
      }
    }
  }

  return report;
}
