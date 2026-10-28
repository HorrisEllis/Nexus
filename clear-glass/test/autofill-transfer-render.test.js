'use strict';
// AT3 (0.60.256): Settings → Autofill RENDERS "Your autofill data" (jsdom, stubbed cg, the settings-merge-render pattern; no Playwright,
// AXIOMS 4.1): Export saves <date>.autofill, the Fiverr gig template saves gig-template.gig, both typed application/octet-stream so
// nothing adds an extension. James, 2026-10-26: "i want to be able to import and export the data. have a download template button just
// the fiverr gigs, also fix it so its .gig not .gig.json."
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + root + '/settings.html#autofill', pretendToBeVisual: true });
const w = dom.window;
const data = {
  'autofill.listProfiles': [{ id: 'p1', label: 'Main', fields: { 'given-name': 'James', email: 'j@example.com' }, createdAt: 1 }],
  'autofill.learned': { ok: true, learned: [] },
  'autofill.exportAll': { ok: true, text: 'format: clearglass.autofill/1\n', filename: 'autofill-2026-10-26.autofill', counts: { profiles: 1, learned: 0, gig: 0 } },
  'autofill.gigTemplate': { ok: true, text: '# gig\n', filename: 'gig-template.gig' },
  'api.get': {},
};
function mk(p) { return new Proxy(function () {}, { get: (_t, k) => k === 'then' ? undefined : mk(p ? p + '.' + String(k) : String(k)), apply: () => { const key = Object.keys(data).find(x => p.endsWith(x)); return Promise.resolve(key ? data[key] : []); } }); }
w.ClearGlass = mk(''); w.cg = w.ClearGlass;
w.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
w.CSS = w.CSS || { escape: s => s };
const saved = [];
const types = new Map();
const RealBlob = w.Blob;
w.Blob = function (parts, opts) { const b = new RealBlob(parts, opts); types.set(b, opts && opts.type); return b; };
w.URL.createObjectURL = (b) => { const u = `blob:${saved.length}`; types.set(u, types.get(b)); return u; };
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { saved.push({ name: this.download, type: types.get(this.href) }); };
const errs = []; w.addEventListener('error', e => errs.push(e.message));
for (const f of ['settings/core.js', 'settings/sections/autofill.js']) { try { w.eval(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { errs.push(f + ': ' + e.message); } }
(async () => {
  try { w.CGS.boot && w.CGS.boot(); } catch (e) { errs.push('boot: ' + e.message); }
  await new Promise(r => setTimeout(r, 800));
  const main = w.document.getElementById('main');
  const buttons = [...main.querySelectorAll('button')];
  const find = (t) => buttons.find(b => b.textContent.trim() === t);
  const want = ['Export autofill data', 'Import a file…', 'Undo the last import', 'Download Fiverr gig template'];
  const missing = want.filter(t => !find(t));
  if (!missing.length) { find('Export autofill data').click(); find('Download Fiverr gig template').click(); await new Promise(r => setTimeout(r, 200)); }
  const pane = /Your autofill data/.test(main.textContent);
  const first = main.querySelector('.pane, section, [class*="pane"]');
  const ok = pane && !missing.length && !errs.length
    && saved.length === 2 && saved[0].name === 'autofill-2026-10-26.autofill' && saved[1].name === 'gig-template.gig'
    && saved.every(s => s.type === 'application/octet-stream')
    && !!find('Download template');   // the Fiverr gigs pane keeps its own template button
  console.log(ok ? '  PASS AT-UI Your autofill data renders: Export, Import, Undo, the Fiverr gig template; files saved as .autofill and .gig, typed octet-stream'
    : '  FAIL AT-UI ' + JSON.stringify({ pane, missing, errs, saved, first: first && first.textContent.slice(0, 80) }));
  console.log(ok ? '1 passed, 0 failed' : '0 passed, 1 failed');
  process.exit(ok ? 0 : 1);
})();
