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
import { renderGeneratedFiles } from "../renderers.mjs";
import { checkGeneratedFiles, cleanStaleFiles, formatGeneratedFileFailure } from "../files.mjs";
import { safeWriteGeneratedFiles, resolveConflictPolicyFromOptions } from "../safe-write.mjs";
import { discoverUnmanagedSkills } from "../intake.mjs";
import { printSyncIntakeAdvisory, resolveAndValidateSpec } from "./helpers.mjs";

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
export async function handleSync(options) {
  assertRequired(options, "spec", "sync");
  const targetRoot = resolve(options.target ?? ".");
  const { merged: spec } = resolveAndValidateSpec(options.spec);
  const conflictPolicy = resolveConflictPolicyFromOptions(options);

  const generatedFiles = renderGeneratedFiles(spec, options.spec, targetRoot);

  let allKept = [];
  let allBackedUp = [];

  const writeAndCheck = async () => {
    let removed = [];
    try {
      removed = cleanStaleFiles(generatedFiles, targetRoot);
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "clean")], passes: [] };
    }

    let writeResult;
    try {
      writeResult = await safeWriteGeneratedFiles({ generatedFiles, targetRoot, conflictPolicy });
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "write")], passes: [] };
    }

    // If the operator chose to keep a file, the manifest on disk no longer
    // lists it; sync back the in-memory map so the subsequent check uses the
    // same ground truth that was written. Kept paths are also removed from
    // the map so `check` does not compare operator content to rendered
    // content and raise a false drift failure.
    if (writeResult.effectiveFiles && writeResult.effectiveFiles !== generatedFiles) {
      for (const [k, v] of Object.entries(writeResult.effectiveFiles)) {
        generatedFiles[k] = v;
      }
    }
    for (const keptPath of writeResult.kept ?? []) {
      delete generatedFiles[keptPath];
    }

    if (writeResult.blocked.length > 0) {
      return {
        removed,
        failures: writeResult.blocked.map((relativePath) => ({
          relativePath,
          cause: "Sync refused to overwrite a pre-existing operator-authored file.",
          detail: "File exists on disk and does not carry the Agent Jump Start provenance marker.",
          nextStep: "Re-run with --force, --backup, or --keep-existing (or remove the file), then run sync again.",
        })),
        passes: [],
      };
    }

    allKept = [...allKept, ...writeResult.kept];
    allBackedUp = [...allBackedUp, ...writeResult.backedUp];

    try {
      const result = checkGeneratedFiles(generatedFiles, targetRoot);
      if (writeResult.kept.length) {
        const keptSet = new Set(writeResult.kept);
        result.failures = (result.failures ?? []).filter((f) => !keptSet.has(f.relativePath));
      }
      return { removed, ...result };
    } catch (error) {
      return { removed, failures: [makeOperationFailure(error, targetRoot, "check")], passes: [] };
    }
  };

  // Pass 1
  let { removed, failures, passes } = await writeAndCheck();
  let healed = false;

  // Pass 2 (self-heal): re-render from the same in-memory spec and
  // re-apply.  Re-rendering protects against any state that would have
  // changed between passes (e.g. directory pruning, intermediate writes).
  if (failures.length > 0) {
    const blockedByProtection = failures.every((f) => /does not carry the Agent Jump Start provenance marker/.test(f.detail ?? ""));
    if (!blockedByProtection) {
      const generatedFiles2 = renderGeneratedFiles(spec, options.spec, targetRoot);
      for (const key of Object.keys(generatedFiles)) delete generatedFiles[key];
      Object.assign(generatedFiles, generatedFiles2);
      const second = await writeAndCheck();
      removed = [...removed, ...second.removed];
      failures = second.failures;
      passes = second.passes;
      healed = failures.length === 0;
    }
  }

  if (removed.length > 0) {
    console.log("Cleaned stale files:");
    for (const filePath of removed) {
      console.log(`  - ${filePath}`);
    }
    console.log("");
  }

  console.log("Rendered files:");
  const keptSet = new Set(allKept);
  for (const filePath of Object.keys(generatedFiles).sort()) {
    const suffix = keptSet.has(filePath) ? "  (kept operator-authored file, not rewritten)" : "";
    console.log(`  ${filePath}${suffix}`);
  }
  console.log(`\nTotal: ${Object.keys(generatedFiles).length} files across ${AGENT_COUNT} agent targets`);

  if (allBackedUp.length > 0) {
    console.log("\nBackups created:");
    for (const entry of allBackedUp) console.log(`  - ${entry.relativePath} -> ${entry.backupPath}`);
  }
  if (allKept.length > 0) {
    console.log("\nKept operator-authored files (not rewritten):");
    for (const p of allKept) console.log(`  - ${p}`);
  }

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
export async function handleRender(options) {
  assertRequired(options, "spec", "render");
  const targetRoot = resolve(options.target ?? ".");
  const { merged: spec } = resolveAndValidateSpec(options.spec);
  const conflictPolicy = resolveConflictPolicyFromOptions(options);

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

  const writeResult = await safeWriteGeneratedFiles({ generatedFiles, targetRoot, conflictPolicy });
  if (writeResult.blocked.length > 0) {
    console.error(`\n${writeResult.blocked.length} file(s) refused by the overwrite guard.`);
    process.exit(1);
  }

  console.log("Rendered files:");
  const keptSet = new Set(writeResult.kept);
  for (const filePath of Object.keys(generatedFiles).sort()) {
    const suffix = keptSet.has(filePath) ? "  (kept operator-authored file, not rewritten)" : "";
    console.log(`  ${filePath}${suffix}`);
  }
  console.log(`\nTotal: ${Object.keys(generatedFiles).length} files across ${AGENT_COUNT} agent targets`);
  if (writeResult.backedUp.length) {
    console.log("\nBackups created:");
    for (const entry of writeResult.backedUp) console.log(`  - ${entry.relativePath} -> ${entry.backupPath}`);
  }
  if (writeResult.kept.length) {
    console.log("\nKept operator-authored files (not rewritten):");
    for (const p of writeResult.kept) console.log(`  - ${p}`);
  }
}

/**
 * Handle the `check` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleCheck(options) {
  assertRequired(options, "spec", "check");
  const targetRoot = resolve(options.target ?? ".");
  const { merged: spec } = resolveAndValidateSpec(options.spec);

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
