'use strict';
/**
 * tests/modules/test-project-split-esm.test.js — DC1 (0.60.629): an ES module splits like a CommonJS one, one component a file, the old path the door.
 * James, 2026-11-21: "Like I'm talking the way emerge does. Like each component its own file. ... Then all wired into the drawbridge".
 *   SE-01  the JS adapter names ES-module units: imports (what they bind, where from), export declarations, export default, export lists
 *   SE-02  a three-section ES module splits into three pieces and a door; written out and imported, it exports and behaves exactly as before
 *   SE-03  a unit that uses import.meta stays in the door
 */
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const J = require(path.join(ROOT, 'lib', 'adapters', 'javascript.js'));
const S = require(path.join(ROOT, 'lib', 'project-split.js'));
let passed = 0, failed = 0;
async function test(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); } }

const SRC = [
  "import path from 'path';",
  '',
  '// ── names ──',
  'export const PREFIX = "x-";',
  'export function nameOf(s) { return PREFIX + path.basename(s); }',
  '',
  '// ── counting ──',
  'export function count(xs) { return xs.length; }',
  'function twice(n) { return n * 2; }',
  'export function doubleCount(xs) { return twice(count(xs)); }',
  '',
  '// ── the report ──',
  'export default function report(files) { return files.map(nameOf).join(",") + ":" + doubleCount(files); }',
  'const here = import.meta.url;',
  'export { here };',
  '',
].join('\n');

(async () => {
  await test('SE-01', 'the adapter names ES-module units', () => {
    const u = J.units(SRC, 'lib/m.js');
    const imp = u.find(x => x.kind === 'import');
    assert.deepStrictEqual([imp.names, imp.from], [['path'], 'path']);
    assert.ok(u.find(x => x.names && x.names.includes('PREFIX')).exported);
    assert.ok(u.find(x => x.names && x.names.includes('report')).exportDefault);
    assert.deepStrictEqual(u.find(x => x.kind === 'export-list').exportNames, [{ local: 'here', as: 'here' }]);
  });

  await test('SE-02', 'split into pieces and a door; imported, it exports and behaves exactly as before', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se02-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{ "type": "module" }');
    fs.mkdirSync(path.join(dir, 'lib'));
    fs.writeFileSync(path.join(dir, 'lib', 'm.js'), SRC);
    const before = await import(pathToFileURL(path.join(dir, 'lib', 'm.js')).href + '?before');
    const p = S.plan('lib/m.js', SRC, { by: 'auto' });
    assert.ok(p.ok, JSON.stringify(p.refused || p.why));
    assert.ok(p.pieces.length >= 2, 'at least two pieces: ' + p.pieces.map(x => x.path).join(', '));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'se02b-'));
    fs.writeFileSync(path.join(out, 'package.json'), '{ "type": "module" }');
    for (const w of p.writes) { const f = path.join(out, w.path); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, w.after); }
    const after = await import(pathToFileURL(path.join(out, 'lib', 'm.js')).href);
    const files = ['/a/one.txt', '/b/two.txt'];
    assert.strictEqual(after.default(files), before.default(files));
    assert.strictEqual(after.nameOf('/q/z.js'), before.nameOf('/q/z.js'));
    assert.strictEqual(after.doubleCount([1, 2, 3]), 6);
    assert.strictEqual(after.PREFIX, 'x-');
    assert.deepStrictEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'the same exports');
  });

  await test('SE-03', 'a unit that uses import.meta stays in the door', () => {
    const p = S.plan('lib/m.js', SRC, { by: 'auto' });
    assert.ok(/const here = import\.meta\.url/.test(p.door), 'here stays in the door');
    assert.ok(!p.pieces.some(x => x.names.includes('here')));
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
