'use strict';
/**
 * tests/modules/test-element-gates.test.js — a gate on any DOM element, made with the picker per site or page (UG1, UG4, UG5; 0.60.292, 0.60.293)
 * James, 2026-10-30: "it needs to be universal for all dom elements. like for the job applications for instance, even if we need a way to
 * create them per page using the element picker, per site settings, macros and automation features. stop thinking so narrow"
 *
 *   UG-01  element-gate: every write's expectation derived; value / equals / matches / shows / checked / text / visible / gone evaluated;
 *          {{value}} filled in; a gate with nothing to check refused; his gates matched by site and page
 *   (UG-02, UG-03 — the automatic write gates — are archived with them, his correction of 2026-10-30: _archive/2026-10-30-write-gates/)
 *   UG-04  in Clear Glass: the driver's gate action only reads: his gate on a field (an XPath, "matches an email") is closed for a non-email
 *          and open for an email; one by id, all of his on the page, or a condition; nothing is written by it
 *   UG-05  in Clear Glass: the "Gate this element" bar saves a gate from a pick; the store validates; the command row builds the requests
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const FORM = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px sans-serif;margin:30px} label{display:block;margin:8px 0}</style></head><body>
<h2>Apply for this job</h2>
<label>Full name <input id="name" name="name" autocomplete="name"></label>
<label>Email <input id="email" name="email" type="email" autocomplete="email"></label>
<label>Phone <input id="rev" name="phone" type="tel" autocomplete="tel"></label>
<label>Country <select id="sel"><option value="">Choose</option><option value="us">United States</option><option value="ca">Canada</option></select></label>
<label><input id="cb" type="checkbox"> I agree to the terms</label>
<script>var rev = document.getElementById('rev'); rev.addEventListener('input', function(){ setTimeout(function(){ rev.value = ''; }, 200); });</script>
</body></html>`;

(async () => {
  console.log('\n⬡  A gate on every DOM element, for every caller\n');
  const EG = require(CG('src/page/element-gate.js'));
  const OM = require(CG('src/page/option-match.js'));

  await test('UG-01', 'derive, evaluate, validate, {{value}}, his gates by site and page', async () => {
    assert.deepStrictEqual(EG.derive('type', { selector: '#a', text: 'hi' }), { selector: '#a', value: 'hi', why: 'typed' });
    assert.strictEqual(EG.derive('type', { selector: '#a', text: '\n' }), null, 'an Enter alone implies nothing');
    assert.deepStrictEqual(EG.derive('typeAt', { column: 'BASIC', row: 'Price', text: '30' }, { selector: '[data-cg-type="1"]' }).selector, '[data-cg-type="1"]');
    assert.deepStrictEqual(EG.derive('choose', { column: 'BASIC', row: 'Revisions', option: '2' }).choice, { column: 'BASIC', row: 'Revisions', selector: null });
    assert.deepStrictEqual(EG.derive('check', { selector: '#c', checked: false }).checked, false);
    assert.strictEqual(EG.derive('checkAt', { column: 'A', row: 'B', read: true }), null, 'a read is not a write');
    assert.strictEqual(EG.derive('click', { selector: '#x' }), null, 'a click implies nothing on its own');
    assert.ok(EG.WRITES.has('insertText') && !EG.WRITES.has('click'));
    const st = { found: true, visible: true, value: 'james@example.com', shows: 'Canada', checked: true, text: 'Apply now' };
    assert.strictEqual(EG.evaluate({ selector: '#e', value: 'james@example.com' }, st, OM).open, true);
    assert.strictEqual(EG.evaluate({ selector: '#e', equals: 'james@' }, st, OM).open, false);
    assert.strictEqual(EG.evaluate({ selector: '#e', matches: '/^\\S+@\\S+$/' }, st, OM).open, true);
    assert.strictEqual(EG.evaluate({ selector: '#e', matches: '/^\\S+@\\S+$/' }, { ...st, value: 'james' }, OM).open, false);
    assert.strictEqual(EG.evaluate({ selector: '#s', shows: 'canada' }, st, OM).open, true);
    assert.strictEqual(EG.evaluate({ selector: '#c', checked: false }, st, OM).open, false);
    assert.strictEqual(EG.evaluate({ text: 'apply' }, { text: 'Apply now' }, OM).open, true, 'page-wide text');
    assert.strictEqual(EG.evaluate({ selector: '#x', gone: true }, { found: false }, OM).open, true);
    assert.deepStrictEqual(EG.evaluate({ selector: '#x', value: 'a' }, { found: false }, OM), { open: false, saw: 'not on the page' });
    assert.deepStrictEqual(EG.normalize({ xpath: '//input', value: '{{value}}' }, 'typed text').value, 'typed text');
    assert.deepStrictEqual(EG.normalize({ selector: '//input[1]', value: 'x' }).xpath, '//input[1]', 'an XPath selector is read as one');
    assert.deepStrictEqual(EG.normalize({ choice: { column: 'BASIC', is: '3' } }), { choice: { column: 'BASIC', row: null, selector: null }, shows: '3' }, 'a macro choice gate reads the same');
    assert.strictEqual(EG.validate({ selector: '#a' }).ok, false, 'nothing to hold');
    assert.strictEqual(EG.validate({ value: 'x' }).ok, false, 'a value needs an element');
    assert.strictEqual(EG.validate({ text: 'Thanks for applying' }).ok, true, 'text alone: the page');
    assert.strictEqual(EG.validate({ selector: '#a', matches: '/(/' }).ok, false, 'a broken pattern');
    const map = { 'https://jobs.example.com': [{ id: 'a', xpath: '//x', value: '1' }, { id: 'b', xpath: '//y', value: '2', page: 'https://jobs.example.com/apply/*' }] };
    assert.deepStrictEqual(EG.matchSite(map, 'https://jobs.example.com/apply/42').map(g => g.id), ['a', 'b']);
    assert.deepStrictEqual(EG.matchSite(map, 'https://jobs.example.com/home').map(g => g.id), ['a']);
    assert.deepStrictEqual(EG.matchSite(map, 'https://other.example.com/apply/42'), []);
    let n = 0; const s = await EG.settle(async () => ({ open: ++n === 1, saw: `read ${n}` }), { timeoutMs: 300, settleMs: 20, every: 10 });
    assert.strictEqual(s.open, false, 'open, then changed by the page: closed'); assert.match(s.saw, /then the page changed it/);
  });

  const srv = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/bar' ? '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' : FORM); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - UG-02..05 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const wcOf = (page) => ({ executeJavaScript: (c) => page._eval(c), getURL: () => base + '/apply', insertText: (t) => page._send('Input.insertText', { text: t }), isDestroyed: () => false,
    sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) });
      if (e.type === 'char') return page._send('Input.insertText', { text: e.keyCode });
      if (e.type === 'keyDown') return page._send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: e.keyCode, windowsVirtualKeyCode: String(e.keyCode).toUpperCase().charCodeAt(0) });
      if (e.type === 'keyUp') return page._send('Input.dispatchKeyEvent', { type: 'keyUp', key: e.keyCode }); } });
  function driverOn(page, siteGates = {}) {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    const wc = wcOf(page); d._getWebContents = () => wc; d.getSiteGates = () => siteGates;
    return d;
  }
  const R = require(CG('src/site-settings/readers.js'));
  const fastGates = (extra = {}) => R.install((url) => ({ origin: new URL(url).origin, driver: { allowed: true }, autofill: { enabled: true, profileId: 'me' }, gates: { settleMs: 250, timeoutMs: 600, ...extra }, from: {} }));

  if (browser) await test('UG-04', 'in Clear Glass: the gate action only reads: his picked gate closed for a non-email, open for an email; by id, all, a condition', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(base + '/apply');
    fastGates();
    const mine = { [base]: [{ id: 'email-ok', label: 'an email', xpath: '//*[@id="email"]', matches: '/^\\S+@\\S+\\.\\S+$/' }] };
    const d = driverOn(page, mine);
    let r = await d.exec({ agentId: 'w', action: 'setValue', selector: '#email', value: 'not an email', by: 'person' });
    assert.strictEqual(r.gate, undefined, 'a write is a write: no gate behind it');
    let g = await d.exec({ agentId: 'w', action: 'gate', id: 'email-ok', by: 'person' });
    assert.ok(!g.open && /does not match/.test(g.saw), JSON.stringify(g));
    await d.exec({ agentId: 'w', action: 'setValue', selector: '#email', value: 'james@example.com', by: 'person' });
    g = await d.exec({ agentId: 'w', action: 'gate', all: true, by: 'person' });
    assert.deepStrictEqual([g.open, g.checks], [true, 1]);
    g = await d.exec({ agentId: 'w', action: 'gate', gate: { selector: '#name', value: 'nobody' }, by: 'person' });
    assert.strictEqual(g.open, false);
    assert.strictEqual(await page.evaluate(() => document.getElementById('email').value), 'james@example.com', 'the gate wrote nothing');
    const BA = require(path.join(ROOT, 'lib/agent-tools/tools/browser/browser-action.js'));
    assert.deepStrictEqual(BA.driverCall('gate', { id: 'email-ok' }), { action: 'gate', id: 'email-ok' });
    R.install(null);
    await page.close();
  });

  if (browser) await test('UG-05', 'in Clear Glass: Gate this element saves from a pick; the store validates; the command row', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.goto(base + '/bar');
    await page.evaluate((css) => { window.__saved = []; const st = document.createElement('style'); st.textContent = css; document.head.append(st); }, fs.readFileSync(CG('renderer/site-gates/gate-bar.css'), 'utf8'));
    await page.evaluate((src) => { (0, eval)(src); }, fs.readFileSync(CG('renderer/site-gates/gate-bar.js'), 'utf8'));
    await page.evaluate(() => { window.CGGateBar.mount({ cg: { shortcuts: { gateAdd: async (url, gate) => { window.__saved.push({ url, gate }); return { ok: true, origin: 'https://jobs.example.com', gate: { id: 'g1', ...gate } }; } } } });
      window.CGGateBar.offer({ xpath: '//*[@id="email"]', url: 'https://jobs.example.com/apply/42?ref=x' }); });
    await page.evaluate(() => { const k = document.querySelector('#cg-gate-bar .gb-kind'); k.value = 'matches'; k.dispatchEvent(new Event('change'));
      document.querySelector('#cg-gate-bar .gb-extra').value = '/@/'; document.querySelector('#cg-gate-bar .gb-scope').value = 'page'; document.querySelector('#cg-gate-bar .gb-label').value = 'email'; });
    await page.evaluate(() => document.querySelector('#cg-gate-bar .gb-save').click());
    await page.waitForTimeout(100);
    const saved = await page.evaluate(() => window.__saved);
    assert.deepStrictEqual(saved, [{ url: 'https://jobs.example.com/apply/42?ref=x', gate: { xpath: '//*[@id="email"]', matches: '/@/', label: 'email', page: 'https://jobs.example.com/apply/42*' } }]);
    assert.match(await page.evaluate(() => document.querySelector('#cg-gate-bar .gb-say').textContent), /gate g1 saved/);
    await page.close();
    // the store: validated, per site, removable
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ug5-'));
    const NexusOptions = require(CG('src/options/store.js'));
    const Ctor = NexusOptions.NexusOptions || NexusOptions;
    const o = new Ctor({ dir: home, file: path.join(home, 'options.json') });
    if (!o.data) o.data = {}; o._persist = () => {};
    assert.match(o.addSiteGate('https://jobs.example.com/x', { xpath: '//a' }).error, /say what must hold/);
    const a = o.addSiteGate('https://jobs.example.com/x', { selector: '//input[@id="email"]', matches: '/@/', label: 'email' });
    assert.ok(a.ok && a.gate.xpath === '//input[@id="email"]' && !a.gate.selector, JSON.stringify(a));
    assert.strictEqual(o.getSiteGates()['https://jobs.example.com'].length, 1);
    assert.ok(o.removeSiteGate('https://jobs.example.com', a.gate.id).ok);
    assert.deepStrictEqual(o.getSiteGates(), {});
    const { SPEC } = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const row = SPEC.find(x => x.key === 'glass.gates');
    assert.deepStrictEqual(row.req({ args: ['add', 'https://jobs.example.com'], flags: { selector: '#email', matches: '/@/' } }).body, { url: 'https://jobs.example.com', gate: { selector: '#email', matches: '/@/' } });
    assert.strictEqual(row.req({ args: ['check'], flags: {} }).path, '/cli/site-gates/check');
    // wired: IPC, routes, preload, the picker hook, Settings
    const bridge = fs.readFileSync(CG('src/ipc/bridge.js'), 'utf8'), pre = fs.readFileSync(CG('src/preload/index.js'), 'utf8'), bjs = fs.readFileSync(CG('renderer/browser.js'), 'utf8');
    for (const s of ["'siteGates:add'", "'/cli/site-gates'", "'/cli/site-gates/check'"]) assert.ok(bridge.includes(s), s);
    assert.ok(pre.includes('gateAdd') && bjs.includes('CGGateBar?.offer') && fs.readFileSync(CG('renderer/settings/sections/driver.js'), 'utf8').includes('Gates on sites'));
  });

  if (browser) await browser.close();
  srv.close();
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
