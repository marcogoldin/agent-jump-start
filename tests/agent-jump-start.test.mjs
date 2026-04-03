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
    assert.match(skillMd, /patterns\.md/);
    assert.match(skillMd, /Design patterns/);
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
