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
import {
  COPILOT_HOOK_EVENTS,
  COPILOT_HOOK_LIMITS,
  copilotHookOutcome,
  validateCopilotHookEvents,
  validateCopilotHookManifest,
} from "../scripts/lib/hooks";

const FIXTURES = path.join(import.meta.dir, "acceptance", "fixtures", "copilot");
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
