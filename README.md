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
| **Claude Code** | VS Code, JetBrains, CLI | `CLAUDE.md`, `.claude/skills/*/AGENTS.md` |
| **GitHub Copilot** | VS Code, JetBrains, Neovim | `.github/copilot-instructions.md` |
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

### 1. Copy into your project

Copy the `agent-jump-start` folder into your target repository:

```bash
cp -r agent-jump-start /path/to/your-project/docs/agent-jump-start
```

Or clone directly:

```bash
git clone https://github.com/YOUR_USERNAME/agent-jump-start.git docs/agent-jump-start
```

### 2. Choose a starting profile

Available example profiles:

| Profile | Stack |
|---|---|
| `specs/profiles/react-vite-mui.profile.yaml` | React + Vite + Material UI |
| `specs/profiles/php-laravel.profile.yaml` | PHP 8.3 + Laravel |

If neither fits, duplicate one and adjust it, or skip the profile and customize the base spec directly.

### 3. Bootstrap the canonical spec

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs bootstrap \
  --base docs/agent-jump-start/specs/base-spec.yaml \
  --profile docs/agent-jump-start/specs/profiles/react-vite-mui.profile.yaml \
  --output docs/agent-jump-start/canonical-spec.yaml
```

This creates `docs/agent-jump-start/canonical-spec.yaml` — your **single source of truth**.

### 4. Customize the canonical spec

Edit `canonical-spec.yaml` with your real:

- Project name and components
- Tech stack and runtime versions
- Coding rules and conventions
- Validation commands (lint, test, build)
- Skills and rule sets

### 5. Render all instruction files

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs render \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

This generates synchronized instruction files for all 9 supported agents:

```
AGENTS.md                                  # GitHub Agents
CLAUDE.md                                  # Claude Code
CONVENTIONS.md                             # Aider
.github/copilot-instructions.md            # GitHub Copilot
.cursor/rules/agent-instructions.mdc       # Cursor
.cursor/rules/<skill-slug>.mdc             # Cursor (per skill)
.windsurfrules                             # Windsurf
.clinerules                                # Cline
.roo/rules/agent-instructions.md           # Roo Code
.continue/rules/agent-instructions.md      # Continue.dev
.agents/skills/<slug>/SKILL.md             # GitHub Agents (skill descriptor)
.agents/skills/<slug>/AGENTS.md            # GitHub Agents (skill guide)
.claude/skills/<slug>/AGENTS.md            # Claude Code (skill guide)
docs/agent-review-checklist.md             # Review checklist
docs/agent-jump-start/generated-manifest.json
```

### 6. Verify sync

```bash
node docs/agent-jump-start/scripts/agent-jump-start.mjs check \
  --spec docs/agent-jump-start/canonical-spec.yaml \
  --target .
```

Use this in CI pipelines or pre-commit hooks to enforce alignment.

### 7. Use prompt templates

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
        +---> .github/copilot-instructions.md
        +---> .cursor/rules/*.mdc
        +---> .windsurfrules
        +---> .clinerules
        +---> .roo/rules/*.md
        +---> .continue/rules/*.md
        +---> CONVENTIONS.md
        +---> .agents/skills/*/
        +---> .claude/skills/*/
        +---> docs/agent-review-checklist.md
```

### Memory Injection Pattern

The canonical spec acts as a **memory injection layer** for all coding assistants:

1. **Rules** defined once in the spec are rendered into each agent's native instruction format
2. **Skills** (reusable rule sets) are expanded into full guides with categories, quick references, and detailed guidance
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
| Manifest with timestamps | Enables stale file detection and CI enforcement |
| Skills as first-class objects | Reusable across projects; composable via profiles |

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

# List supported agents
node scripts/agent-jump-start.mjs list-agents

# Bootstrap from base + profile
node scripts/agent-jump-start.mjs bootstrap \
  --base specs/base-spec.yaml \
  --profile specs/profiles/react-vite-mui.profile.yaml \
  --output canonical-spec.yaml

# Render all instruction files
node scripts/agent-jump-start.mjs render \
  --spec canonical-spec.yaml --target .

# Verify sync (CI-friendly, exits 1 on drift)
node scripts/agent-jump-start.mjs check \
  --spec canonical-spec.yaml --target .
```

## Folder Layout

```
agent-jump-start/
  README.md
  LICENSE
  package.json
  scripts/
    agent-jump-start.mjs
  specs/
    base-spec.yaml
    profiles/
      php-laravel.profile.yaml
      react-vite-mui.profile.yaml
  prompts/
    01-bootstrap-any-agent.md
    02-change-stack-or-guidelines.md
    03-add-or-update-skill.md
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

MIT - see [LICENSE](LICENSE) for details.
