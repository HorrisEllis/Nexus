'use strict';
/**
 * tests/modules/test-compartment-window.test.js — §0.39.280. James: "can you have the electron popup windows for the
 * desktop envirement and settings, be in a borderless windowed and possible a manipulatable cos compartment so i can
 * drag it around and resize it? keep the theme consistent."
 *   CW-0x  clear-glass/src/main/compartment-window.js: which popups are compartment windows, their options, the
 *          webview wiring (fake webContents) and the window controls (fake ipcMain / BrowserWindow)
 *   CW-1x  the pages: both carry js/window-chrome.js and are dark whatever the OS scheme
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const CW = require(path.join(ROOT, 'clear-glass/src/main/compartment-window.js'));
let passed = 0, failed = 0;
function t(id, name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}
console.log('\n  test-compartment-window.test.js');

t('CW-01', 'only idearium\'s /desktop.html and /settings.html on loopback are compartment windows', () => {
  assert.strictEqual(CW.isCompartmentPage('http://127.0.0.1:4800/desktop.html?repo=x'), 'desktop');
  assert.strictEqual(CW.isCompartmentPage('http://localhost:4800/settings.html'), 'settings');
  assert.strictEqual(CW.isCompartmentPage('https://evil.example/desktop.html'), null);
  assert.strictEqual(CW.isCompartmentPage('http://127.0.0.1:4800/index.html'), null);
  assert.strictEqual(CW.isCompartmentPage('file:///C:/desktop.html'), null);
  assert.strictEqual(CW.isCompartmentPage('not a url'), null);
});

t('CW-02', 'frameless, dark before the first paint, resizable, the size window.open asked for, a minimum, the small preload', () => {
  const o = CW.windowOptions('desktop', 'width=1320,height=860,left=40', '/p.js');
  assert.deepStrictEqual([o.frame, o.resizable, o.movable, o.backgroundColor, o.width, o.height, o.x, o.minWidth], [false, true, true, '#0a0b10', 1320, 860, 40, 480]);
  assert.deepStrictEqual([o.webPreferences.preload, o.webPreferences.contextIsolation, o.webPreferences.nodeIntegration], ['/p.js', true, false]);
  assert.strictEqual(CW.windowOptions('settings', 'width=10', '/p').width, 480, 'never below the minimum');
  assert.deepStrictEqual(CW.parseFeatures('width=abc, height=900, menubar=no'), { height: 900 });
});

t('CW-03', 'a webview\'s popups: compartment pages get the options, every other popup Electron\'s default; the menu removed', () => {
  let handler = null; const ev = {};
  const wc = { getType: () => 'webview', setWindowOpenHandler: (h) => { handler = h; }, on: (n, f) => { ev[n] = f; } };
  assert.strictEqual(CW.attach(wc), true);
  const r = handler({ url: 'http://127.0.0.1:4800/settings.html', features: 'width=1280,height=900' });
  assert.strictEqual(r.action, 'allow');
  assert.strictEqual(r.overrideBrowserWindowOptions.frame, false);
  assert.match(r.overrideBrowserWindowOptions.webPreferences.preload, /preload[\\/]compartment-window\.js$/);
  assert.ok(fs.existsSync(r.overrideBrowserWindowOptions.webPreferences.preload));
  assert.deepStrictEqual(handler({ url: 'https://github.com/x', features: '' }), { action: 'allow' });
  let removed = 0; ev['did-create-window']({ removeMenu: () => removed++ }, { url: 'http://127.0.0.1:4800/desktop.html' });
  ev['did-create-window']({ removeMenu: () => removed++ }, { url: 'https://github.com/' });
  assert.strictEqual(removed, 1);
  assert.strictEqual(CW.attach({ getType: () => 'window', setWindowOpenHandler() {}, on() {} }), false, 'the app\'s own windows are left alone');
});

t('CW-04', 'the window controls act on the SENDER\'s window: minimize, maximize ↔ restore, keep on top, close', () => {
  let h = null; const ipc = { handle: (ch, f) => { assert.strictEqual(ch, 'compartment-window:control'); h = f; } };
  const st = { max: false, top: false, min: 0, closed: 0 };
  const win = { isDestroyed: () => false, minimize: () => st.min++, isMaximized: () => st.max, maximize: () => { st.max = true; }, unmaximize: () => { st.max = false; },
    close: () => st.closed++, isAlwaysOnTop: () => st.top, setAlwaysOnTop: (v) => { st.top = v; } };
  const sender = {};
  CW.registerIpc(ipc, { fromWebContents: (wc) => (wc === sender ? win : null) });
  h({ sender }, 'minimize'); assert.strictEqual(st.min, 1);
  assert.strictEqual(h({ sender }, 'maximize').maximized, true);
  assert.strictEqual(h({ sender }, 'maximize').maximized, false);
  assert.strictEqual(h({ sender }, 'pin').pinned, true);
  h({ sender }, 'close'); assert.strictEqual(st.closed, 1);
  assert.deepStrictEqual(h({ sender: {} }, 'close'), { ok: false });
  const main = fs.readFileSync(path.join(ROOT, 'clear-glass/src/main/index.js'), 'utf8');
  assert.match(main, /CompartmentWindow\.attach\(contents\)/);
  assert.match(main, /CompartmentWindow\.registerIpc\(ipcMain, BrowserWindow\)/);
});

t('CW-10', 'both pages carry the compartment title bar and are NEXUS-dark whatever the OS scheme', () => {
  for (const [f, kind] of [['settings.html', 'settings'], ['desktop.html', 'desktop']]) {
    const s = fs.readFileSync(path.join(ROOT, 'idearium/ui', f), 'utf8');
    assert.ok(s.includes(`<script src="js/window-chrome.js" data-kind="${kind}"`), f);
    assert.ok(!/prefers-color-scheme: light/.test(s), `${f} has no light theme`);
    assert.match(s, /var\(--chrome-h/);
  }
  const c = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/window-chrome.js'), 'utf8');
  assert.match(c, /-webkit-app-region:drag/);
  assert.match(c, /window\.nexusWindow/);
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
