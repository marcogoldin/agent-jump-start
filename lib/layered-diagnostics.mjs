// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Layer-aware diagnostics for layered (`extends`) specs.
 *
 * These helpers answer the single operator question: "Which file do I open
 * to fix this error?" They never interpret merge semantics — they only look
 * at which raw layer set a given top-level field.
 */

import { relative } from "node:path";

// ---------------------------------------------------------------------------
// Top-level field ownership
// ---------------------------------------------------------------------------

/**
 * Top-level canonical spec fields whose ownership can be reported.
 * Paths inside these fields roll up to the owning layer of the top-level
 * field, because the merge engine replaces or extends them per field.
 */
const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "project",
  "workspaceInstructions",
  "reviewChecklist",
  "skills",
]);

function extractTopField(fieldPath) {
  if (!fieldPath || typeof fieldPath !== "string") return null;
  const match = fieldPath.match(/^([a-zA-Z]+)/);
  if (!match) return null;
  const top = match[1];
  return KNOWN_TOP_LEVEL_FIELDS.has(top) ? top : null;
}

/**
 * Find the layer that last wrote a given top-level field path.
 *
 * The chain returned by `resolveLayeredSpecWithMeta` is ordered root → leaf.
 * We iterate leaf → root (i.e. reversed) and return the first layer whose
 * raw spec has that top-level field set.
 *
 * Returns the absolute path of the owning layer, or null when no layer in
 * the chain sets the field (which for a required field typically means the
 * leaf forgot it).
 */
export function findTopLevelOwner(chain, topField) {
  if (!Array.isArray(chain) || chain.length === 0 || !topField) return null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const layer = chain[i];
    if (layer?.spec && Object.prototype.hasOwnProperty.call(layer.spec, topField)) {
      return layer.path;
    }
  }
  return null;
}

/**
 * Resolve the owning layer of an error's field path.
 *
 * Strategy:
 *   - If the path starts with a known top-level field, find the last layer
 *     that sets that field.
 *   - If the path itself does not match a known field (e.g. "unknown:foo"),
 *     default to the leaf because that is where overlays are usually fixed.
 */
export function resolveErrorOwner(chain, fieldPath, leafPath) {
  const topField = extractTopField(fieldPath);
  if (!topField) return leafPath ?? null;
  return findTopLevelOwner(chain, topField) ?? leafPath ?? null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function toDisplayPath(fullPath) {
  if (!fullPath) return "";
  const rel = relative(process.cwd(), fullPath);
  if (!rel) return fullPath;
  // Outside cwd by many levels → absolute is more readable.
  if (rel.startsWith("..") && rel.split("/").filter((s) => s === "..").length > 3) return fullPath;
  return rel;
}

/**
 * Render a chain summary for operator-facing error headers.
 * Example: "base.yaml → packages/web/canonical-spec.yaml"
 */
export function describeChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return "";
  return chain.map((layer) => toDisplayPath(layer.path)).join(" → ");
}

/**
 * Render an ownership annotation for a single error, or "" when none.
 */
export function describeOwner(ownerPath) {
  if (!ownerPath) return "";
  return `(from layer: ${toDisplayPath(ownerPath)})`;
}
