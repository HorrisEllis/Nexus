'use strict';
// CR-01..09 (0.60.63 PI5): the crawler runs the plan end to end against fake ports (no tab, no Electron): backfill to done, restart resume, catch-up, stops.
const assert = require('assert'); const S = require('../../lib/chat-crawl-settings.js'); const { Crawler } = require('../../clear-glass/src/chats/crawler.js');
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ' ' + e.message); } };
const chats = (n, upd = 'a') => Array.from({ length: n }, (_, i) => ({ url: `https://c/${n - i}`, title: 'c' + (n - i), updated: upd + (n - i) }));
function rig(over = {}, o = {}) {
  let clock = 1e12, store = o.store || null; const visits = [], lists = [];
  const cfg = { ...S.defaults(), enabled: true, paceMinSec: 0, paceMaxSec: 0, perHour: 1e6, perDay: 1e6, quietFrom: -1, quietTo: -1, ...over };
  const world = { list: o.list || chats(5), complete: o.complete !== false, visit: o.visit || ((u) => ({ kind: 'ok', turns: 4, hash: 'h' + u, updated: (world.list.find(e => e.url === u) || {}).updated })), readList: o.readList };
  const ports = { now: () => clock, sleep: async (ms) => { clock += ms; }, rng: () => 0, load: () => store && JSON.parse(store), save: (s) => { store = JSON.stringify(s); },
    readList: async (a) => { lists.push(a); return world.readList ? world.readList(a) : { ok: true, list: world.list, complete: world.complete }; },
    visit: async (u) => { visits.push(u); return world.visit(u); } };
  const mk = () => new Crawler({ accountKey: 'chatgpt:a1', cfg, ports });
  return { mk, world, visits, lists, tick: (ms) => { clock += ms; }, get store() { return store && JSON.parse(store); } };
}
(async () => {
  await t('CR-01 backfill visits every chat once, one at a time, then is caught up with nothing missed', async () => {
    const r = rig(); const c = r.mk(); await c.run({ maxSteps: 40 });
    assert.strictEqual(r.visits.length, 5); assert.strictEqual(new Set(r.visits).size, 5);
    const a = c.status().audit; assert.strictEqual(a.phase, 'caught-up'); assert.strictEqual(a.nothingMissed, true, JSON.stringify(a));
  });
  await t('CR-02 a restart in the middle resumes where it was: no chat is visited twice', async () => {
    const r = rig(); const c1 = r.mk(); await c1.run({ maxSteps: 3 });   // list read + 2 visits
    const done = [...r.visits]; assert.ok(done.length >= 1 && done.length < 5, String(done.length));
    const c2 = r.mk(); await c2.run({ maxSteps: 40 });
    assert.strictEqual(r.visits.length, 5, r.visits.join()); assert.strictEqual(new Set(r.visits).size, 5);
  });
  await t('CR-03 caught up: an unchanged list visits nothing; one changed chat is visited once', async () => {
    const r = rig(); const c = r.mk(); await c.run({ maxSteps: 30 }); const before = r.visits.length;
    r.tick(16 * 60e3); await c.step(); assert.strictEqual(r.visits.length, before, 'unchanged list must visit nothing');
    r.world.list = chats(5).map(e => e.url === 'https://c/5' ? { ...e, updated: 'NEW' } : e);
    r.tick(16 * 60e3); await c.run({ maxSteps: 4 });
    assert.deepStrictEqual(r.visits.slice(before), ['https://c/5', 'https://c/2'], 'the changed chat, then the stopping chat once (verifyAnchor, his rule)');
  });
  await t('CR-03b with verifyAnchor off only the changed chat is visited', async () => {
    const r = rig({ verifyAnchor: false }); const c = r.mk(); await c.run({ maxSteps: 30 }); const before = r.visits.length;
    r.world.list = chats(5).map(e => e.url === 'https://c/5' ? { ...e, updated: 'NEW' } : e); r.tick(16 * 60e3); await c.run({ maxSteps: 4 });
    assert.deepStrictEqual(r.visits.slice(before), ['https://c/5']);
  });
  await t('CR-04 a challenge page stops the queue; the chat stays pending; resume continues', async () => {
    let first = true; const r = rig({}, { visit: (u) => (first && (first = false, true)) ? { kind: 'challenge' } : { kind: 'ok', turns: 1, hash: u } });
    const c = r.mk(); const last = await c.run({ maxSteps: 20 });
    assert.strictEqual(last.action, 'stopped'); assert.match(c.status().pausedReason, /captcha|challenge/); assert.strictEqual(r.visits.length, 1);
    require('../../lib/chat-crawl-plan.js').resume(c.state); await c.run({ maxSteps: 40 });
    assert.strictEqual(c.status().audit.nothingMissed, true);
  });
  await t('CR-05 a signed-out list stops with the reason and visits nothing', async () => {
    const r = rig({}, { readList: () => ({ ok: false, kind: 'login' }) }); const c = r.mk(); const last = await c.run({ maxSteps: 5 });
    assert.strictEqual(last.action, 'stopped'); assert.match(last.reason, /signed out/); assert.strictEqual(r.visits.length, 0);
  });
  await t('CR-06 backfill off: existing chats are skipped with the reason; a chat that appears later is read', async () => {
    const r = rig({ backfill: false }); const c = r.mk(); await c.run({ maxSteps: 5 }); assert.strictEqual(r.visits.length, 0);
    const a = c.status().audit; assert.strictEqual(a.skipped.length, 5); assert.match(a.skipped[0].why, /before capture began/);
    r.world.list = [{ url: 'https://c/6', title: 'new', updated: 'z' }, ...r.world.list]; r.tick(16 * 60e3); await c.run({ maxSteps: 5 });
    assert.deepStrictEqual(r.visits, ['https://c/6']);
  });
  await t('CR-07 a list that is not fully loaded asks for more, and backfill is not done until it is', async () => {
    const r = rig({}, { complete: false }); const c = r.mk(); await c.run({ maxSteps: 12 });
    assert.ok(r.lists.some(a => a.more === true), 'asked for more of the list'); assert.strictEqual(c.status().audit.nothingMissed, false); assert.strictEqual(c.status().phase, 'backfill');
  });
  await t('CR-08 capture off: nothing is read or visited', async () => {
    const r = rig({ enabled: false }); const c = r.mk(); const last = await c.run({ maxSteps: 5 });
    assert.strictEqual(last.action, 'off'); assert.strictEqual(r.visits.length + r.lists.length, 0);
  });
  await t('CR-09 a visit that throws is a failure with its reason; after maxAttempts it is listed as failed, not dropped', async () => {
    const r = rig({ maxAttempts: 2, maxFailures: 99 }, { list: chats(2), visit: (u) => { if (u.endsWith('/2')) throw new Error('tab crashed'); return { kind: 'ok', turns: 1, hash: u }; } });
    const c = r.mk(); await c.run({ maxSteps: 30 }); const a = c.status().audit;
    assert.strictEqual(a.failed.length, 1); assert.match(a.failed[0].error, /tab crashed/); assert.strictEqual(a.nothingMissed, false);
  });
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
