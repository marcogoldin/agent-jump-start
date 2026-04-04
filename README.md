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

## Prerequisites

- **Node.js** (v18 or later) to run the included generator script.
- No npm packages or external dependencies required.
- If Node.js is not desired as a helper runtime, reimplement the script in any language while keeping the same spec format and output layout.

## Quick Start

### Option A: One-command init (recommended)

```bash
npx agent-jump-start init --profile specs/profiles/react-vite-mui.profile.yaml --target .
```

This single command copies the framework, bootstraps the canonical spec with your chosen profile, validates the spec, and renders all instruction files. You're ready to customize.

Run without `--profile` to see available profiles:

```bash
npx agent-jump-start init --target .
```

### Option B: Step-by-step setup

#### 1. Copy into your project

Copy the `agent-jump-start` folder into your target repository:

```bash
cp -r agent-jump-start /path/to/your-project/docs/agent-jump-start
```

Or clone directly:

```bash
git clone https://github.com/YOUR_USERNAME/agent-jump-start.git docs/agent-jump-start
```

#### 2. Choose a starting profile

Available example profiles (list with `node scripts/agent-jump-start.mjs list-profiles`):

| Profile | Stack |
|---|---|
| `specs/profiles/react-vite-mui.profile.yaml` | React + Vite + Material UI |
| `specs/profiles/php-laravel.profile.yaml` | PHP 8.3 + Laravel |
| `specs/profiles/c-cpp.profile.yaml` | C/C++ with CMake, sanitizers, memory safety |

If neither fits, duplicate one and adjust it, or skip the profile and customize the base spec directly.

#### 3. Bootstrap the canonical spec

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs bootstrap \
  --base docs/agent-jump-start/specs/base-spec.yaml \
  --profile docs/agent-jump-start/specs/profiles/react-vite-mui.profile.yaml \
  --output docs/agent-jump-start/canonical-spec.yaml
```

This creates `docs/agent-jump-start/canonical-spec.yaml` — your **single source of truth**.

#### 4. Customize the canonical spec

Edit `canonical-spec.yaml` with your real:

- Project name and components
- Tech stack and runtime versions
- Coding rules and conventions
- Validation commands (lint, test, build)
- Skills and rule sets

#### 5. Render all instruction files

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean
```

The `--clean` flag removes stale files from previous renders (e.g., skills you removed from the spec).

This generates synchronized instruction files for all 9 supported agents:

```
AGENTS.md                                  # GitHub Agents
CLAUDE.md                                  # Claude Code
CONVENTIONS.md                             # Aider (with inline skill summaries)
.agents/AGENTS.md                          # Canonical workspace governance file
.github/copilot-instructions.md            # GitHub Copilot workspace instructions
.github/skills/<slug>/SKILL.md             # GitHub Copilot native skill package
.github/skills/<slug>/references/*.md      # On-demand reference docs (if defined)
.github/skills/<slug>/scripts/*            # Bundled executable scripts (if defined)
.github/skills/<slug>/assets/*             # Static resources and templates (if defined)
.cursor/rules/agent-instructions.mdc       # Cursor
.cursor/rules/<skill-slug>.mdc             # Cursor (per skill)
.windsurfrules                             # Windsurf (with inline skill summaries)
.clinerules                                # Cline (with inline skill summaries)
.roo/rules/agent-instructions.md           # Roo Code (with inline skill summaries)
.continue/rules/agent-instructions.md      # Continue.dev (with inline skill summaries)
.agents/skills/<slug>/SKILL.md             # GitHub Agents native skill package
.agents/skills/<slug>/AGENTS.md            # Backward-compatible expanded skill mirror
.agents/skills/<slug>/references/*.md      # On-demand reference docs (if defined)
.agents/skills/<slug>/scripts/*            # Bundled executable scripts (if defined)
.agents/skills/<slug>/assets/*             # Static resources and templates (if defined)
.claude/skills/<slug>/SKILL.md             # Claude Code native skill package
.claude/skills/<slug>/AGENTS.md            # Backward-compatible expanded skill mirror
.claude/skills/<slug>/references/*.md      # On-demand reference docs (if defined)
.claude/skills/<slug>/scripts/*            # Bundled executable scripts (if defined)
.claude/skills/<slug>/assets/*             # Static resources and templates (if defined)
docs/agent-review-checklist.md             # Review checklist
docs/agent-jump-start/generated-manifest.json
```

> **Canonical governance:** `.agents/AGENTS.md` is the canonical workspace governance file, and `.agents/skills/` is the canonical portable skill tree. Root agent instruction files and native skill mirrors are synchronized from those `.agents/` artifacts.

#### 6. Verify sync

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

Use this in CI pipelines or pre-commit hooks to enforce alignment.

### 7. Import external skills (optional)

Import skills from JSON, standalone `SKILL.md` files, or full skill directories with `references/`, `scripts/`, and `assets/`:

```bash
# Import a skill from JSON
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/external-skill.json

# Import a standalone SKILL.md file
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/SKILL.md

# Import a skill package directory (with references/, scripts/, assets/)
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory

# Import and overwrite an existing skill with the same slug
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/updated-skill \
  --replace
```

After importing, run `render` + `check` to propagate the new skill to all 9 agent targets.

The import command accepts:
- A single skill object (`{ "slug": "...", "rules": [...] }`)
- A wrapper with a `skill` key (`{ "skill": { ... } }`)
- A wrapper with a `skills` array (`{ "skills": [ ... ] }`)
- A standalone `SKILL.md` file with YAML frontmatter
- A skill directory containing `SKILL.md` and optional `references/*.md`, `scripts/*`, `assets/*`

Duplicate slugs are skipped unless `--replace` is passed.

### 8. Validate or export portable skills

```bash
# Validate an external skill package before importing it
node docs/agent-jump-start/scripts/agent-jump-start.mjs validate-skill \
  path/to/skill-directory

# Export one spec-defined skill as a standalone package
# (includes references/, scripts/, assets/ when present)
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --slug react-best-practices \
  --output exported-skills/react-best-practices

# Export the canonical spec JSON Schema
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-schema \
  --output docs/agent-jump-start/canonical-spec.schema.json
```

### 9. Use prompt templates

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
        +---> CLAUDE.md
        +---> AGENTS.md
        +---> .agents/AGENTS.md
        +---> .github/copilot-instructions.md
        +---> .github/skills/*/
        +---> .cursor/rules/*.mdc
        +---> .windsurfrules
        +---> .clinerules
        +---> .roo/rules/*.md
        +---> .continue/rules/*.md
        +---> CONVENTIONS.md
        +---> .agents/skills/*/              (SKILL.md + references/ + scripts/ + assets/)
        +---> .claude/skills/*/               (mirrored from .agents/skills/)
        +---> docs/agent-review-checklist.md
```

### Memory Injection Pattern

The canonical spec acts as a **memory injection layer** for all coding assistants:

1. **Rules** defined once in the spec are first rendered into canonical `.agents/AGENTS.md`, then mirrored into agent-native workspace instruction files
2. **Skills** (reusable rule sets) are first rendered into canonical `.agents/skills/<slug>/` packages, then mirrored or projected into agent-native locations
3. **Review checklists** aggregate all rules into a verification document
4. Every generated file includes a notice pointing back to the canonical spec, discouraging hand-edits

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
      "name": "skill-name",
      "title": "Skill Title",
      "description": "What this skill covers.",
      "version": "1.0.0",
      "author": "Your Team",
      "appliesWhen": ["Writing React components"],
      "categories": [
        { "priority": 1, "name": "Category", "impact": "HIGH", "prefix": "cat-" }
      ],
      "rules": [
        {
          "id": "cat-rule-name",
          "category": "Category",
          "title": "Rule Title",
          "impact": "HIGH",
          "summary": "What the rule means.",
          "guidance": ["How to apply it."]
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

## Design Choices

| Choice | Rationale |
|---|---|
| YAML-as-JSON format | Zero external dependencies; parseable by any language |
| Arrays replaced (not merged) in profiles | Predictable overlay behavior; no surprise rule interleaving |
| Generated notice in every file | Prevents accidental hand-edits that drift from the spec |
| Cursor MDC format with frontmatter | Native Cursor rules support with `alwaysApply` and `description` |
| Manifest with file list | Enables stale file detection, cleanup, and CI enforcement |
| `.agents/AGENTS.md` as canonical governance | One portable workspace source of truth before agent-specific mirrors |
| Skills as first-class objects | Reusable across projects; composable via profiles |
| `.agents/skills/` as canonical output | One portable source of truth before agent-specific mirrors |
| Standards-aligned `SKILL.md` generation | Portable across Claude, GitHub, and other Agent Skills-compatible clients |
| Skill references as first-class assets | Supports progressive disclosure and portable multi-file skill packages |
| Skill scripts and assets support | `scripts/` for executable code, `assets/` for static resources per Agent Skills spec |
| Inline skill summaries for non-native agents | Every agent gets skill guidance, even without skill folder support |
| Spec validation on every command | Catches errors early with readable, numbered diagnostics |
| `--clean` flag on render | Removes stale files from previous renders when spec evolves |

## Update Workflow

When project rules change:

1. Edit `canonical-spec.yaml`
2. Run `render`
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
4. Test with `node scripts/agent-jump-start.mjs check`
5. Submit a pull request

### Adding a New Profile

1. Duplicate an existing profile under `specs/profiles/`
2. Adjust `project`, `workspaceInstructions`, `reviewChecklist`, and `skills`
3. Test: `bootstrap` + `render` + `check`
4. Submit a PR

## License

[Mozilla Public License 2.0](LICENSE) (MPL-2.0).

You are free to use, modify, and distribute this software. If you modify any of the source files, the modified files must remain open source under MPL-2.0. You can combine this project with proprietary code in a larger work without affecting the license of the larger work. Attribution is required.
