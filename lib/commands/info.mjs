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
import { validateSpec } from "../validation.mjs";
import { listAvailableProfiles, cleanDirectoryIfExists, listManagedFiles } from "../files.mjs";
import { CANONICAL_SPEC_SCHEMA } from "../schema.mjs";
import { resolveLayeredSpec } from "../merging.mjs";

/**
 * Handle the `validate` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleValidate(options) {
  assertRequired(options, "spec", "validate");
  const spec = resolveLayeredSpec(options.spec);
  validateSpec(spec, options.spec);
  console.log(`Spec validation passed: ${options.spec}`);
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
 */
export function handleListAgents() {
  console.log(`Agent Jump Start v${TOOL_VERSION} - Supported Agents\n`);
  for (const agent of SUPPORTED_AGENTS) {
    console.log(`  ${agent.name.padEnd(22)} ${agent.files}`);
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
