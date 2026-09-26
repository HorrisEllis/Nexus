'use strict';
/**
 * loom/scanners/dangling-report.js — every relative require()/import in the
 * tree that points at nothing on disk.
 * comp_id: nexus.loom.scanners.dangling-report
 * UUID: nexus-loom-scanner-dangling-v1-0000-2026-0804-001
 *
 * Run: node loom/scanners/dangling-report.js
 *
 * WHY: source-map.js's scan reports a COUNT of unresolved specifiers. A count
 * is not actionable and, worse, a count is exactly the shape of thing that gets
 * glanced at and moved past — which is how 11 hard-rejected wires survived in
 * this same registry for weeks under a healthy-looking summary line. This
 * prints them, grouped by file, so each one is either fixed or knowingly
 * accepted.
 *
 * A dangling require is not automatically a bug. Most in this tree sit inside
 * `try { ... } catch(_) {}` as optional dependencies, which is a legitimate
 * pattern. But §1.2 says nothing fails silently, and an optional dependency
 * whose path is simply WRONG is indistinguishable from one that is legitimately
 * absent — the catch swallows both identically, forever. That distinction is
 * what this report exists to make visible.
 *
 * Known example, found by the first run of this scanner (2026-08-04):
 *   meta/alk/index.js:121  require('../cortex/versionium/index')
 *   From meta/alk/, `../cortex/...` resolves to meta/cortex/... — which has
 *   never existed. The real file is at cortex/versionium/index.js and DOES
 *   exist; the path needs one more `../`. It is wrapped in
 *   `catch(_) { /* versionium may not be loaded *\/ }`, so the pre-rewind
 *   snapshot §VERSIONIUM is supposed to take has never once been taken, and
 *   the comment explaining the catch describes a condition that is not the
 *   real one.
 */

const fs = require('fs');
const path = require('path');
const { scanTree, ROOT } = require('./source-map');

function classify(from, spec) {
  const raw = path.normalize(path.join(path.dirname(from), spec));
  const cands = [raw, raw + '.js', raw + '.cjs', raw + '.mjs', raw + '.json',
                 raw + '/index.js', raw + '/index.cjs', raw + '/index.mjs'];
  for (const c of cands) {
    if (fs.existsSync(path.join(ROOT, c))) return { kind: 'skipped-dir-or-nonjs', found: c };
  }
  // Is the SAME logical target reachable from a different depth? A require of
  // '../cortex/versionium/index' from meta/alk/ is a wrong path if
  // 'cortex/versionium/index.js' exists somewhere real; it is an absent target
  // if nothing matches that tail at all.
  //
  // §CORRECTED 2026-08-04, first run of this file: the original version matched
  // on BASENAME, so every '.../index' specifier "matched" warp/core/index.js
  // and reported 24 wrong paths, nearly all false. Matching a bare `index` is
  // matching nothing. It now matches the full specifier tail with leading ../
  // stripped, which is the only part that carries meaning.
  const tail = spec.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  const suffixes = [tail, tail + '.js', tail + '/index.js', tail + '.cjs', tail + '.mjs'];
  const guesses = [];
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      const relp = path.relative(ROOT, full).replace(/\\/g, '/');
      if (suffixes.some(s => relp === s || relp.endsWith('/' + s))) guesses.push(relp);
    }
  }
  const live = guesses.filter(g => !g.startsWith('unintegrated/') && !g.startsWith('docs/'));
  return live.length
    ? { kind: 'WRONG-PATH', candidates: [...new Set(live)].slice(0, 3) }
    : { kind: 'target-absent', staged: [...new Set(guesses)].slice(0, 2) };
}

function report() {
  const { unresolvedList } = scanTree();
  const byFile = new Map();
  for (const u of unresolvedList) {
    const c = classify(u.from, u.spec);
    if (c.kind === 'skipped-dir-or-nonjs') continue;
    if (!byFile.has(u.from)) byFile.set(u.from, []);
    byFile.get(u.from).push({ spec: u.spec, ...c });
  }

  const wrong = [];
  console.log(`\nDANGLING RELATIVE SPECIFIERS — ${byFile.size} files\n`);
  for (const [file, items] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${file}  (${items.length})`);
    for (const it of items) {
      if (it.kind === 'WRONG-PATH') {
        wrong.push({ file, ...it });
        console.log(`   ⚠ ${it.spec}  → target absent HERE but a file of that name exists at: ${it.candidates.join(', ')}`);
      } else {
        console.log(`     ${it.spec}  → nothing of that name anywhere in the tree`);
      }
    }
  }
  console.log(`\n${wrong.length} look like WRONG PATHS rather than absent dependencies — those are the actionable ones.\n`);
  return { byFile, wrong };
}

if (require.main === module) report();

module.exports = { report, classify };
