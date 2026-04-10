// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { resolveLayeredSpec } from "./merging.mjs";
import { findSkillCandidates, parseSkillMdFrontmatter, readSkillDirectory } from "./skills.mjs";
import { validateSkill, validateSkillMdFrontmatter } from "./validation.mjs";

export const KNOWN_SKILL_DIRS = [
  ".agents/skills",
  ".claude/skills",
  ".github/skills",
];

function normalizeValidationMessage(message, sourcePath) {
  return message
    .replace(/^Invalid SKILL\.md frontmatter:\s*/u, "")
    .replace(/^Validation failed:\s*/u, "")
    .replace(new RegExp(`^${escapeRegExp(sourcePath)}:\\s*`, "u"), "")
    .replace(new RegExp(`^Invalid skill(?: "[^"]+")? in ${escapeRegExp(sourcePath)}:\\s*`, "u"), "")
    .trim();
}

function extractErrorList(error, sourcePath) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "Invalid SKILL.md frontmatter:" && line !== "Validation failed:")
    .map((line) => line.replace(/^-+\s*/u, ""))
    .map((line) => normalizeValidationMessage(line, sourcePath))
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inspectSkillCandidate(skillDir) {
  const absoluteDir = resolve(skillDir);
  const skillMdPath = join(absoluteDir, "SKILL.md");
  const fallbackSlug = basename(absoluteDir);

  if (!existsSync(skillMdPath)) {
    return {
      slug: fallbackSlug,
      path: absoluteDir,
      status: "invalid",
      errors: ["No SKILL.md found in skill directory."],
    };
  }

  const content = readFileSync(skillMdPath, "utf8");
  const { frontmatter } = parseSkillMdFrontmatter(content);
  const discoveredSlug = frontmatter?.name ?? fallbackSlug;

  if (!frontmatter) {
    return {
      slug: discoveredSlug,
      path: absoluteDir,
      status: "invalid",
      errors: ["SKILL.md has no YAML frontmatter block."],
    };
  }

  const frontmatterErrors = validateSkillMdFrontmatter(frontmatter, skillMdPath)
    .map((error) => normalizeValidationMessage(error, skillMdPath));
  if (frontmatterErrors.length > 0) {
    return {
      slug: discoveredSlug,
      path: absoluteDir,
      status: "invalid",
      errors: frontmatterErrors,
    };
  }

  try {
    const skill = readSkillDirectory(absoluteDir);
    validateSkill(skill, absoluteDir);
    return {
      slug: skill.slug,
      path: absoluteDir,
      status: "valid",
      skill,
    };
  } catch (error) {
    return {
      slug: discoveredSlug,
      path: absoluteDir,
      status: "invalid",
      errors: extractErrorList(error, absoluteDir),
    };
  }
}

export function discoverUnmanagedSkills(targetRoot, specInput) {
  const absoluteRoot = resolve(targetRoot);
  const spec = typeof specInput === "string" ? resolveLayeredSpec(specInput) : specInput;
  const managedSlugs = new Set((spec.skills ?? []).map((skill) => skill.slug));
  const discoveries = [];
  const seenSlugs = new Set();

  for (const relativeDir of KNOWN_SKILL_DIRS) {
    const scanRoot = join(absoluteRoot, relativeDir);
    const candidates = findSkillCandidates(scanRoot).sort((a, b) => a.localeCompare(b));

    for (const candidate of candidates) {
      const inspected = inspectSkillCandidate(candidate);
      if (seenSlugs.has(inspected.slug)) {
        continue;
      }
      seenSlugs.add(inspected.slug);

      if (inspected.status === "invalid") {
        discoveries.push(inspected);
        continue;
      }

      discoveries.push({
        slug: inspected.skill.slug,
        path: inspected.path,
        status: managedSlugs.has(inspected.skill.slug) ? "managed" : "unmanaged",
      });
    }
  }

  return discoveries.sort((a, b) => a.slug.localeCompare(b.slug));
}
