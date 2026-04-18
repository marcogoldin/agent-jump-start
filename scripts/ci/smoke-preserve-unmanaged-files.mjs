// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// Operator smoke: Agent Jump Start must never silently overwrite pre-existing
// agent instruction files on first init/sync/render. Seeds a scratch repo
// with unmanaged CLAUDE.md / AGENTS.md / GEMINI.md / Copilot / Cursor /
// Windsurf / Cline / Roo / Continue / Amazon Q / Junie / Aider sentinels,
// then exercises the three
// writing commands in non-interactive mode with the three explicit
// conflict-resolution flags.
// ---------------------------------------------------------------------------

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(repoRoot, "scripts/agent-jump-start.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    cwd: options.cwd,
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

const SENTINELS = [
  ["CLAUDE.md", "SENTINEL-CLAUDE-PRE-EXISTING"],
  ["AGENTS.md", "SENTINEL-AGENTS-PRE-EXISTING"],
  ["AGENT.md", "SENTINEL-AGENT-SINGULAR-PRE-EXISTING"],
  ["GEMINI.md", "SENTINEL-GEMINI-PRE-EXISTING"],
  [".github/copilot-instructions.md", "SENTINEL-COPILOT-PRE-EXISTING"],
  [".github/instructions/general.instructions.md", "SENTINEL-COPILOT-PATHSPEC-PRE-EXISTING"],
  [".cursor/rules/agent-instructions.mdc", "SENTINEL-CURSOR-PRE-EXISTING"],
  [".amazonq/rules/general.md", "SENTINEL-AMAZONQ-PRE-EXISTING"],
  [".junie/AGENTS.md", "SENTINEL-JUNIE-AGENTS-PRE-EXISTING"],
  [".junie/guidelines.md", "SENTINEL-JUNIE-GUIDELINES-PRE-EXISTING"],
  [".windsurf/rules/general.md", "SENTINEL-WINDSURF-RULES-PRE-EXISTING"],
  [".windsurfrules", "SENTINEL-WINDSURF-PRE-EXISTING"],
  [".clinerules/general.md", "SENTINEL-CLINE-PRE-EXISTING"],
  [".roo/rules/agent-instructions.md", "SENTINEL-ROO-PRE-EXISTING"],
  [".roorules", "SENTINEL-ROO-LEGACY-PRE-EXISTING"],
  [".continue/rules/agent-instructions.md", "SENTINEL-CONTINUE-PRE-EXISTING"],
  ["CONVENTIONS.md", "SENTINEL-AIDER-PRE-EXISTING"],
];

function seed(target) {
  for (const [relPath, sentinel] of SENTINELS) {
    const abs = join(target, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${sentinel}\n`, "utf8");
  }
}

function writeMinimalSpec(target) {
  const specPath = join(target, "spec.yaml");
  const spec = {
    schemaVersion: 1,
    project: { name: "SmokeRepo", summary: "Preservation smoke", components: [] },
    workspaceInstructions: {
      sections: [{ title: "General rules", rules: ["Keep changes small."] }],
      validation: ["npm test"],
    },
    reviewChecklist: {
      intro: "Checklist",
      failureThreshold: 1,
      items: [{ title: "Check" }],
    },
  };
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  return specPath;
}

function expectAllSentinelsPresent(target) {
  for (const [relPath, sentinel] of SENTINELS) {
    const content = readFileSync(join(target, relPath), "utf8");
    assert.match(content, new RegExp(sentinel), `${relPath} must still carry its sentinel`);
  }
}

function scenario(name, fn) {
  const dir = mkdtempSync(join(tmpdir(), `ajs-preserve-${name}-`));
  try {
    fn(dir);
    console.log(`  ✔ ${name}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("Preservation smoke — pre-existing agent files must survive unless the operator opts in:");

scenario("init-refuses-non-interactive", (dir) => {
  seed(dir);
  const result = run(["init", "--target", dir, "--non-interactive"]);
  assert.notEqual(result.status, 0, "non-interactive init must fail closed on unmanaged collisions");
  assert.match(
    result.stdout + result.stderr,
    /init refused to overwrite/,
    "operator must see an explicit refusal message",
  );
  expectAllSentinelsPresent(dir);
  // Detect-before-write: no framework/spec side effects on refusal.
  assert.ok(!existsSync(join(dir, "docs/agent-jump-start")),
    "framework directory must not be created when init is refused");
});

scenario("init-force-overwrites-with-explicit-consent", (dir) => {
  seed(dir);
  const result = run(["init", "--target", dir, "--non-interactive", "--force"]);
  assert.equal(result.status, 0, `init --force must succeed. STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  for (const [relPath] of SENTINELS) {
    assert.doesNotMatch(readFileSync(join(dir, relPath), "utf8"), /SENTINEL-/, `${relPath} must be overwritten`);
  }
});

scenario("init-backup-preserves-originals", (dir) => {
  seed(dir);
  const result = run(["init", "--target", dir, "--non-interactive", "--backup"]);
  assert.equal(result.status, 0);
  const claudeBackups = readdirSync(dir).filter((n) => n.startsWith("CLAUDE.md.ajs-backup-"));
  assert.equal(claudeBackups.length, 1, "a single CLAUDE.md backup must exist");
  assert.match(readFileSync(join(dir, claudeBackups[0]), "utf8"), /SENTINEL-CLAUDE-PRE-EXISTING/);
});

scenario("init-keep-existing-leaves-files-untouched", (dir) => {
  seed(dir);
  const result = run(["init", "--target", dir, "--non-interactive", "--keep-existing"]);
  assert.equal(result.status, 0);
  expectAllSentinelsPresent(dir);
});

scenario("sync-refuses-non-interactive", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["sync", "--spec", specPath, "--target", dir]);
  assert.notEqual(result.status, 0, "non-interactive sync must fail closed on unmanaged collisions");
  assert.match(
    result.stdout + result.stderr,
    /Refused to overwrite pre-existing files|does not carry the Agent Jump Start provenance marker/,
    "operator must see an explicit refusal message",
  );
  expectAllSentinelsPresent(dir);
});

scenario("render-refuses-non-interactive", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["render", "--spec", specPath, "--target", dir]);
  assert.notEqual(result.status, 0);
  expectAllSentinelsPresent(dir);
});

scenario("sync-force-overwrites-with-explicit-consent", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["sync", "--spec", specPath, "--target", dir, "--force"]);
  assert.equal(result.status, 0, `--force must succeed. STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  for (const [relPath] of SENTINELS) {
    assert.doesNotMatch(readFileSync(join(dir, relPath), "utf8"), /SENTINEL-/, `${relPath} must be overwritten`);
  }
});

scenario("sync-backup-preserves-originals", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["sync", "--spec", specPath, "--target", dir, "--backup"]);
  assert.equal(result.status, 0);
  const claudeBackups = readdirSync(dir).filter((n) => n.startsWith("CLAUDE.md.ajs-backup-"));
  assert.equal(claudeBackups.length, 1, "a single CLAUDE.md backup must exist");
  assert.match(readFileSync(join(dir, claudeBackups[0]), "utf8"), /SENTINEL-CLAUDE-PRE-EXISTING/);
  assert.doesNotMatch(readFileSync(join(dir, "CLAUDE.md"), "utf8"), /SENTINEL-CLAUDE-PRE-EXISTING/);
});

scenario("sync-keep-existing-leaves-files-untouched", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["sync", "--spec", specPath, "--target", dir, "--keep-existing"]);
  assert.equal(result.status, 2, "sync --keep-existing must report safe but non-converged state");
  expectAllSentinelsPresent(dir);
  assert.ok(existsSync(join(dir, "docs/agent-jump-start/generated-manifest.json")));
  const manifest = JSON.parse(readFileSync(join(dir, "docs/agent-jump-start/generated-manifest.json"), "utf8"));
  for (const [relPath] of SENTINELS) {
    assert.ok(!manifest.files.includes(relPath), `${relPath} must not appear in the manifest files list when kept`);
  }
  assert.match(result.stdout, /NOT fully converged/);
});

scenario("managed-files-still-re-sync-smoothly", (dir) => {
  const specPath = writeMinimalSpec(dir);
  assert.equal(run(["sync", "--spec", specPath, "--target", dir]).status, 0, "initial sync must succeed");
  const drifted = `${readFileSync(join(dir, "CLAUDE.md"), "utf8")}\n<!-- operator drift -->\n`;
  writeFileSync(join(dir, "CLAUDE.md"), drifted, "utf8");
  const result = run(["sync", "--spec", specPath, "--target", dir]);
  assert.equal(result.status, 0, "managed file re-sync must succeed without extra flags");
  assert.doesNotMatch(readFileSync(join(dir, "CLAUDE.md"), "utf8"), /operator drift/);
});

scenario("conflicting-flags-fail-loudly", (dir) => {
  seed(dir);
  const specPath = writeMinimalSpec(dir);
  const result = run(["sync", "--spec", specPath, "--target", dir, "--force", "--backup"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Conflicting flags/);
});

console.log("\nPreservation smoke passed.");
