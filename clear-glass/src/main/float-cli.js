'use strict';
/**
 * clear-glass/src/main/float-cli.js — the floating CLI's own window (BS6, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-FLOAT-CLI.
 * comp_id: cg.main.float-cli
 *
 * James, 2026-10-21: "make a beautiful cli like the floating menu button 3-way cli. isolated from the dom, i dont want any screen recording
 * to be able to see anything but the dom,"
 * The CLI is NOT put into the page. It is a child window of the browser window, in its own renderer process, so no page script and no
 * site's session-replay recorder can read it; and the window has content protection, so the OS leaves it out of screen capture and
 * screen recording (SetWindowDisplayAffinity WDA_EXCLUDEFROMCAPTURE on Windows 10 2004+, NSWindow sharingType none on macOS). Linux has no
 * such API: there the window works and is visible to capture, and the CLI says so. A recording shows the page; the CLI is not in it.
 *   attach(parentWin, { agentId }) → { toggle(), state(), destroy() }       one per browser window, made on first use
 *   register({ ipcMain, BrowserWindow })                                    the IPC: floatcli:toggle | size | hide | nav | url
 * Sizes: the round button alone (collapsed), or the panel (open). It sits at the parent's lower right and follows it.
 */
const path = require('path');

const FAB = { width: 76, height: 76 };
const PANEL = { width: 460, height: 600 };
const MARGIN = 18;
const byParent = new Map();   // parent BrowserWindow id → controller
const byChild = new Map();    // float webContents id → controller

function attach(parentWin, { agentId, BrowserWindow = require('electron').BrowserWindow, preload, file, platform = process.platform, log = console.warn } = {}) {
  if (byParent.has(parentWin.id)) return byParent.get(parentWin.id);
  let win = null, expanded = true, visible = false, url = '';
  const protectedOk = platform === 'win32' || platform === 'darwin';

  function place() {
    if (!win || win.isDestroyed() || parentWin.isDestroyed()) return;
    const b = parentWin.getContentBounds(); const s = expanded ? PANEL : FAB;
    win.setBounds({ x: Math.round(b.x + b.width - s.width - MARGIN), y: Math.round(b.y + b.height - s.height - MARGIN), width: s.width, height: s.height });
  }
  function make() {
    win = new BrowserWindow({
      parent: parentWin, frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, hasShadow: false, show: false, backgroundColor: '#00000000', title: 'Clear Glass CLI',
      webPreferences: { preload: preload || path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
    });
    // GATE-BSH-ISOLATED: protection is on BEFORE the window is ever shown, so not one frame of it reaches a capture
    try { win.setContentProtection(true); } catch (e) { log(`[float-cli] content protection not set: ${e.message}`); }
    win.loadFile(file || path.join(__dirname, '../../renderer/float-cli.html'), { query: { agentId: String(agentId || 'default'), protected: protectedOk ? '1' : '0', platform } });
    byChild.set(win.webContents.id, ctl);
    win.on('closed', () => { byChild.delete(win && win.webContents ? win.webContents.id : -1); win = null; visible = false; });
    place();
  }
  const follow = () => place();
  parentWin.on('move', follow); parentWin.on('resize', follow);
  parentWin.on('minimize', () => { if (win && !win.isDestroyed()) win.hide(); });
  parentWin.on('restore', () => { if (win && visible) win.showInactive(); });
  parentWin.on('closed', () => destroy());

  function show() { if (!win || win.isDestroyed()) make(); expanded = true; place(); visible = true; win.once('ready-to-show', () => win.show()); if (win.webContents && !win.webContents.isLoading()) win.show(); win.webContents.send('floatcli:state', { open: true, expanded, url }); }
  function hide() { if (win && !win.isDestroyed()) win.hide(); visible = false; notifyParent(); }
  function notifyParent() { try { if (!parentWin.isDestroyed()) parentWin.webContents.send('floatcli:state', { open: visible }); } catch (_) {} }
  function toggle() { visible ? hide() : show(); notifyParent(); return { ok: true, open: visible, protected: protectedOk }; }
  function size(isExpanded) { expanded = !!isExpanded; place(); return { ok: true, expanded }; }
  function nav(op, u) { if (!parentWin.isDestroyed()) parentWin.webContents.send('floatcli:nav', { op, url: u }); return { ok: true }; }
  function setUrl(u) { url = String(u || ''); if (win && !win.isDestroyed()) win.webContents.send('floatcli:state', { url }); }
  function destroy() { byParent.delete(parentWin.id); if (win && !win.isDestroyed()) win.destroy(); win = null; }
  const ctl = { toggle, hide, size, nav, setUrl, destroy, state: () => ({ open: visible, expanded, protected: protectedOk, url }), window: () => win };
  byParent.set(parentWin.id, ctl);
  return ctl;
}

function register({ ipcMain, BrowserWindow = require('electron').BrowserWindow, attachOpts = () => ({}) } = {}) {
  const parentOf = (e) => { const w = BrowserWindow.fromWebContents(e.sender); return w && (w.getParentWindow && w.getParentWindow()) ? null : w; };
  ipcMain.handle('floatcli:toggle', (e) => {
    const p = parentOf(e); if (!p) return { ok: false, error: 'no browser window to float over' };
    return attach(p, { BrowserWindow, ...attachOpts(p) }).toggle();
  });
  ipcMain.handle('floatcli:size', (e, d = {}) => { const c = byChild.get(e.sender.id); return c ? c.size(d.expanded) : { ok: false, error: 'not a floating CLI' }; });
  ipcMain.handle('floatcli:hide', (e) => { const c = byChild.get(e.sender.id); if (c) c.hide(); return { ok: !!c }; });
  ipcMain.handle('floatcli:nav', (e, d = {}) => {
    const c = byChild.get(e.sender.id); if (!c) return { ok: false, error: 'not a floating CLI' };
    if (!['go', 'back', 'forward', 'reload'].includes(d.op)) return { ok: false, error: 'op must be go, back, forward or reload' };
    return c.nav(d.op, d.url);
  });
  ipcMain.on('floatcli:url', (e, d = {}) => { const p = BrowserWindow.fromWebContents(e.sender); const c = p && byParent.get(p.id); if (c) c.setUrl(d.url); });
}

module.exports = { attach, register, FAB, PANEL, _byParent: byParent };
