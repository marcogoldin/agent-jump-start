// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createInterface } from "node:readline";
import { introspectProject, formatDetectedComponents, suggestPackageManagerRule, suggestRuntimeRule, deepIntrospect } from "./introspection.mjs";
import { inferValidation, inferSections, inferChecklist } from "./inference.mjs";

const NODE_STACK_CHOICES = new Set(["typescript", "javascript", "react", "node", "express", "nextjs", "react-native", "cli"]);
const STACK_ALIASES = new Map([
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["js", "javascript"],
  ["jsx", "javascript"],
  ["node.js", "node"],
  ["nodejs", "node"],
  ["expressjs", "express"],
  ["next", "nextjs"],
  ["next.js", "nextjs"],
  ["react native", "react-native"],
  ["reactnative", "react-native"],
  ["rn", "react-native"],
  ["py", "python"],
  ["fast-api", "fastapi"],
  ["golang", "go"],
  ["spring boot", "spring"],
  ["spring-boot", "spring"],
  ["c#", "csharp"],
  ["c sharp", "csharp"],
  [".net", "dotnet"],
  ["asp.net", "dotnet"],
  ["asp.net core", "dotnet"],
  ["aspnet", "dotnet"],
  ["aspnet core", "dotnet"],
  ["ruby on rails", "rails"],
  ["command line", "cli"],
  ["command-line", "cli"],
  ["machine learning", "ml"],
]);
const STACK_RUNTIME_HINTS = new Map([
  ["typescript", "Node.js"],
  ["javascript", "Node.js"],
  ["react", "Node.js"],
  ["node", "Node.js"],
  ["express", "Node.js"],
  ["nextjs", "Node.js"],
  ["react-native", "Node.js"],
  ["cli", "Node.js"],
  ["python", "Python"],
  ["fastapi", "Python"],
  ["django", "Python"],
  ["ml", "Python"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["java", "Java"],
  ["spring", "Java"],
  ["csharp", ".NET"],
  ["dotnet", ".NET"],
  ["php", "PHP"],
  ["laravel", "PHP"],
  ["ruby", "Ruby"],
  ["rails", "Ruby"],
  ["dart", "Dart"],
  ["flutter", "Dart"],
]);
const GREENFIELD_COMPONENT_HINTS = [
  { when: ["nextjs"], component: "web: Next.js application" },
  { when: ["react-native"], component: "mobile: React Native application" },
  { when: ["flutter", "dart"], component: "mobile: Flutter application" },
  { when: ["django"], component: "web: Django application" },
  { when: ["laravel"], component: "web: Laravel application" },
  { when: ["rails"], component: "web: Rails application" },
  { when: ["react"], component: "web: React application" },
  { when: ["fastapi"], component: "api: FastAPI service" },
  { when: ["spring", "java"], component: "api: Spring Boot service" },
  { when: ["dotnet", "csharp"], component: "api: .NET Core service" },
  { when: ["go"], component: "api: Go service" },
  { when: ["rust"], component: "api: Rust service" },
  { when: ["express"], component: "api: Express.js REST service" },
  { when: ["cli"], component: "cli: Command-line application" },
  { when: ["ml"], component: "ml: Machine learning pipeline" },
  { when: ["typescript"], component: "web: TypeScript application", generic: true, type: "web" },
  { when: ["javascript"], component: "web: JavaScript application", generic: true, type: "web" },
  { when: ["python"], component: "api: Python service", generic: true, type: "api" },
  { when: ["node"], component: "api: Node.js service", generic: true, type: "api" },
];
const STARTER_PRESETS = {
  "fullstack-web": {
    stackChoices: ["typescript", "react", "node", "express"],
    components: ["web: React application", "api: Express.js REST service"],
    validation: ["npm run test", "npm run lint", "npm run build"],
  },
  "nextjs-app": {
    stackChoices: ["typescript", "nextjs", "react"],
    components: ["web: Next.js application"],
    validation: ["npm run test", "npm run lint", "npm run build"],
  },
  "react-web": {
    stackChoices: ["typescript", "react"],
    components: ["web: React application"],
    validation: ["npm run test", "npm run lint"],
  },
  "node-api": {
    stackChoices: ["typescript", "node", "express"],
    components: ["api: Express.js REST service"],
    validation: ["npm run test", "npm run lint"],
  },
  "fastapi-api": {
    stackChoices: ["python", "fastapi"],
    components: ["api: FastAPI service"],
    validation: ["python -m pytest"],
  },
  "django-app": {
    stackChoices: ["python", "django"],
    components: ["web: Django application"],
    validation: ["python -m pytest"],
  },
  "go-service": {
    stackChoices: ["go"],
    components: ["api: Go service"],
    validation: ["go test ./..."],
  },
  "rust-service": {
    stackChoices: ["rust"],
    components: ["api: Rust service"],
    validation: ["cargo test"],
  },
  "spring-api": {
    stackChoices: ["java", "spring"],
    components: ["api: Spring Boot service"],
    validation: ["./mvnw test"],
  },
  "dotnet-api": {
    stackChoices: ["csharp", "dotnet"],
    components: ["api: .NET Core service"],
    validation: ["dotnet test"],
  },
  "laravel-app": {
    stackChoices: ["php", "laravel"],
    components: ["web: Laravel application"],
    validation: ["php artisan test"],
  },
  "rails-app": {
    stackChoices: ["ruby", "rails"],
    components: ["web: Rails application"],
    validation: ["bundle exec rspec"],
  },
  "react-native-app": {
    stackChoices: ["typescript", "react-native"],
    components: ["mobile: React Native application"],
    validation: ["npm run test", "npm run lint"],
  },
  "flutter-app": {
    stackChoices: ["dart", "flutter"],
    components: ["mobile: Flutter application"],
    validation: ["flutter test"],
  },
  "cli-tool": {
    stackChoices: ["typescript", "node", "cli"],
    components: ["cli: Command-line application"],
    validation: ["npm run test", "npm run lint"],
  },
  "ml-pipeline": {
    stackChoices: ["python", "ml"],
    components: ["ml: Machine learning pipeline"],
    validation: ["python -m pytest"],
  },
};
const STACK_CHOICE_HINT = "fullstack-web, nextjs-app, fastapi-api, rails-app, flutter-app, typescript, python, go, dotnet";

function normalizeStackSelection(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return STACK_ALIASES.get(normalized) ?? normalized;
}

function normalizeListInput(value) {
  return value
    .split(",")
    .map((item) => normalizeStackSelection(item))
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function expandGreenfieldSelections(rawSelections) {
  const expandedChoices = [];
  const components = [];
  const validation = [];

  for (const selection of rawSelections) {
    const preset = STARTER_PRESETS[selection];
    if (preset) {
      expandedChoices.push(...preset.stackChoices);
      components.push(...preset.components);
      validation.push(...preset.validation);
      continue;
    }
    expandedChoices.push(selection);
  }

  return {
    stackChoices: uniqueStrings(expandedChoices),
    presetComponents: uniqueStrings(components),
    presetValidation: uniqueStrings(validation),
  };
}

function buildGreenfieldContext(stackChoices) {
  const expanded = expandGreenfieldSelections(stackChoices);
  const choices = new Set(expanded.stackChoices);
  const runtimes = [];
  const components = [...expanded.presetComponents];

  for (const [stackChoice, runtime] of STACK_RUNTIME_HINTS.entries()) {
    if (choices.has(stackChoice)) {
      runtimes.push(runtime);
    }
  }

  for (const hint of GREENFIELD_COMPONENT_HINTS) {
    if (!hint.when.some((stackChoice) => choices.has(stackChoice))) continue;
    if (components.includes(hint.component)) continue;
    if (hint.generic && components.some((item) => item.startsWith(`${hint.type}:`))) continue;
    components.push(hint.component);
  }

  return {
    stackChoices: expanded.stackChoices,
    runtimes: uniqueStrings(runtimes),
    components: uniqueStrings(components),
    validation: expanded.presetValidation,
  };
}

function buildGreenfieldValidation(greenfieldInput, packageManager) {
  const context = Array.isArray(greenfieldInput)
    ? buildGreenfieldContext(greenfieldInput)
    : greenfieldInput;
  const choices = new Set(context.stackChoices);
  const commands = [];
  const pm = packageManager || "npm";
  const seen = new Set();

  function add(value) {
    if (seen.has(value)) return;
    seen.add(value);
    commands.push({ value, provenance: "inferred", source: "starter stack choice" });
  }

  for (const command of context.validation) {
    add(command);
  }

  if ([...choices].some((item) => NODE_STACK_CHOICES.has(item))) {
    add(`${pm} run test`);
    add(`${pm} run lint`);
  }

  if (choices.has("nextjs")) {
    add(`${pm} run build`);
  }

  if (choices.has("python") || choices.has("fastapi") || choices.has("django") || choices.has("ml")) {
    add("python -m pytest");
  }
  if (choices.has("go")) add("go test ./...");
  if (choices.has("rust")) add("cargo test");
  if (choices.has("java") || choices.has("spring")) add("./mvnw test");
  if (choices.has("csharp") || choices.has("dotnet")) add("dotnet test");
  if (choices.has("php") || choices.has("laravel")) add("php artisan test");
  if (choices.has("ruby") || choices.has("rails")) add("bundle exec rspec");
  if (choices.has("dart") || choices.has("flutter")) add("flutter test");

  return commands;
}

function buildReviewLabel(item) {
  if (typeof item === "string") return item;
  if (item.title && Array.isArray(item.rules)) return item.title;
  if (item.value) return item.value;
  return String(item);
}

async function reviewSuggestedEntries(prompt, heading, items, options = {}) {
  const {
    kind = "item",
    formatItem = (item) => [buildReviewLabel(item)],
    initialValue = (item) => buildReviewLabel(item),
    applyEditedValue = (_item, value) => value,
    defaultKeep = true,
  } = options;

  const accepted = [];

  if (items.length === 0) {
    return accepted;
  }

  console.log(`\n  ${heading}:`);
  for (const [index, item] of items.entries()) {
    console.log("");
    console.log(`    ${index + 1}. ${buildReviewLabel(item)}`);
    for (const line of formatItem(item)) {
      console.log(`       ${line}`);
    }

    const action = await prompt.choose(
      `Keep, edit, or skip this ${kind}?`,
      ["y", "e", "n", "a", "s"],
      defaultKeep ? "y" : "n",
    );

    if (action === "a") {
      accepted.push(item, ...items.slice(index + 1));
      break;
    }

    if (action === "s") {
      break;
    }

    if (action === "y") {
      accepted.push(item);
      continue;
    }

    if (action === "e") {
      const editedValue = await prompt.ask(`Updated ${kind}`, initialValue(item));
      const nextItem = applyEditedValue(item, editedValue);
      if (nextItem) {
        accepted.push(nextItem);
      }
    }
  }

  console.log("");
  return accepted;
}

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

    function choose(question, choices, defaultChoice) {
      const hint = `[${choices.join("/")}]`;
      process.stderr.write(`  ${question} ${hint} `);
      const rawAnswer = (lineIndex < lines.length) ? lines[lineIndex++].trim().toLowerCase() : "";
      process.stderr.write(`${rawAnswer}\n`);
      if (rawAnswer === "") return Promise.resolve(defaultChoice);
      return Promise.resolve(choices.includes(rawAnswer) ? rawAnswer : defaultChoice);
    }

    function close() { /* no-op for buffered mode */ }

    return { ask, confirm, choose, close };
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

  function choose(question, choices, defaultChoice) {
    const hint = `[${choices.join("/")}]`;
    return new Promise((resolve) => {
      rl.question(`  ${question} ${hint} `, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "") {
          resolve(defaultChoice);
          return;
        }
        resolve(choices.includes(trimmed) ? trimmed : defaultChoice);
      });
    });
  }

  return { ask, confirm, choose, close };
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
export async function runGuidedSetup(targetRoot, baseSpec, options = {}) {
  const prompt = await createPrompt();

  try {
    console.log("\n  Scanning project...\n");

    const detected = introspectProject(targetRoot);
    let greenfield = null;

    if ((detected.runtimes ?? []).length === 0) {
      console.log("  No dominant stack signals found yet.");
      console.log(`  Starter presets: ${Object.keys(STARTER_PRESETS).join(", ")}`);
      console.log("  You can also enter raw stacks like typescript, python, go, rails, dotnet, react-native.");
      const stackAnswer = await prompt.ask(
        `Starter template(s) or stacks (comma-separated, e.g. ${STACK_CHOICE_HINT})`,
        "",
      );
      greenfield = buildGreenfieldContext(normalizeListInput(stackAnswer));
      if (greenfield.runtimes.length > 0) {
        console.log(`  Using starter stack: ${greenfield.runtimes.join(", ")}`);
      }
    }

    const effectiveRuntimes = detected.runtimes.length > 0 ? detected.runtimes : (greenfield?.runtimes ?? []);
    let effectivePackageManager = detected.packageManager;
    if (!effectivePackageManager && greenfield?.stackChoices?.some((choice) => NODE_STACK_CHOICES.has(choice) || choice === "nextjs" || choice === "react-native" || choice === "cli")) {
      const selectedPackageManager = await prompt.ask("Node.js package manager", "npm");
      effectivePackageManager = selectedPackageManager.trim() || "npm";
    }

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
    const detectedComponents = detected.components.length > 0
      ? formatDetectedComponents(detected.components)
      : (greenfield?.components ?? []);
    if (detectedComponents.length > 0) {
      const reviewedComponents = await reviewSuggestedEntries(prompt, "Suggested components", detectedComponents, {
        kind: "component",
        formatItem: (item) => [`source: ${detected.components.find((entry) => `${entry.type}: ${entry.detail}` === item)?.source ?? "stack choice"}`],
        initialValue: (item) => item,
        applyEditedValue: (_item, value) => value.trim() || null,
      });
      if (reviewedComponents.length > 0) {
        components = reviewedComponents;
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
    const suggestedPmRule = suggestPackageManagerRule(effectivePackageManager);
    if (suggestedPmRule) {
      packageManagerRule = suggestedPmRule;
      console.log(`\n  Package manager: ${effectivePackageManager}${detected.packageManager ? " (auto-detected)" : " (chosen for starter stack)"}`);
    }

    // --- Runtime rule ---
    let runtimeRule = baseSpec.workspaceInstructions.runtimeRule;
    const suggestedRtRule = suggestRuntimeRule(effectiveRuntimes);
    if (suggestedRtRule) {
      runtimeRule = suggestedRtRule;
      console.log(`  Runtimes: ${effectiveRuntimes.join(", ")}${detected.runtimes.length > 0 ? " (auto-detected)" : " (chosen for starter stack)"}`);
    }

    // --- Deep inference ---
    const evidence = deepIntrospect(targetRoot);
    const suggestedValidation = inferValidation(evidence);
    const effectiveValidation = suggestedValidation.length > 0
      ? suggestedValidation
      : buildGreenfieldValidation(greenfield ?? { stackChoices: [], validation: [] }, effectivePackageManager);
    const suggestedSections = inferSections(evidence, { seededStacks: greenfield?.stackChoices ?? [] });
    const suggestedChecklist = inferChecklist(evidence);

    // --- Suggested validation commands ---
    let acceptedValidation = null;
    if (effectiveValidation.length > 0) {
      const reviewedValidation = await reviewSuggestedEntries(prompt, "Suggested validation commands", effectiveValidation, {
        kind: "validation command",
        formatItem: (item) => [`[${item.provenance}] ${item.value}`, `from ${item.source}`],
        initialValue: (item) => item.value,
        applyEditedValue: (item, value) => {
          const trimmed = value.trim();
          return trimmed ? { ...item, value: trimmed } : null;
        },
      });
      acceptedValidation = reviewedValidation.map((item) => item.value);
    }

    // --- Suggested workspace sections ---
    let acceptedSections = null;
    if (suggestedSections.length > 0) {
      const reviewedSections = await reviewSuggestedEntries(prompt, "Suggested workspace sections", suggestedSections, {
        kind: "section",
        formatItem: (section) => {
          const details = section.rules.map((rule) => `[${rule.provenance}] ${rule.value}`);
          const source = section.rules[0]?.source;
          if (source) details.unshift(`from ${source}`);
          return details;
        },
        initialValue: (section) => section.title,
        applyEditedValue: (section, value) => {
          const trimmed = value.trim();
          return trimmed ? { ...section, title: trimmed } : null;
        },
      });
      acceptedSections = reviewedSections.map((section) => ({
        title: section.title,
        rules: section.rules.map((rule) => rule.value),
      }));
    }

    // --- Review checklist ---
    console.log("");
    const includeChecklist = await prompt.confirm("Include review checklist?", true);

    // --- Suggested review checklist items ---
    let acceptedChecklist = null;
    if (includeChecklist && suggestedChecklist.items.length > 0) {
      const reviewedChecklistItems = await reviewSuggestedEntries(prompt, "Suggested review checklist enhancements", suggestedChecklist.items, {
        kind: "checklist item",
        formatItem: (item) => [`[${item.provenance}] ${item.value}`, `from ${item.source}`],
        initialValue: (item) => item.value,
        applyEditedValue: (item, value) => {
          const trimmed = value.trim();
          return trimmed ? { ...item, value: trimmed } : null;
        },
      });
      acceptedChecklist = {
        ...suggestedChecklist,
        items: reviewedChecklistItems,
      };
    }

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
    if (options.profileApplied) {
      console.log("\n  ---");
      console.log("  NOTE: Built-in profiles are starter references.");
      console.log("  Replace the generated procedures, validation commands, coding");
      console.log("  standards, and skills with repository-specific decisions before");
      console.log("  treating the output as authoritative memory.");
      console.log("  ---\n");
    }

    const acceptedSectionCount = spec.workspaceInstructions.sections?.length ?? 0;
    const acceptedValidationCount = spec.workspaceInstructions.validation?.length ?? 0;
    const acceptedChecklistCount = spec.reviewChecklist?.items?.length ?? 0;
    console.log("  Starter draft summary:");
    console.log(`    - ${components.length} component suggestion(s) kept`);
    console.log(`    - ${acceptedValidationCount} validation command(s) in the draft spec`);
    console.log(`    - ${acceptedSectionCount} workspace section(s) in the draft spec`);
    if (spec.reviewChecklist) {
      console.log(`    - review checklist kept with ${acceptedChecklistCount} item(s)`);
    } else {
      console.log("    - review checklist skipped");
    }
    console.log("    - generated files are starter outputs until the spec matches the real project\n");

    return spec;
  } finally {
    prompt.close();
  }
}
