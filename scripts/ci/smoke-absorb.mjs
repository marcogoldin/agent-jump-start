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

function expectSuccess(result, step) {
  assert.equal(result.status, 0, `${step} failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
}

function expectFailure(result, step) {
  assert.notEqual(result.status, 0, `${step} should fail.`);
}

const tempDir = mkdtempSync(join(tmpdir(), "ajs-smoke-absorb-"));

try {
  writeFileSync(join(tempDir, "CLAUDE.md"), "## Validation\n\n```bash\nnpm run lint\nnpm test\n```\n", "utf8");
  writeFileSync(join(tempDir, "AGENTS.md"), "## TypeScript rules\n- Keep strict mode enabled.\n", "utf8");

  const initRefusal = run(["init", "--target", tempDir, "--non-interactive"]);
  expectFailure(initRefusal, "init refusal");
  assert.match(initRefusal.stdout + initRefusal.stderr, /agent-jump-start absorb/);

  expectSuccess(run(["init", "--target", tempDir, "--non-interactive", "--keep-existing"]), "init --keep-existing");

  const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
  const proposalPath = join(tempDir, "absorb-proposal.json");
  expectSuccess(
    run(["absorb", "--spec", specPath, "--target", tempDir, "--dry-run", "--output", proposalPath]),
    "absorb --dry-run",
  );

  const proposal = JSON.parse(readFileSync(proposalPath, "utf8"));
  const selectionPath = join(tempDir, "absorb-selection.json");
  writeFileSync(selectionPath, `${JSON.stringify({
    version: 1,
    decisions: proposal.decisions.map((entry) => ({
      path: entry.path,
      choice: entry.path === "CLAUDE.md" ? "primary" : "merge",
      mergeInto: entry.path === "CLAUDE.md" ? null : "CLAUDE.md",
      areaOverrides: { validation: "inherit", sections: "inherit" },
    })),
  }, null, 2)}\n`, "utf8");

  expectSuccess(
    run(["absorb", "--spec", specPath, "--target", tempDir, "--apply", "--selection", selectionPath]),
    "absorb --apply",
  );
  expectSuccess(run(["sync", "--spec", specPath, "--target", tempDir, "--force"]), "sync --force");
  expectSuccess(run(["check", "--spec", specPath, "--target", tempDir]), "check");

  console.log("Absorb smoke passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
