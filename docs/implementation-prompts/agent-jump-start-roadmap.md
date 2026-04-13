# Agent Jump Start — Roadmap

## Read me first

This file lists **only what is left to build**, in order of priority.

Two non-negotiable rules:

1. **Start from the user, not the engineering.** Every item below is justified by a concrete UX outcome an operator can see and feel. If an item cannot be expressed as a user-visible improvement, it does not belong here.
2. **One command must do one understandable thing.** No magic, no hidden modes, no second invocations to "make it stick".

Anything already shipped lives in commit history and `CHANGELOG.md`. Do not re-document it here.

Mandatory execution posture for any agent working from this roadmap:

- **Apple product posture:** start from the operator's lived experience, desired confidence, and terminal flow first. Only then choose implementation details. Product clarity beats internal elegance.
- **Bottom-up UX discipline:** define the exact first-run interaction, prompt wording, failure wording, and next-step wording before changing detection logic or abstractions.
- **CLI craft matters:** command behavior, prompt wording, help text, and error output must follow recognizable community patterns for developer tooling on macOS, Linux, and Windows terminals. Prefer short prompts, deterministic output, explicit next actions, and shell-neutral wording that still feels natural in bash/zsh/fish/PowerShell workflows.
- **No silent corruption:** if the operator enters something invalid or ambiguous, the CLI must stop, explain, and re-ask. Never continue with shifted answers. Never write a bad spec just because parsing technically succeeded.
- **Trust guardrails before coverage expansion:** when choosing between "recognize more stacks" and "prevent bad output on bad input", guardrails come first.
- **Primary-source validation:** every P0 change must be validated with at least one real smoke test that simulates an operator in a terminal, not only unit tests.

---

## North Star UX

The operator should be able to:

1. drop the framework into a repo,
2. answer a few questions,
3. run **one** command,
4. trust the output.

Every priority below removes friction from one of those four steps.

---

Previous P0 (first-run resilience) is closed as of 2026-04-13. Shipped locally in the current unreleased work with:

- detection parity for the publicly advertised ecosystems (`.NET`, Rust, Go, Java, Ruby, PHP, Dart/Flutter),
- explicit greenfield picker guardrails (`valid choice`, `skip`, or `abort`; no silent fallthrough),
- pre-write confirmation before `canonical-spec.yaml` is written,
- actionable GitHub `add-skill` path errors,
- explicit overwrite protection for existing specs in piped and scripted flows,
- automated regression coverage plus operator-style smoke validation.

See `CHANGELOG.md` for the release-facing summary.

---

## P0 — Layered specs that an operator can reason about

**User outcome:** "I can share one base across packages and override only what differs, and I always know which layer owns which rule."

This is the next highest-leverage priority for real users because the first onboarding win is now trustworthy, but team adoption breaks down as soon as one repository has multiple packages, apps, or services. The merge engine and `extends` writeback are shipped and tested. What remains is operator-facing clarity for monorepos: an example they can copy, errors that name the offending layer, and one page of documentation that makes ownership boundaries obvious.

What to build:

- one fully-worked monorepo example (under `specs/examples/monorepo/`) operators can copy as a template, with two packages extending one base,
- validation errors that point to the **layer** that introduced the problem, not just the merged result,
- a single `docs/layered-specs.md` covering: who owns what, how `import-skill`/`intake`/`update-skills` write to the leaf only, what happens when overlays collide, when to use `--base` with `infer-overlay`,
- explicit, documented ownership semantics inside the example (comments in the YAML files showing primary vs secondary slice).

Priority guidance for agents:

- Start from the operator's question: "Which file do I edit for this change?" If the UX does not answer that immediately, the implementation is not done.
- Optimize for the first serious monorepo use case: one shared base, one frontend package, one backend package. Solve that flow completely before broadening to exotic layering shapes.
- Every validation or mutation command touching layered specs must name the owning file in the error or success path.
- Prefer one copyable end-to-end example over abstract documentation.

Done when:

- the monorepo example renders correctly end-to-end with a single `sync` per package,
- a layered validation failure tells the operator which file to open,
- `docs/layered-specs.md` exists and is linked from `README.md`.

Non-goal:

- no generic "magical" deep merge.

---

## P1 — Predictable skills across every agent

**User outcome:** "A skill behaves the same way in Claude, Cursor, Copilot, and the others — or the tool tells me clearly when it cannot."

What to build:

- richer, conservative activation metadata: `triggers`, `globs`, `alwaysApply`, `manualOnly`, `relatedSkills`,
- stronger `compatibility` validation with operator-facing warnings when a skill cannot be faithfully projected to a target,
- explicit projection rules into Cursor and inline-summary targets, documented per agent,
- a one-page operator reference that maps every activation field to how each supported agent interprets it.

Done when:

- the same skill produces equivalent behavior across supported agents, or the tool surfaces the gap before render,
- compatibility warnings name the agent, the field, and the safe alternative,
- the operator reference exists and is linked from `README.md`.

Non-goals:

- no silent downgrades of activation semantics during projection,
- no agent-specific hacks embedded in the canonical spec.

---

## P2 — Trust signals for teams

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

## P3 — Useful beyond software

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
