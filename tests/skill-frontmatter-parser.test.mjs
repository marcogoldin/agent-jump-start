// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import assert from "node:assert/strict";
import test from "node:test";

import { parseSkillMdFrontmatter } from "../lib/skills.mjs";
import { validateSkillMdFrontmatter } from "../lib/validation.mjs";

function frontmatter(yaml) {
  return parseSkillMdFrontmatter(`---\n${yaml}\n---\n\n# Body\n`).frontmatter;
}

test("plain inline scalar is parsed as a string", () => {
  const fm = frontmatter(`name: test\ndescription: A short description.`);
  assert.equal(fm.name, "test");
  assert.equal(fm.description, "A short description.");
});

test("folded block scalar (>) collapses to a single-line string for description", () => {
  const fm = frontmatter(
    `name: project-mgmt\n` +
    `description: >\n` +
    `  Spec-driven development with persistent markdown planning.\n` +
    `  Use when: complex tasks (>5 tool calls), multi-step work, GitHub issues,\n` +
    `  research tasks, building projects.\n`,
  );
  assert.equal(
    fm.description,
    "Spec-driven development with persistent markdown planning. Use when: complex tasks (>5 tool calls), multi-step work, GitHub issues, research tasks, building projects.",
  );
});

test("literal block scalar (|) is collapsed for single-line fields like description", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: |\n` +
    `  First line.\n` +
    `  Second line.\n`,
  );
  assert.equal(fm.description, "First line. Second line.");
});

test("folded scalar preserves paragraph breaks as spaces in normalized single-line fields", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: >\n` +
    `  Paragraph one sentence.\n` +
    `\n` +
    `  Paragraph two sentence.\n`,
  );
  assert.equal(fm.description, "Paragraph one sentence. Paragraph two sentence.");
});

test("strip chomping (|-) removes trailing newlines", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: |-\n` +
    `    line1\n` +
    `    line2\n`,
  );
  assert.equal(fm.metadata.notes, "line1\nline2");
});

test("keep chomping (|+) preserves trailing empty lines between sibling keys", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: |+\n` +
    `    line1\n` +
    `\n` +
    `  other: tail\n`,
  );
  assert.equal(fm.metadata.notes, "line1\n\n");
  assert.equal(fm.metadata.other, "tail");
});

test("clip chomping (default) adds a single trailing newline on non single-line fields", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: |\n` +
    `    line1\n` +
    `    line2\n`,
  );
  assert.equal(fm.metadata.notes, "line1\nline2\n");
});

test("block scalars coexist with following top-level keys", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: >\n` +
    `  multi line\n` +
    `  description\n` +
    `license: MIT\n`,
  );
  assert.equal(fm.description, "multi line description");
  assert.equal(fm.license, "MIT");
});

test("real-world superbenefit/sb-marketplace project-mgmt SKILL.md frontmatter passes validation", () => {
  const fm = frontmatter(
    `name: project-mgmt\n` +
    `description: >\n` +
    `  Spec-driven development with persistent markdown planning.\n` +
    `  Use when: complex tasks (>5 tool calls), multi-step work, GitHub issues,\n` +
    `  research tasks, building projects. Creates plan.md, spec.md, findings.md,\n` +
    `  progress.md in .project/{issue#}/ directory.\n`,
  );
  const errors = validateSkillMdFrontmatter(fm, "SKILL.md");
  assert.deepEqual(errors, []);
  assert.equal(typeof fm.description, "string");
  assert.ok(fm.description.length > 0);
  assert.ok(!fm.description.includes("\n"), "description must be a single line");
});

test("validator error message contains actionable hint when description is missing", () => {
  const errors = validateSkillMdFrontmatter({ name: "demo" }, "path/to/SKILL.md");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /description is required/);
  assert.match(errors[0], /Received: undefined/);
});

test("validator error message calls out empty-object case with block scalar hint", () => {
  const errors = validateSkillMdFrontmatter(
    { name: "demo", description: {} },
    "path/to/SKILL.md",
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Received: empty object/);
  assert.match(errors[0], /block scalar/);
});

test("block scalar header with an inline YAML comment is recognised (no silent corruption)", () => {
  // Regression: previously the parser fell back to plain-scalar parsing and
  // silently captured the literal string "> # comment", dropping the body.
  const fm = frontmatter(
    `name: demo\n` +
    `description: > # trailing comment\n` +
    `  hello\n` +
    `  world\n`,
  );
  assert.equal(fm.description, "hello world");
  const errors = validateSkillMdFrontmatter(fm, "SKILL.md");
  assert.deepEqual(errors, []);
});

test("literal block scalar with chomping and an inline comment is recognised", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: |- #keep tight\n` +
    `    line1\n` +
    `    line2\n`,
  );
  assert.equal(fm.metadata.notes, "line1\nline2");
});

test("folded scalar preserves line breaks around more-indented lines (YAML 1.2)", () => {
  // Regression: folded scalars previously flattened every adjacent non-empty
  // line with a space, corrupting content that relied on indentation (e.g.
  // code snippets or bullet-indented paragraphs inside a description).
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: >\n` +
    `    line1\n` +
    `      indented\n` +
    `    line2\n`,
  );
  assert.equal(fm.metadata.notes, "line1\n  indented\nline2\n");
});

test("folded scalar keeps consecutive more-indented lines together with line breaks", () => {
  const fm = frontmatter(
    `name: demo\n` +
    `description: "x"\n` +
    `metadata:\n` +
    `  notes: >\n` +
    `    intro\n` +
    `      step 1\n` +
    `      step 2\n` +
    `    outro\n`,
  );
  assert.equal(fm.metadata.notes, "intro\n  step 1\n  step 2\noutro\n");
});
