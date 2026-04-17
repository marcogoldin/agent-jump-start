// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// update-agents command: modify the agentSupport selection in a canonical spec.
//
// This is the additive expansion path for P0-C "Selective Agent Support".
// Users can add agents without re-running init.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
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
export function handleUpdateAgents(options) {
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

  // No mutation flag provided — show current state.
  if (!currentEnabled) {
    console.log(`Currently supporting all ${AGENT_IDS.length} agents.`);
  } else {
    const enabledNames = [...currentEnabled].map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);
    const missingIds = AGENT_IDS.filter((id) => !currentEnabled.has(id));
    const missingNames = missingIds.map((id) => AGENT_REGISTRY.get(id)?.displayName ?? id);

    console.log(`Currently supporting ${currentEnabled.size} of ${AGENT_IDS.length} agents:`);
    console.log(`  Enabled:  ${enabledNames.join(", ")}`);
    if (missingNames.length > 0) {
      console.log(`  Missing:  ${missingNames.join(", ")}`);
    }
    console.log("");
    console.log("To add agents:  update-agents --spec <path> --include <id1>,<id2>");
    console.log("To enable all:  update-agents --spec <path> --all-missing");
  }
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
