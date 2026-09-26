'use strict';
/**
 * lib/line-edit.js — synchronized line addressing + verified edits (agnostic)
 * UUID: nexus-line-edit-v1-0000-2026-0807-001
 *
 * James: "make any of those lib tools if they can be used across systems." The
 * line-addressing core (number a file, read a range, verify an edit against the
 * CURRENT file before applying, apply atomically) was born in the Gemini toolbox,
 * but it's generic — any system that edits code (emerge, cockpit, the diagnostic
 * repair path, a future refactor tool) needs exactly this. Promoted here; the
 * gemini-toolbox re-exports these so its callers are unaffected.
 *
 * The invariant that makes automated editing safe (§1.1): an edit's `expect` text
 * must match what's actually at those lines RIGHT NOW, or it's rejected — never
 * applied on a guess. Atomic (§2.1): one bad edit aborts the whole set.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function _safe(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT)) throw new Error('path escapes repo root');
  if (/(^|\/)data(\/|$)/.test(relPath)) throw new Error('data/** is state, not code — refused');
  return abs;
}
function _checksum(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(16); }

/** numberFile(relPath) — file as line-numbered plain text + checksum. */
function numberFile(relPath) {
  const abs = _safe(relPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const width = String(lines.length).length;
  const numbered = lines.map((l, i) => `${String(i + 1).padStart(width, ' ')}| ${l}`).join('\n');
  return { file: relPath, lineCount: lines.length, checksum: _checksum(raw), numbered, lines };
}

/** readRange(relPath, start, end) — exact current text at a line range. */
function readRange(relPath, startLine, endLine) {
  const abs = _safe(relPath);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const s = Math.max(1, startLine | 0), e = Math.min(lines.length, (endLine | 0) || s);
  return { file: relPath, startLine: s, endLine: e, text: lines.slice(s - 1, e).join('\n') };
}

/** verifyEdit(edit) — §1.1 check the edit's expect text against the CURRENT file. */
function verifyEdit(edit) {
  if (!edit || !edit.file || !edit.anchor) return { ok: false, reason: 'edit missing file or anchor' };
  const { startLine, endLine } = edit.anchor;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    return { ok: false, reason: `invalid anchor {${startLine},${endLine}}` };
  }
  let current;
  try { current = readRange(edit.file, startLine, endLine); }
  catch (e) { return { ok: false, reason: `cannot read ${edit.file}: ${e.message}` }; }
  if (typeof edit.expect === 'string') {
    const norm = s => s.replace(/\r/g, '').replace(/[ \t]+$/gm, '');
    if (norm(current.text) !== norm(edit.expect)) {
      return { ok: false, reason: `anchor mismatch — lines ${startLine}-${endLine} do not match expected text (file changed or mis-anchored)`, current: current.text };
    }
  }
  return { ok: true, reason: 'anchor verified against current file', anchor: { startLine, endLine } };
}

/** applyEdits(relPath, edits) — §2.1 all-or-nothing; in-memory (RAID does the write). */
function applyEdits(relPath, edits, opts = {}) {
  const abs = _safe(relPath);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const sorted = [...edits].sort((a, b) => b.anchor.startLine - a.anchor.startLine);
  for (const e of sorted) {
    const v = verifyEdit(e);
    if (!v.ok) return { ok: false, reason: `edit rejected: ${v.reason}`, failedEdit: e };
  }
  for (const e of sorted) {
    const repl = (e.replacement != null ? e.replacement : '').split('\n');
    lines.splice(e.anchor.startLine - 1, e.anchor.endLine - e.anchor.startLine + 1, ...repl);
  }
  return { ok: true, file: relPath, content: lines.join('\n'), editsApplied: edits.length };
}

module.exports = { numberFile, readRange, verifyEdit, applyEdits, _safe, _checksum, MODULE_ID: 'line-edit', VERSION: '1.0.0' };
