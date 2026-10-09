'use strict';
/**
 * tests/modules/test-thread.test.js — RS9 (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec), 0.49.0.
 * James: "okay now the phases with the spec workshop. needs to be rebuilt, enterprise grade. interconnected"
 *
 *   TH-01  derivePlan writes each phase's blocks: (the spec's own block ids) and each block's hash; the one phasemap
 *          parser reads blocks: back (and an older map's sections:)
 *   TH-02  thread(): each block lists its phases, each phase its blocks, its latest run (model, rung), its files and the
 *          changes waiting on them
 *   TH-03  an edited block marks only its own phases stale; a map planned before block hashes says the spec moved;
 *          a phase naming no block says "no link", one naming a missing block is "broken" — nothing guessed
 *   TH-05  §HP1 0.52.0 stale spreads along depends_on: an edited block stales its phase and every phase downstream of it,
 *          each naming the phase it came through; an unrelated phase stays clean; a dependency cycle does not loop
 *   TH-04  GET /api/repos/:uuid/thread through idearium's real router: the specs its maps came from; a spec planned
 *          (POST …/spec/plan derive) then one block edited — that block's phases stale, the others not; an unknown spec 404
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const D = require(path.join(ROOT, 'lib/spec-document.js'));
const P = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

const SPEC = [
  'spec:',
  '  meta:',
  '    name: shop',
  '  schema:',
  '    record: an order with lines and a total',
  '  storage:',
  '    store: orders kept in a JAA table, one node per order',
  '  api:',
  '    routes: GET /orders, POST /orders',
  '',
].join('\n');

(async () => {
  const SP = await import(path.join(ROOT, 'idearium/repo/spec-plan.js'));
  const TH = await import(path.join(ROOT, 'idearium/repo/thread.js'));
  const plan = SP.derivePlan({ specPath: 'spec/shop.spec', specText: SPEC, prefix: 'SH' });

  await test('TH-01', 'derivePlan writes blocks: and each block\'s hash; the parser reads them back', () => {
    assert.ok(plan.ok, JSON.stringify(plan.problems));
    const meta = TH.mapMetaOf(plan.text);
    assert.strictEqual(meta.spec, 'spec/shop.spec');
    const doc = D.parse(SPEC, { path: 'spec/shop.spec' });
    for (const id of ['schema', 'storage', 'api']) assert.ok(doc.blocks.find(b => b.id === id).hash.startsWith(meta.blockHashes[id]), `${id}'s hash recorded`);
    const phases = P.parsePhasemapText(plan.text, 'docs/shop-phasemap.spec');
    const all = phases.flatMap(p => p.blocks);
    assert.deepStrictEqual([...new Set(all)].sort(), ['api', 'schema', 'storage'], 'every block in some phase, by its own id');
    const old = P.parsePhasemapText('spec:\n  phases:\n    X0_a:\n      sections: [schema, api]\n', 'docs/old-phasemap.spec');
    assert.deepStrictEqual(old[0].blocks, ['schema', 'api'], 'an older map\'s sections: read as its blocks');
  });

  const maps = [{ path: 'docs/shop-phasemap.spec', text: plan.text }];
  const phases0 = P.parsePhasemapText(plan.text, 'docs/shop-phasemap.spec');
  const storagePhase = phases0.find(p => p.blocks.includes('storage')).id;

  await test('TH-02', 'thread(): blocks ⇄ phases ⇄ the latest run ⇄ files ⇄ waiting changes', () => {
    const runs = [
      { runId: 'r1', map: 'docs/shop-phasemap.spec', phase: storagePhase, state: 'failed', provider: 'ollama:q:3b', rung: 1, rungs: 3, ts: 1, injects: { injected: [] } },
      { runId: 'r2', map: 'docs/shop-phasemap.spec', phase: storagePhase, state: 'replied', provider: 'ollama:q:7b', rung: 2, rungs: 3, ts: 2, injects: { injected: ['lib/store.js'] } },
      { runId: 'x', map: 'docs/other-phasemap.spec', phase: storagePhase, state: 'replied', ts: 9 },
    ];
    const pending = [{ uuid: 'i1', path: 'lib/store.js', status: 'proposed' }, { uuid: 'i2', path: 'lib/elsewhere.js', status: 'proposed' }];
    const t = TH.thread({ specPath: 'spec/shop.spec', specText: SPEC, maps, runs, pending, parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });
    assert.deepStrictEqual(t.spec.blocks.map(b => b.id), ['meta', 'schema', 'storage', 'api'], 'every block of the document');
    assert.deepStrictEqual(t.spec.blocks.filter(b => !b.bookkeeping).map(b => b.id), ['schema', 'storage', 'api'], 'meta is bookkeeping: edited, not built');
    assert.ok(t.spec.blocks.filter(b => !b.bookkeeping).every(b => b.planned && !b.stale));
    const sp = t.phases.find(p => p.key === storagePhase);
    assert.deepStrictEqual([sp.run.runId, sp.run.provider, sp.run.rung], ['r2', 'ollama:q:7b', 2], 'its latest run on its own map');
    assert.ok(sp.files.includes('lib/store.js'));
    assert.deepStrictEqual(sp.changes.map(c => c.inject), ['i1'], 'only the changes on its files');
    assert.ok(t.spec.blocks.find(b => b.id === 'storage').phases.includes(storagePhase));
    assert.deepStrictEqual([t.summary.blocks, t.summary.planned, t.summary.linked, t.summary.stalePhases], [3, 3, t.phases.length, 0]);
  });

  await test('TH-03', 'an edited block stales only its phases; old maps, no link and broken links are said', () => {
    const storage = D.parse(SPEC).blocks.find(b => b.id === 'storage');
    const edited = D.replaceBlock(SPEC, 'storage', storage.text.replace('one node per order', 'one node per order, indexed by customer')).text;
    const t = TH.thread({ specPath: 'spec/shop.spec', specText: edited, maps, runs: [], pending: [], parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });
    assert.deepStrictEqual(t.spec.blocks.filter(b => b.stale).map(b => b.id), ['storage']);
    assert.deepStrictEqual(t.phases.filter(p => p.stale.length).map(p => p.key), phases0.filter(p => p.blocks.includes('storage')).map(p => p.id));
    const oldMap = 'spec:\n  meta:\n    spec: spec/shop.spec\n    spec_sha256: ' + D.sha(SPEC) + '\n  phases:\n    OL0_a:\n      sections: [schema]\n    OL1_b:\n      depends_on: []\n    OL2_c:\n      blocks: [gone]\n';
    const t2 = TH.thread({ specPath: 'spec/shop.spec', specText: edited, maps: [{ path: 'docs/old-phasemap.spec', text: oldMap }], runs: [], pending: [], parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });
    const by = Object.fromEntries(t2.phases.map(p => [p.key, p]));
    assert.strictEqual(by.OL0_a.specMoved, true, 'no block hashes: the spec moved, which block unknown');
    assert.deepStrictEqual(by.OL0_a.stale, []);
    assert.strictEqual(by.OL1_b.link, 'none'); assert.strictEqual(by.OL2_c.link, 'broken'); assert.deepStrictEqual(by.OL2_c.unknownBlocks, ['gone']);
    assert.deepStrictEqual([t2.summary.unlinked, t2.summary.broken], [1, 1]);
    const other = TH.thread({ specPath: 'spec/other.spec', specText: SPEC, maps, runs: [], pending: [], parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });
    assert.strictEqual(other.phases.length, 0, 'a map planned from another spec is not this one\'s');
  });

  await test('TH-05', 'stale spreads along depends_on, each naming its way; unrelated clean; a cycle does not loop', () => {
    const doc = D.parse(SPEC, { path: 'spec/shop.spec' });
    const h = (id) => doc.blocks.find(b => b.id === id).hash.slice(0, 16);
    const map = ['spec:', '  meta:', '    spec: spec/shop.spec', '    block_hashes:', `      "schema": ${h('schema')}`, `      "storage": ${h('storage')}`, `      "api": ${h('api')}`, '  phases:',
      '    CH0_a:', '      blocks: [schema]', '      depends_on: []',
      '    CH1_b:', '      blocks: [storage]', '      depends_on: [CH0_a]',
      '    CH2_c:', '      blocks: [api]', '      depends_on: [CH1]',
      '    CH3_d:', '      blocks: [api]', '      depends_on: []',
      '    CH4_e:', '      blocks: [storage]', '      depends_on: [CH5_f, CH0_a]',
      '    CH5_f:', '      blocks: [storage]', '      depends_on: [CH4_e]', ''].join('\n');
    const schema = doc.blocks.find(b => b.id === 'schema');
    const edited = D.replaceBlock(SPEC, 'schema', schema.text.replace('an order with lines', 'an order with lines and a currency')).text;
    const t = TH.thread({ specPath: 'spec/shop.spec', specText: edited, maps: [{ path: 'docs/chain-phasemap.spec', text: map }], runs: [], pending: [], parsePhases: P.parsePhasemapText, doc: D, sha: D.sha });
    const by = Object.fromEntries(t.phases.map(p => [p.key, p]));
    assert.deepStrictEqual(by.CH0_a.stale, ['schema']); assert.strictEqual(by.CH0_a.staleVia, null, 'stale itself');
    assert.strictEqual(by.CH1_b.staleVia, 'CH0_a'); assert.strictEqual(by.CH2_c.staleVia, 'CH1_b', 'by its short key too');
    assert.strictEqual(by.CH3_d.staleVia, null, 'an unrelated phase stays clean');
    assert.strictEqual(by.CH4_e.staleVia, 'CH0_a'); assert.strictEqual(by.CH5_f.staleVia, 'CH4_e', 'through the cycle, once');
    assert.deepStrictEqual([t.summary.stalePhases, t.summary.staleDownstream], [5, 4]);
  });

  await test('TH-04', 'GET …/thread through the real router: specs listed; plan, edit one block, only its phases stale', async () => {
    process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
    const api = await quiet(() => import(path.join(ROOT, 'idearium/api/index.js')));
    const L = api.getRepoLayer();
    let made = null;
    for (let i = 0; i < 20; i++) {
      made = await quiet(async () => L.ingest({ name: `th-${Date.now()}`, source: 'test', files: [{ path: 'spec/shop.spec', content: SPEC }, { path: 'lib/x.js', content: 'module.exports = 1;\n' }] }));
      if (!(made && made.error && /no spec-engine/.test(made.error))) break;
      await new Promise(x => setTimeout(x, 250));
    }
    const u = made.repo.uuid;
    const pl = await quiet(() => api._route('POST', `/api/repos/${u}/spec/plan`, { path: 'spec/shop.spec', derive: true }));
    assert.strictEqual(pl.status, 200, JSON.stringify(pl.json).slice(0, 300));
    const list = await api._route('GET', `/api/repos/${u}/thread`);
    assert.ok(list.json.specs.some(s => s.path === 'spec/shop.spec' && s.maps.length === 1), JSON.stringify(list.json));
    const t1 = await api._route('GET', `/api/repos/${u}/thread?spec=${encodeURIComponent('spec/shop.spec')}`);
    assert.strictEqual(t1.status, 200, JSON.stringify(t1.json).slice(0, 300));
    assert.deepStrictEqual([t1.json.summary.blocks, t1.json.summary.planned, t1.json.summary.stalePhases], [3, 3, 0]);
    const cur = L.readTextFile(u, 'spec/shop.spec').content;
    const api2 = D.parse(cur).blocks.find(b => b.id === 'api');
    L.writeTextFile(u, 'spec/shop.spec', D.replaceBlock(cur, 'api', api2.text.replace('POST /orders', 'POST /orders, DELETE /orders/:id')).text);
    const t2 = await api._route('GET', `/api/repos/${u}/thread?spec=${encodeURIComponent('spec/shop.spec')}`);
    assert.deepStrictEqual(t2.json.spec.blocks.filter(b => b.stale).map(b => b.id), ['api']);
    assert.ok(t2.json.phases.filter(p => p.stale.length).every(p => p.blocks.includes('api')));
    assert.strictEqual((await api._route('GET', `/api/repos/${u}/thread?spec=nope.spec`)).status, 404);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
