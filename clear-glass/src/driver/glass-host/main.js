'use strict';
/**
 * clear-glass/src/driver/glass-host/main.js — Clear Glass's engine, run as a page host for glass.js.
 * UUID: nexus-clear-glass-glass-host-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.263 — James: "playright? no what is that for? litterally have clearglas".
 * Started by clear-glass/src/driver/glass.js as `electron main.js` (headless on
 * Linux via --ozone-platform=headless). It opens windows on request and drives
 * each one through its own webContents.debugger — the DevTools protocol, spoken
 * in-process, no remote-debugging port, no Playwright.
 *
 * Wire (one JSON object per line, lines prefixed "§G " on stdout so Chromium's
 * own logging can never be mistaken for a reply). Without a display (GLASS_OFFSCREEN=1,
 * set by glass.js together with --ozone-platform=headless) windows render offscreen —
 * a shown window under the headless ozone platform segfaults Electron 42:
 *   in : { id, op:'open', width, height }            -> { id, result:{ page } }
 *        { id, op:'cdp', page, method, params }       -> { id, result } | { id, error }
 *        { id, op:'close', page }                     -> { id, result:true }
 *        { op:'quit' }  (or stdin closing)            -> the app exits
 *   out: { event:{ page, method, params } }           every DevTools event of every page
 */
const { app, BrowserWindow } = require('electron');

const pages = new Map();
let seq = 0;
const out = (o) => process.stdout.write('§G ' + JSON.stringify(o) + '\n');

app.on('window-all-closed', () => {});   // pages come and go; the host lives until told to quit

async function handle(msg) {
  const { id, op } = msg;
  try {
    if (op === 'open') {
      const win = new BrowserWindow({
        width: msg.width || 1280, height: msg.height || 800, show: true, paintWhenInitiallyHidden: true,
        webPreferences: { offscreen: process.env.GLASS_OFFSCREEN === '1', backgroundThrottling: false, sandbox: true, contextIsolation: true },
      });
      const page = 'p' + (++seq);
      const dbg = win.webContents.debugger;
      dbg.attach('1.3');
      dbg.on('message', (_e, method, params) => out({ event: { page, method, params } }));
      win.on('closed', () => pages.delete(page));
      pages.set(page, win);
      await win.loadURL('about:blank');
      return out({ id, result: { page } });
    }
    if (op === 'cdp') {
      const win = pages.get(msg.page);
      if (!win) throw new Error(`no page ${msg.page}`);
      if (msg.method === 'Glass.setSize') { win.setContentSize(msg.params.width, msg.params.height); return out({ id, result: {} }); }
      const result = await win.webContents.debugger.sendCommand(msg.method, msg.params || {});
      return out({ id, result: result || {} });
    }
    if (op === 'close') {
      const win = pages.get(msg.page);
      if (win && !win.isDestroyed()) win.destroy();
      pages.delete(msg.page);
      return out({ id, result: true });
    }
    if (op === 'quit') return app.exit(0);
    throw new Error(`unknown op ${op}`);
  } catch (e) { out({ id, error: e.message || String(e) }); }
}

app.whenReady().then(() => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => {
    buf += c;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (_) { continue; }
      handle(msg);
    }
  });
  process.stdin.on('end', () => app.exit(0));
  out({ ready: true, electron: process.versions.electron, chrome: process.versions.chrome });
});
