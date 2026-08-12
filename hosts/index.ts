/**
 * Host config registry.
 *
 * Adding a new host: create hosts/<name>.ts, import here, add to ALL_HOSTS.
 */

import type { HostConfig, HostName } from "./types";
import claude from "./claude";
import cursor from "./cursor";
import codex from "./codex";
import agents from "./agents";
import opencode from "./opencode";
import gemini from "./gemini";

export const ALL_HOSTS: HostConfig[] = [claude, cursor, codex, agents, opencode, gemini];

export const HOST_MAP: Record<string, HostConfig> = Object.fromEntries(
  ALL_HOSTS.map((h) => [h.name, h]),
);

export const ALL_HOST_NAMES: HostName[] = ALL_HOSTS.map(
  (h) => h.name as HostName,
);

export function getHost(name: string): HostConfig {
  const config = HOST_MAP[name];
  if (!config) {
    throw new Error(
      `Unknown host '${name}'. Valid: ${ALL_HOST_NAMES.join(", ")}`,
    );
  }
  return config;
}

export function getMarketplaceHosts(): HostConfig[] {
  return ALL_HOSTS.filter((h) => h.features.marketplace);
}

export { claude, cursor, codex, agents, opencode, gemini };
export type { HostConfig, HostName } from "./types";
