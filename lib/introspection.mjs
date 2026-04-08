// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

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
          const seenComponents = new Set();
          const depMatches = content.matchAll(/^\s*"?([a-zA-Z0-9_-]+)/gm);
          for (const match of depMatches) {
            const depName = match[1].toLowerCase();
            for (const [pattern, componentType, detail] of PYTHON_DEPENDENCY_SIGNALS) {
              if (pattern.test(depName) && !seenComponents.has(detail)) {
                seenComponents.add(detail);
                result.signals.push({ type: "dependency", source: manifest.file, package: depName, componentType, detail });
                if (["api", "web", "data", "retrieval", "ml", "ai"].includes(componentType)) {
                  result.components.push({ type: componentType, detail, source: manifest.file });
                }
              }
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }

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
    ".agents/skills", ".claude/skills", ".github/skills",
    "CLAUDE.md", "AGENTS.md", ".cursor/rules",
  ];
  for (const agentPath of existingAgentFiles) {
    if (existsSync(join(targetRoot, agentPath))) {
      result.signals.push({ type: "agent", file: agentPath, detail: `Existing agent instructions (${agentPath})` });
    }
  }

  // Deduplicate components by detail
  const seen = new Set();
  result.components = result.components.filter((c) => {
    if (seen.has(c.detail)) return false;
    seen.add(c.detail);
    return true;
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
  return components.map((c) => `${c.type}: ${c.detail}`);
}

/**
 * Suggest a package manager rule based on detected package manager.
 */
export function suggestPackageManagerRule(packageManager) {
  if (!packageManager) return null;
  const managerName = packageManager.charAt(0).toUpperCase() + packageManager.slice(1);
  const alternatives = ["npm", "yarn", "pnpm", "bun"].filter((m) => m !== packageManager);
  return `Use ${packageManager} for Node.js packages. Do not introduce ${alternatives.join(", ")} without an explicit project decision.`;
}

/**
 * Suggest a runtime rule based on detected runtimes.
 */
export function suggestRuntimeRule(runtimes) {
  if (runtimes.length === 0) return null;
  return `Keep local development, CI, and production aligned on the same supported ${runtimes.join(" and ")} runtime versions.`;
}
