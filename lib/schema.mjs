// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { AGENT_IDS } from "./agent-targets.mjs";

/**
 * JSON Schema for the Agent Jump Start canonical spec (schemaVersion 1).
 *
 * This schema is intentionally self-contained (no $ref to external files)
 * so it can be published as a single artifact or embedded in documentation.
 * AGENT_IDS is imported to keep the canonical agent enum DRY across schema,
 * rendering, and detection.
 */
export const CANONICAL_SPEC_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/marcogoldin/agent-jump-start/schemas/canonical-spec.schema.json",
  title: "Agent Jump Start Canonical Spec",
  description: "Schema for the canonical project specification used by Agent Jump Start to generate synchronized AI agent instructions.",
  type: "object",
  required: [],
  additionalProperties: false,
  if: {
    not: { required: ["extends"] },
  },
  then: {
    required: ["schemaVersion", "project", "workspaceInstructions"],
  },
  else: {
    required: ["extends"],
  },
  properties: {
    extends: {
      type: "string",
      minLength: 1,
      description: "Relative path to a parent spec. The current file acts as an overlay merged on top of the parent.",
    },
    schemaVersion: {
      type: "integer",
      minimum: 1,
      description: "Schema version number. Currently 1.",
    },
    project: {
      type: "object",
      required: ["name", "summary"],
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        components: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    workspaceInstructions: {
      type: "object",
      additionalProperties: false,
      properties: {
        packageManagerRule: { type: "string" },
        runtimeRule: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "rules"],
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1 },
              rules: {
                type: "array",
                minItems: 1,
                items: { type: "string", minLength: 1 },
              },
            },
          },
        },
        validation: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    reviewChecklist: {
      type: "object",
      required: ["intro", "failureThreshold", "items"],
      additionalProperties: false,
      properties: {
        intro: { type: "string", minLength: 1 },
        failureThreshold: { type: "integer", minimum: 1 },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["title"],
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1 },
              details: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
        quickSignals: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        redFlags: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
    agentSupport: {
      type: "object",
      additionalProperties: false,
      description: "Controls which agents receive generated instruction files. Omit entirely to generate for all agents (backward-compatible default).",
      properties: {
        mode: {
          type: "string",
          enum: ["all", "selected"],
          description: "\"all\" generates files for every agent. \"selected\" restricts to the listed agents.",
        },
        selected: {
          type: "array",
          items: { type: "string", enum: [...AGENT_IDS] },
          minItems: 1,
          uniqueItems: true,
          description: "Canonical agent IDs to generate files for when mode is \"selected\".",
        },
      },
      if: { properties: { mode: { const: "selected" } } },
      then: { required: ["selected"] },
    },
    skills: {
      type: "array",
      items: { $ref: "#/$defs/skill" },
    },
  },
  $defs: {
    skill: {
      type: "object",
      required: ["slug", "title", "description", "version", "appliesWhen", "categories", "rules"],
      additionalProperties: false,
      properties: {
        slug: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          description: "URL-safe lowercase identifier with hyphens.",
        },
        name: {
          type: "string",
          description: "Legacy alias for slug. Must match slug when present.",
        },
        title: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        version: { type: "string", minLength: 1 },
        author: { type: "string", minLength: 1 },
        license: { type: "string", minLength: 1 },
        appliesWhen: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 1 },
        },
        categories: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["priority", "name", "impact", "prefix"],
            additionalProperties: false,
            properties: {
              priority: { type: "integer", minimum: 1 },
              name: { type: "string", minLength: 1 },
              impact: { type: "string", minLength: 1 },
              prefix: { type: "string", minLength: 1 },
            },
          },
        },
        rules: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["id", "category", "title", "impact", "summary"],
            additionalProperties: false,
            properties: {
              id: { type: "string", minLength: 1 },
              category: { type: "string", minLength: 1 },
              title: { type: "string", minLength: 1 },
              impact: { type: "string", minLength: 1 },
              summary: { type: "string", minLength: 1 },
              guidance: {
                type: "array",
                items: { type: "string", minLength: 1 },
              },
              semantic: {
                type: "string",
                enum: ["directive", "prohibition", "workflow", "example", "reference"],
                description: "Semantic classification of the rule, preserved from external skill sections.",
              },
            },
          },
        },
        triggers: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "Keywords or phrases that signal when the skill should activate.",
        },
        globs: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "File glob patterns that trigger the skill (e.g. '**/*.py', 'src/**/*.tsx').",
        },
        alwaysApply: {
          type: "boolean",
          description: "When true, the skill is always active regardless of triggers.",
        },
        manualOnly: {
          type: "boolean",
          description: "When true, the skill is only activated by explicit user request.",
        },
        relatedSkills: {
          type: "array",
          items: { type: "string", minLength: 1 },
          description: "Slugs of skills that are commonly used alongside this one.",
        },
        compatibility: {
          type: "array",
          items: {
            type: "string",
            enum: [...AGENT_IDS],
          },
          description: "Agent clients this skill is compatible with. Omit for universal compatibility.",
        },
        dependencies: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        metadata: {
          type: "object",
          additionalProperties: {
            oneOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
            ],
          },
        },
        references: {
          type: "array",
          items: { $ref: "#/$defs/skillReference" },
          description: "Supplementary reference files for progressive disclosure.",
        },
        scripts: {
          type: "array",
          items: { $ref: "#/$defs/skillScript" },
          description: "Executable scripts bundled with the skill.",
        },
        assets: {
          type: "array",
          items: { $ref: "#/$defs/skillAsset" },
          description: "Static resources (templates, data files, schemas) bundled with the skill.",
        },
      },
    },
    skillReference: {
      type: "object",
      required: ["name", "content"],
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.md$",
          description: "Filename for the reference (e.g. 'type-system.md').",
        },
        loadWhen: {
          type: "string",
          description: "Hint for when the agent should load this reference.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "Markdown content of the reference file.",
        },
      },
    },
    skillScript: {
      type: "object",
      required: ["name", "content"],
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]+$",
          description: "Filename for the script (e.g. 'setup.sh', 'lint.py').",
        },
        description: {
          type: "string",
          description: "Brief description of what the script does.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "Content of the script file.",
        },
      },
    },
    skillAsset: {
      type: "object",
      required: ["name", "content"],
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          pattern: "^[a-zA-Z0-9][a-zA-Z0-9._-]+$",
          description: "Filename for the asset (e.g. 'template.json', 'schema.xsd').",
        },
        description: {
          type: "string",
          description: "Brief description of the asset.",
        },
        content: {
          type: "string",
          minLength: 1,
          description: "Content of the asset file.",
        },
      },
    },
  },
};

/**
 * Expected structure of a standalone SKILL.md frontmatter.
 * Used to validate externally authored skill files before import.
 */
export const SKILLMD_FRONTMATTER_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/marcogoldin/agent-jump-start/schemas/skillmd-frontmatter.schema.json",
  title: "SKILL.md Frontmatter",
  description: "Schema for YAML frontmatter in Agent Skills-compatible SKILL.md files.",
  type: "object",
  required: ["name", "description"],
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    license: { type: "string" },
    triggers: {
      type: "array",
      items: { type: "string" },
    },
    globs: {
      type: "array",
      items: { type: "string" },
    },
    alwaysApply: { type: "boolean" },
    manualOnly: { type: "boolean" },
    relatedSkills: {
      type: "array",
      items: { type: "string" },
    },
    compatibility: {
      type: "array",
      items: { type: "string" },
    },
    dependencies: {
      type: "array",
      items: { type: "string" },
    },
    metadata: {
      type: "object",
      properties: {
        author: { type: "string" },
        version: { type: "string" },
        domain: { type: "string" },
        triggers: { type: "string" },
        role: { type: "string" },
        scope: { type: "string" },
        "output-format": { type: "string" },
        "related-skills": { type: "string" },
      },
      additionalProperties: {
        oneOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
        ],
      },
    },
  },
};
