'use strict';
/**
 * tests/modules/test-import-pipeline-syntax.js — the brace-balance check
 * in idearium/repo/import-pipeline.js.
 *
 * §WHY THIS FILE EXISTS — the previous check counted every `{` and `}` in
 * a file, including inside strings, comments, template literals and regex
 * character classes. A file it wrongly marked status:'failed' is
 * chunkable:false per §10, so it was excluded from chunking entirely and
 * (since MCO1) from the relationship graph. Measured across 407 real .js
 * files in guardian/, lib/, idearium/ and cortex/: 6 marked failed,
 * `node --check` passing on ALL SIX — a 100% false-positive rate, and one
 * of the casualties was guardian/server.js, the largest and most
 * connected file in the system.
 *
 * §12.2 — every case here is a real file written to disk and run through
 * the REAL pipeline, asserted on the status and chunk count the pipeline
 * actually produces. `braceDepth` is deliberately NOT exported and not
 * unit-tested directly: the contract that matters is "a valid file gets
 * chunked", not "a private counter returns 0", and testing the private
 * function would keep passing if its one caller were rewired wrongly.
 *
 * SYN-010 is the anchor: it runs the pipeline over this repository's own
 * real guardian/server.js. If that file ever silently drops out of the
 * map again, this fails.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-syntax-'));

(async () => {
  const { runImportPipeline } = await import('../../idearium/repo/import-pipeline.js');

  /** run the REAL pipeline over a one-file repo and return that file's index row */
  function statusOf(name, content) {
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'r-'));
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
    runImportPipeline({ uuid: `syn-${name}`, files: [{ path: name }] }, dir);
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'files.json'), 'utf8'));
    return idx[0];
  }

  console.log('\n── braces that are not code ───────────────────────────────');

  t('SYN-001 an unbalanced brace inside a string literal does not fail the file', () => {
    const r = statusOf('a.js', 'const s = "a { b";\nfunction f() { return s; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
    assert.ok(r.chunkCount > 0, 'valid file produced no chunks');
  });

  t('SYN-002 an unbalanced brace inside a line comment does not fail the file', () => {
    const r = statusOf('b.js', '// see the { in this note\nfunction f() { return 1; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  t('SYN-003 an unbalanced brace inside a block comment does not fail the file', () => {
    const r = statusOf('c.js', '/* a stray } lives here */\nfunction f() { return 1; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  t('SYN-004 a regex character class containing a brace does not fail the file', () => {
    const r = statusOf('d.js', 'const re = /[{]/;\nfunction f() { return re; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  t("SYN-005 the exact shape 0.39.125 records — a regex with a quote inside a character class", () => {
    // This is the literal pattern lib/version.js's own 0.39.125 entry
    // names as having broken cli/decompose.js's walker: an unescaped
    // quote inside a character class, misread as a string delimiter.
    const r = statusOf('e.js', String.raw`const m = s.match(/version['":\s]+['"v]?(\d+)/i);` + '\nfunction f() { return m; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  console.log('\n── template literals ──────────────────────────────────────');

  t('SYN-006 a template literal with an interpolation is counted correctly', () => {
    const r = statusOf('f.js', 'function f(x) { return `a ${x} b`; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  t('SYN-007 CAUGHT BY MEASUREMENT: text AFTER an interpolation is still string, not code', () => {
    // The first version of the fix did depth++ on `${` and never
    // returned to string mode, so everything after the first
    // interpolation was scanned as code. That produced false
    // positives AND cratered the real chunk count from 4731 to 195.
    // A stray brace after the interpolation is the minimal reproduction.
    const r = statusOf('g.js', 'function f(x) { return `a ${x} } b`; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status} — interpolation state not restored`);
  });

  t('SYN-008 nested interpolations do not corrupt the count', () => {
    const r = statusOf('h.js', 'function f(x, y) { return `a ${ `b ${y} c` } d`; }\n');
    assert.strictEqual(r.status, 'complete', `status was ${r.status}`);
  });

  console.log('\n── it still catches what it should ────────────────────────');

  t('SYN-009 a genuinely unbalanced file IS still marked failed', () => {
    const r = statusOf('i.js', 'function f() { return 1;\n');
    assert.strictEqual(r.status, 'failed', 'a real unbalanced file passed — the check is now useless');
    // `chunkable` lives on the parse record, not on the files.json index
    // row (buildIndexes projects path/language/status/contentHash/
    // chunkCount only) — checked directly rather than asserting a field
    // that isn't there. The observable consequence is the real one: a
    // failed file is not chunked.
    assert.strictEqual(r.chunkCount, 0, 'a failed file was chunked anyway');
  });

  t('SYN-009b a failed file stays observable and indexable (§10 on_failure)', () => {
    const r = statusOf('j.js', 'function f() { return 1;\n');
    assert.strictEqual(r.status, 'failed');
    // §10: a file that cannot be parsed never disappears from the model.
    assert.ok(r.path, 'the failed file vanished from the index entirely');
  });

  console.log('\n── the real regression anchor ─────────────────────────────');

  t("SYN-010 this repo's own guardian/server.js parses, chunks, and is not dropped", () => {
    const src = path.join(ROOT, 'guardian', 'server.js');
    if (!fs.existsSync(src)) throw new Error('guardian/server.js not found — anchor cannot run');
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'anchor-'));
    fs.mkdirSync(path.join(dir, 'guardian'), { recursive: true });
    fs.copyFileSync(src, path.join(dir, 'guardian', 'server.js'));
    runImportPipeline({ uuid: 'anchor', files: [{ path: 'guardian/server.js' }] }, dir);
    const row = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'files.json'), 'utf8'))[0];
    assert.strictEqual(row.status, 'complete',
      'guardian/server.js is valid JS (node --check passes) but the pipeline marked it failed — it would be silently excluded from the whole map again');
    assert.ok(row.chunkCount > 50, `expected the largest file in the system to chunk substantially, got ${row.chunkCount}`);
  });

  t('SYN-011 a real symbol table still comes out of a complex real file', () => {
    const src = path.join(ROOT, 'guardian', 'lib', 'jobs.js');
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'anchor2-'));
    fs.mkdirSync(path.join(dir, 'guardian', 'lib'), { recursive: true });
    fs.copyFileSync(src, path.join(dir, 'guardian', 'lib', 'jobs.js'));
    runImportPipeline({ uuid: 'anchor2', files: [{ path: 'guardian/lib/jobs.js' }] }, dir);
    const syms = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'symbols.json'), 'utf8'));
    assert.ok(syms.find(s => s.name === 'createJobStore'), 'a known real symbol is missing from the index');
  });

  console.log(`\n${fail === 0 ? '✓' : '✗'} import-pipeline syntax: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(1); });
