// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Shared helpers for CLI command handlers.
//
// Pure display and data-formatting functions used across multiple command
// modules.  Extracted from the monolithic CLI entry point to keep each
// command handler focused on its own logic.
//
// Public API:
//   displayPath(filePath, relativeTo)     — relative human-friendly path
//   summarizeDiscoveries(discoveries)     — group intake discoveries by status
//   printIntakeReport(discoveries, root)  — format intake scan output
//   printSyncIntakeAdvisory(...)          — post-sync intake warning
//   makeLocalSourceInfoForPath(path)      — provenance record from local path
// ---------------------------------------------------------------------------

import { relative, resolve } from "node:path";
import { makeLocalSourceInfo } from "../source-info.mjs";
import { KNOWN_SKILL_DIRS } from "../intake.mjs";

/**
 * Return a human-friendly relative path for display.
 *
 * Falls back to the absolute path when the file sits outside `relativeTo`.
 *
 * @param {string} filePath    — absolute path to display
 * @param {string} relativeTo  — base directory for relative resolution
 * @returns {string}
 */
export function displayPath(filePath, relativeTo = process.cwd()) {
  const relativePath = relative(relativeTo, filePath);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")) {
    return relativePath.replaceAll("\\", "/");
  }
  return filePath;
}

/**
 * Group intake discoveries by status.
 *
 * @param {Array<{status: string}>} discoveries
 * @returns {{ unmanaged: object[], managed: object[], invalid: object[] }}
 */
export function summarizeDiscoveries(discoveries) {
  return {
    unmanaged: discoveries.filter((entry) => entry.status === "unmanaged"),
    managed: discoveries.filter((entry) => entry.status === "managed"),
    invalid: discoveries.filter((entry) => entry.status === "invalid"),
  };
}

/**
 * Print a human-readable intake scan report to stdout.
 *
 * @param {object[]} discoveries — array from discoverUnmanagedSkills()
 * @param {string}   targetRoot  — workspace root for path display
 */
export function printIntakeReport(discoveries, targetRoot) {
  if (discoveries.length === 0) {
    console.log(`No local skill packages found under ${KNOWN_SKILL_DIRS.join(", ")}.`);
    return;
  }

  console.log("Discovered local skill packages:");
  for (const entry of discoveries) {
    console.log(`  ${entry.slug}  (${entry.status})  ${displayPath(entry.path, targetRoot)}`);
    if (entry.errors) {
      for (const error of entry.errors) {
        console.log(`    - ${error}`);
      }
    }
  }

  const { unmanaged, managed, invalid } = summarizeDiscoveries(discoveries);
  console.log(
    `\nSummary: ${unmanaged.length} unmanaged, ${managed.length} managed, ${invalid.length} invalid`,
  );
}

/**
 * Print an advisory after sync when unmanaged or invalid skills are found.
 *
 * @param {object[]}    discoveries — array from discoverUnmanagedSkills()
 * @param {string}      targetRoot  — workspace root for path display
 * @param {string}      specArg     — original --spec value for the hint command
 * @param {string|null} targetArg   — original --target value (may be null)
 */
export function printSyncIntakeAdvisory(discoveries, targetRoot, specArg, targetArg) {
  const { unmanaged, invalid } = summarizeDiscoveries(discoveries);
  if (unmanaged.length === 0 && invalid.length === 0) {
    return;
  }

  const intakeCommand = [
    "agent-jump-start",
    "intake",
    "--spec",
    specArg,
    ...(targetArg ? ["--target", targetArg] : []),
  ].join(" ");

  if (unmanaged.length > 0) {
    const roots = [...new Set(unmanaged.map((entry) => displayPath(entry.path, targetRoot).split("/")[0]))];
    console.log("");
    console.log(`Warning: found ${unmanaged.length} unmanaged skill package(s) in ${roots.join(", ")}.`);
    console.log(`  ${unmanaged.map((entry) => entry.slug).join(", ")}`);
    console.log(`  Run '${intakeCommand}' to review and import them.`);
  }

  if (invalid.length > 0) {
    console.log("");
    console.log(`Warning: found ${invalid.length} invalid local skill package(s).`);
    for (const entry of invalid) {
      console.log(`  ${entry.slug}: ${entry.errors.join("; ")}`);
    }
    console.log(`  Run '${intakeCommand}' to review them.`);
  }
}

/**
 * Build a provenance source-info object from a local filesystem path.
 *
 * Normalizes the path relative to cwd for consistent lockfile entries.
 *
 * @param {string} sourcePathInput — path to the skill source directory
 * @returns {object} source info suitable for makeProvenanceRecord()
 */
export function makeLocalSourceInfoForPath(sourcePathInput) {
  const relativePath = relative(process.cwd(), resolve(sourcePathInput));
  const sourceLabel = relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")
    ? relativePath.replaceAll("\\", "/")
    : sourcePathInput;
  return makeLocalSourceInfo(sourceLabel);
}
