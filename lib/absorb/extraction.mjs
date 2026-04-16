// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { normalizeValidationCommand } from "../inference.mjs";
import { truncateAtWordBoundary } from "../utils.mjs";

const VALIDATION_HEADING = /^(#+)\s*(validation|commands|scripts|testing|checks)\b/i;
const GENERIC_HEADING = /^#+\s+(.+)/;
const RULE_HEADING = /^##\s+(.+)/;
const BULLET_LINE = /^\s*(?:[-*]|\d+\.)\s+(.+)/;
const COMMAND_PREFIX = /^(npm|pnpm|yarn|bun|uv|poetry|pip|cargo|go|make|just|mvn|gradle|dotnet|python|pytest|ruff|mypy|composer|bundle|flutter|php|npx)\b/i;

function makeLabeledItem(value, source) {
  return {
    value,
    provenance: "detected",
    source,
  };
}

function stripFrontmatter(rawContent) {
  const match = rawContent.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { content: rawContent, notes: [] };
  const keys = (match[1].match(/^[A-Za-z0-9_-]+(?=\s*:)/gm) ?? []).slice(0, 10);
  return {
    content: rawContent.slice(match[0].length),
    notes: keys.length
      ? [`Stripped frontmatter keys: ${keys.join(", ")}`]
      : ["Stripped frontmatter block"],
  };
}

function extractValidationFromCodeBlocks(lines, source) {
  const collected = [];
  const normalizedSeen = new Set();
  let currentHeading = "";
  let insideFence = false;
  let fenceBuffer = [];

  function pushCandidate(command, confidence) {
    if (!command) return;
    const normalized = normalizeValidationCommand(command);
    if (!normalized || normalizedSeen.has(normalized)) return;
    normalizedSeen.add(normalized);
    collected.push({
      ...makeLabeledItem(command, source.relativePath),
      confidence,
    });
  }

  function flushFence() {
    if (!fenceBuffer.length) return;
    const isValidationHeading = VALIDATION_HEADING.test(currentHeading);
    for (const entry of fenceBuffer) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (COMMAND_PREFIX.test(trimmed)) {
        pushCandidate(trimmed, isValidationHeading ? "high" : "medium");
      }
    }
    fenceBuffer = [];
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (insideFence) {
        insideFence = false;
        flushFence();
      } else {
        insideFence = true;
      }
      continue;
    }

    if (insideFence) {
      fenceBuffer.push(line);
      continue;
    }

    if (GENERIC_HEADING.test(line)) {
      currentHeading = line;
      continue;
    }

    if (VALIDATION_HEADING.test(currentHeading)) {
      const bullet = line.match(BULLET_LINE);
      const command = bullet ? bullet[1].trim() : line.trim();
      if (COMMAND_PREFIX.test(command)) {
        pushCandidate(command, "high");
      }
    }
  }

  return collected.slice(0, 8);
}

function normalizeSentence(rawValue) {
  const trimmed = rawValue.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return truncateAtWordBoundary(trimmed, 300);
}

function extractSections(lines, source) {
  const sections = [];
  const notes = [];
  let current = null;

  function finalizeCurrent() {
    if (!current) return;
    const bulletRules = [];
    for (const line of current.lines) {
      const match = line.match(BULLET_LINE);
      if (!match) continue;
      const normalized = normalizeSentence(match[1]);
      if (!normalized) continue;
      bulletRules.push(normalized);
    }

    let rules = bulletRules;
    if (rules.length === 0) {
      const prose = current.lines
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"));
      const sentence = normalizeSentence(prose.join(" "));
      if (sentence) {
        rules = [sentence];
      }
    }

    const deduped = [];
    const seen = new Set();
    for (const rule of rules) {
      const key = rule.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(makeLabeledItem(rule, source.relativePath));
      if (deduped.length >= 10) break;
    }

    if (deduped.length > 0) {
      sections.push({
        title: current.title,
        rules: deduped,
      });
    }
  }

  for (const line of lines) {
    const heading = line.match(RULE_HEADING);
    if (heading) {
      finalizeCurrent();
      current = { title: heading[1].trim(), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }
  finalizeCurrent();

  if (sections.length > 0) {
    return { sections, confidence: "high", notes };
  }

  // Fallback: unstructured prose -> one review section
  const prose = lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"));
  const sentence = normalizeSentence(prose.join(" "));
  if (sentence) {
    notes.push("No structured sections detected; imported as review guidance");
    return {
      sections: [{
        title: "Imported guidance (review)",
        rules: [makeLabeledItem(sentence, source.relativePath)],
      }],
      confidence: "low",
      notes,
    };
  }

  notes.push("No structured content extractable — use as reference only");
  return { sections: [], confidence: "low", notes };
}

function pickOverallConfidence(validationItems, sectionConfidence) {
  if (validationItems.some((entry) => entry.confidence === "high") && sectionConfidence === "high") {
    return "high";
  }
  if (validationItems.length > 0 || sectionConfidence === "high") {
    return "medium";
  }
  return "low";
}

/**
 * Extract absorb candidates from discovered sources.
 *
 * Scope v1 intentionally includes only workspace sections + validation.
 */
export function extractAbsorbCandidates(sources) {
  return sources.map((source) => {
    if (source.classification === "unreadable" || typeof source.content !== "string") {
      return {
        source,
        sections: [],
        validation: [],
        overallConfidence: "low",
        extractorNotes: ["File is unreadable; cannot extract content automatically"],
      };
    }

    const stripped = stripFrontmatter(source.content);
    const lines = stripped.content.split(/\r?\n/);

    const validationRaw = extractValidationFromCodeBlocks(lines, source);
    const validation = validationRaw.map(({ confidence, ...rest }) => rest);
    const validationConfidence = validationRaw.some((entry) => entry.confidence === "high")
      ? "high"
      : validationRaw.length > 0 ? "medium" : "low";

    const sectionResult = extractSections(lines, source);
    const overallConfidence = pickOverallConfidence(validationRaw, sectionResult.confidence);

    return {
      source,
      sections: sectionResult.sections,
      validation,
      overallConfidence,
      extractorNotes: [
        ...stripped.notes,
        ...sectionResult.notes,
        validationRaw.length > 0 ? `Extracted ${validationRaw.length} validation command(s) (${validationConfidence})` : null,
      ].filter(Boolean),
    };
  });
}
