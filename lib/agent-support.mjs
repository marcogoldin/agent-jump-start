// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

import {
  AGENT_IDS,
  AGENT_REGISTRY,
  AGENT_DISCOVERY_RULES,
  DISCOVERY_ORIGIN_TO_ID,
  resolveClineWorkspacePath,
} from "./agent-targets.mjs";

// ---------------------------------------------------------------------------
// Resolution — pipeline commands (reads spec only, no CLI override)
// ---------------------------------------------------------------------------

/**
 * Resolve the set of enabled agents from the canonical spec.
 *
 * @param {object} spec  Parsed canonical spec (may or may not contain agentSupport).
 * @returns {Set<string>|null}  Set of canonical agent IDs, or null for "all agents".
 */
export function resolveEnabledAgents(spec) {
  const support = spec.agentSupport;
  if (!support) return null;

  // Normalize: selected present without mode → treat as "selected".
  const mode = support.mode ?? (support.selected ? "selected" : "all");
  if (mode === "all") return null;

  if (!Array.isArray(support.selected) || support.selected.length === 0) {
    throw new Error(
      'agentSupport.mode is "selected" but agentSupport.selected is empty or missing.',
    );
  }

  return new Set(support.selected);
}

// ---------------------------------------------------------------------------
// Resolution — init / update-agents (accepts CLI flag + detection)
// ---------------------------------------------------------------------------

/**
 * Resolve agents for the init or update-agents commands.
 *
 * @param {string|undefined} cliAgentsFlag  Value of --agents (e.g. "all", "detected", "claude-code,cursor").
 * @param {string} targetRoot  Absolute path to the project root (used for detection).
 * @returns {Set<string>|null}  Set of canonical agent IDs, or null for "all agents".
 */
export function resolveAgentsForInit(cliAgentsFlag, targetRoot) {
  if (!cliAgentsFlag || cliAgentsFlag === "all") return null;

  if (cliAgentsFlag === "detected") {
    const detected = detectCanonicalAgentIds(targetRoot);
    if (detected.size === 0) {
      console.warn("⚠  No agent instruction files detected — defaulting to all agents.");
      return null;
    }
    return detected;
  }

  // Comma-separated list of canonical IDs.
  const ids = cliAgentsFlag.split(",").map((s) => s.trim()).filter(Boolean);
  const invalid = ids.filter((id) => !AGENT_IDS.includes(id));
  if (invalid.length > 0) {
    throw new Error(`Unknown agent ID(s): ${invalid.join(", ")}. Valid IDs: ${AGENT_IDS.join(", ")}`);
  }
  if (ids.length === 0) {
    throw new Error("--agents requires at least one agent ID.");
  }
  return new Set(ids);
}

function hasRuleMatch(fileName, rule) {
  if (Array.isArray(rule.extensions) && rule.extensions.some((extension) => fileName.endsWith(extension))) {
    return true;
  }
  if (Array.isArray(rule.suffixes) && rule.suffixes.some((suffix) => fileName.endsWith(suffix))) {
    return true;
  }
  return false;
}

function treeContainsMatchingFile(rootDir, rule) {
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    let entries;
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }
      if (entry.isFile() && hasRuleMatch(entry.name, rule)) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Detection adapter — scans for pre-existing agent files
// ---------------------------------------------------------------------------

/**
 * Scan a target directory for pre-existing agent instruction files and return
 * canonical agent IDs.  Independent of introspectProject() — uses
 * AGENT_DISCOVERY_RULES directly.
 *
 * @param {string} targetRoot  Absolute path to the project root.
 * @returns {Set<string>}  Set of detected canonical agent IDs (may be empty).
 */
export function detectCanonicalAgentIds(targetRoot) {
  const detectedOrigins = new Set();

  for (const rule of AGENT_DISCOVERY_RULES) {
    if (rule.mode === "exact") {
      const fullPath = resolve(targetRoot, rule.path);
      if (existsSync(fullPath)) {
        try {
          if (statSync(fullPath).isFile()) {
            detectedOrigins.add(rule.toolOfOrigin);
          }
        } catch {
          // stat failed — skip this rule
        }
      }
    } else if (rule.mode === "tree") {
      const rootDir = resolve(targetRoot, rule.root);
      if (existsSync(rootDir)) {
        try {
          if (statSync(rootDir).isDirectory() && treeContainsMatchingFile(rootDir, rule)) {
            detectedOrigins.add(rule.toolOfOrigin);
          }
        } catch {
          // stat failed — skip this rule
        }
      }
    }
  }

  const canonicalIds = new Set();
  for (const origin of detectedOrigins) {
    const id = DISCOVERY_ORIGIN_TO_ID.get(origin);
    if (id) canonicalIds.add(id);
  }

  return canonicalIds;
}

// ---------------------------------------------------------------------------
// Helpers for building agentSupport spec output
// ---------------------------------------------------------------------------

/**
 * Build the agentSupport object to write into a canonical spec.
 * Returns undefined when all agents are enabled (omit from spec for cleanest YAML).
 *
 * @param {Set<string>|null} enabledAgents  Set of IDs, or null for "all".
 * @returns {object|undefined}
 */
export function buildAgentSupportSpec(enabledAgents) {
  if (!enabledAgents) return undefined;
  if (enabledAgents.size === 0) {
    throw new Error("agentSupport.selected cannot be empty.");
  }
  if (enabledAgents.size >= AGENT_IDS.length) return undefined;

  return {
    mode: "selected",
    selected: AGENT_IDS.filter((id) => enabledAgents.has(id)),
  };
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternMatchesPath(relativePath, pattern) {
  if (!pattern.includes("<slug>")) {
    return relativePath === pattern;
  }

  const matcher = new RegExp(`^${escapeForRegex(pattern).replace("<slug>", "[^/]+")}`);
  return matcher.test(relativePath);
}

function agentOwnsGeneratedPath(agentId, relativePath, targetRoot) {
  const registryEntry = AGENT_REGISTRY.get(agentId);
  if (!registryEntry) return false;

  const renderPaths = [...registryEntry.renderPaths];
  if (agentId === "cline") {
    renderPaths.push(resolveClineWorkspacePath(resolve(targetRoot)));
  }

  if (renderPaths.includes(relativePath)) {
    return true;
  }

  return registryEntry.skillPaths.some((pattern) => patternMatchesPath(relativePath, pattern));
}

export function findEnabledAgentsWithConflicts(relativePaths, enabledAgents, targetRoot) {
  if (!enabledAgents || enabledAgents.size === 0 || relativePaths.length === 0) {
    return new Set();
  }

  const conflictingAgents = new Set();
  for (const relativePath of relativePaths) {
    for (const agentId of enabledAgents) {
      if (agentOwnsGeneratedPath(agentId, relativePath, targetRoot)) {
        conflictingAgents.add(agentId);
      }
    }
  }

  return conflictingAgents;
}
