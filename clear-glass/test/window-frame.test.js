'use strict';
// WF-01..05 (0.60.54 CS1): every Clear Glass window that is not the main browser is dark, or says why it is not.
const fs = require('fs'), path = require('path'), assert = require('assert');
const F = require('../src/main/window-frame.js'), C = require('../src/main/compartment-window.js');
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); pass++; console.log('  PASS ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + ': ' + e.message); } };
t('WF-01 a popup keeps the OS frame, is dark, has no menu bar', () => { const o = F.popupOptions('width=500,height=700', 'x'); assert.strictEqual(o.backgroundColor, '#08080d'); assert.strictEqual(o.autoHideMenuBar, true); assert.notStrictEqual(o.frame, false); assert.strictEqual(o.width, 500); });
t('WF-02 popup size from window.open is honoured, junk is ignored', () => { const o = F.popupOptions('width=abc,height=10,left=3'); assert.ok(!('width' in o) && !('height' in o)); });
t('WF-03 withDark never overrides what a caller chose', () => { assert.strictEqual(F.withDark({ backgroundColor: '#fff' }).backgroundColor, '#fff'); assert.strictEqual(F.withDark({}).backgroundColor, '#08080d'); });
t('WF-04 the app theme is set to dark', () => { const nt = {}; assert.ok(F.setAppTheme(nt)); assert.strictEqual(nt.themeSource, 'dark'); });
t('WF-05 the compartment handler gives a non-idearium popup the dark options, and an idearium page its own', () => {
  let h; const contents = { getType: () => 'window', setWindowOpenHandler: (f) => { h = f; }, on() {} };
  assert.ok(C.attach(contents));
  // §GF1 0.60.258 — a site's popup is a Glass frame (createWindow) where Electron has BaseWindow; the dark options are its fallback
  const pop = h({ url: 'https://accounts.google.com/', features: '' });
  assert.ok(typeof pop.createWindow === 'function' || pop.overrideBrowserWindowOptions.backgroundColor === '#08080d');
  assert.strictEqual(h({ url: 'http://127.0.0.1:4800/settings.html', features: '' }).overrideBrowserWindowOptions.frame, false);
});
// the window census: a `new BrowserWindow(` outside this list must be added here with a reason, not left on Electron's light default
const OK = { 'src/main/index.js': 'main window, settings, library, background tabs: frameless dark (own chrome); deeplink windows use withDark', 'src/providers/host.js': 'hidden provider window; dark base set', 'src/accounts/login-portal.js': 'sign-in window; dark base set', 'src/driver/glass-host/main.js': 'test driver host, never shown to the person' };
t('WF-06 every `new BrowserWindow` is in the census', () => {
  const hits = []; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && !/pre-userscripts/.test(e.name) && /new (this\.)?BrowserWindow\(/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(path.join(__dirname, '..'), p).replace(/\\/g, '/')); });
  walk(path.join(__dirname, '..', 'src')); const extra = hits.filter(h => !OK[h]); assert.deepStrictEqual(extra, [], `unlisted window(s): ${extra}`);
});
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
