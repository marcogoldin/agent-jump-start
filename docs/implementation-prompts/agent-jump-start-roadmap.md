# Agent Jump Start — Roadmap

## Read me first

This file lists only what is still left to build, in strict priority order.

Rules:

1. Start from operator UX outcomes, not implementation convenience.
2. Apple-style product rule: define the end-user experience first, then work backward to CLI structure, storage, and implementation details.
3. Prefer the simplest possible user decision that still preserves trust and control.
4. One command must do one understandable thing.
5. Fail loudly and usefully with explicit next action.

Shipped details belong to `CHANGELOG.md`, not here.

---

## Current Status (2026-04-21)

Closed locally and now baseline behavior:

- P0-A: discovery + propagation coverage expansion for major pre-existing agent file formats.
- P0-B: guided `absorb` flow to merge unmanaged pre-existing instructions into canonical spec.
- P0-C.1: canonical import trust for skills. `validate-skill` now runs the same two-stage canonical import pipeline used by `intake` and `import-skill` (frontmatter shape + canonical reconstruction) for both skill directories and standalone `SKILL.md` files, reports three explicit outcomes (`import-compatible`, `structurally-valid`, `frontmatter-invalid`), and keeps `--frontmatter-only` as the opt-in legacy CI shape check.
- P0-C.4: external skill canonicalization baseline. Display-style `name:` values from third-party `SKILL.md` files, such as `Python Pro`, are now normalized automatically into canonical slugs such as `python-pro` during conversion, so the operator no longer needs to hand-edit frontmatter just to satisfy the slug regex.
- P1: preserve unmanaged pre-existing files by default across `init` / `sync` / `render`.

P0 candidate now under review:

- P0-C.2: first-run `init` copy for low-signal repos (starter preset vs stack hint vs generic/skip vs abort) with no TUI dependency yet.
- P0-C.3: interactive terminal UX decision — native `node:readline` raw mode vs small dependency — evaluated as an isolated spike with startup-time budget, TTY fallback, `NO_COLOR`, and SIGINT teardown as explicit acceptance criteria.
- P0-C.5: local-skill diagnostics for `sync` and `intake`, so operators immediately understand why a discovered local skill is not yet canonicalized or mirrored.
- P0-D: selective agent support during onboarding and later project evolution, so existing repos can start narrow instead of always inheriting all supported agents.
- P0-E: complete the selective-agent lifecycle for already initialized projects, including safe removal, transparent agent naming, and convergence-safe maintenance flows.

Execution rule for closed areas: keep them under regression tests; reopen only on verified regressions.

---

## Proposed P0-C.2 — First-Run `init` Copy for Low-Signal Repositories

**User outcome:** a non-expert can initialize a generic or script-heavy repository and understand the onboarding choices immediately, without hidden knowledge of starter presets, raw stack tokens, or `skip`.

Why this is P0:

- The first-run experience is the trust boundary for the whole product.
- A repo with weak stack signals currently falls into an onboarding flow that feels narrower and less transparent than the actual capability of the tool.
- The current CLI asks the operator to infer hidden semantics such as raw stack names versus starter presets versus `skip`.

Product principles for this feature:

- The first-run path must teach the product model while the user is using it.
- Generic repositories are first-class, not edge cases.

### User-first Flow

#### 1. `init` must make generic repositories feel intentional

For repositories with weak or mixed stack signals, the operator should immediately understand that there are three different kinds of choices:

- a starter preset
- a stack hint
- a generic draft

The prompt should not force the user to discover this model by trial and error.

In particular:

- `Other` must not feel like a dead end that still depends on hidden input conventions.
- raw stack names such as `python` must be explained directly in the prompt copy if they are supported.
- `skip` must be framed as a valid recommended path for generic or script-based repositories, not as a hidden escape hatch.
- when confidence is low, the CLI should say what it recommends and why.

### CLI Proposal

#### `init`

Improve the first prompt so it explicitly surfaces:

- starter presets
- raw stack hints
- generic draft / `skip`
- abort

Required UX characteristics:

- low-signal repos get a friendly recommended path;
- `Other` becomes a guided branch, not just a preset dump;
- confirmation screens summarize what the tool inferred versus what the operator chose.

### Engineering Approach

Build in this order:

1. Redesign the product copy and operator model for low-signal `init` flows.
2. Keep the interactive copy zero-dependency and text-first for this step.
3. Add regression fixtures for generic repo onboarding and low-signal prompts.

### Done When

- a generic repository with a few Python scripts can complete `init` without hidden knowledge of raw stack tokens;
- the prompt clearly explains starter presets, stack hints, `skip`, and abort;
- the flow stays deterministic in non-interactive and CI usage;
- no TUI dependency is required to ship this copy improvement.

### Non-goals

- no arrow-key or raw-mode terminal UX in this step;
- no dependency decision in this step;
- no changes to skill validation or import contracts in this step.

---

## Proposed P0-C.3 — Interactive Terminal UX Decision

**User outcome:** interactive TTY sessions feel materially more legible and easier to operate, with a clear decision about whether Agent Jump Start should stay zero-dependency or adopt a very small CLI UX dependency set.

Why this is P0:

- The current terminal interaction is materially less fluid than modern CLI tools that provide arrow-key selection, clearer confirmation states, and stronger visual guidance.
- TUI work touches startup time, TTY fallback, SIGINT teardown, and color semantics, so it should be isolated as a product and engineering decision.

Build next:

- Evaluate native `node:readline` plus raw mode versus a small dependency-backed TUI.
- Define explicit acceptance criteria for:
  - arrow-key navigation
  - `NO_COLOR`
  - TTY fallback
  - SIGINT teardown
  - startup-time budget
- Choose one implementation direction and document why.

Done when:

- the dependency decision is explicit and documented;
- the chosen path has measurable startup expectations;
- TTY versus non-TTY behavior is defined before implementation work begins.

Non-goals:

- no shipping half of a TUI without the corresponding teardown and fallback rules;
- no hidden dependency growth justified only by aesthetics.

---

## Proposed P0-C.5 — Local Skill Diagnostics for `sync` and `intake`

**User outcome:** when a local skill is discovered but not yet canonicalized or mirrored, the CLI explains that state immediately and points to the exact next command instead of forcing the operator to infer what happened.

Why this is P0:

- local skill adoption still becomes confusing when discovery, canonicalization, and mirroring are separated across `intake`, `validate-skill`, and `sync`;
- the operator should not have to reverse-engineer whether a skill was discovered, imported, skipped, or simply not mirrored.

Build next:

- improve `sync` warnings so they distinguish:
  - discovered locally
  - canonicalized into spec or not
  - mirrored or not
  - exact next step
- improve `intake` summaries so structural errors, canonical errors, and local-only state are easier to understand at a glance.

Done when:

- a local skill that is not mirrored has one explicit explanation in CLI output;
- the next recovery command is obvious from `sync` or `intake` output;
- operator confusion about “skill exists locally but not under `.claude/skills/`” is removed.

Non-goals:

- no new import semantics beyond clearer diagnostics;
- no TUI dependency required for this step.

---

## Proposed P0-D — Selective Agent Support

**User outcome:** a team can start Agent Jump Start with only the agents they actually use today, keep the setup simple, and add more agents later without rethinking the whole project.

Why this is P0:

- In real adoption, existing repositories will often want partial rollout, not all supported agents on day one.
- "Generate everything for everyone" is operationally correct but product-heavy for teams still converging on one or two tools.
- The first-run experience should reduce commitment anxiety, not force a broad ecosystem choice before trust is earned.

Product principles for this feature:

- Default to the least confusing path for non-expert users.
- Let "all supported agents" remain one obvious choice, not a removed capability.
- Existing-repo onboarding should recognize that "start small" is often the safest and most believable path.
- Adding support later must feel incremental, not like re-initializing the product.

### User-first Flow

#### 1. `init` asks one clear rollout question

The first decision should be:

- support all agents
- support only agents already detected in this repo
- choose agents explicitly

Guidance:

- For greenfield repos, `all supported agents` remains the recommended default.
- For existing repos with detected agent files, `detected agents only` becomes the recommended default.
- `choose agents explicitly` is the advanced but still first-class path.

#### 2. Explicit selection stays simple

If the operator chooses explicit selection:

- show only canonical agent names, with short user-facing labels;
- group them in a stable, readable order;
- avoid dumping internal file paths or projection details into the prompt;
- confirm the final selected set before writing anything.

The user should leave onboarding with a plain understanding:

- which agents are enabled now;
- which are not enabled yet;
- how to add more later.

#### 3. Expanding support later is a separate, focused workflow

Add a dedicated command for later rollout expansion, for example:

- `agent-jump-start update-agents --spec <path>`

Its default interactive behavior should:

- inspect the current project selection;
- show only agents not yet enabled;
- let the operator add one, many, or all remaining agents;
- avoid re-asking about already enabled agents unless explicitly requested.

This must feel like "extend this project" rather than "re-run setup from scratch".

### Proposed Canonical Model

Store the selection in the canonical spec, not a separate sidecar config, so the chosen support surface is:

- versioned with project memory;
- reviewable in pull requests;
- deterministic for `render`, `sync`, and `check`;
- portable across local, CI, and vendored usage.

Proposed shape:

```yaml
agentSupport:
  mode: all | selected
  selected:
    - claude-code
    - cursor
    - github-agents
```

Rules:

- Missing `agentSupport` means `all` for backward compatibility.
- `mode: all` ignores `selected`.
- `mode: selected` requires a non-empty `selected` list of known canonical agent ids.
- Canonical ids must reuse one shared source of truth from the agent target registry.

This keeps migration low-risk:

- old specs continue to work unchanged;
- new specs can opt into narrower propagation without introducing a second config system.

### CLI Proposal

#### `init`

Interactive:

- Ask rollout mode early in guided onboarding, after repo detection but before rendering decisions.
- If `selected`, walk the user through agent choice and confirmation.

Non-interactive:

- support flags such as:
  - `--agents all`
  - `--agents detected`
  - `--agents claude-code,cursor,github-agents`

#### `sync`, `render`, `check`

These commands should honor the chosen support surface:

- only selected agents are rendered and checked;
- stale outputs for now-disabled agents are cleaned as managed stale files;
- diagnostics name when a target is skipped because it is not enabled for this project.

#### `update-agents`

Primary purpose:

- add agents not yet enabled.

Initial scope:

- default interactive flow only offers missing agents;
- `--include <csv>` supports scripted additions;
- `--all-missing` enables every not-yet-selected agent;
- optional future flag: `--review-all` to revisit the full set.

### Detection and Recommendation Strategy

During onboarding for existing repositories:

- inspect pre-existing agent instruction files already discovered by introspection;
- map them to canonical agent ids;
- use that evidence to recommend `detected agents only` when confidence is high.

This keeps the first recommendation grounded in what the repo already signals, instead of assuming universal rollout.

### Engineering Approach

Build in this order:

1. Define canonical spec schema for `agentSupport`.
2. Reuse one canonical agent id registry across schema, prompts, rendering, and validation.
3. Gate render/check/manifest generation by enabled agent set.
4. Add guided onboarding question and non-interactive `--agents` flag support.
5. Add `update-agents` command for additive rollout.
6. Add docs and regression coverage for partial-support repos and later expansion.

### Done When

- a non-expert can initialize an existing repo and select only a subset of agents in one pass;
- a greenfield repo can still choose `all supported agents` in one obvious step;
- `sync`, `render`, and `check` operate only on enabled agents without hidden drift;
- later expansion to more agents is additive, explicit, and easier than re-running `init`;
- backward compatibility is preserved for specs that do not define `agentSupport`.

### Non-goals

- no per-command ad hoc agent filtering that bypasses canonical project memory;
- no second config file unless the canonical spec proves insufficient;
- no breaking change where existing projects suddenly stop supporting all agents by default;
- no rollout UX that requires expert understanding of projection internals.

---

## Proposed P0-E — Complete Agent Selection Lifecycle

**User outcome:** a team can safely narrow, expand, or inspect agent support in an already initialized project without editing the spec manually, guessing internal ids, or getting stuck in `sync/check` drift after choosing to preserve existing files.

Why this is P0:

- Selective support is not complete if it only helps at `init` time.
- Real projects are more likely to start from an existing repo than from a clean slate.
- A feature is still product-incomplete when the operator has to discover internal ids inside docs or edit YAML by hand to remove agents.
- A maintenance workflow is not trustworthy if `sync --keep-existing` appears to succeed but `check` still reports persistent drift with no ergonomic recovery path.

Product principles for this feature:

- The CLI must explain agent choices with operator-facing names and canonical ids together wherever selection happens.
- Removal must be as first-class as addition.
- The safe path for existing repos must converge, not leave the user between "kept safely" and "check still failing".
- The user should not need prior knowledge of spec internals to understand which agent ids exist or how to reference them.

### User-first Flow

#### 1. Existing projects need a real "change my supported agents" workflow

For a repo that is already initialized, the operator should be able to run one focused command and:

- see which agents are enabled now;
- see which agents are not enabled;
- add more agents;
- remove enabled agents;
- confirm the resulting set before writing changes.

This must feel like "change project support" rather than "edit a config file by hand and hope sync does the right thing".

#### 2. Agent names must be transparent in every relevant CLI flow

Whenever the operator can choose, add, remove, or inspect agents, the CLI should surface:

- the human-readable label, for example `GitHub Copilot`;
- the canonical id, for example `github-copilot`;
- the key rendered outputs, in one short line only when useful.

Minimum surfaces:

- `init`
- `update-agents`
- `list-agents`
- validation errors involving unknown ids
- conflict or skip messages involving disabled agents

The product should never assume the operator already knows that "GitHub Agents" maps to `github-agents` or that "Claude Code" maps to `claude-code`.

#### 3. Safe preservation must still lead to a coherent project state

If the operator chooses a safety path such as `--keep-existing`, the next system state must be coherent:

- either the kept files are explicitly treated as intentional preserved overlays and `check` respects that state;
- or the CLI offers an immediate guided next action, such as absorb, remove, or mark-as-preserved, before declaring the workflow complete.

The bad outcome is:

- `sync` says it kept files safely;
- `check` still fails on those same files;
- the operator is left guessing whether the project is healthy.

### CLI Proposal

#### `update-agents` becomes a full lifecycle command

Expand `update-agents` from additive-only behavior to full support lifecycle management.

Target capabilities:

- `--include <csv>` for additive rollout
- `--remove <csv>` for narrowing support
- interactive mode showing enabled and missing agents in separate sections
- `--mode all` to restore full coverage
- optional `--mode selected --agents <csv>` as a one-shot exact-set operation

Interactive defaults should:

- show enabled agents first;
- allow deselecting currently enabled agents;
- show missing agents second;
- preview stale outputs that will be removed if support is narrowed.

#### `list-agents` becomes the discoverability baseline

`list-agents` should evolve from a plain display list into the authoritative operator reference in the CLI.

It should show, in a compact readable table:

- label
- canonical id
- main output targets
- whether the current project enables it, when `--spec` is provided

This gives manual spec editors and scripted users a single reliable discovery command.

#### Validation and diagnostics must teach the model

When the operator uses an unknown id or asks to remove an already-disabled agent, the CLI should answer with:

- the exact invalid token;
- the closest supported ids;
- one next-step command, for example `agent-jump-start list-agents`.

### Operational Issue To Resolve First

#### `sync --keep-existing` must leave a coherent steady state for `check`

This is now a verified real-world gap from `chatopac-runtime` after moving an already initialized repo from full support to:

```yaml
agentSupport:
  mode: selected
  selected:
    - claude-code
    - github-copilot
    - github-agents
    - amazon-q
```

Observed real case:

1. `sync` without safety flags correctly identified a subset of still-enabled files as unmanaged operator-authored mirrors and refused to overwrite them.
2. The same `sync` run correctly cleaned stale outputs for now-disabled agents such as Cursor, Windsurf, Cline, Roo, Continue, Gemini, Junie, and Aider.
3. `sync --keep-existing` then behaved safely:
   - preserved unmanaged files for still-enabled agents;
   - rendered the rest of the selected support surface;
   - reported `Sync check passed for 194 file(s)`.
4. A later standalone `check` still failed on those same kept files and on generated files that were now left in a mixed managed/unmanaged state.

This is not just a technical inconsistency. It is a product failure mode:

- the operator chooses the safe path;
- the CLI appears to complete successfully;
- the project still does not converge under the standard maintenance command that should validate steady state.

#### Why this is a P0 blocker

For existing repos, `--keep-existing` is the least risky path and often the most believable one.

If that path does not produce a project state that `check` can later validate, the operator is forced into one of these bad outcomes:

- guess whether the repo is actually healthy;
- accept permanent red drift after choosing the safe option;
- manually absorb or hand-edit state without the CLI making that requirement explicit up front.

That breaks the trust model of Agent Jump Start.

#### Root problem

Today the lifecycle semantics are split:

- `sync --keep-existing` treats some collisions as intentionally preserved and continues;
- `check` still treats those same paths as unmanaged drift against the canonical spec;
- there is no durable project state recording that the operator intentionally preserved those files during maintenance.

So the product currently has no coherent concept of:

- preserved managed paths;
- preserved unmanaged overlays;
- or an explicit "kept by operator choice" state that downstream commands can understand.

#### Required product behavior

After `sync --keep-existing`, one of the following must be true:

1. `check` passes because the kept files are now represented as an intentional preserved state.
2. `sync` does not report successful completion and instead says clearly:
   - which files were kept;
   - that the project is not yet converged;
   - the one exact next command to make it converge.
3. the CLI immediately offers a guided follow-up flow, such as:
   - absorb preserved files into spec;
   - mark preserved files as accepted overlays;
   - remove support for the affected agent outputs;
   - replace kept files later with a confirmed overwrite pass.

What must not happen:

- `sync --keep-existing` appears successful;
- `check` fails later on the same preserved state;
- the operator has no explicit mental model for why.

#### Engineering options

Option A: preserved-path state in canonical memory

- Record preserved paths or preserved groups in canonical project state or lockfile state.
- `check` treats those paths as intentionally preserved, not unexpected drift.
- `sync` can continue to report deterministic health.

Option B: preserved state is explicitly non-converged

- `sync --keep-existing` must end with a non-success summary if preserved files block steady state.
- It should print a structured next action:
  - `absorb`
  - `update-agents --remove ...`
  - `sync --force`
- `check` behavior can then remain strict, because the product never claimed convergence.

Option C: preserve-by-group with immediate lifecycle decision

- When conflicts are grouped by skill/agent root, the CLI can ask once per group:
  - keep and mark preserved
  - absorb now
  - remove this agent support
  - overwrite
- This reduces repeated prompts and closes the state model in one workflow.

The final implementation can choose one of these, but it must satisfy the product rule: safe path and validation path cannot disagree silently.

#### Minimum real-case regression to add

Use a fixture shaped like the verified `chatopac-runtime` scenario:

- repo initially rendered for all agents;
- project spec narrowed to selected subset:
  - `claude-code`
  - `github-copilot`
  - `github-agents`
  - `amazon-q`
- still-enabled roots contain some unmanaged mirrored files under:
  - `.claude/skills/...`
  - `.github/skills/...`
  - `.agents/skills/...`
- disabled agent outputs exist and should be removed.

Expected assertions:

1. `sync --keep-existing` preserves unmanaged files in enabled roots.
2. `sync --keep-existing` removes stale outputs for disabled agents.
3. the resulting state is explicitly one of:
   - converged and `check` passes;
   - or non-converged and `sync` reports that clearly with exact next step.
4. no later standalone `check` should surprise the operator with a failure mode that contradicts the earlier `sync` outcome.

#### Done when

- the safe maintenance path for existing repos is semantically coherent;
- `sync` and `check` agree on the meaning of preserved files;
- the CLI teaches the operator what happened and what state the project is in;
- a narrowed existing repo can be maintained without hidden drift traps after selecting a subset of agents.

### Engineering Approach

Build in this order:

1. Extend agent lifecycle state handling so an exact selected set can be written safely to the canonical spec.
2. Add removal support and interactive exact-set editing to `update-agents`.
3. Improve `list-agents` to expose canonical ids and current project state.
4. Make `sync` + `check` converge correctly after `--keep-existing` when disabled or preserved files remain.
5. Add targeted docs and regression tests for already-initialized repos changing support over time.

### Done When

- an already initialized repo can narrow support from all agents to a subset with one native CLI workflow;
- an operator can remove one or more enabled agents without hand-editing the spec;
- every selection-related CLI surface exposes canonical ids clearly;
- `sync --keep-existing` does not leave the project in a confusing "safe but permanently failing check" state;
- manual spec editors have one obvious CLI command to discover valid agent ids.

### Non-goals

- no requirement to re-run `init` just to remove or rename supported agents;
- no hidden canonical ids that only appear in implementation files or README examples;
- no maintenance flow that reports success while leaving unresolved drift as the expected steady state.

---

## P2 — Predictable Skills Across Every Agent

**User outcome:** a skill behaves equivalently across supported agents, or the CLI clearly reports the compatibility gap before render/sync.

Build next:

- Define conservative cross-agent activation mapping for `triggers`, `globs`, `alwaysApply`, `manualOnly`, `relatedSkills`.
- Add compatibility diagnostics that name: agent, incompatible field, reason, safe alternative.
- Formalize projection behavior for agents with no native skill package support.
- Publish a single operator reference page mapping each canonical skill field to per-agent behavior.

Done when:

- equivalent behavior is reached for supported projections, or explicit pre-write warnings always surface;
- incompatibility messages are deterministic and actionable;
- operator docs are linked from README and tested against current implementation.

Non-goals:

- no silent skill semantic downgrades;
- no agent-specific hacks in canonical spec schema.

---

## P3 — Team Trust Signals (CI + Release Contract)

**User outcome:** teams can adopt and upgrade safely without custom glue or guesswork.

Build next:

- Ship official CI workflow templates for `validate`, `check`, and drift gates.
- Add golden snapshot regression suites for `sync`, `doctor`, `update-skills`, and `absorb` handoff paths.
- Publish release contract: compatibility guarantees, versioning policy for spec/lockfile/output, migration policy.
- Require migration notes for every schema or lockfile evolution.

Done when:

- a new team can copy one workflow and get trustworthy guardrails;
- every release states compatibility impact explicitly;
- migration path is always documented before release.

Non-goals:

- no undocumented breaking changes;
- no hidden behavior drift between minor releases.

---

## P4 — Useful Beyond Software Engineering

**User outcome:** non-engineering teams can use Agent Jump Start with the same confidence and governance model.

Build next:

- Provide starter profiles for product specs, documentation governance, research synthesis, support/runbooks.
- Include one complete, testable, real-world example workflow per profile.
- Extend docs and examples for non-code validation loops.

Done when:

- a non-developer can bootstrap from a profile in under five minutes;
- generated guidance remains coherent across supported agent targets.

Non-goals:

- no domain-specific profile expansion without repeatable examples and validation tests.

---

## Ordered Execution (from now)

1. Proposed P0-C.2 first-run `init` copy for low-signal repos.
2. Proposed P0-C.3 interactive terminal UX decision.
3. Proposed P0-C.5 local-skill diagnostics for `sync` and `intake`.
4. Proposed P0-D selective agent support.
5. Proposed P0-E complete agent selection lifecycle.
6. P2 skill semantics parity and diagnostics.
7. P3 CI/release trust contract.
8. P4 non-software expansion.

Cross-cutting requirement: any change in these priorities must preserve shipped trust guardrails (`preserve`, `absorb`, layered leaf-only writeback) and keep `npm test` + smoke suites green.
