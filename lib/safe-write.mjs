// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Safe write orchestration.
//
// Owns the "detect → decide → write" flow that protects pre-existing agent
// instruction files (CLAUDE.md, AGENTS.md, .github/copilot-instructions.md,
// Cursor rules, …) from being silently overwritten by the first `init`,
// `sync`, or `render` against a repo that already contains operator-authored
// content.
//
// A file is treated as tool-managed only when it carries the Agent Jump
// Start provenance marker. Any other pre-existing file at a render target
// path is treated as operator-authored and requires an explicit decision
// before the CLI will overwrite it.
//
// Non-interactive callers must pass `conflictPolicy` explicitly. If they
// do not, and an unmanaged collision exists, the orchestrator fails closed.
// Interactive callers can let the orchestrator prompt per path.
// ---------------------------------------------------------------------------

import { createInterface } from "node:readline";
import { applyWriteDecisions, classifyPreWriteCollisions, backupPathFor } from "./files.mjs";

const MANIFEST_PATH = "docs/agent-jump-start/generated-manifest.json";

function isInteractive() {
  return Boolean(process.stdin.isTTY);
}

async function promptDecision(relativePath) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  try {
    return await new Promise((resolvePrompt) => {
      rl.question(
        `  ${relativePath} already exists and was not written by Agent Jump Start.\n` +
        `    [k] keep existing file (default)\n` +
        `    [o] overwrite\n` +
        `    [b] backup then overwrite\n` +
        `  Choice: `,
        (answer) => {
          const trimmed = (answer ?? "").trim().toLowerCase();
          if (trimmed === "o" || trimmed === "overwrite") resolvePrompt("overwrite");
          else if (trimmed === "b" || trimmed === "backup") resolvePrompt("backup-then-overwrite");
          else resolvePrompt("keep");
        },
      );
    });
  } finally {
    rl.close();
  }
}

function rewriteManifestForKeptPaths(generatedFiles, keptPaths) {
  if (!keptPaths.length) return generatedFiles;
  if (!(MANIFEST_PATH in generatedFiles)) return generatedFiles;
  const keptSet = new Set(keptPaths);
  try {
    const manifest = JSON.parse(generatedFiles[MANIFEST_PATH]);
    const filtered = (manifest.files ?? []).filter((p) => !keptSet.has(p));
    const nextManifest = { ...manifest, files: filtered };
    return { ...generatedFiles, [MANIFEST_PATH]: `${JSON.stringify(nextManifest, null, 2)}\n` };
  } catch {
    return generatedFiles;
  }
}

function buildDecisionMap(unmanaged, policy) {
  const decision = policy === "force" ? "overwrite"
    : policy === "backup" ? "backup-then-overwrite"
    : policy === "keep" ? "keep"
    : null;
  if (!decision) return null;
  return Object.fromEntries(unmanaged.map((p) => [p, decision]));
}

function formatBlockedMessage(unmanaged) {
  const lines = [
    "",
    "Refused to overwrite pre-existing files that Agent Jump Start does not own:",
    ...unmanaged.map((p) => `  - ${p}`),
    "",
    "These files do not carry the Agent Jump Start provenance marker, so they",
    "were most likely authored by you or a teammate. To continue, choose one:",
    "",
    "  --force          overwrite them with the rendered versions",
    "  --backup         save a timestamped copy, then overwrite",
    "  --keep-existing  leave them untouched and skip the rendered versions",
    "",
    "Or remove/rename the files manually and re-run the command.",
    "",
  ];
  return lines.join("\n");
}

/**
 * Safely write rendered files to the target root.
 *
 * @param {object} params
 * @param {Record<string,string>} params.generatedFiles
 * @param {string} params.targetRoot
 * @param {"prompt"|"force"|"backup"|"keep"|null} [params.conflictPolicy]
 *   explicit operator choice. When `null`, the orchestrator infers from TTY:
 *   interactive sessions prompt per path; non-interactive sessions fail closed.
 * @param {boolean} [params.assumeNonInteractive] — force non-interactive mode
 * @param {object} [params.logger] — defaults to console
 * @returns {Promise<{written:string[], kept:string[], backedUp:{relativePath:string,backupPath:string}[], blocked:string[]}>}
 */
export async function safeWriteGeneratedFiles({
  generatedFiles,
  targetRoot,
  conflictPolicy = null,
  assumeNonInteractive = false,
  logger = console,
}) {
  const { unmanaged, unreadable } = classifyPreWriteCollisions(generatedFiles, targetRoot);

  if (unreadable.length) {
    logger.warn("Warning: could not classify pre-existing file(s), treating as operator-authored:");
    for (const p of unreadable) logger.warn(`  - ${p}`);
    unmanaged.push(...unreadable);
  }

  if (unmanaged.length === 0) {
    const res = applyWriteDecisions(generatedFiles, targetRoot);
    return { ...res, blocked: [], effectiveFiles: generatedFiles };
  }

  const policyDecisions = buildDecisionMap(unmanaged, conflictPolicy);
  if (policyDecisions) {
    const effectiveFiles = conflictPolicy === "keep"
      ? rewriteManifestForKeptPaths(generatedFiles, unmanaged)
      : generatedFiles;
    const res = applyWriteDecisions(effectiveFiles, targetRoot, { decisions: policyDecisions });
    if (conflictPolicy === "keep") {
      logger.log("Kept pre-existing operator-authored files:");
      for (const p of unmanaged) logger.log(`  - ${p}`);
    } else if (conflictPolicy === "backup") {
      logger.log("Backed up then overwrote pre-existing files:");
      for (const entry of res.backedUp) logger.log(`  - ${entry.relativePath} -> ${entry.backupPath}`);
    } else if (conflictPolicy === "force") {
      logger.log("Overwrote pre-existing operator-authored files (--force):");
      for (const p of unmanaged) logger.log(`  - ${p}`);
    }
    return { ...res, blocked: [], effectiveFiles };
  }

  if (assumeNonInteractive || !isInteractive()) {
    logger.error(formatBlockedMessage(unmanaged));
    return { written: [], kept: [], backedUp: [], blocked: unmanaged, effectiveFiles: generatedFiles };
  }

  // Interactive: prompt per path.
  const decisions = {};
  const keptPaths = [];
  logger.log("");
  logger.log("Agent Jump Start found pre-existing files it does not own.");
  logger.log("Choose what to do with each before any file is written.");
  logger.log("");
  for (const relativePath of unmanaged) {
    const choice = await promptDecision(relativePath);
    decisions[relativePath] = choice;
    if (choice === "keep") keptPaths.push(relativePath);
  }

  const effectiveFiles = keptPaths.length
    ? rewriteManifestForKeptPaths(generatedFiles, keptPaths)
    : generatedFiles;
  const res = applyWriteDecisions(effectiveFiles, targetRoot, { decisions });
  if (res.backedUp.length) {
    logger.log("");
    logger.log("Backups created:");
    for (const entry of res.backedUp) logger.log(`  - ${entry.relativePath} -> ${entry.backupPath}`);
  }
  if (res.kept.length) {
    logger.log("");
    logger.log("Kept operator-authored files:");
    for (const p of res.kept) logger.log(`  - ${p}`);
  }
  return { ...res, blocked: [], effectiveFiles };
}

export function resolveConflictPolicyFromOptions(options) {
  const flags = [];
  if (options.force) flags.push("force");
  if (options.backup) flags.push("backup");
  if (options["keep-existing"]) flags.push("keep");
  if (flags.length > 1) {
    throw new Error(
      `Conflicting flags: ${flags.map((f) => `--${f === "keep" ? "keep-existing" : f}`).join(" and ")}. Choose one.`,
    );
  }
  return flags[0] ?? null;
}
