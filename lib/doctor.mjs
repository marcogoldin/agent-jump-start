// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// ---------------------------------------------------------------------------
// doctor — diagnose weak, generic, or incomplete spec content
// ---------------------------------------------------------------------------
// Returns an array of { severity, area, message } findings.
// severity: "warning" (should fix) or "info" (suggestion).
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /\breplace this\b/i,
  /\breplace with\b/i,
  /\btodo\b/i,
  /\bplaceholder\b/i,
  /\bfill in\b/i,
  /\byour project\b/i,
  /\byour repo\b/i,
];

function looksLikePlaceholder(text) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

const GENERIC_VALIDATION = [
  /^document the baseline/i,
  /^run the repository/i,
  /^run relevant test/i,
  /^run lint$/i,
  /^run tests$/i,
  /^npm test$/i,
];

function looksGenericValidation(text) {
  return GENERIC_VALIDATION.some((re) => re.test(text.trim()));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function diagnoseSpec(spec) {
  const findings = [];

  function warn(area, message) {
    findings.push({ severity: "warning", area, message });
  }

  function info(area, message) {
    findings.push({ severity: "info", area, message });
  }

  // --- project ---
  const project = spec.project;
  if (project) {
    if (looksLikePlaceholder(project.name ?? "")) {
      warn("project.name", "Still contains placeholder text. Replace with the real project name.");
    }
    if (looksLikePlaceholder(project.summary ?? "")) {
      warn("project.summary", "Still contains placeholder text. Replace with a real project summary.");
    }
    if (!Array.isArray(project.components) || project.components.length === 0) {
      warn("project.components", "No components defined. List the real applications, services, or packages.");
    } else {
      for (const [index, component] of project.components.entries()) {
        if (looksLikePlaceholder(component)) {
          warn(`project.components[${index}]`, "Still contains placeholder text.");
        }
      }
    }
  }

  // --- workspaceInstructions ---
  const ws = spec.workspaceInstructions;
  if (ws) {
    // validation commands
    if (!Array.isArray(ws.validation) || ws.validation.length === 0) {
      warn("workspaceInstructions.validation", "No validation commands defined. Add the real lint, build, and test commands.");
    } else {
      const allGeneric = ws.validation.every((v) => looksGenericValidation(v));
      if (allGeneric) {
        warn("workspaceInstructions.validation", "All validation commands look generic. Replace with the real commands for this repository.");
      }
      for (const [index, cmd] of ws.validation.entries()) {
        if (looksLikePlaceholder(cmd)) {
          warn(`workspaceInstructions.validation[${index}]`, "Still contains placeholder text.");
        }
      }
    }

    // sections
    if (!Array.isArray(ws.sections) || ws.sections.length === 0) {
      warn("workspaceInstructions.sections", "No instruction sections defined.");
    } else {
      if (ws.sections.length === 1 && ws.sections[0].title === "General rules") {
        info("workspaceInstructions.sections", "Only a single 'General rules' section exists. Consider adding stack-specific sections.");
      }
      for (const [sIndex, section] of ws.sections.entries()) {
        for (const [rIndex, rule] of (section.rules ?? []).entries()) {
          if (looksLikePlaceholder(rule)) {
            warn(`workspaceInstructions.sections[${sIndex}].rules[${rIndex}]`, "Still contains placeholder text.");
          }
        }
      }
    }

    // packageManagerRule
    if (ws.packageManagerRule && looksLikePlaceholder(ws.packageManagerRule)) {
      warn("workspaceInstructions.packageManagerRule", "Still contains placeholder text.");
    }

    // runtimeRule
    if (ws.runtimeRule && looksLikePlaceholder(ws.runtimeRule)) {
      warn("workspaceInstructions.runtimeRule", "Still contains placeholder text.");
    }
  }

  // --- reviewChecklist ---
  const rc = spec.reviewChecklist;
  if (rc) {
    if (rc.intro && looksLikePlaceholder(rc.intro)) {
      warn("reviewChecklist.intro", "Still contains placeholder text.");
    }
    if (Array.isArray(rc.items)) {
      for (const [index, item] of rc.items.entries()) {
        if (looksLikePlaceholder(item.title ?? "")) {
          warn(`reviewChecklist.items[${index}].title`, "Still contains placeholder text.");
        }
      }
    }
  } else {
    info("reviewChecklist", "No review checklist defined. Consider adding one for quality verification.");
  }

  // --- skills ---
  if (!Array.isArray(spec.skills) || spec.skills.length === 0) {
    info("skills", "No skills defined. Consider importing skills relevant to the repository stack.");
  }

  return findings;
}
