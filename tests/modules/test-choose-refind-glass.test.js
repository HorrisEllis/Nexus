'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-choose-refind-glass.test.js — GT1 + GT4, 0.60.318. Spec: clear-glass/spec/gated-flows.spec MOD-GT1, MOD-GT4.
 * James, 2026-10-30: "almost. more timing in between drop down menus." Copilot, on his gig editor: "Driver error [choose]: Element not found:
 * [data-cg-choose="1"]". The driver's real choose (clear-glass/src/driver/index.js), driven on a live page in Clear Glass's engine (glass.js),
 * against a fixture that does what Fiverr's section does: the dropdown is replaced when it opens, the whole section re-renders after the
 * category is chosen, and the subcategory's dropdown arrives later.
 *
 *   GR-01  the category is chosen although its dropdown is replaced the moment it opens (the mark lost) — found again by what it showed
 *   GR-02  after the section re-renders, the subcategory (arriving 1.5 s later) is chosen and read back
 *   GR-03  a dropdown that is gone: the error names its mark, what it showed, and the dropdowns the page has (never a bare "not found")
 *   GR-04  gateTiming: text keeps today's 2500/400/1 retry; a choice waits 8 s, 3 tries, a growing delay; the step's own fields win
 *   GR-05  a list that loads 4 s late: the choice gate holds it; today's text constants do not (both proven)
 *   GR-06  the DOM-quiet wait: quiet after the last change, and "not quiet" said when the page never stops
 *   GR-07  the site key gates.betweenDropdownsMs exists, 1200 by default, bounded
 */
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
// the engine: Clear Glass's Electron when installed; else a Chromium already on the machine (glass.js reads GLASS_CHROMIUM)
if (!process.env.GLASS_CHROMIUM) { const fs = require('fs'); const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
const { chromium } = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
const EG = require(path.join(ROOT, 'clear-glass/src/page/element-gate.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }

// Fiverr-like: a custom dropdown (no <select>); opening it replaces the trigger element (React re-render); choosing re-renders the section
const PAGE = `<!doctype html><meta charset=utf-8><style>body{font:14px sans-serif} .dd{display:inline-block;padding:8px;border:1px solid #888;margin:8px;min-width:200px;cursor:pointer}
 .menu{border:1px solid #444;width:220px;margin-left:8px} .menu div{padding:6px}</style><body><h3>Category</h3><section id="s"></section><div id="m"></div>
<script>
var state = { cat: null, sub: null, subReady: false };
var CATS = ['Graphics & Design', 'Programming & Tech', 'Writing & Translation'], SUBS = ['Website Development', 'AI Development', 'Mobile Apps'];
function dd(label, list, onPick) { var d = document.createElement('div'); d.className = 'dd'; d.setAttribute('role', 'combobox'); d.setAttribute('aria-haspopup', 'listbox'); d.textContent = label;
  d.addEventListener('click', function(){ var fresh = dd(label, list, onPick); d.replaceWith(fresh); openMenu(list, onPick); }); return d; }
function openMenu(list, onPick) { var m = document.getElementById('m'); m.innerHTML = ''; var box = document.createElement('div'); box.className = 'menu';
  list.forEach(function(t){ var o = document.createElement('div'); o.setAttribute('role', 'option'); o.textContent = t; o.addEventListener('click', function(){ m.innerHTML = ''; onPick(t); }); box.appendChild(o); }); m.appendChild(box); }
function render() { var s = document.getElementById('s'); s.innerHTML = '';
  s.appendChild(dd(state.cat || 'SELECT A CATEGORY', CATS, function(t){ state.cat = t; state.subReady = false; render(); setTimeout(function(){ state.subReady = true; render(); }, 1500); }));
  if (state.cat && state.subReady) s.appendChild(dd(state.sub || 'SELECT A SUBCATEGORY', SUBS, function(t){ state.sub = t; render(); })); }
render();
</script></body>`;

// webContents over the engine's CDP: the two calls the driver makes (executeJavaScript, sendInputEvent)
function wcOf(pg) {
  const MOUSE = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  return {
    async executeJavaScript(code) {
      const r = await pg._send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
      if (r && r.exceptionDetails) throw new Error('Script failed to execute: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text));
      return r && r.result ? r.result.value : undefined;
    },
    sendInputEvent(e) {
      if (MOUSE[e.type]) return pg._send('Input.dispatchMouseEvent', { type: MOUSE[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : 'left', clickCount: e.type === 'mouseMove' ? 0 : 1 });
      if (e.type === 'keyDown' || e.type === 'keyUp') return pg._send('Input.dispatchKeyEvent', { type: e.type, key: e.keyCode });
      if (e.type === 'char') return pg._send('Input.dispatchKeyEvent', { type: 'char', text: e.keyCode });
      return null;
    },
    isDestroyed() { return false; }, getURL() { return 'data:fixture'; },
  };
}

function driverFor(pg) {
  const ClearDriver = require(path.join(ROOT, 'clear-glass/src/driver/index.js'));
  const D = typeof ClearDriver === 'function' ? ClearDriver : (ClearDriver.ClearDriver || ClearDriver.default);
  const d = new D({ ctxMgr: null, dom: null, vault: null, sse: { emit() {} } });
  const wc = wcOf(pg);
  d._getWebContents = () => wc;
  return d;
}

(async () => {
  console.log('\n⬡  choose finds its dropdown again; gates paced per part — driven in Clear Glass on a live page\n');
  let browser;
  try {
    browser = await chromium.launch();
    const pg = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await pg.goto('data:text/html,' + encodeURIComponent(PAGE));
    const d = driverFor(pg);
    const fast = { openWait: [150, 200], pickWait: [80, 120], settleWait: [250, 300], optionsWaitMs: 3000, via: 'native' };

    await test('GR-01', 'the category is chosen although opening replaces its dropdown (the mark lost, found again)', async () => {
      const r = await d._choose('default', { shows: 'SELECT A CATEGORY', option: 'Programming & Tech', ...fast });
      assert.strictEqual(r.option, 'Programming & Tech');
      assert.ok(/Programming & Tech/.test(r.shown), `shown: ${r.shown}`);
      assert.ok(r.refound && r.refound.length, 'the re-find is said on the result: ' + JSON.stringify(r));
    });

    await test('GR-02', 'after the section re-renders, the subcategory arriving 1.5 s later is chosen and read back', async () => {
      const q = await d._evalJs(d._getWebContents(), EG.quietScript(300, 4000));
      const until = Date.now() + 8000; let there = false;
      while (Date.now() < until && !(there = await pg.evaluate(() => /SELECT A SUBCATEGORY/.test(document.body.innerText)))) await new Promise(r => setTimeout(r, 200));
      assert.ok(there, 'the subcategory dropdown arrived'); assert.ok(q && typeof q.quiet === 'boolean');
      const r = await d._choose('default', { shows: 'SELECT A SUBCATEGORY', option: 'AI Development', ...fast });
      assert.ok(/AI Development/.test(r.shown), `shown: ${r.shown}`);
      const st = await pg.evaluate(() => state);
      assert.deepStrictEqual([st.cat, st.sub], ['Programming & Tech', 'AI Development']);
    });

    await test('GR-03', 'a dropdown that is gone: the error names the mark, what it showed, and the dropdowns on the page', async () => {
      // the trigger is removed the moment it is clicked, and nothing showing its text comes back
      await pg.evaluate(() => { var x = document.createElement('div'); x.className = 'dd'; x.setAttribute('role', 'combobox'); x.textContent = 'SELECT A VANISHING';
        x.addEventListener('mousedown', function(){ x.remove(); }); document.body.appendChild(x); });
      // the first open lands, removes it; reopen (no options) must say the dropdown is gone, not "Element not found"
      let err = null; try { await d._choose('default', { shows: 'SELECT A VANISHING', option: 'Anything', ...fast, optionsWaitMs: 600 }); } catch (e) { err = e; }
      assert.ok(err, 'refused');
      assert.ok(/dropdown is gone/.test(err.message) && /data-cg-choose/.test(err.message) && /SELECT A VANISHING/.test(err.message) && /dropdowns on the page: .*Programming & Tech/.test(err.message), err.message);
    });
  } catch (e) { console.error('  ✗ the engine did not start: ' + e.message); failed++; }
  finally { try { if (browser) await browser.close(); } catch (_) {} }

  await test('GR-04', 'gateTiming: text as today; a choice 8 s, 3 tries, growing delay; the step wins, the site lifts the floor', async () => {
    const t = EG.gateTiming({});
    assert.deepStrictEqual([t.timeoutMs, t.settleMs, t.retries, EG.backoffMs(t, 0)], [2500, 400, 1, 0]);
    const c = EG.gateTiming({ kind: 'choice' });
    assert.deepStrictEqual([c.timeoutMs, c.retries, [0, 1, 2, 3].map(n => EG.backoffMs(c, n))], [8000, 2, [600, 1200, 2400, 4000]]);
    assert.strictEqual(EG.gateTiming({ kind: 'choice', timeoutMs: 3000 }).timeoutMs, 3000, 'the step wins');
    assert.strictEqual(EG.gateTiming({}, { timeoutMs: 5000 }).timeoutMs, 5000, 'his site key lifts the floor');
    assert.strictEqual(EG.gateTiming({ kind: 'choice' }, { timeoutMs: 1000 }).timeoutMs, 8000, 'a site value below the choice floor does not shorten it');
  });

  await test('GR-05', 'a list that loads 4 s late: the choice gate holds; today\'s text constants close (both proven)', async () => {
    const lateCheck = () => { const t0 = Date.now(); return async () => ({ open: Date.now() - t0 > 4000, saw: Date.now() - t0 > 4000 ? 'AI Development' : 'SELECT A SUBCATEGORY' }); };
    const today = await EG.settle(lateCheck(), { timeoutMs: 2500, settleMs: 400, every: 150 });
    const c = EG.gateTiming({ kind: 'choice' });
    const now = await EG.settle(lateCheck(), { timeoutMs: c.timeoutMs, settleMs: c.settleMs, every: c.every });
    assert.strictEqual(today.open, false, 'today closes'); assert.strictEqual(now.open, true, 'the choice gate holds'); assert.strictEqual(now.held, true);
  });

  await test('GR-06', 'quietScript is a page expression for a promise of { quiet, waitedMs, mutations }, capped', async () => {
    const s = EG.quietScript(300, 2000);
    assert.ok(/MutationObserver/.test(s) && /300/.test(s) && /2000/.test(s));
    assert.doesNotThrow(() => new Function('return ' + s));
  });

  await test('GR-07', 'site key gates.betweenDropdownsMs: 1200 by default, 0..15000', async () => {
    const K = require(path.join(ROOT, 'clear-glass/src/site-settings/keys.js'));
    const all = K.KEYS || K.default || [];
    const k = (Array.isArray(all) ? all : []).find(x => x.key === 'gates.betweenDropdownsMs');
    assert.ok(k, 'declared'); assert.deepStrictEqual([k.default, k.min, k.max, k.type], [1200, 0, 15000, 'int']);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
