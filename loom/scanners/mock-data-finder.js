'use strict';
/**
 * loom/scanners/mock-data-finder.js — real "fake data standing in for
 * real data" detector.
 * UUID: nexus-loom-scanner-mock-data-finder-v1-0000-2026-0913-jamesbrooks-001
 * Version: 1.0.0
 *
 * James: "can you create a .tool to find mock data also." Distinct from
 * loom/scanners/stub-finder.js — that file finds CODE SHAPES (a stub
 * function, a mock-named identifier); this finds literal DATA VALUES
 * that are conventionally used as placeholders instead of real content,
 * regardless of what the surrounding code or variable is named. A real
 * bug class of its own: a hardcoded "test@example.com" or "John Doe"
 * left in a real response path looks like working code with a fake
 * value quietly riding along inside it — stub-finder's own identifier/
 * marker checks would never catch that, since nothing about the
 * function or variable NAME looks fake.
 *
 * §HONEST SCOPE — 4 real, checkable signal classes, each reported
 * separately, none blended into a fabricated confidence score:
 *   1. placeholderEmail — example.com/test.com/foo.com addresses, the
 *      real, reserved placeholder domains (RFC 2606 for the first).
 *   2. placeholderName  — "John Doe"/"Jane Doe"/"Foo Bar" style stand-in
 *      names, the common real convention across this codebase and
 *      elsewhere.
 *   3. loremIpsum       — literal lorem-ipsum placeholder text.
 *   4. placeholderPhone — the real, reserved 555-01xx exchange (North
 *      American Numbering Plan's own fictional-use block — not a guess,
 *      an actual reserved range), plus the obvious 123-456-7890 pattern.
 *
 * §HONEST LIMIT — same as stub-finder.js: pattern matching over real
 * source text, not static analysis or data-flow tracing. A real fake
 * value assigned through a variable/constant/config file this scanner
 * doesn't walk into is invisible here. A real, LEGITIMATE use of one of
 * these patterns (a test fixture, a docs example, a real support email
 * that happens to be @example.com for a real reason) is a real false
 * positive — confirm each result by reading the file, same discipline
 * every other scanner in this folder already states for itself.
 */
const fs = require('fs');
const path = require('path');
const { DEFAULT_SCAN_DIRS, EXCLUDE_PATTERNS } = require('./closed-door.js');

const MODULE_ID = 'loom.scanner.mock-data-finder';

const PATTERNS = {
  placeholderEmail: /\b[a-zA-Z0-9._%+-]+@(example\.(com|org|net)|test\.com|foo\.com|domain\.com)\b/i,
  placeholderName:  /\b(john|jane)\s+doe\b|\bfoo\s+bar\b/i,
  loremIpsum:       /lorem\s+ipsum/i,
  placeholderPhone: /\b555[-.\s]?01\d{2}\b|\b123[-.\s]?456[-.\s]?7890\b/,
};

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
 * includeTests (default false) — placeholder data in a real test
 * fixture is expected and excluded there by default; a real production
 * path carrying one is the actual real finding this tool exists for.
 *
 * Returns { scanned, flagged: [...findings], byKind: {placeholderEmail,
 * placeholderName, loremIpsum, placeholderPhone}, caveat }.
 */
function scan({ rootDir, dirs = DEFAULT_SCAN_DIRS, includeTests = false } = {}) {
  if (!rootDir) throw new Error('[mock-data-finder scanner] rootDir is required');

  const allFiles = _listJsFiles(rootDir, dirs);
  const candidates = allFiles.filter((f) => includeTests || !_isExcluded(f));

  const flagged = [];
  const byKind = { placeholderEmail: 0, placeholderName: 0, loremIpsum: 0, placeholderPhone: 0 };

  for (const file of candidates) {
    let content;
    try { content = fs.readFileSync(file, 'utf8'); }
    catch (_) { continue; }

    const relPath = path.relative(rootDir, file);
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      for (const [kind, re] of Object.entries(PATTERNS)) {
        const match = line.match(re);
        if (match) {
          flagged.push({ kind, file: relPath, line: lineNo, text: line.trim().slice(0, 160), matched: match[0] });
          byKind[kind]++;
        }
      }
    });
  }

  return {
    scanned: candidates.length,
    flagged,
    byKind,
    caveat: 'Pattern matching over real source text, not data-flow tracing — a fake value assigned through a variable, loaded from a config/fixture file this scanner does not read, or built up from concatenated pieces is invisible here. A real, legitimate use of one of these patterns (an intentional test fixture, a real docs example) is a real false positive by design — confirm each result by reading the file before acting on it.',
  };
}

module.exports = { scan, PATTERNS };
