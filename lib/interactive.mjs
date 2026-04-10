// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createInterface } from "node:readline";
import { introspectProject, formatDetectedComponents, suggestPackageManagerRule, suggestRuntimeRule, deepIntrospect } from "./introspection.mjs";
import { inferValidation, inferSections, inferChecklist } from "./inference.mjs";

// ---------------------------------------------------------------------------
// Readline helpers — zero-dependency interactive prompts
// ---------------------------------------------------------------------------

/**
 * Read all lines from stdin into an array.
 * Used when stdin is piped (not a TTY) to avoid readline close-race issues.
 */
function readAllStdinLines() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    const lines = [];
    rl.on("line", (line) => lines.push(line));
    rl.on("close", () => resolve(lines));
  });
}

/**
 * Create a prompt interface that works with both TTY and piped stdin.
 * When stdin is piped, all input is buffered upfront to avoid readline races.
 */
async function createPrompt() {
  const isTTY = process.stdin.isTTY ?? false;

  if (!isTTY) {
    // Piped stdin: buffer all lines upfront
    const lines = await readAllStdinLines();
    let lineIndex = 0;

    function ask(question, defaultValue = null) {
      const hint = defaultValue !== null ? ` [${defaultValue}]` : "";
      process.stderr.write(`  ${question}${hint}: `);
      const answer = (lineIndex < lines.length) ? lines[lineIndex++].trim() : "";
      process.stderr.write(`${answer}\n`);
      return Promise.resolve(answer || defaultValue || "");
    }

    function confirm(question, defaultYes = true) {
      const hint = defaultYes ? "[Y/n]" : "[y/N]";
      process.stderr.write(`  ${question} ${hint} `);
      const answer = (lineIndex < lines.length) ? lines[lineIndex++].trim().toLowerCase() : "";
      process.stderr.write(`${answer}\n`);
      if (answer === "") return Promise.resolve(defaultYes);
      return Promise.resolve(answer === "y" || answer === "yes");
    }

    function close() { /* no-op for buffered mode */ }

    return { ask, confirm, close };
  }

  // TTY: use readline interactively
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  function ask(question, defaultValue = null) {
    const hint = defaultValue !== null ? ` [${defaultValue}]` : "";
    return new Promise((resolve) => {
      rl.question(`  ${question}${hint}: `, (answer) => {
        const trimmed = answer.trim();
        resolve(trimmed || defaultValue || "");
      });
    });
  }

  function confirm(question, defaultYes = true) {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    return new Promise((resolve) => {
      rl.question(`  ${question} ${hint} `, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "") resolve(defaultYes);
        else resolve(trimmed === "y" || trimmed === "yes");
      });
    });
  }

  function close() {
    rl.close();
  }

  return { ask, confirm, close };
}

// ---------------------------------------------------------------------------
// Guided spec builder
// ---------------------------------------------------------------------------

/**
 * Run an interactive guided setup session.
 * Returns a spec object ready for validation and rendering.
 *
 * @param {string} targetRoot - The project directory to introspect.
 * @param {object} baseSpec - The base spec to start from.
 * @returns {Promise<object>} The customized spec.
 */
export async function runGuidedSetup(targetRoot, baseSpec) {
  const prompt = await createPrompt();

  try {
    console.log("\n  Scanning project...\n");

    const detected = introspectProject(targetRoot);

    // --- Show detected signals ---
    const manifestSignals = detected.signals.filter((s) => s.type === "manifest" || s.type === "config" || s.type === "infra" || s.type === "ci");
    if (manifestSignals.length > 0) {
      console.log("  Detected:");
      for (const signal of manifestSignals) {
        console.log(`    + ${signal.file} -> ${signal.detail}`);
      }
      if (detected.packageManager) {
        console.log(`    + Lock file -> ${detected.packageManager}`);
      }
      console.log("");
    }

    // --- Project name ---
    const projectName = await prompt.ask("Project name", detected.projectName);

    // --- Project summary ---
    const summary = await prompt.ask("Project summary (one sentence)");

    // --- Components ---
    let components = baseSpec.project.components || [];
    if (detected.components.length > 0) {
      const formatted = formatDetectedComponents(detected.components);
      console.log("\n  Suggested components:");
      for (const [i, comp] of formatted.entries()) {
        console.log(`    ${i + 1}. ${comp}`);
      }
      console.log("");

      const acceptComponents = await prompt.confirm("Accept suggested components?", true);
      if (acceptComponents) {
        components = formatted;
      } else {
        const custom = await prompt.ask("Components (comma-separated, or press Enter to skip)", "");
        if (custom) {
          components = custom.split(",").map((c) => c.trim()).filter(Boolean);
        }
      }
    } else {
      const custom = await prompt.ask("Components (comma-separated, e.g. 'api: Express service, web: React app')", "");
      if (custom) {
        components = custom.split(",").map((c) => c.trim()).filter(Boolean);
      }
    }

    // --- Package manager rule ---
    let packageManagerRule = baseSpec.workspaceInstructions.packageManagerRule;
    const suggestedPmRule = suggestPackageManagerRule(detected.packageManager);
    if (suggestedPmRule) {
      packageManagerRule = suggestedPmRule;
      console.log(`\n  Package manager: ${detected.packageManager} (auto-detected)`);
    }

    // --- Runtime rule ---
    let runtimeRule = baseSpec.workspaceInstructions.runtimeRule;
    const suggestedRtRule = suggestRuntimeRule(detected.runtimes);
    if (suggestedRtRule) {
      runtimeRule = suggestedRtRule;
      console.log(`  Runtimes: ${detected.runtimes.join(", ")} (auto-detected)`);
    }

    // --- Deep inference ---
    const evidence = deepIntrospect(targetRoot);
    const suggestedValidation = inferValidation(evidence);
    const suggestedSections = inferSections(evidence);
    const suggestedChecklist = inferChecklist(evidence);

    // --- Suggested validation commands ---
    let acceptedValidation = null;
    if (suggestedValidation.length > 0) {
      console.log("\n  Suggested validation commands:");
      for (const item of suggestedValidation) {
        console.log(`    [${item.provenance}] ${item.value} (from ${item.source})`);
      }
      console.log("");
      const acceptValidation = await prompt.confirm(`Accept ${suggestedValidation.length} suggested validation command(s)?`, true);
      if (acceptValidation) {
        acceptedValidation = suggestedValidation.map((v) => v.value);
      }
    }

    // --- Suggested workspace sections ---
    let acceptedSections = null;
    if (suggestedSections.length > 0) {
      console.log("\n  Suggested workspace sections:");
      for (const section of suggestedSections) {
        const ruleCount = section.rules.length;
        const provenance = section.rules[0]?.provenance ?? "inferred";
        const source = section.rules[0]?.source ?? "";
        console.log(`    [${provenance}] ${section.title} (${ruleCount} rule${ruleCount !== 1 ? "s" : ""}${source ? `, from ${source}` : ""})`);
      }
      console.log("");
      const acceptSections = await prompt.confirm(`Accept ${suggestedSections.length} suggested section(s)?`, true);
      if (acceptSections) {
        acceptedSections = suggestedSections.map((s) => ({
          title: s.title,
          rules: s.rules.map((r) => r.value),
        }));
      }
    }

    // --- Review checklist ---
    console.log("");
    const includeChecklist = await prompt.confirm("Include review checklist?", true);

    // --- Suggested review checklist items ---
    let acceptedChecklist = null;
    if (includeChecklist && suggestedChecklist.items.length > 0) {
      console.log("\n  Suggested review checklist enhancements:");
      for (const item of suggestedChecklist.items) {
        console.log(`    [${item.provenance}] ${item.value}`);
      }
      console.log("");
      const acceptChecklistSuggestions = await prompt.confirm(`Accept ${suggestedChecklist.items.length} suggested checklist item(s)?`, true);
      if (acceptChecklistSuggestions) {
        acceptedChecklist = suggestedChecklist;
      }
    }

    // --- Skills ---
    const importSkills = await prompt.confirm("Import skills from profiles later? (you can always add them with add-skill)", false);

    // --- Build the spec ---
    const spec = structuredClone(baseSpec);
    spec.project.name = projectName;
    spec.project.summary = summary || baseSpec.project.summary;
    spec.project.components = components;
    spec.workspaceInstructions.packageManagerRule = packageManagerRule;
    spec.workspaceInstructions.runtimeRule = runtimeRule;

    // Apply accepted validation commands
    if (acceptedValidation) {
      spec.workspaceInstructions.validation = acceptedValidation;
    }

    // Apply accepted workspace sections (merge with base General rules)
    if (acceptedSections) {
      const baseSections = spec.workspaceInstructions.sections ?? [];
      spec.workspaceInstructions.sections = [...baseSections, ...acceptedSections];
    }

    if (!includeChecklist) {
      delete spec.reviewChecklist;
    }

    // Apply accepted review checklist enhancements
    if (includeChecklist && acceptedChecklist) {
      if (!spec.reviewChecklist) {
        spec.reviewChecklist = baseSpec.reviewChecklist
          ? structuredClone(baseSpec.reviewChecklist)
          : { intro: "Review checklist.", failureThreshold: 2, items: [], quickSignals: [], redFlags: [] };
      }
      // Add inferred items to checklist
      for (const item of acceptedChecklist.items) {
        spec.reviewChecklist.items.push({
          title: item.value,
          details: [`Source: ${item.source} (${item.provenance})`],
        });
      }
      // Merge quick signals
      for (const qs of acceptedChecklist.quickSignals) {
        spec.reviewChecklist.quickSignals.push(qs.value);
      }
      // Merge red flags
      for (const rf of acceptedChecklist.redFlags) {
        if (!spec.reviewChecklist.redFlags.includes(rf.value)) {
          spec.reviewChecklist.redFlags.push(rf.value);
        }
      }
    }

    // --- Post-setup summary ---
    console.log("\n  ---");
    console.log("  NOTE: Built-in profiles are starter references.");
    console.log("  Replace the generated procedures, validation commands, coding");
    console.log("  standards, and skills with repository-specific decisions before");
    console.log("  treating the output as authoritative memory.");
    console.log("  ---\n");

    return spec;
  } finally {
    prompt.close();
  }
}
