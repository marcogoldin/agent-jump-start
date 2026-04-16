// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { discoverAbsorbSources } from "../absorb/discovery.mjs";
import { extractAbsorbCandidates } from "../absorb/extraction.mjs";
import {
  buildAbsorbProposal,
  loadSelectionFile,
  makeDefaultAbsorbDecisions,
  validateSelection,
} from "../absorb/proposal.mjs";
import { mergeSpecLayers, resolveLayeredSpecWithMeta } from "../merging.mjs";
import { runAbsorbReview } from "../interactive.mjs";
import { validateSpec } from "../validation.mjs";
import { readJsonYaml, stringifyJsonYaml, ensureDirectory } from "../utils.mjs";
import { displayPath } from "./helpers.mjs";

function isInteractiveTty() {
  return Boolean(process.stdin.isTTY);
}

function formatBootstrapRecipe(specPath, targetRoot) {
  const specDisplay = specPath.replaceAll("\\", "/");
  const targetDisplay = targetRoot.replaceAll("\\", "/");
  return [
    "Absorb requires an existing canonical spec.",
    "Recommended flow:",
    `  1. agent-jump-start init --target ${targetDisplay} --non-interactive --keep-existing`,
    `  2. agent-jump-start absorb --spec ${specDisplay} --target ${targetDisplay}`,
    `  3. agent-jump-start sync --spec ${specDisplay} --target ${targetDisplay} --force`,
  ].join("\n");
}

function summarizeCandidate(candidate) {
  const rules = (candidate.sections ?? []).reduce((acc, section) => acc + (section.rules?.length ?? 0), 0);
  return {
    path: candidate.source.relativePath,
    tool: candidate.source.toolOfOrigin,
    scope: candidate.source.scope,
    classification: candidate.source.classification,
    confidence: candidate.overallConfidence,
    ruleCount: rules,
    validationCount: candidate.validation?.length ?? 0,
    notes: candidate.extractorNotes ?? [],
  };
}

function makeProposalArtifact(specPath, targetRoot, candidates, decisions, proposal) {
  return {
    version: 1,
    target: displayPath(resolve(specPath), targetRoot),
    sources: candidates.map((candidate) => summarizeCandidate(candidate)),
    decisions: decisions.map((entry) => ({
      path: entry.relativePath ?? entry.path,
      choice: entry.fileChoice ?? entry.choice,
      mergeInto: entry.mergeInto ?? null,
      areaOverrides: entry.areaOverrides ?? { validation: "inherit", sections: "inherit" },
    })),
    proposedPatch: {
      workspaceInstructions: {
        sections: proposal.patchedLeafSpec.workspaceInstructions?.sections ?? [],
        validation: proposal.patchedLeafSpec.workspaceInstructions?.validation ?? [],
      },
    },
    diagnostics: proposal.diagnostics,
    diff: proposal.diff,
  };
}

function printProposalPreview(proposal) {
  console.log("\nProposed spec changes (preview):\n");
  if (proposal.diff.length === 0) {
    console.log("  No changes detected from selected absorb decisions.");
    return;
  }
  for (const entry of proposal.diff) {
    console.log(`  ${entry.path}: ${entry.kind}`);
    if (entry.path === "workspaceInstructions.validation") {
      const added = (entry.after ?? []).filter((value) => !(entry.before ?? []).includes(value));
      for (const cmd of added.slice(0, 8)) {
        console.log(`    + ${cmd}`);
      }
    }
    if (entry.path === "workspaceInstructions.sections") {
      console.log(`    sections after merge: ${(entry.after ?? []).length}`);
    }
  }
}

function buildMergedSpecForValidation(meta, patchedLeafSpec) {
  if (!meta.isLayered) return patchedLeafSpec;

  const chainWithoutLeaf = meta.chain.slice(0, -1);
  let merged = structuredClone(chainWithoutLeaf[0].spec);
  delete merged.extends;
  for (const layer of chainWithoutLeaf.slice(1)) {
    const overlay = structuredClone(layer.spec);
    delete overlay.extends;
    merged = mergeSpecLayers(merged, overlay);
  }
  return mergeSpecLayers(merged, patchedLeafSpec);
}

async function promptConflictResolution(conflicts, decisions) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const decisionsByPath = new Map(decisions.map((entry) => [entry.relativePath ?? entry.path, entry]));

  function ask(question) {
    return new Promise((resolveAnswer) => rl.question(question, (value) => resolveAnswer(String(value ?? "").trim())));
  }

  try {
    for (const conflict of conflicts) {
      if (conflict.type !== "multiple-primary") continue;
      console.log(`\nConflict for ${conflict.area}: multiple primary sources selected.`);
      conflict.paths.forEach((path, index) => console.log(`  [${index + 1}] ${path}`));
      const answer = await ask("Choose winner [number], [b] keep both (merge), [s] skip area: ");
      const normalized = answer.toLowerCase();
      const winnerIndex = Number.parseInt(answer, 10) - 1;
      if (normalized === "s") {
        for (const path of conflict.paths) {
          const decision = decisionsByPath.get(path);
          decision.areaOverrides ??= {};
          decision.areaOverrides[conflict.area] = "skip";
        }
        continue;
      }
      const winner = conflict.paths[winnerIndex] ?? conflict.paths[0];
      for (const path of conflict.paths) {
        const decision = decisionsByPath.get(path);
        decision.areaOverrides ??= {};
        if (path === winner) {
          decision.areaOverrides[conflict.area] = "primary";
        } else if (normalized === "b") {
          decision.areaOverrides[conflict.area] = "merge";
          decision.mergeInto = winner;
        } else {
          decision.areaOverrides[conflict.area] = "skip";
        }
      }
    }
  } finally {
    rl.close();
  }
}

function printNextCommand(specPath, targetRoot) {
  const specRel = displayPath(resolve(specPath), targetRoot);
  const targetRel = displayPath(resolve(targetRoot), targetRoot);
  console.log(`\nNext: node scripts/agent-jump-start.mjs sync --spec ${specRel} --target ${targetRel} --force`);
  console.log("(Use --backup if you want timestamped backups before overwrite.)");
}

export async function handleAbsorb(options) {
  const targetRoot = resolve(options.target ?? ".");
  const specPath = resolve(options.spec ?? join("docs", "agent-jump-start", "canonical-spec.yaml"));
  const hasDryRun = Boolean(options["dry-run"]);
  const hasApply = Boolean(options.apply);
  const hasSelection = Boolean(options.selection);

  if (!hasDryRun && !hasApply && !isInteractiveTty()) {
    console.error("absorb needs an interactive terminal or an explicit --dry-run / --apply mode.");
    process.exit(2);
  }
  if (hasApply && !hasSelection) {
    throw new Error("absorb --apply requires --selection. Generate one with absorb --dry-run --output <file>, edit decisions, then re-run.");
  }
  if (!existsSync(specPath)) {
    console.error(formatBootstrapRecipe(displayPath(specPath, targetRoot), displayPath(targetRoot, targetRoot)));
    process.exit(2);
  }

  const layerMeta = resolveLayeredSpecWithMeta(specPath);
  validateSpec(layerMeta.merged, specPath, {
    layerChain: layerMeta.chain,
    leafPath: layerMeta.leafPath,
  });

  const discovered = discoverAbsorbSources(targetRoot);
  const absorbable = discovered.filter((entry) =>
    entry.classification === "unmanaged" || entry.classification === "unreadable");
  const candidates = extractAbsorbCandidates(absorbable);

  if (candidates.length === 0) {
    console.log("Nothing to absorb: no unmanaged pre-existing agent instruction files were found.");
    return;
  }

  let decisions;
  if (hasApply) {
    const selection = loadSelectionFile(resolve(options.selection));
    const validation = validateSelection(selection.decisions, candidates);
    if (validation.missing.length > 0 || validation.unknown.length > 0) {
      const lines = [];
      if (validation.missing.length > 0) {
        lines.push(`Missing decisions for: ${validation.missing.join(", ")}`);
      }
      if (validation.unknown.length > 0) {
        lines.push(`Unknown decision paths: ${validation.unknown.join(", ")}`);
      }
      throw new Error(`Invalid absorb selection file.\n${lines.join("\n")}`);
    }
    decisions = selection.decisions.map((entry) => ({
      relativePath: entry.path ?? entry.relativePath,
      fileChoice: entry.choice ?? entry.fileChoice,
      mergeInto: entry.mergeInto,
      areaOverrides: entry.areaOverrides ?? { validation: "inherit", sections: "inherit" },
    }));
  } else if (hasDryRun) {
    decisions = makeDefaultAbsorbDecisions(candidates);
  } else {
    const review = await runAbsorbReview(candidates);
    if (review.cancelled) {
      console.log("absorb cancelled. No changes were written.");
      return;
    }
    decisions = review.decisions;
  }

  let proposal = buildAbsorbProposal(layerMeta, candidates, decisions);
  if (proposal.diagnostics.conflicts.length > 0 && !hasApply && !hasDryRun && isInteractiveTty()) {
    await promptConflictResolution(proposal.diagnostics.conflicts, decisions);
    proposal = buildAbsorbProposal(layerMeta, candidates, decisions);
  }
  if (proposal.diagnostics.conflicts.length > 0) {
    throw new Error(
      "Absorb decisions contain unresolved conflicts:\n" +
      proposal.diagnostics.conflicts.map((entry) => `- ${entry.message}`).join("\n"),
    );
  }

  const mergedForValidation = buildMergedSpecForValidation(layerMeta, proposal.patchedLeafSpec);
  validateSpec(mergedForValidation, specPath, {
    layerChain: layerMeta.chain,
    leafPath: layerMeta.leafPath,
  });

  const artifact = makeProposalArtifact(specPath, targetRoot, candidates, decisions, proposal);
  if (hasDryRun) {
    const serialized = stringifyJsonYaml(artifact);
    if (options.output) {
      const outputPath = resolve(options.output);
      ensureDirectory(outputPath);
      writeFileSync(outputPath, serialized, "utf8");
      console.log(`Absorb dry-run proposal written to: ${displayPath(outputPath, process.cwd())}`);
    } else {
      process.stdout.write(serialized);
    }
    return;
  }

  if (!hasApply) {
    printProposalPreview(proposal);
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    const answer = await new Promise((resolveAnswer) =>
      rl.question("\nWrite spec patch? [y/N]: ", (value) => resolveAnswer(String(value ?? "").trim().toLowerCase())));
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("absorb aborted. No changes were written.");
      return;
    }
  }

  const rawLeaf = readJsonYaml(layerMeta.leafPath);
  const nextLeaf = {
    ...rawLeaf,
    workspaceInstructions: proposal.patchedLeafSpec.workspaceInstructions,
  };
  writeFileSync(layerMeta.leafPath, stringifyJsonYaml(nextLeaf), "utf8");
  console.log(`Wrote ${displayPath(layerMeta.leafPath, process.cwd())}`);
  printNextCommand(specPath, targetRoot);
}
