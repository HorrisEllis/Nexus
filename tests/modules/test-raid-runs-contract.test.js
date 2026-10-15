'use strict';
/**
 * tests/modules/test-raid-runs-contract.test.js — RD0 (docs/2026-10-15-one-contract-raid-releases-phasemap.spec): RAID
 * runs the .contract. cortex/core/raid/contract-intake.js runContract / submitV2 / processNext / registerExecutors /
 * legacyToV2.
 * James (2026-08-28): "we have all contracts … go to raid's input folder, and queue, then through raid" · (2026-10-15)
 * "look at the contracts also and raid. i feel something happened".
 *
 *   RR-01  a .contract run through RAID: its bricks run with the submitter's executors, the row is kind v2 and PASSes
 *          with the audit; RAID's queue lists it
 *   RR-02  RAID's gates before: a source whose RAID contract does not allow 'build' is BLOCKED and no brick runs
 *   RR-03  a contract that cannot complete FAILs naming each failed brick and its GT1 class, and asks self-heal
 *          (HEAL_REQUESTED carries the bricks); a self-heal contract never asks itself
 *   RR-04  the queue: a submitted .contract waits; with no executors for its source processNext sets it aside, said;
 *          once registered, processNext runs it to PASS
 *   RR-05  a legacy contract becomes a valid one-brick .contract and runs (nothing lost)
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const CI = require(path.join(ROOT, 'cortex/core/raid/contract-intake.js'));
const CG = require(path.join(ROOT, 'cortex/core/raid/contract-gates.js'));
const CA = require(path.join(ROOT, 'cortex/core/raid/contract-adapters.js'));
const bus = require(path.join(ROOT, 'nexus/nexus-bus.js'));

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

(async () => {
  console.log('\ntest-raid-runs-contract — RAID runs the .contract (RD0)');

  await test('RR-01', 'a .contract run through RAID: bricks run, the row is v2 and PASSes with the audit', () => quiet(async () => {
    const f = contractFile('ok'); const calls = [];
    const r = await CI.runContract(f, { source: 'idearium', title: 'phase P1', executors: executors({ calls }), root: tmp });
    assert.ok(r.ok, JSON.stringify({ status: r.status, blocked: r.blocked, why: r.result && r.result.why }));
    assert.strictEqual(r.status, 'pass'); assert.strictEqual(calls.length, 2);
    assert.ok(r.audit && r.audit.bricks.length === 2 && r.audit.complete);
    const row = CI.listQueue().find(x => x.uuid === r.queueId);
    assert.ok(row && row.kind === 'v2' && row.status === 'pass' && row.bricks === 2 && row.contractFile === f, JSON.stringify(row));
    assert.strictEqual(CG.load(f).payload.state.gates.phase.status, 'PASSED', 'the contract file was saved with its checkpoints');
  }));

  await test('RR-02', "RAID's gates before: a source not allowed to build is BLOCKED and nothing runs", () => quiet(async () => {
    const f = contractFile('refused'); const calls = [];
    const r = await CI.runContract(f, { source: 'orchestrator', title: 'not allowed', executors: executors({ calls }), root: tmp });
    assert.strictEqual(r.status, 'blocked'); assert.match(r.blocked.reason, /RAID refused: 'build' is not in 'orchestrator's allowed_actions/);
    assert.strictEqual(calls.length, 0, 'no brick ran');
    assert.strictEqual(CI.listQueue().find(x => x.uuid === r.queueId).status, 'blocked');
  }));

  await test('RR-03', 'a contract that cannot complete FAILs naming its bricks and classes, and asks self-heal', () => quiet(async () => {
    const f = contractFile('fails'); heals.length = 0;
    const r = await CI.runContract(f, { source: 'idearium', title: 'phase P1 (b fails)', executors: executors({ fail: 'lib/b.js' }), root: tmp });
    assert.strictEqual(r.status, 'fail');
    const b = r.failedBricks.find(x => /b\.js/.test(x.id));
    assert.ok(b && b.class === 'capability', JSON.stringify(r.failedBricks));
    const h = heals.find(x => x && x.gapUuid === r.queueId);
    assert.ok(h && /did not complete/.test(h.body) && h.bricks.some(x => x.id === b.id), JSON.stringify(heals).slice(0, 400));
    heals.length = 0;
    const s = await CI.runContract(contractFile('selfheal'), { source: 'copilot', intention: 'build', title: 'self-heal fix', executors: executors({ fail: 'lib/b.js' }), root: tmp });
    assert.strictEqual(s.status, 'fail'); assert.ok(heals.some(x => x && x.gapUuid === s.queueId), 'a copilot contract asks self-heal');
  }));

  await test('RR-04', 'the queue: waits, set aside without executors (said), runs once they are registered', () => quiet(async () => {
    const f = contractFile('queued');
    const q = CI.submitV2(f, { source: 'cli', title: 'queued phase', root: tmp });
    assert.strictEqual(CI.listQueue().find(x => x.uuid === q.queueId).status, 'queued');
    const first = await CI.processNext();
    assert.strictEqual(first.status, 'blocked'); assert.match(first.reason, /no executors for cli/);
    const f2 = contractFile('queued2');
    const q2 = CI.submitV2(f2, { source: 'cli', title: 'queued phase 2', root: tmp });
    CI.registerExecutors('cli', executors());
    let r = null;
    for (let i = 0; i < 5 && !(r && r.queueId === q2.queueId); i++) r = await CI.processNext();
    assert.ok(r && r.queueId === q2.queueId && r.status === 'pass', JSON.stringify(r && { q: r.queueId, s: r.status }));
    assert.strictEqual(CI.listQueue().find(x => x.uuid === q2.queueId).status, 'pass');
  }));

  await test('RR-05', 'a legacy contract becomes a valid one-brick .contract and runs', () => quiet(async () => {
    const p = CI.legacyToV2({ content: 'write lib/c.js exporting z', title: 'legacy job', forAgent: 'claude' });
    assert.deepStrictEqual(CG.validate(p), [], JSON.stringify(CG.validate(p)));
    assert.strictEqual(p.gates.length, 1); assert.strictEqual(p.legacy.title, 'legacy job');
    const r = await CI.runContract(p, { source: 'cli', title: 'legacy job', root: tmp,
      executors: { agent: async (t, a, { gate }) => ({ ok: true, agent: 'claude', evidence: { [`${gate.id}.done`]: 'yes' } }) } });
    assert.strictEqual(r.status, 'pass', JSON.stringify(r.result && r.result.why));
  }));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 50).unref();
})();
