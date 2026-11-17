'use strict';
// tests/modules/test-raid-routing.test.js — PC16 slice a (2026-11-17): RAID owns the routing.
// James, 2026-11-17: "i need ideariums settings to work better. this is meant to be in raid. all of the routing." · "yes build it"
//
//   RR-01  RAID's routing: set, unset and import, each a line in its ledger; a first import is taken once, a second is refused unless forced
//   RR-02  Idearium reads routing.* from RAID's copy (its mirror) over its own layers, and describe() says the value came from 'raid'
//   RR-03  a routing change made in Idearium goes to RAID (the pusher) and into the mirror at once; a reset sends the unset
//   RR-04  a value RAID holds that Idearium's schema refuses is left out (the lower layers stand); keys outside routing are untouched
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-routing-'));
process.env.RAID_ROUTING_DIR = path.join(TMP, 'cortex-raid');
process.env.IDEARIUM_RAID_ROUTING_MIRROR = path.join(TMP, 'idearium', 'routing.mirror.json');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const quiet = async (fn) => { const l = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = l; } };

async function main() {
  const RR = require('../../cortex/core/raid/routing.js');

  await test('RR-01', 'RAID\'s routing: set, unset, import (once, unless forced), each a ledger line', async () => {
    assert.deepStrictEqual(RR.get().policy, {});
    assert.strictEqual(RR.importPolicy({ mode: 'learned', max_hops: 3, 'not a key!': 1 }, { by: 'test' }).imported, 2);
    assert.strictEqual(RR.importPolicy({ mode: 'fixed' }).imported, 0, 'a second import is refused');
    assert.strictEqual(RR.get().policy.mode, 'learned');
    const s = RR.set('routing.max_hops', 5, { by: 'test' });
    assert.deepStrictEqual([s.key, s.prior, s.value], ['max_hops', 3, 5]);
    assert.strictEqual(RR.unset('max_hops').prior, 5);
    assert.strictEqual(RR.get().policy.max_hops, undefined);
    assert.throws(() => RR.set('Bad Key', 1), /not a routing key/);
    const ledger = fs.readFileSync(path.join(process.env.RAID_ROUTING_DIR, 'routing.ledger.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.strictEqual(ledger.length, 3, 'import, set, unset');
    assert.strictEqual(RR.importPolicy({ mode: 'chain' }, { force: true }).imported, 1, 'force replaces');
  });

  const C = await import('../../idearium/lib/config.js');
  const pushed = [];
  C.setRaidRoutingPusher(async (b) => { pushed.push(b); return { ok: true }; });

  await test('RR-02', 'Idearium reads routing.* from RAID\'s copy over its own layers; describe() names the layer', async () => {
    const before = C.getValue('routing.max_hops');
    C.writeRaidMirror({ policy: { mode: 'local-first', max_hops: 7 }, at: 1, by: 'test' });
    assert.strictEqual(C.getValue('routing.mode'), 'local-first');
    assert.strictEqual(C.getValue('routing.max_hops'), 7);
    assert.strictEqual(C.getConfig().routing.max_hops, 7, 'the merged config every reader uses');
    const d = C.describe().keys.find(k => k.key === 'routing.max_hops');
    assert.strictEqual(d.source, 'raid');
    C.writeRaidMirror({ policy: {} });
    assert.strictEqual(C.getValue('routing.max_hops'), before, 'without RAID\'s value the lower layers show through');
  });

  await test('RR-03', 'a routing change in Idearium goes to RAID and into the mirror; a reset sends the unset', async () => {
    pushed.length = 0;
    await quiet(() => C.setConfig('routing.max_hops', 4, { actor: 'user' }));
    assert.deepStrictEqual(pushed[0], { key: 'max_hops', value: 4, by: 'idearium:user' });
    assert.strictEqual(C.getValue('routing.max_hops'), 4);
    assert.strictEqual(JSON.parse(fs.readFileSync(process.env.IDEARIUM_RAID_ROUTING_MIRROR, 'utf8')).policy.max_hops, 4);
    await quiet(() => C.resetConfig('routing.max_hops', { actor: 'user' }));
    assert.deepStrictEqual(pushed[1], { key: 'max_hops', unset: true, by: 'idearium:user' });
    assert.strictEqual(JSON.parse(fs.readFileSync(process.env.IDEARIUM_RAID_ROUTING_MIRROR, 'utf8')).policy.max_hops, undefined);
  });

  await test('RR-04', 'a value Idearium\'s schema refuses is left out; keys outside routing are untouched', async () => {
    const before = C.getValue('routing.max_hops');
    C.writeRaidMirror({ policy: { max_hops: 999, unknown_key: 'x' } });
    assert.strictEqual(C.getValue('routing.max_hops'), before, 'out of bounds: the lower layers stand');
    assert.strictEqual(C.getConfig().routing.unknown_key, undefined);
    pushed.length = 0;
    const other = C.describe().keys.find(k => !k.key.startsWith('routing.') && k.copilot_writable && k.type === 'boolean');
    if (other) { await quiet(() => C.setConfig(other.key, other.value, { actor: 'user' })); assert.strictEqual(pushed.length, 0, 'not routing: nothing sent to RAID'); await quiet(() => C.resetConfig(other.key, { actor: 'user' })); }
    C.writeRaidMirror({ policy: {} });
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
