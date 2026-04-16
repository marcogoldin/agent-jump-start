// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync, mkdtempSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { TOOL_VERSION } from "./constants.mjs";
import { makeLocalSourceInfo } from "./source-info.mjs";
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

// Sections whose content is metadata, not rules — skip during rule extraction.
const NON_RULE_SECTIONS = new Set([
  "When to Use This Skill", "When to Apply", "When to use",
  "Reference Guide", "Bundled Scripts", "Assets", "Keywords", "Overview",
]);

// Pattern that detects prohibition / constraint language in a rule.
const PROHIBITION_PATTERN = /\b(must\s*not|must_not|never|do\s*not|don['']t|avoid|prohibit|forbid)\b/i;

/**
 * Generate a short prefix from a section name.
 * "Core Workflow" → "cwf-", "Constraints" → "con-", "Code Examples" → "cex-"
 */
function sectionPrefix(name) {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/);
  if (words.length === 1) {
    return `${words[0].slice(0, 3).toLowerCase()}-`;
  }
  return `${words.map((w) => w[0].toLowerCase()).join("")}-`;
}

/**
 * Classify section kind from its heading name.
 * Important: "Constraints" returns "directive", not "prohibition", because
 * constraint sections routinely mix positive directives ("Must use X") with
 * prohibitions ("Must not use Y"). Individual rule text determines prohibition
 * status — see isProhibitionRule().
 */
function classifySectionKind(name) {
  const lower = name.toLowerCase();
  if (/prohibit|forbidden|don['']t|pitfall/.test(lower)) return "prohibition";
  if (/workflow|process|pipeline|steps/.test(lower)) return "workflow";
  if (/example|template|sample|snippet/.test(lower)) return "example";
  if (/reference|knowledge|guide|resource/.test(lower)) return "reference";
  return "directive";
}

/**
 * Detect whether a single rule text expresses a prohibition.
 */
function isProhibitionRule(text) {
  return PROHIBITION_PATTERN.test(text);
}

/**
 * Extract prose paragraphs (non-bullet, non-empty lines) from section content.
 */
function extractProse(content) {
  return content
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("- ") && !line.trim().startsWith("#"))
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Strip markdown formatting from a bullet point that may come from an AJS-exported SKILL.md.
 * Removes patterns like: "**MUST NOT:** **Title**: Summary" → "Summary"
 * Also handles: "**Title**: Summary" → "Summary"
 */
function cleanBulletText(raw) {
  let text = raw;
  // Strip leading "**MUST NOT:** " prefix
  text = text.replace(/^\*\*MUST NOT:\*\*\s*/, "");
  // Strip "**Title**: Rest" pattern — extract just the meaningful part after the last ":"
  const boldColonMatch = text.match(/^\*\*[^*]+\*\*:\s*(.+)$/);
  if (boldColonMatch) {
    text = boldColonMatch[1];
  }
  // Strip remaining bold markers
  text = text.replace(/\*\*/g, "");
  return text.trim();
}

/**
 * Convert a parsed SKILL.md (frontmatter + body) into an AJS-compatible skill object.
 *
 * This converter preserves the semantic structure of external SKILL.md files:
 * - Each section heading maps to its own category (not flattened into "General").
 * - Prohibition / constraint language is detected and tagged on rules.
 * - Prose paragraphs within sections are preserved as rule guidance.
 * - Section ordering is maintained via priority numbering.
 */
export function skillMdToAjsSkill(frontmatter, body, references = [], scripts = [], assets = []) {
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
    const triggers = frontmatter.metadata?.triggers;
    if (typeof triggers === "string") {
      appliesWhen = triggers.split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  if (appliesWhen.length === 0) {
    appliesWhen = [description.slice(0, 120)];
  }

  // Build categories and rules preserving section structure
  const categories = [];
  const rules = [];
  const usedPrefixes = new Set();
  let priorityCounter = 0;
  let globalRuleIndex = 0;

  for (const [sectionName, sectionContent] of Object.entries(sections)) {
    if (NON_RULE_SECTIONS.has(sectionName)) continue;

    const sectionLines = sectionContent.split("\n");
    const bullets = sectionLines
      .filter((line) => line.trim().startsWith("- "))
      .map((line) => cleanBulletText(line.replace(/^-\s*/, "").trim()))
      .filter(Boolean);

    const prose = extractProse(sectionContent);

    // Skip sections with no extractable content
    if (bullets.length === 0 && prose.length === 0) continue;

    priorityCounter++;
    const sectionKind = classifySectionKind(sectionName);

    // Generate a unique prefix
    let prefix = sectionPrefix(sectionName);
    if (usedPrefixes.has(prefix)) {
      prefix = `${prefix.slice(0, -1)}${priorityCounter}-`;
    }
    usedPrefixes.add(prefix);

    // Determine category impact based on section kind
    const categoryImpact = sectionKind === "prohibition" ? "CRITICAL" :
                           sectionKind === "workflow" ? "HIGH" :
                           sectionKind === "example" ? "MEDIUM" : "HIGH";

    categories.push({
      priority: priorityCounter,
      name: sectionName,
      impact: categoryImpact,
      prefix,
    });

    if (bullets.length > 0) {
      for (const bullet of bullets) {
        globalRuleIndex++;
        const ruleId = `${prefix}${globalRuleIndex}`;
        // Prohibition is determined ONLY by the rule text, never by section name alone.
        // A "Constraints" section can contain both positive directives ("Must use X")
        // and prohibitions ("Must not use Y") — only the latter should be tagged.
        const isProhibition = isProhibitionRule(bullet);
        const ruleImpact = isProhibition ? "CRITICAL" : categoryImpact;

        const rule = {
          id: ruleId,
          category: sectionName,
          title: bullet.length > 80 ? `${bullet.slice(0, 77)}...` : bullet,
          impact: ruleImpact,
          summary: bullet,
        };

        if (isProhibition) {
          rule.semantic = "prohibition";
        }

        rules.push(rule);
      }
    }

    // Preserve prose as a single rule with guidance when no bullets were found,
    // or attach it as guidance to the first rule in the section when bullets exist.
    if (prose.length > 0) {
      if (bullets.length === 0) {
        // Entire section is prose — create one encompassing rule
        globalRuleIndex++;
        const ruleId = `${prefix}${globalRuleIndex}`;
        rules.push({
          id: ruleId,
          category: sectionName,
          title: sectionName,
          impact: categoryImpact,
          summary: prose.join(" ").slice(0, 200),
          guidance: prose,
          semantic: sectionKind,
        });
      } else {
        // Attach prose as guidance to the first rule in this section
        const firstSectionRule = rules.find((r) => r.category === sectionName && !r.guidance);
        if (firstSectionRule) {
          firstSectionRule.guidance = prose;
        }
      }
    }
  }

  // Fallback: if no sections produced categories, create a single "General" category
  if (categories.length === 0) {
    categories.push({ priority: 1, name: "General", impact: "HIGH", prefix: "gen-" });
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

  // Trigger and activation metadata — imported from top-level frontmatter fields
  if (Array.isArray(frontmatter.triggers) && frontmatter.triggers.length > 0) {
    skill.triggers = frontmatter.triggers;
  }
  if (Array.isArray(frontmatter.globs) && frontmatter.globs.length > 0) {
    skill.globs = frontmatter.globs;
  }
  if (typeof frontmatter.alwaysApply === "boolean") {
    skill.alwaysApply = frontmatter.alwaysApply;
  }
  if (typeof frontmatter.manualOnly === "boolean") {
    skill.manualOnly = frontmatter.manualOnly;
  }
  if (Array.isArray(frontmatter.relatedSkills) && frontmatter.relatedSkills.length > 0) {
    skill.relatedSkills = frontmatter.relatedSkills;
  }
  if (Array.isArray(frontmatter.compatibility) && frontmatter.compatibility.length > 0) {
    skill.compatibility = frontmatter.compatibility;
  }

  if (frontmatter.dependencies) skill.dependencies = frontmatter.dependencies;

  // Preserve extra metadata (domain, role, scope, etc.)
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

  // Attach scripts if provided
  if (scripts.length > 0) {
    skill.scripts = scripts;
  }

  // Attach assets if provided
  if (assets.length > 0) {
    skill.assets = assets;
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
 * If skillDir is provided and contains references/, scripts/, or assets/ subdirectories,
 * those files are included in the skill.
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

  const baseDir = skillDir ? resolve(skillDir) : dirname(absolutePath);

  // Collect references from the skill directory
  const references = [];
  const refsDir = join(baseDir, "references");
  if (existsSync(refsDir)) {
    for (const entry of readdirSync(refsDir).sort()) {
      if (entry.startsWith(".")) continue;
      if (entry.endsWith(".md")) {
        const refContent = readFileSync(join(refsDir, entry), "utf8");
        if (refContent.length === 0) continue;
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

  // Collect scripts from the skill directory
  const scripts = [];
  const scriptsDir = join(baseDir, "scripts");
  if (existsSync(scriptsDir)) {
    for (const entry of readdirSync(scriptsDir).sort()) {
      if (entry.startsWith(".")) continue;
      const entryPath = join(scriptsDir, entry);
      if (statSync(entryPath).isFile()) {
        const scriptContent = readFileSync(entryPath, "utf8");
        if (scriptContent.length === 0) continue;
        const script = { name: entry, content: scriptContent };

        // Try to extract a description hint from a scripts table in the body
        const tableMatch = body.match(new RegExp(`\\|[^|]*${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^|]*\\|([^|]*)\\|`));
        if (tableMatch) {
          const desc = tableMatch[1].trim();
          if (desc) {
            script.description = desc;
          }
        }

        scripts.push(script);
      }
    }
  }

  // Collect assets from the skill directory
  const assets = [];
  const assetsDir = join(baseDir, "assets");
  if (existsSync(assetsDir)) {
    for (const entry of readdirSync(assetsDir).sort()) {
      if (entry.startsWith(".")) continue;
      const entryPath = join(assetsDir, entry);
      if (statSync(entryPath).isFile()) {
        const assetContent = readFileSync(entryPath, "utf8");
        if (assetContent.length === 0) continue;
        const asset = { name: entry, content: assetContent };

        const tableMatch = body.match(new RegExp(`\\|[^|]*${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^|]*\\|([^|]*)\\|`));
        if (tableMatch) {
          const desc = tableMatch[1].trim();
          if (desc) {
            asset.description = desc;
          }
        }

        assets.push(asset);
      }
    }
  }

  return skillMdToAjsSkill(frontmatter, body, references, scripts, assets);
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
// High-level skill source resolution for add-skill
// ---------------------------------------------------------------------------

function isGitHubUrl(value) {
  return typeof value === "string" && /^https:\/\/github\.com\//.test(value);
}

function normalizeProviderSource(source, provider = null) {
  if (provider) {
    return { provider, value: source };
  }

  const colonMatch = source.match(/^(github|skillfish|skills):(.*)$/);
  if (colonMatch) {
    return { provider: colonMatch[1], value: colonMatch[2] };
  }

  if (isGitHubUrl(source)) {
    return { provider: "github", value: source };
  }

  return { provider: "local", value: source };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });

  if (result.status === 0) {
    return result;
  }

  const lines = [
    `Command failed: ${command} ${args.join(" ")}`,
  ];

  if (result.stdout?.trim()) {
    lines.push(`STDOUT:\n${result.stdout.trimEnd()}`);
  }
  if (result.stderr?.trim()) {
    lines.push(`STDERR:\n${result.stderr.trimEnd()}`);
  }
  if (result.error?.message) {
    lines.push(`ERROR:\n${result.error.message}`);
  }

  throw new Error(lines.join("\n\n"));
}

export function findSkillCandidates(rootDir, maxDepth = 4, currentDepth = 0, matches = []) {
  if (!existsSync(rootDir) || currentDepth > maxDepth) {
    return matches;
  }

  const entries = readdirSync(rootDir, { withFileTypes: true });
  const hasSkillMd = entries.some((entry) =>
    (entry.isFile() || entry.isSymbolicLink()) && entry.name === "SKILL.md",
  );
  if (hasSkillMd) {
    matches.push(rootDir);
    return matches;
  }

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    let isDirectory;
    try {
      isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && statSync(entryPath).isDirectory());
    } catch {
      // Broken symlink — target does not exist.  Skip silently.
      continue;
    }
    if (!isDirectory) {
      continue;
    }
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    findSkillCandidates(entryPath, maxDepth, currentDepth + 1, matches);
  }

  return matches;
}

function resolveSkillPathCandidates(baseDir, skillName = null) {
  if (skillName) {
    const directCandidates = [
      join(baseDir, skillName),
      join(baseDir, "skills", skillName),
      join(baseDir, ".agents", "skills", skillName),
      join(baseDir, ".claude", "skills", skillName),
      join(baseDir, ".github", "skills", skillName),
    ];

    for (const candidate of directCandidates) {
      if (existsSync(join(candidate, "SKILL.md"))) {
        return candidate;
      }
    }
  }

  if (existsSync(join(baseDir, "SKILL.md"))) {
    return baseDir;
  }

  const matches = findSkillCandidates(baseDir);
  if (skillName) {
    const namedMatches = matches.filter((candidate) => candidate.endsWith(`/${skillName}`));
    if (namedMatches.length === 1) {
      return namedMatches[0];
    }
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const label = skillName ? ` for skill "${skillName}"` : "";
  const preview = matches.slice(0, 8).map((candidate) => `  - ${candidate}`).join("\n");
  throw new Error(
    matches.length === 0
      ? `Could not find a SKILL.md package${label} under ${baseDir}.`
      : `Found multiple SKILL.md packages${label} under ${baseDir}. Use --skill to disambiguate.\n${preview}`
  );
}

function parseGitHubSource(rawSource) {
  if (isGitHubUrl(rawSource)) {
    const trimmed = rawSource.replace(/\/+$/, "");
    const treeMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/tree\/([^/]+)\/(.+)$/);
    if (treeMatch) {
      return {
        repoUrl: `https://github.com/${treeMatch[1]}/${treeMatch[2]}.git`,
        ref: treeMatch[3],
        treePath: treeMatch[4],
      };
    }

    const repoMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (repoMatch) {
      return {
        repoUrl: `https://github.com/${repoMatch[1]}/${repoMatch[2]}.git`,
        ref: null,
        treePath: null,
      };
    }
  }

  const shorthand = rawSource.replace(/^github:/, "").replace(/\/+$/, "");
  const treeMatch = shorthand.match(/^([^/]+\/[^/]+?)(?:\/tree\/([^/]+)\/(.+))$/);
  if (treeMatch) {
    return {
      repoUrl: `https://github.com/${treeMatch[1]}.git`,
      ref: treeMatch[2],
      treePath: treeMatch[3],
    };
  }

  const repoMatch = shorthand.match(/^([^/]+\/[^/]+?)(?:\.git)?$/);
  if (repoMatch) {
    return {
      repoUrl: `https://github.com/${repoMatch[1]}.git`,
      ref: null,
      treePath: null,
    };
  }

  throw new Error(`Unsupported GitHub source: ${rawSource}`);
}

export function resolveSkillImportSource(source, options = {}) {
  const { provider, value } = normalizeProviderSource(source, options.provider ?? null);

  if (provider === "local") {
    return {
      importPath: resolve(value),
      cleanupPath: null,
      sourceLabel: value,
      sourceInfo: makeLocalSourceInfo(value),
    };
  }

  if (provider === "github") {
    const { repoUrl, ref, treePath } = parseGitHubSource(value);
    const tempRoot = mkdtempSync(join(tmpdir(), "ajs-skill-github-"));
    const cloneDir = join(tempRoot, "repo");
    const cloneArgs = ["clone", "--depth=1"];
    if (ref) {
      cloneArgs.push("--branch", ref);
    }
    cloneArgs.push(repoUrl, cloneDir);
    runCommand("git", cloneArgs);

    let importPath;
    if (treePath) {
      const candidate = resolve(join(cloneDir, treePath));
      if (!existsSync(candidate)) {
        let topLevel = [];
        try {
          topLevel = readdirSync(cloneDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith("."))
            .map((e) => e.name)
            .sort();
        } catch { /* ignore */ }
        const refLabel = ref ?? "default branch";
        const available = topLevel.length > 0
          ? `Available top-level folders: ${topLevel.join(", ")}.`
          : "The repository has no top-level folders to suggest.";
        const hint = options.skill
          ? ""
          : " If the skill lives under one of those folders, retry with the correct URL or pass --skill <slug>.";
        throw new Error(
          `Path "${treePath}" does not exist at ref "${refLabel}" in ${repoUrl}.\n${available}${hint}`,
        );
      }
      importPath = candidate;
    } else {
      try {
        importPath = resolveSkillPathCandidates(cloneDir, options.skill ?? null);
      } catch (err) {
        // Don't leak temp clone paths — rephrase in terms of the remote.
        const topLevel = (() => {
          try {
            return readdirSync(cloneDir, { withFileTypes: true })
              .filter((e) => e.isDirectory() && !e.name.startsWith("."))
              .map((e) => e.name)
              .sort();
          } catch { return []; }
        })();
        const available = topLevel.length > 0
          ? `Available top-level folders: ${topLevel.join(", ")}.`
          : "";
        throw new Error(
          `Could not locate a SKILL.md package in ${repoUrl}${ref ? ` at ref "${ref}"` : ""}. ${available} Pass --skill <slug> or use a tree URL pointing at the skill folder.`.trim(),
        );
      }
    }

    return {
      importPath,
      cleanupPath: tempRoot,
      sourceLabel: value,
      sourceInfo: {
        sourceType: "github",
        provider,
        source,
        repoUrl,
        ref,
        treePath,
        locator: treePath ?? options.skill ?? null,
        resolvedFrom: importPath,
      },
    };
  }

  if (provider === "skills") {
    if (!isNonEmptyString(options.skill)) {
      throw new Error(`The "${provider}" provider requires --skill <name>.`);
    }

    const tempRoot = mkdtempSync(join(tmpdir(), "ajs-skill-skills-"));
    const tempProject = join(tempRoot, "project");
    mkdirSync(tempProject, { recursive: true });
    writeFileSync(join(tempProject, "package.json"), '{ "name": "ajs-skill-import", "private": true }\n', "utf8");

    runCommand("npx", ["--yes", "skills", "add", value, "--skill", options.skill, "-y"], { cwd: tempProject });

    return {
      importPath: resolveSkillPathCandidates(tempProject, options.skill),
      cleanupPath: tempRoot,
      sourceLabel: `${provider}:${value}`,
      sourceInfo: {
        sourceType: "skills",
        provider,
        source,
        skill: options.skill,
        locator: value,
        resolvedFrom: resolveSkillPathCandidates(tempProject, options.skill),
      },
    };
  }

  if (provider === "skillfish") {
    if (!isNonEmptyString(options.skill)) {
      throw new Error(`The "${provider}" provider requires --skill <name>.`);
    }

    const tempRoot = mkdtempSync(join(tmpdir(), "ajs-skill-skillfish-"));
    const tempHome = join(tempRoot, "home");
    mkdirSync(tempHome, { recursive: true });
    mkdirSync(join(tempHome, ".claude", "skills"), { recursive: true });
    mkdirSync(join(tempHome, ".codex", "skills"), { recursive: true });
    mkdirSync(join(tempHome, ".github", "skills"), { recursive: true });
    mkdirSync(join(tempHome, ".agents", "skills"), { recursive: true });

    runCommand("npx", ["--yes", "skillfish", "add", value, options.skill], {
      cwd: tempRoot,
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        XDG_CONFIG_HOME: join(tempHome, ".config"),
      },
    });

    const installRoots = [
      join(tempHome, ".claude", "skills"),
      join(tempHome, ".codex", "skills"),
      join(tempHome, ".github", "skills"),
      join(tempHome, ".agents", "skills"),
    ];

    for (const root of installRoots) {
      try {
        const importPath = resolveSkillPathCandidates(root, options.skill);
        return {
          importPath,
          cleanupPath: tempRoot,
          sourceLabel: `${provider}:${value}`,
          sourceInfo: {
            sourceType: "skillfish",
            provider,
            source,
            skill: options.skill,
            locator: value,
            resolvedFrom: importPath,
          },
        };
      } catch {
        // Keep scanning known installation roots.
      }
    }

    throw new Error(`Skillfish did not install a discoverable SKILL.md package for "${options.skill}".`);
  }

  throw new Error(`Unsupported skill source provider: ${provider}`);
}

// ---------------------------------------------------------------------------
// Export skill as standalone SKILL.md package
// ---------------------------------------------------------------------------

/**
 * Export an AJS skill object as a standalone SKILL.md package directory.
 * Creates:
 *   <outputDir>/SKILL.md         — frontmatter + body
 *   <outputDir>/references/*.md  — if the skill has references
 *   <outputDir>/scripts/*        — if the skill has scripts
 *   <outputDir>/assets/*         — if the skill has assets
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

  // Trigger and activation metadata
  if (skill.triggers?.length) frontmatterObj.triggers = skill.triggers;
  if (skill.globs?.length) frontmatterObj.globs = skill.globs;
  if (skill.alwaysApply !== undefined) frontmatterObj.alwaysApply = skill.alwaysApply;
  if (skill.manualOnly !== undefined) frontmatterObj.manualOnly = skill.manualOnly;
  if (skill.relatedSkills?.length) frontmatterObj.relatedSkills = skill.relatedSkills;
  if (skill.compatibility?.length) frontmatterObj.compatibility = skill.compatibility;

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

  // Add scripts table if scripts exist
  if (skill.scripts?.length) {
    bodyLines.push("## Bundled Scripts", "");
    bodyLines.push("Executable scripts available for this skill:", "");
    bodyLines.push("| Script | Path | Description |");
    bodyLines.push("|--------|------|-------------|");
    for (const script of skill.scripts) {
      const label = script.name.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
      const description = script.description ?? label;
      bodyLines.push(`| ${label} | \`scripts/${script.name}\` | ${description} |`);
    }
    bodyLines.push("");
  }

  // Add assets table if assets exist
  if (skill.assets?.length) {
    bodyLines.push("## Assets", "");
    bodyLines.push("Static resources bundled with this skill:", "");
    bodyLines.push("| Asset | Path | Description |");
    bodyLines.push("|-------|------|-------------|");
    for (const asset of skill.assets) {
      const label = asset.name.replace(/[-_]/g, " ").replace(/\.[^.]+$/, "");
      const description = asset.description ?? label;
      bodyLines.push(`| ${label} | \`assets/${asset.name}\` | ${description} |`);
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
      const prefix = rule.semantic === "prohibition" ? "**MUST NOT:** " : "";
      bodyLines.push(`- ${prefix}**${rule.title}**: ${rule.summary}`);
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

  // Write scripts
  if (skill.scripts?.length) {
    const scriptsDir = join(absoluteDir, "scripts");
    mkdirSync(scriptsDir, { recursive: true });
    for (const script of skill.scripts) {
      const scriptPath = join(scriptsDir, script.name);
      writeFileSync(scriptPath, script.content, "utf8");
      created.push(`scripts/${script.name}`);
    }
  }

  // Write assets
  if (skill.assets?.length) {
    const assetsDir = join(absoluteDir, "assets");
    mkdirSync(assetsDir, { recursive: true });
    for (const asset of skill.assets) {
      const assetPath = join(assetsDir, asset.name);
      writeFileSync(assetPath, asset.content, "utf8");
      created.push(`assets/${asset.name}`);
    }
  }

  return created;
}
