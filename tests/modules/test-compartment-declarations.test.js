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
 *   CD-05  0.60.331 MG17b — the files are the systems' own: a hand change to one compartment.json shows in system-registry kernels() and in
 *          COS's supervisor alike, and the generator keeps it
 * Since MG17b kernels() reads these declarations, so CD-01/02 compare them with the list autopilot held, archived at the handover
 * (frozenKernels): the move changed nothing.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'lib', 'cli', 'compartments.js'));
const R = require(path.join(ROOT, 'lib', 'system-registry.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }

const kernels = R.frozenKernels(), decl = C.declarations(ROOT);
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
test('CD-05', 'a hand change to one compartment.json shows in kernels() and in COS\'s supervisor, and the generator keeps it', () => {
  const os = require('os'); const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'mg17b-'));
  try {
    fs.mkdirSync(path.join(fx, 'svc'));
    const proc = { name: 'svc', cmd: 'node', args: ['{{root}}/svc/a.js'], phase: 2, healthUrl: 'http://127.0.0.1:1/health' };
    const write = (p) => fs.writeFileSync(path.join(fx, 'svc', 'compartment.json'), JSON.stringify({ name: 'svc', runtime: { process: p } }));
    write(proc);
    const { readDeclarations } = require(path.join(ROOT, 'cos', 'manager', 'supervisor.js'));
    assert.strictEqual(R.kernels({ root: fx })[0].phase, 2); assert.strictEqual(readDeclarations(fx)[0].phase, 2);
    write({ ...proc, phase: 3, critical: true });   // his edit, by hand
    const k = R.kernels({ root: fx })[0], d = readDeclarations(fx)[0];
    assert.deepStrictEqual([k.phase, k.critical, d.phase, d.critical], [3, true, 3, true]);
    assert.strictEqual(k.args[0], path.join(fx, 'svc', 'a.js').split(path.sep).join('/').replace(/^([A-Za-z]:)/, '$1'), '{{root}} filled');
    assert.ok(!('system' in k), 'the kernel shape: no system field');
  } finally { fs.rmSync(fx, { recursive: true, force: true }); }
  const M = C.build(); const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'cortex', 'compartment.json'), 'utf8'));
  assert.deepStrictEqual(M.cortex.runtime.process, real.runtime.process, 'the generator keeps a declared process as written');
});
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
