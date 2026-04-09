# Agent Jump Start

Portable starter kit that keeps AI coding assistant instructions synchronized across 9 agent ecosystems from one canonical specification.

Define project rules, review guidance, and reusable skills once. The generator renders the right instruction files for every supported agent and provides a `check` command to catch drift in CI.

Zero runtime dependencies — uses only Node.js built-ins.

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

- `.agents/AGENTS.md` is the canonical workspace instruction file.
- `.agents/skills/` is the canonical skill package tree.
- `.claude/skills/` and `.github/skills/` are byte-identical mirrors of the canonical packages.
- Agents without native skill-package support receive mirrored workspace instructions plus inline skill summaries.

## Requirements

- Node.js >= 18
- No npm dependencies required

## Installation

### npm

```bash
npm install -g @marcogoldin/agent-jump-start
```

### yarn

```bash
yarn global add @marcogoldin/agent-jump-start
```

### npx (no install)

Run any command directly without installing:

```bash
npx @marcogoldin/agent-jump-start@latest <command> [options]
```

### Clone from GitHub

Use this when you want the full toolkit vendored into your repository:

```bash
git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start
```

Then run commands with `node docs/agent-jump-start/scripts/agent-jump-start.mjs` instead of `agent-jump-start`.

## Quick Start

Initialize a project with one command:

```bash
# With global install
agent-jump-start init --target .

# Guided onboarding with project introspection
agent-jump-start init --guided --target .

# With a built-in stack profile
npx @marcogoldin/agent-jump-start@latest init \
  --profile specs/profiles/react-vite-mui.profile.yaml \
  --target .
```

If `npx @marcogoldin/agent-jump-start@latest ...` does not resolve the published bin in your npm environment, use a global install or the vendored `node docs/agent-jump-start/scripts/agent-jump-start.mjs ...` path instead.

This creates:

- `docs/agent-jump-start/canonical-spec.yaml` — your canonical specification
- `docs/agent-jump-start/` — framework files (scripts, lib, specs, prompts)
- All generated instruction files for the 9 supported agents

## Guided Onboarding

Use `init --guided` when you want Agent Jump Start to inspect the repository and propose a starting spec interactively.

```bash
agent-jump-start init --guided --target .
```

Guided onboarding currently scans for:

- `package.json` dependency signals such as Express, React, Next.js, Vue, NestJS, Fastify, MUI, Tailwind, AWS SDKs
- Python manifests such as `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`
- mixed-runtime signals such as `pymilvus`, `boto3`, FastAPI, Django, Flask
- lockfiles to infer npm / yarn / pnpm / bun
- `Dockerfile`, `docker-compose.yml`, `.github/workflows`, `tsconfig.json`

The guided flow proposes:

- project name
- project summary
- repository components
- package manager rule
- runtime rule
- whether to keep the review checklist

It works both in a real TTY and with piped stdin, so it can be tested or automated in CI.

## Workflow

### 1. Edit the canonical spec

Open `docs/agent-jump-start/canonical-spec.yaml` and fill in:

- Project name and summary
- Repository components
- Workspace rules
- Validation commands
- Review checklist
- Skills (optional)

The spec uses a strict YAML subset that is also valid JSON and can be parsed with `JSON.parse`, keeping the generator zero-dependency.

### 2. Sync

```bash
agent-jump-start sync \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

`sync` is the recommended maintenance command. It renders all outputs, removes stale files, and verifies synchronization in one step. It replaces the manual `render --clean` + `check` sequence.

### 3. Diagnose weak or incomplete content

```bash
agent-jump-start doctor \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

`doctor` inspects the spec for placeholder text, generic validation commands, missing components, and other signs that the setup is still scaffolded rather than production-ready. Exits with code `1` when warnings are found.

### 4. Commit

```bash
git add docs/agent-jump-start/canonical-spec.yaml \
  docs/agent-jump-start/agent-jump-start.lock.json \
  .agents/ .claude/ .github/ .cursor/ .roo/ .continue/ \
  AGENTS.md CLAUDE.md .windsurfrules .clinerules CONVENTIONS.md \
  docs/agent-review-checklist.md

git commit -m "sync: update agent instructions from canonical spec"
```

## Layered Specs Status

`extends`-based layered specs are the current scaling priority and are under active development.

What works now:

- resolve overlays for `sync`, `doctor`, `render`, `check`, `validate`, `export-skill`, and `update-skills`
- keep merge behavior explicit and deterministic instead of relying on generic deep merge
- fail fast on malformed keyed overlay arrays instead of normalizing them silently
- preserve `extends` during write workflows by writing only to the raw leaf spec for `import-skill` and `update-skills`

Current limitation:

- layered specs should still be treated as maturing until monorepo governance rules are explicit, especially for ownership policy, subtree boundaries, and when leaf materialization is preferred over base-layer mutation

For the current implementation priority and hardening criteria, see `docs/implementation-prompts/agent-jump-start-roadmap.md`.

## Skill Packages

Agent Jump Start supports portable skill packages that define reusable instruction sets. Skills are imported into the canonical spec, then synchronized across all agent outputs.

### Skill structure

Each skill is a directory containing a `SKILL.md` with YAML frontmatter, plus optional `references/`, `scripts/`, and `assets/` subdirectories.

### Import a skill

```bash
agent-jump-start import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory

# Overwrite an existing skill with the same slug
agent-jump-start import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory \
  --replace
```

Supported import sources:

- A skill directory (e.g. `path/to/python-pro/`)
- An installed skill package (e.g. `.agents/skills/python-pro/`)
- A standalone `SKILL.md` file
- A legacy JSON skill file

Each successful `import-skill` run also updates `agent-jump-start.lock.json` next to the spec. The lockfile records the imported skill slug, version, checksum, source, and resolved path so future refresh workflows can be audited and reproduced safely.

### Add a skill from a higher-level source

`add-skill` resolves a source into a local SKILL.md package, then imports it into the canonical spec.

```bash
# Local path
agent-jump-start add-skill \
  ./external-skills/python-pro \
  --spec docs/agent-jump-start/canonical-spec.yaml

# GitHub tree URL
agent-jump-start add-skill \
  https://github.com/Jeffallan/claude-skills/tree/main/skills/python-pro \
  --spec docs/agent-jump-start/canonical-spec.yaml

# GitHub repository shorthand plus explicit skill name
agent-jump-start add-skill \
  github:vercel-labs/agent-skills \
  --skill web-design-guidelines \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Resolve through the open `skills` CLI
agent-jump-start add-skill \
  skills:vercel-labs/agent-skills \
  --skill web-design-guidelines \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Resolve through Skillfish
agent-jump-start add-skill \
  skillfish:nguyenthienthanh/aura-frog \
  --skill nodejs-expert \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

Supported `add-skill` sources:

- local filesystem paths
- GitHub URLs and `github:<owner>/<repo>` shorthand
- `skills:<package>` providers resolved with the `skills` CLI
- `skillfish:<package>` providers resolved with Skillfish

Notes:

- `skills:` and `skillfish:` adapters require `npx` on `PATH`.
- GitHub sources require `git` on `PATH`.
- If a third-party tool already wrote a skill into `./.agents/skills/`, import that path into the spec so it becomes managed by Agent Jump Start.
- Successful `add-skill` imports also update `agent-jump-start.lock.json` next to the spec with provenance metadata for each imported skill.

### Refresh imported skills

Use `update-skills` to re-resolve imported skills from the provenance lockfile, compare upstream checksums, and refresh the canonical spec only when the source changed.

```bash
# Preview what would change
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --dry-run

# Refresh every tracked skill
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Refresh only one tracked skill
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill python-pro
```

`update-skills` uses `agent-jump-start.lock.json` as the provenance source of truth. It exits non-zero when a tracked skill cannot be re-resolved cleanly, warns and skips unreachable sources, and updates the spec plus lockfile only when a refresh actually succeeds.

### Validate a skill before import

```bash
agent-jump-start validate-skill path/to/skill-directory
```

### Export a skill

```bash
agent-jump-start export-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --slug python-pro \
  --output ./exported-skills/python-pro
```

### External skill fidelity

Imported skills preserve their original structure and semantic intent:

- Each H2 section becomes its own category (not flattened)
- Section ordering is maintained via priority numbers
- Prose sections are preserved as rule guidance
- Round-trip stability: import, export, re-import produces identical output

### Semantic rule classification

Rules support automatic semantic classification during import:

- **Prohibition detection** — language like `must not`, `never`, `avoid`, `do not` is auto-detected and tagged on individual rules, while positive directives in the same section are correctly classified as directives
- **Semantic tags** — rules carry an optional `semantic` field (`directive`, `prohibition`, `workflow`, `example`, `reference`) preserved through rendering and export
- **Rendered output** — semantic tags appear as `[PROHIBITION]`, `[WORKFLOW]`, `[EXAMPLE]` markers in detailed guidance

## How Synchronization Works

```text
canonical-spec.yaml
  -> .agents/AGENTS.md           (canonical workspace governance)
  -> .agents/skills/<slug>/      (canonical skill packages)
  -> agent-specific mirrors and projections
```

1. The spec is validated.
2. `.agents/AGENTS.md` is rendered as the canonical workspace instruction file.
3. Skills are rendered into canonical `.agents/skills/<slug>/` packages.
4. `.claude/skills/` and `.github/skills/` are generated as byte-identical mirrors.
5. Cursor gets MDC projections.
6. Agents without native skill folders receive mirrored workspace guidance plus inline skill summaries.
7. `generated-manifest.json` records managed files so `check` and `--clean` can detect drift and stale outputs.

## Generated Output

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
docs/agent-jump-start/agent-jump-start.lock.json
```

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
agent-jump-start --help
agent-jump-start --version
agent-jump-start list-agents
agent-jump-start list-profiles

agent-jump-start init [--guided] [--profile <path>] [--target <path>]
agent-jump-start bootstrap --base <path> [--profile <path>] [--output <path>]
agent-jump-start sync --spec <path> [--target <path>]
agent-jump-start doctor --spec <path>
agent-jump-start render --spec <path> [--target <path>] [--clean]
agent-jump-start check --spec <path> [--target <path>]
agent-jump-start validate --spec <path>

agent-jump-start validate-skill <path>
agent-jump-start import-skill --spec <path> --skill <path> [--replace]
agent-jump-start add-skill <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]
agent-jump-start export-skill --spec <path> --slug <name> --output <path>
agent-jump-start update-skills --spec <path> [--skill <slug>] [--dry-run]
agent-jump-start export-schema [--output <path>]
```

The most reliable execution paths are `agent-jump-start` after a global install and the vendored `node docs/agent-jump-start/scripts/agent-jump-start.mjs`. `npx @marcogoldin/agent-jump-start@latest ...` may also work, but some npm environments do not resolve the published bin consistently.

## Export Schema

Export the canonical spec JSON Schema for IDE autocompletion and validation:

```bash
agent-jump-start export-schema --output canonical-spec.schema.json
```

## Current Limitations

- Layered specs (`extends`) are functional and write-safe for current workflows, but monorepo governance and ownership policy are not fully defined yet.
- Continue, Aider, Windsurf, Cline, and Roo Code do not receive native skill packages; they receive mirrored workspace guidance plus inline skill summaries.
- Remote skill import is currently limited to GitHub sources plus `skills` and `skillfish` adapters. Generic registries are not implemented yet.
- Skills installed directly by third-party CLIs into `./.agents/skills/` remain unmanaged until they are imported into the canonical spec.
- Direct `npx @marcogoldin/agent-jump-start@latest ...` execution may not resolve the published bin consistently across npm environments; global install and vendored usage are the most reliable paths today.

## Portability

The content model is stack-agnostic. Node.js is only the generator runtime.

If your team wants a different implementation language, you can preserve:

- the canonical spec format
- the generated file layout
- the synchronization model

and reimplement the renderer elsewhere.

## Testing

```bash
npm test
```

132 tests covering core workflows, sync command, doctor diagnostics, layered specs, writeback semantics, guided onboarding, project introspection, skill import/export, provenance lockfiles, `update-skills` refresh flows, progressive disclosure, high-level source adapters, semantic classification, mirror sync integrity, and round-trip stability.

## Contributing

1. Create a branch.
2. Make the smallest coherent change that solves one problem.
3. Run `npm test`.
4. Update the README when user-visible behavior changes.
5. Open a pull request.

## License

[Mozilla Public License 2.0](LICENSE)
