// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Setup commands: init, bootstrap.
//
// These commands scaffold a new project or merge a base spec with a profile.
// They are one-shot operations that create files on disk.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { TOOL_VERSION, AGENT_COUNT } from "../constants.mjs";
import { assertRequired, readJsonYaml, stringifyJsonYaml, deepMerge, ensureDirectory } from "../utils.mjs";
import { validateSpec } from "../validation.mjs";
import { renderGeneratedFiles } from "../renderers.mjs";
import { writeGeneratedFiles, discoverPackageRoot, listAvailableProfiles } from "../files.mjs";
import { runGuidedSetup } from "../interactive.mjs";

/**
 * Handle the `init` command.
 *
 * Copies framework files, optionally applies a profile and/or runs
 * guided interactive setup, then renders instruction files.
 *
 * @param {object} options — parsed CLI options
 */
export async function handleInit(options) {
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
    "lib/commands/helpers.mjs",
    "lib/commands/setup.mjs",
    "lib/commands/pipeline.mjs",
    "lib/commands/infer.mjs",
    "lib/commands/skills.mjs",
    "lib/commands/info.mjs",
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
  let decisionReport = null;
  const useGuided = !options["non-interactive"] && !options["no-guided"];

  if (useGuided) {
    // --- Guided interactive setup ---
    if (options.profile) {
      mergedSpec = deepMerge(baseSpec, readJsonYaml(resolve(options.profile)));
      console.log(`  Applied profile: ${options.profile}`);
    }
    const guidedResult = await runGuidedSetup(targetRoot, mergedSpec, { profileApplied: Boolean(options.profile) });
    mergedSpec = guidedResult.spec;
    decisionReport = guidedResult.decisionReport;
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
  if (useGuided) {
    console.log(`  Trust check:`);
    if (decisionReport?.edited?.length > 0) {
      for (const entry of decisionReport.edited) {
        console.log(`    - You edited ${entry.category}; verify ${entry.path} in ${specRel}`);
      }
    } else {
      console.log(`    - You accepted the default draft suggestions; verify ${specRel} once before treating it as trusted memory`);
    }
    if (decisionReport?.skipped?.length > 0) {
      for (const entry of decisionReport.skipped) {
        console.log(`    - You skipped ${entry.category}; re-run init or edit ${entry.path} in ${specRel} if that area still matters`);
      }
    }
    console.log(`  Next command: node ${scriptRel} sync --spec ${specRel}`);
  } else {
    console.log(`  1. Edit ${specRel} with your real project details`);
    console.log(`  2. Run: node ${scriptRel} sync --spec ${specRel}`);
    console.log(`  3. Commit both the spec and the generated files`);
  }
}

/**
 * Handle the `bootstrap` command.
 *
 * Merges a base spec with an optional profile and writes the result.
 *
 * @param {object} options — parsed CLI options
 */
export function handleBootstrap(options) {
  assertRequired(options, "base", "bootstrap");
  const baseSpec = readJsonYaml(options.base);
  const mergedSpec = options.profile
    ? deepMerge(baseSpec, readJsonYaml(options.profile))
    : baseSpec;

  const outputPath = resolve(options.output ?? "canonical-spec.yaml");
  validateSpec(mergedSpec, outputPath);

  ensureDirectory(outputPath);
  writeFileSync(outputPath, stringifyJsonYaml(mergedSpec), "utf8");
  console.log(`Bootstrapped canonical spec: ${outputPath}`);
}
