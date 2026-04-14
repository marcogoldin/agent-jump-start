// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Inference commands: infer, infer-overlay, doctor.
//
// These commands use deep introspection + inference to produce provenance-
// labeled suggestions, schema-valid overlays, and spec diagnostics.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertRequired, ensureDirectory, stringifyJsonYaml } from "../utils.mjs";
import { validateSpec } from "../validation.mjs";
import { deepIntrospect } from "../introspection.mjs";
import { inferValidation, inferSections, inferChecklist, buildOverlayFromEvidence } from "../inference.mjs";
import { diagnoseSpec } from "../doctor.mjs";
import { displayPath, resolveAndValidateSpec } from "./helpers.mjs";

/**
 * Handle the `infer` command.
 *
 * Runs deep introspection on the target directory and displays (or exports)
 * provenance-labeled validation commands, sections, and checklist items.
 *
 * @param {object} options — parsed CLI options
 */
export function handleInfer(options) {
  assertRequired(options, "target", "infer");
  const targetRoot = resolve(options.target);

  const evidence = deepIntrospect(targetRoot);
  const sectionFilter = options.section ?? null;

  const validation = (!sectionFilter || sectionFilter === "validation") ? inferValidation(evidence) : [];
  const sections = (!sectionFilter || sectionFilter === "rules") ? inferSections(evidence) : [];
  const checklist = (!sectionFilter || sectionFilter === "checklist") ? inferChecklist(evidence) : null;

  // Determine output format
  const useJson = options.format === "json" || (options.output && options.format !== "text");

  if (useJson) {
    const result = {};
    if (validation.length > 0) result.validation = validation;
    if (sections.length > 0) result.sections = sections;
    if (checklist && (checklist.items.length > 0 || checklist.quickSignals.length > 0 || checklist.redFlags.length > 0)) {
      result.checklist = checklist;
    }

    const jsonOutput = JSON.stringify(result, null, 2);
    if (options.output) {
      const outputPath = resolve(options.output);
      ensureDirectory(outputPath);
      writeFileSync(outputPath, jsonOutput + "\n", "utf8");
      console.log(`Inference report written to: ${displayPath(outputPath)}`);
    } else {
      process.stdout.write(jsonOutput + "\n");
    }
  } else {
    // Text output for human review
    if (validation.length > 0) {
      console.log("Validation commands:");
      for (const v of validation) {
        console.log(`  [${v.provenance}] ${v.value} (from ${v.source})`);
      }
      console.log("");
    }
    if (sections.length > 0) {
      console.log("Workspace sections:");
      for (const s of sections) {
        console.log(`  ${s.title}:`);
        for (const r of s.rules) {
          console.log(`    [${r.provenance}] ${r.value}`);
        }
      }
      console.log("");
    }
    if (checklist && (checklist.items.length > 0 || checklist.quickSignals.length > 0 || checklist.redFlags.length > 0)) {
      console.log("Review checklist:");
      if (checklist.items.length > 0) {
        console.log("  Items:");
        for (const item of checklist.items) {
          console.log(`    [${item.provenance}] ${item.value}`);
        }
      }
      if (checklist.quickSignals.length > 0) {
        console.log("  Quick signals:");
        for (const qs of checklist.quickSignals) {
          console.log(`    [${qs.provenance}] ${qs.value}`);
        }
      }
      if (checklist.redFlags.length > 0) {
        console.log("  Red flags:");
        for (const rf of checklist.redFlags) {
          console.log(`    [${rf.provenance}] ${rf.value}`);
        }
      }
      console.log("");
    }

    const totalItems = validation.length + sections.length + (checklist?.items.length ?? 0);
    if (totalItems === 0) {
      console.log("No suggestions inferred from this project directory.");
    } else {
      console.log(`Found ${validation.length} validation command(s), ${sections.length} section(s), ${checklist?.items.length ?? 0} checklist item(s).`);
      console.log("Use --format json or --output <path> to export a structured inference report.");
    }
  }
}

/**
 * Handle the `doctor` command.
 *
 * Diagnoses spec quality and optionally suggests improvements based on
 * inference evidence from the target directory.
 *
 * @param {object} options — parsed CLI options
 */
export function handleDoctor(options) {
  assertRequired(options, "spec", "doctor");
  const { merged: spec } = resolveAndValidateSpec(options.spec);

  const findings = diagnoseSpec(spec);
  const warnings = findings.filter((f) => f.severity === "warning");
  const infos = findings.filter((f) => f.severity === "info");

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const f of warnings) {
      console.log(`  [warning] ${f.area}: ${f.message}`);
    }
    console.log("");
  }
  if (infos.length > 0) {
    console.log("Suggestions:");
    for (const f of infos) {
      console.log(`  [info] ${f.area}: ${f.message}`);
    }
    console.log("");
  }

  // --suggest: run inference and show suggestions alongside warnings
  if (options.suggest && options.target) {
    const targetRoot = resolve(options.target);
    const evidence = deepIntrospect(targetRoot);

    const hasGenericValidation = warnings.some((w) => w.area === "workspaceInstructions.validation");
    const hasPlaceholderSections = infos.some((i) => i.area === "workspaceInstructions.sections");

    if (hasGenericValidation) {
      const validation = inferValidation(evidence);
      if (validation.length > 0) {
        console.log("Suggested validation commands (from repo evidence):");
        for (const v of validation) {
          console.log(`  [${v.provenance}] ${v.value} (from ${v.source})`);
        }
        console.log("");
      }
    }

    if (hasPlaceholderSections) {
      const sections = inferSections(evidence);
      if (sections.length > 0) {
        console.log("Suggested workspace sections (from repo evidence):");
        for (const s of sections) {
          console.log(`  ${s.title}: ${s.rules.length} rule(s)`);
        }
        console.log("");
      }
    }
  }

  if (findings.length === 0) {
    console.log("No issues found. The spec looks ready for production use.");
  } else {
    console.log(`Found ${warnings.length} warning(s) and ${infos.length} suggestion(s).`);
    if (warnings.length > 0) {
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------------------
// infer-overlay — produce a schema-valid overlay from inference evidence
// ---------------------------------------------------------------------------

/**
 * Handle the `infer-overlay` command.
 *
 * Runs deep introspection on the target directory and produces a schema-valid
 * overlay spec (suitable for use with `extends`).  Unlike `infer`, which
 * emits a provenance-labeled diagnostic report, `infer-overlay` strips
 * provenance and reshapes the evidence to match the canonical JSON Schema.
 *
 * Output is YAML when the file extension is `.yaml`/`.yml`, JSON otherwise.
 * When no `--output` is given, JSON is written to stdout.
 *
 * @param {object} options — parsed CLI options
 * @param {string} options.target — directory to introspect
 * @param {string} [options.output] — file path for the overlay
 * @param {string} [options.base] — relative path to populate `extends`
 * @param {string} [options.section] — restrict to "validation", "rules", or "checklist"
 */
export function handleInferOverlay(options) {
  assertRequired(options, "target", "infer-overlay");
  const targetRoot = resolve(options.target);

  const evidence = deepIntrospect(targetRoot);
  const overlay = buildOverlayFromEvidence(evidence, {
    base: options.base ?? null,
    section: options.section ?? null,
  });

  // Validazione opzionale: gli overlay con `extends` sono partial, quindi
  // la validazione schema puo' fallire per campi mancanti che verranno
  // forniti dalla base.  Validiamo solo overlay completi (senza extends).
  if (!overlay.extends) {
    try {
      validateSpec(overlay, "infer-overlay (generated)");
    } catch {
      // L'overlay partial non deve bloccare l'output: logghiamo un warning
      // e lasciamo procedere.  L'utente puo' validare dopo il merge.
      console.error("Warning: generated overlay does not pass schema validation on its own.");
      console.error("This is expected for partial overlays — validate after merging with the base spec.");
    }
  }

  if (options.output) {
    const outputPath = resolve(options.output);
    ensureDirectory(outputPath);
    const content = stringifyJsonYaml(overlay);
    writeFileSync(outputPath, content, "utf8");
    console.log(`Overlay written to: ${displayPath(outputPath)}`);
  } else {
    process.stdout.write(JSON.stringify(overlay, null, 2) + "\n");
  }
}
