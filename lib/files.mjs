// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ensureDirectory } from "./utils.mjs";

// ---------------------------------------------------------------------------
// Write / check / clean generated files
// ---------------------------------------------------------------------------

export function writeGeneratedFiles(generatedFiles, targetRoot) {
  for (const [relativePath, content] of Object.entries(generatedFiles)) {
    const absolutePath = join(resolve(targetRoot), relativePath);
    ensureDirectory(absolutePath);
    writeFileSync(absolutePath, content, "utf8");
  }
}

export function checkGeneratedFiles(generatedFiles, targetRoot) {
  const targetAbsolutePath = resolve(targetRoot);
  const failures = [];
  const passes = [];

  for (const [relativePath, expectedContent] of Object.entries(generatedFiles)) {
    const absolutePath = join(targetAbsolutePath, relativePath);
    if (!existsSync(absolutePath)) {
      failures.push(`Missing generated file: ${relativePath}`);
      continue;
    }

    const actualContent = readFileSync(absolutePath, "utf8");
    if (actualContent !== expectedContent) {
      failures.push(`Out of sync: ${relativePath}`);
      continue;
    }

    passes.push(`OK ${relativePath}`);
  }

  const manifestPath = join(targetAbsolutePath, "docs/agent-jump-start/generated-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const expectedPaths = new Set(Object.keys(generatedFiles));
    for (const relativePath of manifest.files ?? []) {
      if (!expectedPaths.has(relativePath) && existsSync(join(targetAbsolutePath, relativePath))) {
        failures.push(`Stale managed file still exists: ${relativePath}`);
      }
    }
  }

  return { failures, passes };
}

export function cleanStaleFiles(generatedFiles, targetRoot) {
  const targetAbsolutePath = resolve(targetRoot);
  const manifestPath = join(targetAbsolutePath, "docs/agent-jump-start/generated-manifest.json");
  const removed = [];

  if (!existsSync(manifestPath)) {
    return removed;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const expectedPaths = new Set(Object.keys(generatedFiles));

  for (const relativePath of manifest.files ?? []) {
    if (!expectedPaths.has(relativePath)) {
      const absolutePath = join(targetAbsolutePath, relativePath);
      if (existsSync(absolutePath)) {
        rmSync(absolutePath, { force: true });
        removed.push(relativePath);

        // Remove empty parent directories up to target root
        let dir = dirname(absolutePath);
        while (dir !== targetAbsolutePath && dir.startsWith(targetAbsolutePath)) {
          try {
            const entries = readdirSync(dir);
            if (entries.length === 0) {
              rmSync(dir, { force: true });
              dir = dirname(dir);
            } else {
              break;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  return removed;
}

export function cleanDirectoryIfExists(directoryPath) {
  if (existsSync(directoryPath)) {
    rmSync(directoryPath, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function discoverPackageRoot() {
  const scriptDir = dirname(new URL(import.meta.url).pathname);
  return resolve(scriptDir, "..");
}

export function listAvailableProfiles() {
  const packageRoot = discoverPackageRoot();
  const profileDir = join(packageRoot, "specs", "profiles");
  if (!existsSync(profileDir)) {
    return [];
  }
  return readdirSync(profileDir)
    .filter((f) => f.endsWith(".profile.yaml"))
    .map((f) => ({
      file: f,
      path: join(profileDir, f),
      name: f.replace(".profile.yaml", ""),
    }));
}

export function listManagedFiles(rootPath) {
  const entries = [];

  function walk(currentPath) {
    for (const entry of readdirSync(currentPath)) {
      const absolutePath = join(currentPath, entry);
      const relativePath = relative(rootPath, absolutePath);
      const stats = statSync(absolutePath);
      if (stats.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      entries.push(relativePath);
    }
  }

  walk(rootPath);
  return entries.sort();
}
