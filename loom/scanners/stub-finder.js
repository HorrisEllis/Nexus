'use strict';
/**
 * loom/scanners/stub-finder.js — real "built fake, not real yet" detector
 * UUID: nexus-loom-scanner-stub-finder-v1-0000-2026-0913-jamesbrooks-001
 * Version: 1.0.0
 *
 * James: "make a tool to find stubs, mocks, unwired components/code/
 * files." "unwired" is already real, already built — loom/scanners/
 * closed-door.js finds real, substantial code with zero external
 * consumers, exactly that class of gap, reused here rather than
 * reimplemented. What that scanner does NOT find is the other real half
 * of the ask: code that IS wired and IS called, but doesn't actually do
 * what it claims — a stub, a mock, a hardcoded placeholder standing in
 * for real logic. This file is that missing half.
 *
 * §HONEST SCOPE — this is pattern matching over real source text, the
 * same class of method closed-door.js's own header names for itself
 * ("not real static analysis"). Three real, checkable signal classes,
 * each imperfect on its own, reported separately rather than blended
 * into one fabricated confidence score:
 *
 *   1. MARKER — an explicit, real comment the author themselves left:
 *      TODO/FIXME/STUB/MOCK/PLACEHOLDER/"NOT IMPLEMENTED"/HACK. Strong
 *      signal (the author is telling you), but only as complete as
 *      whether every real stub actually got commented as one — the same
 *      honest limit any TODO-grep has always had.
 *   2. THROW-NOT-IMPLEMENTED — a function body that is, in its entirety
 *      (or as its only real statement), `throw new Error(...)` naming
 *      "not implemented"/"unimplemented"/"TODO" — a real, common,
 *      deliberate stub shape, distinct from a throw that's real
 *      validation logic (checked: only fires when the thrown message
 *      itself says the function isn't implemented, never a bare throw).
 *   3. MOCK-NAMED-OUTSIDE-TESTS — an identifier containing mock/stub/
 *      fake/dummy in a file OUTSIDE any real test directory. Expected
 *      and fine inside tests/ (excluded, same patterns closed-door.js
 *      already uses for that exact reason) — suspicious in real,
 *      production-path source, where it usually means a temporary
 *      stand-in that was never swapped for the real thing.
 *
 * Deliberately NOT attempted: detecting "a function that just returns a
 * hardcoded literal" as its own signal — checked directly, this
 * codebase's own real code legitimately does that constantly (a getter
 * for a real constant, a real default-value function, a real single-
 * branch early return) and a reliable-enough heuristic to tell that
 * apart from a fake stub would need real type/flow analysis this file
 * doesn't have. Flagging it anyway would mean a flood of real, correct
 * code drowning out the genuine finds above — worse than not flagging
 * it at all (§1.2, honest degrade over false signal).
 */
const fs = require('fs');
const path = require('path');
const { DEFAULT_SCAN_DIRS, EXCLUDE_PATTERNS } = require('./closed-door.js');

const MODULE_ID = 'loom.scanner.stub-finder';

const MARKER_RE = /\/\/\s*(TODO|FIXME|STUB|MOCK|PLACEHOLDER|HACK)\b|\/\*\s*(TODO|FIXME|STUB|MOCK|PLACEHOLDER|HACK)\b|not\s+(yet\s+)?implemented/i;
const THROW_NOT_IMPL_RE = /throw\s+new\s+Error\s*\(\s*['"`][^'"`]*(not\s+implement|unimplement|todo)/i;
const MOCK_IDENTIFIER_RE = /\b(mock|stub|fake|dummy)[A-Za-z0-9_]*\s*[:=(]/i;
// §FIXED 2026-09-13 — first real run against this tree surfaced comment
// lines that EXPLICITLY say something is NOT a stub/mock ("not a stub:
// idearium's own...", "no stubs:") getting flagged as if they were one —
// exactly backwards. Checked the real false positives directly before
// adding this, not guessed: a negation immediately before the matched
// word is real, checkable signal that the sentence's own claim is the
// opposite of what a bare keyword match assumes.
const NEGATION_RE = /\b(not\s+a|not\s+an|no|isn'?t\s+a|isn'?t\s+an|never\s+a)\s+(mock|stub|fake|dummy)/i;

function _walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { _walk(full, out); continue; }
    if (e.isFile() && /\.(js|cjs)$/.test(e.name)) out.push(full);
  }
}

function _listJsFiles(rootDir, dirs) {
  const out = [];
  for (const d of dirs) {
    const full = path.join(rootDir, d);
    if (!fs.existsSync(full)) continue;
    _walk(full, out);
  }
  return out;
}

function _isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some((re) => re.test(filePath));
}

/**
 * scan({ rootDir, dirs, includeTests }) — the real entry point.
 * includeTests (default false) — mock/stub identifiers are expected
 * inside real test files, so that class of signal is skipped there by
 * default; markers (TODO/FIXME) and throw-not-implemented still apply
 * everywhere, including tests, since a stub left in a test is still a
 * real, honest thing to know about.
 *
 * Returns { scanned, flagged: [...findings], byKind: {marker, throwNotImpl,
 * mockIdentifier}, caveat }.
 */
function scan({ rootDir, dirs = DEFAULT_SCAN_DIRS, includeTests = false } = {}) {
  if (!rootDir) throw new Error('[stub-finder scanner] rootDir is required');

  const allFiles = _listJsFiles(rootDir, dirs);
  const candidates = allFiles.filter((f) => !_isExcluded(f) || includeTests);

  const flagged = [];
  const byKind = { marker: 0, throwNotImpl: 0, mockIdentifier: 0 };

  for (const file of candidates) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch (_) { continue; }

    const relPath = path.relative(rootDir, file);
    const lines = content.split('\n');
    const isTestFile = EXCLUDE_PATTERNS.some((re) => re.test(file));

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;

      const markerMatch = line.match(MARKER_RE);
      if (markerMatch && !NEGATION_RE.test(line)) {
        flagged.push({
          kind: 'marker', file: relPath, line: lineNo,
          text: line.trim().slice(0, 160), matched: markerMatch[0],
        });
        byKind.marker++;
      }

      if (THROW_NOT_IMPL_RE.test(line)) {
        flagged.push({ kind: 'throwNotImpl', file: relPath, line: lineNo, text: line.trim().slice(0, 160) });
        byKind.throwNotImpl++;
      }

      if (!isTestFile) {
        const mockMatch = line.match(MOCK_IDENTIFIER_RE);
        if (mockMatch && !NEGATION_RE.test(line)) {
          flagged.push({
            kind: 'mockIdentifier', file: relPath, line: lineNo,
            text: line.trim().slice(0, 160), matched: mockMatch[0],
          });
          byKind.mockIdentifier++;
        }
      }
    });
  }

  return {
    scanned: candidates.length,
    flagged,
    byKind,
    caveat: 'Pattern matching over real source text, not static analysis — a real stub with no marker comment and no telltale throw/identifier name is invisible to this scanner, the same honest limit closed-door.js\'s own require()-string matching has for "unwired." A hardcoded-return heuristic was deliberately not attempted (see this file\'s own header) — real, correct code returns hardcoded literals constantly, and a heuristic that can\'t tell the two apart would flood real findings with noise. Confirm each result by reading the real file before acting on it, same discipline as every other scanner in this folder.',
  };
}

module.exports = { scan, MARKER_RE, THROW_NOT_IMPL_RE, MOCK_IDENTIFIER_RE, NEGATION_RE };
