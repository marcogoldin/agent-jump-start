// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Layered spec resolution and deterministic merge.
 *
 * Resolves a chain of `extends` references (max depth 3) and merges
 * layers with explicit, per-field semantics.  No generic deep-merge:
 * every field has a documented merge strategy.
 *
 * Public API:
 *   resolveLayeredSpec(specPath) → merged spec object
 *   mergeSpecLayers(base, overlay) → merged spec object
 */

import { dirname, resolve } from "node:path";
import { readJsonYaml } from "./utils.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EXTENDS_DEPTH = 3;

// ---------------------------------------------------------------------------
// Array merge: append + replace by key
// ---------------------------------------------------------------------------

/**
 * Merge two arrays of objects using a key field for identity.
 *
 * - If the overlay contains an entry whose key matches a base entry,
 *   the overlay entry **replaces** the base entry (same position).
 * - If the overlay contains an entry with a new key, it is **appended**
 *   after all base entries.
 * - Base entries not present in the overlay are kept unchanged.
 * - Order: base entries first (with replacements applied), then new
 *   overlay entries in their original order.
 *
 * Args:
 *   baseArray:    Array of objects from the base layer.
 *   overlayArray: Array of objects from the overlay layer.
 *   keyField:     Property name used as identity (e.g. "slug", "title").
 *
 * Returns:
 *   A new array with the merge result.
 */
export function mergeByKey(baseArray, overlayArray, keyField) {
  if (!Array.isArray(baseArray)) return structuredClone(overlayArray);
  if (!Array.isArray(overlayArray)) return structuredClone(baseArray);

  // Fail-fast: reject overlay entries missing the key field
  for (const [index, item] of overlayArray.entries()) {
    if (item[keyField] === undefined) {
      throw new Error(
        `Overlay entry at index ${index} is missing required key field "${keyField}". ` +
        `Every entry in a keyed array must have a "${keyField}" value.`,
      );
    }
  }

  // Fail-fast: reject duplicate keys within the same overlay array
  const overlayMap = new Map();
  for (const item of overlayArray) {
    const key = item[keyField];
    if (overlayMap.has(key)) {
      throw new Error(
        `Duplicate "${keyField}" value "${key}" in overlay array. ` +
        `Each entry must have a unique "${keyField}".`,
      );
    }
    overlayMap.set(key, item);
  }

  // Fail-fast: reject base entries missing the key field
  for (const [index, item] of baseArray.entries()) {
    if (item[keyField] === undefined) {
      throw new Error(
        `Base entry at index ${index} is missing required key field "${keyField}". ` +
        `Every entry in a keyed array must have a "${keyField}" value.`,
      );
    }
  }

  // Base entries, with replacements applied in-place
  const merged = baseArray.map((baseItem) => {
    const key = baseItem[keyField];
    if (key !== undefined && overlayMap.has(key)) {
      const replacement = overlayMap.get(key);
      overlayMap.delete(key);
      return structuredClone(replacement);
    }
    return structuredClone(baseItem);
  });

  // Append new overlay entries not already consumed
  for (const item of overlayArray) {
    const key = item[keyField];
    if (key !== undefined && overlayMap.has(key)) {
      merged.push(structuredClone(item));
      overlayMap.delete(key);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Layer merge (explicit, per-field)
// ---------------------------------------------------------------------------

/**
 * Merge a base spec with an overlay spec using explicit field semantics.
 *
 * Merge rules:
 *   schemaVersion                       → base wins (ignored in overlay)
 *   project.name                        → replace (scalar)
 *   project.summary                     → replace (scalar)
 *   project.components                  → replace entire array
 *   workspaceInstructions.packageManagerRule → replace (scalar)
 *   workspaceInstructions.runtimeRule   → replace (scalar)
 *   workspaceInstructions.sections      → append + replace by "title"
 *   workspaceInstructions.validation    → replace entire array
 *   reviewChecklist                     → replace entire object if present
 *   agentSupport                        → replace entire object if present
 *   skills                              → append + replace by "slug"
 *
 * Args:
 *   base:    Complete spec object (must pass validation on its own).
 *   overlay: Partial spec object (fields present override the base).
 *
 * Returns:
 *   A new merged spec object.
 */
export function mergeSpecLayers(base, overlay) {
  const merged = structuredClone(base);

  // schemaVersion — always from base
  // (overlay.schemaVersion is intentionally ignored)

  // --- project ---
  if (overlay.project) {
    if (overlay.project.name !== undefined) {
      merged.project.name = overlay.project.name;
    }
    if (overlay.project.summary !== undefined) {
      merged.project.summary = overlay.project.summary;
    }
    if (overlay.project.components !== undefined) {
      merged.project.components = structuredClone(overlay.project.components);
    }
  }

  // --- workspaceInstructions ---
  if (overlay.workspaceInstructions) {
    const owi = overlay.workspaceInstructions;

    if (owi.packageManagerRule !== undefined) {
      merged.workspaceInstructions.packageManagerRule = owi.packageManagerRule;
    }
    if (owi.runtimeRule !== undefined) {
      merged.workspaceInstructions.runtimeRule = owi.runtimeRule;
    }
    if (owi.sections !== undefined) {
      merged.workspaceInstructions.sections = mergeByKey(
        merged.workspaceInstructions.sections ?? [],
        owi.sections,
        "title",
      );
    }
    if (owi.validation !== undefined) {
      merged.workspaceInstructions.validation = structuredClone(owi.validation);
    }
  }

  // --- reviewChecklist (replace entire object if present) ---
  if (overlay.reviewChecklist !== undefined) {
    merged.reviewChecklist = structuredClone(overlay.reviewChecklist);
  }

  // --- agentSupport (replace entire object if present) ---
  if (overlay.agentSupport !== undefined) {
    merged.agentSupport = structuredClone(overlay.agentSupport);
  }

  // --- skills (append + replace by slug) ---
  if (overlay.skills !== undefined) {
    merged.skills = mergeByKey(
      merged.skills ?? [],
      overlay.skills,
      "slug",
    );
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Layered spec resolution (follows extends chain)
// ---------------------------------------------------------------------------

/**
 * Load a spec file, follow its `extends` chain, and return the merged result.
 *
 * The `extends` field is a relative path from the overlay file to its
 * parent spec.  The chain is followed up to MAX_EXTENDS_DEPTH levels.
 * Circular references and excessive depth cause an explicit error.
 *
 * Args:
 *   specPath: Path to the spec file to resolve.
 *
 * Returns:
 *   The fully merged spec object, ready for validation and rendering.
 *
 * Raises:
 *   Error if the chain exceeds MAX_EXTENDS_DEPTH or contains a cycle.
 *   Error if a referenced base file cannot be read.
 */
/**
 * Resolve a layered spec chain and return both the merged result and
 * metadata about each layer in the chain.
 *
 * Returns:
 *   {
 *     merged:    The fully merged spec (ready for validation/rendering).
 *     leafPath:  Absolute path to the leaf (outermost) spec file.
 *     leafSpec:  The raw leaf spec object as read from disk (with `extends`
 *                stripped but no merge applied).  Use this for writeback.
 *     isLayered: true when the leaf has an `extends` chain.
 *     chain:     Array of { path, spec } from root to leaf.
 *   }
 */
export function resolveLayeredSpecWithMeta(specPath) {
  const chain = [];
  const visited = new Set();
  let currentPath = resolve(specPath);

  // Collect layers from leaf to root
  while (true) {
    if (visited.has(currentPath)) {
      throw new Error(
        `Circular extends chain detected: ${chain.map((l) => l.path).join(" → ")} → ${currentPath}`,
      );
    }
    if (chain.length >= MAX_EXTENDS_DEPTH) {
      throw new Error(
        `Extends chain exceeds maximum depth of ${MAX_EXTENDS_DEPTH}: ` +
        `${chain.map((l) => l.path).join(" → ")}`,
      );
    }

    visited.add(currentPath);
    const spec = readJsonYaml(currentPath);
    chain.push({ path: currentPath, spec });

    if (!spec.extends) break;

    const parentPath = resolve(dirname(currentPath), spec.extends);
    currentPath = parentPath;
  }

  // chain is [leaf, ..., root].  The leaf is always chain[0].
  const leafPath = chain[0].path;
  const leafSpec = structuredClone(chain[0].spec);
  delete leafSpec.extends;
  const isLayered = chain.length > 1;

  // Reverse to apply merges root → intermediaries → leaf.
  chain.reverse();

  let result = structuredClone(chain[0].spec);
  delete result.extends;

  for (let i = 1; i < chain.length; i++) {
    const overlay = structuredClone(chain[i].spec);
    delete overlay.extends;
    result = mergeSpecLayers(result, overlay);
  }

  return { merged: result, leafPath, leafSpec, isLayered, chain };
}

/**
 * Convenience wrapper: resolve a layered spec and return only the merged
 * result (backward-compatible with callers that only need the flat spec).
 */
export function resolveLayeredSpec(specPath) {
  return resolveLayeredSpecWithMeta(specPath).merged;
}
