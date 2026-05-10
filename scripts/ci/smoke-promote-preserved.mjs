// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const tempDir = mkdtempSync(join(tmpdir(), "ajs-smoke-promote-preserved-"));

try {
  const specPath = join(tempDir, "canonical-spec.yaml");
  writeFileSync(specPath, `${JSON.stringify({
    schemaVersion: 1,
    project: { name: "SmokeRepo", summary: "Promote preserved smoke", components: [] },
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

  writeFileSync(join(tempDir, "CLAUDE.md"), "## Validation\n\n```bash\nnpm run lint\n```\n", "utf8");
  writeFileSync(join(tempDir, "AGENTS.md"), "## TypeScript rules\n- Keep strict mode enabled.\n", "utf8");

  const keepResult = run(["sync", "--spec", specPath, "--target", tempDir, "--keep-existing"]);
  expectStatus(keepResult, 2, "sync --keep-existing");
  assert.match(keepResult.stdout, /promote-preserved/);
  assert.match(keepResult.stdout, /Discard the preserved hand-edit/);

  const checkResult = run(["check", "--spec", specPath, "--target", tempDir]);
  expectStatus(checkResult, 2, "check after preserved sync");
  assert.match(checkResult.stdout, /promote-preserved/);

  const proposalPath = join(tempDir, "promote-preserved-proposal.json");
  expectSuccess(
    run(["promote-preserved", "--spec", specPath, "--target", tempDir, "--dry-run", "--output", proposalPath]),
    "promote-preserved --dry-run",
  );

  const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
  assert.deepEqual(proposal.sources.map((entry) => entry.path).sort(), ["AGENTS.md", "CLAUDE.md"]);

  const selectionPath = join(tempDir, "promote-preserved-selection.json");
  writeFileSync(selectionPath, `${JSON.stringify({
    version: 1,
    decisions: [
      { path: "CLAUDE.md", choice: "primary" },
      { path: "AGENTS.md", choice: "merge", mergeInto: "CLAUDE.md" },
    ],
  }, null, 2)}\n`, "utf8");

  expectSuccess(
    run([
      "promote-preserved",
      "--spec", specPath,
      "--target", tempDir,
      "--apply",
      "--selection", selectionPath,
    ]),
    "promote-preserved --apply",
  );

  const updatedSpec = readFileSync(specPath, "utf8");
  assert.match(updatedSpec, /npm run lint/);
  assert.match(updatedSpec, /Keep strict mode enabled/);

  expectSuccess(run(["sync", "--spec", specPath, "--target", tempDir, "--force"]), "sync --force after promote-preserved");
  expectSuccess(run(["check", "--spec", specPath, "--target", tempDir]), "final check");

  console.log("Promote-preserved smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}