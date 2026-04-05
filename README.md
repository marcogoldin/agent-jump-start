# Agent Jump Start

Agent Jump Start keeps AI coding assistant instructions synchronized across 9 agent ecosystems from one canonical spec.

You define project rules, review guidance, and reusable skills once. The generator renders the right files for each supported agent and gives you a `check` command to catch drift in CI.

## What It Does

From one canonical spec, Agent Jump Start generates:

- canonical workspace governance in `.agents/AGENTS.md`
- canonical portable skill packages in `.agents/skills/<slug>/`
- native skill mirrors for `.claude/skills/` and `.github/skills/`
- agent-specific instruction files for Cursor, Windsurf, Cline, Roo Code, Continue.dev, and Aider
- a generated review checklist
- a manifest for stale-file cleanup and drift detection

The project is zero-dependency at runtime. It uses only Node.js built-ins.

## Supported Agents

| Agent | Generated output |
|---|---|
| Claude Code | `CLAUDE.md`, `.claude/skills/*/SKILL.md` |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/skills/*/SKILL.md` |
| GitHub Agents | `AGENTS.md`, `.agents/skills/*/SKILL.md` |
| Cursor | `.cursor/rules/agent-instructions.mdc`, `.cursor/rules/*.mdc` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |
| Roo Code | `.roo/rules/agent-instructions.md` |
| Continue.dev | `.continue/rules/agent-instructions.md` |
| Aider | `CONVENTIONS.md` |

Notes:

- `.agents/AGENTS.md` is the canonical workspace instruction file.
- `.agents/skills/` is the canonical skill package tree.
- `.claude/skills/` and `.github/skills/` are byte-identical mirrors of the canonical skill packages.
- Agents without native skill-package support receive mirrored workspace instructions plus inline skill summaries.

## Requirements

- Node.js `>= 18`
- no npm dependencies required after install

## Recommended Setup

### Option A: One-command setup

Use this when you want the framework copied into your project automatically.

```bash
npx agent-jump-start init --target .
```

To start from a built-in profile:

```bash
npx agent-jump-start init \
  --profile specs/profiles/react-vite-mui.profile.yaml \
  --target .
```

This creates:

- `docs/agent-jump-start/`
- `docs/agent-jump-start/canonical-spec.yaml`
- all generated instruction files for the supported agents

### Option B: Vendor the repository into your project

Use this when you want the toolkit stored in your repository explicitly.

```bash
git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start
```

Then bootstrap and render:

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs bootstrap \
  --base docs/agent-jump-start/specs/base-spec.yaml \
  --output docs/agent-jump-start/canonical-spec.yaml

node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean
```

## Step-by-Step Workflow

### 1. Initialize

Pick one of the setup options above.

### 2. Edit the canonical spec

Open:

`docs/agent-jump-start/canonical-spec.yaml`

Fill in:

- project name and summary
- repository components
- workspace rules
- validation commands
- review checklist
- optional skills

The spec is written as a strict YAML subset that is also valid JSON. It can be parsed with `JSON.parse`, which keeps the generator zero-dependency.

### 3. Render all outputs

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean
```

Use `--clean` whenever the spec changed and you want stale generated files removed.

### 4. Verify synchronization

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

`check` exits with code `1` when generated files drift from the spec.

### 5. Commit the spec and generated files together

Typical flow:

```bash
git add docs/agent-jump-start/canonical-spec.yaml \
  .agents/ .claude/ .github/ .cursor/ .roo/ .continue/ \
  AGENTS.md CLAUDE.md .windsurfrules .clinerules CONVENTIONS.md \
  docs/agent-review-checklist.md

git commit -m "sync: update agent instructions from canonical spec"
```

## External Skill Import

Agent Jump Start can import external `SKILL.md` packages into the canonical spec, then synchronize them across the supported outputs.

### Supported import sources

- a skill directory such as `path/to/python-pro/`
- an installed skill package such as `.agents/skills/python-pro/` or `~/.agents/skills/python-pro/`
- a standalone `SKILL.md`
- a legacy JSON skill file

### Validate a skill before import

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs validate-skill \
  path/to/skill-directory
```

### Import a skill

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory
```

To overwrite an existing skill with the same slug:

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory \
  --replace
```

After import:

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target . --clean

node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

### Common external sources

Developers currently install and distribute skills in a few common ways:

- clone a public skills repository and import a skill directory directly
- use `npx skills add <repo> --skill <name>` to install project-level skills
- use `npx skills add <repo> --skill <name> -g` to install user-level skills
- share a standalone `SKILL.md` package

In the public Agent Skills ecosystem, `.agents/skills/` is now a strong cross-client convention. GitHub also documents `.agents/skills/`, `.claude/skills/`, and `.github/skills/` as supported project skill locations.

## Export

Export one skill as a portable package:

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --slug python-pro \
  --output ./exported-skills/python-pro
```

Export the canonical spec schema:

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs export-schema \
  --output docs/agent-jump-start/canonical-spec.schema.json
```

## What Gets Generated

Typical render output:

```text
.agents/AGENTS.md
.agents/skills/<slug>/SKILL.md
.agents/skills/<slug>/AGENTS.md
.agents/skills/<slug>/references/*
.agents/skills/<slug>/scripts/*
.agents/skills/<slug>/assets/*
AGENTS.md
CLAUDE.md
.claude/skills/<slug>/SKILL.md
.github/copilot-instructions.md
.github/skills/<slug>/SKILL.md
.cursor/rules/agent-instructions.mdc
.cursor/rules/<slug>.mdc
.windsurfrules
.clinerules
.roo/rules/agent-instructions.md
.continue/rules/agent-instructions.md
CONVENTIONS.md
docs/agent-review-checklist.md
docs/agent-jump-start/generated-manifest.json
```

## How Synchronization Works

The synchronization model is:

```text
canonical-spec.yaml
  -> .agents/AGENTS.md
  -> .agents/skills/<slug>/
  -> agent-specific mirrors and projections
```

In practice:

1. The spec is validated.
2. `.agents/AGENTS.md` is rendered as the canonical workspace instruction file.
3. Skills are rendered into canonical `.agents/skills/<slug>/` packages.
4. `.claude/skills/` and `.github/skills/` are generated as byte-identical mirrors of the canonical packages.
5. Cursor gets MDC projections.
6. Agents without native skill folders receive mirrored workspace guidance plus inline skill summaries.
7. `generated-manifest.json` records managed files so `check` and `--clean` can detect drift and stale outputs.

## Minimal Spec Example

```yaml
{
  "schemaVersion": 1,
  "project": {
    "name": "Example Repo",
    "summary": "Example project using Agent Jump Start.",
    "components": [
      "api: Python 3.11 service",
      "web: React frontend"
    ]
  },
  "workspaceInstructions": {
    "packageManagerRule": "Use the package manager already chosen by the repository.",
    "runtimeRule": "Keep local development and CI on the same runtime versions.",
    "sections": [
      {
        "title": "General rules",
        "rules": [
          "Prefer small, reviewable changes.",
          "Update docs when setup or runtime behavior changes."
        ]
      }
    ],
    "validation": [
      "npm test"
    ]
  },
  "reviewChecklist": {
    "intro": "Review AI-generated changes against repository-specific constraints.",
    "failureThreshold": 2,
    "items": [
      {
        "title": "Uses repository constraints",
        "details": ["The change should follow the real stack and validation commands."]
      }
    ],
    "quickSignals": ["Generated files remain in sync."],
    "redFlags": ["Hand-edited generated instruction files."]
  },
  "skills": []
}
```

## CLI Reference

```bash
node scripts/agent-jump-start.mjs --help
node scripts/agent-jump-start.mjs --version
node scripts/agent-jump-start.mjs list-agents
node scripts/agent-jump-start.mjs list-profiles

node scripts/agent-jump-start.mjs init --target .
node scripts/agent-jump-start.mjs bootstrap --base specs/base-spec.yaml --output canonical-spec.yaml
node scripts/agent-jump-start.mjs render --spec canonical-spec.yaml --target . --clean
node scripts/agent-jump-start.mjs check --spec canonical-spec.yaml --target .
node scripts/agent-jump-start.mjs validate --spec canonical-spec.yaml

node scripts/agent-jump-start.mjs validate-skill path/to/skill-directory
node scripts/agent-jump-start.mjs import-skill --spec canonical-spec.yaml --skill path/to/skill-directory
node scripts/agent-jump-start.mjs export-skill --spec canonical-spec.yaml --slug my-skill --output ./exported-skills/my-skill
node scripts/agent-jump-start.mjs export-schema --output canonical-spec.schema.json
```

## Testing

Run:

```bash
npm test
```

63 tests covering:

- `init -> render -> check` workflows
- canonical `.agents/` governance rendering
- native mirror byte-parity for skill packages
- references, scripts, and assets
- external skill import and export
- schema export and validation
- stale-file cleanup
- external skill fidelity (section preservation, prohibition detection, prose preservation)
- mixed constraint classification (positive directives vs prohibitions)
- mirror sync integrity (SKILL.md, references, render output)
- round-trip stability (import → export → re-import)

## What's New in v1.8.1

### External Skill Fidelity (fixed)

Imported skills now preserve their original structure and semantic intent:

- Each H2 section becomes its own category (not flattened to "General")
- Prohibition language (`must not`, `never`, `avoid`, `do not`) is auto-detected on individual rules
- **Positive directives in mixed sections are classified correctly** — "Must use type annotations" stays a directive, "Must not use mutable defaults" becomes a prohibition
- Prose sections are preserved as rule guidance
- Section ordering is maintained via priority numbers
- Round-trip fidelity (import → export → re-import) is stable

### Semantic Rule Tags

Rules support an optional `semantic` field: `"directive"`, `"prohibition"`, `"workflow"`, `"example"`, `"reference"`. Auto-detected on import, preserved through rendering and export. Rendered as `[PROHIBITION]`, `[WORKFLOW]`, `[EXAMPLE]` tags in detailed guidance.

### Test Coverage

63 automated tests covering core workflows, governance, validation, skill import/export, progressive disclosure, external skill fidelity, mirror sync integrity, and mixed-constraint classification.

## Current Limitations

- Monorepo overlays, lockfiles, and remote registry workflows are not implemented yet.
- Continue, Aider, Windsurf, Cline, and Roo Code do not receive native skill packages; they receive mirrored workspace guidance plus inline skill summaries.
- Remote skill import (from URLs or registries) is not yet supported; skills must be available locally.

## Portability

The content model is stack-agnostic. Node.js is only the generator runtime.

If your team wants a different implementation language, you can preserve:

- the canonical spec format
- the generated file layout
- the synchronization model

and reimplement the renderer elsewhere.

## Contributing

1. Create a branch.
2. Make the smallest coherent change that solves one problem.
3. Run `npm test`.
4. Update the README when user-visible behavior changes.
5. Open a pull request.

## License

[Mozilla Public License 2.0](LICENSE)
