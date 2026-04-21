// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Parity regression for P0-C.1: `validate-skill` must agree with `intake`.
// If `validate-skill` exits 0, `intake` must accept the skill.
// If `intake` would reject the skill, `validate-skill` must also fail and
// report the same canonical errors.

import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// Title-case names from external ecosystems should be normalized into canonical
// slugs automatically so the operator does not need to edit SKILL.md by hand.
const TITLE_CASE_NAME_SKILL_MD = `---
name: Thin Skill
description: A skill with a title-case name that should canonicalize to thin-skill automatically.
---

# Thin Skill

## Best Practices

- Keep tests deterministic.
`;

// Passes frontmatter validation but fails canonical validation because trigger
// metadata is internally contradictory. This keeps the "structurally-valid but
// not import-compatible" path covered after slug normalization became automatic.
const CONTRADICTORY_TRIGGER_SKILL_MD = `---
name: contradictory-skill
description: A skill whose trigger metadata is contradictory.
alwaysApply: true
manualOnly: true
---

# Contradictory Skill

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
    assert.match(result.stdout, /canonical import will accept this skill\./);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill normalizes title-case names and accepts a canonical import-compatible skill", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "thin-skill");
    writeSkillMd(skillDir, TITLE_CASE_NAME_SKILL_MD);

    const result = runCli(["validate-skill", skillDir]);
    assert.equal(result.status, 0, `validate-skill should auto-normalize title-case names.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /import-compatible/);
    assert.match(result.stdout, /slug: thin-skill/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill fails with structurally-valid verdict when frontmatter is OK but canonical reconstruction is not", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "contradictory-skill");
    writeSkillMd(skillDir, CONTRADICTORY_TRIGGER_SKILL_MD);

    const result = runCli(["validate-skill", skillDir]);
    assert.notEqual(result.status, 0, "validate-skill must reject skills that canonical import would reject");
    assert.match(result.stderr, /structurally valid but NOT import-compatible/);
    assert.match(result.stderr, /Canonical import would reject this skill/);
    assert.match(result.stderr, /alwaysApply and manualOnly cannot both be true/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill --frontmatter-only keeps the legacy behavior for the same thin skill", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "thin-skill");
    writeSkillMd(skillDir, TITLE_CASE_NAME_SKILL_MD);

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

test("validate-skill on a standalone .md file runs canonical import compatibility by default", () => {
  const tempDir = makeTempDir();
  try {
    const mdFile = join(tempDir, "standalone.md");
    writeFileSync(mdFile, TITLE_CASE_NAME_SKILL_MD, "utf8");

    const result = runCli(["validate-skill", mdFile]);
    assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /import-compatible/);
    assert.match(result.stdout, /slug: thin-skill/);
    assert.doesNotMatch(result.stdout, /frontmatter stage/);
  } finally {
    cleanup(tempDir);
  }
});

test("validate-skill --frontmatter-only on a standalone .md file preserves the legacy frontmatter-only path", () => {
  const tempDir = makeTempDir();
  try {
    const mdFile = join(tempDir, "standalone.md");
    writeFileSync(mdFile, TITLE_CASE_NAME_SKILL_MD, "utf8");

    const result = runCli(["validate-skill", mdFile, "--frontmatter-only"]);
    assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /frontmatter validation passed/);
    assert.match(result.stdout, /--frontmatter-only skipped canonical import-compatibility check/);
  } finally {
    cleanup(tempDir);
  }
});

test("import-skill accepts a standalone SKILL.md whose name needs slug normalization", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "standalone.md");
    writeFileSync(skillMdPath, TITLE_CASE_NAME_SKILL_MD, "utf8");
    const specPath = join(tempDir, "spec.json");
    writeFileSync(specPath, JSON.stringify({
      schemaVersion: 1,
      project: { name: "demo", summary: "demo" },
      workspaceInstructions: {
        packageManagerRule: "use existing",
        runtimeRule: "keep runtimes aligned",
        sections: [{ title: "General", rules: ["Keep changes small."] }],
      },
      skills: [],
    }), "utf8");

    const result = runCli(["import-skill", "--spec", specPath, "--skill", skillMdPath]);
    assert.equal(result.status, 0, `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills[0].slug, "thin-skill");
    assert.equal(spec.skills[0].title, "Thin Skill");
  } finally {
    cleanup(tempDir);
  }
});

test("inspectSkillSource reports the same verdicts via the shared helper", async () => {
  const tempDir = makeTempDir();
  try {
    const { inspectSkillDirectory, inspectSkillSource } = await import("../lib/intake.mjs");

    const importable = join(tempDir, "demo-skill");
    writeSkillMd(importable, MINIMAL_IMPORT_COMPATIBLE_SKILL_MD);
    const a = inspectSkillDirectory(importable);
    assert.equal(a.status, "import-compatible");
    assert.equal(a.skill.slug, "demo-skill");

    const thin = join(tempDir, "thin-skill");
    writeSkillMd(thin, TITLE_CASE_NAME_SKILL_MD);
    const b = inspectSkillDirectory(thin);
    assert.equal(b.status, "import-compatible");
    assert.equal(b.skill.slug, "thin-skill");

    const broken = join(tempDir, "broken-skill");
    writeSkillMd(broken, MISSING_DESCRIPTION_SKILL_MD);
    const c = inspectSkillDirectory(broken);
    assert.equal(c.status, "frontmatter-invalid");
    assert.ok(c.errors.some((e) => /description is required/.test(e)));

    const contradictoryFile = join(tempDir, "standalone.md");
    writeFileSync(contradictoryFile, CONTRADICTORY_TRIGGER_SKILL_MD, "utf8");
    const d = inspectSkillSource(contradictoryFile);
    assert.equal(d.status, "structurally-valid");
    assert.ok(d.errors.some((e) => /alwaysApply and manualOnly cannot both be true/.test(e)));
  } finally {
    cleanup(tempDir);
  }
});
