'use strict';
// §P2 nexus-live-mind — the replay engine snapshots on any sigma detected in the
// system, tracing the conditions that created it (RFR2), building a timeline for
// debug/revert. Rides the live fan-in stream from P1.
const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}
const ROOT = path.join(__dirname, '../..');
const fan = require(path.join(ROOT, 'lib/ledger-fanin'));
const st = require(path.join(ROOT, 'intelligence/snapshot-trigger'));

const stubReplay = (sink) => ({ snapshot: (ctx) => { sink.push(ctx); return { uuid: 'snap-' + sink.length }; }, listSnapshots: () => sink.map((c, i) => ({ uuid: 'snap-' + (i + 1), ...c })) });
const stubRF = (root, conds) => ({ readFieldForFriction: async () => ({ root, conditions: conds, available: true }) });

(async () => {
  await test('T-001', 'a sigma.spike traces conditions and snapshots (tagged with causal root)', async () => {
    st._resetForTest();
    const snaps = [];
    const r = await st.onSigma({ type: 'sigma.spike', severity: 0.82, source: 'guardian' },
      { replay: stubReplay(snaps), relationalField: stubRF('root-cond', ['root-cond', 'B', 'sigma']), minIntervalMs: 0 });
    assert.ok(r.snapshotId, 'a sigma must snapshot');
    assert.strictEqual(r.causalRoot, 'root-cond');
    assert.strictEqual(snaps[0].trigger, 'sigma');
  });

  await test('T-002', 'severity below the floor (0.70) does NOT snapshot', async () => {
    st._resetForTest();
    const snaps = [];
    const r = await st.onSigma({ type: 'sigma.spike', severity: 0.5 }, { replay: stubReplay(snaps), relationalField: stubRF('x', ['x']), minIntervalMs: 0 });
    assert.strictEqual(r.skipped, true, 'sub-threshold sigma must not snapshot');
  });

  await test('T-003', 'debounce: an immediate second sigma does not storm', async () => {
    st._resetForTest();
    const snaps = [];
    const opts = { replay: stubReplay(snaps), relationalField: stubRF('x', ['x', 'y']) };
    await st.onSigma({ type: 'sigma.spike', severity: 0.8 }, opts);
    const r2 = await st.onSigma({ type: 'sigma.spike', severity: 0.8 }, opts);
    assert.strictEqual(r2.skipped, true, 'second must debounce');
  });

  await test('T-004', 'force overrides the debounce', async () => {
    st._resetForTest();
    const snaps = [];
    const opts = { replay: stubReplay(snaps), relationalField: stubRF('x', ['x', 'y']) };
    await st.onSigma({ type: 'sigma.spike', severity: 0.8 }, opts);
    const r2 = await st.onSigma({ type: 'sigma.spike', severity: 0.8, force: true }, opts);
    assert.ok(r2.snapshotId, 'force snapshots despite the interval');
  });

  await test('T-005', 'attach: sigma events on the LIVE fan-in snapshot; non-sigma do not', async () => {
    st._resetForTest(); fan._resetForTest();
    const snaps = [];
    st.attach(fan, { replay: stubReplay(snaps), relationalField: stubRF('r', ['r', 's']), minIntervalMs: 0 });
    fan.emit({ type: 'sigma.spike', severity: 0.82, source: 'guardian' });
    fan.emit({ type: 'delta.tension', severity: 0.80, source: 'bridge' });
    fan.emit({ type: 'guardian.job.done', severity: 0, source: 'guardian' });
    await new Promise(r => setTimeout(r, 30));
    assert.strictEqual(snaps.length, 2, 'only the 2 sigma/tension events snapshot, not job.done');
  });

  await test('T-006', 'timeline() surfaces sigma snapshots as revertable debug points', async () => {
    st._resetForTest();
    const snaps = [];
    const replay = stubReplay(snaps);
    await st.onSigma({ type: 'sigma.spike', severity: 0.9, source: 'cortex' }, { replay, relationalField: stubRF('root', ['root', 'x']), minIntervalMs: 0 });
    const tl = st.timeline({ replay });
    assert.ok(tl.length >= 1, 'timeline has the snapshot');
    assert.ok(tl[0].revertTo, 'each entry is revertable (has a snapshot id to replay to)');
  });

  await test('T-007', 'a snapshot failure never breaks the stream (§1.2)', async () => {
    st._resetForTest(); fan._resetForTest();
    st.attach(fan, { replay: { snapshot: () => { throw new Error('replay down'); } }, relationalField: stubRF('x', ['x', 'y']), minIntervalMs: 0 });
    assert.doesNotThrow(() => fan.emit({ type: 'sigma.spike', severity: 0.8, source: 'g' }), 'emit must not throw');
    await new Promise(r => setTimeout(r, 20));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
