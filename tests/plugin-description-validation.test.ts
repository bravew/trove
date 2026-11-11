import { expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

test("plugin validation rejects tags in registered plugin-local descriptions", () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "trove-description-"));
  try {
    for (const dir of ["scripts", "hosts"]) {
      fs.cpSync(path.join(ROOT, dir), path.join(fixture, dir), { recursive: true });
    }
    fs.copyFileSync(path.join(ROOT, "VERSION"), path.join(fixture, "VERSION"));
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(fixture, "node_modules"), "dir");
    const plugin = path.join(fixture, "plugins/trove-fixture");
    const skill = path.join(plugin, "skills/trove-local/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(path.join(plugin, "plugin.yaml"),
      "name: trove-fixture\ndescription: Validation fixture\nskills:\n  - path: skills/trove-local\n");
    const run = () => {
      const result = Bun.spawnSync([process.execPath, "scripts/validate.ts", "--plugins"], { cwd: fixture });
      return { code: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
    };
    // There is no canonical skills/ source or template: only a bundled skill.
    fs.writeFileSync(skill, '---\nname: trove-local\ndescription: "Use `<Foo>` here"\n---\n# Fixture\n');
    const rejected = run();
    expect(rejected.code).toBe(1);
    expect(rejected.output).toContain("plugins/trove-fixture/skills/trove-local/SKILL.md: description must not contain XML-like tags (found '<Foo>')");

    fs.writeFileSync(skill, '---\nname: trove-local\ndescription: "Use the Foo component"\n---\n# Fixture\n');
    const accepted = run();
    expect(accepted.code).toBe(0);
    expect(accepted.output).not.toContain("XML-like tags");
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
