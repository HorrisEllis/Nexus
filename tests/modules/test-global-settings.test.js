'use strict';
/**
 * tests/modules/test-global-settings.test.js — ClearDriver, Agent Mesh and Guardian settings (SP4, 0.60.218)
 * Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP4 · Spec: clear-glass/spec/site-profile.spec MOD-SP-GLOBAL
 * James, 2026-10-23: "Cleardriver, agentmesh and guardian setting."
 *
 *   GS-01  the defaults are today's constants (30 s, 10 s, agents may drive; 2 tries, 1/3/8/15 s; listen, capture): nothing changes unasked
 *   GS-02  the mesh's drain reads its options at each failure; a bad value is not used and says why
 *   GS-03  ClearDriver: the global navigate timeout is the one used; agents may drive no site → refused, unless the site allows them
 *   GS-04  Guardian: listening off everywhere → no listeners, unless the site says listen
 *   GS-05  in Clear Glass: Settings › ClearDriver, Guardian and the mesh's "When a task fails" save through options.set; out of range refused
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const R = require(CG('src/site-settings/readers.js'));
const K = require(CG('src/site-settings/keys.js'));
const { createSiteProfile } = require(CG('src/site-settings/profile.js'));
const NexusOptions = require(CG('src/options/store.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }
function realStore() { const { SiteSettingsStore } = require(CG('src/site-settings/store.js')); const s = new SiteSettingsStore(); s._persist = () => {}; return s; }
function options(patch) { const o = new NexusOptions(); o._persist = () => {}; if (patch) o.set(patch); return o; }
function install(opts) { const P = createSiteProfile({ store: realStore(), options: opts }); R.install((u) => P.siteProfile(u), { log: () => {} }); return P; }

(async () => {
  console.log('\n⬡  ClearDriver, Agent Mesh and Guardian settings\n');

  await test('GS-01', 'the defaults are today\'s constants', () => {
    const o = options().get();
    assert.deepStrictEqual(o.driver, { navTimeoutMs: 30000, waitTimeoutMs: 10000, agentsMayDrive: true });
    assert.deepStrictEqual(o.mesh, { retriesPerStrategy: 2, backoffMs: [1000, 3000, 8000, 15000] });
    assert.deepStrictEqual(o.guardian, { listen: true, capture: true });
    for (const k of ['driver.navTimeoutMs', 'driver.waitTimeoutMs']) assert.strictEqual(K.get(k).default, o.driver[k.split('.')[1]], `${k}: the key table and the option agree`);
    const { drainSettings } = require(CG('src/mesh/agent-mesh.js'));
    assert.deepStrictEqual(drainSettings(options()), { retriesPerStrategy: 2, backoffMs: [1000, 3000, 8000, 15000], why: [] });
    const p = install(options()).siteProfile('https://a.example/');
    assert.strictEqual(p.from['driver.navTimeoutMs'], 'global'); assert.strictEqual(p.driver.navTimeoutMs, 30000);
  });

  await test('GS-02', 'the mesh\'s drain reads its options at each failure; a bad value is not used and says why', () => {
    const AgentMesh = require(CG('src/mesh/agent-mesh.js'));
    const opts = options({ mesh: { retriesPerStrategy: 1, backoffMs: [111, 222, 333, 444] } });
    const events = [];
    const m = Object.create(AgentMesh.prototype);
    Object.assign(m, { accounts: opts, sse: { emit: (t, d) => events.push([t, d]) }, _applyDiagnostic: () => {}, _escalateTask: () => events.push(['escalated']), queue: [] });
    const task = { taskId: 't1', retries: 0, strategyRetries: 0, strategyIdx: 0, failureLog: [] };
    const timers = []; const realSet = global.setTimeout; global.setTimeout = (fn, ms) => { timers.push(ms); return 0; };
    try {
      m._handleTaskFailure(task, new Error('x'));
      assert.strictEqual(task.strategyIdx, 1, 'one try per strategy: the next failure moves on');
      const retry = events.find(e => e[0] === 'mesh.queue.retry');
      assert.strictEqual(retry[1].backoffMs, 222, 'the respawn tier\'s wait from the option');
      opts.set({ mesh: { retriesPerStrategy: 99, backoffMs: [1, 2] } });
      const { drainSettings } = AgentMesh;
      const d = drainSettings(opts);
      assert.deepStrictEqual([d.retriesPerStrategy, d.backoffMs], [2, [1000, 3000, 8000, 15000]], 'bad values: the constants');
      assert.match(d.why.join(' | '), /retriesPerStrategy 99 is not 1–10 \| backoffMs needs 4 waits of 100–600000 ms/);
    } finally { global.setTimeout = realSet; }
  });

  await test('GS-03', 'ClearDriver: the global timeout is used; agents may drive no site → refused, unless the site allows', async () => {
    const opts = options({ driver: { navTimeoutMs: 1200, agentsMayDrive: false } });
    const P = install(opts);
    const ClearDriver = require(CG('src/driver/index.js'));
    const wc = { url: 'about:blank', getURL() { return this.url; }, getTitle: () => '', once() {}, loadURL(u) { this.url = u; } };
    const d = new ClearDriver({ sse: { emit() {} } }); d._getWebContents = () => wc;
    await assert.rejects(d.exec({ action: 'navigate', agentId: 'mesh-x', url: 'https://any.example/' }), /may not drive https:\/\/any\.example: .*\(driver\.allowed, global\)/);
    P.setSite('https://ok.example/', 'driver.allowed', true);
    const t0 = Date.now();
    await assert.rejects(d.exec({ action: 'navigate', agentId: 'mesh-x', url: 'https://ok.example/' }), /Navigate timeout \(1200 ms\)/);
    const took = Date.now() - t0; assert.ok(took >= 1100 && took < 3000, `the global 1.2 s (took ${took})`);
  });

  await test('GS-04', 'Guardian: listening off everywhere → no listeners, unless the site says listen', () => {
    const opts = options({ guardian: { listen: false } });
    const P = install(opts);
    opts.registerListener({ urlPattern: 'https://chat.example/*', fingerprint: { selector: '#r' } });
    assert.strictEqual(opts.findListenersForUrl('https://chat.example/c/1').length, 0);
    P.setSite('https://chat.example/', 'guardian.listen', true);
    assert.strictEqual(opts.findListenersForUrl('https://chat.example/c/1').length, 1);
  });
  R.install(null);

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GS-05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return done(); }
  const { initScript } = require(CG('src/driver/cg-stub.js'));
  const opts = options().get();
  const answers = { 'options.get': opts, 'options.set': { ok: true }, 'siteProfile.keys': { keys: K.KEYS, features: K.FEATURES }, 'mesh.list': { agents: [], registry: [], queueDepth: 0 }, 'accounts.list': [], 'accounts.defaults': {}, 'providers.list': [] };
  // the preload stub has one level of names; Providers & accounts also calls cg.accounts.portal.* (no providers here)
  const PORTAL = 'window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) });';
  const sets = (page) => page.evaluate(() => window.__cgCalls.filter(c => c.key === 'options.set').map(c => c.args[0]));
  const change = (page, sel, v) => page.evaluate(([s, val]) => { const i = document.querySelector(s); i.value = val; i.dispatchEvent(new Event('change')); }, [sel, v]);
  try {
    await test('GS-05', 'in Clear Glass: ClearDriver, Guardian and the mesh\'s drain save through options; out of range refused', async () => {
      const errors = [];
      const open = async (area) => { const p = await browser.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(`${area}: ${e.message}`)); await p.addInitScript(initScript({ answers })); await p.addInitScript(PORTAL); await p.goto(pathToFileURL(CG('renderer/settings.html')).href + '#' + area); return p; };
      let page = await open('driver');
      await page.waitForSelector('[data-opt="driver.navTimeoutMs"]');
      assert.strictEqual(await page.$eval('[data-opt="driver.navTimeoutMs"]', i => i.value), '30000');
      await change(page, '[data-opt="driver.navTimeoutMs"]', '45000');
      await change(page, '[data-opt="driver.waitTimeoutMs"]', '5');   // below 500: refused, not saved
      await page.click('[data-opt="driver.agentsMayDrive"]');
      await page.waitForTimeout(200);
      assert.deepStrictEqual(await sets(page), [{ driver: { navTimeoutMs: 45000 } }, { driver: { agentsMayDrive: false } }]);
      assert.strictEqual(await page.$eval('[data-opt="driver.waitTimeoutMs"]', i => i.value), '10000', 'put back');
      await page.close();
      page = await open('guardian');
      await page.waitForSelector('[data-opt="guardian.capture"]');
      await page.click('[data-opt="guardian.capture"]');
      await page.waitForTimeout(150);
      assert.deepStrictEqual(await sets(page), [{ guardian: { capture: false } }]);
      await page.close();
      page = await open('mesh');
      await page.waitForSelector('[data-opt="mesh.backoffMs"]', { timeout: 10000 });
      await change(page, '[data-opt="mesh.backoffMs"]', '500, 1000, 2000, 4000');
      await change(page, '[data-opt="mesh.retriesPerStrategy"]', '3');
      await change(page, '[data-opt="mesh.retriesPerStrategy"]', '0');   // refused
      await page.waitForTimeout(200);
      assert.deepStrictEqual(await sets(page), [{ mesh: { backoffMs: [500, 1000, 2000, 4000] } }, { mesh: { retriesPerStrategy: 3 } }]);
      await page.screenshot({ path: path.join(require('os').tmpdir(), 'gs-05-mesh.png') }).catch(() => {});
      assert.deepStrictEqual(errors, []); await page.close();
    });
  } finally { await browser.close().catch(() => {}); }
  done();
  function done() { console.log(`\n  ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
})();
