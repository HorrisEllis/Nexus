'use strict';
/**
 * lib/stub-scanner.js — "no stubs," checked, not assumed
 * UUID: nexus-stub-scanner-v1-0000-2026-0812-001
 *
 * James: "no stubs. we need to do a check for that also." Direct
 * consequence of tonight's own bug: cortex/snapshot/index.js's create()
 * read a private _tables property that only existed on a TEST'S MOCK, not
 * the real jaaDB — 34 real tests passed while it silently did nothing
 * against real data. That specific bug can't be caught by a generic
 * linter; it needed someone to actually call the function against reality.
 * This scanner catches the CHEAPER, more general signals that a function
 * pretending to be real might not be — the things that would have made a
 * human reviewer suspicious on sight, checked automatically instead of by
 * chance.
 *
 * §NOT a replacement for the discipline that actually caught tonight's bug
 * (calling the real thing against real data). A static scanner is a
 * cheap first pass — it flags candidates for a human or a real live test
 * to check, it does not itself prove anything works. Said plainly in its
 * own output, not oversold.
 */

const fs = require('fs');
const path = require('path');

const STUB_COMMENT_PATTERNS = [
  /\bTODO\b/i, /\bFIXME\b/i, /\bnot implemented\b/i, /\bnot yet implemented\b/i,
  /\bstub\b/i, /\bplaceholder\b/i, /\bfor now\b/i, /\bhack\b/i, /\bXXX\b/,
];

// A function body that's ONLY one of these, with nothing else, is a real
// stub signal — a genuine implementation almost never has a body this
// trivial for a non-trivial function name.
const TRIVIAL_BODY_PATTERNS = [
  /^\s*return\s+null;?\s*$/,
  /^\s*return\s+\{\s*\};?\s*$/,
  /^\s*return\s+\[\s*\];?\s*$/,
  /^\s*return\s+true;?\s*$/,
  /^\s*return\s+false;?\s*$/,
  /^\s*throw new Error\(['"]not implemented['"]\);?\s*$/i,
  /^\s*\/\/\s*TODO.*$/i,
];

// §THE ACTUAL BUG PATTERN FROM TONIGHT — a function reading `.something`
// off an object with an underscore-prefixed name (a private/internal
// property convention across this codebase) is worth a second look: is
// that property real on every real implementation, or only on a test's
// convenience mock? This can't be answered by grep alone — flagged as a
// "verify this against the real object, not just the test," not a
// definitive finding.
const PRIVATE_PROPERTY_ACCESS = /\b(\w+)\._[a-zA-Z]\w*\b/g;

/**
 * scanFile(filePath) — real, single-file scan. Returns findings, never
 * throws (§1.2 — one bad file must not stop a scan of many).
 */
function scanFile(filePath) {
  const findings = [];
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { return [{ type: 'unreadable', detail: e.message }]; }
  const lines = content.split('\n');

  lines.forEach((line, i) => {
    for (const re of STUB_COMMENT_PATTERNS) {
      if (re.test(line) && /\/\/|\/\*|\*/.test(line)) {
        findings.push({ type: 'stub-comment', line: i + 1, text: line.trim().slice(0, 120), pattern: re.source });
      }
    }
  });

  // §THE ACTUAL PATTERN FROM TONIGHT'S REAL BUG — a private/internal
  // property access (obj._something). Not a definitive finding by itself
  // (most of these are legitimate) — flagged so a human or a real live
  // test checks: does the REAL object this runs against in production
  // actually expose this property, or only a test's convenience mock?
  let pm;
  PRIVATE_PROPERTY_ACCESS.lastIndex = 0;   // stateful regex — must reset per file, or later files silently scan from the wrong offset
  while ((pm = PRIVATE_PROPERTY_ACCESS.exec(content))) {
    const lineNo = content.slice(0, pm.index).split('\n').length;
    findings.push({ type: 'private-property-access', line: lineNo, text: pm[0], note: 'verify this property exists on the REAL object in production, not just a test mock' });
  }

  // function bodies — approximate, brace-matched, good enough for a first pass
  const fnRe = /(?:function\s+(\w+)\s*\([^)]*\)|(\w+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{/g;
  let m;
  while ((m = fnRe.exec(content))) {
    const name = m[1] || m[2];
    const start = m.index + m[0].length;
    let depth = 1, j = start;
    while (j < content.length && depth > 0) {
      if (content[j] === '{') depth++;
      else if (content[j] === '}') depth--;
      j++;
    }
    const body = content.slice(start, j - 1).trim();
    for (const re of TRIVIAL_BODY_PATTERNS) {
      if (re.test(body)) {
        const lineNo = content.slice(0, start).split('\n').length;
        findings.push({ type: 'trivial-body', line: lineNo, function: name, body: body.slice(0, 80) });
      }
    }
  }

  return findings;
}

/**
 * scanFiles(filePaths) — real multi-file scan, per-file isolated.
 */
function scanFiles(filePaths) {
  const results = {};
  let total = 0;
  for (const fp of filePaths) {
    const findings = scanFile(fp);
    if (findings.length) { results[fp] = findings; total += findings.length; }
  }
  return { files: results, totalFindings: total, filesWithFindings: Object.keys(results).length, filesScanned: filePaths.length };
}

module.exports = { scanFile, scanFiles, STUB_COMMENT_PATTERNS, TRIVIAL_BODY_PATTERNS, PRIVATE_PROPERTY_ACCESS, MODULE_ID: 'stub-scanner', VERSION: '1.0.0' };
