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

/** verifyText(text, edit) — §1.1 the same check against text in hand (any repo, not only this root). edit: { anchor:
 *  { startLine, endLine }, expect? }. 0.60.81 CE7: a repo's file is read by its own layer, then checked here. */
function verifyText(text, edit) {
  if (!edit || !edit.anchor) return { ok: false, reason: 'edit missing anchor' };
  const { startLine, endLine } = edit.anchor;
  const lines = String(text == null ? '' : text).split('\n');
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine - 1) return { ok: false, reason: `invalid anchor {${startLine},${endLine}}` };
  if (startLine > lines.length + 1 || endLine > lines.length) return { ok: false, reason: `anchor {${startLine},${endLine}} is past the end (${lines.length} lines)` };
  if (typeof edit.expect === 'string') {
    const cur = lines.slice(startLine - 1, endLine).join('\n');
    const norm = s => s.replace(/\r/g, '').replace(/[ \t]+$/gm, '');
    if (norm(cur) !== norm(edit.expect)) return { ok: false, reason: `anchor mismatch — lines ${startLine}-${endLine} do not match expected text (file changed or mis-anchored)`, current: cur };
  }
  return { ok: true, reason: 'anchor verified against current text', anchor: { startLine, endLine } };
}

/** applyText(text, edits) — §2.1 all-or-nothing over text in hand; overlapping anchors are refused. An insert is
 *  endLine = startLine - 1 (nothing replaced). */
function applyText(text, edits) {
  const lines = String(text == null ? '' : text).split('\n');
  const sorted = [...(edits || [])].sort((a, b) => b.anchor.startLine - a.anchor.startLine);
  if (!sorted.length) return { ok: false, reason: 'no edits' };
  for (let i = 0; i < sorted.length; i++) {
    const v = verifyText(text, sorted[i]);
    if (!v.ok) return { ok: false, reason: `edit rejected: ${v.reason}`, failedEdit: sorted[i] };
    if (i && sorted[i].anchor.endLine >= sorted[i - 1].anchor.startLine) return { ok: false, reason: `edits overlap at lines ${sorted[i - 1].anchor.startLine}-${sorted[i].anchor.endLine}`, failedEdit: sorted[i] };
  }
  for (const e of sorted) {
    const repl = e.replacement == null || e.replacement === '' && e.anchor.endLine < e.anchor.startLine ? [] : String(e.replacement).split('\n');
    lines.splice(e.anchor.startLine - 1, e.anchor.endLine - e.anchor.startLine + 1, ...repl);
  }
  const content = lines.join('\n');
  return { ok: true, content, editsApplied: sorted.length, checksumBefore: _checksum(String(text == null ? '' : text)), checksumAfter: _checksum(content) };
}

/** verifyEdit(edit) — §1.1 check the edit's expect text against the CURRENT file. */
function verifyEdit(edit) {
  if (!edit || !edit.file || !edit.anchor) return { ok: false, reason: 'edit missing file or anchor' };
  let raw;
  try { raw = fs.readFileSync(_safe(edit.file), 'utf8'); }
  catch (e) { return { ok: false, reason: `cannot read ${edit.file}: ${e.message}` }; }
  const { startLine, endLine } = edit.anchor;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    return { ok: false, reason: `invalid anchor {${startLine},${endLine}}` };
  }
  return verifyText(raw, edit);
}

/** applyEdits(relPath, edits) — §2.1 all-or-nothing; in-memory (RAID does the write). */
function applyEdits(relPath, edits, opts = {}) {
  const raw = fs.readFileSync(_safe(relPath), 'utf8');
  const lines = raw.split('\n');
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

module.exports = { numberFile, readRange, verifyEdit, applyEdits, verifyText, applyText, _safe, _checksum, MODULE_ID: 'line-edit', VERSION: '1.1.0' };
