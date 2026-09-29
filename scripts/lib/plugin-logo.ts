/**
 * Project plugin.yaml `logo` and `brandColor` onto the hosts that render them.
 *
 * Cursor's Customize card and marketplace entry use `logo` (no `./`).
 * Codex's plugin browser uses `interface.logo` and `interface.composerIcon`
 * (`./`-prefixed) plus optional `interface.brandColor`. Claude, Copilot,
 * OpenCode, and Gemini have no documented plugin-logo field, so they receive
 * nothing from this projection.
 */
import * as fs from "fs";
import * as path from "path";

const LOGO_EXTENSIONS = new Set([".svg", ".png", ".webp", ".jpg", ".jpeg"]);
const MIN_BRAND_CONTRAST = 2;
const HEX_RADIX = 16;
const BYTE_MAX = 255;
const RED_COEFFICIENT = 0.2126;
const GREEN_COEFFICIENT = 0.7152;
const BLUE_COEFFICIENT = 0.0722;
const CONTRAST_OFFSET = 0.05;
const WHITE_PLUS_OFFSET = 1.05;
const SRGB_LINEAR_CUTOFF = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;

export interface PluginLogoFields {
  logo?: string;
  brandColor?: string;
}

export interface PluginLogoProjection {
  cursorLogo?: string;
  codexLogo?: string;
  brandColor?: string;
}

function normalizeCursorLogo(logo: string | undefined): string | undefined {
  if (typeof logo !== "string") return undefined;
  const trimmed = logo.trim().replace(/^\.\//, "");
  if (trimmed === "") return undefined;
  return trimmed;
}

function logoEscapesPlugin(pluginDir: string, logo: string): boolean {
  if (logo.includes("..") || path.isAbsolute(logo) || path.win32.isAbsolute(logo)) return true;
  const resolved = path.resolve(pluginDir, logo);
  const relative = path.relative(pluginDir, resolved);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function srgb(channel: number): number {
  const value = channel / BYTE_MAX;
  if (value <= SRGB_LINEAR_CUTOFF) return value / SRGB_LINEAR_SLOPE;
  return ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

function contrastAgainstWhite(hex: string): number {
  const match = /^#(?<red>[0-9a-f]{2})(?<green>[0-9a-f]{2})(?<blue>[0-9a-f]{2})$/i.exec(hex);
  const red = Number.parseInt(match?.groups?.red ?? "00", HEX_RADIX);
  const green = Number.parseInt(match?.groups?.green ?? "00", HEX_RADIX);
  const blue = Number.parseInt(match?.groups?.blue ?? "00", HEX_RADIX);
  const luminance = RED_COEFFICIENT * srgb(red) + GREEN_COEFFICIENT * srgb(green) + BLUE_COEFFICIENT * srgb(blue);
  return WHITE_PLUS_OFFSET / (luminance + CONTRAST_OFFSET);
}

export function projectPluginLogo(plugin: Readonly<PluginLogoFields>): PluginLogoProjection {
  const cursorLogo = normalizeCursorLogo(plugin.logo);
  const brandColor = typeof plugin.brandColor === "string" ? plugin.brandColor.trim() : "";
  const projected: PluginLogoProjection = {};
  if (cursorLogo !== undefined) {
    projected.cursorLogo = cursorLogo;
    projected.codexLogo = `./${cursorLogo}`;
  }
  if (brandColor !== "") projected.brandColor = brandColor;
  return projected;
}

export function pluginLogoFindings(
  pluginDir: string,
  plugin: Readonly<{ logo?: unknown; brandColor?: unknown }>,
): string[] {
  const findings: string[] = [];

  if (plugin.logo !== undefined) {
    if (typeof plugin.logo !== "string" || plugin.logo.trim() === "") {
      findings.push("plugin.yaml: logo must be a non-empty relative path");
    } else {
      const raw = plugin.logo.trim();
      const ext = path.extname(raw.replace(/^\.\//, "")).toLowerCase();
      if (logoEscapesPlugin(pluginDir, raw)) {
        findings.push("plugin.yaml: logo must stay inside the plugin directory");
      } else if (!LOGO_EXTENSIONS.has(ext)) {
        findings.push("plugin.yaml: logo must be .svg, .png, .webp, .jpg, or .jpeg");
      } else {
        const resolved = path.resolve(pluginDir, raw);
        const missing = !fs.existsSync(resolved) || !fs.statSync(resolved).isFile();
        if (missing) findings.push(`plugin.yaml: logo file not found: ${raw}`);
      }
    }
  }

  if (plugin.brandColor !== undefined) {
    if (typeof plugin.brandColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(plugin.brandColor)) {
      findings.push("plugin.yaml: brandColor must be a #RRGGBB color");
    } else if (contrastAgainstWhite(plugin.brandColor) < MIN_BRAND_CONTRAST) {
      findings.push("plugin.yaml: brandColor must have at least 2:1 contrast against white");
    }
  }

  return findings;
}
