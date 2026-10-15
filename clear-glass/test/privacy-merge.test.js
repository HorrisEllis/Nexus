'use strict';
// PM-01..05 (0.60.58): Privacy, Site settings and Browser fingerprint are one Settings page ("Privacy & sites"). jsdom + stubbed cg (AXIOMS 4.1).
const { JSDOM } = require('jsdom'); const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const w = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + root + '/settings.html', pretendToBeVisual: true }).window;
const cg = new Proxy({}, { get: (_t, k) => k === 'passwords' ? { list: async () => [] }
  : k === 'siteSettings' ? { listOrigins: async () => ['example.com'], getAll: async () => ({}) }
  : new Proxy(function () {}, { get: () => () => Promise.resolve([]), apply: () => Promise.resolve([]) }) });
w.ClearGlass = cg; w.cg = cg; w.fetch = async () => ({ ok: true, json: async () => ({}) }); w.CSS = w.CSS || { escape: s => s };
for (const f of ['settings/core.js', 'settings/sections/privacy.js', 'settings/sections/sites.js', 'settings/sections/fingerprint.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
let pass = 0, fail = 0; const t = (n, ok, d) => { if (ok) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (d || '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  w.location.hash = '#sites'; w.CGS.boot(); await wait(700);
  const main = w.document.getElementById('main'); const txt = main.textContent;
  const rail = [...w.document.querySelectorAll('.rail-item')].map(b => b.textContent);
  t('PM-01 the rail has one entry, "Privacy & sites", and none for the two merged parts', rail.some(x => /Privacy & sites/.test(x)) && !rail.some(x => /Site settings|Browser fingerprint/.test(x)), rail.join('|'));
  t('PM-02 an old #sites link opens the merged page', /Privacy & sites/.test(main.querySelector('h1').textContent), main.querySelector('h1').textContent);
  t('PM-03 all three parts are on the page, in order: passwords, then sites, then fingerprint', ['Saved passwords', 'Defaults', 'No tabs open'].every(s => txt.includes(s)) && txt.indexOf('Saved passwords') < txt.indexOf('Defaults'), txt.slice(0, 120));
  t('PM-04 the "Open Site settings" pointer pane is gone (it linked the same data)', !/Open Site settings/.test(txt));
  t('PM-05 each part keeps its stylesheet scope', w.document.body.dataset.areas.split(' ').sort().join() === 'fingerprint,privacy,sites' && !!main.querySelector('[data-anchor="sites"]') && !!main.querySelector('[data-anchor="fingerprint"]'), w.document.body.dataset.areas);
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
