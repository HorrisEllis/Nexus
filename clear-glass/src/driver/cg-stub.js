'use strict';
/**
 * clear-glass/src/driver/cg-stub.js — a stand-in window.ClearGlass for driving Clear Glass's own pages in its engine (glass.js) without the
 * Electron main process (BS 0.60.179 tests). Built from the preload's real namespace list, so a page that checks "is cg.x there" finds it.
 *   initScript({ answers, record }) → a string for page.addInitScript: every call returns answers['ns.fn'] (or {}), and is recorded in
 *   window.__cgCalls when record is true. Test-only; never loaded by the app.
 */
const fs = require('fs');
const path = require('path');

function names() {
  const s = fs.readFileSync(path.join(__dirname, '../preload/index.js'), 'utf8');
  const ns = {};
  for (const m of s.matchAll(/^  (\w+): \{([\s\S]*?)^  \},?$/gm)) ns[m[1]] = [...m[2].matchAll(/^    (\w+)\s*:/gm)].map(x => x[1]);
  return { ns, fns: [...s.matchAll(/^  (\w+):\s*(?:async\s*)?\(/gm)].map(m => m[1]) };
}

function initScript({ answers = {}, record = true } = {}) {
  const { ns, fns } = names();
  return `(() => {
    const answers = ${JSON.stringify(answers)}; window.__cgCalls = [];
    const call = (key, args) => { ${record ? 'window.__cgCalls.push({ key, args });' : ''} const a = answers[key]; return Promise.resolve(a === undefined ? {} : JSON.parse(JSON.stringify(a))); };
    const fn = (n, k) => (...args) => (/^on[A-Z]/.test(k) ? () => {} : call(n + '.' + k, args));
    const cg = {}; const NS = ${JSON.stringify(ns)};
    for (const n of Object.keys(NS)) { cg[n] = {}; for (const k of NS[n]) cg[n][k] = fn(n, k); }
    for (const f of ${JSON.stringify(fns)}) cg[f] = (...args) => (/^(on|off|once)$/.test(f) ? undefined : call(f, args));
    window.ClearGlass = cg;
  })();`;
}

module.exports = { initScript, names };
