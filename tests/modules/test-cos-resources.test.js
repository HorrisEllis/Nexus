'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-resources.test.js — CP6a: caps, priority, accounting per compartment. 0.60.356.
 * James, 2026-11-01: "then i want resource management for each cos compartment". Map: the compartment phasemap CP6a, CP_D6 · Spec:
 * cos/spec/compartment.spec MOD-CP-RESOURCES, MOD-CP-USAGE.
 *   CR-01 usage reads a real pid on this OS (on his Windows 11 there is no wmic: powershell answers), memory and CPU seconds
 *   CR-02 a fixture's priority is set at spawn and read back from the OS; his heap cap is on its command line; layers said
 *   CR-03 over its resident limit with onOver restart → an over-limit ledger line and a restart by rule:resources
 *   CR-04 under the halt floor → one held proposal by rule:resources to stop the lowest-priority compartment; COS stops nothing itself
 *   CR-05 an agent cannot set a cap; a value out of range is refused with the range
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { createResources } = require(path.join(ROOT, 'cos/manager/resources.js'));
const { createProposals } = require(path.join(ROOT, 'cos/manager/proposals.js'));
const usage = require(path.join(ROOT, 'cos/manager/usage.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 3).join('\n    ')}`); failed++; } }
const until = async (fn, ms = 15000) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 150)); } return null; };

(async () => {
  console.log('\n⬡  resources per compartment (CP6a)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-res-'));
  const idle = path.join(dir, 'idle.js'); fs.writeFileSync(idle, 'setInterval(() => {}, 1000);');
  const mk = (names, policy = {}) => { const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, `l-${Math.random()}.jsonl`), log: () => {}, policy: { stopGraceMs: 200, ...policy },
    declarations: names.map(n => ({ name: n, system: n, cmd: process.execPath, args: [idle] })) }); return sup; };
  const sups = [];
  try {
    await test('CR-01', 'usage reads a real pid on this OS: memory and CPU seconds, the reader named', async () => {
      const r = await usage.perPidAsync([process.pid]);
      assert.ok(r.out[process.pid] && r.out[process.pid].rssMB > 0, JSON.stringify(r));
      if (process.platform === 'win32') assert.ok(['wmic', 'powershell'].includes(r.reader) && r.out[process.pid].cpuSec != null, r.reader);
    });

    await test('CR-02', 'priority set at spawn and read back from the OS; his heap cap on the command line; each value with its layer', async () => {
      const sup = mk(['a']); sups.push(sup);
      const res = createResources(sup, { store: path.join(dir, 'caps.json'), sampleMs: 0 });
      res.setCaps('a', { priority: 'below-normal', heapMB: 300 }, { by: 'person' });
      assert.ok(sup.commandOf('a').args.includes('--max-old-space-size=300'));
      sup.start('a', { by: 'test' });
      const c = await until(() => { const x = res.caps('a'); return x.applied.priority.state !== 'pending' && x; });
      assert.deepStrictEqual([c.applied.priority.state, c.applied.priority.readBack], ['enforced', 'below-normal'], JSON.stringify(c.applied.priority));
      assert.strictEqual(c.applied.heap.state, 'enforced'); assert.strictEqual(c.layers.priority, 'his'); assert.strictEqual(c.layers.rssLimitMB, 'default');
      assert.strictEqual(c.applied.cpuShare.state, 'not-enforced');
      assert.ok(sup.ledger({ system: 'a' }).some(e => e.kind === 'caps' && e.by === 'person'));
      res.stop(); sup.shutdown({ by: 'test' });
    });

    await test('CR-03', 'over its resident limit with onOver restart: an over-limit line and a restart by rule', async () => {
      const sup = mk(['b']); sups.push(sup);
      const res = createResources(sup, { store: path.join(dir, 'caps-b.json'), sampleMs: 0, read: async (list) => ({ at: Date.now(), reader: 'stub', host: { freeMemPct: 80 }, systems: Object.fromEntries(list.map(v => [v.name, v.pid ? { rssMB: 999, reader: 'stub' } : { notRead: 'not running' }])) }) });
      res.setCaps('b', { rssLimitMB: 100, onOver: 'restart' }, { by: 'person' });
      sup.start('b', { by: 'test' }); const pid0 = await until(() => sup.get('b').pid);
      await res.sample();
      const led = sup.ledger({ system: 'b' });
      assert.ok(led.some(e => e.kind === 'over-limit' && /999 MB over its limit 100 MB/.test(e.why)), JSON.stringify(led.map(e => e.kind)));
      assert.ok(await until(() => { const p = sup.get('b').pid; return p && p !== pid0; }), 'not restarted');
      res.stop(); sup.shutdown({ by: 'test' });
    });

    await test('CR-04', 'under the halt floor: one held proposal by rule:resources for the lowest-priority compartment; nothing stopped', async () => {
      const sup = mk(['c', 'd']); sups.push(sup);
      const props = createProposals(sup);
      const res = createResources(sup, { store: path.join(dir, 'caps-cd.json'), sampleMs: 0, proposals: props,
        read: async (list) => ({ at: Date.now(), reader: 'stub', host: { freeMemPct: 3 }, systems: Object.fromEntries(list.map(v => [v.name, { rssMB: v.name === 'c' ? 50 : 400, reader: 'stub' }])) }) });
      res.setCaps('c', { priority: 'low' }, { by: 'person' });
      sup.start('c', { by: 'test' }); sup.start('d', { by: 'test' }); await until(() => sup.get('c').pid && sup.get('d').pid);
      await res.sample(); await res.sample();
      const held = props.list({ open: true });
      assert.strictEqual(held.length, 1, JSON.stringify(held)); assert.deepStrictEqual([held[0].by, held[0].verb, held[0].target], ['rule:resources', 'stop', 'c']);
      assert.ok(sup.get('c').pid && sup.get('d').pid, 'COS stopped something by itself');
      res.stop(); sup.shutdown({ by: 'test' });
    });

    await test('CR-05', 'an agent cannot set a cap; out of range is refused with the range', async () => {
      const sup = mk(['e']); sups.push(sup); const res = createResources(sup, { store: path.join(dir, 'caps-e.json'), sampleMs: 0 });
      assert.throws(() => res.setCaps('e', { priority: 'low' }, { by: 'agent:x' }), /agent proposes/);
      assert.throws(() => res.setCaps('e', { heapMB: 10 }, { by: 'person' }), /64–16384/);
      res.stop(); sup.shutdown({ by: 'test' });
    });
  } finally {
    for (const s of sups) try { s.shutdown({ by: 'test' }); } catch (_) {}
    await new Promise(r => setTimeout(r, 800)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
