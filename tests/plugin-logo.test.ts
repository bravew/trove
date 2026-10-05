/**
 * Plugin logo projection.
 *
 * `logo` and `brandColor` are authored once on plugin.yaml. Cursor and Codex
 * receive them; hosts with no documented logo field do not.
 */
import { test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { pluginLogoFindings, projectPluginLogo } from "../scripts/lib/plugin-logo";

const ROOT = path.resolve(import.meta.dir, "..");

const FIRST_PARTY = [
  "trove-workflow",
  "trove-dev",
  "trove-design",
  "trove-product",
  "trove-security",
  "trove-infra",
  "trove-doc",
  "trove-research",
] as const;

test("projectPluginLogo maps one authored file onto Cursor and Codex", () => {
  const projected = projectPluginLogo({
    logo: "./assets/logo.svg",
    brandColor: "#2563EB",
  });

  expect(projected.cursorLogo).toBe("assets/logo.svg");
  expect(projected.codexLogo).toBe("./assets/logo.svg");
  expect(projected.brandColor).toBe("#2563EB");
});

test("projectPluginLogo emits nothing when logo and brandColor are absent", () => {
  expect(projectPluginLogo({})).toEqual({});
  expect(projectPluginLogo({ logo: "   " })).toEqual({});
});

test("projectPluginLogo refuses values validation would reject instead of emitting them", () => {
  expect(() => projectPluginLogo({ name: "trove-x", logo: "/abs/logo.svg" })).toThrow(
    'plugins/trove-x/plugin.yaml: logo must stay inside the plugin directory (got "/abs/logo.svg")',
  );
  expect(() => projectPluginLogo({ logo: "C:\\logo.svg" })).toThrow("must stay inside the plugin directory");
  expect(() => projectPluginLogo({ logo: "assets/../../logo.svg" })).toThrow("must stay inside the plugin directory");
  expect(() => projectPluginLogo({ logo: "https://example.com/logo.svg" })).toThrow("not a URL");
  expect(() => projectPluginLogo({ logo: "assets/logo.txt" })).toThrow("must be .svg");
  expect(() => projectPluginLogo({ brandColor: "blue" })).toThrow("brandColor must be a #RRGGBB color");
  expect(projectPluginLogo({ logo: "assets/logo..svg" }).cursorLogo).toBe("assets/logo..svg");
});

test("pluginLogoFindings rejects a logo reached through a symlink outside the plugin", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "trove-logo-link-"));
  const pluginDir = path.join(root, "plugin");
  const outside = path.join(root, "outside");
  fs.mkdirSync(pluginDir);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "logo.svg"), "<svg/>");
  fs.symlinkSync(outside, path.join(pluginDir, "assets"), "dir");

  expect(pluginLogoFindings(pluginDir, { logo: "assets/logo.svg" })).toEqual([
    "plugin.yaml: logo must stay inside the plugin directory",
  ]);
});

test("pluginLogoFindings rejects paths and colors Codex and Cursor will not render", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trove-logo-"));
  fs.writeFileSync(path.join(dir, "logo.svg"), "<svg/>");

  expect(pluginLogoFindings(dir, { logo: "../logo.svg" })).toEqual([
    "plugin.yaml: logo must stay inside the plugin directory",
  ]);
  expect(pluginLogoFindings(dir, { logo: "assets/logo.txt" })).toEqual([
    "plugin.yaml: logo must be .svg, .png, .webp, .jpg, or .jpeg",
  ]);
  expect(pluginLogoFindings(dir, { logo: "https://example.com/logo.svg" })).toEqual([
    "plugin.yaml: logo must be a plugin-relative path, not a URL",
  ]);
  expect(pluginLogoFindings(dir, { logo: "assets/missing.svg" })).toEqual([
    "plugin.yaml: logo file not found: assets/missing.svg",
  ]);
  expect(pluginLogoFindings(dir, { brandColor: "blue" })).toEqual([
    "plugin.yaml: brandColor must be a #RRGGBB color",
  ]);
  expect(pluginLogoFindings(dir, { brandColor: "#FFFFFF" })).toEqual([
    "plugin.yaml: brandColor must have at least 2:1 contrast against white",
  ]);
  expect(pluginLogoFindings(dir, { logo: "logo.svg", brandColor: "#2563EB" })).toEqual([]);
});

test("every first-party plugin authors a square logo the generators can project", () => {
  for (const name of FIRST_PARTY) {
    const pluginDir = path.join(ROOT, "plugins", name);
    const svg = fs.readFileSync(path.join(pluginDir, "assets", "logo.svg"), "utf-8");
    expect(svg).toMatch(/\bwidth="512"/);
    expect(svg).toMatch(/\bheight="512"/);
    expect(svg).toMatch(/\bviewBox="0 0 512 512"/);
    expect(svg).not.toMatch(/<script/i);
    const withoutNamespace = svg.replaceAll('xmlns="http://www.w3.org/2000/svg"', "");
    expect(withoutNamespace).not.toMatch(/https?:/i);

    const yaml = fs.readFileSync(path.join(pluginDir, "plugin.yaml"), "utf-8");
    expect(yaml).toMatch(/^logo: assets\/logo\.svg$/m);
    expect(yaml).toMatch(/^brandColor: "#[0-9A-Fa-f]{6}"$/m);
    expect(pluginLogoFindings(pluginDir, {
      logo: "assets/logo.svg",
      brandColor: yaml.match(/^brandColor: "(#[0-9A-Fa-f]{6})"$/m)?.[1],
    })).toEqual([]);
  }
});
