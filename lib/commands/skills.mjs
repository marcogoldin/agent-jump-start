// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Skill management commands:
//   import-skill, add-skill, export-skill, intake, update-skills,
//   validate-skill.
//
// Also contains importSkillsIntoSpec(), the shared function that handles
// the actual skill import/replace logic with lockfile provenance tracking.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { AGENT_COUNT } from "../constants.mjs";
import { assertRequired, readJsonYaml, stringifyJsonYaml } from "../utils.mjs";
import { validateSkill, validateSkillMdFrontmatter } from "../validation.mjs";
import { readExternalSkill, exportSkillPackage, parseSkillMdFrontmatter, resolveSkillImportSource } from "../skills.mjs";
import { resolveLayeredSpecWithMeta } from "../merging.mjs";
import { defaultLockfilePath, makeProvenanceRecord, readLockfile, writeLockfileEntries } from "../lockfile.mjs";
import { makeLocalSourceInfo } from "../source-info.mjs";
import { discoverUnmanagedSkills, inspectSkillDirectory } from "../intake.mjs";
import { refreshSkills } from "../skills-updater.mjs";
import { displayPath, summarizeDiscoveries, printIntakeReport, makeLocalSourceInfoForPath, resolveAndValidateSpec } from "./helpers.mjs";

// ---------------------------------------------------------------------------
// importSkillsIntoSpec — shared skill import engine
// ---------------------------------------------------------------------------

/**
 * Import skills from an external source into a canonical spec file.
 *
 * Handles collision detection (including inherited skills from base layers),
 * replace semantics, lockfile provenance records, and leaf-only writes.
 *
 * @param {string}      specPathInput   — path to the spec YAML/JSON
 * @param {string}      sourcePathInput — path to the skill source
 * @param {boolean}     replaceExisting — overwrite existing skills
 * @param {object|null} sourceInfo      — provenance source info for lockfile
 * @param {object}      importOptions   — { quiet?: boolean }
 * @returns {{ added: number, replaced: number, totalSkillsInLeaf: number }}
 */
export function importSkillsIntoSpec(specPathInput, sourcePathInput, replaceExisting = false, sourceInfo = null, importOptions = {}) {
  const quiet = Boolean(importOptions.quiet);
  const specPath = resolve(specPathInput);
  if (!existsSync(specPath)) {
    throw new Error(`Canonical spec not found: ${specPath}. Run bootstrap first.`);
  }

  // Resolve the full layer chain for collision detection (includes
  // inherited skills from base layers).  Read the raw leaf file
  // separately — that is the only file we write back to.
  const layerMeta = resolveLayeredSpecWithMeta(specPathInput);
  const resolvedSpec = layerMeta.merged;
  const resolvedSkills = resolvedSpec.skills ?? [];

  if (layerMeta.isLayered && !quiet) {
    console.log(
      `Layered spec detected: writeback will only modify the leaf file ${displayPath(layerMeta.leafPath)}.`,
    );
  }

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

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * Handle the `validate-skill` command.
 *
 * Two-stage validation that matches what `intake` runs, so a SKILL.md that
 * passes this command will also pass `intake --import`:
 *
 *   1. frontmatter shape — required `name` + `description`, optional `metadata`
 *      and `dependencies` shapes.
 *   2. canonical import compatibility — the full skill object rebuilt from
 *      SKILL.md must satisfy the same `validateSkill` contract that `intake`
 *      and `import-skill` apply before writing to the spec.
 *
 * Possible outcomes:
 *   - `import-compatible` → exit 0. Intake will accept this skill.
 *   - `structurally-valid` → exit 1. Frontmatter is fine but the reconstructed
 *     canonical skill would be rejected by `intake` (missing categories/rules/…).
 *   - `frontmatter-invalid` → exit 1. Frontmatter itself is missing/malformed.
 *
 * Flags:
 *   --frontmatter-only — run only the legacy frontmatter shape check. Skips
 *     canonical rebuild; exits 0 as soon as frontmatter is OK. Useful for CI
 *     pipelines that want the pre-parity behavior, but cannot replace the
 *     parity contract — it is intentionally optional.
 *
 * Standalone `.md` files can only be validated at the frontmatter stage because
 * canonical reconstruction needs the surrounding `references/`, `scripts/`, and
 * `assets/` directories; point the command at a directory to get the full
 * import-compatibility verdict.
 *
 * @param {object}   options — parsed CLI options
 * @param {string[]} args    — raw CLI arguments (args[1] is the skill path)
 */
export function handleValidateSkill(options, args) {
  const skillPath = args[1];
  if (!skillPath) {
    throw new Error("Usage: validate-skill <path-to-SKILL.md-or-directory> [--frontmatter-only]");
  }

  const absolutePath = resolve(skillPath);
  const frontmatterOnly = Boolean(options["frontmatter-only"]);

  // Directory with SKILL.md — supports full two-stage validation.
  if (existsSync(join(absolutePath, "SKILL.md"))) {
    if (frontmatterOnly) {
      validateSkillDirectoryFrontmatterOnly(absolutePath, skillPath);
      return;
    }

    const inspected = inspectSkillDirectory(absolutePath);
    reportInspectedSkill(inspected, skillPath);
    return;
  }

  // Standalone SKILL.md file — frontmatter stage only, because canonical
  // reconstruction requires the sibling directories.
  if (absolutePath.endsWith(".md") && existsSync(absolutePath)) {
    validateStandaloneSkillMd(absolutePath, skillPath, frontmatterOnly);
    return;
  }

  throw new Error(`${skillPath}: not a valid SKILL.md file or skill directory.`);
}

function validateSkillDirectoryFrontmatterOnly(absolutePath, skillPath) {
  const skillMdPath = join(absolutePath, "SKILL.md");
  const content = readFileSync(skillMdPath, "utf8");
  const { frontmatter } = parseSkillMdFrontmatter(content);

  if (!frontmatter) {
    throw new Error(`${skillPath}/SKILL.md: missing YAML frontmatter block.`);
  }

  const errors = validateSkillMdFrontmatter(frontmatter, `${skillPath}/SKILL.md`);
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  console.log(`SKILL.md frontmatter validation passed: ${skillPath}/SKILL.md`);
  console.log(`  name: ${frontmatter.name}`);
  console.log(`  description: ${frontmatter.description.slice(0, 80)}...`);

  const refsDir = join(absolutePath, "references");
  if (existsSync(refsDir)) {
    const refFiles = readdirSync(refsDir).filter((f) => f.endsWith(".md"));
    console.log(`  references: ${refFiles.length} file(s)`);
  }
  console.log("  note: --frontmatter-only skipped canonical import-compatibility check.");
  console.log("        Drop the flag to get the same verdict intake will give you.");
}

function validateStandaloneSkillMd(absolutePath, skillPath, frontmatterOnly) {
  const content = readFileSync(absolutePath, "utf8");
  const { frontmatter } = parseSkillMdFrontmatter(content);

  if (!frontmatter) {
    throw new Error(`${skillPath}: missing YAML frontmatter block.`);
  }

  const errors = validateSkillMdFrontmatter(frontmatter, skillPath);
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  console.log(`SKILL.md frontmatter validation passed: ${skillPath}`);
  console.log(`  name: ${frontmatter.name}`);
  console.log(`  description: ${frontmatter.description.slice(0, 80)}...`);
  if (!frontmatterOnly) {
    console.log("  note: standalone .md files can only be validated at the frontmatter stage.");
    console.log("        Point validate-skill at the skill directory to check import compatibility.");
  }
}

function reportInspectedSkill(inspected, displayedPath) {
  if (inspected.status === "import-compatible") {
    const { skill, frontmatter } = inspected;
    console.log(`validate-skill: import-compatible — ${displayedPath}`);
    console.log(`  slug: ${skill.slug}`);
    console.log(`  title: ${skill.title}`);
    console.log(`  description: ${frontmatter.description.slice(0, 80)}...`);
    console.log(`  categories: ${skill.categories.length}`);
    console.log(`  rules: ${skill.rules.length}`);
    const refsDir = join(inspected.path, "references");
    if (existsSync(refsDir)) {
      const refFiles = readdirSync(refsDir).filter((f) => f.endsWith(".md"));
      console.log(`  references: ${refFiles.length} file(s)`);
    }
    console.log("  intake --import will accept this skill.");
    return;
  }

  if (inspected.status === "structurally-valid") {
    const lines = [
      `Skill at ${displayedPath} is structurally valid but NOT import-compatible.`,
      `Frontmatter is OK (name=${inspected.frontmatter.name}), but the reconstructed canonical skill fails validation:`,
      ...inspected.errors.map((e) => `  - ${e}`),
      "",
      "Intake --import would reject this skill with the same errors.",
      "Fix the listed fields in SKILL.md (or its frontmatter) before running intake.",
    ];
    throw new Error(lines.join("\n"));
  }

  // frontmatter-invalid
  const lines = [
    `Skill at ${displayedPath} has invalid or missing SKILL.md frontmatter:`,
    ...inspected.errors.map((e) => `  - ${e}`),
  ];
  throw new Error(lines.join("\n"));
}

/**
 * Handle the `intake` command.
 *
 * Scans the workspace for unmanaged skill packages and optionally imports
 * them into the spec, respecting upstream provenance.
 *
 * @param {object} options — parsed CLI options
 */
export function handleIntake(options) {
  assertRequired(options, "spec", "intake");
  const targetRoot = resolve(options.target ?? ".");
  const { merged: spec, isLayered, leafPath } = resolveAndValidateSpec(options.spec);
  if (isLayered) {
    console.log(
      `Layered spec detected: any imported skill will be written only to the leaf file ${displayPath(leafPath)}.\n`,
    );
  }

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
}

/**
 * Handle the `import-skill` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleImportSkill(options) {
  assertRequired(options, "spec", "import-skill");
  assertRequired(options, "skill", "import-skill");
  importSkillsIntoSpec(options.spec, options.skill, Boolean(options.replace), makeLocalSourceInfo(options.skill));
}

/**
 * Handle the `add-skill` command.
 *
 * Resolves an external skill source (github:, skills:, local path),
 * imports it into the spec, and cleans up any temporary clone.
 *
 * @param {object}   options — parsed CLI options
 * @param {string[]} args    — raw CLI arguments (args[1] is the source)
 */
export function handleAddSkill(options, args) {
  assertRequired(options, "spec", "add-skill");
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
}

/**
 * Handle the `export-skill` command.
 *
 * @param {object} options — parsed CLI options
 */
export function handleExportSkill(options) {
  assertRequired(options, "spec", "export-skill");
  assertRequired(options, "slug", "export-skill");
  assertRequired(options, "output", "export-skill");

  const { merged: spec } = resolveAndValidateSpec(options.spec);

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
}

/**
 * Handle the `update-skills` command.
 *
 * Checks upstream sources for skill updates and optionally applies them.
 *
 * @param {object} options — parsed CLI options
 */
export function handleUpdateSkills(options) {
  assertRequired(options, "spec", "update-skills");
  const specPath = resolve(options.spec);
  const lockfilePath = defaultLockfilePath(options.spec);
  const dryRun = Boolean(options["dry-run"]);
  const slugFilter = options.skill ?? null;

  if (dryRun) {
    console.log("Dry-run mode: no files will be modified.\n");
  }

  // Surface the layered-writeback contract before we touch anything: when
  // the spec extends a base, the only file ever modified is the leaf.
  const updateMeta = resolveLayeredSpecWithMeta(specPath);
  if (updateMeta.isLayered) {
    console.log(
      `Layered spec detected: updates will only modify the leaf file ${displayPath(updateMeta.leafPath)}.\n`,
    );
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
}
