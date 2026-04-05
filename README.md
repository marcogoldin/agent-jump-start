# Agent Jump Start

Portable, zero-dependency starter kit that keeps AI coding assistant instructions synchronized across **9 agent ecosystems** from a single canonical specification.

Define your project rules, coding standards, and skills once. Generate perfectly aligned instruction files for every major coding assistant automatically.

## Why

Most teams use more than one AI coding assistant. Each assistant reads its own instruction file format. Keeping rules consistent across Claude Code, Copilot, Cursor, Windsurf, and others becomes a maintenance burden that grows with every new tool.

Agent Jump Start solves this with one canonical YAML/JSON spec that feeds a zero-dependency Node.js generator. One source of truth, many synchronized outputs.

**Bonus:** you can pool the token budgets of multiple assistants while guaranteeing they all follow the same guidelines and memory-injected rules.

## Supported Agents

| Agent | IDE / Environment | Instruction Files |
|---|---|---|
| **Claude Code** | VS Code, JetBrains, CLI | `CLAUDE.md`, `.claude/skills/*/SKILL.md` |
| **GitHub Copilot** | VS Code, JetBrains, Neovim | `.github/copilot-instructions.md`, `.github/skills/*/SKILL.md` |
| **GitHub Agents** | GitHub (cloud) | `AGENTS.md`, `.agents/skills/*/SKILL.md` |
| **Cursor** | Cursor (VS Code fork) | `.cursor/rules/*.mdc` |
| **Windsurf** | Windsurf / Codeium (VS Code fork) | `.windsurfrules` |
| **Cline** | VS Code extension | `.clinerules` |
| **Roo Code** | VS Code extension (Cline fork) | `.roo/rules/*.md` |
| **Continue.dev** | VS Code, JetBrains extension | `.continue/rules/*.md` |
| **Aider** | CLI | `CONVENTIONS.md` |

> **Other assistants** such as Amazon Q Developer, JetBrains AI Assistant, and Sourcegraph Cody can also benefit by reading `AGENTS.md` or `CONVENTIONS.md` when their native instruction formats become standardized.

## What's New in v1.8.0

### External Skill Fidelity

Importing external community skills (e.g., from `anthropics/skills` or `claude-skills`) now preserves the original author's semantic intent instead of flattening everything into a generic structure.

**Before v1.8.0:** all imported sections were collapsed into a single "General" category with synthetic `gen-N` rule IDs. Prohibition constraints like "do not skip type annotations" lost their negative semantics.

**After v1.8.0:**

| Feature | Before | After |
|---|---|---|
| Section structure | Flattened to 1 category | Each section becomes its own category |
| Prohibition detection | None | `must not`, `never`, `avoid`, `do not` auto-tagged |
| Rule IDs | Synthetic `gen-1`, `gen-2`... | Semantic prefixes: `con-6`, `bp-2`, `cwf-1` |
| Prose sections | Lost | Preserved as rule guidance |
| Section ordering | Lost | Maintained via priority numbers |
| Rendered output | Generic rules | `[PROHIBITION]`, `[WORKFLOW]`, `[EXAMPLE]` tags |
| Round-trip fidelity | Lossy | Stable through import → export → re-import |

### Semantic Rule Tags

Rules now support an optional `semantic` field: `"directive"`, `"prohibition"`, `"workflow"`, `"example"`, `"reference"`. These are auto-detected on import and preserved through rendering and export.

### Mirror Sync Integrity

- Canonical `.agents/skills/` packages and `.claude/skills/` / `.github/skills/` mirrors are verified byte-identical
- References, scripts, and assets are synced across all three mirror locations
- 60 automated tests (up from 46) cover fidelity, sync, and round-trip scenarios

## Prerequisites

- **Node.js** (v18 or later) to run the included generator script.
- No npm packages or external dependencies required.
- If Node.js is not desired as a helper runtime, reimplement the script in any language while keeping the same spec format and output layout.

## Complete Workflow: From Zero to Synchronized Agents

This section walks you through the entire workflow from start to finish, including importing external skills and understanding how synchronization works.

### Step 1: Initialize the framework

Pick the approach that fits your project.

**Option A — One-command init (recommended):**

```bash
npx agent-jump-start init --profile specs/profiles/react-vite-mui.profile.yaml --target .
```

This copies the framework into `docs/agent-jump-start/`, bootstraps a canonical spec with your chosen profile, validates it, and renders all instruction files in one step.

Run without `--profile` to see available profiles:

```bash
npx agent-jump-start init --target .
```

**Option B — Step-by-step setup:**

```bash
# Clone the toolkit
git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start

# Bootstrap the canonical spec (combine base + profile)
node docs/agent-jump-start/scripts/agent-jump-start.mjs bootstrap \
  --base docs/agent-jump-start/specs/base-spec.yaml \
  --profile docs/agent-jump-start/specs/profiles/react-vite-mui.profile.yaml \
  --output docs/agent-jump-start/canonical-spec.yaml
```

### Step 2: Customize the canonical spec

Edit `docs/agent-jump-start/canonical-spec.yaml` with your real project details:

- Project name and components
- Tech stack and runtime versions
- Coding rules and conventions
- Validation commands (lint, test, build)
- Skills and rule sets

### Step 3: Render all instruction files

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean
```

This single command generates synchronized instruction files for **all 9 agents simultaneously**:

```
.agents/AGENTS.md                          # Canonical workspace governance (source of truth)
.agents/skills/<slug>/SKILL.md             # Canonical skill packages
.agents/skills/<slug>/AGENTS.md            # Backward-compatible expanded mirror
.agents/skills/<slug>/references/*.md      # On-demand reference docs
.agents/skills/<slug>/scripts/*            # Bundled executable scripts
.agents/skills/<slug>/assets/*             # Static resources and templates
AGENTS.md                                  # GitHub Agents (mirror of .agents/AGENTS.md)
CLAUDE.md                                  # Claude Code (mirror of .agents/AGENTS.md)
.claude/skills/<slug>/SKILL.md             # Claude native skill (mirror of .agents/skills/)
.github/copilot-instructions.md            # GitHub Copilot (mirror of .agents/AGENTS.md)
.github/skills/<slug>/SKILL.md             # Copilot native skill (mirror of .agents/skills/)
.cursor/rules/agent-instructions.mdc       # Cursor workspace rules
.cursor/rules/<slug>.mdc                   # Cursor per-skill rules
.windsurfrules                             # Windsurf (mirror + inline skills)
.clinerules                                # Cline (mirror + inline skills)
.roo/rules/agent-instructions.md           # Roo Code (mirror + inline skills)
.continue/rules/agent-instructions.md      # Continue.dev (mirror + inline skills)
CONVENTIONS.md                             # Aider (mirror + inline skills)
docs/agent-review-checklist.md             # Aggregated review checklist
docs/agent-jump-start/generated-manifest.json
```

**How synchronization works:**

1. The generator reads your single canonical spec
2. `.agents/AGENTS.md` is generated as the **canonical workspace governance file** (no mirror notice)
3. Root files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`) are generated as **mirrors** that reference the canonical source
4. Agents without native skill folders (Windsurf, Cline, Roo Code, Continue.dev, Aider) receive the workspace instructions **plus inline skill summaries**
5. Each skill defined in the spec is rendered as a canonical `.agents/skills/<slug>/` package, then **byte-identical mirrors** are generated at `.claude/skills/<slug>/` and `.github/skills/<slug>/`
6. Cursor gets its own MDC-format files with native frontmatter
7. A manifest tracks every generated file for stale detection

The `--clean` flag removes files from previous renders that are no longer in the spec (e.g., skills you deleted).

### Step 4: Verify sync

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

This compares every generated file against what the spec would produce. If anything has drifted (hand-edits, stale files, missing files), it exits with code `1` and reports the mismatches.

Use this in **CI pipelines** or **pre-commit hooks** to enforce alignment.

### Step 5: Import external skills

This is where Agent Jump Start becomes an interoperability layer for the broader AI skills ecosystem.

**Import a community skill package:**

```bash
# Import a skill directory (e.g., from anthropics/skills or claude-skills)
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/python-pro

# Import a standalone SKILL.md file
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/SKILL.md

# Import from a JSON skill file
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill.json

# Overwrite an existing skill with the same slug
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/updated-skill --replace
```

**What happens during import (v1.8.0+):**

1. The importer reads the external `SKILL.md` frontmatter and body
2. Each H2 section (`## Best Practices`, `## Constraints`, etc.) becomes its own **category** with a semantic prefix
3. Bullet points within each section become individual **rules**
4. Prohibition language (`must not`, `never`, `avoid`, `do not`) is automatically detected and rules are tagged with `semantic: "prohibition"`
5. Prose-only sections (like `## Core Workflow`) are preserved as rules with the original text in the `guidance` array
6. References (`references/*.md`), scripts (`scripts/*`), and assets (`assets/*`) are collected and stored in the spec
7. Metadata (author, version, triggers, license) is preserved from the frontmatter

**After import, re-render and verify:**

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean

node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

The imported skill is now automatically synchronized across all 9 agent ecosystems.

### Step 6: Validate and export skills

```bash
# Validate an external skill package before importing it
node docs/agent-jump-start/scripts/agent-jump-start.mjs validate-skill \
  path/to/skill-directory

# Export one skill as a standalone portable package
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --slug python-pro \
  --output exported-skills/python-pro

# Export the canonical spec JSON Schema
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-schema \
  --output docs/agent-jump-start/canonical-spec.schema.json
```

Exported skill packages are standards-aligned SKILL.md directories that can be shared with other teams or imported into other Agent Jump Start projects.

### Step 7: Commit and maintain

```bash
# Commit both the spec and all generated files together
git add docs/agent-jump-start/canonical-spec.yaml .agents/ .claude/ .github/ \
  AGENTS.md CLAUDE.md CONVENTIONS.md .cursor/ .windsurfrules .clinerules \
  .roo/ .continue/ docs/agent-review-checklist.md
git commit -m "sync: update agent instructions from canonical spec"
```

When project rules change, repeat the cycle: **edit spec → render → check → commit**.

### Step 8: Use prompt templates (optional)

Pick a prompt from `docs/agent-jump-start/prompts/` and paste it into any supported agent:

| Prompt | Purpose |
|---|---|
| `01-bootstrap-any-agent.md` | Initial setup in a new project |
| `02-change-stack-or-guidelines.md` | Update rules after stack changes |
| `03-add-or-update-skill.md` | Add or revise a skill |

## How It Works

```
canonical-spec.yaml          (single source of truth)
        |
        v
 agent-jump-start.mjs        (zero-dependency generator)
        |
        +---> .agents/AGENTS.md              (canonical governance)
        +---> .agents/skills/*/              (canonical skill packages)
        |       SKILL.md + references/ + scripts/ + assets/
        |
        +---> CLAUDE.md                      (mirror)
        +---> .claude/skills/*/              (byte-identical mirror)
        +---> AGENTS.md                      (mirror)
        +---> .github/copilot-instructions.md (mirror)
        +---> .github/skills/*/              (byte-identical mirror)
        +---> .cursor/rules/*.mdc            (Cursor native format)
        +---> .windsurfrules                 (mirror + inline skills)
        +---> .clinerules                    (mirror + inline skills)
        +---> .roo/rules/*.md                (mirror + inline skills)
        +---> .continue/rules/*.md           (mirror + inline skills)
        +---> CONVENTIONS.md                 (mirror + inline skills)
        +---> docs/agent-review-checklist.md
```

### Memory Injection Pattern

The canonical spec acts as a **memory injection layer** for all coding assistants:

1. **Rules** defined once in the spec are first rendered into canonical `.agents/AGENTS.md`, then mirrored into agent-native workspace instruction files
2. **Skills** (reusable rule sets) are first rendered into canonical `.agents/skills/<slug>/` packages, then byte-identical mirrors are generated for `.claude/skills/` and `.github/skills/`
3. **Prohibition semantics** are preserved: rules tagged with `semantic: "prohibition"` are rendered with `[PROHIBITION]` markers and `MUST NOT` blockquotes
4. **Review checklists** aggregate all rules into a verification document
5. Every generated file includes a notice pointing back to the canonical spec, discouraging hand-edits

This means whichever assistant you use — Claude, Copilot, Cursor, or any other — it reads the same rules, follows the same conventions, and produces consistent output.

## Canonical Spec Structure

```yaml
{
  "schemaVersion": 1,
  "project": {
    "name": "Your Project",
    "summary": "Short description",
    "components": ["frontend: React app", "backend: Node API"]
  },
  "workspaceInstructions": {
    "packageManagerRule": "Use npm.",
    "runtimeRule": "Node 20 in dev and prod.",
    "sections": [
      { "title": "General rules", "rules": ["..."] },
      { "title": "React rules", "rules": ["..."] }
    ],
    "validation": ["npm run lint", "npm run test", "npm run build"]
  },
  "reviewChecklist": {
    "intro": "...",
    "failureThreshold": 2,
    "items": [{ "title": "...", "details": ["..."] }],
    "quickSignals": ["..."],
    "redFlags": ["..."]
  },
  "skills": [
    {
      "slug": "skill-name",
      "title": "Skill Title",
      "description": "What this skill covers.",
      "version": "1.0.0",
      "author": "Your Team",
      "appliesWhen": ["Writing React components"],
      "categories": [
        { "priority": 1, "name": "Best Practices", "impact": "HIGH", "prefix": "bp-" },
        { "priority": 2, "name": "Constraints", "impact": "CRITICAL", "prefix": "con-" }
      ],
      "rules": [
        {
          "id": "bp-1",
          "category": "Best Practices",
          "title": "Use type annotations",
          "impact": "HIGH",
          "summary": "Always use type annotations on public APIs.",
          "guidance": ["Apply to all function signatures and class attributes."]
        },
        {
          "id": "con-2",
          "category": "Constraints",
          "title": "No mutable defaults",
          "impact": "CRITICAL",
          "summary": "Never use mutable default arguments.",
          "semantic": "prohibition"
        }
      ],
      "references": [
        { "name": "patterns.md", "content": "...", "loadWhen": "Design patterns" }
      ],
      "scripts": [
        { "name": "setup.sh", "content": "...", "description": "Run setup" }
      ],
      "assets": [
        { "name": "template.json", "content": "...", "description": "Config template" }
      ]
    }
  ]
}
```

> The spec uses a strict YAML 1.2 subset that is also valid JSON, allowing zero-dependency parsing with `JSON.parse`. To use richer YAML syntax, swap in a dedicated YAML parser.

### Semantic Rule Tags

Rules support an optional `semantic` field that classifies the rule's intent:

| Tag | Meaning | Rendering |
|---|---|---|
| `directive` | Standard guidance | Normal rendering |
| `prohibition` | Something that must NOT be done | `[PROHIBITION]` tag, `MUST NOT` blockquote |
| `workflow` | Ordered process or pipeline | `[WORKFLOW]` tag |
| `example` | Code example or template | `[EXAMPLE]` tag |
| `reference` | Points to external knowledge | Normal rendering |

These tags are **auto-detected during import** from section headings and rule text patterns. You can also set them manually in your spec.

## Design Choices

| Choice | Rationale |
|---|---|
| YAML-as-JSON format | Zero external dependencies; parseable by any language |
| Arrays replaced (not merged) in profiles | Predictable overlay behavior; no surprise rule interleaving |
| Generated notice in every file | Prevents accidental hand-edits that drift from the spec |
| Cursor MDC format with frontmatter | Native Cursor rules support with `alwaysApply` and `description` |
| Manifest with file list | Enables stale file detection, cleanup, and CI enforcement |
| `.agents/AGENTS.md` as canonical governance | One portable workspace source of truth before agent-specific mirrors |
| `.agents/skills/` as canonical output | One portable source of truth before agent-specific mirrors |
| Skills as first-class objects | Reusable across projects; composable via profiles |
| Standards-aligned `SKILL.md` generation | Portable across Claude, GitHub, and other Agent Skills-compatible clients |
| Section-preserving import | External skills keep their original structure, not flattened to "General" |
| Prohibition auto-detection | Negative constraints are tagged and rendered distinctly |
| Semantic rule tags | Rules carry intent metadata through import/export/render cycles |
| Byte-identical mirrors | `.claude/skills/` and `.github/skills/` are exact copies of `.agents/skills/` |
| Progressive disclosure resources | `references/`, `scripts/`, `assets/` per Agent Skills specification |
| Inline skill summaries for non-native agents | Every agent gets skill guidance, even without skill folder support |
| Spec validation on every command | Catches errors early with readable, numbered diagnostics |
| `--clean` flag on render | Removes stale files from previous renders when spec evolves |

## Update Workflow

When project rules change:

1. Edit `canonical-spec.yaml`
2. Run `render --clean`
3. Run `check`
4. Commit both the spec and the regenerated files together

## Team Rules

- Never hand-edit generated instruction files when the change belongs in the canonical spec.
- Keep workspace instructions identical across agents unless an agent-specific deviation is intentional.
- Store any intentional deviation in the canonical spec so it remains explicit and reviewable.
- Run `check` in CI to catch drift before merging.

## CLI Reference

```bash
# Show help
node scripts/agent-jump-start.mjs --help

# Show version
node scripts/agent-jump-start.mjs --version

# One-step init (copies framework, bootstraps, validates, renders)
npx agent-jump-start init --profile specs/profiles/react-vite-mui.profile.yaml --target .

# List supported agents
node scripts/agent-jump-start.mjs list-agents

# List available profiles
node scripts/agent-jump-start.mjs list-profiles

# Bootstrap from base + profile
node scripts/agent-jump-start.mjs bootstrap \
  --base specs/base-spec.yaml \
  --profile specs/profiles/react-vite-mui.profile.yaml \
  --output canonical-spec.yaml

# Render all instruction files (--clean removes stale files)
node scripts/agent-jump-start.mjs render \
  --spec canonical-spec.yaml --target . --clean

# Verify sync (CI-friendly, exits 1 on drift)
node scripts/agent-jump-start.mjs check \
  --spec canonical-spec.yaml --target .

# Validate spec structure without rendering
node scripts/agent-jump-start.mjs validate \
  --spec canonical-spec.yaml

# Validate an external SKILL.md file or skill directory
node scripts/agent-jump-start.mjs validate-skill \
  path/to/skill-directory

# Import an external skill into the canonical spec
node scripts/agent-jump-start.mjs import-skill \
  --spec canonical-spec.yaml \
  --skill path/to/skill-directory [--replace]

# Export one skill as a standalone package
node scripts/agent-jump-start.mjs export-skill \
  --spec canonical-spec.yaml \
  --slug react-best-practices \
  --output ./exported-skills/react-best-practices

# Export the canonical spec JSON Schema
node scripts/agent-jump-start.mjs export-schema \
  --output canonical-spec.schema.json
```

## Testing

Run the full test suite:

```bash
npm test
```

The test suite covers 60 scenarios including:

- Core workflow: render → check round-trips, init with and without profiles
- Canonical governance: `.agents/AGENTS.md` generation, mirror notices, inline skill summaries
- Validation: malformed specs, invalid slugs, duplicate IDs, empty fields, semantic tags
- Skills: import (JSON, SKILL.md, directory), export, round-trips
- Progressive disclosure: references, scripts, assets rendering and sync
- **External skill fidelity**: section preservation, prohibition detection, prose preservation
- **Mirror sync integrity**: byte-parity between canonical and mirrors, reference sync

## Folder Layout

```
agent-jump-start/
  README.md
  LICENSE
  package.json
  scripts/
    agent-jump-start.mjs
  lib/
    constants.mjs
    files.mjs
    renderers.mjs
    schema.mjs
    skills.mjs
    utils.mjs
    validation.mjs
  specs/
    base-spec.yaml
    profiles/
      c-cpp.profile.yaml
      php-laravel.profile.yaml
      react-vite-mui.profile.yaml
  prompts/
    01-bootstrap-any-agent.md
    02-change-stack-or-guidelines.md
    03-add-or-update-skill.md
  tests/
    agent-jump-start.test.mjs
```

## Portability

This kit is stack-agnostic at the content level. The generator uses Node.js because it is a practical cross-platform runtime for IDE-driven workflows.

If Node.js is not desired, you can:

- Keep the same canonical spec format
- Keep the same generated file tree
- Reuse the same prompt templates
- Reimplement the generator in Python, PHP, Go, Ruby, or shell

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Add or update profiles, skills, or generator features
4. Run the test suite: `npm test`
5. Submit a pull request

### Adding a New Profile

1. Duplicate an existing profile under `specs/profiles/`
2. Adjust `project`, `workspaceInstructions`, `reviewChecklist`, and `skills`
3. Test: `bootstrap` + `render` + `check`
4. Submit a PR

## License

[Mozilla Public License 2.0](LICENSE) (MPL-2.0).

You are free to use, modify, and distribute this software. If you modify any of the source files, the modified files must remain open source under MPL-2.0. You can combine this project with proprietary code in a larger work without affecting the license of the larger work. Attribution is required.
