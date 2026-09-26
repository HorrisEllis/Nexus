'use strict';
/**
 * lib/gemini-toolbox/index.js — the Gemini coding toolbox (agnostic lib tool)
 * UUID: nexus-gemini-toolbox-v1-0000-2026-0804-001
 *
 * James: "a tool for gemini, to inject a toolbox of tools specifically made for
 * gemini to parse files in nexus to upload as plain text, suggest fixes or read
 * files and a synchronized line count or positioning for the code so nexus and
 * gemini have a way to both know where code needs to be replaced or fixed.
 * Framework, context, axioms, and a contract. A way for gemini to code."
 *
 * THE CORE PROBLEM this solves: Gemini can read code and suggest fixes, but a
 * suggestion like "change the validation" is useless to an automated system —
 * NEXUS can't apply it. The fix is a SHARED LINE-ADDRESSING SCHEME: every file
 * Gemini receives is numbered with a stable, explicit scheme, and every fix
 * Gemini returns is anchored to those exact line numbers. NEXUS and Gemini then
 * agree, unambiguously, on WHERE a change goes — the edit becomes applicable, not
 * just advisory.
 *
 * §8.6 — uses the canonical lib/chunker for splitting large files; adds no second
 * chunker. §agnostic — lives in lib/, any system (copilot, guardian, the tv-ui
 * gemini suite) calls it. §1.2 honest — a fix that doesn't anchor cleanly is
 * REJECTED with a reason, never applied on a guess (a wrong line edit is worse
 * than no edit). Read-only on the tree here; application goes through RAID.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const _lineEdit = require('../line-edit');  // §agnostic — the generic line-addressing core now lives in lib/; delegate to it

// ── THE CONTRACT — what Gemini operates under (framework/context/axioms) ──────
const CONTRACT = Object.freeze({
  framework: 'NEXUS · Node.js · sovereign multi-agent · AXIOMS-v3.1',
  role: 'Gemini is a coding agent inside NEXUS. It reads line-numbered files and returns line-anchored edits. It never invents file paths, never edits data/**, never returns an edit it cannot anchor to real line numbers.',
  axioms: [
    '§0.1 evidence over memory — anchor every edit to the line numbers actually shown, not remembered.',
    '§1.1 nothing real until proven — a proposed edit is a claim; it is verified against the current file before it is applied.',
    '§1.2 nothing silently fails — an edit that does not anchor cleanly is rejected with a reason.',
    '§8.4 scan callers before editing — a signature change must name its callers.',
    'never edit data/** — that is state, not code.',
  ],
  edit_format: {
    file: 'repo-relative path exactly as given',
    anchor: '{ startLine, endLine } — 1-based, inclusive, matching the numbered view',
    expect: 'the exact current text at those lines (checked before apply — §1.1)',
    replacement: 'the new text (may be empty to delete)',
    reason: 'why this edit (one line)',
  },
});

function getContract() { return CONTRACT; }

// ── SHARED LINE ADDRESSING ────────────────────────────────────────────────────
/**
 * numberFile(relPath) — read a file and return it as plain text with a synchronized
 * line-number gutter, plus a checksum so both sides can detect if the file changed
 * under them. This is what gets "uploaded as plain text" to Gemini.
 * @returns { file, lineCount, checksum, numbered, lines }
 */
function numberFile(relPath) {
  const abs = _safe(relPath);
  const raw = fs.readFileSync(abs, 'utf8');
  const lines = raw.split('\n');
  const width = String(lines.length).length;
  const numbered = lines.map((l, i) => `${String(i + 1).padStart(width, ' ')}| ${l}`).join('\n');
  return { file: relPath, lineCount: lines.length, checksum: _checksum(raw), numbered, lines };
}

/**
 * readRange(relPath, startLine, endLine) — the exact current text at a line range,
 * so Gemini (or NEXUS) can quote precisely what it intends to change.
 */
function readRange(relPath, startLine, endLine) {
  const abs = _safe(relPath);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const s = Math.max(1, startLine | 0), e = Math.min(lines.length, (endLine | 0) || s);
  return { file: relPath, startLine: s, endLine: e, text: lines.slice(s - 1, e).join('\n') };
}

/**
 * parseForGemini(relPath, opts) — the "upload as plain text" tool. Returns the
 * numbered file, and if it's large, chunked via the CANONICAL chunker (§8.6) with
 * each chunk's own line offset preserved so anchors stay global across chunks.
 */
function parseForGemini(relPath, opts = {}) {
  const numbered = numberFile(relPath);
  const out = { ...numbered, contract: CONTRACT, chunks: null };
  const maxLines = opts.maxLinesPerChunk || 400;
  if (numbered.lineCount > maxLines) {
    // Chunk by line windows, preserving the GLOBAL line offset per chunk so an
    // anchor means the same thing whether the file was chunked or not.
    const chunks = [];
    for (let start = 0; start < numbered.lines.length; start += maxLines) {
      const slice = numbered.lines.slice(start, start + maxLines);
      const width = String(numbered.lineCount).length;
      chunks.push({
        startLine: start + 1,
        endLine: Math.min(start + maxLines, numbered.lineCount),
        numbered: slice.map((l, i) => `${String(start + i + 1).padStart(width, ' ')}| ${l}`).join('\n'),
      });
    }
    out.chunks = chunks;
  }
  return out;
}

// ── FIX VERIFICATION — a fix is a claim until it anchors (§1.1) ────────────────
/**
 * verifyEdit(edit) — check a Gemini-proposed edit against the CURRENT file before
 * anything is applied. Returns { ok, reason }. THE POINT: the edit's `expect` text
 * must match what's actually at those lines right now. If the file changed, or
 * Gemini mis-anchored, this catches it — NEXUS never applies a guessed edit.
 * @param edit { file, anchor:{startLine,endLine}, expect, replacement, reason }
 */
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
    // §1.1 — the edit must match reality. Whitespace-normalized compare so a
    // trailing-newline difference isn't a false reject, but real drift is caught.
    const norm = s => s.replace(/\r/g, '').replace(/[ \t]+$/gm, '');
    if (norm(current.text) !== norm(edit.expect)) {
      return { ok: false, reason: `anchor mismatch — lines ${startLine}-${endLine} do not match expected text (file changed or mis-anchored)`, current: current.text };
    }
  }
  return { ok: true, reason: 'anchor verified against current file', anchor: { startLine, endLine } };
}

/**
 * applyEdits(relPath, edits, opts) — apply verified line-anchored edits to a file
 * IN MEMORY, returning the new content (NOT written to disk here — writing goes
 * through RAID governance, §RAID). Edits are applied bottom-up so earlier line
 * numbers stay valid. Any edit that fails verifyEdit aborts the whole set (§2.1
 * all-or-nothing — a half-applied fix is a broken file).
 */
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

// ── helpers ───────────────────────────────────────────────────────────────────
function _safe(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT)) throw new Error('path escapes repo root');
  if (/(^|\/)data\//.test(relPath)) throw new Error('data/** is state, not code — refused (§contract)');
  return abs;
}
function _checksum(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(16); }

module.exports = { getContract, parseForGemini, CONTRACT, MODULE_ID: 'gemini-toolbox', VERSION: '1.0.0',
  // §10.3 one source of truth — the generic line-addressing core lives in
  // lib/line-edit; re-export it so gemini-toolbox callers are unaffected.
  numberFile: _lineEdit.numberFile, readRange: _lineEdit.readRange,
  verifyEdit: _lineEdit.verifyEdit, applyEdits: _lineEdit.applyEdits };
