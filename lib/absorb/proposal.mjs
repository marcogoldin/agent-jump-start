// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readJsonYaml } from "../utils.mjs";
import { normalizeValidationCommand } from "../inference.mjs";

function normalizeRuleValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveAreaChoice(decision, area) {
  const override = decision?.areaOverrides?.[area];
  if (override && override !== "inherit") {
    return override;
  }
  return decision?.fileChoice ?? "skip";
}

function mapCandidateByPath(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    map.set(candidate.source.relativePath, candidate);
  }
  return map;
}

function detectAreaConflicts(area, decisionsByPath, candidatesByPath) {
  const issues = [];
  const primaryPaths = [];

  for (const [relativePath, decision] of decisionsByPath.entries()) {
    if (!candidatesByPath.has(relativePath)) continue;
    const choice = resolveAreaChoice(decision, area);
    if (choice === "primary") primaryPaths.push(relativePath);
    if (choice === "merge" && !decision.mergeInto) {
      issues.push({
        area,
        type: "merge-without-target",
        path: relativePath,
        message: `${relativePath} is set to merge for ${area} but mergeInto is missing.`,
      });
    }
  }

  if (primaryPaths.length > 1) {
    issues.push({
      area,
      type: "multiple-primary",
      paths: primaryPaths,
      message: `Multiple primary sources selected for ${area}: ${primaryPaths.join(", ")}`,
    });
  }

  const primarySet = new Set(primaryPaths);
  for (const [relativePath, decision] of decisionsByPath.entries()) {
    const choice = resolveAreaChoice(decision, area);
    if (choice !== "merge") continue;
    if (!decision.mergeInto) continue;
    if (!primarySet.has(decision.mergeInto)) {
      issues.push({
        area,
        type: "merge-target-not-primary",
        path: relativePath,
        mergeInto: decision.mergeInto,
        message: `${relativePath} merges into ${decision.mergeInto} for ${area}, but target is not primary.`,
      });
    }
  }

  return issues;
}

function appendUniqueRules(targetRules, incomingRules) {
  const seen = new Set(targetRules.map((rule) => normalizeRuleValue(rule)));
  for (const rule of incomingRules) {
    const normalized = normalizeRuleValue(rule);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    targetRules.push(rule);
  }
  return targetRules;
}

function buildValidationPatch(candidatesByPath, decisionsByPath) {
  const commands = [];
  const seen = new Set();

  for (const [relativePath, decision] of decisionsByPath.entries()) {
    const choice = resolveAreaChoice(decision, "validation");
    if (choice === "skip") continue;
    const candidate = candidatesByPath.get(relativePath);
    if (!candidate) continue;
    for (const item of candidate.validation ?? []) {
      const normalized = normalizeValidationCommand(item.value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      commands.push(item.value);
    }
  }

  return commands;
}

function buildSectionsPatch(candidatesByPath, decisionsByPath) {
  const sectionMap = new Map();

  for (const [relativePath, decision] of decisionsByPath.entries()) {
    const choice = resolveAreaChoice(decision, "sections");
    if (choice === "skip") continue;
    const candidate = candidatesByPath.get(relativePath);
    if (!candidate) continue;
    for (const section of candidate.sections ?? []) {
      const key = section.title.trim();
      if (!key) continue;
      if (!sectionMap.has(key)) {
        sectionMap.set(key, {
          title: section.title,
          rules: [],
        });
      }
      const current = sectionMap.get(key);
      appendUniqueRules(current.rules, (section.rules ?? []).map((rule) => rule.value));
    }
  }

  return [...sectionMap.values()];
}

function makeDiff(beforeLeaf, afterLeaf) {
  const diff = [];
  const beforeValidation = beforeLeaf.workspaceInstructions?.validation ?? [];
  const afterValidation = afterLeaf.workspaceInstructions?.validation ?? [];
  if (JSON.stringify(beforeValidation) !== JSON.stringify(afterValidation)) {
    diff.push({
      path: "workspaceInstructions.validation",
      kind: beforeValidation.length === 0 ? "add" : "replace",
      before: beforeValidation,
      after: afterValidation,
    });
  }

  const beforeSections = beforeLeaf.workspaceInstructions?.sections ?? [];
  const afterSections = afterLeaf.workspaceInstructions?.sections ?? [];
  if (JSON.stringify(beforeSections) !== JSON.stringify(afterSections)) {
    diff.push({
      path: "workspaceInstructions.sections",
      kind: beforeSections.length === 0 ? "add" : "append",
      before: beforeSections,
      after: afterSections,
    });
  }
  return diff;
}

export function makeDefaultAbsorbDecisions(candidates) {
  const decisions = [];
  const primary = candidates.find((entry) =>
    entry.source.classification === "unmanaged" &&
    ((entry.sections?.length ?? 0) > 0 || (entry.validation?.length ?? 0) > 0));

  for (const candidate of candidates) {
    if (candidate.source.classification === "unreadable") {
      decisions.push({
        relativePath: candidate.source.relativePath,
        fileChoice: "skip",
        areaOverrides: { validation: "inherit", sections: "inherit" },
      });
      continue;
    }

    if (!primary || candidate.source.relativePath === primary.source.relativePath) {
      decisions.push({
        relativePath: candidate.source.relativePath,
        fileChoice: "primary",
        areaOverrides: { validation: "inherit", sections: "inherit" },
      });
    } else {
      decisions.push({
        relativePath: candidate.source.relativePath,
        fileChoice: "merge",
        mergeInto: primary.source.relativePath,
        areaOverrides: { validation: "inherit", sections: "inherit" },
      });
    }
  }

  return decisions;
}

export function loadSelectionFile(filePath) {
  const data = readJsonYaml(filePath);
  const decisions = data.decisions ?? [];
  return { data, decisions };
}

export function validateSelection(selectionDecisions, candidates) {
  const candidatePaths = new Set(candidates.map((candidate) => candidate.source.relativePath));
  const selectedPaths = new Set(selectionDecisions.map((entry) => entry.path ?? entry.relativePath));

  const missing = [...candidatePaths].filter((path) => !selectedPaths.has(path));
  const unknown = [...selectedPaths].filter((path) => !candidatePaths.has(path));
  return { missing, unknown };
}

/**
 * Build a spec proposal from absorb decisions.
 *
 * v1 scope: workspaceInstructions.sections + workspaceInstructions.validation.
 */
export function buildAbsorbProposal(meta, candidates, decisionsInput) {
  const decisions = decisionsInput.map((entry) => ({
    relativePath: entry.relativePath ?? entry.path,
    fileChoice: entry.fileChoice ?? entry.choice,
    mergeInto: entry.mergeInto,
    areaOverrides: {
      validation: entry.areaOverrides?.validation ?? "inherit",
      sections: entry.areaOverrides?.sections ?? "inherit",
    },
  }));

  const candidatesByPath = mapCandidateByPath(candidates);
  const decisionsByPath = new Map(decisions.map((decision) => [decision.relativePath, decision]));

  const conflicts = [
    ...detectAreaConflicts("validation", decisionsByPath, candidatesByPath),
    ...detectAreaConflicts("sections", decisionsByPath, candidatesByPath),
  ];

  const patchedLeafSpec = structuredClone(meta.leafSpec);
  patchedLeafSpec.workspaceInstructions ??= {};
  patchedLeafSpec.workspaceInstructions.sections ??= [];
  patchedLeafSpec.workspaceInstructions.validation ??= [];

  const validationPatch = buildValidationPatch(candidatesByPath, decisionsByPath);
  const existingValidation = patchedLeafSpec.workspaceInstructions.validation ?? [];
  const validationSeen = new Set(existingValidation.map((entry) => normalizeValidationCommand(entry)));
  for (const command of validationPatch) {
    const normalized = normalizeValidationCommand(command);
    if (validationSeen.has(normalized)) continue;
    validationSeen.add(normalized);
    existingValidation.push(command);
  }
  patchedLeafSpec.workspaceInstructions.validation = existingValidation;

  const sectionsPatch = buildSectionsPatch(candidatesByPath, decisionsByPath);
  const existingSections = patchedLeafSpec.workspaceInstructions.sections ?? [];
  const sectionMap = new Map(existingSections.map((section) => [section.title, structuredClone(section)]));
  for (const section of sectionsPatch) {
    if (!sectionMap.has(section.title)) {
      sectionMap.set(section.title, { title: section.title, rules: [] });
    }
    const target = sectionMap.get(section.title);
    target.rules = appendUniqueRules(target.rules ?? [], section.rules ?? []);
  }
  patchedLeafSpec.workspaceInstructions.sections = [...sectionMap.values()];

  const diff = makeDiff(meta.leafSpec, patchedLeafSpec);

  return {
    patchedLeafSpec,
    diff,
    diagnostics: {
      sourcesUsed: decisions.filter((entry) => entry.fileChoice !== "skip").map((entry) => entry.relativePath),
      conflicts,
      extractorNotes: candidates.flatMap((candidate) =>
        (candidate.extractorNotes ?? []).map((note) => `${candidate.source.relativePath}: ${note}`)),
    },
  };
}
