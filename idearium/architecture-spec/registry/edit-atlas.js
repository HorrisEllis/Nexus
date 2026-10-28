'use strict';
/**
 * .architecture/registry/edit-atlas.js — edits ONE module section of an
 * atlas.md by id, without touching anything else in the file. The
 * point: an atlas is meant to be edited in place as the system changes
 * (SPEC_IS_LIVING_MODEL) — that only stays practical if editing one
 * entry doesn't mean hand-navigating a multi-thousand-line file.
 */
const fs = require('fs');

/**
 * findSection(text, moduleId) -> { start, end, heading } | null
 * A module section starts at a line matching `### <id>` (or contains
 * `**id:** \`<id>\`` within a few lines of a ### heading) and ends at
 * the next `---` or `### ` line. Matches this convention's own real
 * atlas structure exactly — no new heading syntax invented.
 */
function findSection(text, moduleId) {
  const lines = text.split('\n');
  let sectionStart = -1;
  let idLineFound = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^### /.test(lines[i])) {
      // Look ahead up to 5 lines for a matching **id:** line
      for (let j = i; j < Math.min(i + 6, lines.length); j++) {
        if (lines[j].includes(`**id:** \`${moduleId}\``)) {
          sectionStart = i;
          idLineFound = j;
          break;
        }
      }
      if (sectionStart !== -1) break;
    }
  }
  if (sectionStart === -1) return null;

  // Section ends at the next '---' or next '### ' after the id line
  let sectionEnd = lines.length;
  for (let i = idLineFound + 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || /^### /.test(lines[i]) || /^## /.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }
  return { startLine: sectionStart, endLine: sectionEnd, lines };
}

/**
 * editSection(atlasPath, moduleId, newSectionText) -> { ok, error? }
 * Replaces exactly the lines belonging to one module's section.
 * newSectionText should NOT include the trailing '---' separator —
 * that's preserved from the original, never duplicated or dropped.
 */
function editSection(atlasPath, moduleId, newSectionText) {
  const text = fs.readFileSync(atlasPath, 'utf8');
  const found = findSection(text, moduleId);
  if (!found) return { ok: false, error: `no section found for id: ${moduleId}` };

  const { startLine, endLine, lines } = found;
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine);
  const newLines = newSectionText.split('\n');
  const result = [...before, ...newLines, ...after].join('\n');

  fs.writeFileSync(atlasPath, result);
  return { ok: true };
}

module.exports = { findSection, editSection };
