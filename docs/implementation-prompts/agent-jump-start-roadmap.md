# Agent Jump Start — Roadmap

## Read me first

This file lists **only what is left to build**, in order of priority.

Two non-negotiable rules:

1. **Start from the user, not the engineering.** Every item below is justified by a concrete UX outcome an operator can see and feel. If an item cannot be expressed as a user-visible improvement, it does not belong here.
2. **One command must do one understandable thing.** No magic, no hidden modes, no second invocations to "make it stick".

Anything already shipped lives in commit history. Do not re-document it here.

---

## North Star UX

The operator should be able to:

1. drop the framework into a repo,
2. answer a few questions,
3. run **one** command,
4. trust the output.

Every priority below removes friction from one of those four steps.

---

## P0 — Bootstrap that feels like onboarding, not authoring

**User outcome:** "I never start from a blank canonical spec."

This is the most painful step today. `init` produces a placeholder spec the operator must rewrite by hand before the tool becomes useful. The first-run experience should propose a draft built from real repository signals, and the operator should only confirm or correct.

What to build:

- a single front-door command (`init` by default, no extra flag) that runs introspection + inference and produces a draft `canonical-spec.yaml` ready for review,
- richer greenfield presets for empty repos: the operator can already choose starter stack signals, but the flow still needs opinionated templates for common starts such as React + Node API, Python service, or mixed TypeScript + Python workspaces,
- stronger mixed-runtime ranking and ownership: onboarding now surfaces multiple repo slices, but it still needs better compression so operators see the right components without generic overlap or too many near-duplicates,
- a review flow that already works item-by-item, then improves further with tighter inline editing, clearer summaries of accepted vs skipped items, and less prompt fatigue on larger repos,
- onboarding copy that now distinguishes starter outputs from trusted output, then goes one step further by showing a concise post-init trust summary instead of only generic next steps,
- a guided confirmation flow that shows each inferred section with its provenance and lets the operator accept, edit, or skip — never silently writes opinionated content,
- inference grounded in actual repo evidence: `package.json`, `pyproject.toml`, `Makefile`, `justfile`, `.pre-commit-config.yaml`, CI workflows, `README.md`, `CONTRIBUTING.md`, ADRs,
- a clear UI distinction between **detected**, **inferred**, and **confirmed** content while drafting; once confirmed, the canonical spec contains no machine annotations.

P0 closed in this release line — see `CHANGELOG.md`.

Done when:

- a first-time operator on a Node.js, Python, or mixed repo gets a useful draft spec without writing a single line,
- a first-time operator on an empty repo can choose their intended stack and get a non-generic starting spec without hand-authoring the runtime and validation model,
- every inferred field shows its source so the operator can trust or reject it,
- the final `canonical-spec.yaml` is fully human-readable and contains no inference metadata,
- one `init` invocation followed by one `sync` produces a usable, repo-specific instruction set.

Non-goals:

- no auto-authoring without confirmation,
- no inference promoted to "fact" without operator sign-off,
- no embedded provenance noise in the canonical spec.

---

## P0 — Layered specs that an operator can reason about

**User outcome:** "I can share one base across packages and override only what differs, and I always know which layer owns which rule."

This unlocks monorepos and multi-team adoption. The blocker is not the merge engine — it is operator clarity about ownership.

What to build:

- explicit, documented ownership semantics: who owns the base, who owns each overlay, what mutating commands write where,
- a deterministic merge with no hidden deep-merge surprises (per-field rules already exist — formalize and document),
- one fully-worked monorepo example operators can copy as a template,
- validation errors that point to the **layer** that introduced the problem, not just the merged result,
- operator documentation for `extends` chains, leaf-vs-base writeback, and overlay rendering boundaries.

Done when:

- an operator can extend a base spec without duplicating it,
- `import-skill`, `intake`, and `update-skills` document and demonstrate exactly which file they mutate,
- the monorepo example renders correctly end-to-end with a single `sync` per package,
- a layered validation failure tells the operator which file to open.

Non-goal:

- no generic "magical" deep merge.

---

## P2 — Predictable skills across every agent

**User outcome:** "A skill behaves the same way in Claude, Cursor, Copilot, and the others — or the tool tells me clearly when it cannot."

What to build:

- richer, conservative activation metadata: `triggers`, `globs`, `alwaysApply`, `manualOnly`, `relatedSkills`,
- stronger `compatibility` validation with operator-facing warnings when a skill cannot be faithfully projected to a target,
- explicit projection rules into Cursor and inline-summary targets, documented per agent.

Done when:

- the same skill produces equivalent behavior across supported agents, or the tool surfaces the gap before render,
- compatibility warnings name the agent, the field, and the safe alternative.

---

## P3 — Trust signals for teams

**User outcome:** "My team can adopt this without writing custom CI glue or hoping it stays stable."

What to build:

- an official GitHub Actions workflow operators can drop in,
- fixture-driven regression coverage with golden output snapshots for `sync`, `doctor`, `update-skills`,
- a release contract document: what is stable, what may change between minor/major releases, how `canonical-spec.yaml`, the lockfile, and rendered outputs are versioned,
- migration notes whenever schema or lockfile evolves,
- a provenance policy covering disappearing sources, slug changes, ambiguous resolution, and provider drift.

Done when:

- a new team can adopt the tool by copying one CI file and reading one page of docs,
- every release ships with an explicit compatibility statement,
- spec/lockfile changes ship with a documented migration path.

---

## P4 — Useful beyond software

**User outcome:** "I can use this to govern non-code work too — docs, research, support runbooks, product specs — with the same rigor."

What to build:

- starter profiles for: product specification, technical documentation, research synthesis, support and runbook governance, operational review,
- at least one serious, structured, testable non-code example skill per profile.

Done when:

- a non-developer can bootstrap a useful canonical spec from one of these profiles in under five minutes.

---

## Cross-cutting principles (apply to every priority above)

- **Operator clarity beats clever automation.** If a behavior cannot be explained in one sentence, it is wrong.
- **One command, one outcome.** No hidden second steps. No "run it again to fix it".
- **Provenance is for review, not for the canonical artifact.** Inference metadata stays out of the final spec.
- **Fail loudly, fail usefully.** Every error names the file, the cause, and the next action.
- **Shrink the surface before adding to it.** Prefer collapsing two commands into one over introducing a third.
