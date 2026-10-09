'use strict';
/**
 * tests/modules/test-hardening-pass.test.js — HP2 · HP3 · HP4 (docs/2026-10-09-hardening-pass-phasemap.spec), 0.52.0.
 * James: "Do the hardening pass"
 * (HP1 stale-through-dependencies is TH-05 in test-thread; HP5 line endings and BOM is SD-08 in test-spec-document.)
 *
 *   HR-01  interruptedRows: a run whose latest row is in flight and older than this process gets one 'interrupted'
 *          row (its last state, provider, rung, why); finished runs, and runs this process started, are untouched
 *   HR-02  through idearium: _reconcileRuns writes those rows to idearium_phase_runs; a second pass adds nothing; boot
 *          calls it from the listen callback
 *   HR-03  present(): an Ollama rung whose model is not installed is left off (3b > 7b > claude with only 7b → 7b >
 *          claude), every Ollama rung when Ollama is unreachable; name ≡ name:latest; agents always stay; each skip says why
 *   HR-04  the build leaves skipped rungs off before the climb, says so on the route, refuses (NO_RUNG) when nothing is
 *          left; GET /api/routing gives runnable and skipped; never an attempt row for a skipped rung
 *   HR-05  router scores(): a failed record weighs by its class — two dismissed drafts weigh as one failed test;
 *          routing.signal_weights overrides; the ledger keeps the class; recordHop passes it
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const PR = require(path.join(ROOT, 'lib/pipeline-routing.js'));
const R = require(path.join(ROOT, 'lib/economy/router.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  const RR = await import(path.join(ROOT, 'idearium/repo/run-reconcile.js'));
  const BOOT = 1_000_000;

  await test('HR-01', 'interruptedRows: in flight before boot → one interrupted row; finished and this-process runs untouched', () => {
    const rows = [
      { uuid: 'a-started', runId: 'a', map: 'm', phase: 'P1', state: 'building', ts: 100 },
      { uuid: 'a-r2t1-escalating', runId: 'a', map: 'm', phase: 'P1', state: 'escalating', provider: 'ollama:q:7b', rung: 2, rungs: 3, error: 'x', ts: 200 },
      { uuid: 'b-started', runId: 'b', state: 'building', ts: 100 },
      { uuid: 'b-replied', runId: 'b', state: 'replied', ts: 300 },
      { uuid: 'c-started', runId: 'c', state: 'building', ts: BOOT + 5 },          // this process: never touched
      { uuid: 'd-started', runId: 'd', state: 'reviewing', ts: 50 },
      { uuid: 'e-x', runId: 'e', state: 'interrupted', ts: 60 },                   // already said
      { uuid: 'nr', state: 'building', ts: 10 },                                   // no runId: not a run
    ];
    const out = RR.interruptedRows(rows, { bootAt: BOOT, now: BOOT + 10 });
    assert.deepStrictEqual(out.map(r => r.runId).sort(), ['a', 'd']);
    const a = out.find(r => r.runId === 'a');
    assert.strictEqual(a.uuid, 'a-interrupted'); assert.strictEqual(a.state, 'interrupted'); assert.strictEqual(a.interruptedFrom, 'escalating');
    assert.strictEqual(a.lastAt, 200); assert.strictEqual(a.ts, BOOT + 10); assert.strictEqual(a.map, 'm'); assert.strictEqual(a.phase, 'P1');
    assert.match(a.error, /idearium restarted while this run was escalating \(ollama:q:7b, rung 2\/3\)/);
    assert.match(a.error, /build it again/);
    // a second pass over the rows plus what it wrote adds nothing
    assert.deepStrictEqual(RR.interruptedRows([...rows, ...out], { bootAt: BOOT, now: BOOT + 20 }), []);
    for (const s of ['building', 'escalating', 'retrying', 'reviewing']) assert.ok(RR.IN_FLIGHT.includes(s), s);
    for (const s of ['replied', 'failed', 'proven', 'unproven', 'refused', 'interrupted', 'skipped']) assert.ok(!RR.IN_FLIGHT.includes(s), s);
  });

  const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
  const db = await import(path.join(ROOT, 'idearium/lib/db.js'));

  await test('HR-02', 'through idearium: the rows are written once; boot calls it', async () => {
    const id = `hr02-${Date.now().toString(36)}`;
    const t0 = Date.now() - 60_000;
    db.appendRow('idearium_phase_runs', { uuid: `${id}-a-started`, runId: `${id}-a`, phase: 'X1', state: 'building', ts: t0 });
    db.appendRow('idearium_phase_runs', { uuid: `${id}-b-started`, runId: `${id}-b`, phase: 'X2', state: 'building', ts: t0 });
    db.appendRow('idearium_phase_runs', { uuid: `${id}-b-replied`, runId: `${id}-b`, phase: 'X2', state: 'replied', ts: t0 + 1 });
    const bootAt = Date.now();
    const first = await quiet(() => api._reconcileRunsForTest({ bootAt }));
    assert.deepStrictEqual(first.filter(r => r.runId.startsWith(id)).map(r => r.runId), [`${id}-a`]);
    const mine = () => db.loadTable('idearium_phase_runs').filter(r => String(r.runId || '').startsWith(id));
    const a = mine().filter(r => r.runId === `${id}-a`);
    assert.strictEqual(a.length, 2); assert.strictEqual(a[1].state, 'interrupted'); assert.strictEqual(a[1].interruptedFrom, 'building');
    assert.strictEqual(mine().filter(r => r.runId === `${id}-b`).length, 2, 'a finished run gets nothing');
    const second = await quiet(() => api._reconcileRunsForTest({ bootAt }));
    assert.strictEqual(second.filter(r => r.runId.startsWith(id)).length, 0, 'a second pass adds nothing');
    assert.strictEqual(mine().length, 4);
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const listen = src.slice(src.indexOf('server.listen(PORT, BINDING'));
    assert.match(listen.slice(0, 1200), /_reconcileRuns\(\)/, 'boot reconciles');
  });

  await test('HR-03', 'present(): uninstalled and unreachable Ollama rungs are left off, said; agents stay', () => {
    const rungs = PR.ladder(PR.policyFrom({ escalation: 'ollama:qwen2.5-coder:3b > ollama:qwen2.5-coder:7b > claude' })).rungs;
    const p = PR.present(rungs, { reachable: true, installed: ['qwen2.5-coder:7b', 'llama3.2:latest'] });
    assert.deepStrictEqual(p.rungs.map(r => r.provider), ['ollama:qwen2.5-coder:7b', 'claude']);
    assert.deepStrictEqual(p.skipped, [{ provider: 'ollama:qwen2.5-coder:3b', why: 'qwen2.5-coder:3b is not installed in Ollama' }]);
    const u = PR.present(rungs, { reachable: false, installed: [], error: 'ollama bridge unreachable: ECONNREFUSED' });
    assert.deepStrictEqual(u.rungs.map(r => r.provider), ['claude']);
    assert.strictEqual(u.skipped.length, 2); assert.match(u.skipped[0].why, /could not be reached — ollama bridge unreachable/);
    const l = PR.present(PR.ladder(PR.policyFrom({ escalation: 'ollama:llama3.2 > ollama:phi3:latest' })).rungs, { installed: ['llama3.2:latest', 'phi3'] });
    assert.deepStrictEqual(l.rungs.map(r => r.provider), ['ollama:llama3.2', 'ollama:phi3:latest'], 'name ≡ name:latest');
    assert.deepStrictEqual(PR.present([{ provider: 'claude', base: 'claude', model: null }], { reachable: false }).rungs.map(r => r.provider), ['claude']);
  });

  await test('HR-04', 'the build filters before the climb, says it, refuses when nothing is left; /api/routing says it', () => {
    const src = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    const build = src.slice(src.indexOf('const L = PRt.ladder(policy, { installed });'), src.indexOf('const runWhole = () =>'));
    assert.match(build, /PRt\.present\(rungs, \{ reachable: om\.ok, installed: om\.models, error: om\.error \}\)/);
    assert.match(build, /left off: /);
    assert.match(build, /state: 'refused'[^\n]*rungsSkipped/);
    assert.match(build, /code: 'NO_RUNG'/);
    assert.match(build, /skipped: rungsSkipped/, 'the route row carries what was left off');
    assert.ok(build.indexOf('PRt.present(') < build.indexOf('AR.orderLadder('), 'filtered before the learned order and the climb');
    const route = src.slice(src.indexOf("case 'routing.show': case 'routing.plan':"), src.indexOf("case 'routing.agents':"));
    assert.match(route, /runnable: now\.rungs\.map/); assert.match(route, /skipped: now\.skipped/);
    const ui = fs.readFileSync(path.join(ROOT, 'idearium/ui/settings.html'), 'utf8');
    assert.match(ui, /left off now \(never tried, not counted as a failure\)/);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/js/plan-panel.js'), 'utf8'), /left off: \$\{escapeHtml\(s\.provider\)\}/);
  });

  await test('HR-05', 'scores(): two dismissed drafts weigh as one failed test; configurable; the ledger keeps the class', async () => {
    const rec = (provider, outcome, cls) => ({ jobType: 'build:x', provider, outcome, class: cls });
    const t = R.scores([rec('a', 'failed', 'dismissed'), rec('a', 'failed', 'dismissed'), rec('b', 'failed', 'test-failed'), rec('c', 'failed', null), rec('a', 'ok')]);
    assert.strictEqual(t['build:x::a'].bad, 1); assert.strictEqual(t['build:x::b'].bad, 1); assert.strictEqual(t['build:x::c'].bad, 1);
    assert.strictEqual(t['build:x::a'].failed, 2, 'the count stays a count'); assert.strictEqual(t['build:x::a'].records, 3);
    const w = R.scores([rec('a', 'failed', 'dismissed')], { signalWeights: R.signalWeightsFrom('dismissed:0, test-failed:2') });
    assert.strictEqual(w['build:x::a'].bad, 0); assert.strictEqual(w['build:x::a'].success, 0.5);
    assert.deepStrictEqual(R.signalWeightsFrom('dismissed:0.25,bad,x:-1,constraint:2'), { dismissed: 0.25, constraint: 2 });
    const p = PR.policyFrom({ signal_weights: 'dismissed:0.25' });
    assert.deepStrictEqual(p.signalWeights, { dismissed: 0.25 });
    const L = PR.learned({ records: [rec('a', 'failed', 'dismissed'), rec('a', 'failed', 'dismissed')], policy: p });
    assert.deepStrictEqual([L['build:x'][0].failed, L['build:x'][0].weighed], [2, 0.5]);
    const core = require(path.join(ROOT, 'idearium/lib/config-core.cjs'));
    assert.strictEqual(core.resolve('routing.signal_weights').def.default, 'test-failed:1,constraint:1,dismissed:0.5');
    const ledger = require(path.join(ROOT, 'lib/economy/ledger.js'));
    const r = ledger.record({ provider: 'hr05', jobType: 'build:x', outcome: 'failed', reason: 'the person dismissed it', class: 'dismissed' });
    assert.ok(r.ok); assert.strictEqual(r.record.class, 'dismissed'); assert.strictEqual(r.record.reason, 'the person dismissed it');
    assert.match(fs.readFileSync(path.join(ROOT, 'lib/pipeline-routing.js'), 'utf8'), /reason: h\.error \|\| h\.class \|\| null, class: h\.class \|\| null/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
