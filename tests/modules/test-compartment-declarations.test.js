'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-compartment-declarations.test.js — MG15a, 0.60.326. Spec: cos/spec/cos-manager.spec MOD-MG-DECLARE.
 * James, 2026-10-31: "lets do the orchastration. that needs to be done completely." MG-002: every system declares itself; COS's supervisor
 * reads only those declarations, so before it is built they must say exactly what boots today.
 *   CD-01  every process autopilot boots is declared in the compartment.json of the system whose folder holds its entry
 *   CD-02  each declaration equals its kernel, field for field ({{root}} filled; Electron by autopilot's own lookup)
 *   CD-03  nothing of one machine in a committed file: no absolute path
 *   CD-04  an older compartment.json keeps its own fields (diagnostic's archetype file); the generator is stable (a second sync changes nothing)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'lib', 'cli', 'compartments.js'));
const R = require(path.join(ROOT, 'lib', 'system-registry.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

const kernels = R.kernels(), decl = C.declarations(ROOT);
test('CD-01', `every autopilot process is declared by its own system (${kernels.length})`, () => {
  assert.deepStrictEqual(decl.map(d => d.name).sort(), kernels.map(k => k.name).sort());
  for (const d of decl) { const k = kernels.find(x => x.name === d.name); assert.strictEqual(d.system, C.systemOfKernel(k), d.name); }
});
test('CD-02', 'each declaration equals its kernel, field for field', () => {
  const FIELDS = ['args', 'cwd', 'env', 'phase', 'critical', 'optional', 'onDemand', 'healthUrl', 'maxOldSpaceMB', 'minRestartDelay', 'haltPctOverride', 'idleTimeoutMs'];
  for (const k of kernels) {
    const d = decl.find(x => x.name === k.name);
    for (const f of FIELDS) {
      const want = k[f] === undefined || k[f] === null || (f === 'env' && !Object.keys(k[f]).length) ? undefined : k[f];
      assert.deepStrictEqual(d[f], want, `${k.name}.${f}`);
    }
    if (/electron/i.test(k.cmd)) assert.ok(d.cmd === 'electron' && d.cmdCandidates.some(c => path.resolve(c) === path.resolve(path.isAbsolute(k.cmd) ? k.cmd : path.join(ROOT, k.cwd, k.cmd))) || d.cmdCandidates.length === 2, k.name);
    else assert.strictEqual(d.cmd, k.cmd, `${k.name}.cmd`);
  }
});
test('CD-03', 'no absolute path in a committed compartment.json', () => {
  for (const s of C.SYSTEMS) { const t = fs.readFileSync(path.join(ROOT, s.dir, 'compartment.json'), 'utf8'); assert.ok(!t.includes(ROOT), `${s.dir}/compartment.json holds ${ROOT}`); }
});
test('CD-04', "an older file keeps its fields; a second build changes nothing", () => {
  const dgn = JSON.parse(fs.readFileSync(path.join(ROOT, 'diagnostic', 'compartment.json'), 'utf8'));
  for (const k of ['archetype', 'runtimeId', 'healthCheck', 'compartment']) assert.ok(k in dgn, `diagnostic kept ${k}`);
  const M = C.build();
  for (const s of C.SYSTEMS) {
    const a = JSON.parse(fs.readFileSync(path.join(ROOT, s.dir, 'compartment.json'), 'utf8')).runtime, b = M[s.id].runtime;
    assert.deepStrictEqual(b.process, a.process, `${s.id} process stable`); assert.deepStrictEqual(b.processes, a.processes, `${s.id} processes stable`);
  }
});
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
