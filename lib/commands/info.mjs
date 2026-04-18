// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Info and utility commands:
//   validate, export-schema, list-agents, list-profiles,
//   demo-clean, demo-tree.
//
// Lightweight commands for spec validation, schema export, agent listing,
// and demo/test utilities.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { TOOL_VERSION, SUPPORTED_AGENTS } from "../constants.mjs";
import { assertRequired, ensureDirectory } from "../utils.mjs";
import { listAvailableProfiles, cleanDirectoryIfExists, listManagedFiles } from "../files.mjs";
import { CANONICAL_SPEC_SCHEMA } from "../schema.mjs";
import { AGENT_DISPLAY_CATALOG } from "../agent-targets.mjs";
import { resolveEnabledAgents } from "../agent-support.mjs";
import { describeChain } from "../layered-diagnostics.mjs";
import { displayPath, resolveAndValidateSpec } from "./helpers.mjs";

/**
 * Handle the `validate` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleValidate(options) {
  assertRequired(options, "spec", "validate");
  const { merged: spec, isLayered, chain, leafPath } = resolveAndValidateSpec(options.spec);
  console.log(`Spec validation passed: ${options.spec}`);
  if (isLayered) {
    console.log(`  Layer chain: ${describeChain(chain)}`);
    console.log(`  Leaf (writeback target): ${displayPath(leafPath)}`);
  }
  if (spec.skills?.length) {
    console.log(`  ${spec.skills.length} skill(s) validated`);
  }
}

/**
 * Handle the `export-schema` command.
 *
 * Writes the JSON Schema for the canonical spec to a file or stdout.
 *
 * @param {object} options — parsed CLI options
 */
export function handleExportSchema(options) {
  const output = options.output ?? "canonical-spec.schema.json";
  const schemaJson = JSON.stringify(CANONICAL_SPEC_SCHEMA, null, 2) + "\n";

  if (output === "-") {
    process.stdout.write(schemaJson);
  } else {
    ensureDirectory(resolve(output));
    writeFileSync(resolve(output), schemaJson, "utf8");
    console.log(`Schema written to ${output}`);
  }
}

/**
 * Handle the `list-agents` command.
 *
 * Without `--spec`: shows all agents with canonical IDs and main outputs.
 * With `--spec <path>`: also shows enabled/disabled status for the project.
 *
 * @param {object} [options] — parsed CLI options
 */
export function handleListAgents(options) {
  const showStatus = Boolean(options?.spec);
  let enabledAgents = null;

  if (showStatus) {
    const { merged: spec } = resolveAndValidateSpec(options.spec);
    enabledAgents = resolveEnabledAgents(spec);
  }

  console.log(`Agent Jump Start v${TOOL_VERSION} - Supported Agents\n`);

  const header = showStatus
    ? `  ${"Agent".padEnd(24)} ${"ID".padEnd(20)} ${"Main Outputs".padEnd(42)} Status`
    : `  ${"Agent".padEnd(24)} ${"ID".padEnd(20)} Main Outputs`;
  console.log(header);
  console.log(`  ${"─".repeat(header.length - 2)}`);

  for (const agent of AGENT_DISPLAY_CATALOG) {
    const name = agent.name.padEnd(24);
    const id = agent.id.padEnd(20);
    const files = agent.files.padEnd(42);

    if (showStatus) {
      const isEnabled = !enabledAgents || enabledAgents.has(agent.id);
      const status = isEnabled ? "enabled" : "—";
      console.log(`  ${name} ${id} ${files} ${status}`);
    } else {
      console.log(`  ${name} ${id} ${agent.files}`);
    }
  }

  if (showStatus && enabledAgents) {
    console.log(`\n  ${enabledAgents.size} of ${AGENT_DISPLAY_CATALOG.length} agents enabled (mode: selected)`);
  } else if (showStatus) {
    console.log(`\n  All ${AGENT_DISPLAY_CATALOG.length} agents enabled`);
  }
}

/**
 * Handle the `list-profiles` command.
 */
export function handleListProfiles() {
  const profiles = listAvailableProfiles();
  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }
  console.log(`Agent Jump Start v${TOOL_VERSION} - Available Profiles\n`);
  for (const profile of profiles) {
    console.log(`  ${profile.name.padEnd(26)} ${profile.path}`);
  }
}

/**
 * Handle the `demo-clean` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleDemoClean(options) {
  assertRequired(options, "target", "demo-clean");
  const targetRoot = resolve(options.target);
  cleanDirectoryIfExists(targetRoot);
  console.log(`Removed ${targetRoot}`);
}

/**
 * Handle the `demo-tree` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleDemoTree(options) {
  assertRequired(options, "target", "demo-tree");
  const targetRoot = resolve(options.target);
  for (const entry of listManagedFiles(targetRoot)) {
    console.log(entry);
  }
}
