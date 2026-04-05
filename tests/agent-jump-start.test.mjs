import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = resolve("scripts/agent-jump-start.mjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "agent-jump-start-"));
}

function cleanupTempDir(directoryPath) {
  rmSync(directoryPath, { recursive: true, force: true });
}

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
  });
}

function expectSuccess(result) {
  assert.equal(
    result.status,
    0,
    `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
}

function expectFailure(result) {
  assert.notEqual(result.status, 0, "Expected command to fail.");
}

function makeMinimalSpec(extra = {}) {
  return {
    schemaVersion: 1,
    project: { name: "Test", summary: "Test spec", components: [] },
    workspaceInstructions: {
      sections: [{ title: "General rules", rules: ["Keep changes small."] }],
      validation: ["npm test"],
    },
    reviewChecklist: {
      intro: "Checklist",
      failureThreshold: 1,
      items: [{ title: "Check" }],
    },
    ...extra,
  };
}

function writeSpec(tempDir, spec, filename = "spec.yaml") {
  const path = join(tempDir, filename);
  writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  return path;
}

function makeSkillFixture(overrides = {}) {
  return {
    slug: "test-skill",
    title: "Test Skill",
    description: "A test skill.",
    version: "1.0.0",
    appliesWhen: ["Testing"],
    categories: [{ priority: 1, name: "General", impact: "HIGH", prefix: "gen-" }],
    rules: [{
      id: "gen-1",
      category: "General",
      title: "Rule one",
      impact: "HIGH",
      summary: "First rule.",
    }],
    ...overrides,
  };
}

// ===========================================================================
// Core workflow tests
// ===========================================================================

test("render generates standards-aligned SKILL.md mirrors for native skill clients", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "canonical-spec.yaml");
    expectSuccess(
      runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--profile", "specs/profiles/react-vite-mui.profile.yaml", "--output", specPath]),
    );
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));

    const agentsSkill = readFileSync(join(tempDir, ".agents/skills/react-best-practices/SKILL.md"), "utf8");
    const claudeSkill = readFileSync(join(tempDir, ".claude/skills/react-best-practices/SKILL.md"), "utf8");
    const githubSkill = readFileSync(join(tempDir, ".github/skills/react-best-practices/SKILL.md"), "utf8");
    const legacyGuide = readFileSync(join(tempDir, ".agents/skills/react-best-practices/AGENTS.md"), "utf8");
    const copilotInstructions = readFileSync(join(tempDir, ".github/copilot-instructions.md"), "utf8");

    assert.match(agentsSkill, /name: "react-best-practices"/);
    assert.match(agentsSkill, /description: /);
    assert.match(agentsSkill, /## When to Use This Skill/);
    assert.match(claudeSkill, /## Detailed Guidance/);
    assert.match(githubSkill, /metadata:/);
    assert.equal(claudeSkill, agentsSkill);
    assert.equal(githubSkill, agentsSkill);
    assert.match(legacyGuide, /canonical, Agent Skills-compatible entrypoint/);
    assert.doesNotMatch(copilotInstructions, /## Skills/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("init followed by check passes without an extra render", () => {
  const tempDir = makeTempDir();
  try {
    expectSuccess(runCli(["init", "--target", tempDir]));
    const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
    const checkScript = join(tempDir, "docs/agent-jump-start/scripts/agent-jump-start.mjs");
    const checkResult = spawnSync(process.execPath, [checkScript, "check", "--spec", specPath, "--target", tempDir], { encoding: "utf8" });
    assert.equal(checkResult.status, 0, `init -> check should pass.\nSTDOUT:\n${checkResult.stdout}\nSTDERR:\n${checkResult.stderr}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("init with profile followed by check passes without an extra render", () => {
  const tempDir = makeTempDir();
  try {
    expectSuccess(runCli(["init", "--profile", "specs/profiles/react-vite-mui.profile.yaml", "--target", tempDir]));
    const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
    const checkScript = join(tempDir, "docs/agent-jump-start/scripts/agent-jump-start.mjs");
    const checkResult = spawnSync(process.execPath, [checkScript, "check", "--spec", specPath, "--target", tempDir], { encoding: "utf8" });
    assert.equal(checkResult.status, 0, `init with profile -> check should pass.\nSTDOUT:\n${checkResult.stdout}\nSTDERR:\n${checkResult.stderr}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("init copies lib/ modules for modular imports", () => {
  const tempDir = makeTempDir();
  try {
    expectSuccess(runCli(["init", "--target", tempDir]));
    const ajsDir = join(tempDir, "docs/agent-jump-start");
    assert.ok(existsSync(join(ajsDir, "lib/constants.mjs")), "lib/constants.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/utils.mjs")), "lib/utils.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/validation.mjs")), "lib/validation.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/renderers.mjs")), "lib/renderers.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/files.mjs")), "lib/files.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/skills.mjs")), "lib/skills.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/schema.mjs")), "lib/schema.mjs should exist");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Canonical governance tests (.agents/AGENTS.md)
// ===========================================================================

test(".agents/AGENTS.md is generated as the canonical workspace governance file", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const canonical = readFileSync(join(tempDir, ".agents/AGENTS.md"), "utf8");
    assert.match(canonical, /# Workspace Instructions/);
    assert.match(canonical, /Generated by Agent Jump Start/);
    // Canonical should NOT have a mirror notice
    assert.doesNotMatch(canonical, /compatibility mirror/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("root AGENTS.md, CLAUDE.md, and copilot-instructions.md are mirrors of .agents/AGENTS.md", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    for (const mirrorPath of ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"]) {
      const mirror = readFileSync(join(tempDir, mirrorPath), "utf8");
      assert.match(mirror, /compatibility mirror of.*\.agents\/AGENTS\.md/, `${mirrorPath} should reference canonical`);
      // Mirror should contain all the workspace content from canonical
      assert.match(mirror, /# Workspace Instructions/);
      assert.match(mirror, /General rules/);
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("agents without native skill folders get mirror notice plus inline skill summaries", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture()],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    for (const path of [".windsurfrules", ".clinerules", "CONVENTIONS.md"]) {
      const content = readFileSync(join(tempDir, path), "utf8");
      assert.match(content, /compatibility mirror of.*\.agents\/AGENTS\.md/, `${path} should reference canonical`);
      assert.match(content, /## Skills/, `${path} should include inline skill summaries`);
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

test(".agents/AGENTS.md appears in the generated manifest", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const manifest = JSON.parse(readFileSync(join(tempDir, "docs/agent-jump-start/generated-manifest.json"), "utf8"));
    assert.ok(manifest.files.includes(".agents/AGENTS.md"), "Manifest should include .agents/AGENTS.md");
    // It should appear before root AGENTS.md (canonical first)
    const canonicalIdx = manifest.files.indexOf(".agents/AGENTS.md");
    const rootIdx = manifest.files.indexOf("AGENTS.md");
    assert.ok(canonicalIdx < rootIdx, ".agents/AGENTS.md should sort before AGENTS.md in manifest");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test(".agents/AGENTS.md appears in review checklist references", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const checklist = readFileSync(join(tempDir, "docs/agent-review-checklist.md"), "utf8");
    assert.match(checklist, /\.agents\/AGENTS\.md/, "Review checklist should reference .agents/AGENTS.md");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Validation tests
// ===========================================================================

test("validate rejects rules that reference unknown categories", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "invalid-category",
        title: "Invalid Category",
        description: "Should fail validation.",
        rules: [{
          id: "unknown-ref",
          category: "Missing",
          title: "Bad rule",
          impact: "HIGH",
          summary: "This category does not exist.",
        }],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /references unknown category "Missing"/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects duplicate rule ids inside a skill", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "duplicate-rules",
        title: "Duplicate Rules",
        description: "Should fail validation.",
        rules: [
          { id: "same-id", category: "General", title: "Rule one", impact: "HIGH", summary: "First rule." },
          { id: "same-id", category: "General", title: "Rule two", impact: "MEDIUM", summary: "Second rule." },
        ],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /duplicate rule id "same-id"/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects duplicate category names", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "dup-cat",
        title: "Dup Cat",
        description: "Duplicate category names.",
        categories: [
          { priority: 1, name: "General", impact: "HIGH", prefix: "gen-" },
          { priority: 2, name: "General", impact: "MEDIUM", prefix: "gen2-" },
        ],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /duplicate category name "General"/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects empty appliesWhen", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "empty-applies", appliesWhen: [] })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /appliesWhen must be a non-empty array/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects invalid slug format", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "Invalid_Slug!" })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /slug must be lowercase/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("render does not emit undefined metadata when author is omitted", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "no-author", title: "No Author", description: "Skill without author." })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    const skillFile = readFileSync(join(tempDir, ".agents/skills/no-author/SKILL.md"), "utf8");
    assert.doesNotMatch(skillFile, /undefined/);
    assert.doesNotMatch(skillFile, /\nauthor:/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// References / multi-file skill tests
// ===========================================================================

test("validate accepts skills with valid references", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "with-refs",
        references: [
          { name: "guide.md", content: "# Guide\nSome content.", loadWhen: "Need guidance" },
          { name: "examples.md", content: "# Examples\nSome examples." },
        ],
      })],
    }));
    expectSuccess(runCli(["validate", "--spec", specPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects references with invalid filenames", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "bad-ref",
        references: [{ name: "../escape.md", content: "content" }],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /valid filename/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("render generates reference files in skill directories", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "ref-skill",
        references: [
          { name: "patterns.md", content: "# Patterns\nContent here.", loadWhen: "Design patterns" },
        ],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    // References should appear in all three skill directories
    for (const dir of [".agents", ".claude", ".github"]) {
      const refPath = join(tempDir, `${dir}/skills/ref-skill/references/patterns.md`);
      assert.ok(existsSync(refPath), `${dir} reference should exist`);
      const refContent = readFileSync(refPath, "utf8");
      assert.match(refContent, /# Patterns/);
    }

    // SKILL.md should contain a reference table
    const skillMd = readFileSync(join(tempDir, ".agents/skills/ref-skill/SKILL.md"), "utf8");
    assert.match(skillMd, /## Reference Guide/);
    assert.match(skillMd, /`references\/patterns\.md`/);
    assert.match(skillMd, /Design patterns/);

    const claudeSkillMd = readFileSync(join(tempDir, ".claude/skills/ref-skill/SKILL.md"), "utf8");
    const githubSkillMd = readFileSync(join(tempDir, ".github/skills/ref-skill/SKILL.md"), "utf8");
    assert.equal(claudeSkillMd, skillMd);
    assert.equal(githubSkillMd, skillMd);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("check passes for skills with references after render", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "check-refs",
        references: [{ name: "api.md", content: "# API\nAPI docs." }],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// SKILL.md import tests
// ===========================================================================

test("import-skill reads a SKILL.md directory with references", () => {
  const tempDir = makeTempDir();
  try {
    // Create a SKILL.md directory
    const skillDir = join(tempDir, "external-skill");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: imported-skill
description: An externally authored skill for import testing.
license: MIT
metadata:
  author: External Author
  version: "3.0.0"
  triggers: import, testing
---

# Imported Skill

An externally authored skill for import testing.

## When to Use This Skill

- Validating import workflows
- Testing SKILL.md parsing

## Guidelines

- Follow best practices
- Write tests first
`, "utf8");
    writeFileSync(join(skillDir, "references", "advanced.md"), "# Advanced\nAdvanced content.", "utf8");

    // Bootstrap a spec and import the skill
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    const importResult = runCli(["import-skill", "--spec", specPath, "--skill", skillDir]);
    expectSuccess(importResult);
    assert.match(importResult.stdout, /Added:.*imported-skill/);

    // Verify the imported skill structure
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    const skill = spec.skills[0];
    assert.equal(skill.slug, "imported-skill");
    assert.equal(skill.version, "3.0.0");
    assert.equal(skill.author, "External Author");
    assert.equal(skill.license, "MIT");
    assert.ok(skill.appliesWhen.length >= 2);
    assert.ok(skill.references?.length >= 1);
    assert.equal(skill.references[0].name, "advanced.md");
    assert.match(skill.references[0].content, /Advanced content/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import-skill reads a standalone SKILL.md file", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "standalone.md");
    writeFileSync(skillMdPath, `---
name: standalone-skill
description: A standalone skill with no directory.
metadata:
  version: "1.5.0"
  triggers: standalone
---

# Standalone Skill

A standalone skill with no directory.

## When to Use This Skill

- Quick skill imports
- Single-file skills
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillMdPath]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "standalone-skill");
    assert.equal(spec.skills[0].version, "1.5.0");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import-skill still works with JSON skill files", () => {
  const tempDir = makeTempDir();
  try {
    const skillJsonPath = join(tempDir, "json-skill.json");
    writeFileSync(skillJsonPath, JSON.stringify(makeSkillFixture({ slug: "json-skill", title: "JSON Skill" })), "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillJsonPath]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "json-skill");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Export skill tests
// ===========================================================================

test("export-skill creates a standalone SKILL.md package", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "export-test",
        title: "Export Test",
        description: "A skill for export testing.",
        author: "Test Author",
        license: "MIT",
      })],
    }));

    const outputDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "export-test", "--output", outputDir]));

    assert.ok(existsSync(join(outputDir, "SKILL.md")), "SKILL.md should be created");
    const skillMd = readFileSync(join(outputDir, "SKILL.md"), "utf8");
    assert.match(skillMd, /name: "export-test"/);
    assert.match(skillMd, /description: "A skill for export testing."/);
    assert.match(skillMd, /license: "MIT"/);
    assert.match(skillMd, /## When to Use This Skill/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("export-skill includes references when present", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "export-refs",
        references: [
          { name: "guide.md", content: "# Guide\nGuide content.", loadWhen: "Setup" },
          { name: "examples.md", content: "# Examples\nExamples here." },
        ],
      })],
    }));

    const outputDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "export-refs", "--output", outputDir]));

    assert.ok(existsSync(join(outputDir, "references/guide.md")));
    assert.ok(existsSync(join(outputDir, "references/examples.md")));
    const guide = readFileSync(join(outputDir, "references/guide.md"), "utf8");
    assert.match(guide, /Guide content/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("export-skill fails for non-existent slug", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({ skills: [] }));
    const result = runCli(["export-skill", "--spec", specPath, "--slug", "nonexistent", "--output", join(tempDir, "out")]);
    expectFailure(result);
    assert.match(result.stderr, /not found/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Import -> render -> check round-trip
// ===========================================================================

test("import SKILL.md -> render -> check round-trip", () => {
  const tempDir = makeTempDir();
  try {
    // Create external skill
    const skillDir = join(tempDir, "ext-skill");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: roundtrip
description: Skill for round-trip testing.
metadata:
  version: "1.0.0"
---

# Round Trip Skill

Skill for round-trip testing.

## When to Use This Skill

- Testing round-trips

## Rules

- Always validate imports
- Test the full cycle
`, "utf8");
    writeFileSync(join(skillDir, "references", "notes.md"), "# Notes\nSome notes.", "utf8");

    // Bootstrap, import, render, check
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", renderDir]));

    // Verify references were rendered
    assert.ok(existsSync(join(renderDir, ".agents/skills/roundtrip/references/notes.md")));
    assert.ok(existsSync(join(renderDir, ".claude/skills/roundtrip/references/notes.md")));
    assert.ok(existsSync(join(renderDir, ".github/skills/roundtrip/references/notes.md")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Export -> re-import round-trip
// ===========================================================================

test("export -> re-import round-trip preserves skill identity", () => {
  const tempDir = makeTempDir();
  try {
    const originalSkill = makeSkillFixture({
      slug: "roundtrip-export",
      title: "Roundtrip Export",
      description: "Test export and re-import.",
      author: "Tester",
      license: "MIT",
      references: [{ name: "ref.md", content: "# Ref\nContent." }],
    });
    const specPath = writeSpec(tempDir, makeMinimalSpec({ skills: [originalSkill] }));

    // Export
    const exportDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "roundtrip-export", "--output", exportDir]));

    // Re-import into a fresh spec
    const newSpecPath = join(tempDir, "new-spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", newSpecPath]));
    expectSuccess(runCli(["import-skill", "--spec", newSpecPath, "--skill", exportDir]));

    const newSpec = JSON.parse(readFileSync(newSpecPath, "utf8"));
    assert.equal(newSpec.skills.length, 1);
    const reimported = newSpec.skills[0];
    assert.equal(reimported.slug, "roundtrip-export");
    assert.equal(reimported.title, "Roundtrip Export");
    assert.equal(reimported.author, "Tester");
    assert.equal(reimported.license, "MIT");
    assert.ok(reimported.references?.length >= 1);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Schema export test
// ===========================================================================

test("export-schema produces valid JSON Schema", () => {
  const tempDir = makeTempDir();
  try {
    const schemaPath = join(tempDir, "schema.json");
    expectSuccess(runCli(["export-schema", "--output", schemaPath]));

    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.ok(schema.required.includes("schemaVersion"));
    assert.ok(schema.required.includes("project"));
    assert.ok(schema.$defs?.skill, "Schema should define skill type");
    assert.ok(schema.$defs?.skillReference, "Schema should define skillReference type");

    // Verify skill properties include references
    const skillProps = schema.$defs.skill.properties;
    assert.ok(skillProps.references, "Skill should have references property in schema");
    assert.ok(skillProps.slug, "Skill should have slug property in schema");
    assert.ok(skillProps.appliesWhen, "Skill should have appliesWhen property in schema");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Stale cleanup tests
// ===========================================================================

test("render --clean removes stale files from previous render", () => {
  const tempDir = makeTempDir();
  try {
    // First render with a skill
    const specWithSkill = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "temporary-skill" })],
    });
    const specPath = writeSpec(tempDir, specWithSkill);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    assert.ok(existsSync(join(tempDir, ".agents/skills/temporary-skill/SKILL.md")));

    // Second render without the skill, with --clean
    const specWithoutSkill = makeMinimalSpec({ skills: [] });
    writeSpec(tempDir, specWithoutSkill);
    const result = runCli(["render", "--spec", specPath, "--target", tempDir, "--clean"]);
    expectSuccess(result);
    assert.match(result.stdout, /Cleaned stale files/);
    assert.ok(!existsSync(join(tempDir, ".agents/skills/temporary-skill/SKILL.md")), "Stale skill file should be removed");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Validate-skill command tests
// ===========================================================================

test("validate-skill validates an external SKILL.md file", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "SKILL.md");
    writeFileSync(skillMdPath, `---
name: valid-external
description: A valid external skill.
---

# Valid External

Content here.
`, "utf8");
    expectSuccess(runCli(["validate-skill", skillMdPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate-skill rejects SKILL.md without frontmatter", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "SKILL.md");
    writeFileSync(skillMdPath, "# No Frontmatter\nJust content.\n", "utf8");
    const result = runCli(["validate-skill", skillMdPath]);
    expectFailure(result);
    assert.match(result.stderr, /missing.*frontmatter/i);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate-skill rejects SKILL.md without required name", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "SKILL.md");
    writeFileSync(skillMdPath, `---
description: Has description but no name.
---

# Missing Name
`, "utf8");
    const result = runCli(["validate-skill", skillMdPath]);
    expectFailure(result);
    assert.match(result.stderr, /name.*required/i);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate-skill works on a skill directory with references", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "skill-dir");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: dir-skill
description: A directory-based skill.
---

# Dir Skill

Content.
`, "utf8");
    writeFileSync(join(skillDir, "references", "guide.md"), "# Guide\nContent.", "utf8");
    expectSuccess(runCli(["validate-skill", skillDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Scripts support tests
// ===========================================================================

test("validate accepts skills with valid scripts", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "with-scripts",
        scripts: [
          { name: "setup.sh", content: "#!/bin/bash\necho hello", description: "Setup script" },
          { name: "lint.py", content: "import sys\nprint('ok')" },
        ],
      })],
    }));
    expectSuccess(runCli(["validate", "--spec", specPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects scripts with invalid filenames", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "bad-script",
        scripts: [{ name: "../escape.sh", content: "#!/bin/bash" }],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /valid filename/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("render generates script files in skill directories", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "script-skill",
        scripts: [
          { name: "setup.sh", content: "#!/bin/bash\necho setup", description: "Run setup" },
        ],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    // Scripts should appear in all three skill directories
    for (const dir of [".agents", ".claude", ".github"]) {
      const scriptPath = join(tempDir, `${dir}/skills/script-skill/scripts/setup.sh`);
      assert.ok(existsSync(scriptPath), `${dir} script should exist`);
      const scriptContent = readFileSync(scriptPath, "utf8");
      assert.match(scriptContent, /echo setup/);
    }

    // SKILL.md should contain a scripts table
    const skillMd = readFileSync(join(tempDir, ".agents/skills/script-skill/SKILL.md"), "utf8");
    assert.match(skillMd, /## Bundled Scripts/);
    assert.match(skillMd, /`scripts\/setup\.sh`/);

    // Mirrors should be identical
    const claudeSkillMd = readFileSync(join(tempDir, ".claude/skills/script-skill/SKILL.md"), "utf8");
    const githubSkillMd = readFileSync(join(tempDir, ".github/skills/script-skill/SKILL.md"), "utf8");
    assert.equal(claudeSkillMd, skillMd);
    assert.equal(githubSkillMd, skillMd);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("check passes for skills with scripts after render", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "check-scripts",
        scripts: [{ name: "run.sh", content: "#!/bin/bash\nexit 0" }],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Assets support tests
// ===========================================================================

test("validate accepts skills with valid assets", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "with-assets",
        assets: [
          { name: "template.json", content: '{"key": "value"}', description: "Config template" },
          { name: "schema.xsd", content: "<xs:schema />" },
        ],
      })],
    }));
    expectSuccess(runCli(["validate", "--spec", specPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects assets with invalid filenames", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "bad-asset",
        assets: [{ name: "../escape.json", content: "{}" }],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /valid filename/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("render generates asset files in skill directories", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "asset-skill",
        assets: [
          { name: "template.json", content: '{"key": "value"}', description: "Config template" },
        ],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    // Assets should appear in all three skill directories
    for (const dir of [".agents", ".claude", ".github"]) {
      const assetPath = join(tempDir, `${dir}/skills/asset-skill/assets/template.json`);
      assert.ok(existsSync(assetPath), `${dir} asset should exist`);
      const assetContent = readFileSync(assetPath, "utf8");
      assert.match(assetContent, /"key"/);
    }

    // SKILL.md should contain an assets table
    const skillMd = readFileSync(join(tempDir, ".agents/skills/asset-skill/SKILL.md"), "utf8");
    assert.match(skillMd, /## Assets/);
    assert.match(skillMd, /`assets\/template\.json`/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("check passes for skills with assets after render", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "check-assets",
        assets: [{ name: "config.yaml", content: "key: value" }],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Combined progressive disclosure (references + scripts + assets)
// ===========================================================================

test("render generates full progressive disclosure package with references, scripts, and assets", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "full-package",
        references: [{ name: "guide.md", content: "# Guide\nGuide content.", loadWhen: "Need guidance" }],
        scripts: [{ name: "setup.sh", content: "#!/bin/bash\necho setup", description: "Run setup" }],
        assets: [{ name: "template.json", content: '{"tmpl": true}', description: "Template file" }],
      })],
    }));
    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));

    // Verify all three resource types in canonical package
    const base = join(tempDir, ".agents/skills/full-package");
    assert.ok(existsSync(join(base, "references/guide.md")));
    assert.ok(existsSync(join(base, "scripts/setup.sh")));
    assert.ok(existsSync(join(base, "assets/template.json")));

    // SKILL.md should contain all three tables
    const skillMd = readFileSync(join(base, "SKILL.md"), "utf8");
    assert.match(skillMd, /## Reference Guide/);
    assert.match(skillMd, /## Bundled Scripts/);
    assert.match(skillMd, /## Assets/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Import scripts/assets from directory
// ===========================================================================

test("import-skill reads a directory with scripts and assets", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "external-full");
    mkdirSync(join(skillDir, "references"), { recursive: true });
    mkdirSync(join(skillDir, "scripts"), { recursive: true });
    mkdirSync(join(skillDir, "assets"), { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: full-import
description: A skill with all resource types.
metadata:
  version: "2.0.0"
---

# Full Import

A skill with all resource types.

## When to Use This Skill

- Testing full package import
`, "utf8");
    writeFileSync(join(skillDir, "references", "api.md"), "# API\nAPI docs.", "utf8");
    writeFileSync(join(skillDir, "scripts", "validate.sh"), "#!/bin/bash\necho ok", "utf8");
    writeFileSync(join(skillDir, "assets", "config.json"), '{"setting": true}', "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    const skill = spec.skills[0];
    assert.equal(skill.slug, "full-import");
    assert.ok(skill.references?.length >= 1);
    assert.equal(skill.references[0].name, "api.md");
    assert.ok(skill.scripts?.length >= 1);
    assert.equal(skill.scripts[0].name, "validate.sh");
    assert.match(skill.scripts[0].content, /echo ok/);
    assert.ok(skill.assets?.length >= 1);
    assert.equal(skill.assets[0].name, "config.json");
    assert.match(skill.assets[0].content, /setting/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Export scripts/assets
// ===========================================================================

test("export-skill includes scripts and assets when present", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "export-full",
        references: [{ name: "ref.md", content: "# Ref\nContent." }],
        scripts: [{ name: "build.sh", content: "#!/bin/bash\nmake build", description: "Build script" }],
        assets: [{ name: "defaults.json", content: '{"default": true}', description: "Default config" }],
      })],
    }));

    const outputDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "export-full", "--output", outputDir]));

    assert.ok(existsSync(join(outputDir, "SKILL.md")));
    assert.ok(existsSync(join(outputDir, "references/ref.md")));
    assert.ok(existsSync(join(outputDir, "scripts/build.sh")));
    assert.ok(existsSync(join(outputDir, "assets/defaults.json")));

    const buildSh = readFileSync(join(outputDir, "scripts/build.sh"), "utf8");
    assert.match(buildSh, /make build/);

    const defaults = readFileSync(join(outputDir, "assets/defaults.json"), "utf8");
    assert.match(defaults, /default/);

    // Exported SKILL.md should include scripts and assets tables
    const skillMd = readFileSync(join(outputDir, "SKILL.md"), "utf8");
    assert.match(skillMd, /## Bundled Scripts/);
    assert.match(skillMd, /## Assets/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Export -> re-import round-trip with scripts/assets
// ===========================================================================

test("export -> re-import round-trip preserves scripts and assets", () => {
  const tempDir = makeTempDir();
  try {
    const originalSkill = makeSkillFixture({
      slug: "roundtrip-full",
      title: "Roundtrip Full",
      description: "Test full round-trip.",
      author: "Tester",
      license: "MIT",
      references: [{ name: "ref.md", content: "# Ref\nRef content." }],
      scripts: [{ name: "setup.py", content: "print('setup')", description: "Setup script" }],
      assets: [{ name: "schema.json", content: '{"type": "object"}', description: "JSON Schema" }],
    });
    const specPath = writeSpec(tempDir, makeMinimalSpec({ skills: [originalSkill] }));

    // Export
    const exportDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "roundtrip-full", "--output", exportDir]));

    // Re-import into a fresh spec
    const newSpecPath = join(tempDir, "new-spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", newSpecPath]));
    expectSuccess(runCli(["import-skill", "--spec", newSpecPath, "--skill", exportDir]));

    const newSpec = JSON.parse(readFileSync(newSpecPath, "utf8"));
    assert.equal(newSpec.skills.length, 1);
    const reimported = newSpec.skills[0];
    assert.equal(reimported.slug, "roundtrip-full");
    assert.ok(reimported.references?.length >= 1);
    assert.ok(reimported.scripts?.length >= 1);
    assert.equal(reimported.scripts[0].name, "setup.py");
    assert.match(reimported.scripts[0].content, /print\('setup'\)/);
    assert.ok(reimported.assets?.length >= 1);
    assert.equal(reimported.assets[0].name, "schema.json");
    assert.match(reimported.assets[0].content, /type/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Schema includes scripts and assets definitions
// ===========================================================================

test("export-schema includes skillScript and skillAsset definitions", () => {
  const tempDir = makeTempDir();
  try {
    const schemaPath = join(tempDir, "schema.json");
    expectSuccess(runCli(["export-schema", "--output", schemaPath]));

    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    assert.ok(schema.$defs?.skillScript, "Schema should define skillScript type");
    assert.ok(schema.$defs?.skillAsset, "Schema should define skillAsset type");

    // Verify skill properties include scripts and assets
    const skillProps = schema.$defs.skill.properties;
    assert.ok(skillProps.scripts, "Skill should have scripts property in schema");
    assert.ok(skillProps.assets, "Skill should have assets property in schema");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// External Skill Fidelity Tests (Priority 1)
// ===========================================================================

// Helper: creates a realistic python-pro style SKILL.md fixture
function writePythonProFixture(dir) {
  mkdirSync(join(dir, "references"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---
name: python-pro
description: Expert Python development practices for production-grade code.
license: MIT
metadata:
  author: Community Author
  version: "2.0.0"
  triggers: python, py, typing, mypy
  role: Python expert
  scope: language
---

# Python Pro

Expert Python development practices for production-grade code.

## When to Use This Skill

- Writing new Python modules or packages
- Reviewing Python pull requests
- Refactoring existing Python codebases

## Core Workflow

Follow the standard development cycle for Python projects.
Always start with type stubs before implementing logic.
Run mypy and pytest before committing any changes.

## Best Practices

- Use type annotations on all public function signatures
- Prefer dataclasses or attrs over plain dicts for structured data
- Use pathlib instead of os.path for file system operations
- Write docstrings for all public modules, classes, and functions

## Constraints

- Do not skip type annotations on public APIs
- Never use mutable default arguments in function signatures
- Do not ignore mypy errors with type: ignore without a documented reason
- Avoid bare except clauses — always catch specific exceptions
- Must not use global mutable state for configuration

## Output Templates

- Module files must include a module-level docstring
- Test files must follow the test_<module>_<behavior> naming convention

## Code Examples

Use context managers for resource management.
Prefer f-strings over format() or % formatting.

## Knowledge Reference

Refer to the bundled reference files for detailed type system guidance and async patterns.
`, "utf8");
  writeFileSync(join(dir, "references", "type-system.md"), "# Type System\n\nDetailed guidance on Python typing module usage.", "utf8");
  writeFileSync(join(dir, "references", "async-patterns.md"), "# Async Patterns\n\nBest practices for asyncio and concurrent code.", "utf8");
}

// Helper: creates a react-hooks style SKILL.md fixture
function writeReactHooksFixture(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---
name: react-hooks-guide
description: React hooks best practices and common pitfalls.
metadata:
  version: "1.0.0"
  triggers: react, hooks, useState, useEffect
---

# React Hooks Guide

React hooks best practices and common pitfalls.

## When to Use This Skill

- Creating or modifying React functional components
- Using useState, useEffect, useCallback, useMemo

## Rules

- Always declare dependencies in useEffect dependency arrays
- Use useCallback for event handlers passed to child components
- Prefer useReducer over useState for complex state logic

## Pitfalls to Avoid

- Do not call hooks inside loops, conditions, or nested functions
- Never update state directly during render — always use effects or event handlers
- Avoid creating new object references on every render as props
`, "utf8");
}

// Helper: creates a minimal skill with only prose sections
function writeProseOnlyFixture(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---
name: architecture-guide
description: High-level architectural guidance for the project.
metadata:
  version: "1.0.0"
---

# Architecture Guide

High-level architectural guidance for the project.

## When to Use This Skill

- Making architectural decisions
- Planning new features

## Design Philosophy

The system follows a layered architecture where each layer communicates only with the layer directly below it. Side effects are isolated at the boundary and the core logic remains pure.

## Error Handling Strategy

All errors are caught at service boundaries and converted to typed result objects. No exceptions are allowed to propagate across module boundaries.
`, "utf8");
}

test("import preserves section structure as separate categories (python-pro fixture)", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];

    // Should have multiple categories, NOT a single "General"
    assert.ok(skill.categories.length > 1, `Expected multiple categories, got ${skill.categories.length}`);
    const categoryNames = skill.categories.map((c) => c.name);
    assert.ok(!categoryNames.includes("General"), "Should NOT flatten to a single General category");

    // Core sections should be preserved as categories
    assert.ok(categoryNames.includes("Best Practices"), "Best Practices section should become a category");
    assert.ok(categoryNames.includes("Constraints"), "Constraints section should become a category");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import detects and tags prohibition rules from Constraints section", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];

    // Rules from Constraints should have semantic: "prohibition"
    const constraintRules = skill.rules.filter((r) => r.category === "Constraints");
    assert.ok(constraintRules.length >= 4, `Expected at least 4 constraint rules, got ${constraintRules.length}`);

    const prohibitionRules = constraintRules.filter((r) => r.semantic === "prohibition");
    assert.ok(prohibitionRules.length >= 4, `Expected at least 4 prohibition-tagged rules, got ${prohibitionRules.length}`);

    // Check specific prohibitions are preserved
    const summaries = prohibitionRules.map((r) => r.summary);
    assert.ok(summaries.some((s) => /type annotations/i.test(s)), "Should preserve type annotation prohibition");
    assert.ok(summaries.some((s) => /mutable default/i.test(s)), "Should preserve mutable default prohibition");
    assert.ok(summaries.some((s) => /mypy/i.test(s)), "Should preserve mypy prohibition");
    assert.ok(summaries.some((s) => /bare except/i.test(s)), "Should preserve bare except prohibition");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import preserves prohibition semantics for rules with negative language", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "react-hooks");
    writeReactHooksFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];

    // "Pitfalls to Avoid" rules should detect prohibition language
    const pitfallRules = skill.rules.filter((r) => r.category === "Pitfalls to Avoid");
    assert.ok(pitfallRules.length >= 3, "Should extract pitfall rules");
    const prohibitions = pitfallRules.filter((r) => r.semantic === "prohibition");
    assert.ok(prohibitions.length >= 2, `Expected at least 2 prohibition rules in Pitfalls, got ${prohibitions.length}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import preserves prose-only sections as workflow/reference rules with guidance", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "arch-guide");
    writeProseOnlyFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];

    // Prose-only sections should still produce categories
    const categoryNames = skill.categories.map((c) => c.name);
    assert.ok(categoryNames.includes("Design Philosophy"), "Design Philosophy should become a category");
    assert.ok(categoryNames.includes("Error Handling Strategy"), "Error Handling Strategy should become a category");

    // Prose should be preserved as guidance on rules
    const designRules = skill.rules.filter((r) => r.category === "Design Philosophy");
    assert.ok(designRules.length >= 1, "Design Philosophy should have at least one rule");
    assert.ok(designRules[0].guidance?.length > 0, "Prose section should have guidance preserved");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import preserves references from external skill directories", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];

    assert.ok(skill.references?.length >= 2, "Should import both reference files");
    const refNames = skill.references.map((r) => r.name);
    assert.ok(refNames.includes("async-patterns.md"), "Should import async-patterns.md");
    assert.ok(refNames.includes("type-system.md"), "Should import type-system.md");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import -> render -> check round-trip preserves fidelity (python-pro)", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", renderDir]));

    // Rendered SKILL.md should contain prohibition markers
    const skillMd = readFileSync(join(renderDir, ".agents/skills/python-pro/SKILL.md"), "utf8");
    assert.match(skillMd, /MUST NOT/, "Rendered SKILL.md should contain MUST NOT markers for prohibitions");
    assert.match(skillMd, /Constraints/, "Rendered SKILL.md should preserve Constraints section heading");
    assert.match(skillMd, /Best Practices/, "Rendered SKILL.md should preserve Best Practices heading");

    // References should be rendered
    assert.ok(existsSync(join(renderDir, ".agents/skills/python-pro/references/type-system.md")));
    assert.ok(existsSync(join(renderDir, ".agents/skills/python-pro/references/async-patterns.md")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import -> export -> re-import round-trip preserves section structure", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    // Import
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const originalCategories = spec.skills[0].categories.map((c) => c.name);
    const originalProhibitionCount = spec.skills[0].rules.filter((r) => r.semantic === "prohibition").length;

    // Export
    const exportDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "python-pro", "--output", exportDir]));

    // Re-import
    const newSpecPath = join(tempDir, "new-spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", newSpecPath]));
    expectSuccess(runCli(["import-skill", "--spec", newSpecPath, "--skill", exportDir]));

    const newSpec = JSON.parse(readFileSync(newSpecPath, "utf8"));
    const reimported = newSpec.skills[0];

    // Section structure should be preserved through round-trip
    const reimportedCategories = reimported.categories.map((c) => c.name);
    assert.ok(reimportedCategories.length >= originalCategories.length - 1,
      `Round-trip should preserve most categories. Original: ${originalCategories.length}, Got: ${reimportedCategories.length}`);

    // Prohibition semantics should survive round-trip
    const reimportedProhibitions = reimported.rules.filter((r) => r.semantic === "prohibition").length;
    assert.ok(reimportedProhibitions >= originalProhibitionCount - 1,
      `Round-trip should preserve most prohibitions. Original: ${originalProhibitionCount}, Got: ${reimportedProhibitions}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Mirror Semantic Synchronization Tests
// ===========================================================================

test("canonical and mirror SKILL.md are byte-identical for imported skills", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));

    const canonical = readFileSync(join(renderDir, ".agents/skills/python-pro/SKILL.md"), "utf8");
    const claude = readFileSync(join(renderDir, ".claude/skills/python-pro/SKILL.md"), "utf8");
    const github = readFileSync(join(renderDir, ".github/skills/python-pro/SKILL.md"), "utf8");

    assert.equal(claude, canonical, ".claude mirror should be byte-identical to canonical");
    assert.equal(github, canonical, ".github mirror should be byte-identical to canonical");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("mirror references are byte-identical to canonical for imported skills", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));

    for (const refFile of ["type-system.md", "async-patterns.md"]) {
      const canonical = readFileSync(join(renderDir, `.agents/skills/python-pro/references/${refFile}`), "utf8");
      const claude = readFileSync(join(renderDir, `.claude/skills/python-pro/references/${refFile}`), "utf8");
      const github = readFileSync(join(renderDir, `.github/skills/python-pro/references/${refFile}`), "utf8");
      assert.equal(claude, canonical, `.claude references/${refFile} should match canonical`);
      assert.equal(github, canonical, `.github references/${refFile} should match canonical`);
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("non-native agents receive prohibition semantics in inline skill summaries", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "python-pro");
    writePythonProFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));

    // Non-native agents (e.g., Windsurf, Cline) should include skill summaries
    const windsurf = readFileSync(join(renderDir, ".windsurfrules"), "utf8");
    assert.match(windsurf, /Python Pro/, "Windsurf should include Python Pro skill summary");
    assert.match(windsurf, /Constraints/, "Windsurf should include Constraints category");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("rendered SKILL.md preserves section headings as category names in detailed guidance", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "react-hooks");
    writeReactHooksFixture(skillDir);

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));

    const skillMd = readFileSync(join(renderDir, ".agents/skills/react-hooks-guide/SKILL.md"), "utf8");
    assert.match(skillMd, /### Rules/, "Should have Rules section");
    assert.match(skillMd, /### Pitfalls to Avoid/, "Should have Pitfalls to Avoid section");
    assert.match(skillMd, /\[PROHIBITION\]/, "Should tag prohibition rules");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("schema includes semantic field on rule definitions", () => {
  const tempDir = makeTempDir();
  try {
    const schemaPath = join(tempDir, "schema.json");
    expectSuccess(runCli(["export-schema", "--output", schemaPath]));

    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const ruleProps = schema.$defs.skill.properties.rules.items.properties;
    assert.ok(ruleProps.semantic, "Rule should have semantic property in schema");
    assert.deepEqual(ruleProps.semantic.enum, ["directive", "prohibition", "workflow", "example", "reference"]);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate accepts skills with semantic tags on rules", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "semantic-test",
        rules: [
          { id: "gen-1", category: "General", title: "Do this", impact: "HIGH", summary: "A directive.", semantic: "directive" },
          { id: "gen-2", category: "General", title: "Never do that", impact: "CRITICAL", summary: "A prohibition.", semantic: "prohibition" },
        ],
      })],
    }));
    expectSuccess(runCli(["validate", "--spec", specPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validate rejects invalid semantic tag", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "bad-semantic",
        rules: [
          { id: "gen-1", category: "General", title: "Rule", impact: "HIGH", summary: "Rule.", semantic: "unknown-type" },
        ],
      })],
    }));
    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /semantic must be one of/);
  } finally {
    cleanupTempDir(tempDir);
  }
});
