// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// File generation pipeline commands: sync, render, check.
//
// These commands render spec-driven instruction files and verify their
// synchronization state on disk.
// ---------------------------------------------------------------------------

import { relative, resolve } from "node:path";

import { AGENT_COUNT } from "../constants.mjs";
import { assertRequired } from "../utils.mjs";
import { validateSpec } from "../validation.mjs";
import { renderGeneratedFiles } from "../renderers.mjs";
import { writeGeneratedFiles, checkGeneratedFiles, cleanStaleFiles, formatGeneratedFileFailure } from "../files.mjs";
import { resolveLayeredSpec } from "../merging.mjs";
import { discoverUnmanagedSkills } from "../intake.mjs";
import { printSyncIntakeAdvisory } from "./helpers.mjs";

function normalizeFailurePath(filePath, targetRoot, fallback = "<workspace>") {
  if (!filePath) {
    return fallback;
  }
  const relativePath = relative(targetRoot, filePath);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")) {
    return relativePath.replaceAll("\\", "/");
  }
  return filePath;
}

function makeOperationFailure(error, targetRoot, operation) {
  const labels = {
    clean: {
      cause: "Sync could not remove a stale generated path.",
      nextStep: "Check for permissions, a file-vs-directory collision, or a broken path at this location, then run sync again.",
    },
    write: {
      cause: "Sync could not write a generated file.",
      nextStep: "Check for permissions, a file-vs-directory collision, or a read-only mount at this location, then run sync again.",
    },
    check: {
      cause: "Sync could not verify generated output.",
      nextStep: "Inspect the reported path, fix the underlying filesystem problem, then run sync again.",
    },
  };
  const label = labels[operation];
  return {
    relativePath: normalizeFailurePath(error?.path, targetRoot),
    cause: label.cause,
    detail: error instanceof Error ? error.message : String(error),
    nextStep: label.nextStep,
  };
}

function printFailureReport(failures) {
  console.log("");
  for (const failure of failures) {
    console.log(formatGeneratedFileFailure(failure));
  }
}

/**
 * Handle the `sync` command (render --clean + check in one step).
 *
 * Sync is intentionally self-healing: a single invocation must always
 * converge to a fully synchronized state.  If the post-write check
 * detects any drift (stale files left behind, content mismatch, missing
 * outputs), we automatically run a second clean+write+check pass before
 * surfacing failure to the operator.  This removes the historical
 * "needs a second sync" footgun without hiding genuine errors: if the
 * second pass still fails, we report the failures and exit non-zero.
 *
 * @param {object} options — parsed CLI options
 */
export function handleSync(options) {
  assertRequired(options, "spec", "sync");
  const targetRoot = resolve(options.target ?? ".");
  const spec = resolveLayeredSpec(options.spec);

  validateSpec(spec, options.spec);

  const generatedFiles = renderGeneratedFiles(spec, options.spec, targetRoot);

  const writeAndCheck = () => {
    let removed = [];
    try {
      removed = cleanStaleFiles(generatedFiles, targetRoot);
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "clean")], passes: [] };
    }

    try {
      writeGeneratedFiles(generatedFiles, targetRoot);
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "write")], passes: [] };
    }

    try {
      const result = checkGeneratedFiles(generatedFiles, targetRoot);
      return { removed, ...result };
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "check")], passes: [] };
    }
  };

  // Pass 1
  let { removed, failures, passes } = writeAndCheck();
  let healed = false;

  // Pass 2 (self-heal): re-render from the same in-memory spec and
  // re-apply.  Re-rendering protects against any state that would have
  // changed between passes (e.g. directory pruning, intermediate writes).
  if (failures.length > 0) {
    const generatedFiles2 = renderGeneratedFiles(spec, options.spec, targetRoot);
    for (const key of Object.keys(generatedFiles)) delete generatedFiles[key];
    Object.assign(generatedFiles, generatedFiles2);
    const second = writeAndCheck();
    removed = [...removed, ...second.removed];
    failures = second.failures;
    passes = second.passes;
    healed = failures.length === 0;
  }

  if (removed.length > 0) {
    console.log("Cleaned stale files:");
    for (const filePath of removed) {
      console.log(`  - ${filePath}`);
    }
    console.log("");
  }

  console.log("Rendered files:");
  for (const filePath of Object.keys(generatedFiles).sort()) {
    console.log(`  ${filePath}`);
  }
  console.log(`\nTotal: ${Object.keys(generatedFiles).length} files across ${AGENT_COUNT} agent targets`);

  if (failures.length > 0) {
    console.log("\nSync could not converge after the automatic repair pass.");
    printFailureReport(failures);
    console.log(`\n${failures.length} file(s) still drifted after one sync command`);
    process.exit(1);
  }

  if (healed) {
    console.log(`\nSync converged after a second pass (auto-healed)`);
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
  if (failures.length > 0) {
    printFailureReport(failures);
    console.log(`\n${failures.length} file(s) drift from the current spec`);
    process.exit(1);
  }
  console.log(`Sync check passed for ${passes.length} file(s)`);
}
