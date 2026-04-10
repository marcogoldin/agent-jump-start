#!/usr/bin/env node
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { TOOL_VERSION, SUPPORTED_AGENTS, AGENT_COUNT } from "../lib/constants.mjs";
import { parseArgs, assertRequired, readJsonYaml, stringifyJsonYaml, deepMerge, ensureDirectory } from "../lib/utils.mjs";
import { validateSpec, validateSkill, validateSkillMdFrontmatter } from "../lib/validation.mjs";
import { renderGeneratedFiles } from "../lib/renderers.mjs";
import { writeGeneratedFiles, checkGeneratedFiles, cleanStaleFiles, cleanDirectoryIfExists, discoverPackageRoot, listAvailableProfiles, listManagedFiles } from "../lib/files.mjs";
import { readExternalSkill, readSkillMdFile, readSkillDirectory, exportSkillPackage, parseSkillMdFrontmatter, resolveSkillImportSource } from "../lib/skills.mjs";
import { CANONICAL_SPEC_SCHEMA } from "../lib/schema.mjs";
import { runGuidedSetup } from "../lib/interactive.mjs";
import { diagnoseSpec } from "../lib/doctor.mjs";
import { defaultLockfilePath, makeProvenanceRecord, readLockfile, writeLockfileEntries } from "../lib/lockfile.mjs";
import { makeLocalSourceInfo } from "../lib/source-info.mjs";
import { refreshSkills } from "../lib/skills-updater.mjs";
import { resolveLayeredSpec, resolveLayeredSpecWithMeta } from "../lib/merging.mjs";
import { discoverUnmanagedSkills, KNOWN_SKILL_DIRS } from "../lib/intake.mjs";
import { deepIntrospect } from "../lib/introspection.mjs";
import { inferValidation, inferSections, inferChecklist } from "../lib/inference.mjs";

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function usage() {
  console.log(`Agent Jump Start v${TOOL_VERSION}

Commands:
  init           [--guided] [--profile <path>] [--target <path>]
  bootstrap      --base <path> [--profile <path>] [--output <path>]
  sync           --spec <path> [--target <path>]
  infer          --target <path> [--output <path>] [--section <name>] [--format json|text]
  doctor         --spec <path> [--suggest --target <path>]
  render         --spec <path> [--target <path>] [--clean]
  check          --spec <path> [--target <path>]
  validate       --spec <path>
  validate-skill <path>   (SKILL.md file or skill directory)
  intake         --spec <path> [--target <path>] [--import] [--replace]
  import-skill   --spec <path> --skill <path> [--replace]
  add-skill      <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]
  export-skill   --spec <path> --slug <slug> --output <path>
  export-schema  [--output <path>]
  update-skills  --spec <path> [--skill <slug>] [--dry-run]
  list-agents
  list-profiles

Options:
  --help      Show this help message
  --version   Show version number

Examples:
  npx @marcogoldin/agent-jump-start@latest init \\
    --profile specs/profiles/react-vite-mui.profile.yaml

  node scripts/agent-jump-start.mjs bootstrap \\
    --base specs/base-spec.yaml \\
    --profile specs/profiles/react-vite-mui.profile.yaml \\
    --output canonical-spec.yaml

  node scripts/agent-jump-start.mjs sync \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs infer \\
    --target .

  node scripts/agent-jump-start.mjs infer \\
    --target . --output inferred-report.json --format json

  node scripts/agent-jump-start.mjs doctor \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs doctor \\
    --spec canonical-spec.yaml --suggest --target .

  node scripts/agent-jump-start.mjs render \\
    --spec canonical-spec.yaml --target . --clean

  node scripts/agent-jump-start.mjs check \\
    --spec canonical-spec.yaml --target .

  node scripts/agent-jump-start.mjs validate \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs validate-skill \\
    path/to/skills/python-pro

  node scripts/agent-jump-start.mjs intake \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs intake \\
    --spec canonical-spec.yaml --import

  node scripts/agent-jump-start.mjs import-skill \\
    --spec canonical-spec.yaml \\
    --skill path/to/skills/python-pro

  node scripts/agent-jump-start.mjs add-skill \\
    github:Jeffallan/claude-skills/tree/main/skills/python-pro \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs add-skill \\
    skills:vercel-labs/agent-skills \\
    --skill web-design-guidelines \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs export-skill \\
    --spec canonical-spec.yaml --slug react-best-practices \\
    --output ./exported-skills/react-best-practices

  node scripts/agent-jump-start.mjs export-schema

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml --dry-run

  node scripts/agent-jump-start.mjs update-skills \\
    --spec canonical-spec.yaml --skill python-pro

  node scripts/agent-jump-start.mjs list-agents
  node scripts/agent-jump-start.mjs list-profiles

Supported Agents:
  Claude Code          CLAUDE.md, .claude/skills/*/SKILL.md
  GitHub Copilot       .github/copilot-instructions.md, .github/skills/*/SKILL.md
  GitHub Agents        AGENTS.md, .agents/skills/*/SKILL.md
  Cursor               .cursor/rules/agent-instructions.mdc
  Windsurf (Codeium)   .windsurfrules
  Cline                .clinerules
  Roo Code             .roo/rules/agent-instructions.md
  Continue.dev         .continue/rules/agent-instructions.md
  Aider                CONVENTIONS.md
`);
}

function displayPath(filePath, relativeTo = process.cwd()) {
  const relativePath = relative(relativeTo, filePath);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")) {
    return relativePath.replaceAll("\\", "/");
  }
  return filePath;
}

function summarizeDiscoveries(discoveries) {
  return {
    unmanaged: discoveries.filter((entry) => entry.status === "unmanaged"),
    managed: discoveries.filter((entry) => entry.status === "managed"),
    invalid: discoveries.filter((entry) => entry.status === "invalid"),
  };
}

function printIntakeReport(discoveries, targetRoot) {
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

function printSyncIntakeAdvisory(discoveries, targetRoot, specArg, targetArg) {
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

function makeLocalSourceInfoForPath(sourcePathInput) {
  const relativePath = relative(process.cwd(), resolve(sourcePathInput));
  const sourceLabel = relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")
    ? relativePath.replaceAll("\\", "/")
    : sourcePathInput;
  return makeLocalSourceInfo(sourceLabel);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--version")) {
    console.log(`Agent Jump Start v${TOOL_VERSION}`);
    process.exit(0);
  }

  if (args.includes("--help") || args.length === 0) {
    usage();
    process.exit(0);
  }

  const { command, options } = parseArgs(args);

  function importSkillsIntoSpec(specPathInput, sourcePathInput, replaceExisting = false, sourceInfo = null, importOptions = {}) {
    const quiet = Boolean(importOptions.quiet);
    const specPath = resolve(specPathInput);
    if (!existsSync(specPath)) {
      throw new Error(`Canonical spec not found: ${specPath}. Run bootstrap first.`);
    }

    // Resolve the full layer chain for collision detection (includes
    // inherited skills from base layers).  Read the raw leaf file
    // separately — that is the only file we write back to.
    const { merged: resolvedSpec } = resolveLayeredSpecWithMeta(specPathInput);
    const resolvedSkills = resolvedSpec.skills ?? [];

    const rawLeaf = readJsonYaml(specPathInput);
    if (!Array.isArray(rawLeaf.skills)) {
      rawLeaf.skills = [];
    }

    const importedSkills = readExternalSkill(sourcePathInput);

    let added = 0;
    let replaced = 0;
    const lockEntries = [];
    for (const skill of importedSkills) {
      validateSkill(skill, sourcePathInput);

      // Check existence against the resolved (effective) spec so we
      // detect collisions with skills inherited from base layers.
      const existsInResolved = resolvedSkills.some((s) => s.slug === skill.slug);
      // Also check the leaf to find the correct index for replacement.
      const leafIndex = rawLeaf.skills.findIndex((s) => s.slug === skill.slug);

      if (existsInResolved) {
        if (replaceExisting) {
          if (leafIndex >= 0) {
            rawLeaf.skills[leafIndex] = skill;
          } else {
            // Skill lives in a base layer — materialize the override
            // into the leaf so the base file is never touched.
            rawLeaf.skills.push(skill);
          }
          replaced += 1;
          if (!quiet) {
            console.log(`  Replaced: ${skill.slug} (v${skill.version})`);
          }
          if (sourceInfo) {
            lockEntries.push(makeProvenanceRecord(skill, sourcePathInput, sourceInfo, specPathInput));
          }
        } else {
          if (!quiet) {
            console.log(`  Skipped:  ${skill.slug} (already exists, use --replace to overwrite)`);
          }
          continue;
        }
      } else {
        if (!skill.author) {
          skill.author = "Imported";
        }
        rawLeaf.skills.push(skill);
        added += 1;
        if (!quiet) {
          console.log(`  Added:    ${skill.slug} (v${skill.version})`);
        }
        if (sourceInfo) {
          lockEntries.push(makeProvenanceRecord(skill, sourcePathInput, sourceInfo, specPathInput));
        }
      }
    }

    // Write back only the leaf file — preserves `extends` and all
    // other fields that belong to the leaf layer.
    writeFileSync(specPath, stringifyJsonYaml(rawLeaf), "utf8");
    if (lockEntries.length > 0) {
      const lockfilePath = defaultLockfilePath(specPathInput);
      writeLockfileEntries(lockfilePath, lockEntries);
      if (!quiet) {
        console.log(`Lockfile updated: ${relative(process.cwd(), lockfilePath) || lockfilePath}`);
      }
    }
    if (!quiet) {
      console.log(`\nImport complete: ${added} added, ${replaced} replaced in ${specPathInput}`);
      console.log(`Total skills in leaf spec: ${rawLeaf.skills.length}`);
      console.log(`\nRun 'sync' to regenerate instruction files for all ${AGENT_COUNT} agents.`);
    }
    return {
      added,
      replaced,
      totalSkillsInLeaf: rawLeaf.skills.length,
    };
  }

  // -------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------
  if (command === "init") {
    const packageRoot = discoverPackageRoot();
    const targetRoot = resolve(options.target ?? ".");
    const ajsDir = join(targetRoot, "docs", "agent-jump-start");
    const basePath = join(packageRoot, "specs", "base-spec.yaml");
    const specOutputPath = join(ajsDir, "canonical-spec.yaml");

    console.log("Initializing Agent Jump Start...\n");

    const filesToCopy = [
      "README.md", "LICENSE", "package.json",
      "scripts/agent-jump-start.mjs",
      "lib/constants.mjs",
      "lib/utils.mjs",
      "lib/validation.mjs",
      "lib/renderers.mjs",
      "lib/files.mjs",
      "lib/skills.mjs",
      "lib/schema.mjs",
      "lib/introspection.mjs",
      "lib/interactive.mjs",
      "lib/doctor.mjs",
      "lib/intake.mjs",
      "lib/inference.mjs",
      "lib/lockfile.mjs",
      "lib/source-info.mjs",
      "lib/skills-updater.mjs",
      "lib/merging.mjs",
      "specs/base-spec.yaml",
      "prompts/01-bootstrap-any-agent.md",
      "prompts/02-change-stack-or-guidelines.md",
      "prompts/03-add-or-update-skill.md",
    ];

    const profiles = listAvailableProfiles();
    for (const profile of profiles) {
      filesToCopy.push(`specs/profiles/${profile.file}`);
    }

    for (const relPath of filesToCopy) {
      const src = join(packageRoot, relPath);
      const dest = join(ajsDir, relPath);
      if (existsSync(src)) {
        ensureDirectory(dest);
        writeFileSync(dest, readFileSync(src));
      }
    }
    console.log(`  Copied framework to ${relative(targetRoot, ajsDir) || ajsDir}`);

    const baseSpec = readJsonYaml(basePath);
    let mergedSpec = baseSpec;

    if (options.guided) {
      // --- Guided interactive setup ---
      if (options.profile) {
        mergedSpec = deepMerge(baseSpec, readJsonYaml(resolve(options.profile)));
        console.log(`  Applied profile: ${options.profile}`);
      }
      mergedSpec = await runGuidedSetup(targetRoot, mergedSpec);
    } else {
      // --- Classic non-interactive setup ---
      if (options.profile) {
        const profilePath = resolve(options.profile);
        mergedSpec = deepMerge(baseSpec, readJsonYaml(profilePath));
        console.log(`  Applied profile: ${options.profile}`);
      } else if (profiles.length > 0) {
        console.log(`\n  Available profiles (use --profile to apply one):`);
        for (const p of profiles) {
          console.log(`    --profile ${relative(process.cwd(), p.path) || p.path}`);
        }
        console.log("");
      }
    }

    validateSpec(mergedSpec, "init");

    ensureDirectory(specOutputPath);
    writeFileSync(specOutputPath, stringifyJsonYaml(mergedSpec), "utf8");
    console.log(`  Created canonical spec: ${relative(targetRoot, specOutputPath) || specOutputPath}`);

    const generatedFiles = renderGeneratedFiles(mergedSpec, specOutputPath, targetRoot);
    writeGeneratedFiles(generatedFiles, targetRoot);
    console.log(`  Rendered ${Object.keys(generatedFiles).length} instruction files across ${AGENT_COUNT} agent targets`);

    const specRel = relative(targetRoot, specOutputPath);
    const scriptRel = relative(targetRoot, join(ajsDir, "scripts/agent-jump-start.mjs"));

    console.log(`\nDone! Next steps:`);
    if (options.guided) {
      console.log(`  1. Review ${specRel} and refine as needed`);
    } else {
      console.log(`  1. Edit ${specRel} with your real project details`);
    }
    console.log(`  2. Run: node ${scriptRel} sync --spec ${specRel}`);
    console.log(`  3. Commit both the spec and the generated files`);
    return;
  }

  // -------------------------------------------------------------------
  // bootstrap
  // -------------------------------------------------------------------
  if (command === "bootstrap") {
    assertRequired(options, "base", command);
    const baseSpec = readJsonYaml(options.base);
    const mergedSpec = options.profile
      ? deepMerge(baseSpec, readJsonYaml(options.profile))
      : baseSpec;

    const outputPath = resolve(options.output ?? "canonical-spec.yaml");
    validateSpec(mergedSpec, outputPath);

    ensureDirectory(outputPath);
    writeFileSync(outputPath, stringifyJsonYaml(mergedSpec), "utf8");
    console.log(`Bootstrapped canonical spec: ${outputPath}`);
    return;
  }

  // -------------------------------------------------------------------
  // sync  (render --clean + check in one step)
  // -------------------------------------------------------------------
  if (command === "sync") {
    assertRequired(options, "spec", command);
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
    return;
  }

  // -------------------------------------------------------------------
  // infer
  // -------------------------------------------------------------------
  if (command === "infer") {
    assertRequired(options, "target", command);
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
    return;
  }

  // -------------------------------------------------------------------
  // doctor
  // -------------------------------------------------------------------
  if (command === "doctor") {
    assertRequired(options, "spec", command);
    const spec = resolveLayeredSpec(options.spec);

    validateSpec(spec, options.spec);

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
    return;
  }

  // -------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------
  if (command === "render") {
    assertRequired(options, "spec", command);
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
    return;
  }

  // -------------------------------------------------------------------
  // check
  // -------------------------------------------------------------------
  if (command === "check") {
    assertRequired(options, "spec", command);
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
    return;
  }

  // -------------------------------------------------------------------
  // validate
  // -------------------------------------------------------------------
  if (command === "validate") {
    assertRequired(options, "spec", command);
    const spec = resolveLayeredSpec(options.spec);
    validateSpec(spec, options.spec);
    console.log(`Spec validation passed: ${options.spec}`);
    if (spec.skills?.length) {
      console.log(`  ${spec.skills.length} skill(s) validated`);
    }
    return;
  }

  // -------------------------------------------------------------------
  // validate-skill (external SKILL.md or directory)
  // -------------------------------------------------------------------
  if (command === "validate-skill") {
    const skillPath = args[1];
    if (!skillPath) {
      throw new Error("Usage: validate-skill <path-to-SKILL.md-or-directory>");
    }

    const absolutePath = resolve(skillPath);

    // Directory with SKILL.md
    if (existsSync(join(absolutePath, "SKILL.md"))) {
      const content = readFileSync(join(absolutePath, "SKILL.md"), "utf8");
      const { frontmatter, body } = parseSkillMdFrontmatter(content);

      if (!frontmatter) {
        throw new Error(`${skillPath}/SKILL.md: missing YAML frontmatter block.`);
      }

      const errors = validateSkillMdFrontmatter(frontmatter, `${skillPath}/SKILL.md`);
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
      }

      console.log(`SKILL.md validation passed: ${skillPath}/SKILL.md`);
      console.log(`  name: ${frontmatter.name}`);
      console.log(`  description: ${frontmatter.description.slice(0, 80)}...`);

      // Check for references
      const refsDir = join(absolutePath, "references");
      if (existsSync(refsDir)) {
        const refFiles = readdirSync(refsDir).filter((f) => f.endsWith(".md"));
        console.log(`  references: ${refFiles.length} file(s)`);
      }

      return;
    }

    // Standalone SKILL.md file
    if (absolutePath.endsWith(".md") && existsSync(absolutePath)) {
      const content = readFileSync(absolutePath, "utf8");
      const { frontmatter } = parseSkillMdFrontmatter(content);

      if (!frontmatter) {
        throw new Error(`${skillPath}: missing YAML frontmatter block.`);
      }

      const errors = validateSkillMdFrontmatter(frontmatter, skillPath);
      if (errors.length > 0) {
        throw new Error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
      }

      console.log(`SKILL.md validation passed: ${skillPath}`);
      console.log(`  name: ${frontmatter.name}`);
      console.log(`  description: ${frontmatter.description.slice(0, 80)}...`);
      return;
    }

    throw new Error(`${skillPath}: not a valid SKILL.md file or skill directory.`);
  }

  // -------------------------------------------------------------------
  // intake
  // -------------------------------------------------------------------
  if (command === "intake") {
    assertRequired(options, "spec", command);
    const targetRoot = resolve(options.target ?? ".");
    const spec = resolveLayeredSpec(options.spec);
    validateSpec(spec, options.spec);

    const discoveries = discoverUnmanagedSkills(targetRoot, spec);
    printIntakeReport(discoveries, targetRoot);

    if (!options.import) {
      const { unmanaged, invalid } = summarizeDiscoveries(discoveries);
      if (unmanaged.length > 0 || invalid.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    // Build the set of upstream-tracked slugs so that --replace does
    // not overwrite their provenance with local-directory.  A skill
    // whose lockfile entry has a non-local sourceType (github, skills,
    // skillfish) must not be re-imported from a local mirror.
    const upstreamTrackedSlugs = new Set();
    if (options.replace) {
      const lockfilePath = defaultLockfilePath(options.spec);
      try {
        const lockfile = readLockfile(lockfilePath);
        for (const entry of lockfile.skills ?? []) {
          if (entry.sourceType === "github" || entry.sourceType === "skills" || entry.sourceType === "skillfish") {
            upstreamTrackedSlugs.add(entry.slug);
          }
        }
      } catch {
        // No lockfile or invalid — nothing to protect.
      }
    }

    const eligible = discoveries.filter((entry) => {
      if (entry.status === "unmanaged") return true;
      if (entry.status === "managed" && Boolean(options.replace)) {
        if (upstreamTrackedSlugs.has(entry.slug)) return false;
        return true;
      }
      return false;
    });

    const skippedUpstream = discoveries.filter(
      (entry) => entry.status === "managed" && Boolean(options.replace) && upstreamTrackedSlugs.has(entry.slug),
    );

    if (eligible.length === 0) {
      if (skippedUpstream.length > 0) {
        console.log(`\nSkipped ${skippedUpstream.length} upstream-tracked skill(s) (provenance preserved):`);
        for (const entry of skippedUpstream) {
          console.log(`  ${entry.slug}`);
        }
      }
      console.log("\nNo skill packages eligible for import.");
      return;
    }

    let added = 0;
    let replaced = 0;
    for (const entry of eligible) {
      const result = importSkillsIntoSpec(
        options.spec,
        entry.path,
        Boolean(options.replace),
        makeLocalSourceInfoForPath(entry.path),
        { quiet: true },
      );
      added += result.added;
      replaced += result.replaced;
    }

    const { invalid } = summarizeDiscoveries(discoveries);
    console.log("");
    if (skippedUpstream.length > 0) {
      console.log(`Skipped ${skippedUpstream.length} upstream-tracked skill(s) (provenance preserved):`);
      for (const entry of skippedUpstream) {
        console.log(`  ${entry.slug}`);
      }
    }
    console.log(
      `Import summary: ${added} added, ${replaced} replaced, ${invalid.length} invalid, ` +
      `${discoveries.length - eligible.length - invalid.length} already managed and skipped`,
    );
    if (invalid.length > 0) {
      console.log("Invalid skill packages were not imported:");
      for (const entry of invalid) {
        console.log(`  ${entry.slug}`);
        for (const error of entry.errors) {
          console.log(`    - ${error}`);
        }
      }
    }
    console.log(`\nRun 'sync' to regenerate instruction files for all ${AGENT_COUNT} agents.`);
    return;
  }

  // -------------------------------------------------------------------
  // list-profiles
  // -------------------------------------------------------------------
  if (command === "list-profiles") {
    const profiles = listAvailableProfiles();
    if (profiles.length === 0) {
      console.log("No profiles found.");
      return;
    }
    console.log(`Agent Jump Start v${TOOL_VERSION} - Available Profiles\n`);
    for (const profile of profiles) {
      console.log(`  ${profile.name.padEnd(26)} ${profile.path}`);
    }
    return;
  }

  // -------------------------------------------------------------------
  // list-agents
  // -------------------------------------------------------------------
  if (command === "list-agents") {
    console.log(`Agent Jump Start v${TOOL_VERSION} - Supported Agents\n`);
    for (const agent of SUPPORTED_AGENTS) {
      console.log(`  ${agent.name.padEnd(22)} ${agent.files}`);
    }
    return;
  }

  // -------------------------------------------------------------------
  // import-skill
  // -------------------------------------------------------------------
  if (command === "import-skill") {
    assertRequired(options, "spec", command);
    assertRequired(options, "skill", command);
    importSkillsIntoSpec(options.spec, options.skill, Boolean(options.replace), makeLocalSourceInfo(options.skill));
    return;
  }

  // -------------------------------------------------------------------
  // add-skill
  // -------------------------------------------------------------------
  if (command === "add-skill") {
    assertRequired(options, "spec", command);
    const source = args[1];
    if (!source) {
      throw new Error("Usage: add-skill <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]");
    }

    let cleanupPath = null;
    try {
      const resolved = resolveSkillImportSource(source, {
        provider: options.provider ?? null,
        skill: options.skill ?? null,
      });
      cleanupPath = resolved.cleanupPath;

      console.log(`Resolved skill source: ${resolved.sourceLabel}`);
      console.log(`  Import path: ${resolved.importPath}`);
      importSkillsIntoSpec(options.spec, resolved.importPath, Boolean(options.replace), resolved.sourceInfo ?? null);
    } finally {
      if (cleanupPath) {
        rmSync(cleanupPath, { recursive: true, force: true });
      }
    }
    return;
  }

  // -------------------------------------------------------------------
  // export-skill
  // -------------------------------------------------------------------
  if (command === "export-skill") {
    assertRequired(options, "spec", command);
    assertRequired(options, "slug", command);
    assertRequired(options, "output", command);

    const spec = resolveLayeredSpec(options.spec);
    validateSpec(spec, options.spec);

    const skill = (spec.skills ?? []).find((s) => s.slug === options.slug);
    if (!skill) {
      const available = (spec.skills ?? []).map((s) => s.slug).join(", ");
      throw new Error(
        `Skill "${options.slug}" not found in ${options.spec}.\n` +
        `Available skills: ${available || "(none)"}`,
      );
    }

    const created = exportSkillPackage(skill, options.output);
    console.log(`Exported skill "${skill.slug}" to ${options.output}:`);
    for (const file of created) {
      console.log(`  ${file}`);
    }
    return;
  }

  // -------------------------------------------------------------------
  // update-skills
  // -------------------------------------------------------------------
  if (command === "update-skills") {
    assertRequired(options, "spec", command);
    const specPath = resolve(options.spec);
    const lockfilePath = defaultLockfilePath(options.spec);
    const dryRun = Boolean(options["dry-run"]);
    const slugFilter = options.skill ?? null;

    if (dryRun) {
      console.log("Dry-run mode: no files will be modified.\n");
    }

    const results = refreshSkills({ specPath, lockfilePath, dryRun, slugFilter });

    const upToDate = results.filter((r) => r.status === "up-to-date");
    const changed = results.filter((r) => r.status === "changed");
    const unreachable = results.filter((r) => r.status === "unreachable");
    const errors = results.filter((r) => r.status === "error");

    if (changed.length > 0) {
      console.log(dryRun ? "Would update:" : "Updated:");
      for (const r of changed) {
        console.log(`  ${r.slug}  ${r.oldVersion ?? "?"} → ${r.newVersion ?? "?"}`);
        if (r.message) {
          for (const line of r.message.split("\n")) {
            console.log(`    ${line}`);
          }
        }
      }
      console.log("");
    }

    if (unreachable.length > 0) {
      console.log("Unreachable sources (skipped):");
      for (const r of unreachable) {
        console.log(`  ${r.slug}: ${r.message}`);
      }
      console.log("");
    }

    if (errors.length > 0) {
      console.log("Errors:");
      for (const r of errors) {
        console.log(`  ${r.slug}: ${r.message}`);
      }
      console.log("");
    }

    console.log(
      `Summary: ${upToDate.length} up-to-date, ${changed.length} ${dryRun ? "would change" : "updated"}, ` +
      `${unreachable.length} unreachable, ${errors.length} error(s)`,
    );

    if (!dryRun && changed.length > 0) {
      console.log(`\nRun 'render' to regenerate instruction files for all ${AGENT_COUNT} agents.`);
    }
    if (errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  // -------------------------------------------------------------------
  // export-schema
  // -------------------------------------------------------------------
  if (command === "export-schema") {
    const output = options.output ?? "canonical-spec.schema.json";
    const schemaJson = JSON.stringify(CANONICAL_SPEC_SCHEMA, null, 2) + "\n";

    if (output === "-") {
      process.stdout.write(schemaJson);
    } else {
      ensureDirectory(resolve(output));
      writeFileSync(resolve(output), schemaJson, "utf8");
      console.log(`Schema written to ${output}`);
    }
    return;
  }

  // -------------------------------------------------------------------
  // demo commands
  // -------------------------------------------------------------------
  if (command === "demo-clean") {
    assertRequired(options, "target", command);
    const targetRoot = resolve(options.target);
    cleanDirectoryIfExists(targetRoot);
    console.log(`Removed ${targetRoot}`);
    return;
  }

  if (command === "demo-tree") {
    assertRequired(options, "target", command);
    const targetRoot = resolve(options.target);
    for (const entry of listManagedFiles(targetRoot)) {
      console.log(entry);
    }
    return;
  }

  console.error(`Unknown command '${command}'. Run with --help for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
