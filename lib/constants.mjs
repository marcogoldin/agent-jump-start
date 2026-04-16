// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

export const TOOL_VERSION = "1.15.0";

export const SUPPORTED_AGENTS = [
  { name: "Claude Code",        files: "CLAUDE.md, .claude/skills/*/SKILL.md" },
  { name: "GitHub Copilot",     files: ".github/copilot-instructions.md, .github/skills/*/SKILL.md" },
  { name: "Gemini CLI",         files: "GEMINI.md" },
  { name: "Amazon Q Developer", files: ".amazonq/rules/*.md" },
  { name: "JetBrains Junie",    files: ".junie/AGENTS.md, .junie/guidelines.md" },
  { name: "GitHub Agents",      files: "AGENTS.md, .agents/skills/*/SKILL.md" },
  { name: "Cursor",             files: ".cursor/rules/*.mdc" },
  { name: "Windsurf (Codeium)", files: ".windsurf/rules/*.md, .windsurfrules (legacy)" },
  { name: "Cline",              files: ".clinerules/*.md, .clinerules (legacy)" },
  { name: "Roo Code",           files: ".roo/rules/*.md, .roorules (legacy)" },
  { name: "Continue.dev",       files: ".continue/rules/*.md" },
  { name: "Aider",              files: "CONVENTIONS.md" },
];

export const AGENT_COUNT = SUPPORTED_AGENTS.length;
