// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { isNonEmptyString, isPlainObject } from "./utils.mjs";

// ---------------------------------------------------------------------------
// Skill validation
// ---------------------------------------------------------------------------

export function validateSkill(skill, sourcePath) {
  const required = ["slug", "title", "description", "version", "appliesWhen", "categories", "rules"];
  const missing = required.filter((key) => !skill[key]);
  if (missing.length > 0) {
    throw new Error(
      `Invalid skill in ${sourcePath}: missing required fields: ${missing.join(", ")}.\n` +
      `A valid skill needs: ${required.join(", ")}.`
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.slug)) {
    throw new Error(
      `Invalid skill "${skill.slug}" in ${sourcePath}: slug must be lowercase and use hyphens only.`,
    );
  }
  if (skill.name !== undefined && skill.name !== skill.slug) {
    throw new Error(
      `Invalid skill "${skill.slug}" in ${sourcePath}: legacy name must match slug for standards-compatible SKILL.md generation.`,
    );
  }
  if (!isNonEmptyString(skill.title)) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: title must be a non-empty string.`);
  }
  if (!isNonEmptyString(skill.description)) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: description must be a non-empty string.`);
  }
  if (!isNonEmptyString(skill.version)) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: version must be a non-empty string.`);
  }
  if (skill.author !== undefined && !isNonEmptyString(skill.author)) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: author must be a non-empty string when provided.`);
  }
  if (skill.license !== undefined && !isNonEmptyString(skill.license)) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: license must be a non-empty string when provided.`);
  }
  if (!Array.isArray(skill.appliesWhen) || skill.appliesWhen.length === 0) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: appliesWhen must be a non-empty array.`);
  }
  for (const [index, appliesWhen] of skill.appliesWhen.entries()) {
    if (!isNonEmptyString(appliesWhen)) {
      throw new Error(
        `Invalid skill "${skill.slug}" in ${sourcePath}: appliesWhen[${index}] must be a non-empty string.`,
      );
    }
  }
  if (!Array.isArray(skill.categories) || skill.categories.length === 0) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: categories must be a non-empty array.`);
  }
  const categoryNames = new Set();
  const categoryPrefixes = new Set();
  for (const [index, category] of skill.categories.entries()) {
    if (!Number.isInteger(category.priority) || category.priority < 1) {
      throw new Error(
        `Invalid category in skill "${skill.slug}" at categories[${index}]: priority must be a positive integer.`,
      );
    }
    if (!isNonEmptyString(category.name)) {
      throw new Error(
        `Invalid category in skill "${skill.slug}" at categories[${index}]: name must be a non-empty string.`,
      );
    }
    if (!isNonEmptyString(category.impact)) {
      throw new Error(
        `Invalid category in skill "${skill.slug}" at categories[${index}]: impact must be a non-empty string.`,
      );
    }
    if (!isNonEmptyString(category.prefix)) {
      throw new Error(
        `Invalid category in skill "${skill.slug}" at categories[${index}]: prefix must be a non-empty string.`,
      );
    }
    if (categoryNames.has(category.name)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: duplicate category name "${category.name}".`);
    }
    if (categoryPrefixes.has(category.prefix)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: duplicate category prefix "${category.prefix}".`);
    }
    categoryNames.add(category.name);
    categoryPrefixes.add(category.prefix);
  }
  if (!Array.isArray(skill.rules) || skill.rules.length === 0) {
    throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: rules must be a non-empty array.`);
  }
  const ruleIds = new Set();
  for (const rule of skill.rules) {
    if (!rule.id || !rule.category || !rule.title || !rule.summary || !rule.impact) {
      throw new Error(
        `Invalid rule in skill "${skill.slug}": each rule needs id, category, title, impact, and summary. ` +
        `Found: ${JSON.stringify(rule)}`
      );
    }
    if (ruleIds.has(rule.id)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: duplicate rule id "${rule.id}".`);
    }
    if (!categoryNames.has(rule.category)) {
      throw new Error(
        `Invalid skill "${skill.slug}" in ${sourcePath}: rule "${rule.id}" references unknown category "${rule.category}".`,
      );
    }
    if (rule.guidance !== undefined) {
      if (!Array.isArray(rule.guidance)) {
        throw new Error(
          `Invalid skill "${skill.slug}" in ${sourcePath}: rule "${rule.id}" guidance must be an array when provided.`,
        );
      }
      for (const [guidanceIndex, guidanceItem] of rule.guidance.entries()) {
        if (!isNonEmptyString(guidanceItem)) {
          throw new Error(
            `Invalid skill "${skill.slug}" in ${sourcePath}: rule "${rule.id}" guidance[${guidanceIndex}] must be a non-empty string.`,
          );
        }
      }
    }
    ruleIds.add(rule.id);
  }
  if (skill.dependencies !== undefined) {
    if (!Array.isArray(skill.dependencies)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: dependencies must be an array when provided.`);
    }
    for (const [index, dependency] of skill.dependencies.entries()) {
      if (!isNonEmptyString(dependency)) {
        throw new Error(
          `Invalid skill "${skill.slug}" in ${sourcePath}: dependencies[${index}] must be a non-empty string.`,
        );
      }
    }
  }
  if (skill.metadata !== undefined) {
    if (!isPlainObject(skill.metadata)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: metadata must be an object when provided.`);
    }
    for (const [key, value] of Object.entries(skill.metadata)) {
      const validScalar = typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      if (!validScalar) {
        throw new Error(
          `Invalid skill "${skill.slug}" in ${sourcePath}: metadata.${key} must be a string, number, or boolean.`,
        );
      }
    }
  }
  if (skill.references !== undefined) {
    if (!Array.isArray(skill.references)) {
      throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: references must be an array when provided.`);
    }
    for (const [index, ref] of skill.references.entries()) {
      if (!isPlainObject(ref)) {
        throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: references[${index}] must be an object.`);
      }
      if (!isNonEmptyString(ref.name)) {
        throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: references[${index}].name must be a non-empty string.`);
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(ref.name)) {
        throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: references[${index}].name must be a valid filename ending in .md.`);
      }
      if (!isNonEmptyString(ref.content)) {
        throw new Error(`Invalid skill "${skill.slug}" in ${sourcePath}: references[${index}].content must be a non-empty string.`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Spec validation
// ---------------------------------------------------------------------------

export function validateSpec(spec, sourcePath) {
  const errors = [];

  // schemaVersion
  if (spec.schemaVersion === undefined) {
    errors.push("Missing required field: schemaVersion");
  } else if (typeof spec.schemaVersion !== "number" || spec.schemaVersion < 1) {
    errors.push(`Invalid schemaVersion: expected a positive integer, got ${JSON.stringify(spec.schemaVersion)}`);
  }

  // project
  if (!spec.project) {
    errors.push("Missing required field: project");
  } else {
    if (!spec.project.name || typeof spec.project.name !== "string") {
      errors.push("project.name is required and must be a non-empty string");
    }
    if (!spec.project.summary || typeof spec.project.summary !== "string") {
      errors.push("project.summary is required and must be a non-empty string");
    }
    if (spec.project.components !== undefined && !Array.isArray(spec.project.components)) {
      errors.push("project.components must be an array if present");
    }
  }

  // workspaceInstructions
  if (!spec.workspaceInstructions) {
    errors.push("Missing required field: workspaceInstructions");
  } else {
    const ws = spec.workspaceInstructions;
    if (ws.sections !== undefined) {
      if (!Array.isArray(ws.sections)) {
        errors.push("workspaceInstructions.sections must be an array if present");
      } else {
        for (let i = 0; i < ws.sections.length; i++) {
          const section = ws.sections[i];
          if (!section.title || typeof section.title !== "string") {
            errors.push(`workspaceInstructions.sections[${i}].title is required and must be a string`);
          }
          if (!Array.isArray(section.rules) || section.rules.length === 0) {
            errors.push(`workspaceInstructions.sections[${i}].rules must be a non-empty array`);
          }
        }
      }
    }
    if (ws.validation !== undefined && !Array.isArray(ws.validation)) {
      errors.push("workspaceInstructions.validation must be an array if present");
    }
  }

  // reviewChecklist (optional but validated if present)
  if (spec.reviewChecklist !== undefined) {
    const rc = spec.reviewChecklist;
    if (!rc.intro || typeof rc.intro !== "string") {
      errors.push("reviewChecklist.intro is required and must be a string");
    }
    if (typeof rc.failureThreshold !== "number" || rc.failureThreshold < 1) {
      errors.push("reviewChecklist.failureThreshold must be a positive number");
    }
    if (!Array.isArray(rc.items) || rc.items.length === 0) {
      errors.push("reviewChecklist.items must be a non-empty array");
    } else {
      for (let i = 0; i < rc.items.length; i++) {
        if (!rc.items[i].title || typeof rc.items[i].title !== "string") {
          errors.push(`reviewChecklist.items[${i}].title is required and must be a string`);
        }
      }
    }
  }

  // skills (optional but validated if present)
  if (spec.skills !== undefined) {
    if (!Array.isArray(spec.skills)) {
      errors.push("skills must be an array if present");
    } else {
      const slugs = new Set();
      for (let i = 0; i < spec.skills.length; i++) {
        const skill = spec.skills[i];
        try {
          validateSkill(skill, `${sourcePath} -> skills[${i}]`);
        } catch (err) {
          errors.push(err.message);
        }
        if (skill.slug) {
          if (slugs.has(skill.slug)) {
            errors.push(`Duplicate skill slug: "${skill.slug}" at skills[${i}]`);
          }
          slugs.add(skill.slug);
        }
      }
    }
  }

  if (errors.length > 0) {
    const header = `Spec validation failed for ${sourcePath} (${errors.length} error${errors.length > 1 ? "s" : ""}):`;
    const body = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");
    throw new Error(`${header}\n${body}`);
  }
}

// ---------------------------------------------------------------------------
// External SKILL.md validation
// ---------------------------------------------------------------------------

/**
 * Validate a parsed SKILL.md frontmatter object.
 * Returns an array of error strings (empty if valid).
 */
export function validateSkillMdFrontmatter(frontmatter, sourcePath) {
  const errors = [];

  if (!frontmatter || typeof frontmatter !== "object") {
    return ["Frontmatter is missing or not an object."];
  }

  if (!isNonEmptyString(frontmatter.name)) {
    errors.push("frontmatter.name is required and must be a non-empty string.");
  }
  if (!isNonEmptyString(frontmatter.description)) {
    errors.push("frontmatter.description is required and must be a non-empty string.");
  }

  if (frontmatter.metadata !== undefined) {
    if (!isPlainObject(frontmatter.metadata)) {
      errors.push("frontmatter.metadata must be an object when present.");
    }
  }

  if (frontmatter.dependencies !== undefined) {
    if (!Array.isArray(frontmatter.dependencies)) {
      errors.push("frontmatter.dependencies must be an array when present.");
    }
  }

  if (errors.length > 0) {
    return errors.map((e) => `${sourcePath}: ${e}`);
  }
  return [];
}
