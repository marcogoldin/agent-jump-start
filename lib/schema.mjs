// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * JSON Schema for the Agent Jump Start canonical spec (schemaVersion 1).
 *
 * This schema is intentionally self-contained (no $ref to external files)
 * so it can be published as a single artifact or embedded in documentation.
 */
export const CANONICAL_SPEC_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/marcogoldin/agent-jump-start/schemas/canonical-spec.schema.json",
  title: "Agent Jump Start Canonical Spec",
  description: "Schema for the canonical project specification used by Agent Jump Start to generate synchronized AI agent instructions.",
  type: "object",
  required: ["schemaVersion", "project", "workspaceInstructions"],
  additionalProperties: false,
  properties: {
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
            },
          },
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
