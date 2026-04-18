// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// update-agents command: modify the agentSupport selection in a canonical spec.
//
// Full lifecycle management for agent support: add, remove, or reset the
// enabled agent set without re-running init.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

import { AGENT_IDS } from "../constants.mjs";
import { assertRequired, readJsonYaml, stringifyJsonYaml } from "../utils.mjs";
import { validateSpec } from "../validation.mjs";
import { resolveEnabledAgents, buildAgentSupportSpec } from "../agent-support.mjs";
import { AGENT_REGISTRY } from "../agent-targets.mjs";
import { mergeSpecLayers } from "../merging.mjs";
import { resolveAndValidateSpec } from "./helpers.mjs";

/**
 * Handle the `update-agents` command.
 *
 * Modifies the agentSupport section of a canonical spec without re-running
 * init.  Writes the updated spec back to disk.
 *
 * @param {object} options — parsed CLI options
 */
export async function handleUpdateAgents(options) {
  assertRequired(options, "spec", "update-agents");
  const meta = resolveAndValidateSpec(options.spec);
  const specPath = meta.leafPath;
  const leafSpec = readJsonYaml(specPath);
  const writableLeafSpec = structuredClone(leafSpec);

  const currentEnabled = resolveEnabledAgents(meta.merged);
  const currentSet = currentEnabled ?? new Set(AGENT_IDS);

  // --- Determine the mutation ---
  if (options.mode === "all" || options["all-missing"]) {
    applyAgentSupportOverride(writableLeafSpec, meta, null);
    const added = AGENT_IDS.filter((id) => !currentSet.has(id));
    if (added.length === 0 && !currentEnabled) {
      console.log("Already supporting all agents — no changes needed.");
      return;
    }
    writeSpecToDisk(writableLeafSpec, meta);
    if (added.length > 0) {
      const names = added.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
      console.log(`Added: ${names.join(", ")}`);
    }
    console.log(`Now supporting all ${AGENT_IDS.length} agents.`);
    printSyncHint(options.spec);
    return;
  }

  if (options.include) {
    const idsToAdd = options.include.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = idsToAdd.filter((id) => !AGENT_IDS.includes(id));
    if (invalid.length > 0) {
      throw new Error(`Unknown agent ID(s): ${invalid.join(", ")}. Valid IDs: ${AGENT_IDS.join(", ")}`);
    }
    if (idsToAdd.length === 0) {
      throw new Error("--include requires at least one agent ID.");
    }

    const alreadyEnabled = idsToAdd.filter((id) => currentSet.has(id));
    const newIds = idsToAdd.filter((id) => !currentSet.has(id));

    if (newIds.length === 0) {
      const names = alreadyEnabled.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
      console.log(`Already enabled: ${names.join(", ")}. No changes needed.`);
      return;
    }

    const merged = new Set([...currentSet, ...newIds]);
    applyAgentSupportOverride(writableLeafSpec, meta, merged);

    writeSpecToDisk(writableLeafSpec, meta);
    const addedNames = newIds.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
    console.log(`Added: ${addedNames.join(", ")}`);
    console.log(`Now supporting ${merged.size} of ${AGENT_IDS.length} agents.`);
    printSyncHint(options.spec);
    return;
  }

  if (options.remove) {
    const idsToRemove = options.remove.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = idsToRemove.filter((id) => !AGENT_IDS.includes(id));
    if (invalid.length > 0) {
      throw new Error(
        `Unknown agent ID(s): ${invalid.join(", ")}. ` +
        `Valid IDs: ${AGENT_IDS.join(", ")}. ` +
        `Run 'agent-jump-start list-agents' to see all available agents.`,
      );
    }
    if (idsToRemove.length === 0) {
      throw new Error("--remove requires at least one agent ID.");
    }

    const notEnabled = idsToRemove.filter((id) => !currentSet.has(id));
    if (notEnabled.length > 0) {
      const names = notEnabled.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
      console.log(`Not currently enabled (skipping): ${names.join(", ")}`);
    }

    const toRemove = idsToRemove.filter((id) => currentSet.has(id));
    if (toRemove.length === 0) {
      console.log("No enabled agents to remove. No changes needed.");
      return;
    }

    const remaining = new Set([...currentSet].filter((id) => !toRemove.includes(id)));
    if (remaining.size === 0) {
      throw new Error(
        "Cannot remove all agents — at least one must remain enabled. " +
        "To disable Agent Jump Start entirely, remove the canonical spec.",
      );
    }

    applyAgentSupportOverride(writableLeafSpec, meta, remaining);
    writeSpecToDisk(writableLeafSpec, meta);

    const removedNames = toRemove.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
    console.log(`Removed: ${removedNames.join(", ")}`);
    console.log(`Now supporting ${remaining.size} of ${AGENT_IDS.length} agents.`);
    printSyncHint(options.spec);
    return;
  }

  // No mutation flag provided — show current state and optionally enter interactive mode.
  const isTTY = process.stdin.isTTY ?? false;

  printCurrentState(currentEnabled, currentSet);

  if (!isTTY) {
    printNonInteractiveHints();
    return;
  }

  // Interactive lifecycle flow
  const result = await runInteractiveAgentUpdate(currentSet, currentEnabled);
  if (!result) return;

  applyAgentSupportOverride(writableLeafSpec, meta, result.enabledAgents);
  writeSpecToDisk(writableLeafSpec, meta);

  if (result.added.length > 0) {
    const names = result.added.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
    console.log(`Added: ${names.join(", ")}`);
  }
  if (result.removed.length > 0) {
    const names = result.removed.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
    console.log(`Removed: ${names.join(", ")}`);
  }

  if (result.enabledAgents) {
    console.log(`Now supporting ${result.enabledAgents.size} of ${AGENT_IDS.length} agents.`);
  } else {
    console.log(`Now supporting all ${AGENT_IDS.length} agents.`);
  }
  printSyncHint(options.spec);
}

function buildMergedSpecFromChain(meta, writableLeafSpec) {
  const chainSpecs = meta.chain.map((layer) => structuredClone(layer.spec));
  chainSpecs[chainSpecs.length - 1] = structuredClone(writableLeafSpec);

  let merged = structuredClone(chainSpecs[0]);
  delete merged.extends;

  for (let index = 1; index < chainSpecs.length; index += 1) {
    const overlay = structuredClone(chainSpecs[index]);
    delete overlay.extends;
    merged = mergeSpecLayers(merged, overlay);
  }

  return merged;
}

function buildInheritedEnabledAgents(meta) {
  if (!meta.isLayered || meta.chain.length < 2) {
    return null;
  }

  let merged = structuredClone(meta.chain[0].spec);
  delete merged.extends;

  for (let index = 1; index < meta.chain.length - 1; index += 1) {
    const overlay = structuredClone(meta.chain[index].spec);
    delete overlay.extends;
    merged = mergeSpecLayers(merged, overlay);
  }

  return resolveEnabledAgents(merged);
}

function applyAgentSupportOverride(writableLeafSpec, meta, enabledAgents) {
  if (enabledAgents) {
    writableLeafSpec.agentSupport = buildAgentSupportSpec(enabledAgents);
    return;
  }

  const inheritedEnabledAgents = buildInheritedEnabledAgents(meta);
  if (meta.isLayered && inheritedEnabledAgents) {
    writableLeafSpec.agentSupport = { mode: "all" };
    return;
  }

  delete writableLeafSpec.agentSupport;
}

function writeSpecToDisk(spec, meta) {
  const mergedCandidate = meta.isLayered ? buildMergedSpecFromChain(meta, spec) : structuredClone(spec);
  validateSpec(mergedCandidate, meta.leafPath, {
    layerChain: meta.chain,
    leafPath: meta.leafPath,
  });
  writeFileSync(meta.leafPath, stringifyJsonYaml(spec), "utf8");
}

function printSyncHint(specPath) {
  console.log(`\nRun 'agent-jump-start sync --spec ${specPath}' to regenerate files.`);
}

function printCurrentState(currentEnabled, currentSet) {
  if (!currentEnabled) {
    console.log(`Currently enabled (all ${AGENT_IDS.length} of ${AGENT_IDS.length}):\n`);
    for (const id of AGENT_IDS) {
      const name = AGENT_REGISTRY.get(id)?.displayName ?? id;
      console.log(`  ✓ ${name.padEnd(24)} (${id})`);
    }
  } else {
    const enabledIds = AGENT_IDS.filter((id) => currentSet.has(id));
    const missingIds = AGENT_IDS.filter((id) => !currentSet.has(id));

    console.log(`Currently enabled (${enabledIds.length} of ${AGENT_IDS.length}):\n`);
    for (const id of enabledIds) {
      const name = AGENT_REGISTRY.get(id)?.displayName ?? id;
      console.log(`  ✓ ${name.padEnd(24)} (${id})`);
    }
    if (missingIds.length > 0) {
      console.log(`\nNot enabled:\n`);
      for (const id of missingIds) {
        const name = AGENT_REGISTRY.get(id)?.displayName ?? id;
        console.log(`  · ${name.padEnd(24)} (${id})`);
      }
    }
  }
  console.log("");
}

function printNonInteractiveHints() {
  console.log("To add agents:     update-agents --spec <path> --include <id1>,<id2>");
  console.log("To remove agents:  update-agents --spec <path> --remove <id1>,<id2>");
  console.log("To enable all:     update-agents --spec <path> --all-missing");
}

async function askQuestion(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function runInteractiveAgentUpdate(currentSet, currentEnabled) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });

  try {
    console.log("What would you like to do?\n");
    console.log("  1) Add agents");
    console.log("  2) Remove agents");
    console.log("  3) Switch to all agents");
    console.log("  4) Exit without changes\n");

    const choice = (await askQuestion(rl, "Choice [4]: ")).trim() || "4";

    if (choice === "4" || choice === "exit") {
      console.log("No changes made.");
      return null;
    }

    if (choice === "3") {
      if (!currentEnabled) {
        console.log("Already supporting all agents — no changes needed.");
        return null;
      }
      const added = AGENT_IDS.filter((id) => !currentSet.has(id));
      return { enabledAgents: null, added, removed: [] };
    }

    if (choice === "1") {
      const missingIds = AGENT_IDS.filter((id) => !currentSet.has(id));
      if (missingIds.length === 0) {
        console.log("All agents are already enabled — nothing to add.");
        return null;
      }

      console.log("\nAvailable agents to add:\n");
      for (let i = 0; i < missingIds.length; i++) {
        const name = AGENT_REGISTRY.get(missingIds[i])?.displayName ?? missingIds[i];
        console.log(`  ${i + 1}) ${name.padEnd(24)} (${missingIds[i]})`);
      }

      const input = (await askQuestion(rl, "\nEnter numbers or IDs (comma-separated), or 'all': ")).trim();
      if (!input || input === "0") {
        console.log("No changes made.");
        return null;
      }

      const toAdd = input === "all"
        ? missingIds
        : resolveInteractiveSelection(input, missingIds);

      if (toAdd.length === 0) {
        console.log("No valid agents selected. No changes made.");
        return null;
      }

      const newSet = new Set([...currentSet, ...toAdd]);
      const confirm = (await askQuestion(rl, `\nAdd ${toAdd.length} agent(s)? [Y/n]: `)).trim().toLowerCase();
      if (confirm === "n" || confirm === "no") {
        console.log("No changes made.");
        return null;
      }

      const enabledAgents = newSet.size === AGENT_IDS.length ? null : newSet;
      return { enabledAgents, added: toAdd, removed: [] };
    }

    if (choice === "2") {
      const enabledIds = AGENT_IDS.filter((id) => currentSet.has(id));
      if (enabledIds.length <= 1) {
        console.log("Cannot remove agents — at least one must remain enabled.");
        return null;
      }

      console.log("\nCurrently enabled agents:\n");
      for (let i = 0; i < enabledIds.length; i++) {
        const name = AGENT_REGISTRY.get(enabledIds[i])?.displayName ?? enabledIds[i];
        console.log(`  ${i + 1}) ${name.padEnd(24)} (${enabledIds[i]})`);
      }

      const input = (await askQuestion(rl, "\nEnter numbers or IDs to remove (comma-separated): ")).trim();
      if (!input || input === "0") {
        console.log("No changes made.");
        return null;
      }

      const toRemove = resolveInteractiveSelection(input, enabledIds);
      if (toRemove.length === 0) {
        console.log("No valid agents selected. No changes made.");
        return null;
      }

      const remaining = new Set([...currentSet].filter((id) => !toRemove.includes(id)));
      if (remaining.size === 0) {
        console.log("Cannot remove all agents — at least one must remain enabled.");
        return null;
      }

      // Preview stale outputs
      console.log("\nRemoving these agents will mark their managed files as stale:");
      for (const id of toRemove) {
        const entry = AGENT_REGISTRY.get(id);
        const paths = entry?.renderPaths ?? [];
        const roots = entry?.agentRoots ?? [];
        const preview = [...paths, ...roots.map((r) => `${r} (directory)`)].join(", ") || "(inline only)";
        console.log(`  - ${entry?.displayName ?? id}: ${preview}`);
      }

      const confirm = (await askQuestion(rl, `\nRemove ${toRemove.length} agent(s)? [Y/n]: `)).trim().toLowerCase();
      if (confirm === "n" || confirm === "no") {
        console.log("No changes made.");
        return null;
      }

      return { enabledAgents: remaining, added: [], removed: toRemove };
    }

    console.log("Invalid choice. No changes made.");
    return null;
  } finally {
    rl.close();
  }
}

function resolveInteractiveSelection(input, candidateIds) {
  const tokens = input.split(",").map((s) => s.trim()).filter(Boolean);
  const selected = [];

  for (const token of tokens) {
    const num = Number(token);
    if (Number.isInteger(num) && num >= 1 && num <= candidateIds.length) {
      selected.push(candidateIds[num - 1]);
    } else if (AGENT_IDS.includes(token)) {
      selected.push(token);
    }
  }

  return [...new Set(selected)];
}
