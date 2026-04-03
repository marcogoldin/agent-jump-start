// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { TOOL_VERSION } from "./constants.mjs";
import { isNonEmptyString, isPlainObject, renderYamlObjectLines, ensureDirectory } from "./utils.mjs";
import { validateSkillMdFrontmatter } from "./validation.mjs";

// ---------------------------------------------------------------------------
// SKILL.md parser — parse standard Agent Skills SKILL.md into structured data
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter: object, body: string }.
 * Uses a minimal zero-dependency YAML subset parser (string/number/bool/arrays/objects).
 */
export function parseSkillMdFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: content };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex < 0) {
    return { frontmatter: null, body: content };
  }

  const yamlBlock = trimmed.slice(4, endIndex).trim();
  const body = trimmed.slice(endIndex + 4).trim();
  const frontmatter = parseMinimalYaml(yamlBlock);

  return { frontmatter, body };
}

/**
 * Minimal YAML parser supporting the subset used in SKILL.md frontmatter.
 * Handles: scalars (string, number, bool, null), sequences, nested mappings.
 * Does not handle: anchors, aliases, multi-document, flow sequences, block scalars.
 */
function parseMinimalYaml(yaml) {
  const lines = yaml.split("\n");
  const result = {};
  let index = 0;

  function currentIndent(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  function parseValue(raw) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    // Quoted strings
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }

    // Numbers
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Inline arrays: [a, b, c]
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map((item) => parseValue(item));
    }

    // Inline objects: {key: val}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === "") return {};
      const obj = {};
      for (const pair of inner.split(",")) {
        const colonPos = pair.indexOf(":");
        if (colonPos >= 0) {
          const key = pair.slice(0, colonPos).trim();
          const val = parseValue(pair.slice(colonPos + 1));
          obj[key] = val;
        }
      }
      return obj;
    }

    return trimmed;
  }

  function parseBlock(minIndent) {
    const obj = {};

    while (index < lines.length) {
      const line = lines[index];

      // Skip empty lines and comments
      if (line.trim() === "" || line.trim().startsWith("#")) {
        index++;
        continue;
      }

      const indent = currentIndent(line);
      if (indent < minIndent) {
        break;
      }

      const content = line.trim();

      // Array item at this indent level
      if (content.startsWith("- ")) {
        break;
      }

      // Key-value pair
      const colonPos = content.indexOf(":");
      if (colonPos < 0) {
        index++;
        continue;
      }

      const key = content.slice(0, colonPos).trim();
      const afterColon = content.slice(colonPos + 1).trim();

      if (afterColon === "" || afterColon === "|" || afterColon === ">") {
        // Check next line for array items or nested object
        index++;
        if (index < lines.length) {
          const nextLine = lines[index];
          const nextTrimmed = nextLine.trim();
          const nextIndent = currentIndent(nextLine);

          if (nextTrimmed.startsWith("- ")) {
            obj[key] = parseSequence(nextIndent);
          } else if (nextIndent > indent) {
            obj[key] = parseBlock(nextIndent);
          } else {
            obj[key] = null;
          }
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseValue(afterColon);
        index++;
      }
    }

    return obj;
  }

  function parseSequence(minIndent) {
    const items = [];

    while (index < lines.length) {
      const line = lines[index];
      if (line.trim() === "" || line.trim().startsWith("#")) {
        index++;
        continue;
      }

      const indent = currentIndent(line);
      if (indent < minIndent) break;

      const content = line.trim();
      if (!content.startsWith("- ")) break;

      const itemValue = content.slice(2).trim();

      // Check if the item starts a nested object
      const colonPos = itemValue.indexOf(":");
      if (colonPos >= 0 && itemValue.slice(colonPos + 1).trim() === "") {
        // Multi-line nested object in sequence
        const nestedKey = itemValue.slice(0, colonPos).trim();
        index++;
        const nestedObj = {};
        if (index < lines.length && currentIndent(lines[index]) > indent) {
          nestedObj[nestedKey] = parseBlock(currentIndent(lines[index]));
        } else {
          nestedObj[nestedKey] = null;
        }
        items.push(nestedObj);
      } else if (colonPos >= 0) {
        // Inline key:value in sequence, treat as single-entry object
        const k = itemValue.slice(0, colonPos).trim();
        const v = parseValue(itemValue.slice(colonPos + 1));
        items.push({ [k]: v });
        index++;
      } else {
        items.push(parseValue(itemValue));
        index++;
      }
    }

    return items;
  }

  return parseBlock(0);
}

// ---------------------------------------------------------------------------
// Parse a full SKILL.md body into structured sections
// ---------------------------------------------------------------------------

/**
 * Extract structured sections from a SKILL.md markdown body.
 * Returns { title, sections } where sections is a map of heading -> content.
 */
export function parseSkillMdBody(body) {
  const lines = body.split("\n");
  let title = null;
  const sections = {};
  let currentSection = null;
  const contentBuffer = [];

  function flushSection() {
    if (currentSection !== null) {
      sections[currentSection] = contentBuffer.join("\n").trim();
    }
    contentBuffer.length = 0;
  }

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);

    if (h1Match && title === null) {
      title = h1Match[1].trim();
      continue;
    }

    if (h2Match) {
      flushSection();
      currentSection = h2Match[1].trim();
      continue;
    }

    contentBuffer.push(line);
  }
  flushSection();

  return { title, sections };
}

// ---------------------------------------------------------------------------
// Convert a parsed SKILL.md into AJS skill format
// ---------------------------------------------------------------------------

/**
 * Convert a parsed SKILL.md (frontmatter + body) into an AJS-compatible skill object.
 *
 * This is a best-effort conversion. External SKILL.md files don't always have
 * the same structured categories/rules format as AJS skills, so the converter
 * creates a single "General" category and extracts guidance from the body.
 */
export function skillMdToAjsSkill(frontmatter, body, references = []) {
  const { title, sections } = parseSkillMdBody(body);
  const slug = frontmatter.name;
  const description = frontmatter.description;
  const version = frontmatter.metadata?.version ?? "1.0.0";
  const author = frontmatter.metadata?.author ?? frontmatter.author;
  const license = frontmatter.license;

  // Extract appliesWhen from "When to Use This Skill" or "When to Apply" section
  let appliesWhen = [];
  const whenSection = sections["When to Use This Skill"] ?? sections["When to Apply"] ?? sections["When to use"];
  if (whenSection) {
    appliesWhen = whenSection
      .split("\n")
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);
  }
  if (appliesWhen.length === 0) {
    // Fallback: use triggers from metadata
    const triggers = frontmatter.metadata?.triggers;
    if (typeof triggers === "string") {
      appliesWhen = triggers.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  if (appliesWhen.length === 0) {
    appliesWhen = [description.slice(0, 120)];
  }

  // Build a single category and rules from the body content
  const categories = [{ priority: 1, name: "General", impact: "HIGH", prefix: "gen-" }];
  const rules = [];
  let ruleIndex = 0;

  // Extract rules from body: look for headings and bullet-point guidance
  for (const [sectionName, sectionContent] of Object.entries(sections)) {
    // Skip known non-rule sections
    if (["When to Use This Skill", "When to Apply", "When to use",
         "Core Workflow", "Reference Guide", "Keywords", "Overview"].includes(sectionName)) {
      continue;
    }

    const sectionLines = sectionContent.split("\n");
    const bullets = sectionLines
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => line.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    if (bullets.length > 0) {
      for (const bullet of bullets) {
        ruleIndex++;
        rules.push({
          id: `gen-${ruleIndex}`,
          category: "General",
          title: bullet.length > 80 ? `${bullet.slice(0, 77)}...` : bullet,
          impact: "HIGH",
          summary: bullet,
        });
      }
    }
  }

  // If no rules extracted, create a synthetic rule from the description
  if (rules.length === 0) {
    rules.push({
      id: "gen-1",
      category: "General",
      title: title ?? slug,
      impact: "HIGH",
      summary: description,
    });
  }

  const skill = {
    slug,
    title: title ?? slug,
    description,
    version,
    appliesWhen,
    categories,
    rules,
  };

  if (author) skill.author = author;
  if (license) skill.license = license;
  if (frontmatter.dependencies) skill.dependencies = frontmatter.dependencies;

  // Preserve extra metadata (domain, triggers, role, scope, etc.)
  const metadataKeys = frontmatter.metadata ? Object.keys(frontmatter.metadata) : [];
  const reservedMetaKeys = new Set(["author", "version", "title"]);
  const extraMeta = {};
  for (const key of metadataKeys) {
    if (!reservedMetaKeys.has(key)) {
      extraMeta[key] = frontmatter.metadata[key];
    }
  }
  if (Object.keys(extraMeta).length > 0) {
    skill.metadata = extraMeta;
  }

  // Attach references if provided
  if (references.length > 0) {
    skill.references = references;
  }

  return skill;
}

// ---------------------------------------------------------------------------
// Read external skill files (JSON or SKILL.md)
// ---------------------------------------------------------------------------

/**
 * Read skill(s) from a JSON file.
 * Supports: bare skill object, { skill: ... }, { skills: [...] }, or array.
 */
export function readExternalSkillJson(filePath) {
  const absolutePath = resolve(filePath);
  const content = readFileSync(absolutePath, "utf8");

  const parsed = JSON.parse(content);
  if (parsed.slug && parsed.rules) {
    return [parsed];
  }
  if (parsed.skill && parsed.skill.slug) {
    return [parsed.skill];
  }
  if (Array.isArray(parsed.skills)) {
    return parsed.skills;
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  throw new Error(
    `Could not find skill data in ${filePath}. Expected a skill object with "slug" and "rules", ` +
    `or a wrapper with "skill" or "skills" key.`
  );
}

/**
 * Read a SKILL.md file and convert it to an AJS skill object.
 * If skillDir is provided and contains a references/ subdirectory,
 * those files are included as skill references.
 */
export function readSkillMdFile(filePath, skillDir = null) {
  const absolutePath = resolve(filePath);
  const content = readFileSync(absolutePath, "utf8");
  const { frontmatter, body } = parseSkillMdFrontmatter(content);

  if (!frontmatter) {
    throw new Error(`${filePath}: SKILL.md has no YAML frontmatter block.`);
  }

  const validationErrors = validateSkillMdFrontmatter(frontmatter, filePath);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid SKILL.md frontmatter:\n${validationErrors.map((e) => `  - ${e}`).join("\n")}`);
  }

  // Collect references from the skill directory
  const references = [];
  const refsDir = skillDir ? join(resolve(skillDir), "references") : join(dirname(absolutePath), "references");
  if (existsSync(refsDir)) {
    for (const entry of readdirSync(refsDir).sort()) {
      if (entry.endsWith(".md")) {
        const refContent = readFileSync(join(refsDir, entry), "utf8");
        const ref = { name: entry, content: refContent };

        // Try to extract a loadWhen hint from the reference table in the body
        const tableMatch = body.match(new RegExp(`\\|[^|]*${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^|]*\\|([^|]*)\\|`));
        if (tableMatch) {
          const loadWhen = tableMatch[1].trim();
          if (loadWhen) {
            ref.loadWhen = loadWhen;
          }
        }

        references.push(ref);
      }
    }
  }

  return skillMdToAjsSkill(frontmatter, body, references);
}

/**
 * Read skill(s) from a directory containing SKILL.md.
 */
export function readSkillDirectory(dirPath) {
  const absolutePath = resolve(dirPath);
  const skillMdPath = join(absolutePath, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    throw new Error(`No SKILL.md found in ${dirPath}. Expected a standard Agent Skills directory.`);
  }

  return readSkillMdFile(skillMdPath, absolutePath);
}

/**
 * Unified reader: auto-detects JSON, SKILL.md file, or skill directory.
 * Returns an array of AJS skill objects.
 */
export function readExternalSkill(filePath) {
  const absolutePath = resolve(filePath);

  // Directory with SKILL.md
  if (existsSync(absolutePath) && existsSync(join(absolutePath, "SKILL.md"))) {
    return [readSkillDirectory(absolutePath)];
  }

  // SKILL.md or other .md file
  if (filePath.endsWith(".md")) {
    return [readSkillMdFile(absolutePath)];
  }

  // JSON (original behavior)
  try {
    return readExternalSkillJson(absolutePath);
  } catch (jsonError) {
    if (jsonError instanceof SyntaxError) {
      throw new Error(
        `Cannot parse ${filePath}. File must be valid JSON or a standard SKILL.md.\n` +
        `Parse error: ${jsonError.message}`
      );
    }
    throw jsonError;
  }
}

// ---------------------------------------------------------------------------
// Export skill as standalone SKILL.md package
// ---------------------------------------------------------------------------

/**
 * Export an AJS skill object as a standalone SKILL.md package directory.
 * Creates:
 *   <outputDir>/SKILL.md         — frontmatter + body
 *   <outputDir>/references/*.md  — if the skill has references
 */
export function exportSkillPackage(skill, outputDir) {
  const absoluteDir = resolve(outputDir);
  const created = [];

  // Build frontmatter
  const metadata = {};
  if (skill.author) metadata.author = skill.author;
  metadata.version = skill.version;
  if (skill.metadata) {
    Object.assign(metadata, skill.metadata);
  }

  const frontmatterObj = {
    name: skill.slug,
    description: skill.description,
  };
  if (skill.license) frontmatterObj.license = skill.license;
  if (skill.dependencies?.length) frontmatterObj.dependencies = skill.dependencies;
  if (Object.keys(metadata).length > 0) frontmatterObj.metadata = metadata;

  const frontmatterYaml = renderYamlObjectLines(frontmatterObj).join("\n");

  // Build body
  const bodyLines = [
    `# ${skill.title}`,
    "",
    skill.description,
    "",
    "## When to Use This Skill",
    "",
    ...skill.appliesWhen.map((item) => `- ${item}`),
    "",
  ];

  // Add reference guide table if references exist
  if (skill.references?.length) {
    bodyLines.push("## Reference Guide", "");
    bodyLines.push("Load detailed guidance based on context:", "");
    bodyLines.push("| Topic | Reference | Load When |");
    bodyLines.push("|-------|-----------|-----------|");
    for (const ref of skill.references) {
      const topic = ref.name.replace(/\.md$/, "").replace(/[-_]/g, " ");
      const loadWhen = ref.loadWhen ?? topic;
      bodyLines.push(`| ${topic} | \`references/${ref.name}\` | ${loadWhen} |`);
    }
    bodyLines.push("");
  }

  // Add rules as guidance sections
  const categoryMap = new Map();
  for (const cat of skill.categories) {
    categoryMap.set(cat.name, cat);
  }

  for (const cat of skill.categories) {
    const catRules = skill.rules.filter((r) => r.category === cat.name);
    if (catRules.length === 0) continue;

    bodyLines.push(`## ${cat.name}`, "");
    for (const rule of catRules) {
      bodyLines.push(`- **${rule.title}**: ${rule.summary}`);
      if (rule.guidance?.length) {
        for (const g of rule.guidance) {
          bodyLines.push(`  - ${g}`);
        }
      }
    }
    bodyLines.push("");
  }

  // Add keywords section
  const keywords = [
    ...(skill.metadata?.triggers?.split(",").map((t) => t.trim()) ?? []),
    ...skill.appliesWhen.slice(0, 5),
  ].filter(Boolean);
  if (keywords.length > 0) {
    bodyLines.push("## Keywords", "");
    bodyLines.push(keywords.join(", "));
    bodyLines.push("");
  }

  const skillMdContent = `---\n${frontmatterYaml}\n---\n\n${bodyLines.join("\n").trimEnd()}\n`;
  const skillMdPath = join(absoluteDir, "SKILL.md");
  ensureDirectory(skillMdPath);
  writeFileSync(skillMdPath, skillMdContent, "utf8");
  created.push("SKILL.md");

  // Write references
  if (skill.references?.length) {
    const refsDir = join(absoluteDir, "references");
    mkdirSync(refsDir, { recursive: true });
    for (const ref of skill.references) {
      const refPath = join(refsDir, ref.name);
      writeFileSync(refPath, ref.content, "utf8");
      created.push(`references/${ref.name}`);
    }
  }

  return created;
}
