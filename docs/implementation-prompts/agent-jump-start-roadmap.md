# Agent Jump Start: Next Development Roadmap

## Purpose

This document is a local-only roadmap for the next development cycle.

It must stay:

- future-facing,
- concise,
- readable by a coding assistant without extra context,
- focused on the next practical implementation decisions.

It must not become:

- release notes,
- a history log,
- a duplicate of commit history,
- a checklist of already-shipped work.

## Current Product Position

Agent Jump Start is now strong enough for:

- a single repository,
- a single team,
- small multi-agent teams with one shared governance layer,
- early base-plus-overlay setups where one leaf spec extends one shared base spec.

Agent Jump Start is still weak or only partially adequate for:

- monorepos with multiple packages and different local policies,
- multiple teams sharing a common base but needing controlled overrides,
- environments with strong change control, auditability, and CI enforcement.

Current interpretation:

- `update-skills` is good enough to justify release after small hardening,
- the next real structural bottleneck is no longer basic layering or writeback safety, but operator clarity for multi-layer ownership and governance,
- the next development phase must focus on scale, layering, and operational trust.

## Product Goal

Move Agent Jump Start toward:

`a robust operator layer for repository memory, portable skills, and multi-agent governance`

That means the tool should become:

- easier to operate for individuals,
- reproducible and auditable for teams,
- scalable across packages and teams,
- operationally trustworthy in CI and release workflows,
- useful for both software and non-software repeatable work.

## Plain-English Meaning

### layered specs

Plain-English meaning:

- "Support one shared base memory plus more specific overlays for packages, workspaces, or local environments."

### enterprise hardening

Plain-English meaning:

- "Make the tool safe to adopt in professional teams with CI, releases, ownership boundaries, and migration expectations."

## Next Development Sequence

### P1. Layered Specs Hardening and Monorepo Governance

This is the next true structural priority.

Why this matters:

- it unlocks intra-team and multi-team scalability,
- it removes the single-spec bottleneck,
- it makes the tool viable in larger repositories without copy-paste governance forks.

Build next:

- explicit ownership semantics for inherited vs leaf-owned skills,
- optional local overlay policy,
- subtree-aware rendering where target ecosystems support it,
- fixture coverage for multi-layer base/workspace/local combinations,
- operator-facing documentation for how teams should structure overlays,
- clear lockfile and provenance behavior when overlays inherit or replace skills.

Before calling P1 done:

- skill workflows must define whether ownership lives in the base layer, the overlay layer, or both
- workflows that mutate spec content must document when they materialize changes into the leaf instead of mutating a base layer
- lockfile and provenance behavior must stay understandable when overlays inherit or replace skills
- monorepo rendering boundaries must be understandable to operators without reading source code

Minimum acceptance criteria:

- a base spec can be extended without duplicating the whole configuration,
- overlay behavior is deterministic and documented,
- no hidden deep-merge behavior,
- generated outputs stay debuggable,
- ownership boundaries between base and overlay layers are understandable,
- validation failures are surfaced at the layer that introduced the problem,
- skill export and refresh workflows behave predictably with overlays,
- mutating workflows have explicit and documented leaf-vs-base materialization semantics,
- one documented monorepo example demonstrates the intended operator model end to end.

Important non-goal:

- do not ship generic magical deep merge behavior.

## Cross-Cutting Priorities For Professional And Enterprise Adoption

These are not side notes. They should shape every major implementation from P1 onward.

### release and compatibility contract

Define clearly:

- what is stable,
- what may break across releases,
- how `canonical-spec.yaml`, lockfile, and rendered outputs are versioned,
- what compatibility promise exists for minor vs major releases.

### CI adoption path

Build a team-ready validation path:

- fixture repository strategy,
- golden output snapshots,
- smoke tests for `sync`,
- smoke tests for `doctor`,
- smoke tests for `update-skills`,
- clear CI examples for adopters.

### governance model

Define ownership and change boundaries:

- who owns the base spec,
- who owns package or workspace overlays,
- how local overrides are allowed,
- how teams avoid editing the same governance layer unnecessarily.

### provenance policy

Define what happens when:

- a source disappears,
- a slug changes,
- a source becomes ambiguous,
- a provider resolves a different artifact than before.

### migration policy

Define safe evolution for:

- schema changes,
- lockfile format changes,
- rendering changes,
- migration steps for existing repositories.

## Secondary Priorities After P1

### P2. Stronger Activation Metadata and Projection

Why this matters:

- skill behavior should become more predictable across clients,
- portability improves when activation metadata is explicit and conservative,
- better projections reduce surprising behavior across ecosystems.

Build next:

- richer support for `triggers`,
- richer support for `globs`,
- better handling of `alwaysApply`,
- better handling of `manualOnly`,
- support for `relatedSkills`,
- stronger `compatibility` validation,
- more explicit projection into Cursor and inline-summary targets.

### P3. Enterprise Hardening

Why this matters:

- enterprise teams adopt stable workflows, not clever demos,
- the tool needs trust signals beyond passing local tests,
- release and CI clarity matter as much as renderer correctness.

Build next:

- official GitHub Actions workflow,
- fixture-driven regression coverage,
- release checklist,
- operator documentation for team adoption,
- migration notes for spec and lockfile evolution.

### P4. Non-Developer and Cross-Discipline Expansion

Why this matters:

- the core model is useful beyond software delivery,
- broader operational use cases increase product appeal without reducing rigor,
- reusable non-code governance examples strengthen positioning.

Build next:

- starter profiles for product specification work,
- starter profiles for technical documentation,
- starter profiles for research synthesis,
- starter profiles for support and runbook governance,
- starter profiles for operational review workflows,
- serious non-code example skills that are structured and testable.

## Release Guidance

Short version:

- `update-skills` is strong enough to justify a release after small hardening,
- there is no need to wait for layered specs before distributing a new minor version,
- P1 layered specs plus operational hardening are the next real steps required for team and enterprise suitability,
- do not treat layered specs as fully mature until overlay ownership policy and monorepo operator guidance are complete.

## Guidance For The Next Coding Assistant

If you continue development from this branch:

1. keep the roadmap future-only,
2. treat overlay ownership policy and monorepo operator guidance as the main bottleneck to solve,
3. prefer operator clarity over clever automatic behavior,
4. keep enterprise adoption concerns visible during design,
5. avoid adding convenience features that increase ambiguity before governance layering exists.
