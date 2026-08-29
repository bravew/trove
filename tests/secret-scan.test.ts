import { describe, expect, test } from "bun:test";
import {
  findSecretMatches,
  secretScanSubject,
  shouldScanSkillScript,
  shouldStripMarkdownFences,
} from "../scripts/lib/secret-scan";
import { isUnownedSupportName } from "../scripts/lib/support-files";

describe("secret scan", () => {
  test("strips markdown fences and scans python/js raw", () => {
    expect(shouldStripMarkdownFences("skills/research/trove-pulse/SKILL.md.tmpl")).toBe(true);
    expect(shouldStripMarkdownFences("references/runtime-spec.md")).toBe(true);
    expect(shouldStripMarkdownFences("scripts/last30days.py")).toBe(false);
    expect(shouldStripMarkdownFences("scripts/lib/vendor/client.js")).toBe(false);
    expect(shouldScanSkillScript("scripts/last30days.py")).toBe(true);
    expect(shouldScanSkillScript("scripts/lib/vendor/client.mjs")).toBe(true);
    expect(shouldScanSkillScript("scripts/lib/vendor/package.json")).toBe(false);
  });

  test("treats python bytecode as unowned support files", () => {
    expect(isUnownedSupportName("__pycache__")).toBe(true);
    expect(isUnownedSupportName(".DS_Store")).toBe(true);
    expect(isUnownedSupportName("x.cpython-314.pyc")).toBe(true);
    expect(isUnownedSupportName("last30days.py")).toBe(false);
  });

  test("ignores fenced example keys in markdown and still flags them in python", () => {
    const fenced = "Example:\n```\nAKIAIOSFODNN7EXAMPLE\n```\n";
    expect(findSecretMatches("SKILL.md", fenced)).toEqual([]);
    expect(findSecretMatches("scripts/env.py", fenced)).toEqual(["AWS Access Key"]);
  });

  test("does not strip python contents that look like fences", () => {
    const py = 'key = "AKIAIOSFODNN7EXAMPLE"\n';
    expect(secretScanSubject("scripts/x.py", py)).toBe(py);
    expect(findSecretMatches("scripts/x.py", py)).toEqual(["AWS Access Key"]);
  });
});
