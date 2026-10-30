'use strict';
/**
 * tests/modules/test-a11y-trace.test.js — a site's accessibility look traced to what turns it on, kept off by the site's settings (AC2)
 * James, 2026-10-30, with fiverr.com in yellow-on-black links after the reset found nothing named accessibility: "look at the
 * accessability. needs to actually hook into the back end settings. looks lazy also."
 *
 *   A2-01  in Clear Glass: a look switched on by an attribute named nothing like accessibility (body[data-hc]) is traced: the rule that
 *          paints the link, the attribute that switches it on, the link's colours, and the site's own accessibility button
 *   A2-02  in Clear Glass: kept off through the bridge → the site setting accessibility.keepOff is written, the page loses the look now;
 *          after a reload, main's keep-off (the same script _siteOnLoad runs) keeps it off, also when the site puts it back; undo reloads
 *   A2-03  in Clear Glass: "Open the site's accessibility settings" clicks the site's own control
 *   A2-04  in Clear Glass: the popup panel draws the swatch, a switch per trigger and rule, the site's control, and a switch writes through
 *   A2-05  the setting: accessibility.keepOff takes selectors with spaces, is drawn by its panel (not as a text box), main applies it at load
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

// a site whose look is switched on by an attribute from its own storage, named nothing like accessibility; its own accessibility button
const SITE = `<!doctype html><html><head><style>body{font:14px sans-serif} a{color:#1dbf73} body[data-hc] a{color:yellow;background:black}</style>
<script>document.addEventListener('DOMContentLoaded', function(){ if (localStorage.getItem('ui_pref_v2') === '1') document.body.setAttribute('data-hc', '1'); });</script></head>
<body><nav><a href="#d">Dashboard</a> <a href="#g">Gigs</a></nav>
<button id="acc" aria-label="Accessibility options" onclick="window.opened = (window.opened || 0) + 1">◎</button>
<script>window.putBack = function(){ document.body.setAttribute('data-hc', '1'); };</script></body></html>`;
const PANEL = `<!doctype html><html><head><link rel="stylesheet" href="/r/a11y-panel.css"></head><body style="background:#12161c;width:380px">
<div id="host" data-feature="accessibility"></div><script src="/r/a11y-panel.js"></script></body></html>`;

(async () => {
  console.log('\n⬡  A site\'s accessibility look, traced and kept off by its settings (AC2)\n');
  const K = require(CG('src/page/keyboard-mode.js'));
  const Bridge = require(CG('src/ipc/bridge.js'));

  await test('A2-05', 'accessibility.keepOff takes selectors with spaces, is drawn by its panel, and main applies it at load', async () => {
    const KEYS = require(CG('src/site-settings/keys.js'));
    const k = KEYS.get('accessibility.keepOff');
    assert.ok(k && k.type === 'string[]' && k.panel, JSON.stringify(k));
    const v = KEYS.validate('accessibility.keepOff', ['attr:data-hc', 'rule:body[data-hc] a']);
    assert.deepStrictEqual(v, { ok: true, value: ['attr:data-hc', 'rule:body[data-hc] a'] });
    assert.match(fs.readFileSync(CG('renderer/site-profile-groups.js'), 'utf8'), /if \(!k\.panel\) g\.append\(row\(k\)\)/);
    assert.match(fs.readFileSync(CG('src/main/index.js'), 'utf8'), /readers'\)\.keepOff\(url\)[\s\S]{0,200}keepOffScript\(keep\)/);
    assert.match(fs.readFileSync(CG('renderer/browser.html'), 'utf8'), /a11y-panel\.js/);
  });

  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/r/')) { const f = CG('renderer/' + path.basename(req.url)); res.setHeader('Content-Type', (f.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8'); return res.end(fs.readFileSync(f)); }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url.startsWith('/panel') ? PANEL : SITE);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - A2-01..04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }

  async function sitePage() {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    await page.goto(base + '/site');
    await page.evaluate(() => localStorage.setItem('ui_pref_v2', '1'));
    await page.goto(base + '/site');
    await page.waitForFunction(() => document.body.hasAttribute('data-hc'));
    return page;
  }
  // the bridge on that page, with a site settings store in memory (the real one is src/site-settings/profile.js)
  function bridgeOn(page) {
    const store = {};
    const wc = { id: 7, isDestroyed: () => false, getURL: () => base + '/site', executeJavaScript: (c) => page._eval(c), reload: () => { wc.reloads = (wc.reloads || 0) + 1; } };
    const prof = { siteProfile: () => ({ accessibility: { keepOff: store['accessibility.keepOff'] || [] } }),
      setSite: (u, k, v) => { const r = require(CG('src/site-settings/keys.js')).validate(k, v); if (r.ok) store[k] = r.value; return r; },
      clearSite: (u, k) => { delete store[k]; return { ok: true }; } };
    return { self: { _electron: { webContents: { fromId: () => wc } }, _siteProfile: () => prof, _a11yPage: Bridge.prototype._a11yPage, _a11yKept: Bridge.prototype._a11yKept }, store, wc };
  }
  const yellow = (page) => page.evaluate(() => getComputedStyle(document.querySelector('a')).color);

  if (browser) await test('A2-01', 'in Clear Glass: the look traced to body[data-hc], the rule that paints it, and the site\'s own button', async () => {
    const page = await sitePage();
    const { self } = bridgeOn(page);
    const t = await Bridge.prototype._a11yTrace.call(self, 7);
    assert.ok(t.ok, JSON.stringify(t));
    assert.deepStrictEqual([t.link.color, t.link.background], ['rgb(255, 255, 0)', 'rgb(0, 0, 0)']);
    const rule = t.rules.find(r => r.selector === 'body[data-hc] a');
    assert.ok(rule && rule.props.color && rule.props.background && rule.keepable, JSON.stringify(t.rules));
    assert.deepStrictEqual(rule.triggers, ['attr:data-hc']);
    assert.ok(!t.rules.some(r => r.selector === 'a'), 'the site\'s normal link rule does not paint this look');
    assert.deepStrictEqual(t.triggers, [{ kind: 'attr', name: 'data-hc', value: '1', on: 'body' }]);
    assert.deepStrictEqual(t.controls.map(c => [c.n, c.label, c.kind]), [[1, 'Accessibility options', 'button']]);
    assert.deepStrictEqual(t.keepOff, []);
    await page.close();
  });

  if (browser) await test('A2-02', 'in Clear Glass: kept off → the setting written, off now, off after a reload and when the site puts it back; undo reloads', async () => {
    const page = await sitePage();
    const { self, store, wc } = bridgeOn(page);
    assert.strictEqual(await yellow(page), 'rgb(255, 255, 0)');
    const r = await Bridge.prototype._a11yKeepOff.call(self, 7, 'attr:data-hc', true);
    assert.ok(r.ok && r.applied && r.applied.removed >= 1, JSON.stringify(r));
    assert.deepStrictEqual(store['accessibility.keepOff'], ['attr:data-hc'], 'the site setting holds it');
    assert.strictEqual(await yellow(page), 'rgb(29, 191, 115)', 'the site\'s normal look now');
    // the next load: the site switches it on again; main's _siteOnLoad applies the site's keepOff
    await page.goto(base + '/site');
    await page.waitForFunction(() => document.body.hasAttribute('data-hc'));
    await page._eval(K.keepOffScript(store['accessibility.keepOff']));
    assert.strictEqual(await yellow(page), 'rgb(29, 191, 115)', 'kept off after a reload');
    await page.evaluate(() => window.putBack());
    await page.waitForTimeout(150);
    assert.strictEqual(await yellow(page), 'rgb(29, 191, 115)', 'kept off when the site puts it back');
    // a rule kept off by its selector
    await Bridge.prototype._a11yKeepOff.call(self, 7, 'rule:body[data-hc] a', true);
    assert.deepStrictEqual(store['accessibility.keepOff'], ['attr:data-hc', 'rule:body[data-hc] a']);
    const t = await Bridge.prototype._a11yTrace.call(self, 7);
    assert.deepStrictEqual(t.keepOff, ['attr:data-hc', 'rule:body[data-hc] a']);
    // undo: the setting loses it, the page reloads
    const u = await Bridge.prototype._a11yKeepOff.call(self, 7, 'attr:data-hc', false);
    assert.ok(u.ok && u.reloaded && wc.reloads === 1, JSON.stringify(u));
    assert.deepStrictEqual(store['accessibility.keepOff'], ['rule:body[data-hc] a']);
    await Bridge.prototype._a11yKeepOff.call(self, 7, 'rule:body[data-hc] a', false);
    assert.ok(!('accessibility.keepOff' in store), 'the last one undone clears the setting');
    const bad = await Bridge.prototype._a11yKeepOff.call(self, 7, 'javascript:alert(1)', true);
    assert.ok(bad.ok === false && /not something to keep off/.test(bad.error));
    await page.close();
  });

  if (browser) await test('A2-03', 'in Clear Glass: the site\'s own accessibility control is opened', async () => {
    const page = await sitePage();
    const { self } = bridgeOn(page);
    await Bridge.prototype._a11yTrace.call(self, 7);
    const r = await Bridge.prototype._a11yOpenControl.call(self, 7, 1);
    assert.deepStrictEqual(r, { ok: true, opened: 'Accessibility options' });
    assert.strictEqual(await page.evaluate(() => window.opened), 1);
    assert.strictEqual((await Bridge.prototype._a11yOpenControl.call(self, 7, 9)).ok, false);
    await page.close();
  });

  if (browser) await test('A2-04', 'in Clear Glass: the panel draws the swatch, a switch per trigger and rule, the control; a switch writes through', async () => {
    const page = await browser.newPage({ viewport: { width: 420, height: 700 } });
    await page.goto(base + '/panel');
    await page.evaluate(() => {
      window.calls = [];
      const trace = { ok: true, link: { color: 'rgb(255, 255, 0)', background: 'rgb(0, 0, 0)', decoration: 'none', spacing: 'normal', outline: null },
        rules: [{ selector: 'body[data-hc] a', keepable: true, sheet: 'a <style> in the page', props: { color: 'yellow', background: 'black' }, triggers: ['attr:data-hc'] }],
        triggers: [{ kind: 'attr', name: 'data-hc', value: '1', on: 'body' }], unreadable: [], forced: { colors: false, contrast: false },
        controls: [{ n: 1, label: 'Accessibility options', kind: 'button' }], widgets: [], keepOff: [] };
      const api = { a11yTrace: async () => (window.calls.push(['trace']), trace),
        a11yKeepOff: async (w, entry, on) => { window.calls.push(['keep', w, entry, on]); trace.keepOff = on ? trace.keepOff.concat(entry) : trace.keepOff.filter(x => x !== entry); return { ok: true, origin: 'https://www.fiverr.com', entry, on }; },
        a11yOpenControl: async (w, n) => (window.calls.push(['open', w, n]), { ok: true, opened: 'Accessibility options' }), a11yReset: async () => ({ ok: true, storage: [], cookies: [], classes: { html: [], body: [] }, otherKeys: [], otherCookies: [] }) };
      document.getElementById('host').append(window.CGA11yPanel.build({ api, wcId: 3 }).el);
    });
    await page.click('.a11y-panel .a11y-btn.primary');
    await page.waitForSelector('.a11y-row');
    const drawn = await page.evaluate(() => ({ sample: getComputedStyle(document.querySelector('.a11y-sample')).color, rows: Array.prototype.map.call(document.querySelectorAll('.a11y-row'), r => r.dataset.entry),
      ctl: Array.prototype.map.call(document.querySelectorAll('.a11y-ctl .a11y-btn'), b => b.textContent), styled: getComputedStyle(document.querySelector('.a11y-switch')).appearance }));
    assert.deepStrictEqual(drawn, { sample: 'rgb(255, 255, 0)', rows: ['attr:data-hc', 'rule:body[data-hc] a'], ctl: ['Open the site’s accessibility settings: Accessibility options'], styled: 'none' });
    await page.click('.a11y-row[data-entry="attr:data-hc"] .a11y-switch');
    await page.waitForFunction(() => document.querySelector('.a11y-row[data-entry="attr:data-hc"] .a11y-tag.on'));
    await page.click('.a11y-ctl .a11y-btn');
    await page.waitForFunction(() => window.calls.some(c => c[0] === 'open'));
    const calls = await page.evaluate(() => window.calls.filter(c => c[0] !== 'trace'));
    assert.deepStrictEqual(calls, [['keep', 3, 'attr:data-hc', true], ['open', 3, 1]]);
    assert.match(await page.textContent('.a11y-status'), /Opened “Accessibility options”/);
    try { await page.screenshot({ path: path.join(require('os').tmpdir(), 'a11y-panel.png') }); } catch (_) {}
    await page.close();
  });

  if (browser) try { await browser.close(); } catch (_) {}
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
