'use strict';
/**
 * clear-glass/src/main/glass-frame.js — a Clear Glass title bar over a window that shows someone else's page (GF1, CW1 built)
 * comp_id: clear-glass.main.glass-frame
 * Map: docs/2026-10-26-glass-frame-phasemap.spec
 *
 * James, 2026-10-26, with a screenshot of the ChatGPT sign-in window in its Windows frame: "alsO I CANT OPEN dev console in a popup window.
 * also the popup windows need to match the rest of the ui." Earlier, 2026-10-15: "can you make all pop ups from clear glass look like this"
 * (the dark Settings window), and 0.60.45: "popup windows in clearglass should look nice like the browser, borderless windowed."
 *
 * Why a frame of two views: a page Clear Glass does not own cannot be given a title bar, and a BrowserWindow's own page always fills it
 * (its contentView is not the page; tried in Electron 42 under xvfb, 2026-10-26: the page stays full height). So the window is a
 * frameless BaseWindow holding two WebContentsViews: the bar (renderer/glass-frame.html, the Settings title bar's look, 34 px) and the
 * site below it. A window.open popup keeps its opener (Electron's createWindow hands the guest in; tried: window.opener holds, and the
 * site's window.close() closes the frame), so "Continue with Google" works as before.
 *
 * frame(opts) returns a GlassWindow: the part of BrowserWindow's API Clear Glass calls on these windows (webContents, show, hide, focus,
 * close, destroy, isDestroyed, isVisible, isFocused, loadURL, setTitle, getTitle, setSkipTaskbar, removeMenu, on/once), so a caller swaps
 * a BrowserWindow construction for `frame(o)` and nothing else changes. all() lists the live ones (BrowserWindow.getAllWindows() does not).
 *
 * devToolsKeys(contents): F12, Ctrl+Shift+I and Ctrl+Shift+J open that page's DevTools, detached. Once per contents. The menu that carried
 * Electron's own shortcut is removed from every popup (CS1, 0.60.54), which is why the dev console could not be opened in one.
 */
const path = require('path');
const { EventEmitter } = require('events');

const BAR = 34;
const BG = '#08080d';
const PAGE = path.join(__dirname, '..', '..', 'renderer', 'glass-frame.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'glass-frame.js');
const _live = new Set();
const _byBar = new Map();   // bar webContents id → GlassWindow
const _keyed = new WeakSet();

function _el() { return require('electron'); }

/** isDevToolsKey(input) — F12, Ctrl+Shift+I, Ctrl+Shift+J (and Cmd+Alt+I on a Mac) */
function isDevToolsKey(input = {}) {
  if (!input || input.type !== 'keyDown') return false;
  const k = String(input.key || '').toLowerCase();
  return !!(k === 'f12' || ((input.control || input.meta) && input.shift && (k === 'i' || k === 'j')) || (input.meta && input.alt && k === 'i'));
}

function toggleDevTools(wc) {
  if (!wc || wc.isDestroyed()) return false;
  if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode: 'detach' });
  return true;
}

/** devToolsKeys(contents, target?) — the keys open target's DevTools (target defaults to contents itself). Once per contents. */
function devToolsKeys(contents, target = null) {
  if (!contents || _keyed.has(contents) || typeof contents.on !== 'function') return false;
  _keyed.add(contents);
  contents.on('before-input-event', (event, input) => {
    if (!isDevToolsKey(input)) return;
    event.preventDefault();
    toggleDevTools(target || contents);
  });
  return true;
}

function _host(u) { try { return new URL(u).host; } catch (_) { return ''; } }

class GlassWindow extends EventEmitter {
  constructor(opts = {}, guest = null) {
    super();
    const { BaseWindow, WebContentsView } = _el();
    const o = { ...opts };
    this.base = new BaseWindow({
      width: o.width || 1100, height: o.height || 800, ...(o.x != null ? { x: o.x } : {}), ...(o.y != null ? { y: o.y } : {}),
      minWidth: o.minWidth || 420, minHeight: o.minHeight || 300, frame: false, backgroundColor: BG, title: o.title || 'Clear Glass',
      show: o.show !== false, skipTaskbar: !!o.skipTaskbar, ...(o.parent ? { parent: o.parent } : {}),
    });
    this._title = o.title || '';
    this.bar = new WebContentsView({ webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    this.bar.setBackgroundColor(BG);
    // the site: a popup's guest as Chromium made it (opener kept), or a new page with the caller's webPreferences
    this.site = guest ? new WebContentsView(guest) : new WebContentsView({ webPreferences: { ...(o.webPreferences || {}) } });
    this.site.setBackgroundColor(BG);
    this.webContents = this.site.webContents;
    this.base.contentView.addChildView(this.site);
    this.base.contentView.addChildView(this.bar);
    this._layout();
    for (const ev of ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen']) this.base.on(ev, () => { this._layout(); this._state(); });
    _live.add(this); _byBar.set(this.bar.webContents.id, this);
    this.base.on('closed', () => {
      _live.delete(this); _byBar.delete(this.bar.webContents.id);
      try { if (!this.webContents.isDestroyed()) this.webContents.close(); } catch (_) {}
      try { if (!this.bar.webContents.isDestroyed()) this.bar.webContents.close(); } catch (_) {}
    });
    // the page closed itself (an OAuth popup's window.close()): the frame goes with it
    this.webContents.on('destroyed', () => { try { if (!this.base.isDestroyed()) this.base.destroy(); } catch (_) {} });
    for (const ev of ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'devtools-opened', 'devtools-closed']) this.webContents.on(ev, () => this._state());
    this.webContents.on('page-title-updated', (_e, t) => { try { if (!this.base.isDestroyed()) this.base.setTitle(t || this._title || 'Clear Glass'); } catch (_) {} });
    devToolsKeys(this.webContents);
    devToolsKeys(this.bar.webContents, this.webContents);   // F12 with the bar focused is still the page's DevTools
    this.bar.webContents.loadFile(PAGE).catch(() => {});
  }
  _layout() {
    if (this.base.isDestroyed()) return;
    const b = this.base.getContentBounds();
    const full = this.base.isFullScreen && this.base.isFullScreen();
    const h = full ? 0 : BAR;
    this.bar.setBounds({ x: 0, y: 0, width: b.width, height: h });
    this.site.setBounds({ x: 0, y: h, width: b.width, height: Math.max(0, b.height - h) });
  }
  state() {
    const wc = this.webContents; const alive = wc && !wc.isDestroyed();
    return { title: (alive && wc.getTitle()) || this._title || 'Clear Glass', host: alive ? _host(wc.getURL()) : '',
      canGoBack: !!(alive && wc.navigationHistory && wc.navigationHistory.canGoBack()), devtools: !!(alive && wc.isDevToolsOpened()),
      maximized: !this.base.isDestroyed() && this.base.isMaximized() };
  }
  _state() { try { if (!this.bar.webContents.isDestroyed()) this.bar.webContents.send('glass-frame:state', this.state()); } catch (_) {} }
  control(action) {
    const wc = this.webContents, b = this.base;
    if (b.isDestroyed()) return { ok: false };
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'reload') wc.reload();
    else if (action === 'devtools') toggleDevTools(wc);
    else if (action === 'minimize') b.minimize();
    else if (action === 'maximize') { if (b.isMaximized()) b.unmaximize(); else b.maximize(); }
    else if (action === 'close') b.close();
    this._state();
    return { ok: true, ...this.state() };
  }
  // the BrowserWindow calls Clear Glass makes on these windows
  isDestroyed() { return this.base.isDestroyed(); }
  show() { if (!this.base.isDestroyed()) this.base.show(); }
  hide() { if (!this.base.isDestroyed()) this.base.hide(); }
  focus() { if (!this.base.isDestroyed()) { this.base.focus(); try { this.webContents.focus(); } catch (_) {} } }
  close() { if (!this.base.isDestroyed()) this.base.close(); }
  destroy() { if (!this.base.isDestroyed()) this.base.destroy(); }
  isVisible() { return !this.base.isDestroyed() && this.base.isVisible(); }
  isFocused() { return !this.base.isDestroyed() && this.base.isFocused(); }
  isMinimized() { return !this.base.isDestroyed() && this.base.isMinimized(); }
  restore() { if (!this.base.isDestroyed()) this.base.restore(); }
  loadURL(url, o) { return this.webContents.loadURL(url, o); }
  setTitle(t) { this._title = String(t || ''); if (!this.base.isDestroyed()) this.base.setTitle(this._title); this._state(); }
  getTitle() { return this.base.isDestroyed() ? '' : this.base.getTitle(); }
  setSkipTaskbar(v) { if (!this.base.isDestroyed()) this.base.setSkipTaskbar(!!v); }
  removeMenu() { /* a frameless window has no menu */ }
  setBackgroundColor() { /* the frame is always the Clear Glass dark */ }
  getBounds() { return this.base.getBounds(); }
  setBounds(b) { this.base.setBounds(b); }
  get id() { return this.base.id; }
  // window events go to the window; 'ready-to-show' and 'page-title-updated' are the page's
  on(ev, fn) {
    if (ev === 'ready-to-show') { this.webContents.once('did-finish-load', fn); return this; }
    if (ev === 'page-title-updated') { this.webContents.on(ev, fn); return this; }
    this.base.on(ev, fn); return this;
  }
  once(ev, fn) {
    if (ev === 'ready-to-show') { this.webContents.once('did-finish-load', fn); return this; }
    if (ev === 'page-title-updated') { this.webContents.once(ev, fn); return this; }
    this.base.once(ev, fn); return this;
  }
  removeListener(ev, fn) { try { this.base.removeListener(ev, fn); } catch (_) {} try { this.webContents.removeListener(ev, fn); } catch (_) {} return this; }
}

/** frame(opts) → a GlassWindow (opts: width, height, x, y, minWidth, minHeight, title, show, skipTaskbar, parent, webPreferences) */
function frame(opts = {}) { return new GlassWindow(opts); }

/** fromOpen(options) — for setWindowOpenHandler's createWindow: the popup Chromium made (opener kept), in a frame; returns its webContents */
function fromOpen(options = {}) {
  const w = new GlassWindow({ width: options.width, height: options.height, x: options.x, y: options.y, show: options.show !== false }, options);
  return w.webContents;
}

function all() { return [..._live].filter(w => !w.isDestroyed()); }
function forWebContents(wc) { return all().find(w => w.webContents === wc || w.bar.webContents === wc) || null; }

/** the bar's buttons (ipcMain: electron's) */
function registerIpc(ipcMain) {
  ipcMain.handle('glass-frame:control', (e, action) => {
    const w = _byBar.get(e.sender.id);
    if (!w) return { ok: false };
    if (action === 'state') { w._state(); return { ok: true, ...w.state() }; }
    return w.control(action);
  });
}

module.exports = { BAR, BG, PAGE, isDevToolsKey, toggleDevTools, devToolsKeys, frame, fromOpen, all, forWebContents, registerIpc, GlassWindow };
