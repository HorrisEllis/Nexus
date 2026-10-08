'use strict';
/**
 * tests/modules/test-system-control.test.js — §0.39.372 NC2: a Nexus system's controls go through its supervisor.
 * James: "Do you think we should have each repo a control panel for the system, and compartment for the nexus repos?"
 * The real nexus/autopilot.js (required, not booted) supervises a throwaway kernel — a tiny node process — through its
 * real spawn and exit paths:
 *   SC-01  restart: stopped and straight back, a new pid, not counted as a crash
 *   SC-02  stop: held down, never auto-restarted, never a crash
 *   SC-03  start: from held; and a tripped breaker is reset by a person starting it
 *   SC-04  an unknown system or op is refused; POST /control/:name/:op is the route
 *   SC-05  Idearium: the system panel (GET /api/repos/:uuid/system, POST …/system/:op) reaches the supervisor and writes
 *          the person's act to the repo's log
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ap = require(path.join(ROOT, 'nexus/autopilot.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const down = (s) => !s.proc || s.proc.exitCode !== null || !!s.proc.signalCode;   // autopilot clears proc when it exits
const up = (s) => !!(s.proc && s.proc.exitCode === null && !s.proc.signalCode);
async function until(fn, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(25); } return false; }

(async () => {
  console.log('\n⬡  A SYSTEM\'S CONTROLS — through its supervisor, never itself\n');
  const quiet = console.log; console.log = () => {};
  const K = { name: 'nc2-probe', cmd: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] };
  ap.KERNELS.push(K);
  ap._state[K.name] = { proc: null, status: 'starting', crashes: [], restarts: 0, lastExit: null, downSince: null, backoffMs: 1000, stableTimer: null, lastActivity: null };
  ap._spawnKernel(K, '');
  console.log = quiet;
  const s = ap._state[K.name];
  await until(() => s.proc && s.proc.pid);

  await test('SC-01', 'restart: stopped and straight back with a new pid, not a crash', async () => {
    const pid0 = s.proc.pid;
    console.log = () => {};
    const r = ap.controlKernel(K.name, 'restart');
    const back = await until(() => s.proc && s.proc.pid !== pid0 && s.proc.exitCode === null);
    console.log = quiet;
    assert.ok(r.ok && r.status === 'restarting', JSON.stringify(r));
    assert.ok(back, 'a new process');
    assert.strictEqual(s.crashes.length, 0, 'not counted as a crash');
  });

  await test('SC-02', 'stop: held down, never auto-restarted, never a crash', async () => {
    console.log = () => {};
    const r = ap.controlKernel(K.name, 'stop');
    await until(() => down(s));
    await wait(1300);   // past the first backoff a crash would have used
    console.log = quiet;
    assert.ok(r.ok);
    assert.strictEqual(s.status, 'held');
    assert.ok(down(s), 'still down');
    assert.strictEqual(s.crashes.length, 0);
  });

  await test('SC-03', 'start: from held; a tripped breaker is reset by a person starting it', async () => {
    console.log = () => {};
    let r = ap.controlKernel(K.name, 'start');
    await until(() => up(s));
    assert.ok(r.ok && up(s), JSON.stringify(r));
    ap.controlKernel(K.name, 'stop'); await until(() => down(s));
    s.status = 'circuit_open'; s.crashes = [1, 2, 3, 4, 5, 6];
    r = ap.controlKernel(K.name, 'start');
    await until(() => up(s));
    console.log = quiet;
    assert.ok(r.ok && s.crashes.length === 0 && up(s));
    console.log = () => {}; ap.controlKernel(K.name, 'stop'); await until(() => down(s)); console.log = quiet;
  });

  await test('SC-04', 'an unknown system or op is refused; POST /control/:name/:op is the route', () => {
    assert.strictEqual(ap.controlKernel('no-such', 'restart').code, 404);
    assert.strictEqual(ap.controlKernel(K.name, 'explode').code, 400);
    const src = fs.readFileSync(path.join(ROOT, 'nexus/autopilot.js'), 'utf8');
    assert.ok(/\\\/control\\\/\(\[a-zA-Z0-9-\]\+\)\\\/\(restart\|stop\|start\)\$/.test(src));
    assert.ok(/s\.status === 'held' \|\| s\.status === 'restarting'/.test(src), 'the exit handler treats them as intentional');
  });

  await test('SC-05', "Idearium's system panel reaches the supervisor and logs the person's act", () => {
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/\['api','repos',    ':uuid','system'\],  'repo\.system'\]/.test(idx) && /\['api','repos',    ':uuid','system',':op'\],  'repo\.system\.control'\]/.test(idx));
    assert.ok(/case 'repo\.system\.control':/.test(idx) && /\/control\/\$\{encodeURIComponent\(kernel\)\}\/\$\{op\}/.test(idx));
    assert.ok(/kind: `system\.\$\{op\}`/.test(idx), "the person's act is a row of the repo's log");
  });

  await test('SC-06', "one intent: a repo's charter set on its COS compartment; a page check is named, not lost", () => {
    const cb = require(path.join(ROOT, 'lib/cos-bridge.js'));
    const CH = require(path.join(ROOT, 'lib/charter.js'));
    const parent = cb.createCompartment({ name: `nc2-nexus-${Date.now()}` }).compartment;
    const child = cb.createCompartment({ name: `nc2-guardian-${Date.now()}`, parentId: parent.id }).compartment;
    const pr = cb.setIntent(parent.id, { conditions: [{ says: 'every system answers /health', check: { kind: 'command', run: 'node -e 0' } }], axioms: ['nothing silently fails'] });
    assert.ok(pr.ok, pr.error);
    const ch = CH.parse(['charter:', '  axioms: ["least code"]', '  conditions:', '    - { says: "its tests pass", check: { kind: tests, run: "node -e 0" } }',
      '    - { says: "the page renders", check: { kind: page, path: ui/index.html } }', '  end_state:', '    - { says: "a job reaches its tab", check: { kind: file, path: README.md } }'].join('\n'));
    assert.deepStrictEqual(ch.errors, []);
    const r = cb.setIntent(child.id, { endState: ch.endState, conditions: ch.conditions, axioms: ch.axioms });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual(r.dropped, ['the page renders'], 'what COS cannot check is named');
    const eff = cb.intentOf(child.id);
    assert.deepStrictEqual(eff.conditions.map(c => [c.says, c.inherited || null]), [['every system answers /health', parent.name], ['its tests pass', null]]);
    assert.deepStrictEqual(eff.axioms, ['nothing silently fails', 'least code']);
  });

  await test('SC-07', "the charter as it applies: Nexus's conditions and axioms first, marked; requests and proofs read it", () => {
    const CH = require(path.join(ROOT, 'lib/charter.js'));
    const own = CH.parse('charter:\n  axioms: ["least code"]\n  conditions:\n    - { says: "its tests pass", check: { kind: tests, run: "node -e 0" } }\n');
    const eff = { conditions: [{ says: 'every system answers /health', check: { kind: 'command', run: 'x' }, inherited: 'nexus' }, { says: 'its tests pass', check: { kind: 'tests', run: 'node -e 0' } }], axioms: ['nothing silently fails', 'least code'] };
    const ch = CH.withInherited(own, eff);
    assert.deepStrictEqual(ch.conditions.map(c => c.says), ['every system answers /health', 'its tests pass']);
    assert.deepStrictEqual(ch.axioms, ['nothing silently fails', 'least code']);
    assert.match(CH.requestText(ch), /must stay true \(from nexus\): every system answers \/health/);
    assert.strictEqual(CH.proofConditions(ch)[0].says, '[from nexus] every system answers /health');
    const idx = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    assert.ok(/function _charterOf\(repoUuid\)/.test(idx) && (idx.match(/_charterOf\(/g) || []).length >= 5, 'the build request, the proof, the work-surface proof and the charter view read it');
    assert.ok(/cos-bridge\.js'\)\.setIntent\(repo\.compartmentId/.test(idx), 'saving the charter sets the compartment\'s intent');
  });

  ap.KERNELS.splice(ap.KERNELS.indexOf(K), 1);
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
