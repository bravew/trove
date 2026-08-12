/**
 * P5 — Hook schema, MCP metadata, and eval rubric coverage tests.
 *
 * Hook + MCP linters are pure functions tested directly; eval coverage
 * is asserted by walking the on-disk skill tree.
 */

import { test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import YAML from "yaml";
import { validateHooks, HOOK_EVENTS } from "../scripts/lib/hooks";
import { validateMcpMetadata, projectMcpServers } from "../scripts/lib/mcp";

const ROOT = path.resolve(import.meta.dir, "..");

// ─── Hooks ────────────────────────────────────────────────

test("hooks: valid PostToolUse with matcher and command produces no findings", () => {
  const fakePlugin = fs.mkdtempSync(path.join(require("os").tmpdir(), "p5-hook-ok-"));
  try {
    fs.mkdirSync(path.join(fakePlugin, "hooks"), { recursive: true });
    const cmdPath = path.join(fakePlugin, "hooks", "ok.sh");
    fs.writeFileSync(cmdPath, "#!/bin/bash\nexit 0\n");
    fs.chmodSync(cmdPath, 0o755);

    const findings = validateHooks(
      {
        PostToolUse: [
          { matcher: "Write|Edit", command: "${PLUGIN_ROOT}/hooks/ok.sh", description: "ok" },
        ],
      },
      fakePlugin,
    );
    expect(findings).toEqual([]);
  } finally {
    fs.rmSync(fakePlugin, { recursive: true, force: true });
  }
});

test("hooks: unknown event name is an error", () => {
  const findings = validateHooks(
    { Speculative: [{ command: "/bin/true" }] },
    "/tmp",
  );
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.length).toBe(1);
  expect(errors[0].message).toContain("unknown hook event 'Speculative'");
});

test("hooks: every documented event name is accepted", () => {
  for (const event of HOOK_EVENTS) {
    const findings = validateHooks(
      { [event]: [{ command: "/bin/true" }] },
      "/tmp",
    );
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
  }
});

test("hooks: PreToolUse without matcher warns (fires on every tool call)", () => {
  const findings = validateHooks(
    { PreToolUse: [{ command: "/bin/true" }] },
    "/tmp",
  );
  const warnings = findings.filter((f) => f.severity === "warning");
  expect(warnings.some((w) => w.message.includes("matcher is recommended"))).toBe(true);
});

test("hooks: missing command file is an error", () => {
  const fakePlugin = fs.mkdtempSync(path.join(require("os").tmpdir(), "p5-hook-missing-"));
  try {
    const findings = validateHooks(
      { PostToolUse: [{ matcher: "Write", command: "${PLUGIN_ROOT}/hooks/missing.sh" }] },
      fakePlugin,
    );
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("script does not exist");
  } finally {
    fs.rmSync(fakePlugin, { recursive: true, force: true });
  }
});

test("hooks: non-executable command file warns", () => {
  const fakePlugin = fs.mkdtempSync(path.join(require("os").tmpdir(), "p5-hook-noexec-"));
  try {
    fs.mkdirSync(path.join(fakePlugin, "hooks"), { recursive: true });
    fs.writeFileSync(path.join(fakePlugin, "hooks", "x.sh"), "#!/bin/bash\n");
    fs.chmodSync(path.join(fakePlugin, "hooks", "x.sh"), 0o644); // not executable
    const findings = validateHooks(
      { PostToolUse: [{ matcher: "Write", command: "${PLUGIN_ROOT}/hooks/x.sh" }] },
      fakePlugin,
    );
    expect(findings.some((f) => f.severity === "warning" && f.message.includes("not executable"))).toBe(true);
  } finally {
    fs.rmSync(fakePlugin, { recursive: true, force: true });
  }
});

test("hooks: invalid regex in matcher is an error", () => {
  const findings = validateHooks(
    { PreToolUse: [{ matcher: "[unclosed", command: "/bin/true" }] },
    "/tmp",
  );
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.some((e) => e.message.includes("not a valid regex"))).toBe(true);
});

test("hooks: hooks must be an object, not an array", () => {
  const findings = validateHooks([{ command: "/bin/true" }] as unknown, "/tmp");
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors[0].message).toContain("must be an object");
});

test("hooks: bare `${PLUGIN_ROOT}` with no path is an error", () => {
  // Regression: the old regex only matched `${PLUGIN_ROOT}` followed by
  // \S+, so a bare reference silently passed validation and failed at
  // runtime instead.
  const findings = validateHooks(
    { PostToolUse: [{ matcher: "Write", command: "${PLUGIN_ROOT}" }] },
    "/tmp",
  );
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.some((e) => e.message.includes("provides no script path"))).toBe(true);
});

test("hooks: multi-arg ${PLUGIN_ROOT} commands validate every reference", () => {
  // Regression: previously only the first ${PLUGIN_ROOT}/... was checked.
  const fakePlugin = fs.mkdtempSync(path.join(require("os").tmpdir(), "p5-hook-multi-"));
  try {
    fs.mkdirSync(path.join(fakePlugin, "hooks"), { recursive: true });
    const cmdPath = path.join(fakePlugin, "hooks", "run.sh");
    fs.writeFileSync(cmdPath, "#!/bin/bash\nexit 0\n");
    fs.chmodSync(cmdPath, 0o755);
    // run.sh exists, but config.json doesn't — should error on the second ref.
    const findings = validateHooks(
      {
        PostToolUse: [
          {
            matcher: "Write",
            command: "${PLUGIN_ROOT}/hooks/run.sh ${PLUGIN_ROOT}/hooks/config.json",
          },
        ],
      },
      fakePlugin,
    );
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors.some((e) => e.message.includes("config.json"))).toBe(true);
  } finally {
    fs.rmSync(fakePlugin, { recursive: true, force: true });
  }
});

test("hooks: trove-workflow SessionStart script emits host-specific envelopes", () => {
  const pluginRoot = path.join(ROOT, "plugins", "trove-workflow");
  const script = path.join(pluginRoot, "hooks", "session-start.sh");
  const mode = fs.statSync(script).mode;
  expect(mode & 0o111).not.toBe(0);

  const run = (extraEnv: Record<string, string>) => spawnSync(script, {
    cwd: pluginRoot,
    env: { ...process.env, ...extraEnv },
    encoding: "utf-8",
  });

  const claude = run({ CLAUDE_PLUGIN_ROOT: pluginRoot });
  expect(claude.status).toBe(0);
  const claudeJson = JSON.parse(claude.stdout);
  expect(claudeJson.hookSpecificOutput.hookEventName).toBe("SessionStart");
  expect(claudeJson.hookSpecificOutput.additionalContext).toContain("Skill: using-trove");
  expect(claudeJson.hookSpecificOutput.additionalContext).toContain("name: using-trove");

  const cursor = run({ CURSOR_PLUGIN_ROOT: pluginRoot });
  expect(cursor.status).toBe(0);
  const cursorJson = JSON.parse(cursor.stdout);
  expect(cursorJson.additional_context).toContain("Skill: using-trove");

  const generic = run({});
  expect(generic.status).toBe(0);
  const genericJson = JSON.parse(generic.stdout);
  expect(genericJson.additionalContext).toContain("Skill: using-trove");
});

test("hooks: trove-workflow SessionStart honors TROVE_BOOTSTRAP=0", () => {
  const pluginRoot = path.join(ROOT, "plugins", "trove-workflow");
  const script = path.join(pluginRoot, "hooks", "session-start.sh");
  const result = spawnSync(script, {
    cwd: pluginRoot,
    env: { ...process.env, TROVE_BOOTSTRAP: "0", CLAUDE_PLUGIN_ROOT: pluginRoot },
    encoding: "utf-8",
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
});

test("hooks: trove-dev wires its command surface and has no SessionStart surface", () => {
  const pluginPath = path.join(ROOT, "plugins", "trove-dev", "plugin.yaml");
  const plugin = YAML.parse(fs.readFileSync(pluginPath, "utf-8"));

  // Local-dev slash commands are wired in plugin.yaml and generated into the plugin.
  const declared = (plugin.commands ?? []).map((cmd: { path: string }) => path.basename(cmd.path));
  expect(declared.sort()).toEqual(
    [
      "changelog.md",
      "commit.md",
      "doc.md",
      "new-branch.md",
      "pr.md",
      "prp-create.md",
      "prp-execute.md",
      "review.md",
      "ship.md",
    ],
  );
  const commandDir = path.join(ROOT, "plugins", "trove-dev", "commands");
  const commandFiles = fs.existsSync(commandDir)
    ? fs.readdirSync(commandDir).filter((file) => file.endsWith(".md"))
    : [];
  expect(commandFiles.sort()).toEqual(declared.sort());

  // The SessionStart hook removal stands — only the anchor should surface at session start.
  expect(plugin.hooks.SessionStart).toBeUndefined();
  expect(fs.existsSync(path.join(ROOT, "plugins", "trove-dev", "hooks", "session-start.sh"))).toBe(false);
});

test("hooks: auto-lint reads edited file path from stdin JSON and is opt-in", () => {
  const script = path.join(ROOT, "plugins", "trove-dev", "hooks", "auto-lint.sh");
  const payload = JSON.stringify({
    tool_name: "Edit",
    tool_input: { file_path: "src/example.ts" },
  });

  const disabled = spawnSync(script, {
    cwd: ROOT,
    input: payload,
    encoding: "utf-8",
  });
  expect(disabled.status).toBe(0);
  expect(disabled.stdout).toBe("");

  const tempProject = fs.mkdtempSync(path.join(require("os").tmpdir(), "p5-auto-lint-"));
  try {
    fs.mkdirSync(path.join(tempProject, "node_modules", ".bin"), { recursive: true });
    fs.mkdirSync(path.join(tempProject, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempProject, "src", "example.ts"), "const x = 1;\n");
    const eslint = path.join(tempProject, "node_modules", ".bin", "eslint");
    fs.writeFileSync(
      eslint,
      "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > eslint-args.txt\n",
    );
    fs.chmodSync(eslint, 0o755);

    const enabled = spawnSync(script, {
      cwd: tempProject,
      env: { ...process.env, TROVE_AUTO_LINT: "1" },
      input: payload,
      encoding: "utf-8",
    });
    expect(enabled.status).toBe(0);
    expect(fs.readFileSync(path.join(tempProject, "eslint-args.txt"), "utf-8")).toBe("--fix\nsrc/example.ts\n");
  } finally {
    fs.rmSync(tempProject, { recursive: true, force: true });
  }
});

test("hooks: security check denies destructive Bash commands from stdin JSON", () => {
  const script = path.join(ROOT, "plugins", "trove-security", "hooks", "security-check.sh");
  const safe = spawnSync(script, {
    cwd: ROOT,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status --short" } }),
    encoding: "utf-8",
  });
  expect(safe.status).toBe(0);
  expect(safe.stdout).toBe("");

  const blocked = spawnSync(script, {
    cwd: ROOT,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard" } }),
    encoding: "utf-8",
  });
  expect(blocked.status).toBe(0);
  const decision = JSON.parse(blocked.stdout);
  expect(decision.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("git reset --hard");
});

// ─── MCP ──────────────────────────────────────────────────

test("mcp: well-formed server with tools produces no findings", () => {
  const findings = validateMcpMetadata({
    linear: {
      type: "http",
      url: "https://mcp.linear.app/mcp",
      optional: true,
      tools: ["list_issues", "get_issue", "create_issue"],
    },
  });
  expect(findings).toEqual([]);
});

test("mcp: server missing both url and command is an error", () => {
  const findings = validateMcpMetadata({ borked: { type: "http" } });
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors[0].message).toContain("must declare either 'url' (HTTP) or 'command' (stdio)");
});

test("mcp: tools must be an array of strings", () => {
  const findings = validateMcpMetadata({
    s: { url: "https://x", tools: "not_an_array" },
  });
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors[0].message).toContain("must be an array");
});

test("mcp: tool name with spaces is an error (not a valid identifier)", () => {
  const findings = validateMcpMetadata({
    s: { url: "https://x", tools: ["valid_name", "has spaces"] },
  });
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.some((e) => e.message.includes("not a valid identifier"))).toBe(true);
});

test("mcp: tool name with dots is rejected (Claude projection breaks on dots)", () => {
  // mcp__server__get.issue would emit a malformed tool identifier.
  const findings = validateMcpMetadata({
    s: { url: "https://x", tools: ["get.issue"] },
  });
  const errors = findings.filter((f) => f.severity === "error");
  expect(errors.some((e) => e.message.includes("not a valid identifier"))).toBe(true);
});

test("mcp: kebab-case tool names (notion-fetch style) are accepted", () => {
  const findings = validateMcpMetadata({
    notion: { url: "https://x", tools: ["notion-fetch", "notion-search"] },
  });
  expect(findings).toEqual([]);
});

test("mcp: duplicate tool names within one server warn", () => {
  const findings = validateMcpMetadata({
    s: { url: "https://x", tools: ["one", "two", "one"] },
  });
  const warnings = findings.filter((f) => f.severity === "warning");
  expect(warnings.some((w) => w.message.includes("duplicate 'one'"))).toBe(true);
});

test("mcp: project produces per-host invocation forms", () => {
  const proj = projectMcpServers({
    linear: {
      url: "https://mcp.linear.app/mcp",
      tools: ["list_issues", "get_issue"],
      description: "Linear",
    },
  });
  expect(proj.length).toBe(1);
  expect(proj[0].server).toBe("linear");
  expect(proj[0].tools).toEqual(["list_issues", "get_issue"]);
  expect(proj[0].examples.claude).toEqual(["mcp__linear__list_issues", "mcp__linear__get_issue"]);
  expect(proj[0].examples.cursor).toEqual(["linear.list_issues", "linear.get_issue"]);
  expect(proj[0].examples.codex).toEqual(["linear.list_issues", "linear.get_issue"]);
  expect(proj[0].examples.agents?.[0]).toContain("linear");
  expect(proj[0].examples.agents?.[0]).toContain("list_issues, get_issue");
});

test("mcp: server with no tools still gets generic AGENTS guidance", () => {
  const proj = projectMcpServers({ s: { url: "https://x" } });
  expect(proj[0].tools).toEqual([]);
  expect(proj[0].examples.claude).toBeUndefined();
  expect(proj[0].examples.agents?.[0]).toContain("tool list not declared");
});

// ─── Eval coverage ────────────────────────────────────────

test("evals: every maintained skill has a rubric.yaml", () => {
  const skillsDir = path.join(ROOT, "skills");
  const evalsDir = path.join(ROOT, "evals", "skill-evals");
  const skillNames: string[] = [];
  for (const cat of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    for (const skill of fs.readdirSync(path.join(skillsDir, cat.name), { withFileTypes: true })) {
      if (skill.isDirectory()) skillNames.push(skill.name);
    }
  }
  const missing = skillNames.filter((n) => !fs.existsSync(path.join(evalsDir, n, "rubric.yaml")));
  expect(missing).toEqual([]);
});

test("evals: every rubric has a min_pass_score and at least 3 criteria", () => {
  const evalsDir = path.join(ROOT, "evals", "skill-evals");
  for (const skill of fs.readdirSync(evalsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const rubricPath = path.join(evalsDir, skill.name, "rubric.yaml");
    if (!fs.existsSync(rubricPath)) continue;
    const rubric = YAML.parse(fs.readFileSync(rubricPath, "utf-8")) as {
      criteria: Record<string, unknown>;
      min_pass_score: number;
    };
    expect(typeof rubric.min_pass_score).toBe("number");
    expect(Object.keys(rubric.criteria).length).toBeGreaterThanOrEqual(3);
  }
});

test("evals: every skill has at least 3 tasks", () => {
  const evalsDir = path.join(ROOT, "evals", "skill-evals");
  const offenders: Array<{ skill: string; count: number }> = [];
  for (const skill of fs.readdirSync(evalsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const tasksDir = path.join(evalsDir, skill.name, "tasks");
    if (!fs.existsSync(tasksDir)) {
      offenders.push({ skill: skill.name, count: 0 });
      continue;
    }
    const count = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md")).length;
    if (count < 3) offenders.push({ skill: skill.name, count });
  }
  expect(offenders).toEqual([]);
});

test("evals: rubric criteria have weight (positive int) and description (non-empty string)", () => {
  const evalsDir = path.join(ROOT, "evals", "skill-evals");
  for (const skill of fs.readdirSync(evalsDir, { withFileTypes: true })) {
    if (!skill.isDirectory()) continue;
    const rubricPath = path.join(evalsDir, skill.name, "rubric.yaml");
    if (!fs.existsSync(rubricPath)) continue;
    const rubric = YAML.parse(fs.readFileSync(rubricPath, "utf-8")) as {
      criteria: Record<string, { weight?: unknown; description?: unknown }>;
    };
    for (const [name, c] of Object.entries(rubric.criteria)) {
      expect(typeof c.weight).toBe("number");
      expect((c.weight as number) > 0).toBe(true);
      expect(typeof c.description).toBe("string");
      expect((c.description as string).length).toBeGreaterThan(10);
    }
  }
});
