import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assignmentErrors,
  legacyCategorySelector,
  loadTaxonomy,
  resolveSkillCategory,
  taxonomyProblems,
} from "../scripts/lib/categories";

const ROOT = path.resolve(import.meta.dir, "..");

test("the taxonomy has 57 distinct categories and no structural problems", () => {
  const taxonomy = loadTaxonomy(ROOT);
  expect(taxonomy.schemaVersion).toBe(1);
  expect(taxonomy.categories).toHaveLength(57);
  expect(taxonomyProblems(taxonomy)).toEqual([]);
});

test("every registered skill resolves to exactly one known category", () => {
  expect(assignmentErrors(ROOT)).toEqual([]);
  expect(resolveSkillCategory("trove-python", ROOT)?.category).toEqual({ id: "code", label: "Code" });
  expect(resolveSkillCategory("trove-web-clip", ROOT)?.category.id).toBe("files-documents");
});

test("legacy selectors keep workflow and dev apart", () => {
  expect(legacyCategorySelector("trove-workflow")).toBe("workflow");
  expect(legacyCategorySelector("trove-dev")).toBe("development");
  expect(legacyCategorySelector("trove-workflow")).not.toBe(legacyCategorySelector("trove-dev"));
});

test("unknown categories and a marketplace override are rejected", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "trove-categories-"));
  fs.copyFileSync(path.join(ROOT, "categories.yaml"), path.join(fixture, "categories.yaml"));
  fs.mkdirSync(path.join(fixture, "plugins/trove-fixture"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "plugins/trove-fixture/plugin.yaml"),
    "name: trove-fixture\ndescription: fixture\ncategory: not-a-category\nskills:\n  - path: ./skills/trove-one\n");
  fs.writeFileSync(path.join(fixture, "marketplace.yaml"),
    "plugins:\n  - name: trove-fixture\n    source: trove-fixture\n    category: design\n");

  const errors = assignmentErrors(fixture);
  expect(errors.map((error) => error.message)).toEqual([
    "category 'not-a-category' is not in the taxonomy",
    "skill 'trove-one' has no category",
    "'trove-fixture' sets category 'design', which belongs in its plugin.yaml",
  ]);
  fs.rmSync(fixture, { recursive: true, force: true });
});
