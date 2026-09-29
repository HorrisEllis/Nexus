'use strict';
/**
 * clear-glass/src/main/compartment-window.js — idearium's pop-out pages as COS-compartment windows. §0.39.280.
 *
 * James: "can you have the electron popup windows for the desktop envirement and settings, be in a borderless
 * windowed and possible a manipulatable cos compartment so i can drag it around and resize it? keep the theme
 * consistent."
 *
 * Idearium runs inside a Clear Glass <webview allowpopups>. Its window.open() of /desktop.html (a repo's VM) and
 * /settings.html (the settings console) used to get Electron's default child window: OS frame, File/Edit/View menu,
 * light chrome. Here every <webview>'s popups go through setWindowOpenHandler; the two idearium pages open as:
 *   frameless, dark (#0a0b10 before the first paint), resizable from every edge, a minimum size, no menu bar,
 *   the size window.open asked for, and a small preload (preload/compartment-window.js) that gives the page's own
 *   title bar minimize / maximize / close. Dragging is the page's title bar (-webkit-app-region: drag).
 * Every other popup keeps Electron's default — nothing else changes.
 *
 * Pure parts (isCompartmentPage, parseFeatures, windowOptions) are exported for tests.
 */
const path = require('path');

const PAGES = { '/desktop.html': 'desktop', '/settings.html': 'settings' };
const BG = '#0a0b10';

/** Which compartment page a URL is ('desktop' | 'settings'), or null. Only http(s) on a loopback host. */
function isCompartmentPage(url) {
  let u; try { u = new URL(url); } catch (_) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  if (!/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return null;
  return PAGES[u.pathname] || null;
}

/** window.open's features string → {width, height, left, top} (numbers only; anything else ignored). */
function parseFeatures(features) {
  const out = {};
  for (const part of String(features || '').split(',')) {
    const [k, v] = part.split('=').map(s => (s || '').trim().toLowerCase());
    const n = Number(v);
    if (['width', 'height', 'left', 'top'].includes(k) && Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

function windowOptions(kind, features, preloadPath) {
  const f = parseFeatures(features);
  const o = {
    width: Math.max(f.width || (kind === 'desktop' ? 1320 : 1280), 480),
    height: Math.max(f.height || (kind === 'desktop' ? 860 : 900), 320),
    minWidth: 480, minHeight: 320,
    frame: false, resizable: true, movable: true, hasShadow: true,
    backgroundColor: BG, autoHideMenuBar: true, show: true,
    title: kind === 'desktop' ? 'Repo desktop' : 'Settings console',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
  };
  if (Number.isFinite(f.left)) o.x = f.left;
  if (Number.isFinite(f.top)) o.y = f.top;
  return o;
}

const PRELOAD = path.join(__dirname, '../preload/compartment-window.js');

/** Route one webContents' popups (call from app 'web-contents-created'). */
function attach(contents) {
  if (!contents || typeof contents.setWindowOpenHandler !== 'function') return false;
  if (contents.getType && contents.getType() !== 'webview') return false;
  contents.setWindowOpenHandler(({ url, features }) => {
    const kind = isCompartmentPage(url);
    if (!kind) return { action: 'allow' };
    return { action: 'allow', overrideBrowserWindowOptions: windowOptions(kind, features, PRELOAD) };
  });
  contents.on('did-create-window', (win, { url }) => {
    if (!isCompartmentPage(url)) return;
    try { win.removeMenu(); } catch (_) {}
  });
  return true;
}

/** The window controls the preload asks for. ipcMain: electron's; BrowserWindow: to find the sender's window. */
function registerIpc(ipcMain, BrowserWindow) {
  ipcMain.handle('compartment-window:control', (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (action === 'close') win.close();
    else if (action === 'pin') win.setAlwaysOnTop(!win.isAlwaysOnTop());
    return { ok: true, maximized: win.isMaximized(), pinned: win.isAlwaysOnTop() };
  });
}

module.exports = { isCompartmentPage, parseFeatures, windowOptions, attach, registerIpc, PAGES };
