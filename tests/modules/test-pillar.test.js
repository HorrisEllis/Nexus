'use strict';
/**
 * tests/modules/test-pillar.test.js — PIL1_pillar_stands (docs/2026-11-06-pillar-phasemap.spec), MOD-PIL-SYSTEM (pillar/spec/pillar.spec).
 * James, 2026-11-06 (EAS_D8): "One kernel, merged". Pillar is written in Emerge (PIL_D3); this file only runs Emerge's own tools on it for the
 * Nexus suite. Scripts and tests may require a system's code; Pillar itself requires nothing.
 *   PI-01  eg check passes on every pillar/**.eg; eg test passes on every pillar/test/*.test.eg; eg run pillar/cli.eg contracts answers
 *   PI-02  GATE-PIL1-002 by CIE-EG §5: Pillar's record is in Emerge's component registry (components()), its hooks are what it offers, and every
 *          in hook has a CLI command and every command reaches a hook or is said not built. No second list (James: "Look at CIE-EG.")
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
  assert.ok(egs.length >= 3, 'pillar.eg, cli.eg, the test');
  for (const f of egs) { const r = eg('check', f); assert.strictEqual(r.status, 0, `${path.relative(ROOT, f)}: ${r.stdout}${r.stderr}`); }
  for (const f of egs.filter(f => f.endsWith('.test.eg'))) { const r = eg('test', f); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /\d+ passed, 0 failed/); }
  const r = eg('run', 'pillar/cli.eg', 'contracts'); assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim()); assert.strictEqual(j.hook, 'contracts'); assert.ok(j.ok && Array.isArray(j.value));
  if (!j.value.length) assert.match(j.why, /PIL2_contracts/, 'empty, and says why');
});

test('PI-02', 'Pillar is a component in Emerge\'s registry; its hooks are what it offers (CIE-EG §5)', () => {
  const r = eg('run', 'pillar/cli.eg', 'registry'); assert.strictEqual(r.status, 0, r.stderr);
  const reg = JSON.parse(r.stdout.trim());
  assert.deepStrictEqual([reg.record.id, reg.record.namespace, reg.record.version], ['pillar.kernel', 'pillar', '0.1.0']);
  assert.match(reg.record.uuid, /^emerge-component-/);
  const ins = reg.hooks.filter(h => h.direction === 'in').map(h => h.name).sort();
  const pil = top(path.join(PIL, 'pillar.eg')); assert.deepStrictEqual(pil.map(s => [s.type, s.name]), [['Compartment', 'Pillar']], 'pillar.eg is one component and nothing else');
  const cli = fs.readFileSync(path.join(PIL, 'cli.eg'), 'utf8');
  const cmds = [...cli.matchAll(/cmd == "([a-z_]+)"/g)].map(m => m[1]).filter(c => !['help', 'version', 'registry', 'conform'].includes(c)).sort();
  assert.deepStrictEqual(cmds, ins, 'every in hook has a command, every command sends to a hook');
  for (const c of cmds) assert.match(cli, new RegExp(`send pillar\\.Pillar\\.${c} `), `${c} goes through the hook`);
  assert.ok(!fs.existsSync(path.join(PIL, 'registry.eg')), 'no second registry beside Emerge\'s');
});

test('PI-03', 'no .js in pillar/; every use stays inside pillar/', () => {
  assert.deepStrictEqual(files.filter(f => /\.[cm]?js$/.test(f)).map(f => path.relative(ROOT, f)), []);
  for (const f of egs) for (const s of top(f).filter(s => s.type === 'Use')) {
    const to = path.resolve(path.dirname(f), s.path || s.file || s.from);
    assert.ok(to.startsWith(PIL + path.sep), `${path.relative(ROOT, f)} uses ${path.relative(ROOT, to)}, outside pillar/`);
  }
});

test('PI-04', 'refusals are said, never silent', () => {
  const r = eg('run', 'pillar/cli.eg', 'bogus'); assert.strictEqual(r.status, 1); assert.match(r.stderr, /unknown command bogus/); assert.match(r.stdout, /in hooks:\n  contracts/);
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
