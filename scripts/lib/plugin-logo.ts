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

const BRAND_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export interface PluginLogoFields {
  name?: string;
  logo?: string;
  brandColor?: string;
}

export interface PluginLogoProjection {
  cursorLogo?: string;
  codexLogo?: string;
  brandColor?: string;
}

/**
 * Lexical checks shared by validation and projection, so a generator never
 * emits a logo that `bun run validate` would reject. Returns the finding, or
 * undefined when the path is a plugin-relative image.
 */
function logoPathProblem(logo: string): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(logo) && !path.win32.isAbsolute(logo)) {
    return "plugin.yaml: logo must be a plugin-relative path, not a URL";
  }
  const escapes = path.isAbsolute(logo)
    || path.win32.isAbsolute(logo)
    || logo.split(/[\\/]/).includes("..");
  if (escapes) return "plugin.yaml: logo must stay inside the plugin directory";
  const ext = path.extname(logo).toLowerCase();
  if (!LOGO_EXTENSIONS.has(ext)) return "plugin.yaml: logo must be .svg, .png, .webp, .jpg, or .jpeg";
  return undefined;
}

/** Real-path containment, so a symlinked `assets/` cannot point outside the plugin. */
function logoEscapesPluginOnDisk(pluginDir: string, resolved: string): boolean {
  const relative = path.relative(fs.realpathSync(pluginDir), fs.realpathSync(resolved));
  return relative.split(path.sep)[0] === ".." || path.isAbsolute(relative);
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

/**
 * Throws on a logo or brandColor the hosts cannot use. The generators read
 * plugin.yaml without running validation first, so an invalid value must stop
 * the build instead of reaching a manifest.
 */
export function projectPluginLogo(plugin: Readonly<PluginLogoFields>): PluginLogoProjection {
  const label = plugin.name ? `plugins/${plugin.name}/` : "";
  const cursorLogo = typeof plugin.logo === "string" ? plugin.logo.trim().replace(/^\.\//, "") : "";
  const brandColor = typeof plugin.brandColor === "string" ? plugin.brandColor.trim() : "";
  const projected: PluginLogoProjection = {};
  if (cursorLogo !== "") {
    const problem = logoPathProblem(cursorLogo);
    if (problem) throw new Error(`${label}${problem} (got "${plugin.logo}")`);
    projected.cursorLogo = cursorLogo;
    projected.codexLogo = `./${cursorLogo}`;
  }
  if (brandColor !== "") {
    if (!BRAND_COLOR_PATTERN.test(brandColor)) {
      throw new Error(`${label}plugin.yaml: brandColor must be a #RRGGBB color (got "${plugin.brandColor}")`);
    }
    projected.brandColor = brandColor;
  }
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
      const problem = logoPathProblem(raw.replace(/^\.\//, ""));
      const resolved = path.resolve(pluginDir, raw);
      if (problem) {
        findings.push(problem);
      } else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        findings.push(`plugin.yaml: logo file not found: ${raw}`);
      } else if (logoEscapesPluginOnDisk(pluginDir, resolved)) {
        findings.push("plugin.yaml: logo must stay inside the plugin directory");
      }
    }
  }

  if (plugin.brandColor !== undefined) {
    if (typeof plugin.brandColor !== "string" || !BRAND_COLOR_PATTERN.test(plugin.brandColor)) {
      findings.push("plugin.yaml: brandColor must be a #RRGGBB color");
    } else if (contrastAgainstWhite(plugin.brandColor) < MIN_BRAND_CONTRAST) {
      findings.push("plugin.yaml: brandColor must have at least 2:1 contrast against white");
    }
  }

  return findings;
}
