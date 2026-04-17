import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { detectCanonicalAgentIds } from "../lib/agent-support.mjs";
import { mergeSpecLayers, resolveLayeredSpecWithMeta } from "../lib/merging.mjs";

const scriptPath = resolve("scripts/agent-jump-start.mjs");

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), "agent-jump-start-agent-support-"));
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

test("detectCanonicalAgentIds ignores empty tree roots and requires a matching file", () => {
  const tempDir = makeTempDir();
  try {
    mkdirSync(join(tempDir, ".cursor", "rules"), { recursive: true });
    assert.equal(detectCanonicalAgentIds(tempDir).has("cursor"), false);

    writeFileSync(join(tempDir, ".cursor", "rules", "existing-rule.mdc"), "# cursor\n", "utf8");
    assert.equal(detectCanonicalAgentIds(tempDir).has("cursor"), true);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("mergeSpecLayers lets a layered leaf override agentSupport", () => {
  const merged = mergeSpecLayers(
    makeMinimalSpec({
      agentSupport: { mode: "selected", selected: ["claude-code"] },
    }),
    {
      agentSupport: { mode: "all" },
    },
  );

  assert.deepEqual(merged.agentSupport, { mode: "all" });
});

test("update-agents updates the layered leaf spec instead of rejecting a valid overlay", () => {
  const tempDir = makeTempDir();
  try {
    const basePath = writeSpec(
      tempDir,
      makeMinimalSpec({
        agentSupport: { mode: "selected", selected: ["claude-code"] },
      }),
      "base.yaml",
    );
    const leafPath = writeSpec(
      tempDir,
      {
        extends: "./base.yaml",
        project: { name: "Leaf", summary: "Leaf overlay" },
      },
      "leaf.yaml",
    );

    const result = runCli(["update-agents", "--spec", leafPath, "--include", "cursor"]);
    expectSuccess(result);

    const leafSpec = JSON.parse(readFileSync(leafPath, "utf8"));
    assert.equal(leafSpec.extends, "./base.yaml");
    assert.deepEqual(leafSpec.agentSupport, {
      mode: "selected",
      selected: ["claude-code", "cursor"],
    });

    const resolved = resolveLayeredSpecWithMeta(leafPath);
    assert.deepEqual(resolved.merged.agentSupport, {
      mode: "selected",
      selected: ["claude-code", "cursor"],
    });
    assert.equal(existsSync(basePath), true);
  } finally {
    cleanupTempDir(tempDir);
  }
});

test("init --agents detected --keep-existing excludes conflicting selected agents and converges", () => {
  const tempDir = makeTempDir();
  try {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# existing claude instructions\n", "utf8");
    mkdirSync(join(tempDir, ".cursor", "rules"), { recursive: true });
    writeFileSync(join(tempDir, ".cursor", "rules", "existing-rule.mdc"), "# existing cursor rule\n", "utf8");

    const initResult = runCli([
      "init",
      "--target", tempDir,
      "--non-interactive",
      "--agents", "detected",
      "--keep-existing",
    ]);
    expectSuccess(initResult);

    const specPath = join(tempDir, "docs/agent-jump-start/canonical-spec.yaml");
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    assert.deepEqual(spec.agentSupport, {
      mode: "selected",
      selected: ["cursor"],
    });

    const checkResult = runCli(["check", "--spec", specPath, "--target", tempDir]);
    expectSuccess(checkResult);
  } finally {
    cleanupTempDir(tempDir);
  }
});
