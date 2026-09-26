'use strict';
/**
 * tests/modules/test-cg-listener-decay.test.js — §0.39.265
 *
 * James: "Page listeners -> needs decay." clear-glass/src/options/store.js:
 *   - the picker re-announcing the same (site, element, event) refreshes one
 *     listener instead of saving another (the pile-up decay has to clean);
 *   - a listener idle past disableAfterDays is switched off, one decay
 *     switched off is deleted at removeAfterDays;
 *   - firing (touchListener, by store id or the page's own listener id) and
 *     re-arming keep a listener alive; Keep (pinned) never decays; one you
 *     switched off by hand is never deleted by decay.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

const DAY = 86400000;
const STORE = require.resolve('../../clear-glass/src/options/store.js');

async function fresh() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-listener-decay-'));
  process.env.HOME = home;
  delete require.cache[STORE];
  const NexusOptions = require(STORE);
  const o = new NexusOptions();
  await o.load();
  return { o, done: () => fs.rmSync(home, { recursive: true, force: true }) };
}
const L = (extra = {}) => ({ urlPattern: 'https://x.com/*', fingerprint: { selector: '#feed' }, eventType: 'mutation', ...extra });

(async () => {
  const origHome = process.env.HOME;
  console.log('\n  page-listener decay');

  await test('re-arming the same site/element/event refreshes one listener instead of adding another', async () => {
    const { o, done } = await fresh();
    const a = o.registerListener(L({ pageListenerId: 'p1' }));
    const b = o.registerListener(L({ pageListenerId: 'p2', label: 'feed' }));
    assert.strictEqual(o.listListeners().length, 1);
    assert.strictEqual(b.id, a.id); assert.ok(b.reused);
    assert.strictEqual(o.getListener(a.id).pageListenerId, 'p2');
    assert.strictEqual(o.getListener(a.id).label, 'feed');
    o.registerListener(L({ eventType: 'click' }));
    assert.strictEqual(o.listListeners().length, 2, 'a different event on the same element is its own listener');
    done();
  });

  await test('idle past disableAfterDays switches off; decayed and idle past removeAfterDays deletes', async () => {
    const { o, done } = await fresh();
    const a = o.registerListener(L());
    const t0 = o.getListener(a.id).lastSeenAt;
    assert.deepStrictEqual(o.decayListeners(t0 + 13 * DAY), { disabled: [], removed: [] });
    assert.deepStrictEqual(o.decayListeners(t0 + 14 * DAY).disabled, [a.id]);
    const d = o.getListener(a.id);
    assert.strictEqual(d.enabled, false); assert.ok(d.decayedAt);
    assert.deepStrictEqual(o.decayListeners(t0 + 29 * DAY).removed, []);
    assert.deepStrictEqual(o.decayListeners(t0 + 30 * DAY).removed, [a.id]);
    assert.strictEqual(o.getListener(a.id), null);
    done();
  });

  await test('firing (by the page\'s listener id) keeps a listener alive and counts fires', async () => {
    const { o, done } = await fresh();
    const a = o.registerListener(L({ pageListenerId: 'page-7' }));
    const fired = o.touchListener('page-7', 'fired');
    assert.strictEqual(fired.id, a.id); assert.strictEqual(fired.fireCount, 1); assert.ok(fired.lastFiredAt);
    const s = o.listenerStrength(o.getListener(a.id), fired.lastFiredAt + 7 * DAY);
    assert.ok(Math.abs(s.strength - 0.5) < 1e-9, `half-way to fading: ${s.strength}`);
    assert.strictEqual(s.fadesAt, fired.lastFiredAt + 14 * DAY);
    assert.strictEqual(o.touchListener('nope'), null);
    done();
  });

  await test('Keep never decays; switched off by hand is never deleted by decay', async () => {
    const { o, done } = await fresh();
    const kept = o.registerListener(L());
    const hand = o.registerListener(L({ fingerprint: { selector: '#other' } }));
    o.updateListener(kept.id, { pinned: true });
    o.updateListener(hand.id, { enabled: false });
    const far = Date.now() + 365 * DAY;
    const r = o.decayListeners(far);
    assert.deepStrictEqual(r, { disabled: [], removed: [] });
    assert.strictEqual(o.getListener(kept.id).enabled, true);
    assert.ok(o.getListener(hand.id), 'hand-disabled listener kept');
    assert.strictEqual(o.listenerStrength(o.getListener(kept.id), far).fadesAt, null);
    done();
  });

  await test('a decayed listener comes back when the picker arms it again', async () => {
    const { o, done } = await fresh();
    const a = o.registerListener(L());
    o.decayListeners(Date.now() + 20 * DAY);
    assert.strictEqual(o.getListener(a.id).enabled, false);
    o.registerListener(L());
    assert.strictEqual(o.getListener(a.id).enabled, true);
    assert.strictEqual(o.getListener(a.id).decayedAt, null);
    done();
  });

  await test('decay settings: validated, persisted, and off means nothing fades', async () => {
    const { o, done } = await fresh();
    assert.deepStrictEqual(o.getListenerDecay(), { enabled: true, disableAfterDays: 14, removeAfterDays: 30 });
    assert.ok(o.setListenerDecay({ disableAfterDays: 10, removeAfterDays: 5 }).error, 'delete must come after switch-off');
    assert.deepStrictEqual(o.setListenerDecay({ disableAfterDays: 3, removeAfterDays: 7 }), { enabled: true, disableAfterDays: 3, removeAfterDays: 7 });
    const a = o.registerListener(L());
    assert.deepStrictEqual(o.decayListeners(Date.now() + 4 * DAY).disabled, [a.id]);
    o.setListenerDecay({ enabled: false });
    const b = o.registerListener(L({ fingerprint: { selector: '#b' } }));
    assert.deepStrictEqual(o.decayListeners(Date.now() + 100 * DAY), { disabled: [], removed: [] });
    assert.ok(o.getListener(b.id).enabled);
    done();
  });

  await test('the bridge touches a listener when it fires and records the page listener id; Settings shows decay', () => {
    const br = fs.readFileSync(path.join(__dirname, '../../clear-glass/src/ipc/bridge.js'), 'utf8');
    assert.ok(/touchListener\(d\.listenerId, 'fired'\)/.test(br));
    assert.ok(/pageListenerId: d\.listenerId/.test(br));
    assert.ok(/listeners:decay:set/.test(br));
    const ui = fs.readFileSync(path.join(__dirname, '../../clear-glass/renderer/settings/sections/suite.js'), 'utf8');
    assert.ok(/listenerRow\(l, rerender\)/.test(ui) && /Decay settings/.test(ui));
  });

  process.env.HOME = origHome;
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
