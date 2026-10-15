'use strict';
// SM-06 (0.60.54 CS2): the merged section RENDERS (jsdom, stubbed cg): provider panes with tab controls, the startup pane, and the mesh half. No Playwright (AXIOMS 4.1).
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer');
const html = fs.readFileSync(path.join(root, 'settings.html'), 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + root + '/settings.html', pretendToBeVisual: true });
const w = dom.window;
const data = {
  'portal.providers': [{ id: 'claude', name: 'Claude', color: '#d97757' }, { id: 'chatgpt', name: 'ChatGPT', color: '#10a37f' }],
  'accounts.list': [{ id: 'a1', label: 'Default — claude', agentKeys: ['claude'], createdAt: 1 }, { id: 'a2', label: 'ChatGPT 1', agentKeys: ['chatgpt'], createdAt: 2 }],
  'providers.list': [{ id: 'claude', name: 'Claude', url: 'https://claude.ai', running: false }, { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', running: true, status: 'injected' }],
  'mesh.list': { registry: [{ id: 'claude', name: 'Claude', url: 'https://claude.ai' }], agents: [], queueDepth: 0 },
  'options.get': { autoStartOnBoot: {} },
};
function mk(p) { return new Proxy(function () {}, { get: (_t, k) => k === 'then' ? undefined : mk(p ? p + '.' + String(k) : String(k)), apply: (_t, _s, a) => { const k = p; const key = Object.keys(data).find(x => k.endsWith(x)); return Promise.resolve(key ? data[key] : (k.endsWith('defaults') ? {} : k.endsWith('status') ? { ok: true, liveCookies: 3, session: {}, vault: {} } : [])); } }); }
w.ClearGlass = mk(""); w.cg = w.ClearGlass;
w.fetch = async () => ({ ok: true, json: async () => ({ routes: [], nodes: [], jobs: [] }), text: async () => '' });
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
w.CSS = w.CSS || { escape: s => s };
const errs = []; w.addEventListener('error', e => errs.push(e.message));
for (const f of ['settings/core.js', 'settings/sections/accounts.js', 'settings/sections/providers.js', 'settings/sections/mesh.js']) { try { w.eval(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { errs.push(f + ': ' + e.message); } }
(async () => {
  try { w.CGS.boot && w.CGS.boot(); } catch (e) { errs.push('boot: ' + e.message); }
  await new Promise(r => setTimeout(r, 800));
  const main = w.document.getElementById('main');
  const txt = main.textContent;
  const ok = /Claude/.test(txt) && main.querySelectorAll('.tabctl').length === 2 && !!main.querySelector('.half-title') && /Startup/.test(txt) && /Running now/.test(txt) && /Try a dispatch/.test(txt) && !errs.length;
  console.log(ok ? '  PASS SM-06 the merged section renders: 2 provider tab controls, startup, mesh half, no errors' : '  FAIL SM-06 ' + JSON.stringify({ errs, len: txt.length }));
  console.log(ok ? '1 passed, 0 failed' : '0 passed, 1 failed');
  process.exit(ok ? 0 : 1);
})();
