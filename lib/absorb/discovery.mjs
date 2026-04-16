// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { AGENT_DISCOVERY_RULES } from "../agent-targets.mjs";
import { classifyExistingFile } from "../files.mjs";

function walkMatchingFiles(targetRoot, rule) {
  const rootPath = join(targetRoot, rule.root);
  if (!existsSync(rootPath)) return [];

  let rootStats;
  try {
    rootStats = statSync(rootPath);
  } catch {
    return [];
  }
  if (!rootStats.isDirectory()) return [];

  const results = [];
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const lowerName = entry.name.toLowerCase();
      const matchesExtension = !rule.extensions || rule.extensions.some((ext) => lowerName.endsWith(ext));
      const matchesSuffix = !rule.suffixes || rule.suffixes.some((suffix) => lowerName.endsWith(suffix));
      if (!matchesExtension || !matchesSuffix) continue;

      results.push(absolutePath);
    }
  }

  return results.sort();
}

function collectAbsolutePaths(targetRoot, rule) {
  if (rule.mode === "exact") {
    return [join(targetRoot, rule.path)];
  }
  return walkMatchingFiles(targetRoot, rule);
}

function toRelativePath(targetRoot, absolutePath) {
  const rel = absolutePath.slice(targetRoot.length + (targetRoot.endsWith("/") ? 0 : 1));
  return rel.replaceAll("\\", "/");
}

/**
 * Discover unmanaged pre-existing agent instruction files that can be absorbed.
 *
 * @param {string} targetRootInput
 * @returns {Array<{
 *   relativePath:string,
 *   absolutePath:string,
 *   toolOfOrigin:string,
 *   scope:string,
 *   tier:number,
 *   classification:"managed"|"unmanaged"|"unreadable",
 *   byteSize:number,
 *   content:string|null
 * }>}
 */
export function discoverAbsorbSources(targetRootInput) {
  const targetRoot = resolve(targetRootInput);
  const seen = new Set();
  const discovered = [];

  for (const rule of AGENT_DISCOVERY_RULES) {
    for (const absolutePath of collectAbsolutePaths(targetRoot, rule)) {
      const relativePath = toRelativePath(targetRoot, absolutePath);
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);

      const classification = classifyExistingFile(absolutePath);
      if (classification !== "managed" && classification !== "unmanaged" && classification !== "unreadable") {
        continue;
      }

      let content = null;
      let byteSize = 0;
      if (classification !== "unreadable") {
        try {
          content = readFileSync(absolutePath, "utf8");
          byteSize = Buffer.byteLength(content, "utf8");
        } catch {
          discovered.push({
            relativePath,
            absolutePath,
            toolOfOrigin: rule.toolOfOrigin,
            scope: rule.scope,
            tier: rule.tier,
            classification: "unreadable",
            byteSize: 0,
            content: null,
          });
          continue;
        }
      }

      discovered.push({
        relativePath,
        absolutePath,
        toolOfOrigin: rule.toolOfOrigin,
        scope: rule.scope,
        tier: rule.tier,
        classification,
        byteSize,
        content,
      });
    }
  }

  return discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
