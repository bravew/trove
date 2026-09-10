import { expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";
import {
  COPILOT_CONTRACT,
  firstDiscoveredManifest,
  validateCopilotPluginManifest,
} from "../scripts/lib/copilot-contract";
import {
  COPILOT_SKILL_FIELDS,
  validateCopilotSkillFrontmatter,
} from "../scripts/lib/agent-skills-spec";
import { pathWithoutLocalBin } from "../scripts/lib/pinned-cli-path";
import {
  COPILOT_HOOK_EVENTS,
  COPILOT_HOOK_LIMITS,
  copilotHookOutcome,
  validateCopilotHookEvents,
  validateCopilotHookManifest,
} from "../scripts/lib/hooks";

const FIXTURES = path.join(import.meta.dir, "acceptance", "fixtures", "copilot");
const ROOT = path.resolve(import.meta.dir, "..");
const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));

test("copilot contract pins the locally verified singular CLI surface", () => {
  expect(COPILOT_CONTRACT.minimumTestedCliVersion).toBe("1.0.69");
  expect(COPILOT_CONTRACT.pluginCommands).toEqual(["install", "list", "uninstall", "update"]);
});

test("copilot discovers native manifests before Claude fallback manifests", () => {
  const fallback = fixture("fallback-install.json") as { available: string[]; expected: string };
  expect(firstDiscoveredManifest(fallback.available, COPILOT_CONTRACT.pluginManifestSearchOrder)).toBe(fallback.expected);
  expect(firstDiscoveredManifest([
    ".claude-plugin/plugin.json", ".github/plugin/plugin.json", ".plugin/plugin.json",
  ], COPILOT_CONTRACT.pluginManifestSearchOrder)).toBe(".plugin/plugin.json");
});

test("copilot native manifest accepts documented fields and rejects unsafe or unknown ones", () => {
  expect(validateCopilotPluginManifest(fixture("plugin.valid.json"), FIXTURES)).toEqual([]);
  const findings = validateCopilotPluginManifest(fixture("plugin.invalid.json"));
  expect(findings.map((finding) => finding.field)).toEqual(expect.arrayContaining(["name", "skills", "strict"]));
});

test("copilot skill metadata is its documented four-field subset", () => {
  expect([...COPILOT_SKILL_FIELDS]).toEqual(["name", "description", "license", "allowed-tools"]);
  const valid = YAML.parse(fs.readFileSync(path.join(FIXTURES, "skill.valid.md"), "utf8").split("---")[1]);
  const invalid = YAML.parse(fs.readFileSync(path.join(FIXTURES, "skill.invalid.md"), "utf8").split("---")[1]);
  expect(validateCopilotSkillFrontmatter(valid, "fixture-skill").errors).toEqual([]);
  expect(validateCopilotSkillFrontmatter(invalid, "fixture-skill").errors.map((error) => error.field)).toContain("compatibility");
});

test("copilot hook aliases, limits, and fail-open/fail-closed semantics are explicit", () => {
  for (const event of COPILOT_HOOK_EVENTS) expect(validateCopilotHookEvents({ [event]: [] })).toEqual([]);
  expect(validateCopilotHookEvents({ Setup: [] })[0]?.severity).toBe("error");
  expect(COPILOT_HOOK_LIMITS).toEqual({
    defaultTimeoutSeconds: 30,
    maximumOutputBytes: 10 * 1024 * 1024,
    maximumAdditionalContextBytes: 10 * 1024,
    maximumAgentStopContinuations: 8,
  });
  expect(copilotHookOutcome("preToolUse", { kind: "exit", code: 1 })).toBe("deny");
  expect(copilotHookOutcome("preToolUse", { kind: "timeout" })).toBe("fail-open");
  expect(copilotHookOutcome("permissionRequest", { kind: "exit", code: 2 })).toBe("deny");
  expect(copilotHookOutcome("postToolUse", { kind: "exit", code: 2 })).toBe("warn");
  expect(copilotHookOutcome("postToolUse", { kind: "exit", code: 1 })).toBe("fail-open");
  expect(validateCopilotHookManifest(fixture("hooks.valid.json"))).toEqual([]);
  const invalid = validateCopilotHookManifest(fixture("hooks.invalid.json"));
  expect(invalid.some((finding) => finding.message.includes("Setup"))).toBe(true);
  expect(invalid.some((finding) => finding.message.includes("secret-bearing"))).toBe(true);
});

test("copilot duplicate fixture records first-found skill and agent precedence", () => {
  const collision = fixture("collision.json") as { skill: string[]; agent: string[]; winners: { skill: string; agent: string } };
  expect(collision.skill[0]).toBe(collision.winners.skill);
  expect(collision.agent[0]).toBe(collision.winners.agent);
});

test("copilot marketplace fixture pins plugin versions to the repository version", () => {
  const marketplace = fixture("marketplace.valid.json") as { metadata: { version: string }; plugins: Array<{ version: string }> };
  expect(marketplace.plugins.every((plugin) => plugin.version === marketplace.metadata.version)).toBe(true);
});

test("validation and release block on pinned native install checks before build", () => {
  const validate = fs.readFileSync(path.join(ROOT, ".github", "workflows", "validate.yml"), "utf8");
  const release = fs.readFileSync(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  const upstream = fs.readFileSync(path.join(ROOT, ".github", "workflows", "upstream-sync.yml"), "utf8");

  for (const workflow of [validate, release, upstream]) {
    const versions = [...workflow.matchAll(/bun-version:\s*([^\s]+)/g)].map((match) => match[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set(["1.3.11"]));
  }
  // The native install smoke runs on the pristine checkout, before the build that
  // `verify:generated` performs, so it proves the committed artifacts install on
  // their own. `verify:generated` is the only build in these jobs, and it fails on
  // any committed artifact the build had to repair.
  for (const workflow of [validate, release]) {
    const smoke = workflow.indexOf("      - run: bun run test:acceptance:copilot\n");
    const verify = workflow.indexOf("      - run: bun run verify:generated\n");
    expect(smoke).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(smoke);
    expect(workflow.indexOf("@github/copilot@1.0.69")).toBeLessThan(smoke);
    expect(workflow.indexOf("      - run: bun run validate\n")).toBeGreaterThan(verify);
  }
  expect(validate).toContain("@github/copilot@latest");
  expect(validate).toContain("COPILOT_EXPECTED_VERSION: latest");
});

test("every path to the CLI resolves the pinned copy, not node_modules/.bin", () => {
  // @microsoft/vally-cli ships its own @github/copilot, and `bun run` puts
  // node_modules/.bin first, so resolving on the inherited PATH silently runs a
  // different CLI than the one the workflows pin.
  const smoke = fs.readFileSync(path.join(ROOT, "tests", "acceptance", "copilot-install-smoke.sh"), "utf8");
  expect(smoke).toContain('grep -vxF "$ROOT/node_modules/.bin"');
  expect(smoke).not.toContain('COPILOT_BIN="${COPILOT_BIN:-copilot}"');

  const localBin = path.join(ROOT, "node_modules", ".bin");
  const inherited = [localBin, "/usr/local/bin", "/usr/bin"].join(path.delimiter);
  expect(pathWithoutLocalBin(ROOT, inherited)).toBe(["/usr/local/bin", "/usr/bin"].join(path.delimiter));
  expect(pathWithoutLocalBin(ROOT, "/usr/bin")).toBe("/usr/bin");
  expect(fs.readFileSync(path.join(ROOT, "scripts", "external-plugin-gate.ts"), "utf8"))
    .toContain("PATH: pathWithoutLocalBin(ROOT)");
});
