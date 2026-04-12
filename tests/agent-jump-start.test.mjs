import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, chmodSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { introspectProject, formatDetectedComponents, suggestPackageManagerRule, suggestRuntimeRule, deepIntrospect } from "../lib/introspection.mjs";
import { inferValidation, inferSections, inferChecklist, buildOverlayFromEvidence } from "../lib/inference.mjs";
import { mergeByKey, mergeSpecLayers, resolveLayeredSpec, resolveLayeredSpecWithMeta } from "../lib/merging.mjs";
import { validateSpec } from "../lib/validation.mjs";
import { discoverUnmanagedSkills } from "../lib/intake.mjs";
import { findSkillCandidates } from "../lib/skills.mjs";

const scriptPath = resolve("scripts/agent-jump-start.mjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "agent-jump-start-"));
}

function cleanupTempDir(directoryPath) {
  rmSync(directoryPath, { recursive: true, force: true });
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    cwd: options.cwd,
    env: options.env,
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

function readLockfile(tempDir, filename = "agent-jump-start.lock.json") {
  return JSON.parse(readFileSync(join(tempDir, filename), "utf8"));
}

function makeExecutable(tempDir, name, content) {
  const scriptPath = join(tempDir, name);
  writeFileSync(scriptPath, content, "utf8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
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
    assert.ok(existsSync(join(ajsDir, "lib/doctor.mjs")), "lib/doctor.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/intake.mjs")), "lib/intake.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/lockfile.mjs")), "lib/lockfile.mjs should exist");
    assert.ok(existsSync(join(ajsDir, "lib/source-info.mjs")), "lib/source-info.mjs should exist");
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

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.schemaVersion, 1);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "imported-skill");
    assert.equal(lockfile.skills[0].sourceType, "local-directory");
    assert.equal(lockfile.skills[0].provider, "local");
    assert.equal(lockfile.skills[0].source, skillDir);
    assert.match(lockfile.skills[0].checksum, /^sha256:/);
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

test("add-skill imports a local SKILL.md directory", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "local-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: local-added-skill
description: Local add-skill smoke test.
metadata:
  version: "1.0.0"
---

# Local Added Skill

Local add-skill smoke test.

## When to Use This Skill

- Testing add-skill
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    const result = runCli(["add-skill", skillDir, "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /Resolved skill source/);
    assert.match(result.stdout, /Added:.*local-added-skill/);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "local-added-skill");

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "local-added-skill");
    assert.equal(lockfile.skills[0].sourceType, "local-directory");
    assert.equal(lockfile.skills[0].provider, "local");
    assert.equal(lockfile.skills[0].source, skillDir);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("add-skill preserves local SKILL.md file provenance in the lockfile", () => {
  const tempDir = makeTempDir();
  try {
    const skillMdPath = join(tempDir, "standalone-skill.md");
    writeFileSync(skillMdPath, `---
name: local-file-skill
description: Local file add-skill smoke test.
metadata:
  version: "1.0.0"
---

# Local File Skill

Standalone SKILL.md fixture.
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["add-skill", skillMdPath, "--spec", specPath]));

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "local-file-skill");
    assert.equal(lockfile.skills[0].sourceType, "local-skill-md");
    assert.equal(lockfile.skills[0].provider, "local");
    assert.equal(lockfile.skills[0].source, skillMdPath);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("add-skill resolves skills: sources via npx in a temporary project", () => {
  const tempDir = makeTempDir();
  try {
    const binDir = join(tempDir, "bin");
    mkdirSync(binDir, { recursive: true });
    makeExecutable(binDir, "npx", `#!/bin/sh
if [ "$2" = "skills" ] && [ "$3" = "add" ]; then
  mkdir -p "$PWD/.agents/skills/web-design-guidelines"
  cat > "$PWD/.agents/skills/web-design-guidelines/SKILL.md" <<'EOF'
---
name: web-design-guidelines
description: Skills adapter test.
metadata:
  version: "1.0.0"
---

# Web Design Guidelines

Skills adapter test.

## When to Use This Skill

- Testing skills adapter
EOF
  exit 0
fi
echo "unexpected npx invocation: $@" >&2
exit 1
`);

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
    };

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath], { env }));
    const result = runCli(["add-skill", "skills:vercel-labs/agent-skills", "--skill", "web-design-guidelines", "--spec", specPath], { env });
    expectSuccess(result);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "web-design-guidelines");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("add-skill resolves skillfish: sources via isolated HOME installs", () => {
  const tempDir = makeTempDir();
  try {
    const binDir = join(tempDir, "bin");
    mkdirSync(binDir, { recursive: true });
    makeExecutable(binDir, "npx", `#!/bin/sh
if [ "$2" = "skillfish" ] && [ "$3" = "add" ]; then
  mkdir -p "$HOME/.claude/skills/nodejs-expert"
  cat > "$HOME/.claude/skills/nodejs-expert/SKILL.md" <<'EOF'
---
name: nodejs-expert
description: Skillfish adapter test.
metadata:
  version: "2.0.0"
---

# Nodejs Expert

Skillfish adapter test.

## When to Use This Skill

- Testing skillfish adapter
EOF
  exit 0
fi
echo "unexpected npx invocation: $@" >&2
exit 1
`);

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
    };

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath], { env }));
    const result = runCli(["add-skill", "skillfish:nguyenthienthanh/aura-frog", "--skill", "nodejs-expert", "--spec", specPath], { env });
    expectSuccess(result);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "nodejs-expert");
    assert.equal(spec.skills[0].version, "2.0.0");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("add-skill resolves GitHub tree URLs through git clone", () => {
  const tempDir = makeTempDir();
  try {
    const binDir = join(tempDir, "bin");
    mkdirSync(binDir, { recursive: true });
    makeExecutable(binDir, "git", `#!/bin/sh
if [ "$1" = "clone" ]; then
  dest=""
  for arg in "$@"; do
    dest="$arg"
  done
  mkdir -p "$dest/skills/github-skill"
  cat > "$dest/skills/github-skill/SKILL.md" <<'EOF'
---
name: github-skill
description: GitHub adapter test.
metadata:
  version: "3.0.0"
---

# GitHub Skill

GitHub adapter test.

## When to Use This Skill

- Testing GitHub adapter
EOF
  exit 0
fi
echo "unexpected git invocation: $@" >&2
exit 1
`);

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
    };

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath], { env }));
    const result = runCli([
      "add-skill",
      "https://github.com/example/repo/tree/main/skills/github-skill",
      "--spec",
      specPath,
    ], { env });
    expectSuccess(result);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "github-skill");
    assert.equal(spec.skills[0].version, "3.0.0");

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "github-skill");
    assert.equal(lockfile.skills[0].sourceType, "github");
    assert.equal(lockfile.skills[0].provider, "github");
    assert.equal(lockfile.skills[0].source, "https://github.com/example/repo/tree/main/skills/github-skill");
    assert.equal(lockfile.skills[0].treePath, "skills/github-skill");
    assert.match(lockfile.skills[0].repoUrl, /^https:\/\/github\.com\/example\/repo\.git$/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// External skill intake tests
// ===========================================================================

test("discoverUnmanagedSkills returns an empty list when no local skills are present", () => {
  const tempDir = makeTempDir();
  try {
    const discoveries = discoverUnmanagedSkills(tempDir, makeMinimalSpec());
    assert.deepEqual(discoveries, []);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("intake reports managed, unmanaged, and invalid local skills", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "managed-skill", title: "Managed Skill" })],
    }));

    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "managed-skill", "1.0.0", "Already managed.");
    makeSkillMdDir(join(tempDir, ".agents/skills"), "unmanaged-a", "1.0.0", "Need import.");
    makeSkillMdDir(join(tempDir, ".agents/skills"), "unmanaged-b", "1.0.0", "Need import too.");

    const invalidDir = join(tempDir, ".agents/skills", "invalid-skill");
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, "SKILL.md"), `---
name: invalid-skill
metadata:
  version: "1.0.0"
---
# invalid-skill
`, "utf8");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir]);
    expectFailure(result);
    assert.match(result.stdout, /managed-skill\s+\(managed\)/);
    assert.match(result.stdout, /unmanaged-a\s+\(unmanaged\)/);
    assert.match(result.stdout, /unmanaged-b\s+\(unmanaged\)/);
    assert.match(result.stdout, /invalid-skill\s+\(invalid\)/);
    assert.match(result.stdout, /frontmatter\.description is required/);
    assert.match(result.stdout, /Summary: 2 unmanaged, 1 managed, 1 invalid/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("intake --import imports valid local skills, skips invalid ones, and updates the lockfile", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());

    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "python-pro", "2.0.0", "Use typed Python.");

    const invalidDir = join(tempDir, ".agents/skills", "broken-skill");
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, "SKILL.md"), "# Missing frontmatter\n", "utf8");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir, "--import"]);
    expectSuccess(result);
    assert.match(result.stdout, /Import summary: 1 added, 0 replaced, 1 invalid, 0 already managed and skipped/);
    assert.match(result.stdout, /broken-skill/);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "python-pro");

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "python-pro");
    assert.equal(lockfile.skills[0].sourceType, "local-directory");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("intake --import --replace overwrites a managed skill from local disk", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "typescript-pro",
        title: "Original TypeScript Pro",
        version: "1.0.0",
      })],
    }));

    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    const replacementDir = makeSkillMdDir(join(tempDir, ".agents/skills"), "typescript-pro", "2.0.0", "Prefer strict typing.");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir, "--import", "--replace"]);
    expectSuccess(result);
    assert.match(result.stdout, /Import summary: 0 added, 1 replaced, 0 invalid, 0 already managed and skipped/);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills.length, 1);
    assert.equal(spec.skills[0].slug, "typescript-pro");
    assert.equal(spec.skills[0].version, "2.0.0");

    const lockfile = readLockfile(tempDir);
    assert.equal(lockfile.skills.length, 1);
    assert.equal(lockfile.skills[0].slug, "typescript-pro");
    assert.equal(lockfile.skills[0].source, replacementDir);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Provenance-safe replace regression tests
// ===========================================================================

test("intake --import --replace does not degrade a github provenance to local-directory", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "code-reviewer",
        title: "Code Reviewer",
        version: "1.0.0",
      })],
    }));

    // Pre-seed a lockfile with github provenance for this skill.
    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [{
        slug: "code-reviewer",
        version: "1.0.0",
        sourceType: "github",
        provider: "github",
        source: "https://github.com/example/skills/tree/main/code-reviewer",
        repoUrl: "https://github.com/example/skills.git",
        ref: "main",
        treePath: "code-reviewer",
        checksum: "sha256:abc123",
        importedAt: "2026-04-01T00:00:00.000Z",
      }],
    }, null, 2)}\n`, "utf8");

    // Place a local mirror at .agents/skills/code-reviewer (simulating
    // a generated mirror that AJS rendered during sync).
    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "code-reviewer", "1.1.0", "Updated local mirror rule.");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir, "--import", "--replace"]);
    expectSuccess(result);

    // The skill must NOT have been imported — it should be skipped.
    assert.match(result.stdout, /upstream-tracked/);

    // Lockfile provenance must remain github, not local-directory.
    const lockfile = readLockfile(tempDir);
    const entry = lockfile.skills.find((s) => s.slug === "code-reviewer");
    assert.equal(entry.sourceType, "github");
    assert.equal(entry.provider, "github");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("intake --import --replace does not degrade a skills/skillfish provenance", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "express-api",
        title: "Express API",
        version: "1.0.0",
      })],
    }));

    // Pre-seed a lockfile with skills provenance.
    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [{
        slug: "express-api",
        version: "1.0.0",
        sourceType: "skills",
        provider: "skills",
        source: "express-api",
        locator: "express-api",
        skill: "express-api",
        checksum: "sha256:def456",
        importedAt: "2026-04-01T00:00:00.000Z",
      }],
    }, null, 2)}\n`, "utf8");

    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "express-api", "1.1.0", "Updated from local mirror.");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir, "--import", "--replace"]);
    expectSuccess(result);
    assert.match(result.stdout, /upstream-tracked/);

    const lockfile = readLockfile(tempDir);
    const entry = lockfile.skills.find((s) => s.slug === "express-api");
    assert.equal(entry.sourceType, "skills");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("intake --import --replace still works for locally-tracked managed skills", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({
        slug: "custom-skill",
        title: "Custom Skill",
        version: "1.0.0",
      })],
    }));

    // Pre-seed a lockfile with local-directory provenance.
    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    const skillDir = makeSkillMdDir(join(tempDir, ".agents/skills"), "custom-skill", "2.0.0", "Updated local.");

    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [{
        slug: "custom-skill",
        version: "1.0.0",
        sourceType: "local-directory",
        provider: "local",
        source: skillDir,
        checksum: "sha256:old",
        importedAt: "2026-04-01T00:00:00.000Z",
      }],
    }, null, 2)}\n`, "utf8");

    const result = runCli(["intake", "--spec", specPath, "--target", tempDir, "--import", "--replace"]);
    expectSuccess(result);
    assert.match(result.stdout, /0 added, 1 replaced/);

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.skills[0].version, "2.0.0");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Symlink resilience regression tests
// ===========================================================================

test("findSkillCandidates does not crash on broken symlinks", () => {
  const tempDir = makeTempDir();
  try {
    const skillsDir = join(tempDir, ".agents/skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create a valid skill directory.
    makeSkillMdDir(skillsDir, "valid-skill", "1.0.0", "Valid skill.");

    // Create a broken symlink that points to a non-existent target.
    symlinkSync(join(tempDir, "missing-target"), join(skillsDir, "broken-skill"));

    // findSkillCandidates must not throw.
    const candidates = findSkillCandidates(skillsDir);
    assert.ok(Array.isArray(candidates));
    assert.ok(candidates.some((c) => c.includes("valid-skill")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync does not fail when a broken symlink exists under .claude/skills", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    const skillsDir = join(tempDir, ".claude/skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create a broken symlink.
    symlinkSync(join(tempDir, "does-not-exist"), join(skillsDir, "broken-link"));

    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Sync check passed/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync warns when unmanaged local skills are present", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "nodejs-expert", "1.0.0", "Use clear service boundaries.");

    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Sync check passed/);
    assert.match(result.stdout, /Warning: found 1 unmanaged skill package/);
    assert.match(result.stdout, /nodejs-expert/);
    assert.match(result.stdout, /agent-jump-start intake --spec/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("external skill intake end-to-end imports local skills and sync propagates them across targets", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    mkdirSync(join(tempDir, ".agents/skills"), { recursive: true });
    makeSkillMdDir(join(tempDir, ".agents/skills"), "next-best-practices", "1.0.0", "Keep route boundaries explicit.");

    expectSuccess(runCli(["intake", "--spec", specPath, "--target", tempDir, "--import"]));
    expectSuccess(runCli(["sync", "--spec", specPath, "--target", tempDir]));

    assert.ok(existsSync(join(tempDir, ".github/skills/next-best-practices/SKILL.md")));
    assert.ok(existsSync(join(tempDir, ".claude/skills/next-best-practices/SKILL.md")));
    assert.ok(existsSync(join(tempDir, ".cursor/rules/next-best-practices.mdc")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import-skill --replace updates the existing lockfile entry instead of duplicating it", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "replace-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: replaceable-skill
description: Replace test skill.
metadata:
  version: "1.0.0"
---

# Replaceable Skill

## When to Use This Skill

- Testing replace
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));
    const firstLockfile = readLockfile(tempDir);
    assert.equal(firstLockfile.skills.length, 1);
    const firstImportedAt = firstLockfile.skills[0].importedAt;

    writeFileSync(join(skillDir, "SKILL.md"), `---
name: replaceable-skill
description: Replace test skill updated.
metadata:
  version: "2.0.0"
---

# Replaceable Skill

## When to Use This Skill

- Testing replace
- Updated source
`, "utf8");

    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir, "--replace"]));
    const secondLockfile = readLockfile(tempDir);
    assert.equal(secondLockfile.skills.length, 1);
    assert.equal(secondLockfile.skills[0].slug, "replaceable-skill");
    assert.equal(secondLockfile.skills[0].version, "2.0.0");
    assert.notEqual(secondLockfile.skills[0].importedAt, firstImportedAt);
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
    assert.ok(schema.then?.required?.includes("schemaVersion"), "schemaVersion required when extends absent");
    assert.ok(schema.then?.required?.includes("project"), "project required when extends absent");
    assert.ok(schema.properties?.extends, "Schema should have extends property");
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
// Sync command tests
// ===========================================================================

test("sync renders files, cleans stale outputs, and passes check in one step", () => {
  const tempDir = makeTempDir();
  try {
    const spec = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "sync-test-skill" })],
    });
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Rendered files/);
    assert.match(result.stdout, /Sync check passed/);
    assert.ok(existsSync(join(tempDir, ".agents/skills/sync-test-skill/SKILL.md")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync cleans stale files from a previous render", () => {
  const tempDir = makeTempDir();
  try {
    // First render with a skill
    const specWithSkill = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "stale-skill" })],
    });
    const specPath = writeSpec(tempDir, specWithSkill);
    expectSuccess(runCli(["sync", "--spec", specPath, "--target", tempDir]));
    assert.ok(existsSync(join(tempDir, ".agents/skills/stale-skill/SKILL.md")));

    // Second sync without the skill
    const specWithoutSkill = makeMinimalSpec({ skills: [] });
    writeSpec(tempDir, specWithoutSkill);
    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Cleaned stale files/);
    assert.ok(!existsSync(join(tempDir, ".agents/skills/stale-skill/SKILL.md")), "Stale skill file should be removed");
    assert.match(result.stdout, /Sync check passed/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync repairs deleted and modified outputs in a single run", () => {
  const tempDir = makeTempDir();
  try {
    const spec = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "single-run-trust" })],
    });
    const specPath = writeSpec(tempDir, spec);
    expectSuccess(runCli(["sync", "--spec", specPath, "--target", tempDir]));

    rmSync(join(tempDir, "CLAUDE.md"));
    writeFileSync(join(tempDir, ".agents/AGENTS.md"), "# manual drift\n", "utf8");

    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Sync check passed/);
    assert.ok(existsSync(join(tempDir, "CLAUDE.md")), "Deleted generated file should be restored");
    assert.doesNotMatch(readFileSync(join(tempDir, ".agents/AGENTS.md"), "utf8"), /manual drift/);

    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync repairs a skill rename in one run even with a broken symlink and stale lockfile present", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "skill-before-rename", version: "1.0.0" })],
    }));

    expectSuccess(runCli(["sync", "--spec", specPath, "--target", tempDir]));
    assert.ok(existsSync(join(tempDir, ".agents/skills/skill-before-rename/SKILL.md")));

    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [{
        slug: "skill-before-rename",
        version: "0.9.0",
        sourceType: "local-directory",
        provider: "local",
        source: "./skills/skill-before-rename",
        checksum: "sha256:stale",
        importedAt: "2026-04-01T00:00:00.000Z",
      }],
    }, null, 2)}\n`, "utf8");

    mkdirSync(join(tempDir, ".claude/skills"), { recursive: true });
    symlinkSync(join(tempDir, "does-not-exist"), join(tempDir, ".claude/skills", "broken-link"));

    writeSpec(tempDir, makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "skill-after-rename", version: "2.0.0" })],
    }));

    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Cleaned stale files/);
    assert.match(result.stdout, /Sync check passed/);
    assert.ok(!existsSync(join(tempDir, ".agents/skills/skill-before-rename/SKILL.md")), "Old skill output should be removed");
    assert.ok(existsSync(join(tempDir, ".agents/skills/skill-after-rename/SKILL.md")), "Renamed skill output should be created");

    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync defaults target to current directory", () => {
  const tempDir = makeTempDir();
  try {
    const spec = makeMinimalSpec();
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["sync", "--spec", specPath], { cwd: tempDir });
    expectSuccess(result);
    assert.match(result.stdout, /Sync check passed/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("sync fails when --spec is missing", () => {
  const result = runCli(["sync"]);
  expectFailure(result);
  assert.match(result.stderr, /--spec/);
});

test("sync failure output names the file, cause, and next step when convergence is impossible", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    expectSuccess(runCli(["sync", "--spec", specPath, "--target", tempDir]));

    rmSync(join(tempDir, "CLAUDE.md"));
    mkdirSync(join(tempDir, "CLAUDE.md"));

    const result = runCli(["sync", "--spec", specPath, "--target", tempDir]);
    expectFailure(result);
    assert.match(result.stdout, /Sync could not converge after the automatic repair pass/);
    assert.match(result.stdout, /FAIL CLAUDE\.md/);
    assert.match(result.stdout, /Cause: Sync could not write a generated file/);
    assert.match(result.stdout, /Next step:/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Doctor command tests
// ===========================================================================

test("doctor reports warnings for unedited base spec", () => {
  const tempDir = makeTempDir();
  try {
    const spec = {
      schemaVersion: 1,
      project: {
        name: "Replace this project name",
        summary: "Portable AI instruction system generated from one canonical spec.",
        components: [
          "Replace this list with the real applications, services, or packages in the repository.",
        ],
      },
      workspaceInstructions: {
        sections: [{ title: "General rules", rules: ["Keep changes small."] }],
        validation: [
          "Document the baseline validation commands for this repository and keep them current.",
        ],
      },
      reviewChecklist: {
        intro: "Checklist",
        failureThreshold: 1,
        items: [{ title: "Check" }],
      },
      skills: [],
    };
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["doctor", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stdout, /\[warning\] project\.name/);
    assert.match(result.stdout, /\[warning\] project\.components\[0\]/);
    assert.match(result.stdout, /\[warning\] workspaceInstructions\.validation/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("doctor passes clean for a well-filled spec", () => {
  const tempDir = makeTempDir();
  try {
    const spec = {
      schemaVersion: 1,
      project: {
        name: "My Real Project",
        summary: "A real project with actual content.",
        components: ["api: Express.js REST service", "web: React frontend"],
      },
      workspaceInstructions: {
        sections: [
          { title: "General rules", rules: ["Keep changes small."] },
          { title: "API rules", rules: ["Use centralized error handling."] },
        ],
        validation: ["npx eslint .", "npx tsc --noEmit", "npx vitest run"],
      },
      reviewChecklist: {
        intro: "Review checklist for real project.",
        failureThreshold: 2,
        items: [{ title: "Uses real constraints" }],
      },
      skills: [makeSkillFixture()],
    };
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["doctor", "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /No issues found/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("doctor reports info when no skills are defined", () => {
  const tempDir = makeTempDir();
  try {
    const spec = {
      schemaVersion: 1,
      project: {
        name: "Real Project",
        summary: "Actual project.",
        components: ["api: Node.js service"],
      },
      workspaceInstructions: {
        sections: [
          { title: "General rules", rules: ["Keep changes small."] },
          { title: "Node rules", rules: ["Use Express middleware."] },
        ],
        validation: ["npx eslint .", "npx vitest run"],
      },
      reviewChecklist: {
        intro: "Checklist",
        failureThreshold: 1,
        items: [{ title: "Check" }],
      },
      skills: [],
    };
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["doctor", "--spec", specPath]);
    // info-only findings do not cause exit(1)
    expectSuccess(result);
    assert.match(result.stdout, /\[info\] skills/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("doctor reports info for single General rules section", () => {
  const tempDir = makeTempDir();
  try {
    const spec = {
      schemaVersion: 1,
      project: {
        name: "Real Project",
        summary: "Actual project.",
        components: ["api: service"],
      },
      workspaceInstructions: {
        sections: [{ title: "General rules", rules: ["Keep changes small."] }],
        validation: ["npx eslint ."],
      },
      reviewChecklist: {
        intro: "Checklist",
        failureThreshold: 1,
        items: [{ title: "Check" }],
      },
      skills: [makeSkillFixture()],
    };
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["doctor", "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /\[info\] workspaceInstructions\.sections/);
    assert.match(result.stdout, /Consider adding stack-specific sections/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("doctor fails when --spec is missing", () => {
  const result = runCli(["doctor"]);
  expectFailure(result);
  assert.match(result.stderr, /--spec/);
});

test("doctor detects generic validation commands", () => {
  const tempDir = makeTempDir();
  try {
    const spec = {
      schemaVersion: 1,
      project: {
        name: "Real Project",
        summary: "Actual project.",
        components: ["api: service"],
      },
      workspaceInstructions: {
        sections: [
          { title: "General rules", rules: ["Keep changes small."] },
          { title: "Extra rules", rules: ["Be explicit."] },
        ],
        validation: [
          "Run the repository's lint command.",
          "Run the repository's build command.",
        ],
      },
      reviewChecklist: {
        intro: "Checklist",
        failureThreshold: 1,
        items: [{ title: "Check" }],
      },
      skills: [makeSkillFixture()],
    };
    const specPath = writeSpec(tempDir, spec);
    const result = runCli(["doctor", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stdout, /\[warning\] workspaceInstructions\.validation/);
    assert.match(result.stdout, /generic/i);
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

// ===========================================================================
// Mixed Constraint Fidelity Tests (prohibition vs positive directive)
// ===========================================================================

test("import does NOT tag positive directives in Constraints section as prohibition", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "mixed-constraints");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: mixed-constraints
description: Skill with mixed positive and negative constraints.
metadata:
  version: "1.0.0"
---

# Mixed Constraints

Skill with mixed positive and negative constraints.

## When to Use This Skill

- Testing constraint classification

## Constraints

- Must use type annotations on all public APIs
- Must include docstrings on all exported functions
- Do not skip type annotations on internal helpers
- Never use mutable default arguments
- Always validate input at service boundaries
- Avoid bare except clauses
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills[0];
    const constraintRules = skill.rules.filter((r) => r.category === "Constraints");

    // Positive directives should NOT be tagged as prohibition
    const mustUse = constraintRules.find((r) => /Must use type annotations/.test(r.summary));
    assert.ok(mustUse, "Should find 'Must use type annotations' rule");
    assert.notEqual(mustUse.semantic, "prohibition", "'Must use X' is a positive directive, not a prohibition");

    const mustInclude = constraintRules.find((r) => /Must include docstrings/.test(r.summary));
    assert.ok(mustInclude, "Should find 'Must include docstrings' rule");
    assert.notEqual(mustInclude.semantic, "prohibition", "'Must include X' is a positive directive, not a prohibition");

    const alwaysValidate = constraintRules.find((r) => /Always validate/.test(r.summary));
    assert.ok(alwaysValidate, "Should find 'Always validate' rule");
    assert.notEqual(alwaysValidate.semantic, "prohibition", "'Always X' is a positive directive, not a prohibition");

    // Negative constraints SHOULD be tagged as prohibition
    const doNotSkip = constraintRules.find((r) => /Do not skip/.test(r.summary));
    assert.ok(doNotSkip, "Should find 'Do not skip' rule");
    assert.equal(doNotSkip.semantic, "prohibition", "'Do not skip X' should be tagged as prohibition");

    const neverUse = constraintRules.find((r) => /Never use mutable/.test(r.summary));
    assert.ok(neverUse, "Should find 'Never use mutable' rule");
    assert.equal(neverUse.semantic, "prohibition", "'Never use X' should be tagged as prohibition");

    const avoidBare = constraintRules.find((r) => /Avoid bare except/.test(r.summary));
    assert.ok(avoidBare, "Should find 'Avoid bare except' rule");
    assert.equal(avoidBare.semantic, "prohibition", "'Avoid X' should be tagged as prohibition");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("render does NOT emit MUST NOT for positive directives in mixed sections", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "mixed-render");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: mixed-render
description: Render fidelity for mixed constraints.
metadata:
  version: "1.0.0"
---

# Mixed Render

Render fidelity for mixed constraints.

## When to Use This Skill

- Testing render output

## Constraints

- Must use strict mode in all modules
- Do not use eval or Function constructor
- Always prefer const over let
- Never reassign function parameters
`, "utf8");

    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const renderDir = join(tempDir, "rendered");
    mkdirSync(renderDir);
    expectSuccess(runCli(["render", "--spec", specPath, "--target", renderDir]));

    const skillMd = readFileSync(join(renderDir, ".agents/skills/mixed-render/SKILL.md"), "utf8");

    // "Must use strict mode" should NOT have MUST NOT or [PROHIBITION]
    assert.doesNotMatch(skillMd, /MUST NOT.*strict mode/i, "Positive directive should not get MUST NOT marker");

    // "Always prefer const" should NOT have MUST NOT or [PROHIBITION]
    assert.doesNotMatch(skillMd, /MUST NOT.*prefer const/i, "Positive directive should not get MUST NOT marker");

    // "Do not use eval" SHOULD have [PROHIBITION]
    assert.match(skillMd, /\[PROHIBITION\].*Do not use eval|Do not use eval.*\[PROHIBITION\]/i,
      "Negative constraint should have PROHIBITION tag");

    // "Never reassign" SHOULD have [PROHIBITION]
    assert.match(skillMd, /\[PROHIBITION\].*Never reassign|Never reassign.*\[PROHIBITION\]/i,
      "Negative constraint should have PROHIBITION tag");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import -> export -> re-import preserves correct prohibition vs directive split", () => {
  const tempDir = makeTempDir();
  try {
    const skillDir = join(tempDir, "mixed-roundtrip");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: mixed-roundtrip
description: Round-trip fidelity for mixed constraints.
metadata:
  version: "1.0.0"
---

# Mixed Roundtrip

Round-trip fidelity for mixed constraints.

## When to Use This Skill

- Round-trip testing

## Constraints

- Must use TypeScript for all new modules
- Do not use any type without justification
- Always run tsc --noEmit before committing
- Never commit generated files
`, "utf8");

    // Import
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const originalRules = spec.skills[0].rules.filter((r) => r.category === "Constraints");
    const originalProhibitions = originalRules.filter((r) => r.semantic === "prohibition").map((r) => r.summary);
    const originalDirectives = originalRules.filter((r) => !r.semantic).map((r) => r.summary);

    // Export
    const exportDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "mixed-roundtrip", "--output", exportDir]));

    // Re-import
    const newSpecPath = join(tempDir, "new-spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", newSpecPath]));
    expectSuccess(runCli(["import-skill", "--spec", newSpecPath, "--skill", exportDir]));

    const newSpec = JSON.parse(readFileSync(newSpecPath, "utf8"));
    const reimportedRules = newSpec.skills[0].rules.filter((r) => r.category === "Constraints");
    const reimportedProhibitions = reimportedRules.filter((r) => r.semantic === "prohibition").map((r) => r.summary);
    const reimportedDirectives = reimportedRules.filter((r) => !r.semantic).map((r) => r.summary);

    // Same number of prohibitions and directives after round-trip
    assert.equal(reimportedProhibitions.length, originalProhibitions.length,
      `Prohibition count should survive round-trip. Original: ${originalProhibitions.length}, Got: ${reimportedProhibitions.length}`);
    assert.equal(reimportedDirectives.length, originalDirectives.length,
      `Directive count should survive round-trip. Original: ${originalDirectives.length}, Got: ${reimportedDirectives.length}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Trigger and activation metadata tests (P2.2)
// ===========================================================================

test("trigger metadata fields are projected into rendered SKILL.md frontmatter", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      triggers: ["python", "type hints", "async"],
      globs: ["**/*.py", "src/**/*.pyi"],
      alwaysApply: false,
      manualOnly: false,
      relatedSkills: ["nodejs-expert", "testing-pro"],
      compatibility: ["claude-code", "cursor", "github-agents"],
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));
    expectSuccess(runCli(["check", "--spec", specPath, "--target", tempDir]));

    const skillMd = readFileSync(join(tempDir, ".agents/skills/test-skill/SKILL.md"), "utf8");

    assert.match(skillMd, /triggers:/, "SKILL.md should contain triggers field");
    assert.match(skillMd, /"python"/, "SKILL.md should list python trigger");
    assert.match(skillMd, /globs:/, "SKILL.md should contain globs field");
    assert.match(skillMd, /\*\*\/\*\.py/, "SKILL.md should list python glob");
    assert.match(skillMd, /alwaysApply: false/, "SKILL.md should contain alwaysApply");
    assert.match(skillMd, /relatedSkills:/, "SKILL.md should contain relatedSkills");
    assert.match(skillMd, /"nodejs-expert"/, "SKILL.md should list related skill");
    assert.match(skillMd, /compatibility:/, "SKILL.md should contain compatibility");
    assert.match(skillMd, /"claude-code"/, "SKILL.md should list compatible client");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("trigger metadata globs and alwaysApply are projected into Cursor MDC frontmatter", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      globs: ["**/*.py", "tests/**/*.py"],
      alwaysApply: true,
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const mdcContent = readFileSync(join(tempDir, ".cursor/rules/test-skill.mdc"), "utf8");

    assert.match(mdcContent, /alwaysApply: true/, "Cursor MDC should reflect alwaysApply: true");
    assert.match(mdcContent, /globs: \*\*\/\*\.py/, "Cursor MDC should contain globs");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("Cursor MDC defaults to alwaysApply: false when trigger metadata omits it", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture();
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const mdcContent = readFileSync(join(tempDir, ".cursor/rules/test-skill.mdc"), "utf8");

    assert.match(mdcContent, /alwaysApply: false/, "Cursor MDC should default to alwaysApply: false");
    assert.doesNotMatch(mdcContent, /globs:/, "Cursor MDC should not include globs when none specified");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("trigger metadata survives export -> re-import round-trip", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      triggers: ["react", "hooks"],
      globs: ["src/**/*.tsx"],
      alwaysApply: false,
      relatedSkills: ["css-expert"],
      compatibility: ["claude-code", "cursor"],
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    // Export
    const exportDir = join(tempDir, "exported");
    expectSuccess(runCli(["export-skill", "--spec", specPath, "--slug", "test-skill", "--output", exportDir]));

    const exportedSkillMd = readFileSync(join(exportDir, "SKILL.md"), "utf8");
    assert.match(exportedSkillMd, /triggers:/, "Exported SKILL.md should contain triggers");
    assert.match(exportedSkillMd, /globs:/, "Exported SKILL.md should contain globs");
    assert.match(exportedSkillMd, /relatedSkills:/, "Exported SKILL.md should contain relatedSkills");
    assert.match(exportedSkillMd, /compatibility:/, "Exported SKILL.md should contain compatibility");

    // Re-import
    const newSpecPath = join(tempDir, "new-spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", newSpecPath]));
    expectSuccess(runCli(["import-skill", "--spec", newSpecPath, "--skill", exportDir]));

    const newSpec = JSON.parse(readFileSync(newSpecPath, "utf8"));
    const reimported = newSpec.skills[0];

    assert.deepEqual(reimported.triggers, ["react", "hooks"], "Triggers should survive round-trip");
    assert.deepEqual(reimported.globs, ["src/**/*.tsx"], "Globs should survive round-trip");
    assert.equal(reimported.alwaysApply, false, "alwaysApply should survive round-trip");
    assert.deepEqual(reimported.relatedSkills, ["css-expert"], "relatedSkills should survive round-trip");
    assert.deepEqual(reimported.compatibility, ["claude-code", "cursor"], "compatibility should survive round-trip");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validation rejects alwaysApply and manualOnly both true", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      alwaysApply: true,
      manualOnly: true,
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /alwaysApply and manualOnly cannot both be true/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validation rejects invalid compatibility client names", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      compatibility: ["claude-code", "not-a-real-agent"],
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    const result = runCli(["validate", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stderr, /not-a-real-agent.*not a recognized agent client/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("validation accepts valid trigger metadata fields", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      triggers: ["python", "async"],
      globs: ["**/*.py"],
      alwaysApply: false,
      manualOnly: false,
      relatedSkills: ["testing-pro"],
      compatibility: ["claude-code", "cursor"],
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    expectSuccess(runCli(["validate", "--spec", specPath]));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("SKILL.md mirrors are byte-identical when trigger metadata is present", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({
      triggers: ["react"],
      globs: ["**/*.tsx"],
      relatedSkills: ["css-expert"],
    });
    const spec = makeMinimalSpec({ skills: [skill] });
    const specPath = writeSpec(tempDir, spec);

    expectSuccess(runCli(["render", "--spec", specPath, "--target", tempDir]));

    const agentsSkill = readFileSync(join(tempDir, ".agents/skills/test-skill/SKILL.md"), "utf8");
    const claudeSkill = readFileSync(join(tempDir, ".claude/skills/test-skill/SKILL.md"), "utf8");
    const githubSkill = readFileSync(join(tempDir, ".github/skills/test-skill/SKILL.md"), "utf8");

    assert.equal(agentsSkill, claudeSkill, "Claude mirror should be byte-identical to canonical");
    assert.equal(agentsSkill, githubSkill, "GitHub mirror should be byte-identical to canonical");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Project introspection tests
// ===========================================================================

test("introspection detects Node.js project with Express from package.json", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "my-api",
      dependencies: { express: "^4.18.0", cors: "^2.8.0" },
    }), "utf8");

    const result = introspectProject(tempDir);

    assert.equal(result.projectName, "my-api");
    assert.ok(result.runtimes.includes("Node.js"));
    assert.equal(result.packageManager, "npm");
    assert.ok(result.components.some((c) => c.type === "api" && /Express/.test(c.detail)),
      "Should detect Express as an api component");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("introspection detects Python project with pymilvus from requirements.txt", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "requirements.txt"), "pymilvus>=2.3.0\nboto3\npytest\n", "utf8");

    const result = introspectProject(tempDir);

    assert.ok(result.runtimes.includes("Python"));
    assert.ok(result.components.some((c) => c.type === "retrieval" && /pymilvus/.test(c.detail)),
      "Should detect pymilvus as a retrieval component");
    assert.ok(result.signals.some((s) => s.package === "boto3"),
      "Should detect boto3 as an infra signal");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("introspection detects mixed Node.js + Python project", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "@scope/mixed-app",
      dependencies: { react: "^18.0.0", vite: "^5.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }), "utf8");
    writeFileSync(join(tempDir, "requirements.txt"), "fastapi\nsqlalchemy\n", "utf8");
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf8");
    mkdirSync(join(tempDir, ".github/workflows"), { recursive: true });

    const result = introspectProject(tempDir);

    assert.equal(result.projectName, "mixed-app", "Should strip npm scope from name");
    assert.ok(result.runtimes.includes("Node.js"));
    assert.ok(result.runtimes.includes("Python"));
    assert.ok(result.components.some((c) => c.type === "web" && /React/.test(c.detail)));
    assert.ok(result.components.some((c) => c.type === "api" && /FastAPI/.test(c.detail)));
    assert.ok(result.signals.some((s) => s.file === "tsconfig.json"));
    assert.ok(result.signals.some((s) => s.type === "ci"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("introspection detects Docker and lock file signals", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "dockerized" }), "utf8");
    writeFileSync(join(tempDir, "yarn.lock"), "", "utf8");
    writeFileSync(join(tempDir, "Dockerfile"), "FROM node:20\n", "utf8");
    writeFileSync(join(tempDir, "docker-compose.yml"), "version: '3'\n", "utf8");

    const result = introspectProject(tempDir);

    assert.equal(result.packageManager, "yarn");
    assert.ok(result.signals.some((s) => s.detail === "Containerized workflow"));
    assert.ok(result.signals.some((s) => s.detail === "Docker Compose orchestration"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("introspection falls back to directory name when no manifest has a project name", () => {
  const tempDir = makeTempDir();
  try {
    const result = introspectProject(tempDir);
    assert.ok(result.projectName, "Should have a fallback project name from directory");
    assert.equal(result.components.length, 0);
    assert.equal(result.runtimes.length, 0);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("formatDetectedComponents produces spec-ready strings", () => {
  const components = [
    { type: "api", detail: "Express.js REST service", source: "package.json" },
    { type: "retrieval", detail: "Milvus vector search (pymilvus)", source: "requirements.txt" },
  ];
  const formatted = formatDetectedComponents(components);
  assert.deepEqual(formatted, [
    "api: Express.js REST service",
    "retrieval: Milvus vector search (pymilvus)",
  ]);
});

test("suggestPackageManagerRule returns correct rule for npm", () => {
  const rule = suggestPackageManagerRule("npm");
  assert.match(rule, /Use npm/);
  assert.match(rule, /Do not introduce yarn, pnpm, bun/);
});

test("suggestRuntimeRule returns correct rule for mixed runtimes", () => {
  const rule = suggestRuntimeRule(["Node.js", "Python"]);
  assert.match(rule, /Node\.js and Python/);
});

test("init --guided produces valid spec and passes check when stdin is piped", () => {
  const tempDir = makeTempDir();
  try {
    // Create a fake project to introspect
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "guided-test-app",
      dependencies: { express: "^4.18.0" },
    }), "utf8");

    // Pipe answers: project name (accept default), summary, accept components, include checklist, no skills
    const stdinInput = "\nA test application\ny\ny\nn\n";

    const result = spawnSync(process.execPath, [
      scriptPath, "init", "--guided", "--target", tempDir,
    ], {
      encoding: "utf8",
      input: stdinInput,
    });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);

    // Verify spec was created
    const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
    assert.ok(existsSync(specPath), "Canonical spec should exist");

    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.equal(spec.project.name, "guided-test-app", "Should use detected project name");
    assert.equal(spec.project.summary, "A test application");
    assert.ok(spec.project.components.some((c) => /Express/.test(c)),
      "Should include detected Express component");

    // Verify check passes
    const checkResult = spawnSync(process.execPath, [
      scriptPath, "check", "--spec", specPath, "--target", tempDir,
    ], { encoding: "utf8" });

    assert.equal(checkResult.status, 0,
      `Check should pass after guided init.\nSTDOUT:\n${checkResult.stdout}\nSTDERR:\n${checkResult.stderr}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("init --guided copies introspection and interactive modules to target", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "copy-test" }), "utf8");

    const stdinInput = "\nTest summary\nn\ny\nn\n";

    const result = spawnSync(process.execPath, [
      scriptPath, "init", "--guided", "--target", tempDir,
    ], { encoding: "utf8", input: stdinInput });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);

    assert.ok(existsSync(join(tempDir, "docs/agent-jump-start/lib/introspection.mjs")),
      "introspection.mjs should be copied");
    assert.ok(existsSync(join(tempDir, "docs/agent-jump-start/lib/interactive.mjs")),
      "interactive.mjs should be copied");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// update-skills tests
// ===========================================================================

function makeSkillMdDir(parentDir, slug, version, ruleText) {
  const skillDir = join(parentDir, slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---
name: ${slug}
description: Skill ${slug} for testing update-skills.
metadata:
  version: "${version}"
  author: test-author
---
# ${slug}

## Rules

- ${ruleText}
`, "utf8");
  return skillDir;
}

test("update-skills reports up-to-date when source has not changed", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));

    const skillDir = makeSkillMdDir(tempDir, "stable-skill", "1.0.0", "Keep things stable.");
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const result = runCli(["update-skills", "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /1 up-to-date/);
    assert.match(result.stdout, /0 updated/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills detects changed source and applies update", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));

    const skillDir = makeSkillMdDir(tempDir, "evolving-skill", "1.0.0", "Original rule.");
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const lockBefore = readLockfile(tempDir);
    const checksumBefore = lockBefore.skills.find((s) => s.slug === "evolving-skill").checksum;

    // Modifica la skill upstream
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: evolving-skill
description: Skill evolving-skill for testing update-skills.
metadata:
  version: "2.0.0"
  author: test-author
---
# evolving-skill

## Rules

- Updated rule with more content.
- A brand new rule.
`, "utf8");

    const result = runCli(["update-skills", "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /evolving-skill/);
    assert.match(result.stdout, /1\.0\.0.*2\.0\.0/);
    assert.match(result.stdout, /1 updated/);

    // Il lockfile deve avere un checksum aggiornato
    const lockAfter = readLockfile(tempDir);
    const checksumAfter = lockAfter.skills.find((s) => s.slug === "evolving-skill").checksum;
    assert.notEqual(checksumAfter, checksumBefore, "Checksum should change after update");

    // La spec deve contenere la skill v2
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const skill = spec.skills.find((s) => s.slug === "evolving-skill");
    assert.equal(skill.version, "2.0.0");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills --dry-run does not modify files", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));

    const skillDir = makeSkillMdDir(tempDir, "preview-skill", "1.0.0", "Rule before.");
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    const specContentBefore = readFileSync(specPath, "utf8");
    const lockBefore = readFileSync(join(tempDir, "agent-jump-start.lock.json"), "utf8");

    // Modifica la skill upstream
    writeFileSync(join(skillDir, "SKILL.md"), `---
name: preview-skill
description: Skill preview-skill for testing update-skills.
metadata:
  version: "2.0.0"
  author: test-author
---
# preview-skill

## Rules

- Completely new rule.
`, "utf8");

    const result = runCli(["update-skills", "--spec", specPath, "--dry-run"]);
    expectSuccess(result);
    assert.match(result.stdout, /Dry-run/);
    assert.match(result.stdout, /would change/);

    // Nessun file deve essere cambiato
    assert.equal(readFileSync(specPath, "utf8"), specContentBefore);
    assert.equal(readFileSync(join(tempDir, "agent-jump-start.lock.json"), "utf8"), lockBefore);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills warns on unreachable source without failing", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));

    const skillDir = makeSkillMdDir(tempDir, "vanishing-skill", "1.0.0", "I will vanish.");
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillDir]));

    // Rimuovi la sorgente
    rmSync(skillDir, { recursive: true, force: true });

    const result = runCli(["update-skills", "--spec", specPath]);
    expectSuccess(result);
    assert.match(result.stdout, /[Uu]nreachable/);
    assert.match(result.stdout, /vanishing-skill/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills --skill filters to a single skill", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = join(tempDir, "spec.yaml");
    expectSuccess(runCli(["bootstrap", "--base", "specs/base-spec.yaml", "--output", specPath]));

    const skillA = makeSkillMdDir(tempDir, "skill-a", "1.0.0", "Rule A.");
    const skillB = makeSkillMdDir(tempDir, "skill-b", "1.0.0", "Rule B.");
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillA]));
    expectSuccess(runCli(["import-skill", "--spec", specPath, "--skill", skillB]));

    // Modifica solo skill-b
    writeFileSync(join(skillB, "SKILL.md"), `---
name: skill-b
description: Skill skill-b for testing update-skills.
metadata:
  version: "2.0.0"
  author: test-author
---
# skill-b

## Rules

- Updated rule B.
`, "utf8");

    const result = runCli(["update-skills", "--spec", specPath, "--skill", "skill-b"]);
    expectSuccess(result);
    assert.match(result.stdout, /skill-b/);
    assert.match(result.stdout, /1 updated/);
    assert.doesNotMatch(result.stdout, /skill-a/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills exits non-zero when refresh reports internal errors", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec({ skills: [] }));
    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [
        {
          slug: "broken-skill",
          version: "1.0.0",
          sourceType: "unsupported-provider",
          source: "broken-source",
          checksum: "sha256:test",
          importedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
    }, null, 2)}\n`, "utf8");

    const result = runCli(["update-skills", "--spec", specPath]);
    expectFailure(result);
    assert.match(result.stdout, /Errors:/);
    assert.match(result.stdout, /broken-skill/);
    assert.match(result.stdout, /1 error/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Layered specs — mergeByKey unit tests
// ===========================================================================

test("mergeByKey: overlay replaces base entry by key and appends new entries", () => {
  const base = [
    { title: "General rules", rules: ["Rule A"] },
    { title: "React rules", rules: ["Rule B"] },
  ];
  const overlay = [
    { title: "General rules", rules: ["Rule A replaced"] },
    { title: "Python rules", rules: ["Rule C"] },
  ];
  const result = mergeByKey(base, overlay, "title");

  assert.equal(result.length, 3);
  assert.deepEqual(result[0], { title: "General rules", rules: ["Rule A replaced"] });
  assert.deepEqual(result[1], { title: "React rules", rules: ["Rule B"] });
  assert.deepEqual(result[2], { title: "Python rules", rules: ["Rule C"] });
});

test("mergeByKey: empty overlay returns clone of base", () => {
  const base = [{ slug: "a", value: 1 }];
  const result = mergeByKey(base, [], "slug");
  assert.deepEqual(result, base);
  assert.notEqual(result[0], base[0]); // deve essere un clone
});

test("mergeByKey: empty base returns clone of overlay", () => {
  const overlay = [{ slug: "b", value: 2 }];
  const result = mergeByKey([], overlay, "slug");
  assert.deepEqual(result, overlay);
});

test("mergeByKey: null base returns clone of overlay", () => {
  const overlay = [{ slug: "c" }];
  const result = mergeByKey(null, overlay, "slug");
  assert.deepEqual(result, overlay);
});

// ===========================================================================
// Layered specs — mergeSpecLayers unit tests
// ===========================================================================

test("mergeSpecLayers: overlay scalars replace base scalars", () => {
  const base = makeMinimalSpec();
  const overlay = {
    project: { name: "Override Name", summary: "Override summary" },
  };
  const merged = mergeSpecLayers(base, overlay);

  assert.equal(merged.project.name, "Override Name");
  assert.equal(merged.project.summary, "Override summary");
  assert.equal(merged.schemaVersion, 1);
});

test("mergeSpecLayers: overlay components replace entire array", () => {
  const base = makeMinimalSpec();
  base.project.components = ["comp-a"];
  const overlay = {
    project: { components: ["comp-b", "comp-c"] },
  };
  const merged = mergeSpecLayers(base, overlay);
  assert.deepEqual(merged.project.components, ["comp-b", "comp-c"]);
});

test("mergeSpecLayers: sections use append+replace by title", () => {
  const base = makeMinimalSpec();
  base.workspaceInstructions.sections = [
    { title: "General rules", rules: ["Rule A"] },
    { title: "React rules", rules: ["Rule B"] },
  ];
  const overlay = {
    workspaceInstructions: {
      sections: [
        { title: "General rules", rules: ["Rule A v2"] },
        { title: "Python rules", rules: ["Rule P"] },
      ],
    },
  };
  const merged = mergeSpecLayers(base, overlay);

  assert.equal(merged.workspaceInstructions.sections.length, 3);
  assert.equal(merged.workspaceInstructions.sections[0].title, "General rules");
  assert.deepEqual(merged.workspaceInstructions.sections[0].rules, ["Rule A v2"]);
  assert.equal(merged.workspaceInstructions.sections[1].title, "React rules");
  assert.equal(merged.workspaceInstructions.sections[2].title, "Python rules");
});

test("mergeSpecLayers: validation replaces entire array", () => {
  const base = makeMinimalSpec();
  const overlay = {
    workspaceInstructions: { validation: ["pytest", "mypy"] },
  };
  const merged = mergeSpecLayers(base, overlay);
  assert.deepEqual(merged.workspaceInstructions.validation, ["pytest", "mypy"]);
});

test("mergeSpecLayers: reviewChecklist replaces entire object", () => {
  const base = makeMinimalSpec();
  const newChecklist = {
    intro: "New checklist",
    failureThreshold: 3,
    items: [{ title: "Item X" }],
  };
  const overlay = { reviewChecklist: newChecklist };
  const merged = mergeSpecLayers(base, overlay);
  assert.deepEqual(merged.reviewChecklist, newChecklist);
});

test("mergeSpecLayers: skills use append+replace by slug", () => {
  const base = makeMinimalSpec({ skills: [makeSkillFixture({ slug: "alpha" })] });
  const newSkill = makeSkillFixture({ slug: "beta", title: "Beta Skill" });
  const replacedAlpha = makeSkillFixture({ slug: "alpha", title: "Alpha Replaced" });
  const overlay = { skills: [replacedAlpha, newSkill] };
  const merged = mergeSpecLayers(base, overlay);

  assert.equal(merged.skills.length, 2);
  assert.equal(merged.skills[0].slug, "alpha");
  assert.equal(merged.skills[0].title, "Alpha Replaced");
  assert.equal(merged.skills[1].slug, "beta");
});

test("mergeSpecLayers: absent overlay fields do not alter base", () => {
  const base = makeMinimalSpec({ skills: [makeSkillFixture()] });
  const overlay = {};
  const merged = mergeSpecLayers(base, overlay);
  assert.deepEqual(merged, base);
});

// ===========================================================================
// Layered specs — resolveLayeredSpec integration tests
// ===========================================================================

test("resolveLayeredSpec: single spec without extends returns itself", () => {
  const tempDir = makeTempDir();
  try {
    const specPath = writeSpec(tempDir, makeMinimalSpec());
    const resolved = resolveLayeredSpec(specPath);
    assert.equal(resolved.project.name, "Test");
    assert.equal(resolved.schemaVersion, 1);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("resolveLayeredSpec: two-layer extends chain merges correctly", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec();
    base.workspaceInstructions.sections = [
      { title: "General rules", rules: ["Base rule"] },
    ];
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay Project" },
      workspaceInstructions: {
        sections: [
          { title: "General rules", rules: ["Overlay rule"] },
          { title: "Extra section", rules: ["Extra rule"] },
        ],
      },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const resolved = resolveLayeredSpec(overlayPath);

    assert.equal(resolved.project.name, "Overlay Project");
    assert.equal(resolved.project.summary, "Test spec");
    assert.equal(resolved.workspaceInstructions.sections.length, 2);
    assert.deepEqual(resolved.workspaceInstructions.sections[0].rules, ["Overlay rule"]);
    assert.equal(resolved.workspaceInstructions.sections[1].title, "Extra section");
    assert.equal(resolved.extends, undefined);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("resolveLayeredSpec: three-layer chain merges in correct order", () => {
  const tempDir = makeTempDir();
  try {
    const root = makeMinimalSpec();
    root.project.name = "Root";
    writeSpec(tempDir, root, "root.yaml");

    const mid = {
      extends: "./root.yaml",
      project: { name: "Mid" },
      workspaceInstructions: {
        sections: [{ title: "Mid section", rules: ["Mid rule"] }],
      },
    };
    writeSpec(tempDir, mid, "mid.yaml");

    const leaf = {
      extends: "./mid.yaml",
      project: { name: "Leaf" },
    };
    const leafPath = writeSpec(tempDir, leaf, "leaf.yaml");

    const resolved = resolveLayeredSpec(leafPath);

    assert.equal(resolved.project.name, "Leaf");
    // Mid section dovrebbe essere presente (ereditata dal layer intermedio)
    const midSection = resolved.workspaceInstructions.sections.find(
      (s) => s.title === "Mid section",
    );
    assert.ok(midSection, "Mid section should be inherited");
    assert.deepEqual(midSection.rules, ["Mid rule"]);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("resolveLayeredSpec: circular extends throws", () => {
  const tempDir = makeTempDir();
  try {
    const specA = { extends: "./b.yaml", project: { name: "A" } };
    const specB = { extends: "./a.yaml", project: { name: "B" } };
    writeSpec(tempDir, specA, "a.yaml");
    writeSpec(tempDir, specB, "b.yaml");

    assert.throws(
      () => resolveLayeredSpec(join(tempDir, "a.yaml")),
      /[Cc]ircular/,
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("resolveLayeredSpec: missing base file throws", () => {
  const tempDir = makeTempDir();
  try {
    const overlay = { extends: "./nonexistent.yaml", project: { name: "X" } };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    assert.throws(
      () => resolveLayeredSpec(overlayPath),
      /ENOENT|no such file/i,
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Layered specs — CLI integration tests
// ===========================================================================

test("CLI sync works with a layered overlay spec", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec();
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay via CLI" },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const result = runCli(["sync", "--spec", overlayPath, "--target", tempDir]);
    expectSuccess(result);
    assert.match(result.stdout, /Rendered files:/);

    // Il Cursor MDC generato deve contenere il nome dell'overlay
    const cursorContent = readFileSync(join(tempDir, ".cursor", "rules", "agent-instructions.mdc"), "utf8");
    assert.match(cursorContent, /Overlay via CLI/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("CLI validate passes on merged overlay", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec();
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Valid Overlay" },
      workspaceInstructions: {
        sections: [{ title: "New section", rules: ["A rule"] }],
      },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const result = runCli(["validate", "--spec", overlayPath]);
    expectSuccess(result);
    assert.match(result.stdout, /validation passed/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("CLI render with overlay produces correct output", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec();
    base.workspaceInstructions.sections = [
      { title: "General rules", rules: ["Base general rule"] },
    ];
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Rendered Overlay" },
      workspaceInstructions: {
        sections: [{ title: "Python rules", rules: ["Use type hints"] }],
      },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const result = runCli(["render", "--spec", overlayPath, "--target", tempDir]);
    expectSuccess(result);

    // Il contenuto generato deve avere sia la base section che quella nuova
    const copilotContent = readFileSync(
      join(tempDir, ".github", "copilot-instructions.md"),
      "utf8",
    );
    assert.match(copilotContent, /General rules/);
    assert.match(copilotContent, /Python rules/);
    assert.match(copilotContent, /Use type hints/);

    // Il Cursor MDC contiene il project name dell'overlay
    const cursorContent = readFileSync(
      join(tempDir, ".cursor", "rules", "agent-instructions.mdc"),
      "utf8",
    );
    assert.match(cursorContent, /Rendered Overlay/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Layered specs — export-skill with overlay
// ===========================================================================

test("export-skill works on a layered overlay spec", () => {
  const tempDir = makeTempDir();
  try {
    const skill = makeSkillFixture({ slug: "layered-export-test" });
    const base = makeMinimalSpec({ skills: [skill] });
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Export Overlay" },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const outputDir = join(tempDir, "exported");
    const result = runCli([
      "export-skill", "--spec", overlayPath,
      "--slug", "layered-export-test",
      "--output", outputDir,
    ]);
    expectSuccess(result);
    assert.match(result.stdout, /layered-export-test/);
    assert.ok(existsSync(join(outputDir, "SKILL.md")));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// mergeByKey — fail-fast validation
// ===========================================================================

test("mergeByKey: throws on overlay entry missing key field", () => {
  const base = [{ slug: "a", name: "A" }];
  const overlay = [{ name: "No slug" }];

  assert.throws(
    () => mergeByKey(base, overlay, "slug"),
    /missing required key field "slug"/,
  );
});

test("mergeByKey: throws on duplicate key in overlay array", () => {
  const base = [{ slug: "a", name: "A" }];
  const overlay = [
    { slug: "b", name: "B1" },
    { slug: "b", name: "B2" },
  ];

  assert.throws(
    () => mergeByKey(base, overlay, "slug"),
    /[Dd]uplicate.*"slug".*"b"/,
  );
});

test("mergeByKey: throws on base entry missing key field", () => {
  const base = [{ name: "No slug" }];
  const overlay = [{ slug: "a", name: "A" }];

  assert.throws(
    () => mergeByKey(base, overlay, "slug"),
    /missing required key field "slug"/,
  );
});

test("mergeByKey: valid inputs still merge correctly after hardening", () => {
  const base = [
    { slug: "a", name: "A" },
    { slug: "b", name: "B" },
  ];
  const overlay = [
    { slug: "b", name: "B-override" },
    { slug: "c", name: "C-new" },
  ];

  const result = mergeByKey(base, overlay, "slug");
  assert.equal(result.length, 3);
  assert.equal(result[0].name, "A");
  assert.equal(result[1].name, "B-override");
  assert.equal(result[2].name, "C-new");
});

// ===========================================================================
// Writeback semantics — layered spec side-effect isolation
// ===========================================================================

test("resolveLayeredSpecWithMeta returns leaf metadata alongside merged spec", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "base-skill" })],
    });
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay Project" },
      skills: [makeSkillFixture({ slug: "leaf-skill" })],
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const meta = resolveLayeredSpecWithMeta(overlayPath);

    // merged contains skills from both layers
    assert.equal(meta.merged.project.name, "Overlay Project");
    const mergedSlugs = meta.merged.skills.map((s) => s.slug);
    assert.ok(mergedSlugs.includes("base-skill"), "merged should include base skill");
    assert.ok(mergedSlugs.includes("leaf-skill"), "merged should include leaf skill");

    // leafSpec contains only the leaf's own fields (no base skills)
    const leafSlugs = (meta.leafSpec.skills ?? []).map((s) => s.slug);
    assert.ok(leafSlugs.includes("leaf-skill"), "leaf should include its own skill");
    assert.ok(!leafSlugs.includes("base-skill"), "leaf should NOT include base skill");

    // metadata
    assert.ok(meta.isLayered);
    assert.equal(meta.chain.length, 2);
    assert.equal(meta.leafPath, resolve(overlayPath));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import-skill on overlay spec preserves extends and does not flatten base", () => {
  const tempDir = makeTempDir();
  try {
    // Base spec with one skill
    const base = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "base-only-skill" })],
    });
    writeSpec(tempDir, base, "base.yaml");

    // Overlay that extends base — starts with no skills of its own
    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay" },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    // Build a standalone skill directory to import
    const skillDir = join(tempDir, "ext-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "imported-skill"',
        'description: "A skill imported into the overlay"',
        "---",
        "",
        "# Imported Skill",
        "",
        "Some content.",
      ].join("\n"),
      "utf8",
    );

    // Import the skill into the overlay
    const result = runCli([
      "import-skill", "--spec", overlayPath, "--skill", skillDir,
    ]);
    expectSuccess(result);
    assert.match(result.stdout, /Added.*imported-skill/);

    // Read back the overlay file from disk
    const writtenOverlay = JSON.parse(readFileSync(overlayPath, "utf8"));

    // extends must be preserved
    assert.equal(writtenOverlay.extends, "./base.yaml",
      "extends field must survive writeback");

    // The overlay must NOT contain base-layer fields like schemaVersion
    // or the base skill — only its own additions.
    assert.equal(writtenOverlay.schemaVersion, undefined,
      "schemaVersion belongs to the base, not the overlay");

    // The overlay skills array must contain only the imported skill
    const overlaySlugs = (writtenOverlay.skills ?? []).map((s) => s.slug);
    assert.ok(overlaySlugs.includes("imported-skill"),
      "imported skill should be in the overlay");
    assert.ok(!overlaySlugs.includes("base-only-skill"),
      "base skill must NOT leak into the overlay file");

    // The resolved spec should see all skills (base + overlay)
    const resolved = resolveLayeredSpec(overlayPath);
    const resolvedSlugs = resolved.skills.map((s) => s.slug);
    assert.ok(resolvedSlugs.includes("base-only-skill"),
      "resolved spec should include base skill");
    assert.ok(resolvedSlugs.includes("imported-skill"),
      "resolved spec should include imported skill");

    // The base file must be untouched
    const baseAfter = JSON.parse(readFileSync(join(tempDir, "base.yaml"), "utf8"));
    const baseSlugs = baseAfter.skills.map((s) => s.slug);
    assert.ok(baseSlugs.includes("base-only-skill"));
    assert.ok(!baseSlugs.includes("imported-skill"),
      "base file must NOT be modified by import into overlay");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("import-skill detects collision with base-layer skill via resolved lookup", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "shared-skill" })],
    });
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay" },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    // Build a skill with the same slug as the base skill
    const skillDir = join(tempDir, "clash-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "shared-skill"',
        'description: "Collides with base"',
        "---",
        "",
        "# Shared Skill",
        "",
        "Override content.",
      ].join("\n"),
      "utf8",
    );

    // Without --replace, should skip because it exists in the base
    const result = runCli([
      "import-skill", "--spec", overlayPath, "--skill", skillDir,
    ]);
    expectSuccess(result);
    assert.match(result.stdout, /Skipped.*shared-skill/,
      "Should detect collision with base-layer skill");

    // With --replace, should materialize the override in the leaf
    const replaceResult = runCli([
      "import-skill", "--spec", overlayPath, "--skill", skillDir, "--replace",
    ]);
    expectSuccess(replaceResult);
    assert.match(replaceResult.stdout, /Replaced.*shared-skill/);

    const writtenOverlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    assert.equal(writtenOverlay.extends, "./base.yaml");
    const overlaySlugs = (writtenOverlay.skills ?? []).map((s) => s.slug);
    assert.ok(overlaySlugs.includes("shared-skill"),
      "override should be materialized in the leaf");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("resolveLayeredSpecWithMeta: single spec without extends reports isLayered false", () => {
  const tempDir = makeTempDir();
  try {
    const spec = makeMinimalSpec();
    const specPath = writeSpec(tempDir, spec);

    const meta = resolveLayeredSpecWithMeta(specPath);
    assert.equal(meta.isLayered, false);
    assert.equal(meta.chain.length, 1);
    assert.deepEqual(meta.merged.project, spec.project);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("update-skills on overlay spec preserves extends and writes only to the leaf", () => {
  const tempDir = makeTempDir();
  try {
    const base = makeMinimalSpec({
      skills: [makeSkillFixture({ slug: "inherited-skill", version: "1.0.0" })],
    });
    writeSpec(tempDir, base, "base.yaml");

    const overlay = {
      extends: "./base.yaml",
      project: { name: "Overlay" },
    };
    const overlayPath = writeSpec(tempDir, overlay, "overlay.yaml");

    const skillDir = makeSkillMdDir(
      tempDir,
      "inherited-skill",
      "2.0.0",
      "Updated rule from overlay refresh.",
    );

    writeFileSync(join(tempDir, "agent-jump-start.lock.json"), `${JSON.stringify({
      schemaVersion: 1,
      generatedBy: "Agent Jump Start vtest",
      skills: [
        {
          slug: "inherited-skill",
          version: "1.0.0",
          sourceType: "local-directory",
          source: "./inherited-skill",
          resolvedFrom: "./inherited-skill",
          checksum: "sha256:bogus",
          importedAt: "2026-04-09T00:00:00.000Z",
        },
      ],
    }, null, 2)}\n`, "utf8");

    const result = runCli(["update-skills", "--spec", overlayPath]);
    expectSuccess(result);
    assert.match(result.stdout, /Updated:/);
    assert.match(result.stdout, /inherited-skill/);

    const writtenOverlay = JSON.parse(readFileSync(overlayPath, "utf8"));
    assert.equal(writtenOverlay.extends, "./base.yaml");
    assert.equal(writtenOverlay.schemaVersion, undefined);
    assert.ok((writtenOverlay.skills ?? []).some((s) => s.slug === "inherited-skill"));

    const baseAfter = JSON.parse(readFileSync(join(tempDir, "base.yaml"), "utf8"));
    assert.equal(baseAfter.skills[0].version, "1.0.0");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Deep introspection tests
// ===========================================================================

test("deepIntrospect extracts package.json scripts as validation commands", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "test-app",
      scripts: {
        test: "jest",
        lint: "eslint src/",
        build: "tsc",
        start: "node dist/index.js",
        typecheck: "tsc --noEmit",
      },
      dependencies: { express: "^4.18.0" },
    }), "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.scripts.length >= 3, "Should extract at least test, lint, build");
    assert.ok(evidence.scripts.some((s) => s.command === "npm run test"), "Should have npm run test");
    assert.ok(evidence.scripts.some((s) => s.command === "npm run lint"), "Should have npm run lint");
    assert.ok(evidence.scripts.some((s) => s.command === "npm run build"), "Should have npm run build");
    assert.ok(evidence.scripts.some((s) => s.command === "npm run typecheck"), "Should have npm run typecheck");
    // "start" should NOT be extracted (not a validation key)
    assert.ok(!evidence.scripts.some((s) => s.command === "npm run start"), "Should not extract start script");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect uses detected package manager for script commands", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "pnpm-app",
      scripts: { test: "vitest", lint: "eslint ." },
    }), "utf8");
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: 6\n", "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.scripts.some((s) => s.command === "pnpm run test"), "Should use pnpm prefix");
    assert.ok(evidence.scripts.some((s) => s.command === "pnpm run lint"), "Should use pnpm prefix");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect extracts Makefile targets", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "Makefile"), `
.PHONY: test lint build

test:
\tpytest tests/

lint:
\truff check .

build:
\tdocker build -t app .

deploy:
\tkubectl apply -f k8s/
`, "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.makeTargets.some((t) => t.target === "test" && t.command === "make test"));
    assert.ok(evidence.makeTargets.some((t) => t.target === "lint" && t.command === "make lint"));
    assert.ok(evidence.makeTargets.some((t) => t.target === "build" && t.command === "make build"));
    // deploy is NOT a validation target
    assert.ok(!evidence.makeTargets.some((t) => t.target === "deploy"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect extracts CI workflow run commands", () => {
  const tempDir = makeTempDir();
  try {
    mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(tempDir, ".github", "workflows", "ci.yml"), `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: echo "done"
`, "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.ciSteps.length >= 2, "Should extract at least lint and test CI steps");
    assert.ok(evidence.ciSteps.some((s) => /lint/.test(s.command)));
    assert.ok(evidence.ciSteps.some((s) => /test/.test(s.command)));
    // "echo done" and "npm ci" should not be extracted
    assert.ok(!evidence.ciSteps.some((s) => /echo/.test(s.command)));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect detects pre-commit hooks", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, ".pre-commit-config.yaml"), `
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    hooks:
      - id: ruff
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    hooks:
      - id: mypy
`, "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.preCommitHooks.some((h) => h.id === "ruff"));
    assert.ok(evidence.preCommitHooks.some((h) => h.id === "ruff-format"));
    assert.ok(evidence.preCommitHooks.some((h) => h.id === "mypy"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect detects linter config files", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, ".eslintrc.json"), "{}", "utf8");
    writeFileSync(join(tempDir, ".prettierrc"), "{}", "utf8");
    writeFileSync(join(tempDir, ".editorconfig"), "root = true\n", "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.linterConfigs.some((c) => c.tool === "eslint"));
    assert.ok(evidence.linterConfigs.some((c) => c.tool === "prettier"));
    assert.ok(evidence.linterConfigs.some((c) => c.tool === "editorconfig"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect extracts conventions from CONTRIBUTING.md", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "CONTRIBUTING.md"), `# Contributing

## Development Setup

- Install dependencies with npm install
- Run tests before submitting PRs
- Follow the existing code style

## Testing

- Write unit tests for new features
- Run npm test to verify

## Deployment

This section is not about development.
`, "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.conventions.length >= 1, "Should extract at least one convention section");
    assert.ok(evidence.conventions.some((c) => c.source === "CONTRIBUTING.md"));
    assert.ok(evidence.conventions.some((c) => /setup|testing/i.test(c.heading)));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect returns empty evidence for empty directory", () => {
  const tempDir = makeTempDir();
  try {
    const evidence = deepIntrospect(tempDir);

    assert.equal(evidence.scripts.length, 0);
    assert.equal(evidence.ciSteps.length, 0);
    assert.equal(evidence.linterConfigs.length, 0);
    assert.equal(evidence.conventions.length, 0);
    assert.equal(evidence.preCommitHooks.length, 0);
    assert.equal(evidence.makeTargets.length, 0);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("deepIntrospect detects pyproject.toml tool sections", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "pyproject.toml"), `
[project]
name = "my-python-app"

[tool.pytest.ini_options]
testpaths = ["tests"]

[tool.ruff]
line-length = 88

[tool.mypy]
strict = true
`, "utf8");

    const evidence = deepIntrospect(tempDir);

    assert.ok(evidence.pyprojectTools.tools.some((t) => t.tool === "pytest"));
    assert.ok(evidence.pyprojectTools.tools.some((t) => t.tool === "ruff"));
    assert.ok(evidence.pyprojectTools.tools.some((t) => t.tool === "mypy"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Inference engine tests
// ===========================================================================

test("inferValidation produces detected commands from package.json scripts", () => {
  const evidence = {
    base: { packageManager: "npm", runtimes: ["Node.js"], signals: [], components: [] },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
      { command: "npm run lint", source: "package.json scripts.lint", raw: "eslint ." },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferValidation(evidence);

  assert.ok(result.length >= 2);
  assert.ok(result.some((v) => v.value === "npm run test" && v.provenance === "detected"));
  assert.ok(result.some((v) => v.value === "npm run lint" && v.provenance === "detected"));
});

test("inferValidation deduplicates commands across sources", () => {
  const evidence = {
    base: { packageManager: "npm", runtimes: ["Node.js"], signals: [], components: [] },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [
      { command: "npm run test", source: ".github/workflows/ci.yml", workflow: "ci.yml" },
    ],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferValidation(evidence);

  // Should deduplicate: only one "npm run test"
  const testEntries = result.filter((v) => /npm run test/i.test(v.value));
  assert.equal(testEntries.length, 1, "Should deduplicate identical commands");
  assert.equal(testEntries[0].provenance, "detected", "package.json (priority 1) should win over CI");
});

test("inferValidation maps pre-commit hooks to known commands", () => {
  const evidence = {
    base: { packageManager: null, runtimes: ["Python"], signals: [], components: [] },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [
      { id: "ruff", source: ".pre-commit-config.yaml" },
      { id: "mypy", source: ".pre-commit-config.yaml" },
    ],
    makeTargets: [],
  };

  const result = inferValidation(evidence);

  assert.ok(result.some((v) => v.value === "ruff check ." && v.provenance === "inferred"));
  assert.ok(result.some((v) => v.value === "mypy ." && v.provenance === "inferred"));
});

test("inferValidation caps at 8 commands", () => {
  const evidence = {
    base: { packageManager: "npm", runtimes: ["Node.js"], signals: [], components: [] },
    scripts: Array.from({ length: 10 }, (_, i) => ({
      command: `npm run script-${i}`,
      source: `package.json scripts.script-${i}`,
      raw: `cmd-${i}`,
    })),
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferValidation(evidence);

  assert.ok(result.length <= 8, `Should cap at 8, got ${result.length}`);
});

test("inferSections produces TypeScript section when tsconfig detected", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferSections(evidence);

  assert.ok(result.some((s) => s.title === "TypeScript rules"));
  const tsSection = result.find((s) => s.title === "TypeScript rules");
  assert.ok(tsSection.rules.length >= 2);
  assert.ok(tsSection.rules.every((r) => r.provenance === "inferred"));
});

test("inferSections produces Code style section from linter configs", () => {
  const evidence = {
    base: { packageManager: "npm", runtimes: ["Node.js"], signals: [], components: [] },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [
      { tool: "eslint", file: ".eslintrc.json" },
      { tool: "prettier", file: ".prettierrc" },
    ],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferSections(evidence);

  assert.ok(result.some((s) => s.title === "Code style"));
  const codeStyle = result.find((s) => s.title === "Code style");
  assert.ok(codeStyle.rules.length >= 1);
  assert.ok(codeStyle.rules.some((r) => /eslint.*prettier/i.test(r.value) || /authoritative/i.test(r.value)));
});

test("inferSections returns empty for empty evidence", () => {
  const evidence = {
    base: { packageManager: null, runtimes: [], signals: [], components: [] },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferSections(evidence);

  assert.equal(result.length, 0, "No sections for empty evidence");
});

test("inferChecklist produces items from detected validation commands", () => {
  const evidence = {
    base: { packageManager: "npm", runtimes: ["Node.js"], signals: [], components: [] },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
      { command: "npm run lint", source: "package.json scripts.lint", raw: "eslint ." },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferChecklist(evidence);

  assert.ok(result.items.some((i) => /test/i.test(i.value)));
  assert.ok(result.items.some((i) => /lint/i.test(i.value)));
  // Always has the default red flag
  assert.ok(result.redFlags.some((r) => /hand-edited/i.test(r.value)));
});

test("inferChecklist adds TypeScript red flags when TypeScript detected", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [
      { command: "npm run typecheck", source: "package.json scripts.typecheck", raw: "tsc --noEmit" },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const result = inferChecklist(evidence);

  assert.ok(result.items.some((i) => /type check/i.test(i.value)));
  assert.ok(result.redFlags.some((r) => /any/i.test(r.value)));
});

// ===========================================================================
// CLI infer command tests
// ===========================================================================

test("infer command prints labeled suggestions for a Node.js project", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "infer-test",
      scripts: { test: "jest", lint: "eslint ." },
      dependencies: { typescript: "^5.0.0" },
    }), "utf8");
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer", "--target", tempDir,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stdout, /\[detected\].*npm run test/);
    assert.match(result.stdout, /\[detected\].*npm run lint/);
    assert.match(result.stdout, /Validation commands:/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer command outputs JSON with --format json", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "json-infer-test",
      scripts: { test: "vitest", build: "tsc" },
    }), "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer", "--target", tempDir, "--format", "json",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.validation), "Should have validation array");
    assert.ok(parsed.validation.some((v) => v.provenance === "detected"));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer command writes a JSON inference report to --output", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "output-infer-test",
      scripts: { test: "jest", lint: "eslint ." },
    }), "utf8");

    const outputPath = join(tempDir, "inferred.json");
    const result = spawnSync(process.execPath, [
      scriptPath, "infer", "--target", tempDir, "--output", outputPath,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.ok(existsSync(outputPath), "Output file should be written");
    const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.ok(Array.isArray(parsed.validation));
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer command reports nothing for empty directory", () => {
  const tempDir = makeTempDir();
  try {
    const result = spawnSync(process.execPath, [
      scriptPath, "infer", "--target", tempDir,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /No suggestions inferred/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer --section validation only outputs validation", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "section-filter-test",
      scripts: { test: "jest", lint: "eslint ." },
    }), "utf8");
    writeFileSync(join(tempDir, ".eslintrc.json"), "{}", "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer", "--target", tempDir, "--section", "validation", "--format", "json",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed.validation), "Should have validation");
    assert.equal(parsed.sections, undefined, "Should not have sections when filtered");
    assert.equal(parsed.checklist, undefined, "Should not have checklist when filtered");
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Doctor --suggest tests
// ===========================================================================

test("doctor --suggest prints inferred validation commands alongside warnings", () => {
  const tempDir = makeTempDir();
  try {
    // Create a spec with generic validation
    const specPath = join(tempDir, "canonical-spec.yaml");
    writeFileSync(specPath, JSON.stringify({
      schemaVersion: 1,
      project: { name: "suggest-test", summary: "Test project.", components: ["api: Express"] },
      workspaceInstructions: {
        packageManagerRule: "Use npm.",
        runtimeRule: "Keep aligned.",
        sections: [{ title: "General rules", rules: ["Prefer small changes."] }],
        validation: ["Document the baseline validation commands for this repository."],
      },
      skills: [],
    }), "utf8");

    // Create package.json with real scripts
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "suggest-test",
      scripts: { test: "jest", lint: "eslint ." },
    }), "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "doctor", "--spec", specPath, "--suggest", "--target", tempDir,
    ], { encoding: "utf8" });

    // doctor exits with 1 because of warnings, but should print suggestions
    assert.match(result.stdout, /Suggested validation commands/);
    assert.match(result.stdout, /\[detected\].*npm run test/);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// Enhanced guided setup with inference tests
// ===========================================================================

test("init --guided with scripts proposes validation commands in interactive flow", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "guided-infer-test",
      scripts: { test: "jest", lint: "eslint ." },
      dependencies: { express: "^4.18.0" },
    }), "utf8");

    // Pipe answers: name, summary, components, accept validation, accept sections (if any),
    // include checklist, accept checklist suggestions (if any), no skills
    // The exact number depends on which inference steps have content.
    // For a project with test+lint scripts and express dependency:
    // 1. project name (accept default)
    // 2. summary
    // 3. accept components (y)
    // 4. accept validation (y)
    // 5. include checklist (y)
    // 6. accept checklist suggestions (y)
    // 7. import skills (n)
    const stdinInput = "\nA guided test app\ny\ny\ny\ny\nn\n";

    const result = spawnSync(process.execPath, [
      scriptPath, "init", "--guided", "--target", tempDir,
    ], {
      encoding: "utf8",
      input: stdinInput,
    });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);

    // Verify the spec has real validation commands, not placeholders
    const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
    assert.ok(existsSync(specPath), "Canonical spec should exist");
    const spec = JSON.parse(readFileSync(specPath, "utf8"));

    assert.ok(Array.isArray(spec.workspaceInstructions.validation));
    assert.ok(spec.workspaceInstructions.validation.some((v) => /npm run test/.test(v)),
      `Validation should contain detected commands, got: ${JSON.stringify(spec.workspaceInstructions.validation)}`);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// ===========================================================================
// buildOverlayFromEvidence unit tests (T5)
// ===========================================================================

test("buildOverlayFromEvidence produces validation strings without provenance", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [],
    },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
      { command: "npm run lint", source: "package.json scripts.lint", raw: "eslint ." },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence);

  assert.ok(overlay.workspaceInstructions, "Should have workspaceInstructions");
  assert.ok(Array.isArray(overlay.workspaceInstructions.validation), "Should have validation");
  for (const v of overlay.workspaceInstructions.validation) {
    assert.equal(typeof v, "string", "Validation entries must be plain strings");
  }
  assert.ok(overlay.workspaceInstructions.validation.some((v) => /npm run test/.test(v)));
});

test("buildOverlayFromEvidence strips provenance from sections rules", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [{ file: ".eslintrc.json", tool: "eslint" }],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence);

  assert.ok(overlay.workspaceInstructions?.sections, "Should have sections");
  for (const section of overlay.workspaceInstructions.sections) {
    assert.equal(typeof section.title, "string", "Section title must be string");
    assert.ok(Array.isArray(section.rules), "Section rules must be array");
    for (const rule of section.rules) {
      assert.equal(typeof rule, "string", "Rule entries must be plain strings");
    }
  }
});

test("buildOverlayFromEvidence adds extends field when base is specified", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [],
    },
    scripts: [{ command: "npm test", source: "package.json scripts.test", raw: "jest" }],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence, { base: "base-spec.yaml" });

  assert.equal(overlay.extends, "base-spec.yaml");
  assert.equal(overlay.schemaVersion, undefined, "Overlay with extends should not have schemaVersion");
  assert.equal(overlay.project, undefined, "Overlay with extends should not have project");
});

test("buildOverlayFromEvidence omits reviewChecklist when no items", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [],
    },
    scripts: [],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence);

  assert.equal(overlay.reviewChecklist, undefined,
    "reviewChecklist must be omitted when no items (schema requires minItems: 1)");
});

test("buildOverlayFromEvidence generates reviewChecklist with correct structure", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
      { command: "npm run lint", source: "package.json scripts.lint", raw: "eslint ." },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence);

  if (overlay.reviewChecklist) {
    const rc = overlay.reviewChecklist;
    assert.equal(typeof rc.intro, "string", "intro must be string");
    assert.equal(typeof rc.failureThreshold, "number", "failureThreshold must be number");
    assert.ok(rc.failureThreshold >= 1, "failureThreshold must be >= 1");
    assert.ok(Array.isArray(rc.items), "items must be array");
    assert.ok(rc.items.length >= 1, "items must have at least 1 entry (schema minItems: 1)");
    for (const item of rc.items) {
      assert.equal(typeof item.title, "string", "Checklist item must use { title } shape");
      assert.equal(item.value, undefined, "Checklist item must not have raw 'value' key");
      assert.equal(item.provenance, undefined, "Checklist item must not have 'provenance'");
    }
  }
});

test("buildOverlayFromEvidence respects section filter", () => {
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: [],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [{ file: ".eslintrc.json", tool: "eslint" }],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const validationOnly = buildOverlayFromEvidence(evidence, { section: "validation" });
  assert.ok(validationOnly.workspaceInstructions?.validation, "Should have validation");
  assert.equal(validationOnly.workspaceInstructions?.sections, undefined, "Should not have sections");
  assert.equal(validationOnly.reviewChecklist, undefined, "Should not have reviewChecklist");

  const rulesOnly = buildOverlayFromEvidence(evidence, { section: "rules" });
  assert.equal(rulesOnly.workspaceInstructions?.validation, undefined, "Should not have validation");
  assert.ok(rulesOnly.workspaceInstructions?.sections, "Should have sections");
});

// ===========================================================================
// Integration: infer -> overlay -> validate (T6)
// ===========================================================================

test("buildOverlayFromEvidence output passes validateSpec when complete", () => {
  // Un overlay senza `extends` ha bisogno di schemaVersion e project per
  // passare la validazione.  Qui verifichiamo che un overlay completo
  // (arricchito con i campi minimi) superi la validazione schema.
  const evidence = {
    base: {
      packageManager: "npm", runtimes: ["Node.js"], components: ["api: Express"],
      signals: [{ type: "config", file: "tsconfig.json", detail: "TypeScript project" }],
    },
    scripts: [
      { command: "npm run test", source: "package.json scripts.test", raw: "jest" },
      { command: "npm run lint", source: "package.json scripts.lint", raw: "eslint ." },
    ],
    pyprojectTools: { scripts: [], tools: [] },
    ciSteps: [],
    linterConfigs: [{ file: ".eslintrc.json", tool: "eslint" }],
    conventions: [],
    preCommitHooks: [],
    makeTargets: [],
  };

  const overlay = buildOverlayFromEvidence(evidence);

  // Arricchiamo con i campi obbligatori per uno spec completo
  const fullSpec = {
    schemaVersion: 1,
    project: {
      name: "integration-test",
      summary: "Integration test overlay.",
      components: ["api: Express"],
    },
    ...overlay,
    skills: [],
  };

  // Non deve lanciare eccezioni
  assert.doesNotThrow(
    () => validateSpec(fullSpec, "integration-test-overlay"),
    "Complete overlay enriched with required fields should pass schema validation",
  );
});

// ===========================================================================
// CLI infer-overlay e2e tests (T7)
// ===========================================================================

test("infer-overlay command outputs JSON to stdout", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "overlay-stdout-test",
      scripts: { test: "jest", lint: "eslint ." },
    }), "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer-overlay", "--target", tempDir,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.workspaceInstructions, "Should have workspaceInstructions");
    assert.ok(Array.isArray(parsed.workspaceInstructions.validation),
      "Should have validation array");
    // Nessuna traccia di provenance nell'output
    for (const v of parsed.workspaceInstructions.validation) {
      assert.equal(typeof v, "string", "Validation entries in overlay must be plain strings");
    }
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer-overlay command writes to --output file", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "overlay-file-test",
      scripts: { test: "vitest", build: "tsc" },
    }), "utf8");
    writeFileSync(join(tempDir, "tsconfig.json"), "{}", "utf8");

    const outputPath = join(tempDir, "overlay.json");
    const result = spawnSync(process.execPath, [
      scriptPath, "infer-overlay", "--target", tempDir, "--output", outputPath,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.ok(existsSync(outputPath), "Output file should be written");
    const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.ok(parsed.workspaceInstructions, "Should have workspaceInstructions");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer-overlay command includes extends when --base is provided", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "overlay-base-test",
      scripts: { test: "jest" },
    }), "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer-overlay", "--target", tempDir, "--base", "specs/base-spec.yaml",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.extends, "specs/base-spec.yaml");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer-overlay command respects --section filter", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({
      name: "overlay-section-test",
      scripts: { test: "jest", lint: "eslint ." },
    }), "utf8");
    writeFileSync(join(tempDir, ".eslintrc.json"), "{}", "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath, "infer-overlay", "--target", tempDir, "--section", "validation",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0,
      `Expected success.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.workspaceInstructions?.validation, "Should have validation");
    assert.equal(parsed.workspaceInstructions?.sections, undefined,
      "Should not have sections when filtered to validation");
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("infer-overlay command fails without --target", () => {
  const result = spawnSync(process.execPath, [
    scriptPath, "infer-overlay",
  ], { encoding: "utf8" });

  assert.notEqual(result.status, 0, "Should fail without --target");
  assert.match(result.stderr, /target/i);
});
