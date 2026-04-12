// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Spec inference engine.
//
// Transforms raw evidence from deepIntrospect() into proposed spec sections
// with provenance labels.  Every inferred item carries a provenance level:
//
//   "detected"  — directly read from a file in the repo (high confidence)
//   "inferred"  — derived from detected signals + heuristics (medium)
//   "default"   — carried forward from the base spec (low / generic)
//
// Public API:
//   inferValidation(evidence)       → LabeledItem[]
//   inferSections(evidence)         → Array<{ title, rules: LabeledItem[] }>
//   inferChecklist(evidence)        → { items, quickSignals, redFlags }
//   buildOverlayFromEvidence(evidence, options) → schema-valid overlay object
// ---------------------------------------------------------------------------

/**
 * @typedef {object} LabeledItem
 * @property {string} value
 * @property {"detected"|"inferred"|"default"} provenance
 * @property {string} source
 */

// ---------------------------------------------------------------------------
// Known pre-commit hook → command mappings
// ---------------------------------------------------------------------------

const PRECOMMIT_COMMAND_MAP = {
  ruff: "ruff check .",
  "ruff-format": "ruff format --check .",
  mypy: "mypy .",
  black: "black --check .",
  isort: "isort --check-only .",
  flake8: "flake8 .",
  pylint: "pylint .",
  eslint: "npx eslint .",
  prettier: "npx prettier --check .",
};

function normalizeValidationCommand(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^npm\s+test$/u, "npm run test")
    .replace(/^npm\s+run\s+type-check$/u, "npm run typecheck")
    .replace(/\s+/gu, " ");
}

function buildTypeScriptRules(source = "TypeScript stack") {
  return [
    { value: "Enable strict mode in tsconfig.json and do not weaken it with skipLibCheck or loose compiler flags.", provenance: "inferred", source },
    { value: "Avoid `any` type annotations. Use `unknown` with narrowing when the type is genuinely dynamic.", provenance: "inferred", source },
    { value: "Prefer explicit return types on exported functions and public API boundaries.", provenance: "inferred", source },
  ];
}

function buildPythonRules(source = "Python stack") {
  return [
    { value: "Keep the project on one supported Python version range and reflect it consistently in tooling, CI, and packaging metadata.", provenance: "inferred", source },
    { value: "Prefer typed function signatures and avoid unreviewed `Any`-style escape hatches or blanket ignore directives.", provenance: "inferred", source },
    { value: "Keep application entrypoints, worker code, and service modules explicit rather than hiding behavior in import side effects.", provenance: "inferred", source },
  ];
}

// ---------------------------------------------------------------------------
// inferValidation
// ---------------------------------------------------------------------------

/**
 * Infer validation commands from deep introspection evidence.
 *
 * Priority order:
 *   1. package.json scripts (detected)
 *   2. pyproject.toml [project.scripts] (detected)
 *   3. Makefile/justfile targets (detected)
 *   4. CI workflow run commands (inferred)
 *   5. Pre-commit hook → command mappings (inferred)
 *
 * Deduplicates by normalized command string.  Caps at 8 commands.
 *
 * @param {object} evidence — result of deepIntrospect()
 * @returns {LabeledItem[]}
 */
export function inferValidation(evidence) {
  /** @type {LabeledItem[]} */
  const items = [];
  const seen = new Set();

  function add(value, provenance, source) {
    const normalized = normalizeValidationCommand(value);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    items.push({ value: value.trim(), provenance, source });
  }

  // Priority 1: package.json scripts
  for (const s of evidence.scripts ?? []) {
    add(s.command, "detected", s.source);
  }

  // Priority 2: pyproject.toml [project.scripts]
  for (const s of (evidence.pyprojectTools?.scripts ?? [])) {
    add(s.command, "detected", s.source);
  }

  // Priority 3: Makefile/justfile targets
  for (const t of evidence.makeTargets ?? []) {
    add(t.command, "detected", t.source);
  }

  // Priority 4: CI workflow run commands
  for (const step of evidence.ciSteps ?? []) {
    add(step.command, "inferred", step.source);
  }

  // Priority 5: Pre-commit hooks → known commands
  for (const hook of evidence.preCommitHooks ?? []) {
    const cmd = PRECOMMIT_COMMAND_MAP[hook.id];
    if (cmd && !seen.has(cmd.toLowerCase())) {
      add(cmd, "inferred", hook.source);
    }
  }

  return items.slice(0, 8);
}

// ---------------------------------------------------------------------------
// inferSections
// ---------------------------------------------------------------------------

/**
 * Infer workspace instruction sections from deep introspection evidence.
 *
 * Always produces at least one section (General rules as default).
 * Adds stack-specific sections based on detected signals.
 *
 * @param {object} evidence — result of deepIntrospect()
 * @returns {Array<{ title: string, rules: LabeledItem[] }>}
 */
export function inferSections(evidence, options = {}) {
  const sections = [];
  const base = evidence.base ?? {};
  const signals = base.signals ?? [];
  const linterConfigs = evidence.linterConfigs ?? [];
  const conventions = evidence.conventions ?? [];
  const seededStacks = new Set((options.seededStacks ?? []).map((value) => value.toLowerCase()));
  const typeScriptSignal = signals.find((s) => s.detail === "TypeScript" || s.detail === "TypeScript project");

  // --- TypeScript section ---
  const hasTypeScript = Boolean(typeScriptSignal) || seededStacks.has("typescript");
  if (hasTypeScript) {
    sections.push({
      title: "TypeScript rules",
      rules: buildTypeScriptRules(
        typeScriptSignal?.file
          ?? typeScriptSignal?.source
          ?? (seededStacks.has("typescript") ? "TypeScript stack choice" : "TypeScript stack"),
      ),
    });
  }

  // --- Python section ---
  const hasPython = (base.runtimes ?? []).includes("Python")
    || (evidence.pyprojectTools?.tools ?? []).length > 0
    || seededStacks.has("python");
  if (hasPython) {
    sections.push({
      title: "Python rules",
      rules: buildPythonRules((evidence.pyprojectTools?.tools ?? []).length > 0 ? "pyproject.toml" : "Python stack choice"),
    });
  }

  // --- Code style section from detected linter/formatter configs ---
  if (linterConfigs.length > 0) {
    const toolNames = linterConfigs.map((c) => c.tool);
    const rules = [];

    rules.push({
      value: `Use the project's configured ${toolNames.join(", ")} ${toolNames.length === 1 ? "tool" : "tools"} as the authoritative source for code style. Do not override settings or disable rules without explicit justification.`,
      provenance: "detected",
      source: linterConfigs.map((c) => c.file).join(", "),
    });

    if (toolNames.includes("prettier") || toolNames.includes("biome")) {
      rules.push({
        value: "Do not manually format code. Let the formatter handle all whitespace and style decisions.",
        provenance: "inferred",
        source: linterConfigs.find((c) => c.tool === "prettier" || c.tool === "biome")?.file ?? "",
      });
    }

    if (toolNames.includes("editorconfig")) {
      rules.push({
        value: "Respect .editorconfig settings for indentation, charset, and line endings across all file types.",
        provenance: "detected",
        source: ".editorconfig",
      });
    }

    sections.push({ title: "Code style", rules });
  }

  // --- Contributing conventions section ---
  const contributingConventions = conventions.filter((c) => c.source === "CONTRIBUTING.md");
  if (contributingConventions.length > 0) {
    const rules = [];
    for (const section of contributingConventions.slice(0, 3)) {
      for (const line of section.lines.slice(0, 5)) {
        const cleaned = line.replace(/^[-*]\s*/, "").replace(/^\d+\.\s*/, "").trim();
        if (cleaned.length > 10 && cleaned.length < 300) {
          rules.push({
            value: cleaned,
            provenance: "detected",
            source: `CONTRIBUTING.md § ${section.heading}`,
          });
        }
      }
    }
    if (rules.length > 0) {
      sections.push({ title: "Contributing conventions", rules: rules.slice(0, 8) });
    }
  }

  // --- Docker/containerization rule ---
  const hasDocker = signals.some((s) => s.type === "infra" && s.file === "Dockerfile");
  if (hasDocker) {
    sections.push({
      title: "Container workflow",
      rules: [
        { value: "Test changes inside the container environment when modifying Dockerfiles, entrypoints, or environment-dependent behavior.", provenance: "inferred", source: "Dockerfile" },
      ],
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// inferChecklist
// ---------------------------------------------------------------------------

/**
 * Infer review checklist items from deep introspection evidence.
 *
 * Builds on detected validation commands and stack signals to produce
 * repo-specific checklist items, quick signals, and red flags.
 *
 * @param {object} evidence — result of deepIntrospect()
 * @returns {{ items: LabeledItem[], quickSignals: LabeledItem[], redFlags: LabeledItem[] }}
 */
export function inferChecklist(evidence) {
  const items = [];
  const quickSignals = [];
  const redFlags = [];

  const base = evidence.base ?? {};
  const signals = base.signals ?? [];
  const validation = inferValidation(evidence);

  // --- Items from detected validation ---
  const hasTest = validation.some((v) => /\btest\b/i.test(v.value));
  const hasLint = validation.some((v) => /\blint\b/i.test(v.value));
  const hasTypecheck = validation.some((v) => /\b(typecheck|type-check|tsc|mypy)\b/i.test(v.value));
  const hasBuild = validation.some((v) => /\bbuild\b/i.test(v.value));

  if (hasTest) {
    items.push({
      value: "Tests pass and new behavior is covered by tests.",
      provenance: "detected",
      source: "validation commands",
    });
    quickSignals.push({
      value: "All test suites pass without skipped or pending tests.",
      provenance: "detected",
      source: "validation commands",
    });
  }

  if (hasLint) {
    items.push({
      value: "Lint checks pass with no new warnings or suppressions.",
      provenance: "detected",
      source: "validation commands",
    });
  }

  if (hasTypecheck) {
    items.push({
      value: "Type checks pass without new `any` annotations or type suppressions.",
      provenance: "detected",
      source: "validation commands",
    });
    redFlags.push({
      value: "New `any` type assertions or `// @ts-ignore` comments.",
      provenance: "inferred",
      source: "typecheck detection",
    });
  }

  if (hasBuild) {
    items.push({
      value: "Production build completes without errors or new warnings.",
      provenance: "detected",
      source: "validation commands",
    });
  }

  // --- Pre-commit hooks ---
  if ((evidence.preCommitHooks ?? []).length > 0) {
    items.push({
      value: "Pre-commit hooks pass locally before pushing.",
      provenance: "detected",
      source: ".pre-commit-config.yaml",
    });
  }

  // --- Stack-specific quick signals ---
  const hasDocker = signals.some((s) => s.type === "infra" && s.file === "Dockerfile");
  if (hasDocker) {
    quickSignals.push({
      value: "Container build succeeds if Dockerfiles or entrypoints were modified.",
      provenance: "inferred",
      source: "Dockerfile",
    });
  }

  const hasCI = signals.some((s) => s.type === "ci");
  if (hasCI) {
    quickSignals.push({
      value: "CI pipeline configuration is valid if workflow files were changed.",
      provenance: "inferred",
      source: "CI workflows",
    });
  }

  // --- Stack-specific red flags ---
  const hasTypeScript = signals.some(
    (s) => s.detail === "TypeScript" || s.detail === "TypeScript project",
  );
  if (hasTypeScript) {
    redFlags.push({
      value: "Uses `any` type annotations instead of proper typing.",
      provenance: "inferred",
      source: "TypeScript detection",
    });
  }

  const hasPythonMypy = (evidence.pyprojectTools?.tools ?? []).some((t) => t.tool === "mypy");
  if (hasPythonMypy) {
    redFlags.push({
      value: "Skips type checking or adds `# type: ignore` without justification.",
      provenance: "inferred",
      source: "pyproject.toml [tool.mypy]",
    });
  }

  redFlags.push({
    value: "Hand-edited generated instruction files with no canonical spec update.",
    provenance: "default",
    source: "base spec",
  });

  return { items, quickSignals, redFlags };
}

// ---------------------------------------------------------------------------
// buildOverlayFromEvidence
// ---------------------------------------------------------------------------

/**
 * Build a schema-valid overlay spec from deep introspection evidence.
 *
 * Strips provenance metadata and reshapes inference output to match the
 * canonical spec JSON Schema.  The result is a partial spec suitable for
 * use as an overlay with `extends`.
 *
 * Key schema constraints handled:
 *   - validation: LabeledItem.value → plain string[]
 *   - sections:   LabeledItem.value → plain string[] inside { title, rules }
 *   - checklist:  items use { title } (not { value }); quickSignals and
 *     redFlags become plain string[]; a synthetic intro and failureThreshold
 *     are generated; reviewChecklist is omitted entirely when items is empty
 *     (schema requires minItems: 1)
 *
 * @param {object} evidence — result of deepIntrospect()
 * @param {object} [options]
 * @param {string} [options.base] — relative path for `extends` field
 * @param {string|null} [options.section] — restrict to "validation", "rules", or "checklist"
 * @returns {object} schema-valid overlay spec (without schemaVersion/project when base is set)
 */
export function buildOverlayFromEvidence(evidence, options = {}) {
  const basePath = options.base ?? null;
  const sectionFilter = options.section ?? null;

  const overlay = {};

  // Se base e' specificato, l'overlay ha `extends` e non serve
  // schemaVersion/project (lo schema li rende opzionali).
  if (basePath) {
    overlay.extends = basePath;
  }

  // --- workspaceInstructions ---
  const wsInstructions = {};

  if (!sectionFilter || sectionFilter === "validation") {
    const validation = inferValidation(evidence);
    if (validation.length > 0) {
      wsInstructions.validation = validation.map((v) => v.value);
    }
  }

  if (!sectionFilter || sectionFilter === "rules") {
    const sections = inferSections(evidence);
    if (sections.length > 0) {
      wsInstructions.sections = sections.map((s) => ({
        title: s.title,
        rules: s.rules.map((r) => r.value),
      }));
    }
  }

  if (Object.keys(wsInstructions).length > 0) {
    overlay.workspaceInstructions = wsInstructions;
  }

  // --- reviewChecklist ---
  // Omessa interamente se non ci sono items (schema richiede minItems: 1).
  if (!sectionFilter || sectionFilter === "checklist") {
    const checklist = inferChecklist(evidence);
    if (checklist.items.length > 0) {
      const rc = {
        intro: "Review checklist inferred from project evidence.",
        failureThreshold: Math.max(1, Math.ceil(checklist.items.length / 2)),
        items: checklist.items.map((item) => ({ title: item.value })),
      };

      if (checklist.quickSignals.length > 0) {
        rc.quickSignals = checklist.quickSignals.map((qs) => qs.value);
      }
      if (checklist.redFlags.length > 0) {
        rc.redFlags = checklist.redFlags.map((rf) => rf.value);
      }

      overlay.reviewChecklist = rc;
    }
  }

  return overlay;
}
