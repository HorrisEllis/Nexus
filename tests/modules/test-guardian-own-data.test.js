'use strict';
/**
 * tests/modules/test-guardian-own-data.test.js — Guardian holds its own data (SS1 + DL3 for guardian, 0.60.208)
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec SS1_system_store_adoption (plan_2026_10_22)
 * James, 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each
 * system responsible for it's own data."
 *
 *   GD-01  guardian's data blockers are 0 (lib/system-boundary.js sovereignty): nothing in guardian requires cortex's store
 *   GD-02  no code names data/guardian (the census's refs), so guardian's files come home at its boot
 *   GD-03  the callto agent's tables: guardian's own in guardian's store (agent_calls brought from cortex once, recorded);
 *          event_log and cortex_memory go to cortex's routes; its jaaDB call shapes keep their meaning
 *   GD-04  shared writers (ledger-writer, cortex-write) put a rewired system in its own folder and leave the rest where they are
 *   GD-05  cortex's POST /api/event keeps the scope fields the gap engine matches on (queue_uuid, comp_id); ncp and ask send there
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

(async () => {
  console.log('\n⬡  guardian holds its own data\n');

  await test('GD-01', 'guardian\'s data blockers are 0: nothing in guardian requires cortex\'s store', () => {
    const B = require(path.join(ROOT, 'lib/system-boundary.js'));
    const g = B.sovereignty({ root: ROOT, system: 'guardian' }).systems[0];
    assert.strictEqual(g.blockers.data, 0, JSON.stringify(g.list.data));
  });

  await test('GD-02', 'no code names data/guardian, so its files come home at its boot', () => {
    const C = require(path.join(ROOT, 'lib/data-clearup.js'));
    assert.deepStrictEqual(C.refsTo(ROOT, 'guardian'), []);
    const DH = require(path.join(ROOT, 'lib/data-home.js'));
    assert.ok(DH.rewired('guardian') && !DH.rewired('loom'));
  });

  await test('GD-03', 'callto: own tables in guardian\'s store (agent_calls brought from cortex once); cortex\'s tables to cortex\'s routes', async () => {
    const sb = process.env.NEXUS_TEST_SANDBOX;
    // a row of agent_calls waiting in cortex's store (the sandbox's cortex memory), as on his machine before the move
    const { JaaStore } = require(path.join(ROOT, 'lib/jaa-store.js'));
    const cortexDir = process.env.JAA_DATA_DIR;
    const cs = new JaaStore(cortexDir, { tables: ['agent_calls'], settings: false });
    cs.insert('agent_calls', { uuid: 'call-1', routedTo: 'guardian-claude', status: 'routed', prompt: 'hi' }); cs.flushAll();
    const ncPath = require.resolve(path.join(ROOT, 'lib/nexus-client.js'));
    const real = require(ncPath); const sent = [];
    require.cache[ncPath].exports = { ...real, postDurable: async (sys, p, body) => { sent.push({ sys, p, body }); return { ok: true }; } };
    try {
      delete require.cache[require.resolve(path.join(ROOT, 'guardian/agents/index.js'))];
      const A = require(path.join(ROOT, 'guardian/agents/index.js'));   // loading starts nothing (init() does)
      const jaaDB = A._jaaDB, _store = A._ownStore;
      const pending = jaaDB.query('agent_calls', r => r.status === 'routed', 5);
      assert.strictEqual(pending.length, 1, 'agent_calls came home from cortex');
      assert.ok(_store().dir.startsWith(path.join(sb, 'systems', 'guardian')), `guardian's own store: ${_store().dir}`);
      assert.strictEqual(_store().migrations.find(x => x.table === 'agent_calls').rows, 1, 'recorded');
      jaaDB.update('agent_calls', 'call-1', { status: 'processing' });
      assert.strictEqual(jaaDB.get('agent_calls', 'call-1').status, 'processing', 'update and get by uuid');
      jaaDB.insert('guardian_health', { uuid: 'h1', connected: true }); jaaDB.insert('guardian_health', { uuid: 'h2', connected: false });
      assert.strictEqual(jaaDB.tail('guardian_health', 1)[0].uuid, 'h2', 'tail: the newest');
      jaaDB.insert('event_log', { type: 'guardian.chat.complete', payload: { complete: true }, source: 'agents.callto' });
      jaaDB.insert('cortex_memory', { content: 'x', tags: ['guardian'] });
      await new Promise(r => setImmediate(r));
      assert.deepStrictEqual(sent.map(s => `${s.sys} ${s.p}`), ['cortex /api/event', 'cortex /api/memory/insert']);
      assert.strictEqual(sent[1].body.table, 'cortex_memory');
      assert.strictEqual(_store().count('event_log', {}), 0, 'cortex\'s table is never written into guardian\'s store');
    } finally { require.cache[ncPath].exports = real; }
  });

  await test('GD-04', 'ledger-writer and cortex-write: guardian in its own folder, a system not yet rewired where it was', () => {
    const LW = require(path.join(ROOT, 'lib/ledger-writer.js'));
    const DH = require(path.join(ROOT, 'lib/data-home.js'));
    assert.strictEqual(LW.dataDir('guardian'), DH.dir('guardian'));
    assert.strictEqual(LW.dataDir('loom'), path.join(LW.DATA_ROOT, 'loom'));
    assert.strictEqual(LW.filePath('guardian', 'event_log'), path.join(DH.dir('guardian'), 'event_log.jsonl'));
    const cw = read('lib/cortex-write.js');
    assert.ok(/function _sysDir\(systemId\)/.test(cw) && /DH\.REWIRED/.test(cw), 'cortex-write buffers and drains a rewired system in its own folder');
  });

  await test('GD-05', 'cortex\'s /api/event keeps queue_uuid and comp_id top-level; ncp and ask send there, not into cortex\'s store', () => {
    const boot = read('cortex/boot.js');
    const ev = boot.slice(boot.indexOf("if (p === '/api/event' && method === 'POST')"), boot.indexOf("jaaDB.insert('event_log', row);"));
    assert.ok(/\['queue_uuid', 'comp_id'\]/.test(ev), 'the scope fields are copied before the insert');
    // the gap engine's scope match reads exactly those top-level fields
    assert.ok(/r\.queue_uuid !== scope && r\.comp_id !== scope/.test(read('intelligence/gap/predicate.js')));
    for (const f of ['guardian/lib/ncp.js', 'guardian/ask.js', 'guardian/agents/index.js']) assert.ok(!/cortex\/memory\/jaa-db/.test(read(f)), `${f} does not require cortex's store`);
    assert.ok(/postDurable\('cortex', '\/api\/event', \{ type: 'ncp\.flap'[^}]*queue_uuid: key/.test(read('guardian/lib/ncp.js')), 'the flap carries queue_uuid top-level');
    assert.ok(/postDurable\('cortex', '\/api\/gaps'/.test(read('guardian/lib/ncp.js')), 'the gap opens through cortex\'s route');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
