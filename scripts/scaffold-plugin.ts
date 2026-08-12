#!/usr/bin/env bun
/**
 * Scaffold a new plugin with standard directory structure.
 *
 * Usage:
 *   bun run scaffold:plugin -- --name trove-testing --role dev
 *   bun run scaffold:plugin -- --name trove-ops --role devops --category operations
 */

import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dir, "..");
const PLUGINS_DIR = path.join(ROOT, "plugins");

// ─── Arg parsing ────────────────────────────────────────────

function parseArgs(): { name: string; role: string; category: string } {
  const args = process.argv.slice(2);
  let name = "";
  let role = "dev";
  let category = "development";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) name = args[++i];
    if (args[i] === "--role" && args[i + 1]) role = args[++i];
    if (args[i] === "--category" && args[i + 1]) category = args[++i];
  }

  if (!name) {
    console.error("Usage: bun run scaffold:plugin -- --name <plugin-name> [--role dev] [--category development]");
    process.exit(1);
  }

  if (!name.startsWith("trove-")) {
    console.error(`Plugin name must start with 'trove-'. Got: ${name}`);
    process.exit(1);
  }

  return { name, role, category };
}

// ─── Main ───────────────────────────────────────────────────

const { name, role, category } = parseArgs();
const pluginDir = path.join(PLUGINS_DIR, name);

if (fs.existsSync(pluginDir)) {
  console.error(`Plugin directory already exists: ${path.relative(ROOT, pluginDir)}`);
  process.exit(1);
}

// Create directory structure
const dirs = ["skills", "hooks", "rules"];
for (const dir of dirs) {
  fs.mkdirSync(path.join(pluginDir, dir), { recursive: true });
}

// Create plugin.yaml
const pluginYaml = {
  name,
  version: "1.0.0",
  description: `TODO: Add description for ${name}`,
  author: {
    name: "Your Name or Organization",
    email: "you@example.com",
  },
  homepage: "https://github.com/bravew/trove",
  license: "MIT",
  keywords: [category],
  category,
  roles: [role],
  skills: [],
  platforms: {
    claude: { strict: true },
    cursor: { rules_dir: "./rules/" },
    codex: { apps: [] },
  },
};

fs.writeFileSync(
  path.join(pluginDir, "plugin.yaml"),
  YAML.stringify(pluginYaml, { lineWidth: 100 }),
);

// Create README
const readme = `# ${name}

> TODO: Add description

## Skills

| Skill | Description | Auto-attach |
|-------|-------------|-------------|
| (none yet) | | |

## Installation

\`\`\`bash
# Claude Code
/plugin install ${name}@trove

# Cursor
cursor plugin install ${name}@trove
\`\`\`

## Adding a New Skill

\`\`\`bash
bun run scaffold:skill -- --plugin ${name} --name trove-my-skill
\`\`\`
`;

fs.writeFileSync(path.join(pluginDir, "README.md"), readme);

console.log(`\n✓ Plugin scaffolded: ${path.relative(ROOT, pluginDir)}/`);
console.log(`  ├── plugin.yaml`);
console.log(`  ├── README.md`);
console.log(`  ├── skills/`);
console.log(`  ├── hooks/`);
console.log(`  └── rules/`);
console.log(`\nNext steps:`);
console.log(`  1. Edit ${name}/plugin.yaml to update description and keywords`);
console.log(`  2. Add skills: bun run scaffold:skill -- --plugin ${name} --name trove-my-skill`);
console.log(`  3. Register in marketplace.yaml`);
