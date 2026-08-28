/**
 * Agent Skills specification: in-repo constants and validator.
 *
 * This module is the **blocking** conformance gate for strict Agent Skills
 * artifacts. It is written directly from the published specification rather
 * than delegating to `skills-ref`, whose reference implementation declares
 * itself demonstration-only and whose same-named npm package publishes no
 * repository link (see dev-doc/2026-08-modernization-plan.md, F14).
 *
 * When the spec changes, bump SPEC_REVISION in the same commit that changes
 * the rules below, so drift is a deliberate edit rather than a silent one.
 */

/** Spec revision this validator was written against. */
export const SPEC_REVISION = "2026-08-28";

/** Source URL for the revision above. */
export const SPEC_URL = "https://agentskills.io/specification";

/**
 * The complete set of frontmatter keys the specification defines. Anything
 * else is an internal authoring field and must not reach a strict artifact.
 */
export const SPEC_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
] as const;

export type SpecField = (typeof SPEC_FIELDS)[number];

export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const NAME_MAX = 64;
export const DESCRIPTION_MAX = 1024;
export const COMPATIBILITY_MAX = 500;

export interface SpecIssue {
  field: string;
  message: string;
}

export interface SpecReport {
  errors: SpecIssue[];
  warnings: SpecIssue[];
}

export function isSpecClean(report: SpecReport): boolean {
  return report.errors.length === 0;
}

/**
 * Validate a parsed frontmatter object against the Agent Skills spec.
 *
 * @param fm            Parsed frontmatter as a plain object.
 * @param expectedName  Parent directory name. When given, `name` must equal it.
 */
export function validateAgentSkillFrontmatter(
  fm: Record<string, unknown>,
  expectedName?: string,
): SpecReport {
  const errors: SpecIssue[] = [];
  const warnings: SpecIssue[] = [];
  const err = (field: string, message: string) => errors.push({ field, message });

  // ── name ──────────────────────────────────────────────────
  const name = fm.name;
  if (typeof name !== "string" || name.length === 0) {
    err("name", "required and must be a non-empty string");
  } else {
    if (name.length > NAME_MAX) {
      err("name", `must be 1-${NAME_MAX} characters (got ${name.length})`);
    }
    if (!NAME_PATTERN.test(name)) {
      err(
        "name",
        `must match ${NAME_PATTERN.source} — lowercase alphanumerics separated by ` +
          `single hyphens, with no leading, trailing, or consecutive hyphens (got "${name}")`,
      );
    }
    if (expectedName !== undefined && name !== expectedName) {
      err("name", `must equal the parent directory name "${expectedName}" (got "${name}")`);
    }
  }

  // ── description ───────────────────────────────────────────
  const description = fm.description;
  if (typeof description !== "string" || description.trim().length === 0) {
    err("description", "required and must be a non-empty string");
  } else if (description.length > DESCRIPTION_MAX) {
    err("description", `must be at most ${DESCRIPTION_MAX} characters (got ${description.length})`);
  }

  // ── compatibility ─────────────────────────────────────────
  if (fm.compatibility !== undefined) {
    if (typeof fm.compatibility !== "string") {
      err("compatibility", "must be a string when present");
    } else if (fm.compatibility.length > COMPATIBILITY_MAX) {
      err(
        "compatibility",
        `must be at most ${COMPATIBILITY_MAX} characters (got ${fm.compatibility.length})`,
      );
    }
  }

  // ── license ───────────────────────────────────────────────
  if (fm.license !== undefined && typeof fm.license !== "string") {
    err("license", "must be a string when present");
  }

  // ── metadata ──────────────────────────────────────────────
  if (fm.metadata !== undefined) {
    const meta = fm.metadata;
    if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
      err("metadata", "must be a mapping of string keys to string values");
    } else {
      for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
        if (typeof value !== "string") {
          err(
            "metadata",
            `value for "${key}" must be a string; the spec defines metadata as ` +
              `string -> string and this project does not define an encoding for ` +
              `${Array.isArray(value) ? "arrays" : typeof value}`,
          );
        }
      }
    }
  }

  // ── allowed-tools ─────────────────────────────────────────
  // The spec marks this experimental and defines it as a space-separated
  // list, so an entry containing whitespace is not representable.
  if (fm["allowed-tools"] !== undefined) {
    const tools = fm["allowed-tools"];
    if (typeof tools !== "string") {
      err("allowed-tools", "must be a space-separated string in a strict artifact");
    } else {
      for (const entry of tools.split(/\s+/).filter(Boolean)) {
        if (entry.includes("(") !== entry.includes(")")) {
          warnings.push({
            field: "allowed-tools",
            message:
              `entry "${entry}" looks truncated — an authored tool pattern containing ` +
              `whitespace cannot round-trip through the space-separated spec encoding`,
          });
        }
      }
    }
  }

  // ── unknown keys ──────────────────────────────────────────
  const allowed = new Set<string>(SPEC_FIELDS);
  for (const key of Object.keys(fm)) {
    if (!allowed.has(key)) {
      err(
        key,
        `is not an Agent Skills field and must not appear in a strict artifact ` +
          `(allowed: ${SPEC_FIELDS.join(", ")})`,
      );
    }
  }

  return { errors, warnings };
}
