import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCli = join(repoRoot, "scripts/agent-jump-start.mjs");

function runCli(cliPath, args, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    cwd: options.cwd,
    env: options.env,
    input: options.input,
  });
}

function expectSuccess(result, step) {
  assert.equal(
    result.status,
    0,
    `${step} failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
}

function makeSmokeSkill(slug, version) {
  return {
    slug,
    title: `Smoke ${slug}`,
    description: "Smoke-test skill for single-command trust.",
    version,
    appliesWhen: ["A deterministic smoke scenario is needed."],
    categories: [{ priority: 1, name: "General", impact: "HIGH", prefix: "gen-" }],
    rules: [{
      id: "gen-1",
      category: "General",
      title: "Stay deterministic",
      impact: "HIGH",
      summary: "Keep the smoke scenario deterministic and easy to diagnose.",
    }],
  };
}

const tempDir = mkdtempSync(join(tmpdir(), "ajs-single-command-trust-"));

try {
  const guidedInitInput = [
    "go-service",
    "Single-command trust smoke",
    "End-to-end smoke coverage for one-command convergence.",
    "y",
    "y",
    "y",
    "n",
    "",
  ].join("\n");

  expectSuccess(
    runCli(sourceCli, ["init", "--target", tempDir], { input: guidedInitInput }),
    "init",
  );

  const embeddedCli = join(tempDir, "docs/agent-jump-start/scripts/agent-jump-start.mjs");
  const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");

  const initialSpec = JSON.parse(readFileSync(specPath, "utf8"));
  initialSpec.workspaceInstructions.validation = ["npm test", "npm run lint"];
  initialSpec.skills = [makeSmokeSkill("smoke-before-rename", "1.0.0")];
  writeFileSync(specPath, `${JSON.stringify(initialSpec, null, 2)}\n`, "utf8");

  expectSuccess(runCli(embeddedCli, ["sync", "--spec", specPath, "--target", tempDir]), "initial sync");
  assert.ok(existsSync(join(tempDir, ".agents/skills/smoke-before-rename/SKILL.md")));

  writeFileSync(join(tempDir, "docs/agent-jump-start/agent-jump-start.lock.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedBy: "Agent Jump Start vtest",
    skills: [{
      slug: "smoke-before-rename",
      version: "0.9.0",
      sourceType: "local-directory",
      provider: "local",
      source: "./skills/smoke-before-rename",
      checksum: "sha256:stale",
      importedAt: "2026-04-01T00:00:00.000Z",
    }],
  }, null, 2)}\n`, "utf8");

  mkdirSync(join(tempDir, ".claude/skills"), { recursive: true });
  symlinkSync(join(tempDir, "missing-skill-target"), join(tempDir, ".claude/skills/broken-link"));
  rmSync(join(tempDir, ".github/copilot-instructions.md"));
  writeFileSync(join(tempDir, ".agents/AGENTS.md"), "# manual drift\n", "utf8");

  const updatedSpec = JSON.parse(readFileSync(specPath, "utf8"));
  updatedSpec.skills = [makeSmokeSkill("smoke-after-rename", "2.0.0")];
  writeFileSync(specPath, `${JSON.stringify(updatedSpec, null, 2)}\n`, "utf8");

  const syncResult = runCli(embeddedCli, ["sync", "--spec", specPath, "--target", tempDir]);
  expectSuccess(syncResult, "repair sync");
  assert.match(syncResult.stdout, /Cleaned stale files/);
  assert.match(syncResult.stdout, /Sync check passed/);

  assert.ok(!existsSync(join(tempDir, ".agents/skills/smoke-before-rename/SKILL.md")));
  assert.ok(existsSync(join(tempDir, ".agents/skills/smoke-after-rename/SKILL.md")));
  assert.ok(existsSync(join(tempDir, ".github/copilot-instructions.md")));
  assert.doesNotMatch(readFileSync(join(tempDir, ".agents/AGENTS.md"), "utf8"), /manual drift/);

  expectSuccess(runCli(embeddedCli, ["check", "--spec", specPath, "--target", tempDir]), "final check");

  console.log("Single-command trust smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
