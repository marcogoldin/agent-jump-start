# Agent Jump Start

One canonical spec. Twelve agent ecosystems. One `sync` command you can trust.

Agent Jump Start lets you define project rules, review guidance, and reusable skills once, then render the correct instruction files for every supported coding agent.

Zero runtime dependencies. Only Node.js built-ins.

## Why Teams Use It

Most teams using multiple AI coding tools drift into one of two bad states:

- every agent has different instructions
- nobody trusts generated instruction files because they need manual cleanup or second runs

Agent Jump Start gives you a single source of truth:

- one canonical spec
- one canonical skill tree
- one `sync` command for local maintenance
- one `check` command for CI drift detection

## Start Here

Install it:

```bash
npm install -g @marcogoldin/agent-jump-start
```

Initialize a repository:

```bash
agent-jump-start init --target .
```

Review the generated spec, then sync all agent outputs:

```bash
agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml
```

Use `check` in CI:

```bash
agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .
```

That is the core product flow:

- `init` creates the framework and drafts the canonical spec
- `sync` keeps every supported agent output aligned
- `check` tells CI when generated files drifted
- `doctor` helps when the spec still looks generic

## What `init` Does

`init` starts guided onboarding by default.

```bash
agent-jump-start init --target .
```

If you need the classic placeholder bootstrap for automation:

```bash
agent-jump-start init --non-interactive --target .
```

During onboarding, Agent Jump Start can inspect repository signals such as manifests, scripts, lockfiles, CI workflows, linter configs, Python tooling, Docker files, and local conventions. In empty repositories it offers curated starter presets and stack aliases so the first draft is useful immediately.

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

Choice prompts spell out the action next to the shortcut, for example `keep (Y), edit (e), skip (n)` or `keep all (Y), review one by one (r), skip all (n)`. The guided flow also accepts the full words (`keep`, `edit`, `skip`, `review`) in addition to the single-letter shortcuts.

During component review, mixed and monorepo-style repos also surface **primary** and **secondary** slices to make ownership clearer before anything is written into the spec.

At the end of onboarding, Agent Jump Start prints a trust summary that tells the operator what they edited, what they skipped, where to verify it in the spec, and the exact next command to run.

It works both in a real TTY and with piped stdin, so it can be tested or automated.

## Common Commands

| If you want to... | Command |
|---|---|
| Initialize a repo and draft the canonical spec | `agent-jump-start init --target .` |
| Use the non-interactive bootstrap for automation | `agent-jump-start init --non-interactive --target .` |
| Re-render and clean every managed output | `agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml` |
| Fail CI when generated files drifted | `agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Diagnose generic or incomplete spec content | `agent-jump-start doctor --spec docs/agent-jump-start/canonical-spec.yaml` |
| Inspect repo evidence before editing the spec manually | `agent-jump-start infer --target .` |
| Generate a schema-shaped overlay from repo evidence | `agent-jump-start infer-overlay --target . --base canonical-spec.yaml --output overlay.yaml` |
| Absorb pre-existing agent instruction files into canonical spec | `agent-jump-start absorb --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Adopt skills already present in local agent folders | `agent-jump-start intake --spec docs/agent-jump-start/canonical-spec.yaml` |
| Import one explicit skill package | `agent-jump-start import-skill --spec docs/agent-jump-start/canonical-spec.yaml --skill path/to/skill-directory` |

`sync` is the normal maintenance command. It renders outputs, removes stale files, and verifies consistency in one step. If it finds local skills under `.agents/skills/`, `.claude/skills/`, or `.github/skills/` that are outside canonical management, it points you to `intake`.

The canonical spec uses a strict YAML subset that is also valid JSON, so it stays easy to read and can be parsed without extra runtime dependencies.

## Supported Agents

| Agent | Generated output |
|---|---|
| Claude Code | `CLAUDE.md`, `.claude/skills/*/SKILL.md` |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/skills/*/SKILL.md` |
| Gemini CLI | `GEMINI.md` |
| Amazon Q Developer | `.amazonq/rules/general.md` |
| JetBrains Junie | `.junie/AGENTS.md`, `.junie/guidelines.md` |
| GitHub Agents | `AGENTS.md`, `.agents/skills/*/SKILL.md` |
| AGENTS.md fallback compatibility | `AGENT.md` |
| Cursor | `.cursor/rules/agent-instructions.mdc`, `.cursor/rules/*.mdc` |
| Windsurf | `.windsurf/rules/general.md`, `.windsurfrules` |
| Cline | `.clinerules/general.md`, `.clinerules` (legacy fallback) |
| Roo Code | `.roo/rules/agent-instructions.md`, `.roorules` |
| Continue.dev | `.continue/rules/agent-instructions.md` |
| Aider | `CONVENTIONS.md` |

- `.agents/AGENTS.md` is the canonical workspace instruction file.
- `.agents/skills/` is the canonical skill package tree.
- `.claude/skills/` and `.github/skills/` are byte-identical mirrors of the canonical packages.
- Agents without native skill-package support receive mirrored workspace instructions plus inline skill summaries.

## Agent File Coverage

### Propagation Coverage (sync/render managed outputs)

```text
.agents/AGENTS.md
AGENTS.md
AGENT.md
CLAUDE.md
GEMINI.md
.github/copilot-instructions.md
.github/instructions/general.instructions.md
.cursor/rules/agent-instructions.mdc
.windsurf/rules/general.md
.windsurfrules
.clinerules/general.md
.clinerules (legacy fallback when a root .clinerules file already exists)
.roo/rules/agent-instructions.md
.roorules
.continue/rules/agent-instructions.md
.amazonq/rules/general.md
.junie/AGENTS.md
.junie/guidelines.md
CONVENTIONS.md
```

### Discovery Coverage (pre-existing files recognized)

```text
AGENTS.md, AGENT.md, CLAUDE.md, GEMINI.md
.github/copilot-instructions.md
.github/instructions/**/*.instructions.md
.cursor/rules/**/*.mdc
.continue/rules/**/*.{md,txt}
.windsurf/rules/**/*.{md,txt}
.windsurfrules
.clinerules/**/*.{md,txt}
.clinerules
.roo/rules/**/*.{md,txt}
.roorules
.amazonq/rules/**/*.md
.junie/AGENTS.md
.junie/guidelines.md
.junie/guidelines/**/*.md
CONVENTIONS.md
```

## Requirements

- Node.js >= 18
- No npm dependencies required

## Installation Options

| Install path | Best for | Command |
|---|---|---|
| Global install | Daily use on your machine | `npm install -g @marcogoldin/agent-jump-start` |
| `npx` | One-off execution without install | `npx @marcogoldin/agent-jump-start@latest <command>` |
| Vendored in-repo copy | Teams that want the toolkit committed inside the repo | `git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start` |

The most reliable execution paths are the global `agent-jump-start` binary and vendored usage via `node docs/agent-jump-start/scripts/agent-jump-start.mjs`.

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

Each successful `import-skill` run also updates `agent-jump-start.lock.json` next to the spec. The lockfile records the imported skill slug, version, checksum, source, and resolved path so refresh workflows can be audited and reproduced safely.

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
AGENT.md
CLAUDE.md
GEMINI.md
.claude/skills/<slug>/SKILL.md
.github/copilot-instructions.md
.github/instructions/general.instructions.md
.github/skills/<slug>/SKILL.md
.cursor/rules/agent-instructions.mdc
.cursor/rules/<slug>.mdc
.windsurf/rules/general.md
.windsurfrules
.clinerules/general.md
.clinerules
.roo/rules/agent-instructions.md
.roorules
.continue/rules/agent-instructions.md
.amazonq/rules/general.md
.junie/AGENTS.md
.junie/guidelines.md
CONVENTIONS.md
docs/agent-review-checklist.md
docs/agent-jump-start/generated-manifest.json
docs/agent-jump-start/agent-jump-start.lock.json
```

## Installing Into A Repo That Already Has Agent Files

If your repo already contains hand-written `CLAUDE.md`, `AGENTS.md`, `AGENT.md`, `GEMINI.md`, `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, Cursor/Windsurf/Cline/Roo/Continue/Amazon Q/Junie rules, or `CONVENTIONS.md`, Agent Jump Start will **never** silently overwrite them. A file is only treated as tool-managed if it carries the `Agent Jump Start` provenance marker embedded in every rendered artifact.

On first run, `init`, `sync`, and `render` detect unmanaged pre-existing files and behave as follows:

- **Interactive TTY** — the CLI prompts per file with three options: keep, overwrite, or backup-then-overwrite.
- **Non-interactive (CI, piped input, scripts)** — the CLI refuses the run and exits non-zero with a message naming each conflicting file. Choose one of the flags below and re-run.

Flags accepted by `init`, `sync`, and `render`:

| Flag | Effect |
|---|---|
| `--force` | Overwrite pre-existing operator-authored files with the rendered versions |
| `--backup` | Copy each pre-existing file to `<file>.ajs-backup-<timestamp>` before overwriting |
| `--keep-existing` | Leave pre-existing files untouched; skip the rendered version and exclude it from the manifest |

Recommended convergence flow for hybrid repositories:

```bash
agent-jump-start init --target . --non-interactive --keep-existing
agent-jump-start absorb --spec docs/agent-jump-start/canonical-spec.yaml --target .
agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml --target . --force
```

`absorb` updates only the canonical spec (or layered leaf) using reviewed extraction output from unmanaged pre-existing agent files. It never overwrites instruction targets directly; `sync` remains the explicit propagation step.

If the canonical spec does not exist yet, start with:

```bash
agent-jump-start init --target . --non-interactive --keep-existing
```

Then continue with `absorb` and `sync --force` as shown above.

`absorb` execution modes:

| Mode | Usage | Behavior |
|---|---|---|
| Interactive TTY | `agent-jump-start absorb --spec <path> --target <path>` | Guided per-source review, preview, confirm write |
| CI preview | `agent-jump-start absorb --spec <path> --target <path> --dry-run --output absorb-proposal.yaml` | Writes deterministic proposal artifact, no spec write |
| CI apply | `agent-jump-start absorb --spec <path> --target <path> --apply --selection absorb-selection.yaml` | Applies explicit reviewed decisions only |

### Removing Only Tool-Managed Outputs

Every path listed in `docs/agent-jump-start/generated-manifest.json` was authored by Agent Jump Start. To reset the tool without touching operator-authored files, delete exactly those paths — anything not in the manifest (including anything you preserved with `--keep-existing`) will stay untouched.

## Architecture In One Glance

| Source of truth | Purpose |
|---|---|
| `docs/agent-jump-start/canonical-spec.yaml` | Canonical project memory: rules, validation, review checklist, skills |
| `.agents/AGENTS.md` | Canonical workspace instruction file |
| `.agents/skills/<slug>/` | Canonical skill packages |
| Agent-specific mirrors | Projections for Claude, Copilot, Gemini, Amazon Q, Junie, Cursor, Windsurf, Cline, Roo, Continue, and Aider |
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
agent-jump-start absorb --spec <path> [--target <path>] [--dry-run] [--output <path>] [--apply --selection <path>]
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

## Layered Specs (Monorepos)

One base, many leaves. Each leaf uses `extends` to inherit shared rules and
overrides only what differs. The **base owns what is shared, each leaf owns
what makes its package different**, and every mutating command (`import-skill`,
`update-skills`, `intake`, `add-skill`) writes back **only to the leaf**.
Validation errors name the layer that owns the offending field, so you always
know which file to open.

- Operator guide: [docs/layered-specs.md](docs/layered-specs.md)
- Copyable two-package example: [specs/examples/monorepo/](specs/examples/monorepo/)

## Current Limitations

- `infer-overlay --base <spec>` produces a layered overlay that can be validated directly. Without `--base`, the command emits a partial overlay fragment intended for manual merge or further editing.
- `intake --import --replace` is provenance-safe: skills tracked with upstream provenance (`github`, `skills`, `skillfish`) are never downgraded to `local-directory`. Only locally tracked managed skills can be replaced via intake.
- Broken symlinks in local skill directories are silently skipped during discovery and do not crash sync.
- Gemini, Amazon Q, Junie, Continue, Aider, Windsurf, Cline, and Roo Code do not receive native skill packages; they receive mirrored workspace guidance plus inline skill summaries.
- `absorb` v1 intentionally targets only `workspaceInstructions.sections` and `workspaceInstructions.validation`; checklist/summary absorption is deferred.
- Remote skill import supports GitHub sources plus `skills` and `skillfish` adapters.
- Skills installed directly by third-party CLIs into `./.agents/skills/` remain unmanaged until they are imported into the canonical spec.
- Direct `npx @marcogoldin/agent-jump-start@latest ...` execution may not resolve the published bin consistently across npm environments; global install and vendored usage are the most reliable paths.

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

236 tests covering core workflows, sync command, doctor diagnostics, layered specs, layer-aware validation diagnostics, leaf-only writeback semantics, deep introspection, spec inference, overlay generation, assisted bootstrap, guided onboarding, project introspection, skill import/export, provenance lockfiles, `update-skills` refresh flows, progressive disclosure, high-level source adapters, semantic classification, mirror sync integrity, round-trip stability, provenance-safe intake replace, symlink resilience, absorb-driven hybrid-repo convergence, expanded agent-file coverage, and single-command trust regressions.

## Contributing

1. Create a branch.
2. Make the smallest coherent change that solves one problem.
3. Run `npm test`.
4. Update the README when user-visible behavior changes.
5. Open a pull request.

## License

[Mozilla Public License 2.0](LICENSE)
