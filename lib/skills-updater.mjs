// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Skill refresh workflow.
//
// Reads the provenance lockfile, re-resolves each tracked skill from its
// original source, computes a fresh checksum, and either reports the diff
// (--dry-run) or applies the update.  Unreachable sources emit a warning
// without failing the overall run.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { readLockfile, computeImportChecksum, writeLockfileEntries } from "./lockfile.mjs";
import { readExternalSkill, resolveSkillImportSource } from "./skills.mjs";
import { readJsonYaml, stringifyJsonYaml } from "./utils.mjs";
import { validateSkill } from "./validation.mjs";
import { resolveLayeredSpecWithMeta } from "./merging.mjs";

// ---------------------------------------------------------------------------
// Risultato per singola skill
// ---------------------------------------------------------------------------

/**
 * Esito possibile per ogni skill durante un ciclo di refresh.
 *
 * @typedef {"up-to-date" | "changed" | "unreachable" | "error"} RefreshStatus
 */

/**
 * @typedef {object} RefreshResult
 * @property {string}        slug
 * @property {RefreshStatus} status
 * @property {string}        [oldVersion]
 * @property {string}        [newVersion]
 * @property {string}        [oldChecksum]
 * @property {string}        [newChecksum]
 * @property {string}        [message]
 */

// ---------------------------------------------------------------------------
// Re-risoluzione sorgente dal record di provenienza
// ---------------------------------------------------------------------------

/**
 * Ricostruisce la sorgente di import dal record lockfile.
 *
 * Supporta:
 * - local-directory / local-skill-md / local-file → path locale
 * - github → URL GitHub (ricostruito da repoUrl + ref + treePath)
 * - skills / skillfish → source originale + skill name
 *
 * Returns: { source, options } pronti per resolveSkillImportSource,
 *          oppure null se il sourceType non e' gestibile.
 */
function reResolveArgs(entry, specDir) {
  const st = entry.sourceType;

  if (st === "local-directory" || st === "local-skill-md" || st === "local-file" || st === "local-json") {
    // resolvedFrom puo' essere relativo allo specDir
    const candidate = resolve(specDir, entry.resolvedFrom ?? entry.source);
    return { source: candidate, options: { provider: "local" } };
  }

  if (st === "github") {
    // Ricostruisce l'URL tree per consentire un git clone shallow
    let url = entry.source;
    if (!url && entry.repoUrl) {
      const base = entry.repoUrl.replace(/\.git$/, "");
      const ref = entry.ref ?? "main";
      url = entry.treePath
        ? `${base}/tree/${ref}/${entry.treePath}`
        : base;
    }
    if (!url) return null;
    return {
      source: url,
      options: {
        provider: "github",
        skill: entry.skill ?? entry.locator ?? null,
      },
    };
  }

  if (st === "skills" || st === "skillfish") {
    if (!entry.locator || !entry.skill) return null;
    return {
      source: entry.locator,
      options: {
        provider: st,
        skill: entry.skill,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Diff semantico compatto
// ---------------------------------------------------------------------------

/**
 * Produce un array di righe di diff leggibili tra il vecchio e il nuovo
 * record (versione, checksum, regole aggiunte/rimosse).
 */
function buildDiffLines(entry, freshSkill, newChecksum) {
  const lines = [];

  if (entry.version && freshSkill.version && entry.version !== freshSkill.version) {
    lines.push(`  version: ${entry.version} → ${freshSkill.version}`);
  }

  lines.push(`  checksum: ${shorten(entry.checksum)} → ${shorten(newChecksum)}`);

  const oldRuleCount = countSpecRules(entry.slug, null);
  const newRuleCount = freshSkill.rules?.length ?? 0;
  if (oldRuleCount !== null && oldRuleCount !== newRuleCount) {
    lines.push(`  rules: ${oldRuleCount} → ${newRuleCount}`);
  }

  return lines;
}

function shorten(hash) {
  if (!hash) return "(none)";
  return hash.length > 20 ? `${hash.slice(0, 18)}…` : hash;
}

function countSpecRules(_slug, _spec) {
  // Non abbiamo accesso diretto alla spec qui; il caller puo' fornirla.
  return null;
}

// ---------------------------------------------------------------------------
// Core: refreshSkills
// ---------------------------------------------------------------------------

/**
 * Esegue il ciclo di refresh di tutte le skill (o di una sola) censite
 * nel lockfile.
 *
 * Args:
 *   specPath:   percorso assoluto o relativo della canonical spec.
 *   lockfilePath: percorso del lockfile (default: accanto alla spec).
 *   dryRun:     se true non scrive nulla su disco.
 *   slugFilter: se specificato, aggiorna solo quella skill.
 *
 * Returns:
 *   Array di RefreshResult — un elemento per ogni skill processata.
 */
export function refreshSkills({ specPath, lockfilePath, dryRun = false, slugFilter = null }) {
  const absoluteSpecPath = resolve(specPath);
  const specDir = dirname(absoluteSpecPath);
  const absoluteLockfilePath = resolve(lockfilePath);

  if (!existsSync(absoluteLockfilePath)) {
    throw new Error(
      `Lockfile not found: ${lockfilePath}\n` +
      "Import at least one skill with import-skill or add-skill first.",
    );
  }

  const lockfile = readLockfile(absoluteLockfilePath);
  const entries = slugFilter
    ? lockfile.skills.filter((e) => e.slug === slugFilter)
    : lockfile.skills;

  if (entries.length === 0) {
    const message = slugFilter
      ? `No lockfile entry for skill "${slugFilter}".`
      : "Lockfile contains no tracked skills.";
    throw new Error(message);
  }

  // Resolve the full layer chain to validate that the extends chain is
  // intact.  The raw leaf spec is the only file we write back to —
  // base layers are never touched.
  resolveLayeredSpecWithMeta(absoluteSpecPath);
  const leafSpec = readJsonYaml(absoluteSpecPath);
  if (!Array.isArray(leafSpec.skills)) {
    leafSpec.skills = [];
  }

  /** @type {RefreshResult[]} */
  const results = [];
  const updatedLockEntries = [];
  let specDirty = false;

  for (const entry of entries) {
    const resolveArgs = reResolveArgs(entry, specDir);

    if (!resolveArgs) {
      results.push({
        slug: entry.slug,
        status: "error",
        message: `Cannot re-resolve sourceType "${entry.sourceType}".`,
      });
      continue;
    }

    let resolved = null;
    try {
      resolved = resolveSkillImportSource(resolveArgs.source, resolveArgs.options);
    } catch (err) {
      results.push({
        slug: entry.slug,
        status: "unreachable",
        message: err.message,
      });
      continue;
    }

    try {
      // Verifica che la sorgente sia ancora raggiungibile
      if (!existsSync(resolved.importPath)) {
        results.push({
          slug: entry.slug,
          status: "unreachable",
          message: `Source path no longer exists: ${resolved.importPath}`,
        });
        if (resolved.cleanupPath) {
          rmSync(resolved.cleanupPath, { recursive: true, force: true });
        }
        continue;
      }

      // Calcola il nuovo checksum dall'artifact scaricato
      const newChecksum = computeImportChecksum(resolved.importPath);

      if (newChecksum === entry.checksum) {
        results.push({ slug: entry.slug, status: "up-to-date" });
        continue;
      }

      // Checksum diverso: la skill e' cambiata upstream
      const freshSkills = readExternalSkill(resolved.importPath);
      const freshSkill = freshSkills.find((s) => s.slug === entry.slug) ?? freshSkills[0];

      if (!freshSkill) {
        results.push({
          slug: entry.slug,
          status: "error",
          message: "Re-resolved source no longer contains a skill with this slug.",
        });
        continue;
      }

      validateSkill(freshSkill, `update-skills:${entry.slug}`);

      const diffLines = buildDiffLines(entry, freshSkill, newChecksum);

      if (dryRun) {
        results.push({
          slug: entry.slug,
          status: "changed",
          oldVersion: entry.version,
          newVersion: freshSkill.version,
          oldChecksum: entry.checksum,
          newChecksum,
          message: diffLines.join("\n"),
        });
        continue;
      }

      // Write to the leaf spec only.  If the skill already exists in
      // the leaf, replace in-place; otherwise append (materializing an
      // override of a base-layer skill into the leaf).
      const leafIndex = leafSpec.skills.findIndex((s) => s.slug === entry.slug);
      if (leafIndex >= 0) {
        leafSpec.skills[leafIndex] = freshSkill;
      } else {
        leafSpec.skills.push(freshSkill);
      }
      specDirty = true;

      // Aggiorna il lock entry
      updatedLockEntries.push({
        ...entry,
        version: freshSkill.version,
        checksum: newChecksum,
        importedAt: new Date().toISOString(),
      });

      results.push({
        slug: entry.slug,
        status: "changed",
        oldVersion: entry.version,
        newVersion: freshSkill.version,
        oldChecksum: entry.checksum,
        newChecksum,
        message: diffLines.join("\n"),
      });
    } finally {
      if (resolved?.cleanupPath) {
        rmSync(resolved.cleanupPath, { recursive: true, force: true });
      }
    }
  }

  // Scrivi solo se non in dry-run e c'e' qualcosa di nuovo
  if (!dryRun) {
    if (specDirty) {
      writeFileSync(absoluteSpecPath, stringifyJsonYaml(leafSpec), "utf8");
    }
    if (updatedLockEntries.length > 0) {
      writeLockfileEntries(absoluteLockfilePath, updatedLockEntries);
    }
  }

  return results;
}
