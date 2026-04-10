#!/usr/bin/env node
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// CLI entry point and command dispatcher.
//
// This file is intentionally thin: it owns only the usage text, argument
// parsing, and the dispatch table that routes commands to their handlers
// in lib/commands/*.mjs.  Each command module is self-contained with its
// own imports and JSDoc.
//
// Adding a new command:
//   1. Create or extend a handler in lib/commands/<domain>.mjs
//   2. Import the handler here
//   3. Add an entry to COMMAND_MAP
//   4. Update the usage() text
// ---------------------------------------------------------------------------

import { TOOL_VERSION } from "../lib/constants.mjs";
import { parseArgs } from "../lib/utils.mjs";

// --- Command handlers (grouped by domain) ---
import { handleInit, handleBootstrap } from "../lib/commands/setup.mjs";
import { handleSync, handleRender, handleCheck } from "../lib/commands/pipeline.mjs";
import { handleInfer, handleInferOverlay, handleDoctor } from "../lib/commands/infer.mjs";
import { handleValidateSkill, handleIntake, handleImportSkill, handleAddSkill, handleExportSkill, handleUpdateSkills } from "../lib/commands/skills.mjs";
import { handleValidate, handleExportSchema, handleListAgents, handleListProfiles, handleDemoClean, handleDemoTree } from "../lib/commands/info.mjs";

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function usage() {
  console.log(`Agent Jump Start v${TOOL_VERSION}

Commands:
  init           [--guided] [--profile <path>] [--target <path>]
  bootstrap      --base <path> [--profile <path>] [--output <path>]
  sync           --spec <path> [--target <path>]
  infer          --target <path> [--output <path>] [--section <name>] [--format json|text]
  infer-overlay  --target <path> [--output <path>] [--base <path>] [--section <name>]
  doctor         --spec <path> [--suggest --target <path>]
  render         --spec <path> [--target <path>] [--clean]
  check          --spec <path> [--target <path>]
  validate       --spec <path>
  validate-skill <path>   (SKILL.md file or skill directory)
  intake         --spec <path> [--target <path>] [--import] [--replace]
  import-skill   --spec <path> --skill <path> [--replace]
  add-skill      <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]
  export-skill   --spec <path> --slug <slug> --output <path>
  export-schema  [--output <path>]
  update-skills  --spec <path> [--skill <slug>] [--dry-run]
  list-agents
  list-profiles

Options:
  --help      Show this help message
  --version   Show version number

Examples:
  npx @marcogoldin/agent-jump-start@latest init \\
    --profile specs/profiles/react-vite-mui.profile.yaml

  node scripts/agent-jump-start.mjs bootstrap \\
    --base specs/base-spec.yaml \\
    --profile specs/profiles/react-vite-mui.profile.yaml \\
    --output canonical-spec.yaml

  node scripts/agent-jump-start.mjs sync \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs infer \\
    --target .

  node scripts/agent-jump-start.mjs infer \\
    --target . --output inferred-report.json --format json

  node scripts/agent-jump-start.mjs infer-overlay \\
    --target . --base canonical-spec.yaml --output overlay.yaml

  node scripts/agent-jump-start.mjs doctor \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs doctor \\
    --spec canonical-spec.yaml --suggest --target .

  node scripts/agent-jump-start.mjs render \\
    --spec canonical-spec.yaml --target . --clean

  node scripts/agent-jump-start.mjs check \\
    --spec canonical-spec.yaml --target .

  node scripts/agent-jump-start.mjs validate \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs validate-skill \\
    path/to/skills/python-pro

  node scripts/agent-jump-start.mjs intake \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs intake \\
    --spec canonical-spec.yaml --import

  node scripts/agent-jump-start.mjs import-skill \\
    --spec canonical-spec.yaml \\
    --skill path/to/skills/python-pro

  node scripts/agent-jump-start.mjs add-skill \\
    github:Jeffallan/claude-skills/tree/main/skills/python-pro \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs add-skill \\
    skills:vercel-labs/agent-skills \\
    --skill web-design-guidelines \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs export-skill \\
    --spec canonical-spec.yaml --slug react-best-practices \\
    --output ./exported-skills/react-best-practices

  node scripts/agent-jump-start.mjs export-schema

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml --dry-run

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml --skill python-pro

  node scripts/agent-jump-start.mjs list-agents
  node scripts/agent-jump-start.mjs list-profiles

Supported Agents:
  Claude Code          CLAUDE.md, .claude/skills/*/SKILL.md
  GitHub Copilot       .github/copilot-instructions.md, .github/skills/*/SKILL.md
  GitHub Agents        AGENTS.md, .agents/skills/*/SKILL.md
  Cursor               .cursor/rules/agent-instructions.mdc
  Windsurf (Codeium)   .windsurfrules
  Cline                .clinerules
  Roo Code             .roo/rules/agent-instructions.md
  Continue.dev         .continue/rules/agent-instructions.md
  Aider                CONVENTIONS.md
`);
}

// ---------------------------------------------------------------------------
// Command dispatch table.
//
// Maps command names to handler functions.  Handlers that need raw args
// (e.g. validate-skill, add-skill) receive (options, args); handlers that
// take no arguments receive nothing.  All other handlers receive (options).
// ---------------------------------------------------------------------------

const COMMAND_MAP = {
  "init":           (opts)        => handleInit(opts),
  "bootstrap":      (opts)        => handleBootstrap(opts),
  "sync":           (opts)        => handleSync(opts),
  "infer":          (opts)        => handleInfer(opts),
  "infer-overlay":  (opts)        => handleInferOverlay(opts),
  "doctor":         (opts)        => handleDoctor(opts),
  "render":         (opts)        => handleRender(opts),
  "check":          (opts)        => handleCheck(opts),
  "validate":       (opts)        => handleValidate(opts),
  "validate-skill": (opts, args)  => handleValidateSkill(opts, args),
  "intake":         (opts)        => handleIntake(opts),
  "import-skill":   (opts)        => handleImportSkill(opts),
  "add-skill":      (opts, args)  => handleAddSkill(opts, args),
  "export-skill":   (opts)        => handleExportSkill(opts),
  "update-skills":  (opts)        => handleUpdateSkills(opts),
  "export-schema":  (opts)        => handleExportSchema(opts),
  "list-agents":    ()            => handleListAgents(),
  "list-profiles":  ()            => handleListProfiles(),
  "demo-clean":     (opts)        => handleDemoClean(opts),
  "demo-tree":      (opts)        => handleDemoTree(opts),
};

// ---------------------------------------------------------------------------
// Main — argument parsing and dispatch
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    console.log(`Agent Jump Start v${TOOL_VERSION}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.length === 0) {
    usage();
    process.exit(0);
  }

  const { command, options } = parseArgs(args);

  const handler = COMMAND_MAP[command];
  if (!handler) {
    console.error(`Unknown command '${command}'. Run with --help for usage.`);
    process.exit(1);
  }

  await handler(options, args);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
