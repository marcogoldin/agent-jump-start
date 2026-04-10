// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// File generation pipeline commands: sync, render, check.
//
// These commands render spec-driven instruction files and verify their
// synchronization state on disk.
// ---------------------------------------------------------------------------

import { resolve } from "node:path";

import { AGENT_COUNT } from "../constants.mjs";
import { assertRequired } from "../utils.mjs";
import { validateSpec } from "../validation.mjs";
import { renderGeneratedFiles } from "../renderers.mjs";
import { writeGeneratedFiles, checkGeneratedFiles, cleanStaleFiles } from "../files.mjs";
import { resolveLayeredSpec } from "../merging.mjs";
import { discoverUnmanagedSkills } from "../intake.mjs";
import { printSyncIntakeAdvisory } from "./helpers.mjs";

/**
 * Handle the `sync` command (render --clean + check in one step).
 *
 * @param {object} options — parsed CLI options
 */
export function handleSync(options) {
  assertRequired(options, "spec", "sync");
  const targetRoot = resolve(options.target ?? ".");
  const spec = resolveLayeredSpec(options.spec);

  validateSpec(spec, options.spec);

  const generatedFiles = renderGeneratedFiles(spec, options.spec, targetRoot);

  // Phase 1: clean stale files
  const removed = cleanStaleFiles(generatedFiles, targetRoot);
  if (removed.length > 0) {
    console.log("Cleaned stale files:");
    for (const filePath of removed) {
      console.log(`  - ${filePath}`);
    }
    console.log("");
  }

  // Phase 2: write all generated files
  writeGeneratedFiles(generatedFiles, targetRoot);
  console.log("Rendered files:");
  for (const filePath of Object.keys(generatedFiles).sort()) {
    console.log(`  ${filePath}`);
  }
  console.log(`\nTotal: ${Object.keys(generatedFiles).length} files across ${AGENT_COUNT} agent targets`);

  // Phase 3: verify synchronization
  const { failures, passes } = checkGeneratedFiles(generatedFiles, targetRoot);
  if (failures.length > 0) {
    console.log("");
    for (const failure of failures) {
      console.log(`FAIL ${failure}`);
    }
    console.log(`\n${failures.length} file(s) out of sync after render`);
    process.exit(1);
  }
  console.log(`\nSync check passed for ${passes.length} file(s)`);
  const discoveries = discoverUnmanagedSkills(targetRoot, spec);
  printSyncIntakeAdvisory(discoveries, targetRoot, options.spec, options.target ?? null);
}

/**
 * Handle the `render` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleRender(options) {
  assertRequired(options, "spec", "render");
  const targetRoot = resolve(options.target ?? ".");
  const spec = resolveLayeredSpec(options.spec);

  validateSpec(spec, options.spec);

  const generatedFiles = renderGeneratedFiles(spec, options.spec, targetRoot);

  if (options.clean) {
    const removed = cleanStaleFiles(generatedFiles, targetRoot);
    if (removed.length > 0) {
      console.log("Cleaned stale files:");
      for (const filePath of removed) {
        console.log(`  - ${filePath}`);
      }
      console.log("");
    }
  }

  writeGeneratedFiles(generatedFiles, targetRoot);
  console.log("Rendered files:");
  for (const filePath of Object.keys(generatedFiles).sort()) {
    console.log(`  ${filePath}`);
  }
  console.log(`\nTotal: ${Object.keys(generatedFiles).length} files across ${AGENT_COUNT} agent targets`);
}

/**
 * Handle the `check` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleCheck(options) {
  assertRequired(options, "spec", "check");
  const targetRoot = resolve(options.target ?? ".");
  const spec = resolveLayeredSpec(options.spec);

  validateSpec(spec, options.spec);

  const generatedFiles = renderGeneratedFiles(spec, options.spec, targetRoot);
  const { failures, passes } = checkGeneratedFiles(generatedFiles, targetRoot);
  for (const pass of passes) {
    console.log(pass);
  }
  for (const failure of failures) {
    console.log(`FAIL ${failure}`);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} file(s) out of sync`);
    process.exit(1);
  }
  console.log(`Sync check passed for ${passes.length} file(s)`);
}
