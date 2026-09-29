'use strict';
// tests/modules/test-build-surface.api.js — BS7, loaded by test-build-surface.test.js: the build surface's routes
// through idearium's REAL router (api._route), versionium unreachable on purpose (every route must say so, not fail).
const path = require('path');
module.exports = async function ({ t, ROOT, assert }) {
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const L = api.getRepoLayer();
  let made = null;
  for (let i = 0; i < 20; i++) {
    made = L.ingest({ name: `bs-api-${Date.now()}`, source: 'test', files: [
      { path: 'package.json', content: '{"name":"x","scripts":{"test":"node t.js"}}\n' },
      { path: 'src/lock.js', content: 'module.exports = 1;\n// two\n// three\n' },
      { path: 'spec/lock.spec', content: 'spec:\n  meta:\n    name: lock\n' },
    ] });
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const u = made.repo.uuid;
  const R = (m, p, b) => api._route(m, `/api/repos/${u}${p}`, b);

  await t('BS7-01', 'files/state: every file listed, versionium down → all new and SAID; a proposal-only file is pending', async () => {
    const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
    RI.propose({ layer: L, repo: made.repo, path: 'src/new.js', content: 'x\n' });
    const r = await R('GET', '/files/state');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.states['src/lock.js'].state, 'new');
    assert.strictEqual(r.json.states['src/new.js'].state, 'pending');
    assert.match(r.json.versionNote, /versionium|no version/);
  });

  await t('BS7-02', 'deviation: first read recalculates and records with provenance; POST recalculates; history', async () => {
    const a = await R('GET', '/deviation');
    assert.strictEqual(a.status, 200, JSON.stringify(a.json).slice(0, 300));
    assert.deepStrictEqual([a.json.schema, a.json.reason, a.json.repoUuid], ['nexus.repo.deviation/1', 'first-read', u]);
    assert.match(a.json.note, /no baseline snapshot yet/);
    const b = await R('POST', '/deviation', {});
    assert.strictEqual(b.json.reason, 'asked');
    const c = await R('GET', '/deviation');
    assert.ok(c.json.history.length >= 2 && c.json.history[0].reason === 'asked');
  });

  await t('BS7-03', 'environment: the check, the catalogue; options saved normalized on the repo record (dropped keys named)', async () => {
    const g = await R('GET', '/environment');
    assert.strictEqual(g.status, 200, JSON.stringify(g.json).slice(0, 300));
    assert.ok(g.json.check.ok && g.json.check.plan.stacks.some(s => s.stack === 'node'));
    assert.ok(g.json.catalogue.length >= 15);
    const s = await R('POST', '/environment', { options: { ramMB: 2048, extras: ['go'], bogus: 1 } });
    assert.deepStrictEqual([s.json.options, s.json.dropped], [{ ramMB: 2048, extras: ['go'] }, ['bogus']]);
    assert.deepStrictEqual(L.get(u).environment.options, { ramMB: 2048, extras: ['go'] }, 'kept on the repo record');
    assert.deepStrictEqual((await R('GET', '/environment')).json.options, { ramMB: 2048, extras: ['go'] });
  });

  await t('BS7-04', 'spec plan: none yet → exists:false; planning refused without a snapshot (nothing lost); a written map is validated and ordered; build refused without a snapshot', async () => {
    const none = await R('GET', '/spec/plan?path=spec%2Flock.spec');
    assert.deepStrictEqual([none.status, none.json.exists, none.json.mapPath], [200, false, 'spec/lock-phasemap.spec']);
    const p = await R('POST', '/spec/plan', { path: 'spec/lock.spec' });
    assert.ok(p.status === 502 || p.status === 409, JSON.stringify(p.json));
    assert.strictEqual(p.json.detail.code, 'NO_SNAPSHOT');
    assert.strictEqual((await R('POST', '/spec/build', { path: 'spec/lock.spec' })).json.detail.code, 'NO_PLAN');
    L.writeTextFile(u, 'spec/lock-phasemap.spec', 'spec:\n  phases:\n    LK1_api:\n      layer: api\n      status: OPEN\n      depends_on: [LK0]\n      proof: t\n    LK0_store:\n      layer: foundation\n      status: OPEN\n      depends_on: []\n      proof: t\n');
    const g = await R('GET', '/spec/plan?path=spec%2Flock.spec');
    assert.ok(g.json.exists && g.json.valid, JSON.stringify(g.json).slice(0, 400));
    assert.deepStrictEqual([g.json.phases.map(x => x.key), g.json.next], [['LK0', 'LK1'], 'LK0_store']);
    const b = await R('POST', '/spec/build', { path: 'spec/lock.spec' });
    assert.ok(b.status >= 400 && /snapshot/i.test(b.json.error), JSON.stringify(b.json));
    const again = await R('POST', '/spec/plan', { path: 'spec/lock.spec' });
    assert.strictEqual(again.json.detail.code, 'PLAN_EXISTS', 'an existing map is never overwritten unasked');
  });

  await t('BS7-05', 'plan: the spec map\'s steps in build order with gates; manage: explain needs no snapshot, a write action does; bad action refused', async () => {
    const pl = await R('GET', '/plan?map=spec%2Flock-phasemap.spec');
    assert.strictEqual(pl.status, 200, JSON.stringify(pl.json).slice(0, 300));
    assert.deepStrictEqual(pl.json.steps.map(s => s.key), ['LK0_store', 'LK1_api']);
    assert.deepStrictEqual([pl.json.steps[0].layer, pl.json.steps[0].gate, pl.json.gates.length], ['foundation', 'snapshot', 6]);
    const ex = await R('POST', '/manage', { path: 'src/lock.js', action: 'explain', from: 2, to: 3, refs: [{ file: 'src/other.js', line: 4, name: 'use' }] });
    assert.strictEqual(ex.status, 200, JSON.stringify(ex.json).slice(0, 300));
    assert.match(ex.json.message, /src\/lock\.js lines 2–3 \(of 3\)/);
    assert.match(ex.json.message, /src\/other\.js:4 \(use\)/);
    assert.match(ex.json.message, /Reply in prose; write no files/);
    const rf = await R('POST', '/manage', { path: 'src/lock.js', action: 'refactor' });
    assert.ok(rf.status >= 400 && rf.json.detail.code === 'NO_SNAPSHOT', 'a write is never started without a snapshot');
    assert.strictEqual((await R('POST', '/manage', { path: 'src/lock.js', action: 'bogus' })).status, 400);
    assert.strictEqual((await R('POST', '/manage', { path: 'nope.js', action: 'explain' })).status, 404);
  });
};
