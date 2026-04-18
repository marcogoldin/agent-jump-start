# Agent Jump Start

A single canonical spec for project instructions, review guidance, and reusable skills.

Agent Jump Start renders the right files for twelve coding-agent ecosystems from one source of truth, keeps them synchronized with one maintenance command, and protects pre-existing operator-authored files from accidental overwrite.

It runs on Node.js built-ins only. No runtime dependencies are required.

## What It Solves

Teams usually hit one of these problems:

- the same repository has different instructions for different agents
- generated files drift and stop being trusted
- existing repositories already contain hand-written agent files, so first-run adoption is risky
- shared skills exist in different folders with no clear canonical owner

Agent Jump Start gives the repository one explicit memory model:

- one canonical spec
- one canonical skill tree
- one `sync` command for maintenance
- one `check` command for CI drift detection
- one clear overwrite policy for existing repos

## Start Here

Install globally:

```bash
npm install -g @marcogoldin/agent-jump-start
```

Initialize a repository:

```bash
agent-jump-start init --target .
```

Review the generated canonical spec, then synchronize managed files:

```bash
agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml --target .
```

Use `check` in CI:

```bash
agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .
```

That is the core operating model:

- `init` creates the framework and drafts the canonical spec
- `sync` renders managed outputs, cleans stale files, and verifies convergence
- `check` fails when generated files drift from the canonical spec
- `doctor` helps when a first draft is still too generic

## First-Run Experience

`init` starts guided onboarding by default.

```bash
agent-jump-start init --target .
```

For automation and CI-friendly bootstrap:

```bash
agent-jump-start init --non-interactive --target .
```

Guided onboarding can inspect repository signals such as:

- package manifests and lockfiles
- scripts and Makefiles
- CI workflows
- Docker files
- Python tooling
- lint and formatting configs
- local conventions in repository docs

The guided flow reviews:

- project name and summary
- detected repository components
- package manager and runtime rules
- suggested validation commands
- suggested workspace sections
- review checklist inclusion and enhancements
- agent rollout choice

Every suggestion carries provenance so the operator can see whether it was detected or inferred.

## Selective Agent Support

Agent Jump Start can manage all supported agents or a chosen subset.

The operator model is simple:

- the canonical spec is the source of truth
- `sync`, `render`, and `check` read only from the spec
- `init` can set the initial agent rollout
- `update-agents` can add, remove, inspect, or reset support later

### Default behavior

If `agentSupport` is missing from the canonical spec, Agent Jump Start supports all agents.

### Initialize with all, detected, or explicit agents

```bash
# Support every agent target
agent-jump-start init --target . --agents all

# In an existing repo, detect current agent usage and start there
agent-jump-start init --target . --agents detected

# Start with an explicit subset
agent-jump-start init --target . --agents claude-code,cursor,github-copilot
```

Guided onboarding offers the same choices interactively.

### Add more agents later

```bash
# Add one or more missing agents
agent-jump-start update-agents \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --include github-copilot,aider

# Remove one or more enabled agents
agent-jump-start update-agents \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --remove windsurf,aider

# Reset to full coverage
agent-jump-start update-agents \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --all-missing
```

### What always stays canonical

These paths are infrastructure and remain managed even when you support only a subset of agents:

- `.agents/AGENTS.md`
- `.agents/skills/<slug>/`
- `docs/agent-review-checklist.md`
- `docs/agent-jump-start/generated-manifest.json`

### How the spec stores the choice

```json
{
  "agentSupport": {
    "mode": "selected",
    "selected": ["claude-code", "cursor", "github-copilot"]
  }
}
```

If all agents are enabled, `agentSupport` is omitted for a cleaner spec.

## Existing Repository Adoption

Existing repositories are the main real-world case. Agent Jump Start is designed to adopt them safely.

If the repo already contains hand-written files such as `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, Cursor rules, Windsurf rules, Cline rules, Roo rules, Continue rules, Amazon Q rules, Junie files, or `CONVENTIONS.md`, the CLI will not silently overwrite them.

A file is treated as Agent Jump Start-managed only when it carries the provenance marker embedded in generated outputs.

### Conflict handling

When unmanaged pre-existing files are found:

- interactive TTY sessions prompt per conflict group, not per file
- mirrored skill-package collisions are grouped by skill slug
- other conflicts are grouped by root such as `.github`, `.claude`, `.agents`, or workspace root
- non-interactive sessions fail closed unless you choose a policy

Supported policies on `init`, `sync`, and `render`:

| Flag | Effect |
|---|---|
| `--force` | overwrite pre-existing operator-authored files |
| `--backup` | create `<file>.ajs-backup-<timestamp>` before overwrite |
| `--keep-existing` | preserve existing files, skip the rendered version, and exclude it from the manifest |

`sync --keep-existing` has a distinct exit contract in `2.0.0`:

- exit `0`: fully converged
- exit `1`: failure or blocked write
- exit `2`: safe but non-converged because preserved files still need absorb or overwrite

### Recommended adoption flow

```bash
agent-jump-start init --target . --non-interactive --keep-existing
agent-jump-start absorb --spec docs/agent-jump-start/canonical-spec.yaml --target .
agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml --target . --force
```

### Selective adoption in existing repositories

Selective agent support works well with adoption flows:

```bash
# Start from agents already present in the repository
agent-jump-start init \
  --target . \
  --non-interactive \
  --agents detected \
  --keep-existing
```

If `--keep-existing` would make one of the selected agents non-convergent, Agent Jump Start removes that agent from the managed selection before writing the spec, so the repository still converges on the first `check`.

## Daily Maintenance

`sync` is the main maintenance command.

```bash
agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml --target .
```

What it does:

1. validates the canonical spec
2. renders the current managed output set
3. removes stale generated files that are no longer owned
4. writes the current output set with overwrite protection
5. verifies the final state with the same ground truth that was written

If preserved operator-authored files remain after `--keep-existing`, `sync` now exits `2` and prints the exact next-step commands needed to converge.

`check` is the read-only CI equivalent:

```bash
agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .
```

`render` is available when you want direct render semantics without the full `sync` maintenance path:

```bash
agent-jump-start render --spec docs/agent-jump-start/canonical-spec.yaml --target . --clean
```

## Common Commands

| If you want to... | Command |
|---|---|
| Initialize a repo with guided onboarding | `agent-jump-start init --target .` |
| Initialize non-interactively | `agent-jump-start init --non-interactive --target .` |
| Start from detected agents in an existing repo | `agent-jump-start init --target . --agents detected` |
| Re-render and converge managed outputs | `agent-jump-start sync --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Fail CI on drift | `agent-jump-start check --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Diagnose a weak or generic spec | `agent-jump-start doctor --spec docs/agent-jump-start/canonical-spec.yaml` |
| Review repository evidence | `agent-jump-start infer --target .` |
| Generate a schema-shaped overlay | `agent-jump-start infer-overlay --target . --base canonical-spec.yaml --output overlay.yaml` |
| Absorb existing agent files into canonical memory | `agent-jump-start absorb --spec docs/agent-jump-start/canonical-spec.yaml --target .` |
| Review or import local skill packages | `agent-jump-start intake --spec docs/agent-jump-start/canonical-spec.yaml` |
| Import one explicit skill package | `agent-jump-start import-skill --spec docs/agent-jump-start/canonical-spec.yaml --skill path/to/skill-directory` |
| Add more managed agents later | `agent-jump-start update-agents --spec docs/agent-jump-start/canonical-spec.yaml --include github-copilot,aider` |
| Remove managed agents from an existing setup | `agent-jump-start update-agents --spec docs/agent-jump-start/canonical-spec.yaml --remove windsurf,aider` |
| Inspect valid canonical agent IDs | `agent-jump-start list-agents` |
| Inspect canonical agent IDs with current project state | `agent-jump-start list-agents --spec docs/agent-jump-start/canonical-spec.yaml` |

## Supported Agents

| Agent | Generated output |
|---|---|
| Claude Code | `CLAUDE.md`, `.claude/skills/*/SKILL.md` |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/general.instructions.md`, `.github/skills/*/SKILL.md` |
| Gemini CLI | `GEMINI.md` |
| Amazon Q Developer | `.amazonq/rules/general.md` |
| JetBrains Junie | `.junie/AGENTS.md`, `.junie/guidelines.md` |
| GitHub Agents | `AGENTS.md`, `AGENT.md`, canonical `.agents/skills/*/` |
| Cursor | `.cursor/rules/agent-instructions.mdc`, `.cursor/rules/*.mdc` |
| Windsurf | `.windsurf/rules/general.md`, `.windsurfrules` |
| Cline | `.clinerules/general.md`, `.clinerules` when legacy fallback is required |
| Roo Code | `.roo/rules/agent-instructions.md`, `.roorules` |
| Continue.dev | `.continue/rules/agent-instructions.md` |
| Aider | `CONVENTIONS.md` |

Notes:

- `.agents/AGENTS.md` is the canonical workspace instruction file
- `.agents/skills/` is the canonical skill package tree
- `.claude/skills/` and `.github/skills/` are mirrors of the canonical packages
- agents without native skill-package support receive workspace guidance plus inline skill summaries

## Skill Packages

Agent Jump Start supports portable skill packages with a `SKILL.md` entrypoint and optional `references/`, `scripts/`, and `assets/` folders.

### Import one skill

```bash
agent-jump-start import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory

agent-jump-start import-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill path/to/skill-directory \
  --replace
```

Supported import sources:

- a skill directory
- a standalone `SKILL.md` file
- an installed local skill package
- a legacy JSON skill file

Each successful import updates `agent-jump-start.lock.json` next to the spec. The lockfile records slug, version, checksum, source, and resolved path.

### Adopt locally installed skills

Use `intake` when another tool already wrote skills into local agent folders and you want Agent Jump Start to make them canonical.

```bash
# Review local skill packages
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Import all valid unmanaged skills
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --import

# Replace canonically managed local skills when appropriate
agent-jump-start intake \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --import --replace
```

Important distinction:

- installed locally means a skill exists on disk under `.agents/skills/`, `.claude/skills/`, or `.github/skills/`
- managed canonically means the skill is present in the canonical spec and tracked in the lockfile
- `sync` propagates only canonically managed skills
- `intake` reports invalid local skills with explicit reasons instead of importing them blindly

### Add a skill from a higher-level source

`add-skill` resolves a higher-level source into a local package, then imports it into the canonical spec.

```bash
# Local path
agent-jump-start add-skill \
  ./external-skills/python-pro \
  --spec docs/agent-jump-start/canonical-spec.yaml

# GitHub tree URL
agent-jump-start add-skill \
  https://github.com/Jeffallan/claude-skills/tree/main/skills/python-pro \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Repository shorthand plus explicit skill name
agent-jump-start add-skill \
  github:vercel-labs/agent-skills \
  --skill web-design-guidelines \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Through the open skills CLI
agent-jump-start add-skill \
  skills:vercel-labs/agent-skills \
  --skill web-design-guidelines \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Through Skillfish
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

- `skills:` and `skillfish:` adapters require `npx` on `PATH`
- GitHub sources require `git` on `PATH`
- successful `add-skill` imports also update the lockfile with provenance metadata

### Refresh imported skills

```bash
# Preview
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --dry-run

# Refresh every tracked skill
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml

# Refresh one tracked skill
agent-jump-start update-skills \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --skill python-pro
```

`update-skills` uses the lockfile as the provenance source of truth and updates the spec only when the source actually changed.

### Export a skill

```bash
agent-jump-start export-skill \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --slug python-pro \
  --output ./exported-skills/python-pro
```

## Layered Specs

Layered specs are useful for monorepos or shared-base setups.

The model is simple:

- the base owns shared rules
- each leaf owns what is specific to that package or app
- mutating commands write back only to the leaf
- validation errors identify the layer that owns the failing field

This now also applies to agent selection state. A leaf can narrow, expand, or reset inherited `agentSupport` safely.

References:

- operator guide: [docs/layered-specs.md](docs/layered-specs.md)
- copyable example: [specs/examples/monorepo/](specs/examples/monorepo/)

## Architecture At A Glance

| Source of truth | Purpose |
|---|---|
| `docs/agent-jump-start/canonical-spec.yaml` | canonical project memory |
| `.agents/AGENTS.md` | canonical workspace instruction file |
| `.agents/skills/<slug>/` | canonical skill packages |
| agent-specific mirrors | projections for each supported ecosystem |
| `docs/agent-jump-start/generated-manifest.json` | current managed file set for cleanup and drift detection |
| `docs/agent-jump-start/agent-jump-start.lock.json` | imported skill provenance and refreshable sources |

## Minimal Spec Example

```json
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
    "intro": "Review generated changes against repository-specific constraints.",
    "failureThreshold": 2,
    "items": [
      {
        "title": "Uses repository constraints",
        "details": [
          "The change should follow the real stack and validation commands."
        ]
      }
    ],
    "quickSignals": [
      "Generated files remain in sync."
    ],
    "redFlags": [
      "Hand-edited generated instruction files."
    ]
  },
  "skills": []
}
```

## CLI Reference

```bash
agent-jump-start --help
agent-jump-start --version
agent-jump-start list-agents
agent-jump-start list-agents --spec <path>
agent-jump-start list-profiles

agent-jump-start init [--profile <path>] [--target <path>] [--non-interactive] [--agents all|detected|<id,...>]
agent-jump-start bootstrap --base <path> [--profile <path>] [--output <path>]
agent-jump-start sync --spec <path> [--target <path>] [--force | --backup | --keep-existing]
agent-jump-start infer --target <path> [--output <path>] [--section <name>] [--format json|text]
agent-jump-start infer-overlay --target <path> [--output <path>] [--base <path>] [--section <name>]
agent-jump-start absorb --spec <path> [--target <path>] [--dry-run] [--output <path>] [--apply --selection <path>]
agent-jump-start doctor --spec <path> [--suggest --target <path>]
agent-jump-start render --spec <path> [--target <path>] [--clean] [--force | --backup | --keep-existing]
agent-jump-start check --spec <path> [--target <path>]
agent-jump-start validate --spec <path>

agent-jump-start validate-skill <path>
agent-jump-start intake --spec <path> [--target <path>] [--import] [--replace]
agent-jump-start import-skill --spec <path> --skill <path> [--replace]
agent-jump-start add-skill <source> --spec <path> [--skill <name>] [--replace] [--provider <name>]
agent-jump-start export-skill --spec <path> --slug <name> --output <path>
agent-jump-start update-skills --spec <path> [--skill <slug>] [--dry-run]
agent-jump-start update-agents --spec <path> [--include <id,...>] [--remove <id,...>] [--all-missing] [--mode all]
agent-jump-start export-schema [--output <path>]
agent-jump-start demo-clean --target <path>
agent-jump-start demo-tree --target <path>
```

## Requirements

- Node.js >= 18
- npm for installation and distribution
- no runtime dependencies required

## Installation Options

| Install path | Best for | Command |
|---|---|---|
| Global install | daily use on one machine | `npm install -g @marcogoldin/agent-jump-start` |
| `npx` | one-off execution | `npx @marcogoldin/agent-jump-start@latest <command>` |
| Vendored in-repo copy | teams that want the toolkit committed inside the repo | `git clone https://github.com/marcogoldin/agent-jump-start.git docs/agent-jump-start` |

The most reliable execution paths are the global `agent-jump-start` binary and vendored usage via `node docs/agent-jump-start/scripts/agent-jump-start.mjs`.

## Current Limitations

- `sync`, `render`, and `check` do not accept transient `--agents` overrides. Agent selection belongs to canonical spec state.
- `sync --keep-existing` is now explicit about non-convergence: when preserved operator-authored files remain, the command exits `2` and expects a follow-up `absorb`, `sync --force`, or `sync --backup`.
- `intake --import --replace` is provenance-safe. Upstream-tracked skills are not downgraded to local-only provenance.
- Gemini, Amazon Q, Junie, Continue, Aider, Windsurf, Cline, and Roo Code do not receive native skill packages; they receive workspace guidance plus inline skill summaries.
- `absorb` v1 intentionally targets `workspaceInstructions.sections` and `workspaceInstructions.validation` only.
- direct `npx @marcogoldin/agent-jump-start@latest ...` execution may vary across npm environments; global install and vendored usage are the most reliable paths.

## Portability

The content model is stack-agnostic. Node.js is only the generator runtime.

If a team wants a different implementation language, it can preserve:

- the canonical spec format
- the generated file layout
- the synchronization model

## Testing

```bash
npm test
```

256 tests cover core workflows, sync convergence, overwrite protection, guided onboarding, inference, layered specs, leaf-only writeback, skill import and export, provenance lockfiles, absorb flows, grouped conflict prompts, selective agent support, full agent lifecycle management, and regression cases from real existing-repository adoption.

## Contributing

1. Create a branch.
2. Make the smallest coherent change that solves one problem.
3. Run `npm test`.
4. Update `README.md` when user-visible behavior changes.
5. Open a pull request.

## License

[Mozilla Public License 2.0](LICENSE)
