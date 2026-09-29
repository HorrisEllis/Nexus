'use strict';
/**
 * tests/modules/test-code-edit.test.js — lib/code-edit.js, the .inject delete op / defer, RepoLayer's real-bytes
 * read and delete (0.39.273 CB4). docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec
 *
 *   CE-1xx  planEdits: exact, unique, occurrence/replaceAll, whitespace-tolerant + reindent, lines, inserts, overlap,
 *           CRLF, refusals that say where
 *   CE-2xx  unifiedDiff and diagnose
 *   CE-3xx  repo-inject op:'delete', defer, revert; RepoLayer readTextFile / deleteTextFile on imported (source) files
 */
require('../../lib/test-sandbox.js').ensure();
// CLAUDE.md — "silence [jaa]-style logs or the runner miscounts": module chatter ("[jaa] …", "[idearium…] …",
// "[API] …") is dropped; the test's own lines (which never start with "[") are kept.
{ const _log = console.log, _warn = console.warn;
  const chatter = (a) => typeof a[0] === 'string' && /^\[[\w./ -]+\]/.test(a[0]);
  console.log = (...a) => { if (!chatter(a)) _log(...a); };
  console.warn = (...a) => { if (!chatter(a)) _warn(...a); }; }
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'lib/code-edit.js'));

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n      ${String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')}`); }
}

const SRC = [
  'function add(a, b) {',
  '  return a + b;',
  '}',
  '',
  'function sub(a, b) {',
  '  return a - b;',
  '}',
  '',
  'function twice(a) {',
  '  return add(a, a);',
  '}',
  '',
].join('\n');

async function main() {
  console.log('\ntest-code-edit\n\n── planEdits ──────────────────────────────────────────');
  await t('CE-101', 'exact replace of unique text', () => {
    const r = E.planEdits(SRC, [{ old: 'return a - b;', new: 'return b - a;' }]);
    assert.ok(r.ok); assert.ok(r.content.includes('return b - a;')); assert.strictEqual(r.changes[0].startLine, 6);
  });
  await t('CE-102', 'text found twice is refused with every line it appears on', () => {
    const r = E.planEdits(SRC, [{ old: '(a, b) {', new: '(x) {' }]);
    assert.ok(!r.ok); assert.match(r.errors[0], /appears 2 times \(lines 1, 5\)/);
  });
  await t('CE-103', 'occurrence picks one; replaceAll takes all', () => {
    assert.ok(E.planEdits(SRC, [{ old: '(a, b) {', new: '(x) {', occurrence: 2 }]).content.includes('function sub(x) {'));
    assert.strictEqual((E.planEdits(SRC, [{ old: '(a, b) {', new: '(x) {', replaceAll: true }]).content.match(/\(x\) \{/g) || []).length, 2);
  });
  await t('CE-104', 'not found: refused, naming the closest lines', () => {
    const r = E.planEdits(SRC, [{ old: 'return a * b;', new: 'x' }]);
    assert.ok(!r.ok); assert.match(r.errors[0], /not found — closest line\(s\): \d+: return a/);
  });
  await t('CE-105', 'old text with the wrong indentation still lands (uniquely), re-indented, and says so', () => {
    const r = E.planEdits(SRC, [{ old: 'function twice(a) {\nreturn add(a, a);\n}', new: 'function twice(a) {\nreturn 2 * a;\n}' }]);
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.strictEqual(r.changes[0].matchedBy, 'ignoring indentation');
    assert.ok(r.content.includes('function twice(a) {\n  return 2 * a;\n}'), r.content);
  });
  await t('CE-106', 'trailing whitespace differences are tolerated', () => {
    const r = E.planEdits(SRC.replace('return a + b;', 'return a + b;   '), [{ old: '  return a + b;\n}', new: '  return b + a;\n}' }]);
    assert.ok(r.ok, JSON.stringify(r.errors)); assert.strictEqual(r.changes[0].matchedBy, 'ignoring trailing whitespace');
  });
  await t('CE-107', 'line ranges and inserts refer to the file as it was; several edits apply together', () => {
    const r = E.planEdits(SRC, [{ startLine: 2, endLine: 2, new: '  return (a + b) | 0;' }, { insertAfter: 0, new: "'use strict';" }, { insertBefore: 9, new: '// doubles' }]);
    assert.ok(r.ok, JSON.stringify(r.errors));
    const L = r.content.split('\n');
    assert.strictEqual(L[0], "'use strict';"); assert.strictEqual(L[2], '  return (a + b) | 0;'); assert.strictEqual(L[9], '// doubles'); assert.strictEqual(L[10], 'function twice(a) {');
  });
  await t('CE-108', 'overlapping edits are refused, naming both', () => {
    const r = E.planEdits(SRC, [{ startLine: 1, endLine: 3, new: 'x' }, { old: 'return a + b;', new: 'y' }]);
    assert.ok(!r.ok); assert.match(r.errors[0], /edits 1 and 2 overlap/);
  });
  await t('CE-109', 'deleting lines and appending', () => {
    const r = E.planEdits(SRC, [{ startLine: 5, endLine: 8, new: '' }, { append: 'module.exports = { add };' }]);
    assert.ok(r.ok);
    assert.ok(!r.content.includes('sub')); assert.ok(r.content.trimEnd().endsWith('module.exports = { add };'));
  });
  await t('CE-110', 'CRLF files keep CRLF', () => {
    const crlf = SRC.replace(/\n/g, '\r\n');
    const r = E.planEdits(crlf, [{ old: 'return a - b;', new: 'return 0;' }]);
    assert.ok(r.ok); assert.ok(!/[^\r]\n/.test(r.content)); assert.ok(r.content.includes('return 0;\r\n'));
  });
  await t('CE-111', 'a line range outside the file and a missing "new" are refused', () => {
    assert.match(E.planEdits(SRC, [{ startLine: 50, endLine: 51, new: 'x' }]).errors[0], /not inside the file/);
    assert.match(E.planEdits(SRC, [{ old: 'add' }]).errors[0], /"new" .* is required/);
  });
  await t('CE-112', 'expectText guards a line range against a file that moved', () => {
    assert.ok(E.planEdits(SRC, [{ startLine: 2, endLine: 2, expectText: '  return a + b;', new: 'x' }]).ok);
    assert.match(E.planEdits(SRC, [{ startLine: 2, endLine: 2, expectText: 'something else', new: 'x' }]).errors[0], /no longer hold/);
  });

  console.log('\n── diff + diagnose ────────────────────────────────────');
  await t('CE-201', 'unifiedDiff shows the changed lines with context and a correct hunk header', () => {
    const r = E.planEdits(SRC, [{ old: 'return a - b;', new: 'return b - a;' }]);
    const d = E.unifiedDiff(SRC, r.content, { path: 'm.js' });
    assert.match(d, /^--- a\/m\.js\n\+\+\+ b\/m\.js\n@@ -4,5 \+4,5 @@/);
    assert.ok(d.includes('-  return a - b;') && d.includes('+  return b - a;'));
    assert.strictEqual(E.unifiedDiff(SRC, SRC), '');
    assert.match(E.unifiedDiff(null, 'x\n', { path: 'n.js' }), /@@ -0,0 \+1,2 @@/);
  });
  await t('CE-202', 'diagnose: a JS syntax error with its line; ESM detected; clean code is clean', () => {
    assert.deepStrictEqual(E.diagnose('a.js', SRC), []);
    const d = E.diagnose('a.js', SRC.replace('return a + b;\n}', 'return a + b;'));
    assert.strictEqual(d[0].severity, 'error'); assert.ok(d[0].line >= 9, JSON.stringify(d));
    assert.deepStrictEqual(E.diagnose('m.js', "import fs from 'fs';\nexport const x = 1;\n"), []);
    assert.strictEqual(E.diagnose('m.mjs', 'export const = 1;\n').length, 1);
  });
  await t('CE-203', 'diagnose: JSON with the error line; brace balance for languages without a checker', () => {
    const j = E.diagnose('c.json', '{\n  "a": 1,\n  "b": \n}\n');
    assert.strictEqual(j.length, 1); assert.strictEqual(j[0].tool, 'JSON.parse');
    assert.strictEqual(E.diagnose('x.go', 'package main\nfunc main() {\n').length, 1);
    assert.deepStrictEqual(E.diagnose('x.go', 'package main\nfunc main() {}\n'), []);
  });
  await t('CE-204', 'diagnose: python when python3 exists', () => {
    const d = E.diagnose('a.py', 'def f(:\n  pass\n');
    const has = require('child_process').spawnSync('python3', ['--version']).status === 0;
    if (has) { assert.strictEqual(d.length, 1); assert.strictEqual(d[0].line, 1); } else assert.deepStrictEqual(d, []);
  });

  console.log('\n── through the real repo layer ────────────────────────');
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const RI = require(path.join(ROOT, 'lib', 'repo-inject.js'));
  let rec = null;
  for (let i = 0; i < 20; i++) {
    rec = layer.ingest({ name: `code-edit-test-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }, { path: 'src/b.js', content: 'const b = 2;\n' }] });
    if (!(rec && rec.error && /no spec-engine/.test(rec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = rec.repo || rec; const U = repo.uuid;
  layer.refresh(U);
  const R = () => layer.get(U);

  await t('CE-301', 'op:"delete" proposes, applies (file gone), and reverts (file back, same bytes)', () => {
    const before = layer.readTextFile(U, 'src/b.js').content;
    const p = RI.propose({ layer, repo: R(), path: 'src/b.js', content: null, op: 'delete' });
    assert.ok(p.ok, JSON.stringify(p.errors)); assert.strictEqual(p.inject.op, 'delete'); assert.strictEqual(p.inject.content, null);
    const a = RI.apply(p.inject.uuid, { layer });
    assert.ok(a.ok, JSON.stringify(a.errors));
    assert.ok(layer.readTextFile(U, 'src/b.js').error, 'still readable after delete');
    const v = RI.revert(p.inject.uuid, { layer });
    assert.ok(v.ok, JSON.stringify(v.errors));
    assert.strictEqual(layer.readTextFile(U, 'src/b.js').content, before);
  });
  await t('CE-302', 'deleting a file that does not exist is refused at proposal; a delete proposal cannot be edited', () => {
    assert.match(RI.propose({ layer, repo: R(), path: 'src/none.js', content: null, op: 'delete' }).errors[0], /does not exist/);
    const p = RI.propose({ layer, repo: R(), path: 'src/a.js', content: null, op: 'delete' });
    assert.match(RI.edit(p.inject.uuid, 'x').errors[0], /no content to edit/);
    RI.reject(p.inject.uuid);
  });
  await t('CE-303', 'apply({ defer }) writes without reindexing; refresh() once reindexes', () => {
    const p = RI.propose({ layer, repo: R(), path: 'src/c.js', content: 'const c = 3;\n' });
    assert.ok(RI.apply(p.inject.uuid, { layer, defer: true }).ok);
    assert.strictEqual(layer.readTextFile(U, 'src/c.js').content, 'const c = 3;\n');
    layer.refresh(U);
    const dir = R().materializeDir || path.join(layer.dataDir, 'projects', U);
    const files = JSON.parse(fs.readFileSync(path.join(dir, 'indexes', 'files.json'), 'utf8')).map(f => f.path);
    assert.ok(files.includes('src/c.js'), files.join(','));
  });
  await t('CE-304', 'readTextFile reads an imported file\'s REAL bytes, not its truncated chunk; deleteTextFile removes the source file too', () => {
    const dir = R().materializeDir || path.join(layer.dataDir, 'projects', U);
    const big = 'x'.repeat(300) + '\n' + 'const tail = 1;\n';
    const w = layer.writeSources(U, [{ path: 'src/big.js', buffer: Buffer.from(big), bytes: Buffer.byteLength(big), binary: false, sha256: require('crypto').createHash('sha256').update(big).digest('hex') }]);
    assert.ok(w.ok, JSON.stringify(w));
    // the chunk store holds a truncated reading (what ingest does above max_chunk_bytes)
    layer.writeFile(U, 'src/big.js', big.slice(0, 100), { defer: true });
    assert.strictEqual(layer.readFile(U, 'src/big.js').content.length, 100);
    const real = layer.readTextFile(U, 'src/big.js');
    assert.strictEqual(real.via, 'source'); assert.strictEqual(real.content, big);
    // an inject is proposed against the real bytes
    assert.strictEqual(RI.currentOf({ layer, repo: R(), path: 'src/big.js' }).content, big);
    const d = layer.deleteTextFile(U, 'src/big.js');
    assert.ok(d.ok, JSON.stringify(d)); assert.ok(!fs.existsSync(path.join(dir, 'src/big.js')), 'the source file is still on disk');
  });

  console.log(`\n${failed ? '✗' : '✓'} code-edit: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
