// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Parity regression for P0-C.1: `validate-skill` must agree with `intake`.
// If `validate-skill` exits 0, `intake` must accept the skill.
// If `intake` would reject the skill, `validate-skill` must also fail and
// report the same canonical errors.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = resolve("scripts/agent-jump-start.mjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "agent-jump-start-validate-skill-"));
}

function cleanup(path) {
  rmSync(path, { recursive: true, force: true });
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

function writeSkillMd(skillDir, body) {
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), body, "utf8");
}

// A SKILL.md with a non-NON_RULE_SECTIONS section containing a bullet
// produces at least one category + one rule, which is the minimum canonical
// shape validateSkill() requires.
const MINIMAL_IMPORT_COMPATIBLE_SKILL_MD = `---
name: demo-skill
description: A demo skill used as a parity fixture for validate-skill tests.
---

# Demo Skill

## Best Practices

- Keep tests deterministic and independent of network access.
`;

// Passes frontmatter validation (name is a non-empty string) but the
// reconstructed canonical slug fails the strict `^[a-z0-9]+(?:-[a-z0-9]+)*$`
// check that intake's validateSkill() enforces. This mirrors the real-world
// skillfish-style gap where ecosystems use title-case display names that
// Agent Jump Start would then reject at import time — the exact trust breach
// P0-C.1 exists to close.
const FRONTMATTER_ONLY_SKILL_MD = `---
name: Thin Skill
description: A skill with a title-case name that passes frontmatter but fails canonical slug validation.
---

# Thin Skill

## Best Practices

- Keep tests deterministic.
`;

const MISSING_DESCRIPTION_SKILL_MD = `---
name: broken-skill
---

# Broken Skill

## Practices

- Body content, but frontmatter is missing required fields.
`;

test("validate-skill exits 0 and matches intake acceptance for an import-compatible skill", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "demo-skill");
    writeSkillMd(skillDir, MINIMAL_IMPORT_COMPATIBLE_SKILL_MD);

    const result = runCli(["validate-skill", skillDir]);
    assert.equal(result.status, 0, `validate-skill should accept import-compatible skill.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /import-compatible/);
    assert.match(result.stdout, /slug: demo-skill/);
    assert.match(result.stdout, /intake --import will accept this skill\./);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill fails with structurally-valid verdict when frontmatter is OK but canonical reconstruction is not", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "thin-skill");
    writeSkillMd(skillDir, FRONTMATTER_ONLY_SKILL_MD);

    const result = runCli(["validate-skill", skillDir]);
    assert.notEqual(result.status, 0, "validate-skill must reject skills that intake would reject");
    assert.match(result.stderr, /structurally valid but NOT import-compatible/);
    assert.match(result.stderr, /Intake --import would reject this skill/);
    // The canonical error is "slug must be lowercase and use hyphens only" —
    // check that the stage-2 reason surfaces so the operator knows exactly
    // what intake would reject.
    assert.match(result.stderr, /slug must be lowercase/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill --frontmatter-only keeps the legacy behavior for the same thin skill", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "thin-skill");
    writeSkillMd(skillDir, FRONTMATTER_ONLY_SKILL_MD);

    const result = runCli(["validate-skill", skillDir, "--frontmatter-only"]);
    assert.equal(result.status, 0, `--frontmatter-only must preserve legacy behavior.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /frontmatter validation passed/);
    assert.match(result.stdout, /--frontmatter-only skipped canonical import-compatibility check/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill fails with frontmatter-invalid verdict when description is missing", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "broken-skill");
    writeSkillMd(skillDir, MISSING_DESCRIPTION_SKILL_MD);

    const result = runCli(["validate-skill", skillDir]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /invalid or missing SKILL\.md frontmatter/);
    assert.match(result.stderr, /description is required/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill on a standalone .md file runs frontmatter-only with an explanatory note", () => {
  const tempDir = makeTempDir();
  try {
    const mdFile = join(tempDir, "standalone.md");
    writeFileSync(mdFile, MINIMAL_IMPORT_COMPATIBLE_SKILL_MD, "utf8");

    const result = runCli(["validate-skill", mdFile]);
    assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /frontmatter validation passed/);
    assert.match(result.stdout, /standalone \.md files can only be validated at the frontmatter stage/);
  } finally {
    cleanup(tempDir);
  }
});

test("inspectSkillDirectory reports the same verdicts via the shared helper", async () => {
  const tempDir = makeTempDir();
  try {
    const { inspectSkillDirectory } = await import("../lib/intake.mjs");

    const importable = join(tempDir, "demo-skill");
    writeSkillMd(importable, MINIMAL_IMPORT_COMPATIBLE_SKILL_MD);
    const a = inspectSkillDirectory(importable);
    assert.equal(a.status, "import-compatible");
    assert.equal(a.skill.slug, "demo-skill");

    const thin = join(tempDir, "thin-skill");
    writeSkillMd(thin, FRONTMATTER_ONLY_SKILL_MD);
    const b = inspectSkillDirectory(thin);
    assert.equal(b.status, "structurally-valid");
    assert.ok(Array.isArray(b.errors) && b.errors.length > 0);
    assert.ok(b.frontmatter, "frontmatter should be surfaced even when canonical rebuild fails");

    const broken = join(tempDir, "broken-skill");
    writeSkillMd(broken, MISSING_DESCRIPTION_SKILL_MD);
    const c = inspectSkillDirectory(broken);
    assert.equal(c.status, "frontmatter-invalid");
    assert.ok(c.errors.some((e) => /description is required/.test(e)));
  } finally {
    cleanup(tempDir);
  }
});
