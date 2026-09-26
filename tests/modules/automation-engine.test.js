'use strict';
// Real test for clear-glass/src/mesh/automation-engine.js. James: "don't
// lose any... automation, pipeline, scheduling" from the uploaded
// external reference — this is the real, scoped, actually-running
// engine that replaces it.

const assert = require('assert');
const fs = require('fs');

function fresh() {
  delete require.cache[require.resolve('../../clear-glass/src/mesh/automation-engine.js')];
  const { AutomationEngine, WORKFLOWS_DIR } = require('../../clear-glass/src/mesh/automation-engine.js');
  return { AutomationEngine, WORKFLOWS_DIR };
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}

(async () => {

await test('AE-001', 'create() persists a real .workflow.json file', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({});
  const { workflow } = engine.create({ name: 'Test WF', status: 'draft', steps: [] });
  const fp = require('path').join(WORKFLOWS_DIR, `${workflow.id}.workflow.json`);
  assert.ok(fs.existsSync(fp), 'a real workflow file must be written');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-002', 'run() executes an agent step through the real, injected enqueueFn — no second dispatch path', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const enqueued = [];
  const engine = new AutomationEngine({ enqueueFn: (t) => enqueued.push(t) });
  const { workflow } = engine.create({
    name: 'Dispatch', status: 'active',
    steps: [{ type: 'agent', config: { agentKey: 'claude', prompt: 'hello' } }],
  });
  const result = await engine.run(workflow.id, 'manual');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(enqueued.length, 1);
  assert.deepStrictEqual(enqueued[0], { agentKey: 'claude', prompt: 'hello' });
  cleanup(WORKFLOWS_DIR);
});

await test('AE-003', 'run() reports a real error for a not-yet-built step type, never silently skips it', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({});
  const { workflow } = engine.create({ name: 'Bad', status: 'active', steps: [{ type: 'branch', config: {} }] });
  const result = await engine.run(workflow.id);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('unknown step type: "branch"'), 'error must name the step honestly, not pretend it ran');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-004', 'a delay step actually waits (not an instant no-op), capped at 5 minutes', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({});
  const { workflow } = engine.create({ name: 'Delay', status: 'active', steps: [{ type: 'delay', config: { ms: 60 } }] });
  const t0 = Date.now();
  const result = await engine.run(workflow.id);
  assert.strictEqual(result.ok, true);
  // §HONEST — a tight ms-for-ms threshold on real wall-clock timers is
  // inherently flaky (setTimeout's own guarantee is "at least", not
  // "exactly", and can read a few ms short depending on scheduler/timer
  // resolution); the real property under test is "this genuinely waited,
  // not returned instantly," checked with real slack, not a race.
  assert.ok(Date.now() - t0 >= 40, `expected a real, non-trivial wait, got ${Date.now() - t0}ms`);
  cleanup(WORKFLOWS_DIR);
});

await test('AE-005', 'a draft (non-active) workflow is never fired by tick(), only by an explicit run()', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const enqueued = [];
  const engine = new AutomationEngine({ enqueueFn: (t) => enqueued.push(t) });
  engine.create({
    name: 'Draft', status: 'draft',
    steps: [{ type: 'trigger', config: { intervalMs: 1 } }, { type: 'agent', config: { agentKey: 'claude', prompt: 'x' } }],
  });
  engine.tick();
  assert.strictEqual(enqueued.length, 0, 'a draft workflow must never auto-fire');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-006', 'remove() deletes both the in-memory entry and the real persisted file', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({});
  const { workflow } = engine.create({ name: 'ToDelete', steps: [] });
  const fp = require('path').join(WORKFLOWS_DIR, `${workflow.id}.workflow.json`);
  engine.remove(workflow.id);
  assert.strictEqual(fs.existsSync(fp), false);
  assert.strictEqual(engine.list().length, 0);
  cleanup(WORKFLOWS_DIR);
});

await test('AE-007', "start()'s tick interval is unref'd — never keeps the process alive on its own", () => {
  const { AutomationEngine } = fresh();
  const engine = new AutomationEngine({});
  engine.start();
  assert.ok(engine._tickTimer, 'a real timer must exist after start()');
  assert.strictEqual(engine._tickTimer.hasRef(), false, 'the timer must be unref\'d');
  engine.stop();
});

await test('AE-008', 'a condition step evaluates against real, live mesh data and routes to onTrue/onFalse', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const enqueued = [];
  const engine = new AutomationEngine({
    enqueueFn: (t) => enqueued.push(t),
    meshViewFn: () => [{ id: 'claude', status: 'online' }],
  });
  const { workflow } = engine.create({
    name: 'Cond', status: 'active',
    steps: [
      { id: 'c1', type: 'condition', config: { var: 'claude.status', op: '==', value: 'online', onTrue: 'a1', onFalse: 'end' } },
      { id: 'a1', type: 'agent', config: { agentKey: 'claude', prompt: 'hi' } },
    ],
  });
  const result = await engine.run(workflow.id);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(enqueued.length, 1, 'the onTrue branch must have actually run the agent step');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-009', 'a condition step with no matching mesh entry resolves undefined, not a thrown lookup error', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({ meshViewFn: () => [] });
  const { workflow } = engine.create({
    name: 'CondMiss', status: 'active',
    steps: [{ id: 'c1', type: 'condition', config: { var: 'ghost.status', op: '==', value: 'online' } }],
  });
  const result = await engine.run(workflow.id);
  assert.strictEqual(result.ok, true, 'a missing var must resolve to a real false comparison, not crash the run');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-010', 'per-step CRUD: add/update/move/remove all persist to the real workflow file', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const engine = new AutomationEngine({});
  const { workflow } = engine.create({ name: 'CRUD', steps: [] });
  const added = engine.addStep(workflow.id, { type: 'delay', config: { ms: 5 } });
  assert.strictEqual(added.ok, true);
  const stepId = added.step.id;
  engine.updateStep(workflow.id, stepId, { config: { ms: 50 } });
  assert.strictEqual(engine.get(workflow.id).steps[0].config.ms, 50);
  engine.addStep(workflow.id, { type: 'delay', config: { ms: 5 } });
  engine.moveStep(workflow.id, stepId, 'down');
  assert.strictEqual(engine.get(workflow.id).steps[1].id, stepId, 'move must actually reorder');
  engine.removeStep(workflow.id, stepId);
  assert.strictEqual(engine.get(workflow.id).steps.length, 1);
  cleanup(WORKFLOWS_DIR);
});

// ── §0.39.265 — user-friendly workflows ──────────────────────────────────
await test('AE-011', 'the workflow store is under the test sandbox, never the real data/brainos/workflows', () => {
  const { WORKFLOWS_DIR } = fresh();
  assert.ok(!WORKFLOWS_DIR.startsWith(require('path').resolve(__dirname, '../../data')), WORKFLOWS_DIR);
});

await test('AE-012', 'nextScheduled: every-N and daily-at-a-time on chosen weekdays; manual is null', () => {
  const { nextScheduled } = require('../../clear-glass/src/mesh/automation-engine.js');
  const from = new Date(2026, 8, 25, 10, 0, 0).getTime(); // Fri 25 Sep 2026 10:00 local
  assert.strictEqual(nextScheduled({ intervalMs: 60000 }, from), from + 60000);
  assert.strictEqual(nextScheduled({}, from), null);
  const d1 = new Date(nextScheduled({ at: '09:00', days: [1, 2, 3, 4, 5] }, from));   // 09:00 today has passed → Monday
  assert.deepStrictEqual([d1.getDay(), d1.getHours(), d1.getMinutes(), d1.getDate()], [1, 9, 0, 28]);
  const d2 = new Date(nextScheduled({ at: '17:30', days: [] }, from));                // later today, every day
  assert.deepStrictEqual([d2.getDate(), d2.getHours(), d2.getMinutes()], [25, 17, 30]);
});

await test('AE-013', 'a switched-off step is skipped; a condition can stop the workflow; mesh.* values resolve', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const enq = [];
  const e = new AutomationEngine({ enqueueFn: (t) => enq.push(t), statsFn: () => ({ queueDepth: 7 }) });
  const { workflow } = e.create({ name: 'S', status: 'paused', steps: [
    { type: 'agent', enabled: false, config: { agentKey: 'claude', prompt: 'skipped' } },
    { type: 'condition', config: { var: 'mesh.queueDepth', op: '>', value: '5', onTrue: 'stop', onFalse: 'next' } },
    { type: 'agent', config: { agentKey: 'claude', prompt: 'never' } }] });
  const r = await e.run(workflow.id);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(enq, [], 'the off step and the step after stop both did not run');
  assert.ok(e.getLog(10, workflow.id).some(x => /stopped by a condition/.test(x.msg)));
  assert.ok(e.getLog(10, workflow.id).some(x => /skipped \(switched off\)/.test(x.msg)));
  cleanup(WORKFLOWS_DIR);
});

await test('AE-014', 'agent steps carry the account; macro and notify steps call their hooks; clear-glass is a known system', async () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  const { SYSTEM_PORTS } = require('../../clear-glass/src/mesh/automation-engine.js');
  cleanup(WORKFLOWS_DIR);
  assert.strictEqual(SYSTEM_PORTS['clear-glass'], SYSTEM_PORTS.clearglass);
  const enq = [], macros = [], notes = [];
  const e = new AutomationEngine({ enqueueFn: (t) => enq.push(t) });
  e.setHooks({ runMacroFn: async (m) => { macros.push(m); return { ok: true }; }, notifyFn: async (n) => notes.push(n) });
  const { workflow } = e.create({ name: 'Digest', status: 'paused', steps: [
    { type: 'agent', config: { agentKey: 'claude', prompt: 'hi', accountId: 'acc1' } },
    { type: 'macro', config: { name: 'apply', agentId: 'default', params: { rate: '45' } } },
    { type: 'notify', config: { title: '{{workflow}} done', body: 'ok' } }] });
  assert.strictEqual((await e.run(workflow.id)).ok, true);
  assert.deepStrictEqual(enq, [{ agentKey: 'claude', prompt: 'hi', accountId: 'acc1' }]);
  assert.deepStrictEqual(macros, [{ name: 'apply', agentId: 'default', params: { rate: '45' } }]);
  assert.deepStrictEqual(notes, [{ title: 'Digest done', body: 'ok' }]);
  e.setHooks({ runMacroFn: async () => ({ error: 'url does not match' }) });
  const bad = await e.run(workflow.id);
  assert.strictEqual(bad.ok, false); assert.match(bad.error, /macro "apply": url does not match/);
  cleanup(WORKFLOWS_DIR);
});

await test('AE-015', 'create() gives templates/duplicates fresh step ids and re-points condition branches', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const e = new AutomationEngine({});
  const steps = [{ id: 'c1', type: 'condition', config: { var: 'mesh.queueDepth', op: '>', value: '1', onTrue: 'n1', onFalse: 'stop' } }, { id: 'n1', type: 'notify', config: { title: 'x' } }];
  const a = e.create({ name: 'A', steps }).workflow, b = e.create({ name: 'B', steps: a.steps }).workflow;
  const t = e.create({ name: 'T', steps: [{ type: 'trigger', config: {} }, { type: 'notify', config: {} }, { type: 'delay', config: {} }] }).workflow;
  assert.strictEqual(new Set(t.steps.map(x => x.id)).size, 3, 'steps given without ids (templates) each get their own id');
  assert.notStrictEqual(a.steps[1].id, 'n1'); assert.notStrictEqual(b.steps[1].id, a.steps[1].id);
  assert.strictEqual(a.steps[0].config.onTrue, a.steps[1].id);
  assert.strictEqual(b.steps[0].config.onTrue, b.steps[1].id);
  assert.strictEqual(b.steps[0].config.onFalse, 'stop');
  cleanup(WORKFLOWS_DIR);
});

await test('AE-016', 'updateStep switches a step on/off and names it; nextRunAt reflects an active daily trigger', () => {
  const { AutomationEngine, WORKFLOWS_DIR } = fresh();
  cleanup(WORKFLOWS_DIR);
  const e = new AutomationEngine({});
  const wf = e.create({ name: 'T', status: 'active', steps: [{ type: 'trigger', config: { at: '07:00', days: [] } }, { type: 'delay', config: { ms: 1 } }] }).workflow;
  const at = new Date(e.nextRunAt(e.get(wf.id)));
  assert.deepStrictEqual([at.getHours(), at.getMinutes()], [7, 0]);
  e.updateStep(wf.id, wf.steps[1].id, { enabled: false, label: 'pause' });
  assert.strictEqual(e.get(wf.id).steps[1].enabled, false); assert.strictEqual(e.get(wf.id).steps[1].label, 'pause');
  e.updateStep(wf.id, wf.steps[1].id, { enabled: true, label: '' });
  assert.ok(!('enabled' in e.get(wf.id).steps[1]) && !('label' in e.get(wf.id).steps[1]));
  e.update(wf.id, { status: 'paused' });
  assert.strictEqual(e.nextRunAt(e.get(wf.id)), null);
  cleanup(WORKFLOWS_DIR);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
