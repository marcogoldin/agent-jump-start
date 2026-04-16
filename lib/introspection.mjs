// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Signal detection — scan a project root for obvious technology signals
// ---------------------------------------------------------------------------

/**
 * Known dependency patterns and what they signal.
 * Each entry: [regex for dependency name, component hint, detail].
 */
const NODE_DEPENDENCY_SIGNALS = [
  [/^express$/, "api", "Express.js REST service"],
  [/^fastify$/, "api", "Fastify REST service"],
  [/^@nestjs\/core$/, "api", "NestJS service"],
  [/^hapi$|^@hapi\/hapi$/, "api", "Hapi.js service"],
  [/^koa$/, "api", "Koa service"],
  [/^next$/, "web", "Next.js application"],
  [/^react$/, "web", "React application"],
  [/^vue$/, "web", "Vue.js application"],
  [/^svelte$/, "web", "Svelte application"],
  [/^@angular\/core$/, "web", "Angular application"],
  [/^vite$/, "build", "Vite build toolchain"],
  [/^webpack$/, "build", "Webpack build toolchain"],
  [/^typescript$/, "lang", "TypeScript"],
  [/^tailwindcss$/, "style", "Tailwind CSS"],
  [/^@mui\/material$/, "style", "Material UI (MUI)"],
  [/^prisma$|^@prisma\/client$/, "data", "Prisma ORM"],
  [/^mongoose$/, "data", "MongoDB (Mongoose)"],
  [/^sequelize$/, "data", "Sequelize ORM"],
  [/^drizzle-orm$/, "data", "Drizzle ORM"],
  [/^socket\.io$/, "realtime", "Socket.IO real-time"],
  [/^@aws-sdk\//, "infra", "AWS SDK integration"],
  [/^@azure\//, "infra", "Azure SDK integration"],
  [/^@google-cloud\//, "infra", "Google Cloud SDK integration"],
];

/**
 * Known Python dependency patterns.
 */
const PYTHON_DEPENDENCY_SIGNALS = [
  [/^flask/, "api", "Flask web service"],
  [/^django/, "web", "Django application"],
  [/^fastapi/, "api", "FastAPI service"],
  [/^pymilvus/, "retrieval", "Milvus vector search (pymilvus)"],
  [/^sqlalchemy/, "data", "SQLAlchemy ORM"],
  [/^pandas/, "data", "Pandas data processing"],
  [/^numpy/, "compute", "NumPy computation"],
  [/^torch|^pytorch/, "ml", "PyTorch ML"],
  [/^tensorflow/, "ml", "TensorFlow ML"],
  [/^transformers/, "ml", "Hugging Face Transformers"],
  [/^boto3/, "infra", "AWS SDK (boto3)"],
  [/^langchain/, "ai", "LangChain orchestration"],
  [/^openai/, "ai", "OpenAI SDK"],
  [/^anthropic/, "ai", "Anthropic SDK"],
  [/^pytest/, "test", "pytest testing"],
  [/^scrapy/, "scraping", "Scrapy web scraping"],
  [/^celery/, "worker", "Celery task queue"],
];

const COMPONENT_DIRECTORY_HINTS = [
  { dir: "api", type: "api", detail: "API service" },
  { dir: "server", type: "api", detail: "Backend service" },
  { dir: "backend", type: "api", detail: "Backend service" },
  { dir: "web", type: "web", detail: "Web application" },
  { dir: "frontend", type: "web", detail: "Frontend application" },
  { dir: "app", type: "app", detail: "Application" },
  { dir: "worker", type: "worker", detail: "Background worker" },
  { dir: "jobs", type: "worker", detail: "Background jobs" },
  { dir: "scripts", type: "cli", detail: "Automation scripts" },
];

const GENERIC_FALLBACK_COMPONENT_DETAILS = new Set([
  "API service",
  "Backend service",
  "Node.js API service",
  "Python API service",
  "Web application",
  "Frontend application",
  "Application",
]);

function addUniqueComponent(target, component) {
  if (target.some((entry) => entry.type === component.type && entry.detail === component.detail)) {
    return;
  }
  target.push(component);
}

function detectPyprojectDependencySignals(content, sourceFile) {
  const components = [];
  const signals = [];
  const seen = new Set();

  const dependencyMatches = content.matchAll(/"([^"]+)"/g);
  for (const match of dependencyMatches) {
    const depName = match[1].trim().split(/[>=<!\[;#\s]/)[0].toLowerCase();
    if (!depName) continue;
    for (const [pattern, componentType, detail] of PYTHON_DEPENDENCY_SIGNALS) {
      if (pattern.test(depName) && !seen.has(detail)) {
        seen.add(detail);
        signals.push({ type: "dependency", source: sourceFile, package: depName, componentType, detail });
        if (["api", "web", "data", "retrieval", "ml", "ai", "worker"].includes(componentType)) {
          components.push({ type: componentType, detail, source: sourceFile });
        }
      }
    }
  }

  return { components, signals };
}

function detectDirectoryComponents(targetRoot, runtimes) {
  const components = [];
  const scanRoots = ["src", "apps", "services", "packages", "."];

  for (const rootName of scanRoots) {
    const rootPath = rootName === "." ? targetRoot : join(targetRoot, rootName);
    if (!existsSync(rootPath)) continue;

    let entries = [];
    try {
      entries = readdirSync(rootPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const normalized = entry.name.toLowerCase();
      const hint = COMPONENT_DIRECTORY_HINTS.find((item) => item.dir === normalized);
      if (!hint) continue;

      let detail = hint.detail;
      if (hint.type === "worker" && runtimes.includes("Python")) {
        detail = "Python background worker";
      } else if (hint.type === "api" && runtimes.includes("Python")) {
        detail = "Python API service";
      } else if (hint.type === "api" && runtimes.includes("Node.js")) {
        detail = "Node.js API service";
      } else if (hint.type === "web" && runtimes.includes("Node.js")) {
        detail = "Web application";
      }

      addUniqueComponent(components, {
        type: hint.type,
        detail,
        source: rootName === "." ? entry.name : `${rootName}/${entry.name}`,
        ownership: "secondary",
      });
    }
  }

  return components;
}

function pruneGenericComponents(components) {
  const specificsByType = new Map();

  for (const component of components) {
    if (GENERIC_FALLBACK_COMPONENT_DETAILS.has(component.detail)) continue;
    specificsByType.set(component.type, (specificsByType.get(component.type) ?? 0) + 1);
  }

  return components.filter((component) => {
    if (!GENERIC_FALLBACK_COMPONENT_DETAILS.has(component.detail)) {
      return true;
    }
    return !specificsByType.has(component.type);
  });
}

function componentSourceScore(component) {
  if (component.source === "package.json" || component.source === "pyproject.toml" || component.source === "requirements.txt") {
    return 0;
  }
  if (!component.source?.includes("/") || component.source?.startsWith("src/")) {
    return 1;
  }
  if (component.source?.startsWith("apps/") || component.source?.startsWith("services/")) {
    return 2;
  }
  if (component.source?.startsWith("packages/")) {
    return 3;
  }
  return 4;
}

function componentTypeScore(component) {
  const order = new Map([
    ["web", 0],
    ["api", 1],
    ["worker", 2],
    ["mobile", 3],
    ["cli", 4],
    ["data", 5],
    ["ml", 6],
    ["infra", 7],
  ]);
  return order.get(component.type) ?? 99;
}


// ---------------------------------------------------------------------------
// Additional stack detection — .NET, Rust, Go, Java, Ruby, PHP, Dart/Flutter
// ---------------------------------------------------------------------------

const ADDITIONAL_STACKS = [
  {
    runtime: ".NET",
    packageManager: "dotnet",
    component: { type: "api", detail: ".NET service" },
    matches: (root) => {
      if (existsSync(join(root, "Directory.Build.props"))) return "Directory.Build.props";
      try {
        const entries = readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (entry.name.endsWith(".csproj") || entry.name.endsWith(".sln") || entry.name.endsWith(".fsproj") || entry.name.endsWith(".vbproj")) {
            return entry.name;
          }
        }
        // Check one level deep — common for .NET solution layouts
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "bin" || entry.name === "obj") continue;
          const sub = join(root, entry.name);
          try {
            const subEntries = readdirSync(sub, { withFileTypes: true });
            for (const subEntry of subEntries) {
              if (!subEntry.isFile()) continue;
              if (subEntry.name.endsWith(".csproj") || subEntry.name.endsWith(".fsproj")) {
                return `${entry.name}/${subEntry.name}`;
              }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
      return null;
    },
  },
  {
    runtime: "Rust",
    packageManager: "cargo",
    component: { type: "api", detail: "Rust service" },
    matches: (root) => existsSync(join(root, "Cargo.toml")) ? "Cargo.toml" : null,
  },
  {
    runtime: "Go",
    packageManager: "go",
    component: { type: "api", detail: "Go service" },
    matches: (root) => existsSync(join(root, "go.mod")) ? "go.mod" : null,
  },
  {
    runtime: "Java",
    packageManager: "maven",
    component: { type: "api", detail: "Java service" },
    matches: (root) => existsSync(join(root, "pom.xml")) ? "pom.xml" : null,
  },
  {
    runtime: "Java",
    packageManager: "gradle",
    component: { type: "api", detail: "Java service" },
    matches: (root) => {
      if (existsSync(join(root, "build.gradle"))) return "build.gradle";
      if (existsSync(join(root, "build.gradle.kts"))) return "build.gradle.kts";
      return null;
    },
  },
  {
    runtime: "Ruby",
    packageManager: "bundler",
    component: { type: "api", detail: "Ruby service" },
    matches: (root) => existsSync(join(root, "Gemfile")) ? "Gemfile" : null,
  },
  {
    runtime: "PHP",
    packageManager: "composer",
    component: { type: "api", detail: "PHP service" },
    matches: (root) => existsSync(join(root, "composer.json")) ? "composer.json" : null,
  },
  {
    runtime: "Dart",
    packageManager: "pub",
    component: { type: "mobile", detail: "Dart/Flutter application" },
    matches: (root) => existsSync(join(root, "pubspec.yaml")) ? "pubspec.yaml" : null,
  },
];

function detectAdditionalStacks(targetRoot, result) {
  for (const stack of ADDITIONAL_STACKS) {
    const matchedFile = stack.matches(targetRoot);
    if (!matchedFile) continue;

    if (!result.runtimes.includes(stack.runtime)) {
      result.runtimes.push(stack.runtime);
    }
    if (!result.packageManager) {
      result.packageManager = stack.packageManager;
    }
    result.signals.push({
      type: "manifest",
      file: matchedFile,
      detail: `${stack.runtime} project`,
    });

    let detail = stack.component.detail;
    if (stack.runtime === "Dart" && existsSync(join(targetRoot, "pubspec.yaml"))) {
      try {
        const content = readFileSync(join(targetRoot, "pubspec.yaml"), "utf8");
        if (/^\s*flutter\s*:/m.test(content) || /sdk:\s*flutter/.test(content)) {
          detail = "Flutter application";
        } else {
          detail = "Dart application";
        }
      } catch { /* keep default */ }
    }

    addUniqueComponent(result.components, {
      type: stack.component.type,
      detail,
      source: matchedFile,
      ownership: "primary",
    });
  }
}

/**
 * Return a baseline validation command list for a given set of runtimes + package manager.
 * Used as a fallback when deep introspection finds no explicit scripts but a stack was detected.
 */
export function baselineValidationForRuntimes(runtimes, packageManager) {
  const commands = [];
  const seen = new Set();
  function add(value) {
    if (seen.has(value)) return;
    seen.add(value);
    commands.push(value);
  }

  const pm = packageManager || "npm";
  if (runtimes.includes("Node.js")) {
    add(`${pm} run test`);
    add(`${pm} run lint`);
  }
  if (runtimes.includes("Python")) add("python -m pytest");
  if (runtimes.includes(".NET")) add("dotnet test");
  if (runtimes.includes("Rust")) add("cargo test");
  if (runtimes.includes("Go")) add("go test ./...");
  if (runtimes.includes("Java")) {
    if (packageManager === "gradle") add("./gradlew test");
    else add("./mvnw test");
  }
  if (runtimes.includes("Ruby")) add("bundle exec rspec");
  if (runtimes.includes("PHP")) add("composer test");
  if (runtimes.includes("Dart")) add("flutter test");
  return commands;
}

function collectMatchingFiles(targetRoot, relativeDir, { extensions = [], suffixes = [], maxFiles = 40 } = {}) {
  const baseDir = join(targetRoot, relativeDir);
  if (!existsSync(baseDir)) return [];

  let stats;
  try {
    stats = statSync(baseDir);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) return [];

  const matches = [];
  const stack = [baseDir];

  while (stack.length > 0 && matches.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const lowerName = entry.name.toLowerCase();
      const matchesExtension = extensions.length === 0 || extensions.some((ext) => lowerName.endsWith(ext));
      const matchesSuffix = suffixes.length === 0 || suffixes.some((suffix) => lowerName.endsWith(suffix));
      if (!matchesExtension || !matchesSuffix) continue;

      const relFromBase = relative(baseDir, absolutePath).replaceAll("\\", "/");
      matches.push(`${relativeDir}/${relFromBase}`.replaceAll("//", "/"));
      if (matches.length >= maxFiles) break;
    }
  }

  return matches.sort();
}

// ---------------------------------------------------------------------------
// Core introspection
// ---------------------------------------------------------------------------

/**
 * Introspect a project directory and return detected signals.
 * Returns { projectName, packageManager, runtimes, components, signals }.
 */
export function introspectProject(targetRoot) {
  const result = {
    projectName: null,
    packageManager: null,
    runtimes: [],
    components: [],
    signals: [],
  };

  // --- Node.js detection ---
  const packageJsonPath = join(targetRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));

      if (pkg.name) {
        result.projectName = pkg.name.replace(/^@[^/]+\//, ""); // strip scope
      }

      result.runtimes.push("Node.js");
      result.signals.push({ type: "manifest", file: "package.json", detail: "Node.js project" });

      // Package manager detection
      if (existsSync(join(targetRoot, "pnpm-lock.yaml"))) {
        result.packageManager = "pnpm";
      } else if (existsSync(join(targetRoot, "yarn.lock"))) {
        result.packageManager = "yarn";
      } else if (existsSync(join(targetRoot, "bun.lockb")) || existsSync(join(targetRoot, "bun.lock"))) {
        result.packageManager = "bun";
      } else {
        result.packageManager = "npm";
      }
      result.signals.push({ type: "package-manager", detail: result.packageManager });

      // Scan dependencies for technology signals
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      const seenComponents = new Set();
      for (const depName of Object.keys(allDeps ?? {})) {
        for (const [pattern, componentType, detail] of NODE_DEPENDENCY_SIGNALS) {
          if (pattern.test(depName) && !seenComponents.has(detail)) {
            seenComponents.add(detail);
            result.signals.push({ type: "dependency", source: "package.json", package: depName, componentType, detail });

            // Only suggest components for major frameworks, not utilities
            if (["api", "web", "data", "retrieval", "ml"].includes(componentType)) {
              result.components.push({ type: componentType, detail, source: "package.json" });
              result.components[result.components.length - 1].ownership = "primary";
            }
          }
        }
      }

      // TypeScript detection
      if (existsSync(join(targetRoot, "tsconfig.json"))) {
        result.signals.push({ type: "config", file: "tsconfig.json", detail: "TypeScript project" });
      }
    } catch {
      // Invalid package.json — skip
    }
  }

  // --- Python detection ---
  const pythonManifests = [
    { file: "pyproject.toml", type: "pyproject" },
    { file: "requirements.txt", type: "requirements" },
    { file: "requirements-dev.txt", type: "requirements" },
    { file: "setup.py", type: "setup" },
    { file: "setup.cfg", type: "setup" },
    { file: "Pipfile", type: "pipfile" },
  ];

  let pythonDetected = false;
  for (const manifest of pythonManifests) {
    const manifestPath = join(targetRoot, manifest.file);
    if (existsSync(manifestPath)) {
      if (!pythonDetected) {
        pythonDetected = true;
        result.runtimes.push("Python");
        result.signals.push({ type: "manifest", file: manifest.file, detail: "Python project" });
      }

      // Parse requirements.txt-style files for dependency signals
      if (manifest.type === "requirements") {
        try {
          const content = readFileSync(manifestPath, "utf8");
          const seenComponents = new Set();
          for (const line of content.split("\n")) {
            const depName = line.trim().split(/[>=<!\[;#\s]/)[0].toLowerCase();
            if (!depName) continue;
            for (const [pattern, componentType, detail] of PYTHON_DEPENDENCY_SIGNALS) {
              if (pattern.test(depName) && !seenComponents.has(detail)) {
                seenComponents.add(detail);
                result.signals.push({ type: "dependency", source: manifest.file, package: depName, componentType, detail });
                if (["api", "web", "data", "retrieval", "ml", "ai"].includes(componentType)) {
                  result.components.push({ type: componentType, detail, source: manifest.file });
                  result.components[result.components.length - 1].ownership = "primary";
                }
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      // Parse pyproject.toml for project name and dependencies (lightweight)
      if (manifest.type === "pyproject") {
        try {
          const content = readFileSync(manifestPath, "utf8");

          // Extract project name
          const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
          if (nameMatch && !result.projectName) {
            result.projectName = nameMatch[1];
          }

          // Extract dependencies (basic TOML parsing for common patterns)
          const detected = detectPyprojectDependencySignals(content, manifest.file);
          result.signals.push(...detected.signals);
          for (const component of detected.components) {
            addUniqueComponent(result.components, component);
          }
        } catch {
          // Skip
        }
      }
    }
  }

  // --- Additional stack detection (.NET, Rust, Go, Java, Ruby, PHP, Dart) ---
  detectAdditionalStacks(targetRoot, result);

  // --- Infrastructure signals ---
  if (existsSync(join(targetRoot, "Dockerfile")) || existsSync(join(targetRoot, "dockerfile"))) {
    result.signals.push({ type: "infra", file: "Dockerfile", detail: "Containerized workflow" });
  }
  if (existsSync(join(targetRoot, "docker-compose.yml")) || existsSync(join(targetRoot, "docker-compose.yaml"))) {
    result.signals.push({ type: "infra", file: "docker-compose.yml", detail: "Docker Compose orchestration" });
  }
  if (existsSync(join(targetRoot, ".github/workflows"))) {
    result.signals.push({ type: "ci", file: ".github/workflows/", detail: "GitHub Actions CI/CD" });
  }
  if (existsSync(join(targetRoot, ".gitlab-ci.yml"))) {
    result.signals.push({ type: "ci", file: ".gitlab-ci.yml", detail: "GitLab CI/CD" });
  }
  if (existsSync(join(targetRoot, ".env.example")) || existsSync(join(targetRoot, ".env.template"))) {
    result.signals.push({ type: "config", file: ".env.example", detail: "Environment configuration template" });
  }

  // --- Existing agent instructions ---
  const existingAgentFiles = [
    ".agents/skills",
    ".claude/skills",
    ".github/skills",
    "AGENTS.md",
    "AGENT.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    ".cursor/rules",
    ".continue/rules",
    ".windsurf/rules",
    ".windsurfrules",
    ".clinerules",
    ".roo/rules",
    ".roorules",
    ".amazonq/rules",
    ".junie/AGENTS.md",
    ".junie/guidelines.md",
    ".junie/guidelines",
    "CONVENTIONS.md",
  ];
  for (const agentPath of existingAgentFiles) {
    if (existsSync(join(targetRoot, agentPath))) {
      result.signals.push({ type: "agent", file: agentPath, detail: `Existing agent instructions (${agentPath})` });
    }
  }

  const discoveredAgentGlobs = [
    {
      root: ".github/instructions",
      suffixes: [".instructions.md"],
      detail: "Path-specific GitHub Copilot instruction files",
    },
    {
      root: ".cursor/rules",
      extensions: [".mdc"],
      detail: "Cursor MDC instruction files",
    },
    {
      root: ".continue/rules",
      extensions: [".md", ".txt"],
      detail: "Continue.dev rule files",
    },
    {
      root: ".windsurf/rules",
      extensions: [".md", ".txt"],
      detail: "Windsurf rule files",
    },
    {
      root: ".clinerules",
      extensions: [".md", ".txt"],
      detail: "Cline rule files",
    },
    {
      root: ".roo/rules",
      extensions: [".md", ".txt"],
      detail: "Roo Code rule files",
    },
    {
      root: ".amazonq/rules",
      extensions: [".md"],
      detail: "Amazon Q project rule files",
    },
    {
      root: ".junie/guidelines",
      extensions: [".md"],
      detail: "JetBrains Junie guidelines files",
    },
  ];
  for (const discovery of discoveredAgentGlobs) {
    for (const relPath of collectMatchingFiles(targetRoot, discovery.root, discovery)) {
      result.signals.push({
        type: "agent",
        file: relPath,
        detail: `${discovery.detail} (${relPath})`,
      });
    }
  }

  for (const component of detectDirectoryComponents(targetRoot, result.runtimes)) {
    addUniqueComponent(result.components, component);
  }

  // Deduplicate components by detail
  const seen = new Set();
  result.components = result.components.filter((c) => {
    if (seen.has(c.detail)) return false;
    seen.add(c.detail);
    return true;
  });
  result.components = pruneGenericComponents(result.components);
  result.components = result.components.map((component) => ({
    ...component,
    ownership: component.ownership ?? (componentSourceScore(component) <= 2 ? "primary" : "secondary"),
  }));
  result.components.sort((a, b) => {
    const ownershipDelta = (a.ownership === "primary" ? 0 : 1) - (b.ownership === "primary" ? 0 : 1);
    if (ownershipDelta !== 0) return ownershipDelta;
    const sourceDelta = componentSourceScore(a) - componentSourceScore(b);
    if (sourceDelta !== 0) return sourceDelta;
    const typeDelta = componentTypeScore(a) - componentTypeScore(b);
    if (typeDelta !== 0) return typeDelta;
    return a.detail.localeCompare(b.detail);
  });

  // Use directory name as fallback project name
  if (!result.projectName) {
    result.projectName = basename(targetRoot);
  }

  return result;
}

/**
 * Format detected components as spec-ready component strings.
 * Example: "api: Express.js REST service"
 */
export function formatDetectedComponents(components) {
  return [...components]
    .sort((a, b) => {
      const ownershipDelta = (a.ownership === "primary" ? 0 : 1) - (b.ownership === "primary" ? 0 : 1);
      if (ownershipDelta !== 0) return ownershipDelta;
      return componentSourceScore(a) - componentSourceScore(b);
    })
    .map((c) => `${c.type}: ${c.detail}`);
}

/**
 * Suggest a package manager rule based on detected package manager.
 */
export function suggestPackageManagerRule(packageManager) {
  if (!packageManager) return null;
  const nodeManagers = new Set(["npm", "yarn", "pnpm", "bun"]);
  if (nodeManagers.has(packageManager)) {
    const alternatives = [...nodeManagers].filter((m) => m !== packageManager);
    return `Use ${packageManager} for Node.js packages. Do not introduce ${alternatives.join(", ")} without an explicit project decision.`;
  }
  const NON_NODE_MANAGERS = {
    dotnet: "Use the .NET SDK (dotnet CLI) for packages and builds. Do not introduce alternative toolchains without an explicit project decision.",
    cargo: "Use Cargo for Rust packages and builds. Do not introduce alternative toolchains without an explicit project decision.",
    go: "Use Go modules (go.mod / go.sum) for dependency management. Do not introduce alternative toolchains without an explicit project decision.",
    maven: "Use Maven (mvn / mvnw) for Java builds. Do not introduce Gradle or other toolchains without an explicit project decision.",
    gradle: "Use Gradle (gradle / gradlew) for Java builds. Do not introduce Maven or other toolchains without an explicit project decision.",
    bundler: "Use Bundler (Gemfile / bundle) for Ruby gems. Do not introduce alternative toolchains without an explicit project decision.",
    composer: "Use Composer for PHP dependencies. Do not introduce alternative toolchains without an explicit project decision.",
    pub: "Use Pub (pubspec.yaml / flutter pub) for Dart and Flutter packages. Do not introduce alternative toolchains without an explicit project decision.",
  };
  return NON_NODE_MANAGERS[packageManager]
    ?? `Use the package manager already chosen by the repository (${packageManager}). Do not introduce alternatives without an explicit project decision.`;
}

/**
 * Suggest a runtime rule based on detected runtimes.
 */
export function suggestRuntimeRule(runtimes) {
  if (runtimes.length === 0) return null;
  return `Keep local development, CI, and production aligned on the same supported ${runtimes.join(" and ")} runtime versions.`;
}

// ---------------------------------------------------------------------------
// Deep introspection — extract validation commands, rules evidence, checklist
// signals from real repo files beyond basic manifest/dependency detection.
// ---------------------------------------------------------------------------

/**
 * Script keys in package.json that are relevant as validation commands.
 */
const VALIDATION_SCRIPT_KEYS = new Set([
  "test", "lint", "typecheck", "type-check", "build", "check",
  "format", "ci", "validate", "e2e", "test:unit", "test:e2e",
  "lint:fix", "prettier", "eslint",
]);

/**
 * Makefile/justfile targets that are relevant as validation commands.
 */
const VALIDATION_MAKE_TARGETS = new Set([
  "test", "lint", "check", "build", "format", "typecheck",
  "type-check", "ci", "validate", "e2e",
]);

/**
 * Patterns that indicate a CI workflow run step is a validation command.
 */
const CI_VALIDATION_PATTERN = /\b(test|lint|check|build|typecheck|type-check|format|pytest|mypy|ruff|eslint|tsc|prettier|cargo\s+test|go\s+test)\b/i;

/**
 * Read a text file safely, returning null on failure.
 */
function safeReadText(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const stats = statSync(filePath);
    if (!stats.isFile()) return null;
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Extract validation-relevant scripts from package.json.
 */
function extractPackageScripts(targetRoot, packageManager) {
  const content = safeReadText(join(targetRoot, "package.json"));
  if (!content) return [];

  try {
    const pkg = JSON.parse(content);
    if (!pkg.scripts || typeof pkg.scripts !== "object") return [];

    const pm = packageManager ?? "npm";
    const results = [];

    for (const [key, value] of Object.entries(pkg.scripts)) {
      if (VALIDATION_SCRIPT_KEYS.has(key)) {
        results.push({
          command: `${pm} run ${key}`,
          source: `package.json scripts.${key}`,
          raw: String(value),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Detect Python tool sections in pyproject.toml.
 */
function extractPyprojectTools(targetRoot) {
  const content = safeReadText(join(targetRoot, "pyproject.toml"));
  if (!content) return { scripts: [], tools: [] };

  const tools = [];
  const toolSectionPattern = /^\[tool\.(\w+)/gm;
  let match;
  while ((match = toolSectionPattern.exec(content)) !== null) {
    const toolName = match[1];
    if (["pytest", "ruff", "mypy", "black", "isort", "flake8", "pylint", "coverage"].includes(toolName)) {
      tools.push({ tool: toolName, file: "pyproject.toml" });
    }
  }

  // Extract [project.scripts] entries
  const scripts = [];
  const scriptSectionMatch = content.match(/^\[project\.scripts\]\s*\n((?:[^\[].+\n)*)/m);
  if (scriptSectionMatch) {
    const lines = scriptSectionMatch[1].split("\n");
    for (const line of lines) {
      const kv = line.match(/^\s*(\w[\w-]*)\s*=/);
      if (kv) {
        scripts.push({
          command: kv[1],
          source: "pyproject.toml [project.scripts]",
          raw: line.trim(),
        });
      }
    }
  }

  return { scripts, tools };
}

/**
 * Extract validation-relevant targets from Makefile or justfile.
 */
function extractMakeTargets(targetRoot) {
  const results = [];

  for (const [fileName, prefix] of [["Makefile", "make"], ["justfile", "just"]]) {
    const content = safeReadText(join(targetRoot, fileName));
    if (!content) continue;

    const targetPattern = /^([a-zA-Z_][\w-]*)\s*:/gm;
    let match;
    while ((match = targetPattern.exec(content)) !== null) {
      const target = match[1];
      if (VALIDATION_MAKE_TARGETS.has(target)) {
        results.push({ target, source: fileName, command: `${prefix} ${target}` });
      }
    }
  }

  return results;
}

/**
 * Extract run commands from GitHub Actions workflow files.
 */
function extractCiSteps(targetRoot) {
  const workflowDir = join(targetRoot, ".github", "workflows");
  if (!existsSync(workflowDir)) return [];

  let entries;
  try {
    entries = readdirSync(workflowDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;

    const content = safeReadText(join(workflowDir, entry.name));
    if (!content) continue;

    // Extract run: values (handles both inline and multi-line)
    const runPattern = /^\s*-?\s*run:\s*[|>]?\s*\n?([\s\S]*?)(?=\n\s*-|\n\s*\w+:|\n\s*$)/gm;
    const simpleRunPattern = /^\s*-?\s*run:\s*(.+)$/gm;

    let match;
    while ((match = simpleRunPattern.exec(content)) !== null) {
      const cmd = match[1].trim();
      if (CI_VALIDATION_PATTERN.test(cmd)) {
        results.push({
          command: cmd,
          source: `.github/workflows/${entry.name}`,
          workflow: entry.name,
        });
      }
    }
  }

  return results;
}

/**
 * Extract hook IDs from .pre-commit-config.yaml.
 */
function extractPreCommitHooks(targetRoot) {
  const content = safeReadText(join(targetRoot, ".pre-commit-config.yaml"));
  if (!content) return [];

  const results = [];
  const hookIdPattern = /^\s*-?\s*id:\s*(.+)$/gm;
  let match;
  while ((match = hookIdPattern.exec(content)) !== null) {
    results.push({ id: match[1].trim(), source: ".pre-commit-config.yaml" });
  }
  return results;
}

/**
 * Detect presence of linter/formatter config files.
 */
function detectLinterConfigs(targetRoot) {
  const configs = [
    { pattern: ".editorconfig", tool: "editorconfig" },
    { pattern: ".eslintrc", tool: "eslint" },
    { pattern: ".eslintrc.js", tool: "eslint" },
    { pattern: ".eslintrc.json", tool: "eslint" },
    { pattern: ".eslintrc.yml", tool: "eslint" },
    { pattern: "eslint.config.js", tool: "eslint" },
    { pattern: "eslint.config.mjs", tool: "eslint" },
    { pattern: ".prettierrc", tool: "prettier" },
    { pattern: ".prettierrc.json", tool: "prettier" },
    { pattern: ".prettierrc.js", tool: "prettier" },
    { pattern: "prettier.config.js", tool: "prettier" },
    { pattern: "ruff.toml", tool: "ruff" },
    { pattern: "mypy.ini", tool: "mypy" },
    { pattern: ".flake8", tool: "flake8" },
    { pattern: "setup.cfg", tool: "setuptools" },
    { pattern: "biome.json", tool: "biome" },
  ];

  const results = [];
  const seen = new Set();
  for (const { pattern, tool } of configs) {
    if (existsSync(join(targetRoot, pattern)) && !seen.has(tool)) {
      seen.add(tool);
      results.push({ tool, file: pattern });
    }
  }
  return results;
}

/**
 * Extract headings and bullet points from CONTRIBUTING.md or README.md
 * that relate to development workflows.
 */
function extractConventions(targetRoot) {
  const results = [];
  const devKeywords = /\b(test|lint|build|setup|develop|install|contribut|format|style|convention|workflow|prerequisit|requirement|getting started)\b/i;

  for (const fileName of ["CONTRIBUTING.md", "README.md"]) {
    const content = safeReadText(join(targetRoot, fileName));
    if (!content) continue;

    const lines = content.split("\n").slice(0, 200);
    let currentHeading = null;
    let sectionLines = [];

    function flushSection() {
      if (currentHeading && sectionLines.length > 0 && devKeywords.test(currentHeading)) {
        results.push({
          source: fileName,
          heading: currentHeading,
          lines: sectionLines.slice(0, 20),
        });
      }
      sectionLines = [];
    }

    for (const line of lines) {
      const headingMatch = line.match(/^#{1,3}\s+(.+)/);
      if (headingMatch) {
        flushSection();
        currentHeading = headingMatch[1].trim();
        continue;
      }

      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\.\s/.test(trimmed)) {
        sectionLines.push(trimmed);
      }
    }
    flushSection();
  }

  return results;
}

/**
 * Deep-introspect a project for validation commands, rules evidence,
 * and checklist signals.
 *
 * Calls introspectProject() internally and adds deeper evidence from
 * package.json scripts, CI workflows, Makefiles, linter configs, and docs.
 *
 * @param {string} targetRoot
 * @returns {object} Deep introspection evidence.
 */
export function deepIntrospect(targetRoot) {
  const base = introspectProject(targetRoot);

  return {
    base,
    scripts: extractPackageScripts(targetRoot, base.packageManager),
    pyprojectTools: extractPyprojectTools(targetRoot),
    ciSteps: extractCiSteps(targetRoot),
    linterConfigs: detectLinterConfigs(targetRoot),
    conventions: extractConventions(targetRoot),
    preCommitHooks: extractPreCommitHooks(targetRoot),
    makeTargets: extractMakeTargets(targetRoot),
  };
}
