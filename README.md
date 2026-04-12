# Agent Jump Start

One canonical spec. Nine agent ecosystems. One `sync` command you can trust.

Agent Jump Start lets you define project rules, review guidance, and reusable skills once, then render the correct instruction files for every supported coding agent.

It is built for the real operator workflow:

1. inspect the repo,
2. draft or confirm the canonical spec,
3. run one sync command,
4. commit trusted outputs.

Zero runtime dependencies. Only Node.js built-ins.

## Why This Exists

Most teams using multiple AI coding tools drift into one of two bad states:

- every agent has different instructions
- nobody trusts generated instruction files because they need manual cleanup or second runs

Agent Jump Start gives you a single source of truth:

- one canonical spec
- one canonical skill tree
- one sync path for all supported agents
- one check path for CI

## What You Get In 5 Minutes

| If you want to... | Use this |
|---|---|
| Start from your current repo instead of a blank spec | `agent-jump-start init --target .` |
| Start from an empty repo with a curated guided cold start | `agent-jump-start init --target .` |
| Render and clean every agent output in one step | `agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml` |
| Verify CI drift without writing files | `agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Diagnose weak placeholder content in the spec | `agent-jump-start doctor --spec docs/agent-jump-start/canonical-spec.yaml` |
| Adopt local skills already written by other tools | `agent-jump-start intake --spec docs/agent-jump-start/canonical-spec.yaml` |

## Recommended Path

For most users, this is the right flow:

| Step | Command | Outcome |
|---|---|---|
| 1. Initialize | `agent-jump-start init --target .` | Creates the framework, proposes a draft spec, and renders first outputs |
| 2. Review | Edit `docs/agent-jump-start/canonical-spec.yaml` | Confirm project rules, validation, review checklist, and skills |
| 3. Sync | `agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml` | Re-renders, cleans stale files, and verifies drift in one command |
| 4. Commit | `git add ... && git commit ...` | Commits the spec plus generated agent instructions |

### First Run Shortcuts

| Your situation | Start here | What happens |
|---|---|---|
| Existing Node.js / Python / mixed repo | `agent-jump-start init --target .` | Agent Jump Start inspects the repo, proposes a draft, and lets you confirm or edit it |
| Empty repo, but you know the intended stack | `agent-jump-start init --target .` | The CLI offers curated starter presets and stack aliases so you can bootstrap a useful first draft quickly |
| CI or scripting flow where prompts are wrong | `agent-jump-start init --non-interactive --target .` | Uses the classic non-guided placeholder bootstrap |

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

Choose one of these:

| Install path | Best for | Command |
|---|---|---|
| Global install | Daily use on your machine | `npm install -g @marcogoldin/agent-jump-start` |
| `npx` | One-off execution without install | `npx @marcogoldin/agent-jump-start@latest <command>` |
| Vendored in-repo copy | Teams that want the toolkit committed inside the repo | `git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start` |

### Global install with npm

```bash
npm install -g @marcogoldin/agent-jump-start
```

### Global install with yarn

```bash
yarn global add @marcogoldin/agent-jump-start
```

### `npx` without install

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

The most reliable execution paths today are:

- `agent-jump-start` after a global install
- vendored usage via `node docs/agent-jump-start/scripts/agent-jump-start.mjs`

Direct `npx @marcogoldin/agent-jump-start@latest ...` may also work, but some npm environments do not resolve the published bin consistently.

## Quick Start

Initialize a project with one command.

```bash
# Recommended: guided onboarding is now the default
agent-jump-start init --target .

# Classic non-interactive bootstrap for CI or scripting
agent-jump-start init --non-interactive --target .

# With a built-in stack profile
npx @marcogoldin/agent-jump-start@latest init \
  --profile specs/profiles/react-vite-mui.profile.yaml \
  --target .
```

Then sync everything:

```bash
agent-jump-start sync \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

This creates:

- `docs/agent-jump-start/canonical-spec.yaml` — your canonical specification
- `docs/agent-jump-start/` — framework files (scripts, lib, specs, prompts)
- All generated instruction files for the 9 supported agents

If you want the simplest mental model, remember only this:

- `init` gets you started
- `sync` keeps all agent outputs correct
- `check` is for CI
- `doctor` tells you when the spec is still too generic

## Which Command Should I Use?

| Situation | Command |
|---|---|
| “Set this up in a repo for the first time” | `agent-jump-start init --target .` |
| “Set this up in an empty repo and pick the stack interactively” | `agent-jump-start init --target .` |
| “I need the old non-interactive bootstrap for CI or automation” | `agent-jump-start init --non-interactive --target .` |
| “I edited the spec and want all agents updated” | `agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml` |
| “I need CI to fail if generated files drifted” | `agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| “The spec still looks scaffolded or weak” | `agent-jump-start doctor --spec docs/agent-jump-start/canonical-spec.yaml` |
| “Another tool already dropped skills into local agent folders” | `agent-jump-start intake --spec docs/agent-jump-start/canonical-spec.yaml` |
| “I want to import one explicit skill package” | `agent-jump-start import-skill --spec docs/agent-jump-start/canonical-spec.yaml --skill path/to/skill-directory` |

## Onboarding Experience

`init` now starts the guided onboarding flow by default.

```bash
agent-jump-start init --target .
```

If you need the classic placeholder flow for CI or scripting, use:

```bash
agent-jump-start init --non-interactive --target .
```

The guided flow is designed around the real first-run operator experience:

1. inspect the repository,
2. draft the canonical spec from real signals,
3. let the operator confirm, edit, or skip suggestions,
4. finish with one clear next step: `sync`.

On existing repositories, onboarding scans for:

- `package.json` dependency signals such as Express, React, Next.js, Vue, NestJS, Fastify, MUI, Tailwind, AWS SDKs
- `package.json` scripts such as `test`, `lint`, `typecheck`, `build`
- Python manifests such as `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py`
- `pyproject.toml` tool sections such as `[tool.pytest]`, `[tool.ruff]`, `[tool.mypy]`
- mixed-runtime signals such as `pymilvus`, `boto3`, FastAPI, Django, Flask
- lockfiles to infer npm / yarn / pnpm / bun
- `Makefile` / `justfile` validation targets
- `.github/workflows/*.yml` run commands
- `.pre-commit-config.yaml` hooks
- linter/formatter configs (`.eslintrc*`, `.prettierrc*`, `ruff.toml`, `.editorconfig`)
- `CONTRIBUTING.md` development conventions
- `Dockerfile`, `docker-compose.yml`, `.github/workflows`, `tsconfig.json`

On empty repositories, onboarding offers:

- a curated core set of starter presets for common project types
- support for stack aliases such as `golang`, `ruby on rails`, `.net`, `next.js`, and `react-native`
- seeded runtime, validation, and workspace guidance so the first draft is not generic boilerplate

The guided flow proposes and reviews:

- project name
- project summary
- repository components
- package manager rule
- runtime rule
- **suggested validation commands** (detected from package.json scripts, Makefile, CI workflows)
- **suggested workspace sections** (inferred from TypeScript, linter configs, CONTRIBUTING.md)
- whether to keep the review checklist
- **suggested checklist enhancements** (derived from detected validation commands)

Every suggestion carries a provenance label (`detected` or `inferred`) so the operator can see where each item came from. In larger repos, repeated suggestions from the same source are grouped so the operator can keep all, review in detail, or skip all without prompt fatigue.

During component review, mixed and monorepo-style repos also surface **primary** and **secondary** slices to make ownership clearer before anything is written into the spec.

At the end of onboarding, Agent Jump Start prints a trust summary that tells the operator what they edited, what they skipped, where to verify it in the spec, and the exact next command to run.

It works both in a real TTY and with piped stdin, so it can be tested or automated.

## Workflow

### 1. Start with the canonical spec

Open `docs/agent-jump-start/canonical-spec.yaml` and fill in:

- Project name and summary
- Repository components
- Workspace rules
- Validation commands
- Review checklist
- Skills (optional)

If you used `init`, many of these fields are already populated from repo evidence. If you started from a non-interactive placeholder spec, you can use `infer` to discover validation commands, workspace rules, and checklist items from the repository:

```bash
# Preview what the tool can detect from the repo
agent-jump-start infer --target .

# Export a structured JSON inference report with provenance labels
agent-jump-start infer --target . --output inferred-report.json --format json
```

`infer` exports a structured inference report with provenance labels (`detected` / `inferred`) for operator review. When you need a machine-ready spec fragment instead, use `infer-overlay`:

```bash
# Generate a layered overlay that extends a base spec
agent-jump-start infer-overlay --target . --base canonical-spec.yaml --output overlay.yaml

# Generate a partial overlay fragment for manual merge/review
agent-jump-start infer-overlay --target . --output overlay-fragment.yaml

# Restrict to a specific section
agent-jump-start infer-overlay --target . --section validation
```

`infer-overlay` strips provenance metadata and reshapes inference output to match the canonical JSON Schema.

- with `--base`, it generates a layered overlay that can be validated and used directly with `render` / `sync`
- without `--base`, it generates a partial overlay fragment that is useful for manual merge or further editing, but may not validate on its own

The spec uses a strict YAML subset that is also valid JSON and can be parsed with `JSON.parse`, keeping the generator zero-dependency.

### 2. Sync everything with one command

```bash
agent-jump-start sync \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

`sync` is the recommended maintenance command. It renders all outputs, removes stale files, and verifies synchronization in one step. It replaces the manual `render --clean` + `check` sequence.

If `sync` finds local skill packages under `.agents/skills/`, `.claude/skills/`, or `.github/skills/` that are not yet managed by the canonical spec, it prints an advisory and points you to `intake`.

### 3. Diagnose weak or incomplete content when needed

```bash
agent-jump-start doctor \
  --spec docs/agent-jump-start/canonical-spec.yaml

# With --suggest: show inferred replacements alongside warnings
agent-jump-start doctor \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --suggest --target .
```

`doctor` inspects the spec for placeholder text, generic validation commands, missing components, and other signs that the setup is still scaffolded rather than production-ready. Exits with code `1` when warnings are found.

When `--suggest` and `--target` are provided, doctor also runs repo inference and prints suggested replacements alongside each warning. No auto-write — the operator reviews and applies what they want.

### 4. Commit the spec and generated outputs

```bash
git add docs/agent-jump-start/canonical-spec.yaml \
  docs/agent-jump-start/agent-jump-start.lock.json \
  .agents/ .claude/ .github/ .cursor/ .roo/ .continue/ \
  AGENTS.md CLAUDE.md .windsurfrules .clinerules CONVENTIONS.md \
  docs/agent-review-checklist.md

git commit -m "sync: update agent instructions from canonical spec"
```

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

### Intake locally installed skills

Use `intake` when a third-party tool has already written skills into local agent folders and you want Agent Jump Start to adopt them into canonical project memory.

```bash
# Review local skill packages and see which ones are unmanaged
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Import all valid unmanaged skills into the canonical spec
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --import

# Replace canonically managed skills from local disk when needed
# (only locally-tracked skills are eligible; upstream-tracked skills
# from github/skills/skillfish are protected from provenance downgrade)
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --import --replace

# After intake, propagate the canonically managed set across all targets
agent-jump-start sync \
  --spec docs/agent-jump-start/canonical-spec.yaml
```

Important distinction:

- "installed locally" means a skill package exists on disk under `.agents/skills/`, `.claude/skills/`, or `.github/skills/`
- "managed canonically" means the skill is present in `canonical-spec.yaml` and tracked in `agent-jump-start.lock.json`
- `sync` propagates only canonically managed skills
- `intake` reports invalid local skills with per-skill reasons instead of importing them blindly

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
- If a third-party tool already wrote skills into `./.agents/skills/`, `./.claude/skills/`, or `./.github/skills/`, use `intake` to review and import them into the spec.
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

## Architecture In One Glance

| Source of truth | Purpose |
|---|---|
| `docs/agent-jump-start/canonical-spec.yaml` | Canonical project memory: rules, validation, review checklist, skills |
| `.agents/AGENTS.md` | Canonical workspace instruction file |
| `.agents/skills/<slug>/` | Canonical skill packages |
| Agent-specific mirrors | Projections for Claude, Copilot, Cursor, Windsurf, Cline, Roo, Continue, and Aider |
| `docs/agent-jump-start/generated-manifest.json` | Tracks managed outputs for cleanup and drift detection |
| `docs/agent-jump-start/agent-jump-start.lock.json` | Tracks imported skill provenance and refreshable sources |

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

agent-jump-start init [--profile <path>] [--target <path>] [--non-interactive]
agent-jump-start bootstrap --base <path> [--profile <path>] [--output <path>]
agent-jump-start sync --spec <path> [--target <path>]
agent-jump-start infer --target <path> [--output <path>] [--section <name>] [--format json|text]
agent-jump-start infer-overlay --target <path> [--output <path>] [--base <path>] [--section <name>]
agent-jump-start doctor --spec <path> [--suggest --target <path>]
agent-jump-start render --spec <path> [--target <path>] [--clean]
agent-jump-start check --spec <path> [--target <path>]
agent-jump-start validate --spec <path>

agent-jump-start validate-skill <path>
agent-jump-start intake --spec <path> [--target <path>] [--import] [--replace]
agent-jump-start import-skill --spec <path> --skill <path> [--replace]
agent-jump-start add-skill <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]
agent-jump-start export-skill --spec <path> --slug <name> --output <path>
agent-jump-start update-skills --spec <path> [--skill <slug>] [--dry-run]
agent-jump-start export-schema [--output <path>]
agent-jump-start demo-clean --target <path>
agent-jump-start demo-tree --target <path>
```

The most reliable execution paths are `agent-jump-start` after a global install and the vendored `node docs/agent-jump-start/scripts/agent-jump-start.mjs`. `npx @marcogoldin/agent-jump-start@latest ...` may also work, but some npm environments do not resolve the published bin consistently.

## Export Schema

Export the canonical spec JSON Schema for IDE autocompletion and validation:

```bash
agent-jump-start export-schema --output canonical-spec.schema.json
```

## Current Limitations

- Layered specs (`extends`) are functional and write-safe for current workflows, but monorepo governance and ownership policy are not fully defined yet.
- `infer-overlay --base <spec>` produces a layered overlay that can be validated directly. Without `--base`, the command emits a partial overlay fragment intended for manual merge or further editing.
- `intake --import --replace` is provenance-safe: skills tracked with upstream provenance (github, skills, skillfish) are never downgraded to local-directory. Only locally-tracked managed skills can be replaced via intake.
- Broken symlinks in local skill directories are silently skipped during discovery and do not crash sync.
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

183 tests covering core workflows, sync command, doctor diagnostics, layered specs, writeback semantics, deep introspection, spec inference, overlay generation, assisted bootstrap, guided onboarding, project introspection, skill import/export, provenance lockfiles, `update-skills` refresh flows, progressive disclosure, high-level source adapters, semantic classification, mirror sync integrity, round-trip stability, provenance-safe intake replace, symlink resilience, and single-command trust regressions.

## Contributing

1. Create a branch.
2. Make the smallest coherent change that solves one problem.
3. Run `npm test`.
4. Update the README when user-visible behavior changes.
5. Open a pull request.

## License

[Mozilla Public License 2.0](LICENSE)
