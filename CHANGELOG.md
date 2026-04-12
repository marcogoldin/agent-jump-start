# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical entries before `v1.13.1` were reconstructed from Git history, existing
tags, and published release notes. Early development did not tag every release,
so versions are documented only where the history provides clear evidence.

## [Unreleased]

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
- Cleaned local roadmap references out of the README.

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

[Unreleased]: https://github.com/marcogoldin/agent-jump-start/compare/v1.13.1...HEAD
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
