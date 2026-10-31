'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autofill-page-chip-glass.test.js — AC1 (0.60.336), driven in Clear Glass (glass.js), never Playwright (CG-001b).
 * James, 2026-10-31: "autofill and have the chip show automatically"
 *
 * The page-level "Autofill this page" pill (#af-page in autofill-inline.js) appears on its own when the page has fillable fields,
 * fills them all on click (cg.autofill.fill(null, agentId) — the same path the right-click item uses), and hides when nothing is fillable:
 *   AP-01  with 2 fillable fields the pill shows, with the count "2"
 *   AP-02  clicking it calls cg.autofill.fill(null, agentId) and the pill goes to its "ok" state
 *   AP-03  when every field already holds its value, no pill is shown (nothing to fill)
 */
const fs = require('fs'); const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'clear-glass/src/driver/glass.js'));
const JS = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass/renderer/autofill-inline.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'clear-glass/renderer/autofill-inline.css'), 'utf8');

let p = 0, f = 0;
const t = (id, d, ok) => { if (ok) { console.log(`  ✓ ${id} ${d}`); p++; } else { console.error(`  ✗ ${id} ${d}`); f++; } };

// the window around the webview: a full-window #wv with the methods autofill-inline.js uses, and a stub window.cg whose suggest()
// offers a value for two fields. fillCalled records the fill-all call. The page only ever reports where its fields are (rects).
const SETUP = (css) => {
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const wv = document.createElement('div'); wv.id = 'wv';
  wv.style.cssText = 'position:fixed;inset:0;'; document.body.appendChild(wv);
  wv.getZoomFactor = () => 1;
  wv.executeJavaScript = () => Promise.resolve(true);
  window.__fill = { calls: [] };
  const SUGG = { suggestions: [
      { cgId: 'name', options: [{ value: 'James Brooks', label: 'Full name', preview: 'James Brooks' }] },
      { cgId: 'email', options: [{ value: 'james@example.com', label: 'Email', preview: 'james@example.com' }] },
    ], unmapped: [], mapTo: { profile: [], gig: [] }, script: '1', why: null };
  window.cg = { autofill: {
    suggest: async () => SUGG,
    fill: async (profileId, agentId) => { window.__fill.calls.push({ profileId, agentId }); return { filled: ['name', 'email'] }; },
    fillOne: async () => ({ ok: true }), anchor: async () => ({ ok: true }),
  } };
  return true;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let b;
  try {
    b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1000, height: 700 } });
    await pg.goto('data:text/html,<body></body>');
    await pg.evaluate(SETUP, CSS);
    await pg.evaluate(JS);            // the IIFE wires itself to the stubbed #wv and window.cg

    // AP-01 — refresh (gets the suggestions), then the page reports two fillable fields; the pill appears with "2"
    const shown = await pg.evaluate(async () => {
      await window.CGAutofillChips.refresh();
      const wv = document.getElementById('wv');
      // the real renderer gets rects via an Electron ipc-message event with .channel/.args — synthesize it:
      const ev = new Event('ipc-message'); ev.channel = 'autofill:rects';
      ev.args = [[{ cgId: 'name', x: 80, y: 120, w: 260, v: '' }, { cgId: 'email', x: 80, y: 190, w: 260, v: '' }]];
      wv.dispatchEvent(ev);
      const el = document.getElementById('af-page');
      return { show: el.classList.contains('show'), n: (el.querySelector('.afp-n') || {}).textContent, state: window.__cgAutofillPage };
    });
    t('AP-01', 'the pill shows automatically with the fillable count "2"',
      shown.show && shown.n === '2' && shown.state && shown.state.shown && shown.state.count === 2);

    // AP-02 — click it: cg.autofill.fill(null, agentId) is called, the pill goes to its ok state
    const filled = await pg.evaluate(async () => {
      document.querySelector('#af-page .afp-fill').click();
      return true;
    });
    await sleep(120);
    const after = await pg.evaluate(() => ({ calls: window.__fill.calls, cls: document.getElementById('af-page').className }));
    t('AP-02', 'clicking fills the page (fill(null, agentId)) and the pill shows ok',
      filled && after.calls.length === 1 && after.calls[0].profileId === null && /\bok\b/.test(after.cls));

    // AP-03 — a page where both fields already hold their value: no pill (nothing to fill).
    // Wait past the 1400ms ok-state reset (fillPage's setTimeout) so pageBusy is clear and the count alone decides.
    await sleep(1500);
    const none = await pg.evaluate(async () => {
      await window.CGAutofillChips.refresh();
      const wv = document.getElementById('wv');
      const ev = new Event('ipc-message'); ev.channel = 'autofill:rects';
      ev.args = [[{ cgId: 'name', x: 80, y: 120, w: 260, v: 'James Brooks' }, { cgId: 'email', x: 80, y: 190, w: 260, v: 'james@example.com' }]];
      wv.dispatchEvent(ev);
      const el = document.getElementById('af-page');
      return { show: el.classList.contains('show'), html: el.innerHTML };
    });
    t('AP-03', 'when every field already holds its value, no pill is shown', !none.show && none.html === '');

    await pg.close();
  } catch (e) { console.error('  ✗ harness:', e.message, e.stack); f++; }
  finally { try { await b.close(); } catch (_) {} }
  console.log(`\n  ${p} passed, ${f} failed`);
  process.exitCode = f ? 1 : 0;
})();
