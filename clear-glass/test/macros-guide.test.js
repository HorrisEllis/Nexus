'use strict';
// MG-01..03 (0.60.58): Settings > Macros shows the step-by-step guide, the hotkey-toast switch saves macroRecordToast. jsdom + stubbed cg (AXIOMS 4.1).
const { JSDOM } = require('jsdom'); const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..', 'renderer');
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const w = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + root + '/settings.html', pretendToBeVisual: true }).window;
const sets = [];
const cg = new Proxy({}, { get: (_t, k) => k === 'macros' ? { list: async () => ({ macros: [] }), schema: async () => ({ actions: ['click'], erosActions: [], profiles: [] }) }
  : k === 'options' ? { get: async () => ({ macroRecordToast: true }), set: async (p) => { sets.push(p); return { ok: true }; } }
  : new Proxy(function () {}, { get: () => () => Promise.resolve([]), apply: () => Promise.resolve([]) }) });
w.ClearGlass = cg; w.cg = cg; w.fetch = async () => ({ ok: true, json: async () => ({}) }); w.CSS = w.CSS || { escape: s => s };
for (const f of ['settings/core.js', 'settings/sections/macros.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
let pass = 0, fail = 0; const t = (n, ok, d) => { if (ok) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + ' ' + (d || '')); } };
(async () => {
  w.location.hash = '#macros'; w.CGS.boot(); await new Promise(r => setTimeout(r, 600));
  const main = w.document.getElementById('main');
  const items = main.querySelectorAll('details ol li');
  t('MG-01 the guide has seven steps and is open when there are no macros yet', items.length === 7 && main.querySelector('details').open, String(items.length));
  t('MG-02 it names Record, Stop, a {{placeholder}} and the hotkey', /Press Record/.test(main.textContent) && /Press Stop/.test(main.textContent) && /\{\{placeholder\}\}|\{\{search\}\}/.test(main.textContent) && /Alt\+Shift\+R/.test(main.textContent));
  const tog = main.querySelector('.tog'); tog.click(); await new Promise(r => setTimeout(r, 300));
  t('MG-03 the toast switch saves macroRecordToast=false', sets.length === 1 && sets[0].macroRecordToast === false, JSON.stringify(sets));
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
