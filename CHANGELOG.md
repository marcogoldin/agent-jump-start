# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical entries before `v1.13.1` were reconstructed from Git history, existing
tags, and published release notes. Early development did not tag every release,
so versions are documented only where the history provides clear evidence.

## [Unreleased]

## [1.17.1] - 2026-04-16

### Fixed

- Fixed repeated `sync` prompts for imported skill package files under `references/`, `scripts/`, and `assets/`: once a prior render has recorded those paths in `docs/agent-jump-start/generated-manifest.json`, subsequent sync runs now treat them as Agent Jump Start-managed even though the file payload itself cannot always embed an inline provenance marker.
- Fixed interactive overwrite protection UX so real unmanaged collisions are prompted per conflict group instead of per file: mirrored skill-package paths are grouped by skill slug, while other conflicts are grouped by root such as `.github`, `.claude`, `.agents`, or the workspace root.

### Added

- Added regression coverage for repeated `import-skill -> sync -> sync` runs so mirrored skill package files remain idempotent without `--force`.
- Added regression coverage for grouped conflict prompting so one interactive decision now applies to an entire skill-package mirror set or root-level target group.

## [1.17.0] - 2026-04-16

### Fixed

- Fixed `import-skill`, `add-skill`, `intake`, and related skill-import flows failing with `scripts[<n>].name must be a valid filename` when a skill's bundled `references/`, `scripts/`, or `assets/` directory contained dotfiles (e.g. `.python-version`, `.DS_Store`, `.gitignore`) left behind by third-party packaging tools such as `skillfish`.
- Fixed the same flows failing with `<section>[<n>].content must be a non-empty string` when a bundled directory contained empty placeholder files (e.g. a 0-byte `README.md`). Dotfiles and empty files are now skipped silently at the read boundary; the spec validation contract remains strict and unchanged.

### Added

- Added regression coverage for dotfile and empty-file filtering during `import-skill` on directory skill sources (new test in `tests/agent-jump-start.test.mjs`).

## [1.16.1] - 2026-04-16

### Fixed

- Fixed `TOOL_VERSION` constant that was not bumped in the 1.16.0 release, causing `--version` to report v1.15.0.

## [1.16.0] - 2026-04-16

### Added

- Added overwrite protection for `init`, `sync`, and `render`: pre-existing agent instruction files (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, Cursor/Windsurf/Cline/Roo/Continue/Aider targets) are now detected by the absence of the Agent Jump Start provenance marker and are never silently overwritten.
- Added `--force`, `--backup`, and `--keep-existing` flags to `init`, `sync`, and `render` so operators can explicitly opt in to overwriting, to a timestamped `.ajs-backup-<stamp>` copy before overwrite, or to preserving their own files and skipping those targets.
- Added interactive per-file prompts (keep / overwrite / backup-then-overwrite) for TTY sessions when none of the conflict flags are set.
- Added `generatedBy` stamp to the generated manifest so provenance detection works on JSON artifacts as well as Markdown/MDC outputs.
- Added unit coverage for ownership classification, decision application, and flag parsing, plus a dedicated operator-style smoke at `scripts/ci/smoke-preserve-unmanaged-files.mjs` (`npm run smoke:preserve`).
- Added P0 propagation support for additional mainstream instruction targets: `GEMINI.md`, `.amazonq/rules/general.md`, `.junie/AGENTS.md`, `.junie/guidelines.md`, `.github/instructions/general.instructions.md`, `.windsurf/rules/general.md`, `.clinerules/general.md`, `AGENT.md`, and `.roorules`.
- Added broader discovery signal coverage for pre-existing instruction formats including `.github/instructions/**/*.instructions.md`, `.windsurf/rules/**/*.{md,txt}`, `.clinerules/**/*.{md,txt}`, `.amazonq/rules/**/*.md`, and Junie guideline directories.
- Added validation/schema compatibility identifiers for new agent clients: `gemini-cli`, `amazon-q`, and `junie`.
- Added `absorb` command for guided assimilation of pre-existing instruction files into canonical spec state, with interactive review and non-interactive `--dry-run` / `--apply --selection` modes.
- Added new absorb pipeline modules: `lib/absorb/discovery.mjs`, `lib/absorb/extraction.mjs`, and `lib/absorb/proposal.mjs`.
- Added dedicated absorb regression coverage (`tests/absorb.test.mjs`) and operator smoke (`scripts/ci/smoke-absorb.mjs`, `npm run smoke:absorb`).
- Added shared agent target registry (`lib/agent-targets.mjs`) as single source of truth for display catalog, render targets, and discovery rules.

### Changed

- Non-interactive `init`, `sync`, and `render` now fail closed with an actionable message when unmanaged pre-existing files are present, rather than silently rewriting them.
- The generated-manifest list omits paths explicitly preserved via `--keep-existing`, so future `cleanStaleFiles` runs never delete operator-authored content.
- Updated supported-agent metadata, CLI help output, review-checklist references, and README coverage docs to reflect the expanded propagation/discovery matrix.
- Updated trust-preservation tests and smokes to assert guardrails on the newly supported agent file paths.
- Updated Cline projection behavior to prefer `.clinerules/general.md` while automatically falling back to legacy `.clinerules` when that root file already exists.
- Updated refusal UX for unmanaged file collisions to include explicit absorb bridge guidance from `init`, `sync`, and `render`.
- Updated vendored `init` file-copy surface so absorb modules and command handler are included in scaffolded toolkit copies.

## [1.15.0] - 2026-04-14

### Added

- Added broader onboarding stack detection for `.NET`, Rust, Go, Java, Ruby, PHP, and Dart/Flutter so existing repositories no longer fall back to a greenfield prompt when the project shape is already obvious.
- Added runtime-based baseline validation seeding for detected ecosystems that do not expose explicit scripts yet, including `dotnet test`, `cargo test`, `go test ./...`, Maven/Gradle, Bundler, Composer, and Flutter defaults.
- Added a numbered greenfield starter picker with curated categories and a pre-write confirmation screen that lets operators review or edit key draft fields before the canonical spec is written.
- Added a copyable layered-spec monorepo example under `specs/examples/monorepo/` with one shared base and realistic `web` and `api` leaf specs.
- Added a dedicated `docs/layered-specs.md` operator guide covering ownership, writeback semantics, merge rules, `infer-overlay --base`, and common layered-spec pitfalls.

### Changed

- Tightened first-run guided onboarding so the greenfield stack picker now requires an explicit valid choice, `skip`, or `abort` instead of silently degrading after repeated invalid input.
- Expanded the final guided confirmation step so operators can edit runtime rules, package manager rules, validation commands, and checklist presence in addition to name, summary, and components.
- Improved GitHub `add-skill` recovery messages so missing tree paths now identify the missing remote path and ref, list available top-level folders, and suggest `--skill <slug>` for ambiguous cases.
- Made layered-spec validation output operator-facing by printing the full layer chain and, on success, the leaf writeback target.
- Made `import-skill`, `add-skill`, `intake --import`, and `update-skills` announce the leaf-only writeback contract before modifying a layered spec.
- Expanded the README with a dedicated layered-specs section that links the operator guide and copyable monorepo example.

### Fixed

- Fixed `init` overwrite protection so piped and scripted runs stop safely when a canonical spec already exists unless `--overwrite` is passed explicitly.
- Fixed the last remaining P0 trust gap where a failed starter selection could still produce a weak generic spec and appear successful.
- Fixed onboarding for first-run repos advertised as supported stacks but previously undetected by the introspector, especially `.NET` solution layouts.
- Fixed GitHub URL skill-import failures that previously leaked temporary clone paths instead of giving the operator an actionable recovery path.
- Fixed layered-spec validation errors so they now attribute failures to the owning layer instead of only naming the merged result.
- Fixed vendored `init` scaffolding so the new layered diagnostics module is copied alongside the rest of the CLI runtime.
- Fixed README/test metadata drift by documenting the current 213-test release surface and shipping the layered-spec operator guide in the npm package.

## [1.14.1] - 2026-04-13

### Changed

- Reworked the README opening around one clear first-run flow so new users can understand installation, onboarding, sync, and CI usage without stepping through duplicated sections.
- Made guided CLI choice prompts explicit by rendering labels such as `keep (Y), edit (e), skip (n)` and `keep all (Y), review one by one (r), skip all (n)` instead of opaque shortcut-only brackets.

### Fixed

- Fixed guided onboarding review prompts so operators can type descriptive words like `keep`, `edit`, `skip`, and `review` in addition to single-letter shortcuts.
- Reduced first-run onboarding ambiguity so terminal prompts explain the action before the shortcut instead of expecting the operator to infer letter meanings.

## [1.14.0] - 2026-04-12

### Added

- Made guided onboarding the default `init` experience so a first-time operator can bootstrap a useful draft spec without starting from a blank template.
- Added a curated greenfield preset tier for common starts including full-stack web, Next.js, FastAPI, Rails, and Flutter.
- Added broader cold-start stack normalization so operators can type human aliases such as `golang`, `ruby on rails`, `.net`, and `next.js` and still receive useful starter scaffolding.
- Added ownership-aware onboarding for detected components so mixed or monorepo-style projects surface primary and secondary slices more clearly during review.
- Added contextual trust summaries after guided setup that call out what the operator edited, what was skipped, and the exact next command to run.

### Changed

- Changed `init` so guided onboarding is now the default front door, while `--non-interactive` preserves the classic CI-friendly placeholder flow.
- Reworked suggestion review to scale better on larger repositories with grouped keep-all / review / skip-all decisions for repeated sources such as `package.json` scripts.
- Tightened greenfield onboarding copy so operators see a small curated path first instead of an undifferentiated list of every preset.
- Sharpened first-run trust messaging so the CLI distinguishes starter scaffolding from trusted, repo-specific memory more clearly.
- Completed the guided onboarding rollout and moved layered spec support into the standard documented workflow.

### Fixed

- Fixed onboarding friction in empty repositories by seeding runtime, validation, and workspace-rule drafts from curated presets and normalized stack choices instead of leaving operators with low-value placeholders.
- Fixed mixed-runtime suggestion ranking so component review is less noisy and more useful when multiple slices are detected in one workspace.
- Fixed bulk review grouping so repeated validation commands from `package.json` scripts are treated as one operator decision instead of a long sequence of near-identical prompts.

## [1.13.1] - 2026-04-12

### Added

- Added a root `CHANGELOG.md` in Keep a Changelog format and backfilled the documented release history.
- Added a dedicated `single-command-trust` GitHub Actions workflow and a matching end-to-end smoke script for `init -> sync -> check`.
- Added regression coverage for real operator drift cases including deleted outputs, hand-edited generated files, skill renames, stale lockfiles, and broken symlinks.

### Changed

- Improved `sync` and `check` failure output to name the offending file, explain the cause, and suggest the next operator action.
- Updated the generated manifest so it tracks itself consistently, keeping cleanup and verification symmetric in a single `sync` run.

### Fixed

- Hardened `sync` so one invocation can repair common workspace drift without requiring a second manual run.

## [1.13.0] - 2026-04-10

### Added

- Added assisted bootstrap inference to draft spec-compatible project guidance from repository evidence.
- Added the `infer-overlay` command to emit executable layered overlays separately from provenance-rich inference reports.

### Changed

- Modularized the CLI dispatcher into dedicated command handlers without changing the core workflow model.
- Expanded automated coverage across inference, overlay generation, layered specs, sync, doctor, and skill workflows.

## [1.12.0] - 2026-04-10

### Added

- Added an external skill intake workflow for discovering and importing local skill packages into the canonical spec.

### Fixed

- Preserved upstream provenance during intake replace operations instead of degrading managed skills to local-only sources.
- Hardened local skill discovery and sync flows against broken symlinks.

## [1.11.1] - 2026-04-09

### Changed

- Published a follow-up release for the `v1.11.x` line after the layered-specs and sync tooling rollout.

## [1.11.0] - 2026-04-09

### Added

- Added the `sync` command to render, clean, and verify generated agent instructions in one workflow.
- Added the `doctor` command to diagnose weak or placeholder scaffold content.
- Added lockfile-backed provenance tracking for imported skills.
- Added the `update-skills` workflow for refreshing previously imported skills from their recorded sources.
- Added layered spec merging with safe writeback semantics for overlays.

### Changed

- Tightened layered-spec writeback behavior so mutating commands preserve ownership boundaries between base and leaf specs.
- Cleaned internal planning references out of the README and kept the documentation focused on shipped behavior.

## [1.10.2] - 2026-04-08

### Fixed

- Hardened `skillfish` skill import handling and aligned the README guidance with the supported workflow.

## [1.10.1] - 2026-04-08

### Changed

- Published a follow-up release for guided onboarding after the `v1.10.0` feature rollout.

## [1.10.0] - 2026-04-08

### Added

- Added guided interactive onboarding with project introspection to help operators generate a first draft spec more quickly.
- Added high-level skill source adapters to normalize intake from multiple skill providers.

## [1.9.0] - 2026-04-08

### Added

- Added trigger and activation metadata for cross-client skill projection, including richer projection support across agent ecosystems.

## [1.8.2] - 2026-04-06

### Changed

- Aligned scoped npm package metadata and CLI documentation for the published package.

## [1.8.1] - 2026-04-05

### Fixed

- Corrected prohibition tagging so it derives from rule text instead of section names, preserving mixed constraint fidelity during skill import and render.

## [1.8.0] - 2026-04-05

### Added

- Added canonical `.agents` workspace governance mirrors and made canonical `.agents` skill packages the source for downstream mirrors.
- Added portable skill package workflows, including progressive-disclosure support for `references/`, `scripts/`, and `assets/`.
- Added support for importing external skills while preserving their semantics across render and export workflows.

### Changed

- Modularized the generator internals to support portable skill packaging and canonical mirror projection.

## [1.2.0] - 2026-03-17

### Added

- Initial public release of Agent Jump Start with synchronized instruction generation for nine agent targets.
- Added the `init` command, canonical spec validation, stale cleanup, a C/C++ profile, and the first `import-skill` and skill validation workflows.

### Changed

- Migrated the project license from MIT to MPL-2.0 during the initial public setup period.

[Unreleased]: https://github.com/marcogoldin/agent-jump-start/compare/v1.15.0...HEAD
[1.15.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.14.1...v1.15.0
[1.14.1]: https://github.com/marcogoldin/agent-jump-start/compare/v1.14.0...v1.14.1
[1.14.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.13.1...v1.14.0
[1.13.1]: https://github.com/marcogoldin/agent-jump-start/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.11.1...v1.12.0
[1.11.1]: https://github.com/marcogoldin/agent-jump-start/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.10.2...v1.11.0
[1.10.2]: https://github.com/marcogoldin/agent-jump-start/compare/v1.10.1...v1.10.2
[1.10.1]: https://github.com/marcogoldin/agent-jump-start/compare/v1.10.0...v1.10.1
[1.10.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/marcogoldin/agent-jump-start/compare/v1.8.2...v1.9.0
[1.8.2]: https://github.com/marcogoldin/agent-jump-start/compare/v1.8.1...v1.8.2
[1.8.1]: https://github.com/marcogoldin/agent-jump-start/compare/0512572...v1.8.1
[1.8.0]: https://github.com/marcogoldin/agent-jump-start/compare/41777a1...0512572
[1.2.0]: https://github.com/marcogoldin/agent-jump-start/commit/41777a1
