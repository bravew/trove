import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import YAML from "yaml";

export interface EvalStructureResult {
  skills: string[];
  errors: string[];
}

export function maintainedSkills(root: string): string[] {
  const skillsRoot = path.join(root, "skills");
  const names: string[] = [];
  for (const category of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const skill of fs.readdirSync(path.join(skillsRoot, category.name), { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      if (fs.existsSync(path.join(skillsRoot, category.name, skill.name, "SKILL.md.tmpl"))) names.push(skill.name);
    }
  }
  return names.sort();
}

export function changedFilesFromMergeBase(root: string, base: string, head = "HEAD"): string[] {
  const mergeBase = execFileSync("git", ["merge-base", base, head], { cwd: root, encoding: "utf-8" }).trim();
  return execFileSync("git", ["diff", "--name-only", "--diff-filter=ACDMR", mergeBase, head], {
    cwd: root,
    encoding: "utf-8",
  }).trim().split("\n").filter(Boolean);
}

export function skillsAffectedByFiles(root: string, files: string[]): string[] {
  const all = maintainedSkills(root);
  const affected = new Set<string>();
  const globalPattern = /^(hosts\/|templates\/|marketplace\.yaml$|VERSION$|scripts\/(?:gen-|validate|eval-runner)|scripts\/lib\/(?:projection|agent-skills|copilot|eval))/;
  if (files.some((file) => globalPattern.test(file))) return all;

  for (const file of files) {
    const canonical = file.match(/^skills\/[^/]+\/([^/]+)\//);
    if (canonical) affected.add(canonical[1]);
    const evalSuite = file.match(/^evals\/skill-evals\/([^/]+)\//);
    if (evalSuite) affected.add(evalSuite[1]);
    const bundled = file.match(/^plugins\/[^/]+\/(?:(?:\.copilot|\.agents)\/)?skills\/([^/]+)\//);
    if (bundled) affected.add(bundled[1]);

    const plugin = file.match(/^plugins\/([^/]+)\/(?:plugin\.yaml|hooks\/|agents\/)/);
    if (plugin) {
      const manifestPath = path.join(root, "plugins", plugin[1], "plugin.yaml");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = YAML.parse(fs.readFileSync(manifestPath, "utf-8")) as { skills?: Array<{ path: string }> };
      for (const skill of manifest.skills ?? []) affected.add(path.basename(skill.path));
    }
  }
  return [...affected].filter((name) => all.includes(name)).sort();
}

export function validateEvalStructure(root: string, requiredSkills = maintainedSkills(root)): EvalStructureResult {
  const errors: string[] = [];
  for (const skill of requiredSkills) {
    const suite = path.join(root, "evals", "skill-evals", skill);
    const tasksDir = path.join(suite, "tasks");
    const tasks = fs.existsSync(tasksDir)
      ? fs.readdirSync(tasksDir).filter((file) => file.endsWith(".md"))
      : [];
    if (tasks.length < 3) errors.push(`${skill}: expected at least 3 task fixtures, found ${tasks.length}`);

    const rubricPath = path.join(suite, "rubric.yaml");
    if (!fs.existsSync(rubricPath)) {
      errors.push(`${skill}: missing rubric.yaml`);
      continue;
    }
    let rubric: { min_pass_score?: unknown; criteria?: unknown };
    try {
      rubric = YAML.parse(fs.readFileSync(rubricPath, "utf-8")) as {
        min_pass_score?: unknown;
        criteria?: unknown;
      };
    } catch (error) {
      errors.push(`${skill}: invalid rubric.yaml: ${(error as Error).message}`);
      continue;
    }
    if (typeof rubric.min_pass_score !== "number" || rubric.min_pass_score < 0 || rubric.min_pass_score > 10) {
      errors.push(`${skill}: min_pass_score must be between 0 and 10`);
    }
    if (!rubric.criteria || typeof rubric.criteria !== "object" || Array.isArray(rubric.criteria)) {
      errors.push(`${skill}: criteria must be a mapping`);
      continue;
    }
    const criteria = Object.entries(rubric.criteria as Record<string, unknown>);
    if (criteria.length < 3) errors.push(`${skill}: expected at least 3 rubric criteria, found ${criteria.length}`);
    for (const [name, value] of criteria) {
      const criterion = value as { weight?: unknown; description?: unknown };
      if (!Number.isInteger(criterion?.weight) || (criterion.weight as number) <= 0) {
        errors.push(`${skill}: criterion ${name} needs a positive integer weight`);
      }
      if (typeof criterion?.description !== "string" || criterion.description.trim() === "") {
        errors.push(`${skill}: criterion ${name} needs a description`);
      }
    }
  }
  return { skills: [...requiredSkills].sort(), errors };
}
