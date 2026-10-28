'use strict';
/**
 * tests/modules/test-autofill-chips.test.js — the page reader is always there, and a chip under each input (0.60.267, AF3)
 * James, 2026-10-28: "fill this in · Did not fill: matchGigFields: domFields must be the dom_query array · needs to autofill any field it can.
 * also needs to have the autopill under each input fieled."
 *
 *   AC-01  the error he hit: a page with NO reader, and a page with only the renderer's query-only reader, are queried (an array) and filled
 *          (value set the React-safe way) — the full reader is put on the page first
 *   AC-02  combine: the profile's match and the gig's per field, best first; a template still holding {{…}} is not offered
 *   AC-03  the page-side reporter says where the suggested fields are and that the field set changed — never a suggested value
 *   AC-04  in Clear Glass, browser.html: chips drawn under the reported fields with the value; a field already holding it has none; the ▾
 *          lists every option; a click fills that field (cg.autofill.fillOne) and the page keeps its focus
 *   AC-05  the suggest backend over a real page: the gig's pricing boxes and a profile email, with the reporter script
 *   AC-06  (0.60.268 AF5) "what a node anchor": a field nothing placed is listed with its stable key; anchored as email, the key is learned
 *          for the site and the next suggestion offers the profile email on it; anchored as a gig part, it is kept as that part's target
 *   AC-07  in Clear Glass, browser.html: the ⚓ chip lists what the field can be (gig parts, profile types); a choice anchors it
 *   AC-08  "have the element picker come up to map the page if confused": a gig fill that could not place a part brings the picker up
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);
const SG = require(CG('src/autofill/suggest.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

const FORM = `<!doctype html><meta charset="utf-8"><body style="font:14px sans-serif;margin:20px">
<label>Email <input id="em" name="email" type="email"></label><br><br>
<textarea id="n1" placeholder="Name your package"></textarea> <textarea id="n2" placeholder="Name your package"></textarea>
<script>
// a React-like controlled box: it keeps its own state from input events and puts it back on the element
document.querySelectorAll('textarea').forEach(function (t) { t._state = ''; t.addEventListener('input', function () { t._state = t.value; }); });
</script></body>`;

(async () => {
  console.log('\n⬡  the page reader, and a chip under each input\n');
  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - AC SKIPPED (engine): ${e.message.split('\n')[0]}`); }
  const DA = require(CG('src/dom/archaeology.js'));
  const arch = (page) => { const a = Object.create(DA.prototype); a.sse = { emit: () => {} }; a.picks = new Map(); a._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/edit' }); return a; };

  if (browser) await test('AC-01', 'no reader, or the query-only one: queried as an array and filled — the full reader goes on first', async () => {
    for (const pre of [null, 'light']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(FORM));
      if (pre) await page._eval(`window.__cgDomMesh = { query: function (s) { return []; } };`);   // what the DOM-tree panel leaves
      const a = arch(page);
      const fields = await a.handleQuery({ agentId: 't', selector: 'input, textarea' });
      assert.ok(Array.isArray(fields) && fields.length === 3, `${pre}: ${JSON.stringify(fields).slice(0, 120)}`);
      const n1 = fields.find(f => f.id_attr === 'n1' || (f.attrs && f.attrs.id === 'n1')) || fields[1];
      const m = await a.handleMutate({ agentId: 't', cgId: n1.id, mutation: { value: 'Starter' } });
      assert.ok(!m || !m.error, JSON.stringify(m));
      assert.deepStrictEqual(await page.evaluate(() => [document.getElementById('n1').value, document.getElementById('n1')._state]), ['Starter', 'Starter'], 'the page saw the input');
      await page.close();
    }
    const G = require(CG('src/autofill/gig.js'));
    const r = await G.fillGig({ handleQuery: async () => undefined }, { title: 'I will x', tags: [], description: 'd', packages: {}, faq: [], requirements: [] });
    assert.match(r.error, /could not be read/, 'never "domFields must be the dom_query array" again');
  });

  await test('AC-02', 'combine: profile and gig per field, best first; a {{template}} is not offered', () => {
    const out = SG.combine({ profileName: 'Work',
      profileMatches: [{ cgId: 'a', fieldType: 'email', value: 'j@x.com', confidence: 'high' }, { cgId: 'b', fieldType: 'cover', value: 'Hi {{company}}', confidence: 'medium', needsEdit: true }],
      gigMatches: [{ cgId: 'c', key: 'basic.name', value: 'Starter', confidence: 'medium' }, { cgId: 'a', key: 'x', value: 'other', confidence: 'low' }] });
    const a = out.find(x => x.cgId === 'a');
    assert.deepStrictEqual(a.options.map(o => [o.value, o.source]), [['j@x.com', 'profile'], ['other', 'gig']]);
    assert.strictEqual(a.options[0].label, 'email · Work');
    assert.ok(!out.some(x => x.cgId === 'b'), 'template not offered');
    assert.strictEqual(out.find(x => x.cgId === 'c').options[0].label, 'gig · basic.name');
  });

  if (browser) await test('AC-03', 'the reporter says where the fields are and when they change — never a suggested value', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(FORM));
    const a = arch(page); const fields = await a.handleQuery({ agentId: 't', selector: 'input, textarea' });
    await page._eval(`window.__sent = []; window.__cg = { send: function (c, d) { window.__sent.push([c, d]); } };`);
    await page._eval(SG.reporterScript(fields.map(f => f.id)));
    await page.waitForTimeout(150);
    let sent = await page.evaluate(() => window.__sent);
    const rects = sent.filter(s => s[0] === 'autofill:rects').pop()[1];
    assert.strictEqual(rects.length, 3);
    assert.ok(rects.every(r => Number.isFinite(r.x) && Number.isFinite(r.y) && r.v === ''), JSON.stringify(rects[0]));
    await page._eval(`var t = document.createElement('input'); t.name = 'phone'; document.body.appendChild(t);`);
    await page.waitForTimeout(150);
    sent = await page.evaluate(() => window.__sent);
    assert.ok(sent.some(s => s[0] === 'autofill:stale'), 'a new field is said');
    assert.ok(!JSON.stringify(sent).includes('Starter'), 'no suggested value ever reaches the page');
    await page.close();
  });

  if (browser) await test('AC-04', 'in Clear Glass, browser.html: chips under the fields; none where the value is there; ▾ options; a click fills', async () => {
    const { initScript } = require(CG('src/driver/cg-stub.js'));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(initScript({ answers: { 'providers.list': [], 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {},
      'autofill.suggest': { ok: true, script: '1', suggestions: [
        { cgId: 'cg-1', options: [{ value: 'j@x.com', preview: 'j@x.com', label: 'email · Work', source: 'profile', confidence: 'high' }] },
        { cgId: 'cg-2', options: [{ value: 'Starter', preview: 'Starter', label: 'gig · basic.name', source: 'gig', confidence: 'medium' }, { value: 'Basic', preview: 'Basic', label: 'name · Work', source: 'profile', confidence: 'low' }] },
        { cgId: 'cg-3', options: [{ value: 'Plus', preview: 'Plus', label: 'gig · standard.name', source: 'gig', confidence: 'medium' }] }] },
      'autofill.fillOne': { ok: true } } }));
    await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const wv = document.getElementById('wv');
      wv.executeJavaScript = () => Promise.resolve(true); wv.getZoomFactor = () => 1;
      wv.getBoundingClientRect = () => ({ left: 100, top: 80, right: 1200, bottom: 780, width: 1100, height: 700 });
    });
    await page.evaluate(() => window.CGAutofillChips.refresh());
    await page.waitForTimeout(100);
    await page.evaluate(() => { const ev = new Event('ipc-message'); ev.channel = 'autofill:rects';
      ev.args = [[{ cgId: 'cg-1', x: 20, y: 40, w: 200, v: '' }, { cgId: 'cg-2', x: 20, y: 120, w: 200, v: '' }, { cgId: 'cg-3', x: 260, y: 120, w: 200, v: 'Plus' }]];
      document.getElementById('wv').dispatchEvent(ev); });
    const chips = await page.evaluate(() => [...document.querySelectorAll('#af-chips .af-chip')].map(c => [c.dataset.cg, c.querySelector('.af-fill').textContent.trim(), c.style.left, c.style.top, !!c.querySelector('.af-more')]));
    assert.deepStrictEqual(chips, [['cg-1', '⚡ j@x.com', '120px', '122px', false], ['cg-2', '⚡ Starter', '120px', '202px', true]], JSON.stringify(chips));
    await page.evaluate(() => document.querySelector('#af-chips .af-chip[data-cg="cg-2"] .af-more').click());
    assert.deepStrictEqual(await page.evaluate(() => [...document.querySelectorAll('#af-chips .af-opt em')].map(e => e.textContent)), ['gig · basic.name', 'name · Work']);
    await page.evaluate(() => document.querySelectorAll('#af-chips .af-opt')[1].click());
    await page.waitForTimeout(100);
    const call = await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'autofill.fillOne').pop());
    assert.deepStrictEqual(call.args, ['t', 'cg-2', 'Basic']);
    await page.close();
  });

  if (browser) await test('AC-05', 'the suggest backend over a real page: the gig\'s boxes and the profile email, with the reporter', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(FORM));
    const Bridge = require(CG('src/ipc/bridge.js'));
    const gig = { title: 'I will build it', tags: [], description: 'd', faq: [], requirements: [], packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 }, standard: { name: 'Plus', description: 'two', price: 60, deliveryDays: 5 } } };
    const profile = { id: 'p1', name: 'Work', fields: { email: 'j@x.com', fullName: 'James Brooks' } };
    const store = { getLastGig: () => gig, getProfile: (id) => (id === 'p1' ? profile : null), listProfiles: () => [profile], activeProfile: () => ({ ok: true, profile, profileId: 'p1' }) };
    const self = { dom: arch(page), autofillStore: store, _learnedFields: () => ({}) };
    const r = await Bridge.prototype._autofillSuggest.call(self, { agentId: 't' });
    assert.ok(r.ok, JSON.stringify(r));
    const byVal = r.suggestions.map(s => s.options[0].value).sort();
    assert.ok(byVal.includes('Starter') && byVal.includes('Plus'), JSON.stringify(r.suggestions));
    assert.ok(r.suggestions.some(s => s.options.some(o => o.value === 'j@x.com')), 'the profile email: ' + JSON.stringify(r.suggestions) + ' ' + r.why);
    assert.match(r.script, /autofill:rects/);
    await page.close();
  });

  if (browser) await test('AC-06', 'a field nothing placed has a ⚓ with its key; anchored as email it is learned and offered; as a gig part, kept', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(FORM + '<input name="contact_address_x" id="odd">'));
    const Bridge = require(CG('src/ipc/bridge.js'));
    const profile = { id: 'p1', name: 'Work', fields: { email: 'j@x.com', name: 'James Brooks' } };
    const store = { getLastGig: () => null, getProfile: (id) => (id === 'p1' ? profile : null), listProfiles: () => [profile], activeProfile: () => ({ ok: true, profile, profileId: 'p1' }) };
    const kv = new Map(); const siteSettings = { set: (u, k, v) => { kv.set(k, v); return true; }, getAllForOrigin: () => Object.fromEntries(kv) };
    const a = arch(page);
    const self = { dom: a, autofillStore: store, siteSettings, driver: { _getWebContents: () => ({ getURL: () => 'https://jobs.example/apply' }), exec: async () => { throw new Error('no readPage here'); } } };
    for (const m of ['_learnedFields', '_pageUrl', '_autofillSuggest', '_autofillAnchor']) self[m] = Bridge.prototype[m].bind(self);
    let r = await self._autofillSuggest({ agentId: 't' });
    const odd = r.unmapped.find(u => u.key === 'odd');   // chooseKey: the id, the first stable unique name
    assert.ok(odd, JSON.stringify(r.unmapped));
    assert.ok(r.mapTo.profile.includes('email') && r.mapTo.profile.includes('name'), JSON.stringify(r.mapTo));
    assert.ok(!r.suggestions.some(x => x.cgId === odd.cgId));
    const an = await self._autofillAnchor({ agentId: 't', cgId: odd.cgId, kind: 'profile', value: 'email' });
    assert.ok(an.ok && an.key === 'odd' && an.stable, JSON.stringify(an));
    assert.strictEqual(kv.get('autofill.field.odd'), 'email', 'learned for the site (JA3 key)');
    r = await self._autofillSuggest({ agentId: 't' });
    assert.ok(r.suggestions.some(x => x.cgId === odd.cgId && x.options.some(o => o.value === 'j@x.com')), 'now offered: ' + JSON.stringify(r.suggestions));
    assert.ok(!r.unmapped.some(u => u.cgId === odd.cgId), 'no longer a ⚓');
    assert.match((await self._autofillAnchor({ agentId: 't', cgId: odd.cgId, kind: 'profile', value: 'not-a-type' })).error, /not a field type/);
    // a gig part anchored by its cgId: the same selector-making as Point at it, kept as the part's target
    const n2 = (await a.handleQuery({ agentId: 't', selector: 'textarea' }))[1];
    const ga = await Bridge.prototype._gigAssign.call({ driver: { _getWebContents: () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/edit' }) } }, { page: 'pricing', part: 'standard.name', cgId: n2.id });
    assert.ok(ga.ok, JSON.stringify(ga));
    assert.strictEqual(await page.evaluate((sel) => { const n = document.querySelectorAll(sel); return n.length === 1 && n[0] === document.querySelectorAll('textarea')[1]; }, ga.selector), true);
    await page.close();
  });

  if (browser) await test('AC-07', 'in Clear Glass: the ⚓ chip lists what the field can be; a choice anchors it', async () => {
    const { initScript } = require(CG('src/driver/cg-stub.js'));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.addInitScript(initScript({ answers: { 'providers.list': [], 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {},
      'autofill.suggest': { ok: true, script: '1', suggestions: [], unmapped: [{ cgId: 'cg-9', key: 'contact_address_x' }], mapTo: { profile: ['email', 'name'], gig: ['basic.name'], page: 'pricing' } },
      'autofill.anchor': { ok: true } } }));
    await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const wv = document.getElementById('wv'); wv.executeJavaScript = () => Promise.resolve(true); wv.getZoomFactor = () => 1;
      wv.getBoundingClientRect = () => ({ left: 0, top: 80, right: 1200, bottom: 780, width: 1200, height: 700 }); });
    await page.evaluate(() => window.CGAutofillChips.refresh()); await page.waitForTimeout(100);
    await page.evaluate(() => { const ev = new Event('ipc-message'); ev.channel = 'autofill:rects'; ev.args = [[{ cgId: 'cg-9', x: 20, y: 40, w: 200, v: '' }]]; document.getElementById('wv').dispatchEvent(ev); });
    assert.strictEqual(await page.evaluate(() => document.querySelector('#af-chips .af-anchor .af-more').textContent), '⚓');
    await page.evaluate(() => document.querySelector('#af-chips .af-anchor .af-more').click());
    const opts = await page.evaluate(() => [...document.querySelectorAll('#af-chips .af-opt')].map(b => [b.dataset.anchor, b.dataset.val]));
    assert.deepStrictEqual(opts, [['gig', 'basic.name'], ['profile', 'email'], ['profile', 'name']]);
    await page.evaluate(() => document.querySelectorAll('#af-chips .af-opt')[1].click());
    await page.waitForTimeout(100);
    assert.deepStrictEqual((await page.evaluate(() => window.__cgCalls.filter(c => c.key === 'autofill.anchor').pop())).args, ['t', 'cg-9', 'profile', 'email']);
    await page.close();
  });

  if (browser) await test('AC-08', 'a gig fill that could not place a part brings the element picker up for it, by itself', async () => {
    const { initScript } = require(CG('src/driver/cg-stub.js'));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const gig = { title: 'I will build it', tags: [], description: 'd', faq: [], requirements: [], packages: { basic: { name: 'Starter', description: 'one', price: 30, deliveryDays: 3 } } };
    await page.addInitScript(`try { localStorage.setItem('cg.gig.last', ${JSON.stringify(JSON.stringify(gig))}); } catch (_) {}`);
    await page.addInitScript(initScript({ answers: { 'providers.list': [], 'toolbar.commands': [], 'bookmarks.list': [], 'plugins.list': [], 'options.get': {},
      'autofill.gigFill': { page: 'pricing', filled: [], dropdowns: [], learned: [], failed: [], notFound: [{ key: 'basic.description', why: 'not found on the page' }] } } }));
    await page.goto(require('url').pathToFileURL(CG('renderer/browser.html')).href + '?agentId=t');
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__pickerClicks = 0; document.getElementById('picker-btn').addEventListener('click', () => window.__pickerClicks++, true); });
    await page.evaluate(() => { document.getElementById('btn-gig').click(); document.getElementById('gig-fill').click(); });
    await page.waitForTimeout(900);
    assert.strictEqual(await page.evaluate(() => window.__pickerClicks), 1, 'the picker came up');
    assert.strictEqual(await page.evaluate(() => typeof window.__cgOnNextPick), 'function', 'the next pick goes to basic.description');
    assert.match(await page.evaluate(() => document.getElementById('gig-write-status').textContent), /basic\.description/);
    await page.close();
  });

  if (browser) try { await browser.close(); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
