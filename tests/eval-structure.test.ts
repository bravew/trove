import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { maintainedSkills, skillsAffectedByFiles, validateEvalStructure } from "../scripts/lib/eval-structure";

const ROOT = path.resolve(import.meta.dir, "..");
const fixture = JSON.parse(fs.readFileSync(
  path.join(ROOT, "tests", "acceptance", "fixtures", "eval", "changed-files.json"),
  "utf-8",
)) as Record<string, string[]>;

describe("deterministic eval structure", () => {
  test("changed scope includes canonical support files", () => {
    expect(skillsAffectedByFiles(ROOT, fixture.canonical)).toEqual(["trove-typescript"]);
  });

  test("changed scope includes removed or edited eval suite files", () => {
    expect(skillsAffectedByFiles(ROOT, fixture.eval)).toEqual(["trove-typescript"]);
  });

  test("plugin hooks fan out to every skill in that plugin", () => {
    expect(skillsAffectedByFiles(ROOT, fixture.plugin)).toEqual([
      "trove-secret-scan",
      "trove-security-review",
    ]);
  });

  test("host and generator changes fan out to all maintained skills", () => {
    // Derived, not a literal: a new skill must not need this count edited.
    expect(skillsAffectedByFiles(ROOT, fixture.global)).toEqual(maintainedSkills(ROOT));
  });

  test("all required suites have tasks and valid rubrics", () => {
    expect(validateEvalStructure(ROOT).errors).toEqual([]);
  });

  test("missing required suites fail explicitly", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-eval-structure-"));
    try {
      fs.mkdirSync(path.join(root, "skills", "coding", "missing-eval"), { recursive: true });
      fs.writeFileSync(path.join(root, "skills", "coding", "missing-eval", "SKILL.md.tmpl"), "---\nname: missing-eval\n---\n");
      expect(validateEvalStructure(root).errors).toEqual([
        "missing-eval: expected at least 3 task fixtures, found 0",
        "missing-eval: missing rubric.yaml",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
