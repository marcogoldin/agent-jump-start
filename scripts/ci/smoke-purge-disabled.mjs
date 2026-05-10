// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    input: options.input,
  });
}

function expectStatus(result, status, step) {
  assert.equal(result.status, status, `${step} failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function expectSuccess(result, step) {
  expectStatus(result, 0, step);
}

const tempDir = mkdtempSync(join(tmpdir(), "ajs-smoke-purge-disabled-"));

try {
  const specPath = join(tempDir, "canonical-spec.yaml");
  writeFileSync(specPath, `${JSON.stringify({
    schemaVersion: 1,
    project: { name: "SmokeRepo", summary: "Purge disabled smoke", components: [] },
    workspaceInstructions: {
      sections: [{ title: "General rules", rules: ["Keep changes small."] }],
      validation: ["npm test"],
    },
    reviewChecklist: {
      intro: "Checklist",
      failureThreshold: 1,
      items: [{ title: "Check" }],
    },
  }, null, 2)}\n`, "utf8");

  expectSuccess(run(["sync", "--spec", specPath, "--target", tempDir]), "initial sync");

  mkdirSync(join(tempDir, ".continue", "skills", "my-skill"), { recursive: true });
  writeFileSync(join(tempDir, ".continue", "skills", "my-skill", "SKILL.md"), "custom continue skill\n", "utf8");
  mkdirSync(join(tempDir, ".roo", "skills", "cloud-aws"), { recursive: true });
  writeFileSync(join(tempDir, ".roo", "skills", "cloud-aws", "SKILL.md"), "custom roo skill\n", "utf8");
  writeFileSync(join(tempDir, ".roorules"), "custom roo legacy\n", "utf8");

  expectSuccess(
    run(["update-agents", "--spec", specPath, "--remove", "continue-dev,roo-code"]),
    "update-agents --remove",
  );

  const purgeResult = run(["sync", "--spec", specPath, "--target", tempDir, "--purge-disabled"]);
  expectSuccess(purgeResult, "sync --purge-disabled");
  assert.match(purgeResult.stdout, /Purged disabled-agent targets/);
  assert.ok(!existsSync(join(tempDir, ".continue")), ".continue/ should be removed");
  assert.ok(!existsSync(join(tempDir, ".roo")), ".roo/ should be removed");
  assert.ok(!existsSync(join(tempDir, ".roorules")), ".roorules should be removed");

  expectSuccess(run(["check", "--spec", specPath, "--target", tempDir]), "final check");

  const manifest = JSON.parse(readFileSync(join(tempDir, "docs/agent-jump-start/generated-manifest.json"), "utf8"));
  assert.ok(!manifest.files.includes(".continue/rules/agent-instructions.md"));
  assert.ok(!manifest.files.includes(".roo/rules/agent-instructions.md"));
  assert.ok(!manifest.files.includes(".roorules"));

  console.log("Purge-disabled smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
