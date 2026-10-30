'use strict';
/**
 * tests/modules/test-about-and-nodes.test.js — the Fiverr automation as editable node files; Settings › About (0.60.269)
 * James, 2026-10-28: "can you move the fiverr automation and macros to actual node files imported in the settings. like .node files. I want
 * to be able to edit what you added." · "those are supposed to be what you added but in node files. also need a about page in the settings,
 * where it says the version, can check for updates to electron and clearglass."
 *
 *   AN-01  newer(): numbers, lengths, a pre-release; check(): a newer Electron said, a source that cannot be reached said (never guessed)
 *   AN-02  the four node files ship with Clear Glass and parse; GET /automation/nodes seeds them into the library once — his delete stands —
 *          and one imports through the same route Settings uses (its bundled macro comes too)
 *   AN-03  the gig fill picks delivery with his node macro "Fiverr gig - choose delivery": imported from its file the first time, run as
 *          him with the tier and the days; when the macro cannot run, the built-in pick does it and says why
 *   AN-04  in Clear Glass, Settings › About: the versions shown; Check for updates marks a newer one with how to get it, and an unreachable one
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const A = require(CG('src/about/index.js'));
const N = require(path.join(ROOT, 'lib/automation-nodes.js'));
const BUNDLED = CG('automation/nodes');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  Fiverr automation as node files; Settings › About\n');

  await test('AN-01', 'newer() and check(): a newer Electron said; an unreachable source said, never guessed', async () => {
    assert.ok(A.newer('42.11.6', '45.1.0') && !A.newer('45.1.0', '45.1.0') && !A.newer('0.60.269', '0.60.268') && A.newer('0.60.9', '0.60.10'));
    assert.ok(A.newer('1.0.0-beta.2', '1.0.0') && !A.newer('1.0.0', '1.0.0-beta.2') && A.newer('3.24', '3.24.1'));
    const r = await A.check({ current: { electron: '42.11.6', clearGlass: '3.24.0', nexus: '0.60.269' },
      fetchText: async (u) => { if (/npmjs/.test(u)) return JSON.stringify({ version: '45.1.0' }); if (/package\.json/.test(u)) throw new Error('404 Not Found'); return '0.60.269\n'; } });
    assert.deepStrictEqual([r.electron.latest, r.electron.newer], ['45.1.0', true]);
    assert.ok(r.clearGlass.error && /404/.test(r.clearGlass.error) && /private/.test(r.clearGlass.error) && r.clearGlass.latest === null, JSON.stringify(r.clearGlass));
    assert.deepStrictEqual([r.nexus.latest, r.nexus.newer], ['0.60.269', false]);
  });

  await test('AN-02', 'the node files ship and parse; seeded into the library once (his delete stands); imported through the Settings route', async () => {
    const files = fs.readdirSync(BUNDLED).sort();
    // 0.60.283: + fiverr-gig-choose-category.macro (a new gig's SELECT A CATEGORY / SUBCATEGORY, gated); 0.60.296 PN4: + fiverr-gig.pipeline
    assert.deepStrictEqual(files, ['fiverr-gig-choose-category.macro', 'fiverr-gig-choose-delivery.macro', 'fiverr-gig-fill-this-page.workflow', 'fiverr-gig-overview-steps.workflow', 'fiverr-gig-scope-pricing-steps.workflow', 'fiverr-gig.pipeline']);
    for (const f of files) assert.ok(N.parse(fs.readFileSync(path.join(BUNDLED, f), 'utf8')).payload, f);
    const R = require(path.join(ROOT, 'lib/automation/routes.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-nodes-'));
    const created = [];
    const deps = { nodesDir: dir, bundledDir: BUNDLED, getMacro: async (n) => { const m = created.find(x => x.name === n); return m ? { ok: true, macro: m } : { error: `no macro named "${n}"` }; }, createMacro: async (m) => { created.push(m); return { ok: true }; } };
    const engine = { importWorkflow: (w) => ({ ok: true, workflow: { id: 'w1', name: w.name, steps: w.steps } }), create: (w) => ({ ok: true, workflow: { id: 'w1', ...w } }), list: () => [], get: () => null };
    let r = await R.handle(engine, { method: 'GET', url: '/automation/nodes' }, deps);
    assert.strictEqual(r.body.nodes.length, 6, JSON.stringify(r.body).slice(0, 200));
    assert.deepStrictEqual(r.body.seeded.sort(), files);
    fs.unlinkSync(path.join(dir, 'fiverr-gig-overview-steps.workflow'));
    r = await R.handle(engine, { method: 'GET', url: '/automation/nodes' }, deps);
    assert.deepStrictEqual([r.body.nodes.length, r.body.seeded.length], [5, 0], 'deleted stays deleted');
    const im = await R.handle(engine, { method: 'POST', url: '/automation/nodes/fiverr-gig-choose-delivery.macro/import', body: {} }, deps);
    assert.ok(im.body.ok !== false, JSON.stringify(im.body));
    assert.deepStrictEqual(created.map(m => [m.name, m.params]), [['Fiverr gig - choose delivery', ['tier', 'delivery']]]);
    // 0.60.280 KB6 — v2 of the node: the pick is gated on the value shown (James: "make the gates for them gated and have them check for the correct value")
    assert.deepStrictEqual(created[0].steps[1], { action: 'choose', data: { column: '{{tier}}', shows: 'DELIVERY TIME', option: '{{delivery}}', pick: 'auto' },
      gate: { choice: { column: '{{tier}}', is: '{{delivery}}' }, retries: 2, timeoutMs: 4000 } });
  });

  await test('AN-03', 'the gig fill picks delivery with his node macro (imported once, run as him); the built-in pick only when it cannot', async () => {
    const Bridge = require(CG('src/ipc/bridge.js'));
    const gig = { title: 'I will build it', tags: [], description: 'd', faq: [], requirements: [], packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 }, standard: { name: 'Plus', description: 'two', price: 60, deliveryDays: 5 } } };
    const run = async (macroFails) => {
      const store = [], runs = [], calls = [];
      const self = { dom: { handleQuery: async () => [], handleMutate: async () => ({}) }, postEvent: () => {}, _humanCheckGate: async () => ({ pass: true }), _gigFeatures: Bridge.prototype._gigFeatures, _gigTags: Bridge.prototype._gigTags,
        macroTool: { execute: async (a) => { if (a.action === 'get') { const m = store.find(x => x.name === a.name); return m ? { ok: true, macro: m } : { error: `no macro named "${a.name}"` }; } if (a.action === 'create') { store.push(a); return { ok: true }; } return {}; } },
        runMacroAsPerson: async (d) => { runs.push(d); return macroFails ? { error: 'Element not found: body', failedAtStep: 0 } : { ok: true, stepsCompleted: 2 }; },
        driver: { exec: async (c) => { calls.push(c); if (c.action === 'readPage') return { url: 'https://www.fiverr.com/edit', headings: [{ text: 'Scope & Pricing' }, { text: 'Packages' }], links: [] }; if (c.action === 'choose') return { option: `${c.option} Days` }; return {}; } } };
      self._gigNodeMacro = Bridge.prototype._gigNodeMacro.bind(self);
      const r = await Bridge.prototype._gigFill.call(self, { gig });
      return { r, store, runs, calls };
    };
    const ok = await run(false);
    assert.deepStrictEqual(ok.store.map(m => m.name), ['Fiverr gig - choose delivery'], 'imported from its node file the first time');
    assert.deepStrictEqual(ok.runs.map(d => [d.name, d.params]), [['Fiverr gig - choose delivery', { tier: 'BASIC', delivery: '3' }], ['Fiverr gig - choose delivery', { tier: 'STANDARD', delivery: '5' }]]);
    assert.ok(ok.r.dropdowns.every(d => d.via === 'macro'), JSON.stringify(ok.r.dropdowns));
    assert.ok(!ok.calls.some(c => c.action === 'choose'), 'no built-in pick when the macro ran');
    const bad = await run(true);
    assert.ok(bad.r.dropdowns.every(d => d.via === 'built-in' && /stopped at step 1: Element not found/.test(d.why)), JSON.stringify(bad.r.dropdowns));
    assert.strictEqual(bad.calls.filter(c => c.action === 'choose').length, 2);
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - AN-04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('AN-04', 'in Clear Glass, Settings › About: versions; Check for updates marks a newer one with how to get it, and an unreachable one', async () => {
      const { initScript } = require(CG('src/driver/cg-stub.js'));
      const errors = [];
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(initScript({ answers: { 'options.get': {}, 'accounts.list': [],
        'about.info': { ok: true, nexus: '0.60.269', clearGlass: '3.24.0', electron: '42.11.6', chrome: '138.0', node: '22.17.0', v8: '13.8', platform: 'win32 x64' },
        'about.check': { ok: true, checkedAt: 1793200000000,
          electron: { current: '42.11.6', latest: '45.1.0', newer: true, source: 'https://registry.npmjs.org/electron/latest' },
          clearGlass: { current: '3.24.0', latest: null, newer: false, error: '404 Not Found — the repository may be private, or the file moved' },
          nexus: { current: '0.60.269', latest: '0.60.269', newer: false } } } }));
      await page.addInitScript('window.ClearGlass.accounts.portal = new Proxy({}, { get: (_, k) => async () => (/list|providers/.test(k) ? [] : {}) });');
      await page.goto(pathToFileURL(CG('renderer/settings.html')).href + '#about');
      await page.waitForSelector('.ab-ver');
      const vers = await page.evaluate(() => [...document.querySelectorAll('.ab-ver')].map(b => b.textContent));
      assert.deepStrictEqual(vers, ['3.24.0', '0.60.269', '42.11.6']);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Check for updates/.test(b.textContent)).click());
      await page.waitForSelector('.ab-new');
      const t = await page.evaluate(() => document.querySelector('.ab-checks').textContent);
      assert.match(t, /45\.1\.0 is out — you have 42\.11\.6/);
      assert.match(t, /npm install electron@latest/);
      assert.match(t, /could not check — 404/);
      assert.match(t, /up to date \(0\.60\.269\)/);
      assert.deepStrictEqual(errors, []);
      await page.close();
    });
    try { await browser.close(); } catch (_) {}
  }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
