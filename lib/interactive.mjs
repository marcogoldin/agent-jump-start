// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createInterface } from "node:readline";
import { introspectProject, formatDetectedComponents, suggestPackageManagerRule, suggestRuntimeRule, deepIntrospect, baselineValidationForRuntimes } from "./introspection.mjs";
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
const CORE_PRESET_SLUGS = ["fullstack-web", "nextjs-app", "fastapi-api", "rails-app", "flutter-app"];
const STACK_CHOICE_HINT = "fullstack-web, nextjs-app, fastapi-api, rails-app, flutter-app";

const GREENFIELD_CATEGORIES = [
  { label: "Full-stack web", presets: ["fullstack-web", "nextjs-app"] },
  { label: "Web app", presets: ["nextjs-app", "react-web", "django-app", "laravel-app", "rails-app"] },
  { label: "API service", presets: ["node-api", "fastapi-api", "go-service", "rust-service", "spring-api", "dotnet-api"] },
  { label: "Mobile", presets: ["react-native-app", "flutter-app"] },
  { label: "CLI/tool", presets: ["cli-tool"] },
  { label: "Other", presets: null },
];
const GREENFIELD_SKIP_TOKENS = new Set(["skip"]);
const GREENFIELD_ABORT_TOKENS = new Set(["abort", "cancel", "quit", "exit"]);

function isKnownStackToken(token) {
  if (!token) return false;
  if (STARTER_PRESETS[token]) return true;
  if (STACK_RUNTIME_HINTS.has(token)) return true;
  if (NODE_STACK_CHOICES.has(token)) return true;
  return false;
}

function validateStackTokens(tokens) {
  const unknown = tokens.filter((t) => !isKnownStackToken(t));
  return { ok: unknown.length === 0, unknown };
}

function describePreset(slug) {
  const preset = STARTER_PRESETS[slug];
  if (!preset) return slug;
  return `${preset.components.join(" + ")}`;
}

function printPresetList(slugs, heading = "Core starter presets") {
  console.log(`  ${heading}:`);
  for (const slug of slugs) {
    console.log(`    - ${slug}: ${describePreset(slug)}`);
  }
}

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

export function normalizeChoiceDefinitions(choices, labels = {}) {
  return choices.map((choice) => {
    if (typeof choice === "string") {
      const label = labels[choice] ?? choice;
      return {
        key: choice.toLowerCase(),
        label,
        aliases: [choice, label],
      };
    }

    const key = String(choice.key ?? "").trim().toLowerCase();
    const label = String(choice.label ?? key).trim();
    const aliases = uniqueStrings([
      key,
      label,
      ...(choice.aliases ?? []),
    ].map((entry) => String(entry).trim().toLowerCase()).filter(Boolean));

    return { key, label, aliases };
  });
}

export function formatChoiceHint(choiceDefinitions, defaultChoice) {
  const normalizedDefault = String(defaultChoice ?? "").trim().toLowerCase();
  return `[${choiceDefinitions.map((choice) => {
    const shortcut = choice.key === normalizedDefault
      ? choice.key.toUpperCase()
      : choice.key;
    return `${choice.label} (${shortcut})`;
  }).join(", ")}]`;
}

export function resolveChoiceInput(rawAnswer, choiceDefinitions, defaultChoice) {
  const normalizedAnswer = String(rawAnswer ?? "").trim().toLowerCase();
  if (!normalizedAnswer) return defaultChoice;

  const matchedChoice = choiceDefinitions.find((choice) =>
    choice.aliases.includes(normalizedAnswer));

  return matchedChoice?.key ?? defaultChoice;
}

function summarizeAbsorbCandidate(candidate) {
  const rules = (candidate.sections ?? []).reduce((count, section) => count + (section.rules?.length ?? 0), 0);
  const validation = candidate.validation?.length ?? 0;
  return `${rules} rules, ${validation} validation commands`;
}

/**
 * Interactive absorb review.
 *
 * Returns per-file decisions with optional merge targets.
 */
export async function runAbsorbReview(candidates, { logger = console } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  const decisions = [];

  function ask(question) {
    return new Promise((resolveAnswer) => {
      rl.question(question, (answer) => resolveAnswer(String(answer ?? "").trim()));
    });
  }

  function printCandidatePreview(candidate) {
    logger.log(`\nPreview: ${candidate.source.relativePath}`);
    if ((candidate.validation?.length ?? 0) > 0) {
      logger.log("  Validation:");
      for (const item of candidate.validation.slice(0, 8)) logger.log(`    - ${item.value}`);
    }
    if ((candidate.sections?.length ?? 0) > 0) {
      logger.log("  Sections:");
      for (const section of candidate.sections.slice(0, 8)) {
        logger.log(`    - ${section.title}: ${(section.rules ?? []).length} rule(s)`);
      }
    }
    if ((candidate.extractorNotes?.length ?? 0) > 0) {
      logger.log("  Notes:");
      for (const note of candidate.extractorNotes.slice(0, 4)) logger.log(`    - ${note}`);
    }
    logger.log("");
  }

  const choiceDefinitions = normalizeChoiceDefinitions([
    { key: "p", label: "primary", aliases: ["use", "primary"] },
    { key: "m", label: "merge", aliases: ["merge"] },
    { key: "s", label: "skip", aliases: ["skip"] },
    { key: "v", label: "view", aliases: ["view", "preview"] },
    { key: "q", label: "quit", aliases: ["quit", "abort"] },
  ]);

  try {
    logger.log("\nAgent Jump Start — absorb\n");
    logger.log(`Found ${candidates.length} unmanaged instruction file(s):\n`);
    candidates.forEach((candidate, index) => {
      const label = `[${index + 1}]`.padEnd(4);
      logger.log(`  ${label} ${candidate.source.relativePath.padEnd(40)} (${candidate.source.toolOfOrigin}, ${candidate.source.scope}) confidence: ${candidate.overallConfidence.toUpperCase()}`);
      logger.log(`      ${summarizeAbsorbCandidate(candidate)}`);
    });
    logger.log("");

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const defaultChoice = candidate.overallConfidence === "low" ? "s" : "p";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const hint = formatChoiceHint(choiceDefinitions, defaultChoice);
        const raw = await ask(`File ${index + 1} of ${candidates.length} — ${candidate.source.relativePath} ${hint}: `);
        const resolved = resolveChoiceInput(raw, choiceDefinitions, defaultChoice);

        if (resolved === "q") {
          return { cancelled: true, decisions: [] };
        }
        if (resolved === "v") {
          printCandidatePreview(candidate);
          continue;
        }
        if (resolved === "s") {
          decisions.push({
            relativePath: candidate.source.relativePath,
            fileChoice: "skip",
            areaOverrides: { validation: "inherit", sections: "inherit" },
          });
          break;
        }
        if (resolved === "p") {
          decisions.push({
            relativePath: candidate.source.relativePath,
            fileChoice: "primary",
            areaOverrides: { validation: "inherit", sections: "inherit" },
          });
          break;
        }

        const mergeable = candidates
          .map((entry) => entry.source.relativePath)
          .filter((path) => path !== candidate.source.relativePath);
        if (mergeable.length === 0) {
          logger.log("  No merge target available yet. Choose primary or skip.");
          continue;
        }
        logger.log("  Merge target options:");
        mergeable.forEach((path, targetIndex) => logger.log(`    [${targetIndex + 1}] ${path}`));
        const targetRaw = await ask("  Merge into [number]: ");
        const targetIndex = Number.parseInt(targetRaw, 10);
        const mergeInto = mergeable[targetIndex - 1];
        if (!mergeInto) {
          logger.log("  Invalid merge target. Try again.");
          continue;
        }
        decisions.push({
          relativePath: candidate.source.relativePath,
          fileChoice: "merge",
          mergeInto,
          areaOverrides: { validation: "inherit", sections: "inherit" },
        });
        break;
      }
    }
  } finally {
    rl.close();
  }

  return { cancelled: false, decisions };
}

const REVIEW_ACTION_CHOICES = [
  { key: "y", label: "keep", aliases: ["yes"] },
  { key: "e", label: "edit" },
  { key: "n", label: "skip", aliases: ["no"] },
  {
    key: "a",
    label: "keep all remaining",
    aliases: ["all", "accept all", "keep all", "keep remaining"],
  },
  {
    key: "s",
    label: "skip all remaining",
    aliases: ["skip all", "skip remaining"],
  },
];

const GROUP_REVIEW_CHOICES = [
  { key: "y", label: "keep all", aliases: ["yes", "keep", "accept all"] },
  { key: "r", label: "review one by one", aliases: ["review", "review individually", "one by one"] },
  { key: "n", label: "skip all", aliases: ["no", "skip"] },
];

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

function createReviewStats() {
  return {
    kept: 0,
    edited: 0,
    skipped: 0,
    bulkKept: 0,
    bulkSkipped: 0,
    bySource: {},
  };
}

function getReviewItemSource(item) {
  if (!item || typeof item === "string") return null;
  if (typeof item.source === "string" && item.source) return item.source;
  if (Array.isArray(item.rules) && item.rules[0]?.source) return item.rules[0].source;
  return null;
}

function getReviewSourceGroup(item) {
  const source = getReviewItemSource(item);
  if (!source) return null;
  if (source.startsWith("package.json scripts.")) return "package.json scripts";
  if (source.startsWith("pyproject.toml")) return "pyproject.toml";
  if (source.startsWith("Makefile")) return "Makefile";
  if (source.startsWith(".github/workflows")) return ".github/workflows";
  if (source.startsWith("validation commands")) return "validation commands";
  return source;
}

function recordReviewDecision(stats, source, field, count = 1) {
  stats[field] += count;
  if (!source) return;
  if (!stats.bySource[source]) {
    stats.bySource[source] = {
      kept: 0,
      edited: 0,
      skipped: 0,
      bulkKept: 0,
      bulkSkipped: 0,
    };
  }
  stats.bySource[source][field] += count;
}

async function reviewItemsIndividually(prompt, items, options, accepted, stats) {
  const {
    kind = "item",
    formatItem = (item) => [buildReviewLabel(item)],
    initialValue = (item) => buildReviewLabel(item),
    applyEditedValue = (_item, value) => value,
    defaultKeep = true,
    promptLabel = () => `Keep, edit, or skip this ${kind}?`,
  } = options;

  for (const [index, item] of items.entries()) {
    const source = getReviewSourceGroup(item);
    console.log("");
    console.log(`    ${index + 1}. ${buildReviewLabel(item)}`);
    for (const line of formatItem(item)) {
      console.log(`       ${line}`);
    }

    const action = await prompt.choose(
      promptLabel(item),
      REVIEW_ACTION_CHOICES,
      defaultKeep ? "y" : "n",
    );

    if (action === "a") {
      accepted.push(item, ...items.slice(index + 1));
      recordReviewDecision(stats, source, "kept", 1);
      for (const remaining of items.slice(index + 1)) {
        recordReviewDecision(stats, getReviewSourceGroup(remaining), "kept", 1);
      }
      break;
    }

    if (action === "s") {
      recordReviewDecision(stats, source, "skipped", 1);
      for (const remaining of items.slice(index + 1)) {
        recordReviewDecision(stats, getReviewSourceGroup(remaining), "skipped", 1);
      }
      break;
    }

    if (action === "y") {
      accepted.push(item);
      recordReviewDecision(stats, source, "kept", 1);
      continue;
    }

    if (action === "e") {
      const editedValue = await prompt.ask(`Updated ${kind}`, initialValue(item));
      const nextItem = applyEditedValue(item, editedValue);
      if (nextItem) {
        accepted.push(nextItem);
        recordReviewDecision(stats, source, "edited", 1);
      } else {
        recordReviewDecision(stats, source, "skipped", 1);
      }
      continue;
    }

    recordReviewDecision(stats, source, "skipped", 1);
  }
}

export async function reviewSuggestedEntries(prompt, heading, items, options = {}) {
  const {
    groupBySource = items.length >= 6,
  } = options;
  const accepted = [];
  const stats = createReviewStats();

  if (items.length === 0) {
    return { accepted, stats };
  }

  console.log(`\n  ${heading}:`);

  if (groupBySource) {
    const sourceGroups = [];
    const groupedSources = new Set();

    for (const item of items) {
      const source = getReviewSourceGroup(item);
      if (!source || groupedSources.has(source)) continue;
      const groupItems = items.filter((entry) => getReviewSourceGroup(entry) === source);
      if (groupItems.length <= 1) continue;
      groupedSources.add(source);
      sourceGroups.push({ source, items: groupItems });
    }

    for (const group of sourceGroups) {
      const action = await prompt.choose(
        `Keep all ${group.items.length} ${options.kind ?? "items"} from ${group.source}?`,
        GROUP_REVIEW_CHOICES,
        "y",
      );

      if (action === "y") {
        accepted.push(...group.items);
        recordReviewDecision(stats, group.source, "kept", group.items.length);
        recordReviewDecision(stats, group.source, "bulkKept", group.items.length);
        continue;
      }

      if (action === "n") {
        recordReviewDecision(stats, group.source, "skipped", group.items.length);
        recordReviewDecision(stats, group.source, "bulkSkipped", group.items.length);
        continue;
      }

      await reviewItemsIndividually(prompt, group.items, options, accepted, stats);
    }

    const remainingItems = items.filter((item) => {
      const source = getReviewSourceGroup(item);
      return !source || !groupedSources.has(source);
    });
    if (remainingItems.length > 0) {
      await reviewItemsIndividually(prompt, remainingItems, options, accepted, stats);
    }
  } else {
    await reviewItemsIndividually(prompt, items, options, accepted, stats);
  }

  console.log("");
  return { accepted, stats };
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

    function choose(question, choices, defaultChoice, labels = {}) {
      const choiceDefinitions = normalizeChoiceDefinitions(choices, labels);
      const hint = formatChoiceHint(choiceDefinitions, defaultChoice);
      process.stderr.write(`  ${question} ${hint} `);
      const rawAnswer = (lineIndex < lines.length) ? lines[lineIndex++].trim().toLowerCase() : "";
      process.stderr.write(`${rawAnswer}\n`);
      return Promise.resolve(resolveChoiceInput(rawAnswer, choiceDefinitions, defaultChoice));
    }

    function isInputExhausted() {
      return lineIndex >= lines.length;
    }

    function close() { /* no-op for buffered mode */ }

    return { ask, confirm, choose, close, isTTY: false, isInputExhausted };
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

  function choose(question, choices, defaultChoice, labels = {}) {
    const choiceDefinitions = normalizeChoiceDefinitions(choices, labels);
    const hint = formatChoiceHint(choiceDefinitions, defaultChoice);
    return new Promise((resolve) => {
      rl.question(`  ${question} ${hint} `, (answer) => {
        resolve(resolveChoiceInput(answer, choiceDefinitions, defaultChoice));
      });
    });
  }

  function isInputExhausted() {
    return false;
  }

  return { ask, confirm, choose, close, isTTY: true, isInputExhausted };
}

/**
 * Ask the operator to pick a starter stack. Uses a numbered category menu as
 * the primary UX, but still accepts raw preset slugs or stack aliases (typed
 * directly or comma-separated). Unknown tokens are rejected with an
 * actionable error and the prompt is re-asked until the operator makes an
 * explicit choice, so cascade-shifted answers (e.g. typing a project name at
 * the stack prompt) cannot silently advance.
 */
function throwStackSelectionIncomplete() {
  throw new Error('Starter selection was not completed. Re-run init and choose a category, a preset slug, a stack name, type "skip", or type "abort".');
}

function shouldAbortGreenfieldSelection(raw) {
  return GREENFIELD_ABORT_TOKENS.has(normalizeStackSelection(raw));
}

function shouldSkipGreenfieldSelection(raw) {
  return GREENFIELD_SKIP_TOKENS.has(normalizeStackSelection(raw));
}

function printGreenfieldSelectionHint() {
  console.log('  Type a number (1-6), a preset slug, or a stack name. Type "skip" for a generic draft or "abort" to stop without writing files.');
}

export async function askGreenfieldStack(prompt) {
  console.log("  No dominant stack signals found yet. Pick a starter:");
  GREENFIELD_CATEGORIES.forEach((category, idx) => {
    console.log(`    ${idx + 1}) ${category.label}`);
  });
  printGreenfieldSelectionHint();

  while (true) {
    const raw = (await prompt.ask("Starter template(s) or stacks", "")).trim();

    if (!raw) {
      console.log('  No starter selected yet. Choose a category, type a preset slug, or type "skip" if you want a generic draft.');
      if (prompt.isInputExhausted()) {
        throwStackSelectionIncomplete();
      }
      continue;
    }

    if (shouldAbortGreenfieldSelection(raw)) {
      throw new Error('Init aborted before any files were written. Re-run init when you are ready to choose a starter.');
    }

    if (shouldSkipGreenfieldSelection(raw)) {
      console.log("  Continuing without a starter stack. The first draft will stay generic until you refine it.");
      return buildGreenfieldContext([]);
    }

    // Category number (1-6)
    const numeric = Number.parseInt(raw, 10);
    if (!Number.isNaN(numeric) && String(numeric) === raw.trim()) {
      const category = GREENFIELD_CATEGORIES[numeric - 1];
      if (!category) {
        console.log(`  "${raw}" is not a valid category. Choose 1-${GREENFIELD_CATEGORIES.length}.`);
        continue;
      }
      if (category.presets === null) {
        printPresetList(Object.keys(STARTER_PRESETS), "All starter presets");
        continue;
      }
      printPresetList(category.presets, `${category.label} presets`);
      const subRaw = (await prompt.ask("Preset slug or stack name", category.presets[0])).trim();
      if (!subRaw) {
        console.log('  Choose one of the listed presets, type a stack name, "skip", or "abort".');
        if (prompt.isInputExhausted()) {
          throwStackSelectionIncomplete();
        }
        continue;
      }
      if (shouldAbortGreenfieldSelection(subRaw)) {
        throw new Error('Init aborted before any files were written. Re-run init when you are ready to choose a starter.');
      }
      if (shouldSkipGreenfieldSelection(subRaw)) {
        console.log("  Continuing without a starter stack. The first draft will stay generic until you refine it.");
        return buildGreenfieldContext([]);
      }
      const subTokens = normalizeListInput(subRaw);
      const { ok, unknown } = validateStackTokens(subTokens);
      if (!ok) {
        console.log(`  Unknown: ${unknown.join(", ")}. Try one of: ${category.presets.join(", ")}.`);
        if (prompt.isInputExhausted()) {
          throwStackSelectionIncomplete();
        }
        continue;
      }
      return buildGreenfieldContext(subTokens);
    }

    const tokens = normalizeListInput(raw);
    const { ok, unknown } = validateStackTokens(tokens);
    if (ok) {
      return buildGreenfieldContext(tokens);
    }

    console.log(`  Unknown stack/preset: ${unknown.map((u) => `"${u}"`).join(", ")}.`);
    console.log(`  Valid presets: ${Object.keys(STARTER_PRESETS).join(", ")}.`);
    console.log(`  Valid stack names: ${[...STACK_RUNTIME_HINTS.keys()].join(", ")}.`);
    console.log('  Type "skip" for a generic draft or "abort" to stop without writing files.');
    if (prompt.isInputExhausted()) {
      throwStackSelectionIncomplete();
    }
  }
}

/**
 * Show a one-screen summary of the built spec and let the operator confirm,
 * abort, or edit a specific field before writeback. Returns the (possibly
 * edited) spec.
 */
async function confirmSpecBeforeWriteback(prompt, spec) {
  while (true) {
    console.log("\n  Spec summary (will be written to canonical-spec.yaml):");
    console.log(`    name:           ${spec.project.name ?? "(empty)"}`);
    console.log(`    summary:        ${spec.project.summary ?? "(empty)"}`);
    const components = spec.project.components ?? [];
    console.log(`    components:     ${components.length === 0 ? "(none)" : components.join(", ")}`);
    console.log(`    runtime rule:   ${spec.workspaceInstructions?.runtimeRule ?? "(default)"}`);
    console.log(`    package mgr:    ${spec.workspaceInstructions?.packageManagerRule ?? "(default)"}`);
    const validationCount = spec.workspaceInstructions?.validation?.length ?? 0;
    console.log(`    validation:     ${validationCount} command(s)`);

    const decision = await prompt.choose(
      "Looks right?",
      [
        { key: "y", label: "yes", aliases: ["yes", "ok", "confirm"] },
        { key: "e", label: "edit a field", aliases: ["edit", "fix"] },
        { key: "n", label: "abort", aliases: ["no", "cancel"] },
      ],
      "y",
    );

    if (decision === "y") return { spec, aborted: false };
    if (decision === "n") return { spec, aborted: true };

    const field = await prompt.ask("Which field? (name / summary / components / runtime / package manager / validation / checklist)", "name");
    const normalized = field.trim().toLowerCase();
    if (normalized === "name") {
      spec.project.name = (await prompt.ask("Project name", spec.project.name)).trim() || spec.project.name;
    } else if (normalized === "summary") {
      spec.project.summary = (await prompt.ask("Project summary", spec.project.summary)).trim() || spec.project.summary;
    } else if (normalized === "components") {
      const raw = await prompt.ask("Components (comma-separated)", components.join(", "));
      const parsed = raw.split(",").map((c) => c.trim()).filter(Boolean);
      if (parsed.length > 0) spec.project.components = parsed;
    } else if (normalized === "runtime" || normalized === "runtime rule") {
      spec.workspaceInstructions.runtimeRule = (await prompt.ask("Runtime rule", spec.workspaceInstructions?.runtimeRule ?? "")).trim()
        || spec.workspaceInstructions.runtimeRule;
    } else if (normalized === "package manager" || normalized === "package manager rule" || normalized === "package") {
      spec.workspaceInstructions.packageManagerRule = (await prompt.ask("Package manager rule", spec.workspaceInstructions?.packageManagerRule ?? "")).trim()
        || spec.workspaceInstructions.packageManagerRule;
    } else if (normalized === "validation" || normalized === "validation commands") {
      const raw = await prompt.ask(
        "Validation commands (comma-separated)",
        (spec.workspaceInstructions?.validation ?? []).join(", "),
      );
      const parsed = raw.split(",").map((value) => value.trim()).filter(Boolean);
      spec.workspaceInstructions.validation = parsed;
    } else if (normalized === "checklist" || normalized === "review checklist") {
      const keepChecklist = await prompt.confirm(
        "Keep the review checklist in this draft?",
        Boolean(spec.reviewChecklist),
      );
      if (keepChecklist) {
        if (!spec.reviewChecklist) {
          spec.reviewChecklist = {
            intro: "Review checklist.",
            failureThreshold: 2,
            items: [],
            quickSignals: [],
            redFlags: [],
          };
        }
      } else {
        delete spec.reviewChecklist;
      }
    } else {
      console.log('  Unknown field. Choose name, summary, components, runtime, package manager, validation, or checklist.');
    }
  }
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
      greenfield = await askGreenfieldStack(prompt);
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
    const decisionReport = {
      edited: [],
      skipped: [],
      stats: {},
    };
    const detectedComponents = detected.components.length > 0
      ? formatDetectedComponents(detected.components)
      : (greenfield?.components ?? []);
    if (detectedComponents.length > 0) {
      const { accepted: reviewedComponents, stats } = await reviewSuggestedEntries(prompt, "Suggested components", detectedComponents, {
        kind: "component",
        formatItem: (item) => {
          const entry = detected.components.find((candidate) => `${candidate.type}: ${candidate.detail}` === item);
          if (!entry) return ["source: stack choice"];
          return [
            `ownership: ${entry.ownership ?? "starter"}`,
            `source: ${entry.source ?? "stack choice"}`,
          ];
        },
        initialValue: (item) => item,
        applyEditedValue: (_item, value) => value.trim() || null,
        promptLabel: (item) => {
          const entry = detected.components.find((candidate) => `${candidate.type}: ${candidate.detail}` === item);
          if (entry?.ownership === "primary") return "This is a primary component — keep, edit, or skip?";
          if (entry?.ownership === "secondary") return "This is a secondary component — keep, edit, or skip?";
          return "Keep, edit, or skip this component?";
        },
      });
      decisionReport.stats.components = stats;
      if (reviewedComponents.length > 0) {
        components = reviewedComponents;
        if (stats.edited > 0) {
          decisionReport.edited.push({ category: "components", path: "project.components" });
        }
        if (reviewedComponents.length === 0 || stats.skipped >= detectedComponents.length) {
          decisionReport.skipped.push({ category: "components", path: "project.components" });
        }
      } else {
        const custom = await prompt.ask("Components (comma-separated, or press Enter to skip)", "");
        if (custom) {
          components = custom.split(",").map((c) => c.trim()).filter(Boolean);
        } else {
          decisionReport.skipped.push({ category: "components", path: "project.components" });
        }
      }
    } else {
      const custom = await prompt.ask("Components (comma-separated, e.g. 'api: Express service, web: React app')", "");
      if (custom) {
        components = custom.split(",").map((c) => c.trim()).filter(Boolean);
      } else {
        decisionReport.skipped.push({ category: "components", path: "project.components" });
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
    let effectiveValidation;
    if (suggestedValidation.length > 0) {
      effectiveValidation = suggestedValidation;
    } else if (greenfield) {
      effectiveValidation = buildGreenfieldValidation(greenfield, effectivePackageManager);
    } else {
      // Detection succeeded (e.g. a .csproj was found) but deepIntrospect
      // found no explicit scripts. Seed baseline commands from runtimes.
      const baseline = baselineValidationForRuntimes(effectiveRuntimes, effectivePackageManager);
      effectiveValidation = baseline.map((value) => ({
        value,
        provenance: "inferred",
        source: `${effectiveRuntimes.join("+") || "runtime"} baseline`,
      }));
    }
    const suggestedSections = inferSections(evidence, { seededStacks: greenfield?.stackChoices ?? [] });
    const suggestedChecklist = inferChecklist(evidence);

    // --- Suggested validation commands ---
    let acceptedValidation = null;
    if (effectiveValidation.length > 0) {
      const { accepted: reviewedValidation, stats } = await reviewSuggestedEntries(prompt, "Suggested validation commands", effectiveValidation, {
        kind: "validation command",
        formatItem: (item) => [`[${item.provenance}] ${item.value}`, `from ${item.source}`],
        initialValue: (item) => item.value,
        applyEditedValue: (item, value) => {
          const trimmed = value.trim();
          return trimmed ? { ...item, value: trimmed } : null;
        },
      });
      decisionReport.stats.validation = stats;
      acceptedValidation = reviewedValidation.map((item) => item.value);
      if (stats.edited > 0) {
        decisionReport.edited.push({ category: "validation commands", path: "workspaceInstructions.validation" });
      }
      if (acceptedValidation.length === 0) {
        decisionReport.skipped.push({ category: "validation commands", path: "workspaceInstructions.validation" });
      }
    }

    // --- Suggested workspace sections ---
    let acceptedSections = null;
    if (suggestedSections.length > 0) {
      const { accepted: reviewedSections, stats } = await reviewSuggestedEntries(prompt, "Suggested workspace sections", suggestedSections, {
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
      decisionReport.stats.sections = stats;
      acceptedSections = reviewedSections.map((section) => ({
        title: section.title,
        rules: section.rules.map((rule) => rule.value),
      }));
      if (stats.edited > 0) {
        decisionReport.edited.push({ category: "workspace sections", path: "workspaceInstructions.sections" });
      }
      if (acceptedSections.length === 0) {
        decisionReport.skipped.push({ category: "workspace sections", path: "workspaceInstructions.sections" });
      }
    }

    // --- Review checklist ---
    console.log("");
    const includeChecklist = await prompt.confirm("Include review checklist?", true);

    // --- Suggested review checklist items ---
    let acceptedChecklist = null;
    if (includeChecklist && suggestedChecklist.items.length > 0) {
      const { accepted: reviewedChecklistItems, stats } = await reviewSuggestedEntries(prompt, "Suggested review checklist enhancements", suggestedChecklist.items, {
        kind: "checklist item",
        formatItem: (item) => [`[${item.provenance}] ${item.value}`, `from ${item.source}`],
        initialValue: (item) => item.value,
        applyEditedValue: (item, value) => {
          const trimmed = value.trim();
          return trimmed ? { ...item, value: trimmed } : null;
        },
      });
      decisionReport.stats.checklist = stats;
      acceptedChecklist = {
        ...suggestedChecklist,
        items: reviewedChecklistItems,
      };
      if (stats.edited > 0) {
        decisionReport.edited.push({ category: "review checklist", path: "reviewChecklist.items" });
      }
      if (reviewedChecklistItems.length === 0) {
        decisionReport.skipped.push({ category: "review checklist", path: "reviewChecklist.items" });
      }
    } else if (!includeChecklist) {
      decisionReport.skipped.push({ category: "review checklist", path: "reviewChecklist" });
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
    if (decisionReport.edited.length > 0) {
      console.log(`    - edited: ${decisionReport.edited.map((item) => item.category).join(", ")}`);
    }
    if (decisionReport.skipped.length > 0) {
      console.log(`    - skipped: ${decisionReport.skipped.map((item) => item.category).join(", ")}`);
    }
    console.log("    - generated files are starter outputs until the spec matches the real project\n");

    const { spec: confirmedSpec, aborted } = await confirmSpecBeforeWriteback(prompt, spec);
    if (aborted) {
      throw new Error("Init aborted at confirmation step — no spec was written.");
    }

    return { spec: confirmedSpec, decisionReport };
  } finally {
    prompt.close();
  }
}
