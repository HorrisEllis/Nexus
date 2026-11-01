'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-macro-blocks-ui.test.js — MB2, 0.60.343. Map: docs/2026-11-01-macro-blocks-phasemap.spec MB2.
 * James, 2026-11-01: "i want the macros in the settings to be blocks with settings, gates between them with the delays type and everything
 * else the gates can do". The real Settings page (settings.html, core.js, sections/macros.js) in Clear Glass's engine, its cg stubbed.
 *   MBU-01  Edit draws each step as a block with the gate to the next one under it, said in a line; an empty gate says "＋ gate"
 *   MBU-02  saved untouched, a step's gate comes back whole (before MB2 an edit dropped every gate), keys the editor does not show kept
 *   MBU-03  set in the editor: a human pause, a page condition with retries, backoff and "skip" — saved as the runner reads it (validateGate ok)
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), R = path.join(ROOT, 'clear-glass', 'renderer');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const GE = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/gate-eval.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const MACRO = { name: 'gig-gated', urlPattern: null, params: [], steps: [
  { action: 'navigate', data: { url: 'https://example.test/' }, gate: { text: 'ready', timeoutMs: 3000, retries: 1, choice: { column: 'BASIC', is: '5' } } },
  { action: 'click', data: { selector: '#go' } }] };
const STUB_JS = `window.SAVED = []; window.ClearGlass = window.cg = new Proxy({}, { get: (_t, k) =>
  k === 'macros' ? { list: async () => ({ macros: [{ name: 'gig-gated', steps: 2, params: [] }] }), get: async () => ({ macro: ${JSON.stringify(MACRO)} }),
    schema: async () => ({ actions: ['navigate', 'click', 'type', 'wait', 'wait_for', 'screenshot'], erosActions: [], profiles: [] }),
    create: async (m) => { SAVED.push(m); return { ok: true }; }, delete: async () => ({ ok: true }) }
  : k === 'options' ? { get: async () => ({}), set: async () => ({ ok: true }) }
  : new Proxy(function () {}, { get: () => () => Promise.resolve([]), apply: () => Promise.resolve([]) }) });
window.fetch = async () => ({ ok: true, json: async () => ({}) });`;
// settings.html's CSP is script-src 'self': the stub is a file of its own, served beside the page
const STUB = '<script src="stub.js"></script><script src="settings/core.js"></script><script src="settings/sections/macros.js"></script>';

(async () => {
  console.log('\n⬡  Settings › Macros: blocks, and the gate between them (MB2) — in Clear Glass\n');
  const html = fs.readFileSync(path.join(R, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>[^\n]*\n?/g, '').replace('</body>', STUB + '</body>');
  const srv = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/' || u === '/settings.html') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    if (u === '/stub.js') { res.setHeader('Content-Type', 'application/javascript'); return res.end(STUB_JS); }
    const f = path.join(R, u); if (!f.startsWith(R) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', f.endsWith('.css') ? 'text/css' : 'application/javascript'); res.end(fs.readFileSync(f)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - MBU-01..03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = []; page.on && page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${srv.address().port}/settings.html#macros`);
    await page.evaluate(() => { location.hash = '#macros'; CGS.boot(); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Edit'));
    const openEdit = () => page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Edit').click());
    const save = () => page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => /Save changes/.test(b.textContent)).click());
    await test('MBU-01', 'blocks, each with the gate to the next one said in a line', async () => {
      await openEdit(); await page.waitForSelector('.modal .step');
      const says = await page.evaluate(() => [...document.querySelectorAll('.modal .step .gate-between > summary')].map(e => e.textContent));
      assert.strictEqual(says.length, 2);
      assert.ok(/wait for “ready” on the page/.test(says[0]) && /a dropdown check \(5\)/.test(says[0]) && /3 s, 1 retry/.test(says[0]) && /if closed: stop/.test(says[0]), says[0]);
      assert.strictEqual(says[1], '＋ gate to the next block');
    });
    await test('MBU-02', 'saved untouched, the gate comes back whole, the dropdown check kept', async () => {
      await save(); await page.waitForFunction(() => SAVED.length === 1);
      const s = await page.evaluate(() => SAVED[0].steps);
      assert.deepStrictEqual(s[0].gate, MACRO.steps[0].gate, JSON.stringify(s));
      assert.strictEqual(s[1].gate, undefined);
    });
    await test('MBU-03', 'a human pause, a page condition with retries, backoff and skip — saved as the runner reads it', async () => {
      await openEdit(); await page.waitForSelector('.modal .step');
      await page.evaluate(() => {
        const g = document.querySelectorAll('.modal .step .gate-between')[1]; g.open = true;
        const set = (i, v) => { const el = g.querySelectorAll('select, input')[i]; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
        // order: pause kind, ms, from, to, hold, element, holds, wait up to, retries, backoff base, ×, cap, if closed
        set(0, 'human'); set(1, '900'); set(4, 'value'); set(5, '#price'); set(6, '25'); set(7, '5000'); set(8, '3'); set(9, '200'); set(10, '2'); set(11, '2000'); set(12, 'skip');
      });
      const said = await page.evaluate(() => document.querySelectorAll('.modal .step .gate-between > summary')[1].textContent);
      assert.ok(/person’s pace \(~900 ms\)/.test(said) && /#price holds “25”/.test(said) && /5 s, 3 retries, backoff 200 ms ×2/.test(said) && /if closed: skip/.test(said), said);
      if (process.env.MB_SHOTS) { await page.evaluate(() => { document.querySelectorAll('.modal .step .gate-between')[0].open = true; }); await page.screenshot({ path: path.join(process.env.MB_SHOTS, 'macro-blocks.png') }); }
      await save(); await page.waitForFunction(() => SAVED.length === 2);
      const g = await page.evaluate(() => SAVED[1].steps[1].gate);
      assert.deepStrictEqual(g, { delay: { kind: 'human', ms: 900 }, selector: '#price', value: '25', timeoutMs: 5000, retries: 3, backoff: { baseMs: 200, factor: 2, capMs: 2000 }, onClosed: 'skip' });
      assert.ok(GE.validateGate(g).ok, GE.validateGate(g).why);
      assert.deepStrictEqual(errors, []);
    });
    await browser.close();
  }
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
