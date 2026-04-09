// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { TOOL_VERSION } from "./constants.mjs";
import { ensureDirectory, stringifyJsonYaml } from "./utils.mjs";

const LOCKFILE_SCHEMA_VERSION = 1;
const LOCKFILE_NAME = "agent-jump-start.lock.json";

function sha256ForBuffer(buffer) {
  return `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
}

function sha256ForFile(filePath) {
  return sha256ForBuffer(readFileSync(filePath));
}

function sha256ForDirectory(dirPath) {
  const hash = createHash("sha256");

  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name);
      const relativePath = relative(dirPath, absolutePath).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}\n`);
        walk(absolutePath);
        continue;
      }
      hash.update(`file:${relativePath}\n`);
      hash.update(readFileSync(absolutePath));
      hash.update("\n");
    }
  }

  walk(dirPath);
  return `sha256:${hash.digest("hex")}`;
}

export function defaultLockfilePath(specPathInput) {
  const absoluteSpecPath = resolve(specPathInput);
  return join(dirname(absoluteSpecPath), LOCKFILE_NAME);
}

export function computeImportChecksum(importPath) {
  const absoluteImportPath = resolve(importPath);
  const stats = statSync(absoluteImportPath);
  if (stats.isDirectory()) {
    return sha256ForDirectory(absoluteImportPath);
  }
  return sha256ForFile(absoluteImportPath);
}

export function readLockfile(lockfilePath) {
  const absolutePath = resolve(lockfilePath);
  if (!existsSync(absolutePath)) {
    return {
      schemaVersion: LOCKFILE_SCHEMA_VERSION,
      generatedBy: `Agent Jump Start v${TOOL_VERSION}`,
      skills: [],
    };
  }

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (parsed.schemaVersion !== LOCKFILE_SCHEMA_VERSION || !Array.isArray(parsed.skills)) {
    throw new Error(`Invalid lockfile: ${lockfilePath}`);
  }
  return parsed;
}

function stablePathLabel(pathValue, baseDir) {
  const absolutePath = resolve(pathValue);
  const relativePath = relative(baseDir, absolutePath);
  if (relativePath && !relativePath.startsWith("..") && !relativePath.startsWith("/")) {
    return relativePath.replaceAll("\\", "/");
  }
  return absolutePath;
}

export function makeProvenanceRecord(skill, importPath, sourceInfo, specPathInput) {
  const absoluteSpecPath = resolve(specPathInput);
  const specDir = dirname(absoluteSpecPath);
  const checksum = computeImportChecksum(importPath);

  const record = {
    slug: skill.slug,
    version: skill.version,
    sourceType: sourceInfo.sourceType,
    source: sourceInfo.source,
    checksum,
    importedAt: new Date().toISOString(),
  };

  if (sourceInfo.provider) record.provider = sourceInfo.provider;
  if (sourceInfo.skill) record.skill = sourceInfo.skill;
  if (sourceInfo.repoUrl) record.repoUrl = sourceInfo.repoUrl;
  if (sourceInfo.ref) record.ref = sourceInfo.ref;
  if (sourceInfo.treePath) record.treePath = sourceInfo.treePath;
  if (sourceInfo.locator) record.locator = sourceInfo.locator;
  if (sourceInfo.resolvedFrom) {
    record.resolvedFrom = stablePathLabel(sourceInfo.resolvedFrom, specDir);
  } else {
    record.resolvedFrom = stablePathLabel(importPath, specDir);
  }

  return record;
}

export function writeLockfileEntries(lockfilePath, entries) {
  const absolutePath = resolve(lockfilePath);
  const lockfile = readLockfile(absolutePath);
  const bySlug = new Map((lockfile.skills ?? []).map((entry) => [entry.slug, entry]));

  for (const entry of entries) {
    bySlug.set(entry.slug, entry);
  }

  const nextLockfile = {
    schemaVersion: LOCKFILE_SCHEMA_VERSION,
    generatedBy: `Agent Jump Start v${TOOL_VERSION}`,
    skills: Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  ensureDirectory(absolutePath);
  writeFileSync(absolutePath, stringifyJsonYaml(nextLockfile), "utf8");
  return nextLockfile;
}
