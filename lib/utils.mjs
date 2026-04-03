// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

export function assertRequired(options, key, command) {
  if (options[key]) {
    return;
  }
  throw new Error(`Missing required --${key} for '${command}'`);
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

export function readJsonYaml(filePath) {
  const absolutePath = resolve(filePath);
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function stringifyJsonYaml(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function ensureDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

// ---------------------------------------------------------------------------
// Object merge
// ---------------------------------------------------------------------------

export function deepMerge(baseValue, overlayValue) {
  if (overlayValue === undefined) {
    return structuredClone(baseValue);
  }

  if (baseValue === null || overlayValue === null) {
    return structuredClone(overlayValue);
  }

  if (Array.isArray(baseValue) || Array.isArray(overlayValue)) {
    return structuredClone(overlayValue);
  }

  if (typeof baseValue !== "object" || typeof overlayValue !== "object") {
    return structuredClone(overlayValue);
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(overlayValue)) {
    if (!(key in merged)) {
      merged[key] = structuredClone(value);
      continue;
    }
    merged[key] = deepMerge(merged[key], value);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function formatBulletList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function truncateAtWordBoundary(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return `${slice.slice(0, lastSpace).trimEnd()}...`;
  }
  return `${slice.trimEnd()}...`;
}

// ---------------------------------------------------------------------------
// YAML rendering (lightweight, zero-dependency)
// ---------------------------------------------------------------------------

export function yamlScalar(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  throw new Error(`Unsupported YAML scalar value: ${JSON.stringify(value)}`);
}

export function renderYamlObjectLines(objectValue, indent = 0) {
  const lines = [];
  const pad = " ".repeat(indent);

  for (const [key, rawValue] of Object.entries(objectValue)) {
    if (rawValue === undefined) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        lines.push(`${pad}${key}: []`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      for (const item of rawValue) {
        if (isPlainObject(item)) {
          const nested = renderYamlObjectLines(item, indent + 4);
          if (nested.length === 0) {
            lines.push(`${pad}  - {}`);
            continue;
          }
          lines.push(`${pad}  - ${nested[0].trimStart()}`);
          for (const nestedLine of nested.slice(1)) {
            lines.push(nestedLine);
          }
          continue;
        }
        lines.push(`${pad}  - ${yamlScalar(item)}`);
      }
      continue;
    }

    if (isPlainObject(rawValue)) {
      const nested = renderYamlObjectLines(rawValue, indent + 2);
      if (nested.length === 0) {
        lines.push(`${pad}${key}: {}`);
        continue;
      }
      lines.push(`${pad}${key}:`);
      lines.push(...nested);
      continue;
    }

    lines.push(`${pad}${key}: ${yamlScalar(rawValue)}`);
  }

  return lines;
}
