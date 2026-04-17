// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

// Canonical agent identifiers — single source of truth shared by schema,
// rendering, detection, and CLI commands.
export const AGENT_IDS = [
  "claude-code", "github-copilot", "gemini-cli", "amazon-q",
  "junie", "github-agents", "cursor",
  "windsurf", "cline", "roo-code", "continue-dev", "aider",
];

export const AGENT_DISPLAY_CATALOG = [
  { id: "claude-code", name: "Claude Code", files: "CLAUDE.md, .claude/skills/*/SKILL.md" },
  { id: "github-copilot", name: "GitHub Copilot", files: ".github/copilot-instructions.md, .github/skills/*/SKILL.md" },
  { id: "gemini-cli", name: "Gemini CLI", files: "GEMINI.md" },
  { id: "amazon-q", name: "Amazon Q Developer", files: ".amazonq/rules/*.md" },
  { id: "junie", name: "JetBrains Junie", files: ".junie/AGENTS.md, .junie/guidelines.md" },
  { id: "github-agents", name: "GitHub Agents", files: "AGENTS.md, .agents/skills/*/SKILL.md" },
  { id: "cursor", name: "Cursor", files: ".cursor/rules/*.mdc" },
  { id: "windsurf", name: "Windsurf (Codeium)", files: ".windsurf/rules/*.md, .windsurfrules (legacy)" },
  { id: "cline", name: "Cline", files: ".clinerules/*.md, .clinerules (legacy)" },
  { id: "roo-code", name: "Roo Code", files: ".roo/rules/*.md, .roorules (legacy)" },
  { id: "continue-dev", name: "Continue.dev", files: ".continue/rules/*.md" },
  { id: "aider", name: "Aider", files: "CONVENTIONS.md" },
];

// Maps each canonical agent ID to its workspace render paths and skill path
// patterns.  Workspace paths are static strings; skill paths use "<slug>" as a
// placeholder resolved at render time.  The "cline" agent is special — its
// workspace path is dynamic (see resolveClineWorkspacePath).
export const AGENT_REGISTRY = new Map([
  ["claude-code", {
    displayName: "Claude Code",
    renderPaths: ["CLAUDE.md"],
    skillPaths: [".claude/skills/<slug>/"],
  }],
  ["github-copilot", {
    displayName: "GitHub Copilot",
    renderPaths: [".github/copilot-instructions.md", ".github/instructions/general.instructions.md"],
    skillPaths: [".github/skills/<slug>/"],
  }],
  ["gemini-cli", {
    displayName: "Gemini CLI",
    renderPaths: ["GEMINI.md"],
    skillPaths: [],
  }],
  ["amazon-q", {
    displayName: "Amazon Q Developer",
    renderPaths: [".amazonq/rules/general.md"],
    skillPaths: [],
  }],
  ["junie", {
    displayName: "JetBrains Junie",
    renderPaths: [".junie/AGENTS.md", ".junie/guidelines.md"],
    skillPaths: [],
  }],
  ["github-agents", {
    displayName: "GitHub Agents",
    renderPaths: ["AGENTS.md", "AGENT.md"],
    skillPaths: [],
  }],
  ["cursor", {
    displayName: "Cursor",
    renderPaths: [".cursor/rules/agent-instructions.mdc"],
    skillPaths: [".cursor/rules/<slug>.mdc"],
  }],
  ["windsurf", {
    displayName: "Windsurf (Codeium)",
    renderPaths: [".windsurf/rules/general.md", ".windsurfrules"],
    skillPaths: [],
  }],
  ["cline", {
    displayName: "Cline",
    renderPaths: [],  // dynamic — resolved via resolveClineWorkspacePath()
    skillPaths: [],
  }],
  ["roo-code", {
    displayName: "Roo Code",
    renderPaths: [".roo/rules/agent-instructions.md", ".roorules"],
    skillPaths: [],
  }],
  ["continue-dev", {
    displayName: "Continue.dev",
    renderPaths: [".continue/rules/agent-instructions.md"],
    skillPaths: [],
  }],
  ["aider", {
    displayName: "Aider",
    renderPaths: ["CONVENTIONS.md"],
    skillPaths: [],
  }],
]);

// Maps AGENT_DISCOVERY_RULES toolOfOrigin values to canonical AGENT_IDS.
export const DISCOVERY_ORIGIN_TO_ID = new Map([
  ["claude", "claude-code"],
  ["copilot", "github-copilot"],
  ["gemini", "gemini-cli"],
  ["amazon-q", "amazon-q"],
  ["junie", "junie"],
  ["agents-md", "github-agents"],
  ["cursor", "cursor"],
  ["windsurf", "windsurf"],
  ["cline", "cline"],
  ["roo", "roo-code"],
  ["continue", "continue-dev"],
  ["aider", "aider"],
]);

// Canonical workspace output targets rendered from the spec.
// Cline is dynamic and resolved by resolveClineWorkspacePath().
export const WORKSPACE_RENDER_TARGETS = [
  ".agents/AGENTS.md",
  "AGENTS.md",
  "AGENT.md",
  "CLAUDE.md",
  "GEMINI.md",
  ".github/copilot-instructions.md",
  ".github/instructions/general.instructions.md",
  ".cursor/rules/agent-instructions.mdc",
  ".windsurf/rules/general.md",
  ".windsurfrules",
  ".roo/rules/agent-instructions.md",
  ".roorules",
  ".continue/rules/agent-instructions.md",
  ".amazonq/rules/general.md",
  ".junie/AGENTS.md",
  ".junie/guidelines.md",
  "CONVENTIONS.md",
];

export const CLINE_WORKSPACE_TARGET = ".clinerules/general.md";
export const CLINE_LEGACY_WORKSPACE_TARGET = ".clinerules";

export function resolveClineWorkspacePath(targetAbsolutePath) {
  const legacyPath = resolve(targetAbsolutePath, CLINE_LEGACY_WORKSPACE_TARGET);
  if (!existsSync(legacyPath)) {
    return CLINE_WORKSPACE_TARGET;
  }
  try {
    return statSync(legacyPath).isFile() ? CLINE_LEGACY_WORKSPACE_TARGET : CLINE_WORKSPACE_TARGET;
  } catch {
    return CLINE_WORKSPACE_TARGET;
  }
}

// Discovery rules for pre-existing instruction files in hybrid repositories.
// These rules are intentionally broader than render targets to absorb existing
// conventions even when the current renderer writes only one canonical path.
export const AGENT_DISCOVERY_RULES = [
  { mode: "exact", path: "AGENTS.md", toolOfOrigin: "agents-md", scope: "repo-wide", tier: 1 },
  { mode: "exact", path: "AGENT.md", toolOfOrigin: "agents-md", scope: "legacy-flat", tier: 2 },
  { mode: "exact", path: "CLAUDE.md", toolOfOrigin: "claude", scope: "repo-wide", tier: 1 },
  { mode: "exact", path: "GEMINI.md", toolOfOrigin: "gemini", scope: "repo-wide", tier: 1 },
  { mode: "exact", path: ".github/copilot-instructions.md", toolOfOrigin: "copilot", scope: "repo-wide", tier: 1 },
  {
    mode: "tree",
    root: ".github/instructions",
    suffixes: [".instructions.md"],
    toolOfOrigin: "copilot",
    scope: "path-specific",
    tier: 1,
  },
  {
    mode: "tree",
    root: ".cursor/rules",
    extensions: [".mdc"],
    toolOfOrigin: "cursor",
    scope: "path-specific",
    tier: 1,
  },
  {
    mode: "tree",
    root: ".continue/rules",
    extensions: [".md", ".txt"],
    toolOfOrigin: "continue",
    scope: "path-specific",
    tier: 1,
  },
  {
    mode: "tree",
    root: ".windsurf/rules",
    extensions: [".md", ".txt"],
    toolOfOrigin: "windsurf",
    scope: "path-specific",
    tier: 1,
  },
  { mode: "exact", path: ".windsurfrules", toolOfOrigin: "windsurf", scope: "legacy-flat", tier: 2 },
  {
    mode: "tree",
    root: ".clinerules",
    extensions: [".md", ".txt"],
    toolOfOrigin: "cline",
    scope: "path-specific",
    tier: 1,
  },
  { mode: "exact", path: ".clinerules", toolOfOrigin: "cline", scope: "legacy-flat", tier: 2 },
  {
    mode: "tree",
    root: ".roo/rules",
    extensions: [".md", ".txt"],
    toolOfOrigin: "roo",
    scope: "path-specific",
    tier: 1,
  },
  { mode: "exact", path: ".roorules", toolOfOrigin: "roo", scope: "legacy-flat", tier: 2 },
  {
    mode: "tree",
    root: ".amazonq/rules",
    extensions: [".md"],
    toolOfOrigin: "amazon-q",
    scope: "path-specific",
    tier: 1,
  },
  { mode: "exact", path: ".junie/AGENTS.md", toolOfOrigin: "junie", scope: "repo-wide", tier: 1 },
  { mode: "exact", path: ".junie/guidelines.md", toolOfOrigin: "junie", scope: "repo-wide", tier: 1 },
  {
    mode: "tree",
    root: ".junie/guidelines",
    extensions: [".md"],
    toolOfOrigin: "junie",
    scope: "path-specific",
    tier: 1,
  },
  { mode: "exact", path: "CONVENTIONS.md", toolOfOrigin: "aider", scope: "legacy-flat", tier: 2 },
];
