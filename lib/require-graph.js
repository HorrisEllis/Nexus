'use strict';

/**
 * lib/require-graph.js
 *
 * §MCO15 2026-09-13 (Track C — component compiler, source-file map).
 * Extracted verbatim from cli/find-orphans.js's resolveRequireTarget() +
 * its REQUIRE_RE/IMPORT_RE regexes — that file's own resolveRequireTarget
 * is real, tested (via its own real orphan-detection use), and honestly
 * scoped ("static require/import references only") — moved, not
 * re-derived, per this session's own established §8.6 discipline
 * (same verbatim-extraction precedent as cli/decompose.js's registry-
 * block moves). find-orphans.js used this walking BACKWARD (who
 * requires this file, for orphan detection); this module exists so a
 * component-boundary check can walk it FORWARD instead (what does this
 * component's own file require) — same real logic, opposite direction,
 * no re-derivation of the resolution rules themselves.
 */

const fs = require('fs');
const path = require('path');

const REQUIRE_RE = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const IMPORT_RE = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

/**
 * resolveRequireTarget(fromFile, spec) — verbatim from find-orphans.js.
 * Resolves a relative require/import spec to a real file on disk, or
 * null if none of the real candidate paths exist. Bare package
 * specifiers ('express', etc.) are never passed here — callers only
 * feed this the relative specs REQUIRE_RE/IMPORT_RE already matched.
 */
function resolveRequireTarget(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * getRequireTargets(filePath) — the real, forward-pointed walk: every
 * relative require()/import this file makes, resolved to a real absolute
 * path (unresolved/bare specifiers dropped, same honest scope as
 * find-orphans.js's own use of these regexes). Returns [] (not a throw)
 * for a file that can't be read — a missing/unreadable file has no real
 * requires to report, not an error to propagate to a caller checking
 * many files.
 */
function getRequireTargets(filePath) {
  let src;
  try { src = fs.readFileSync(filePath, 'utf8'); } catch (_) { return []; }
  const targets = new Set();
  let m;
  REQUIRE_RE.lastIndex = 0;
  while ((m = REQUIRE_RE.exec(src))) {
    const t = resolveRequireTarget(filePath, m[1]);
    if (t) targets.add(t);
  }
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    const t = resolveRequireTarget(filePath, m[1]);
    if (t) targets.add(t);
  }
  return [...targets];
}

module.exports = { resolveRequireTarget, getRequireTargets };
