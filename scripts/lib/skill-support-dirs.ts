/**
 * Support directories a skill may carry next to its SKILL.md.
 *
 * These are the Agent Skills spec's optional directories. The build copies
 * exactly these into every host output and plugin bundle, the upstream sync
 * treats them as canonical artifact content, and the importer flags any other
 * top-level directory. Keep the three in step by reading this list.
 *
 * Binary and size limits still apply to every file inside them.
 */
export const SKILL_SUPPORT_DIRS = ["references", "scripts", "assets"] as const;

export type SkillSupportDir = (typeof SKILL_SUPPORT_DIRS)[number];

/** Human-readable list for error messages, e.g. "references/, scripts/, or assets/". */
export const SKILL_SUPPORT_DIRS_TEXT = SKILL_SUPPORT_DIRS.map((dir, index) =>
  `${index === SKILL_SUPPORT_DIRS.length - 1 ? "or " : ""}${dir}/`,
).join(", ");
