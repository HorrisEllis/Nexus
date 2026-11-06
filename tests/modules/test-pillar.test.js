'use strict';
/**
 * tests/modules/test-pillar.test.js — PIL1_pillar_stands (docs/2026-11-06-pillar-phasemap.spec), MOD-PIL-SYSTEM (pillar/spec/pillar.spec).
 * James, 2026-11-06 (EAS_D8): "One kernel, merged". Pillar is written in Emerge (PIL_D3); this file only runs Emerge's own tools on it for the
 * Nexus suite. Scripts and tests may require a system's code; Pillar itself requires nothing.
 *   PI-01  eg check passes on every pillar/**.eg; eg test passes on every pillar/test/*.test.eg; eg run pillar/cli.eg contracts answers
 *   PI-02  GATE-PIL1-002, both ways: every public top-level name of pillar.eg is in Pillar's registry, and every registered name is declared
 *   PI-03  GATE-PIL-EG and GATE-PIL-FLOOR: no .js in pillar/; every `use` resolves inside pillar/
 *   PI-04  §1.2: an unknown command is refused (exit 1) and the commands are named; what is not built names the phase that builds it
 *   PI-05  declared in nexus-self's systems, owning pillar/
 */
const assert = require('assert'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), PIL = path.join(ROOT, 'pillar'), EG = path.join(ROOT, 'emerge/emerge/lang/eg.js');
const { parse } = require(path.join(ROOT, 'emerge/emerge/lang/parser.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const eg = (...a) => spawnSync(process.execPath, [EG, ...a], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(PIL), egs = files.filter(f => f.endsWith('.eg'));
const top = (f) => parse(fs.readFileSync(f, 'utf8'), path.basename(f)).items;

console.log('\n⬡  Pillar stands, in Emerge (PIL1)\n');

test('PI-01', 'eg check, eg test and eg run pass on Pillar', () => {
  assert.ok(egs.length >= 4, 'pillar.eg, cli.eg, registry.eg, the test');
  for (const f of egs) { const r = eg('check', f); assert.strictEqual(r.status, 0, `${path.relative(ROOT, f)}: ${r.stdout}${r.stderr}`); }
  for (const f of egs.filter(f => f.endsWith('.test.eg'))) { const r = eg('test', f); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /\d+ passed, 0 failed/); }
  const r = eg('run', 'pillar/cli.eg', 'contracts'); assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim()); assert.strictEqual(j.system, 'pillar'); assert.ok(Array.isArray(j.contracts));
  if (!j.contracts.length) assert.match(j.note, /PIL2_contracts/, 'empty, and says why');
});

test('PI-02', 'the registry and pillar.eg agree, both ways (GATE-PIL1-002)', () => {
  const declared = top(path.join(PIL, 'pillar.eg')).filter(s => (s.type === 'FnDecl' || s.type === 'Let') && !s.name.startsWith('_')).map(s => s.name);
  const reg = JSON.parse(eg('run', 'pillar/cli.eg', 'registry').stdout.trim());
  assert.strictEqual(reg.system, 'pillar');
  assert.deepStrictEqual(reg.exports.map(e => e.name).sort(), declared.sort());
  const cli = fs.readFileSync(path.join(PIL, 'cli.eg'), 'utf8');
  const handled = [...cli.matchAll(/cmd == "([a-z-]+)"/g)].map(m => m[1]).filter(c => c !== 'help');
  assert.deepStrictEqual(reg.commands.map(c => c.name).sort(), handled.sort(), 'every command handled is registered, and only those');
});

test('PI-03', 'no .js in pillar/; every use stays inside pillar/', () => {
  assert.deepStrictEqual(files.filter(f => /\.[cm]?js$/.test(f)).map(f => path.relative(ROOT, f)), []);
  for (const f of egs) for (const s of top(f).filter(s => s.type === 'Use')) {
    const to = path.resolve(path.dirname(f), s.path || s.file || s.from);
    assert.ok(to.startsWith(PIL + path.sep), `${path.relative(ROOT, f)} uses ${path.relative(ROOT, to)}, outside pillar/`);
  }
});

test('PI-04', 'refusals are said, never silent', () => {
  const r = eg('run', 'pillar/cli.eg', 'bogus'); assert.strictEqual(r.status, 1); assert.match(r.stderr, /unknown command bogus/); assert.match(r.stdout, /cli\.eg contracts/);
  const c = eg('run', 'pillar/cli.eg', 'conform'); assert.strictEqual(c.status, 1); assert.match(c.stderr, /PIL3_conformance/);
  const k = eg('run', 'pillar/cli.eg', 'check', 'pillar:constraint', 'x'); assert.strictEqual(k.status, 1); assert.match(k.stdout, /"ok":false/);
});

test('PI-05', 'declared in nexus-self\'s systems, owning pillar/', () => {
  const S = require(path.join(ROOT, 'lib/nexus-self/systems.js'));
  const p = S.SYSTEMS.find(s => s.name === 'pillar'); assert.ok(p && p.dirs[0] === 'pillar' && p.entry === null);
  assert.strictEqual(S.ownerOf('pillar/pillar.eg'), 'pillar');
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
