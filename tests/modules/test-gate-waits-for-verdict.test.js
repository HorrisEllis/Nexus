'use strict';
/**
 * tests/modules/test-gate-waits-for-verdict.test.js — GV1–GV4 (0.60.257). Map: docs/2026-10-26-gate-waits-for-verdict-phasemap.spec
 * James, 2026-10-26: "the gate doesn't wait for me to accept it or not before it fails. i want to be able to build nexus inside of nexus.
 * need nexus to use those gates. like raid or orchastrator. look at recent phases."
 *
 *   GV-01  a real RAID contract whose phase gate answers awaitsPerson (what Idearium's integrate now does on no-proof): the gate is
 *          not FAILED, no retry is spent (integrate called once), RAID's row is 'awaiting', no self-heal is asked
 *   GV-02  a phase gate whose check ran and failed still FAILs (evidence, not a question) and asks self-heal, as before
 *   GV-03  the verdict reaches RAID: reportExternalOutcome passes the held row
 *   GV-04  run-watch never calls a held run stalled; the Tasks feed shows it as awaiting with its why
 *   GV-05  wired: integrate's no-proof → awaitsPerson, the awaiting-verdict row, the verdict route and its handler, the row, the
 *          Tasks panel's accept / reject, loom
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
const bus = require(path.join(ROOT, 'lib', 'nexus', 'nexus-bus.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const w = console.warn, l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-rd0-'));
const write = (rel, t) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), t); };
write('docs/x-phasemap.spec', 'phases:\n  P1: { files: [lib/a.js, lib/b.js] }\n');
const plan = { intent: 'two files', conditions: [], order: ['lib/a.js', 'lib/b.js'], files: [
  { path: 'lib/a.js', new: true, layer: 'kernel', exports: [{ name: 'x' }], imports: [], steps: ['export x'] },
  { path: 'lib/b.js', new: true, layer: 'engine', exports: [{ name: 'y' }], imports: ['./a.js: x'], steps: ['use x'] }] };
const contractFile = (name) => { const L = CA.fromPhasePlan(plan, { phaseKey: 'P1', title: name, inputs: [{ id: 'map', path: 'docs/x-phasemap.spec' }], root: tmp }); const f = path.join(tmp, `${name}.contract`); CG.save(f, L); return f; };
const executors = ({ fail = null, calls = [] } = {}) => ({
  agent: CA.agentExecutor({ route: () => [{ provider: 'ollama:qwen' }, { provider: 'claude' }], boundaries: { budget: () => null },
    dispatch: async (hops, { gate }) => { calls.push(gate.id); if (fail && gate.file === fail) return { ok: false, provider: hops[0].provider, error: 'the export y is missing' }; return { ok: true, provider: hops[0].provider, evidence: { [`${gate.id}.verified`]: 'ok' } }; } }),
  integrate: async () => ({ ok: true, evidence: { 'phase.integrated': 'met 1/1' } }),
});
const heals = []; bus.on('HEAL_REQUESTED', (e) => heals.push(e && (e.payload || e.data || e)));
{ const l = console.log; console.log = (...a) => { if (!/^\[jaa\]/.test(String(a[0]))) l(...a); }; }   // the store's own lines, or the runner miscounts
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('\ntest-gate-waits-for-verdict — RAID holds a phase for his verdict (GV)');
  let held = null;
  await test('GV-01', 'no-proof → the gate waits for him: not FAILED, one call, RAID row awaiting, no self-heal', () => quiet(async () => {
    const f = contractFile('awaits'); heals.length = 0; let calls = 0;
    const ex = { ...executors(), integrate: async () => { calls++; return { awaitsPerson: true, agent: 'proof-run', why: 'nothing in Nexus can check this phase — accept it or reject it', evidence: { 'phase.integrated': 'awaiting his verdict' } }; } };
    const r = await CI.runContract(f, { source: 'idearium', title: 'phase P1 (no proof)', executors: ex, root: tmp });
    assert.strictEqual(r.status, 'awaiting', JSON.stringify({ status: r.status, why: r.result && r.result.why }));
    assert.strictEqual(calls, 1, 'asked once, never retried');
    assert.deepStrictEqual(r.awaiting.map(a => [a.id, a.person]), [['phase', true]]);
    assert.notStrictEqual(CG.load(f).payload.state.gates.phase.status, 'FAILED');
    assert.ok(!heals.some(h => h && h.gapUuid === r.queueId), 'no self-heal: nothing failed');
    held = r.queueId;
    assert.strictEqual(CI.listQueue().find(x => x.uuid === held).status, 'awaiting');
  }));
  await test('GV-02', 'a check that ran and failed still FAILs and asks self-heal', () => quiet(async () => {
    const f = contractFile('fails-proof'); heals.length = 0;
    const ex = { ...executors(), integrate: async () => ({ ok: false, agent: 'proof-run', evidence: { 'phase.integrated': 'unproven 0/1' } }) };
    const r = await CI.runContract(f, { source: 'idearium', title: 'phase P1 (unproven)', executors: ex, root: tmp });
    assert.strictEqual(r.status, 'fail');
    assert.ok(heals.some(h => h && h.gapUuid === r.queueId));
  }));
  await test('GV-03', 'his verdict reaches RAID: the held row passes', () => {
    assert.ok(CI.reportExternalOutcome(held, { status: 'pass', verdict: 'accepted by James' }).ok);
    assert.strictEqual(CI.listQueue().find(x => x.uuid === held).status, 'pass');
  });
  await test('GV-04', 'run-watch: a held run is never stalled; the Tasks feed says awaiting, with why', () => {
    const RW = require(path.join(ROOT, 'lib/run-watch.js'));
    const old = Date.now() - 3 * 3600e3;
    const rows = [{ runId: 'phrun-gv', repoUuid: 'r1', state: 'building', ts: old }, { runId: 'phrun-gv', repoUuid: 'r1', state: 'awaiting-verdict', ts: old + 1000, error: 'nothing can check it' }];
    const stalled = (RW.stalled ? RW.stalled(rows, { now: Date.now(), minutes: 20 }) : null);
    if (stalled) assert.ok(!stalled.some(s => s.runId === 'phrun-gv'), JSON.stringify(stalled));
    assert.ok(/WAITING = new Set\(\[[^\]]*'awaiting-verdict'/.test(read('lib/run-watch.js')));
    const RA = require(path.join(ROOT, 'lib/repo-activity.js'));
    const t = RA.phaseRow({ runId: 'phrun-gv2', repoUuid: 'r-gv', map: 'docs/x-phasemap.spec', phase: 'P1', state: 'awaiting-verdict', error: 'nothing can check it', ts: Date.now() });
    assert.strictEqual(t.status, 'awaiting'); assert.strictEqual(t.why, 'nothing can check it'); assert.strictEqual(t.runId, 'phrun-gv2');
  });
  await test('GV-05', 'wired: integrate, the held row, the route and handler, the row, the buttons, loom', async () => {
    const api = read('idearium/api/index.js');
    for (const s of ["if (st === 'no-proof') return { awaitsPerson: true", "state: 'awaiting-verdict'", "['api','repos',    ':uuid','phases','verdict'],      'repo.phases.verdict'", 'async function _phaseVerdict(', "CI.reportExternalOutcome(held.raidQueueId, { status: 'pass'", "RI.revert(n.uuid"]) assert.ok(api.includes(s), s);
    const C = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = C.SPEC.find(r => r.key === 'repo.verdict');
    assert.deepStrictEqual(row.req({ args: ['phrun-1', 'accept'], flags: { words: 'good' }, repo: { uuid: 'u' } }), { method: 'POST', path: '/api/repos/u/phases/verdict', body: { runId: 'phrun-1', accept: true, words: 'good', startedBy: 'command' } });
    const ui = read('idearium/ui/js/repo-tasks.js');
    assert.ok(ui.includes('async function rtVerdict(') && ui.includes('✓ accept') && ui.includes('✗ reject'));
    assert.ok(read('loom/maps/run-state-map.js').includes('0.60.257 GV'), 'loom wires');
  });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
