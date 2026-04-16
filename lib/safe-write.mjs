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
// Interactive callers can let the orchestrator prompt per conflict group.
// ---------------------------------------------------------------------------

import { createInterface } from "node:readline";
import { applyWriteDecisions, classifyPreWriteCollisions } from "./files.mjs";

const MANIFEST_PATH = "docs/agent-jump-start/generated-manifest.json";
const ROOT_LABEL = "workspace root";

function isInteractive() {
  return Boolean(process.stdin.isTTY);
}

function conflictRootForPath(relativePath) {
  if (relativePath.startsWith(".agents/")) return ".agents";
  if (relativePath.startsWith(".claude/")) return ".claude";
  if (relativePath.startsWith(".github/")) return ".github";
  if (relativePath.startsWith(".cursor/")) return ".cursor";
  if (relativePath.startsWith(".amazonq/")) return ".amazonq";
  if (relativePath.startsWith(".junie/")) return ".junie";
  if (relativePath.startsWith(".windsurf/") || relativePath === ".windsurfrules") return ".windsurf";
  if (relativePath.startsWith(".clinerules/") || relativePath === ".clinerules") return ".clinerules";
  if (relativePath.startsWith(".roo/") || relativePath === ".roorules") return ".roo";
  if (relativePath.startsWith(".continue/")) return ".continue";
  if (relativePath.startsWith("docs/")) return "docs";
  return ROOT_LABEL;
}

function buildConflictGroupMetadata(relativePath) {
  const skillMatch = relativePath.match(/^(\.(?:agents|claude|github))\/skills\/([^/]+)\//);
  if (skillMatch) {
    return {
      kind: "skill",
      key: `skill:${skillMatch[2]}`,
      label: skillMatch[2],
      root: skillMatch[1],
      sortKey: `0:${skillMatch[2]}`,
    };
  }

  const root = conflictRootForPath(relativePath);
  return {
    kind: "root",
    key: `root:${root}`,
    label: root,
    root,
    sortKey: `1:${root}`,
  };
}

export function groupConflictPaths(relativePaths) {
  const groups = new Map();

  for (const relativePath of [...relativePaths].sort()) {
    const metadata = buildConflictGroupMetadata(relativePath);
    const existing = groups.get(metadata.key);
    if (existing) {
      existing.paths.push(relativePath);
      existing.roots.add(metadata.root);
      continue;
    }

    groups.set(metadata.key, {
      kind: metadata.kind,
      key: metadata.key,
      label: metadata.label,
      roots: new Set([metadata.root]),
      paths: [relativePath],
      sortKey: metadata.sortKey,
    });
  }

  return [...groups.values()]
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map((group) => ({
      kind: group.kind,
      key: group.key,
      label: group.label,
      roots: [...group.roots].sort(),
      paths: group.paths,
    }));
}

function formatConflictGroupSummary(group) {
  if (group.kind === "skill") {
    const roots = group.roots.join(", ");
    const rootLabel = group.roots.length === 1 ? "agent root" : "agent roots";
    const fileLabel = group.paths.length === 1 ? "file" : "files";
    return `Skill \`${group.label}\` in ${roots} (${group.paths.length} ${fileLabel}, ${group.roots.length} ${rootLabel})`;
  }

  const fileLabel = group.paths.length === 1 ? "file" : "files";
  const rootLabel = group.label === ROOT_LABEL ? "Workspace root" : `Root \`${group.label}\``;
  return `${rootLabel} (${group.paths.length} ${fileLabel})`;
}

async function promptDecision(group) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  try {
    return await new Promise((resolvePrompt) => {
      rl.question(
        `  ${formatConflictGroupSummary(group)} already exists and was not written by Agent Jump Start.\n` +
        `    [k] keep existing files in this group (default)\n` +
        `    [o] overwrite all files in this group\n` +
        `    [b] backup then overwrite all files in this group\n` +
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
  const grouped = groupConflictPaths(unmanaged);
  const lines = [
    "",
    "Refused to overwrite pre-existing files that Agent Jump Start does not own:",
    ...grouped.map((group) => `  - ${formatConflictGroupSummary(group)}`),
    "",
    "These files do not carry the Agent Jump Start provenance marker, so they",
    "were most likely authored by you or a teammate. To continue, choose one:",
    "",
    "  --force          overwrite them with the rendered versions",
    "  --backup         save a timestamped copy, then overwrite",
    "  --keep-existing  leave them untouched and skip the rendered versions",
    "",
    "Or remove/rename the files manually and re-run the command.",
    "Tip: run `agent-jump-start absorb --spec <spec> --target <target>` to",
    "integrate these files into the canonical spec before re-running with --force.",
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
 *   interactive sessions prompt per conflict group; non-interactive sessions fail closed.
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
  promptFn = promptDecision,
  isInteractiveFn = isInteractive,
}) {
  const { unmanaged, unreadable } = classifyPreWriteCollisions(generatedFiles, targetRoot);

  if (unreadable.length) {
    logger.warn("Warning: could not classify pre-existing file(s), treating as operator-authored:");
    for (const p of unreadable) logger.warn(`  - ${p}`);
    unmanaged.push(...unreadable);
  }

  const groupedUnmanaged = groupConflictPaths(unmanaged);

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
      for (const group of groupedUnmanaged) logger.log(`  - ${formatConflictGroupSummary(group)}`);
    } else if (conflictPolicy === "backup") {
      logger.log("Backed up then overwrote pre-existing files:");
      for (const group of groupedUnmanaged) {
        const backupsForGroup = res.backedUp.filter((entry) => group.paths.includes(entry.relativePath));
        const backupSummary = backupsForGroup[0]?.backupPath ? ` -> ${backupsForGroup[0].backupPath}` : "";
        logger.log(`  - ${formatConflictGroupSummary(group)}${backupSummary}`);
      }
    } else if (conflictPolicy === "force") {
      logger.log("Overwrote pre-existing operator-authored files (--force):");
      for (const group of groupedUnmanaged) logger.log(`  - ${formatConflictGroupSummary(group)}`);
    }
    return { ...res, blocked: [], effectiveFiles };
  }

  if (assumeNonInteractive || !isInteractiveFn()) {
    logger.error(formatBlockedMessage(unmanaged));
    return { written: [], kept: [], backedUp: [], blocked: unmanaged, effectiveFiles: generatedFiles };
  }

  // Interactive: prompt per conflict group.
  const decisions = {};
  const keptPaths = [];
  logger.log("");
  logger.log("Agent Jump Start found pre-existing files it does not own.");
  logger.log("Choose what to do with each conflict group before any file is written.");
  logger.log("");
  for (const group of groupedUnmanaged) {
    const choice = await promptFn(group);
    for (const relativePath of group.paths) {
      decisions[relativePath] = choice;
      if (choice === "keep") keptPaths.push(relativePath);
    }
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
