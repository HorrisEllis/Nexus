'use strict';
/**
 * clear-glass/src/ipc/handler-registry.js — every ipcMain.handle channel, reachable by name from outside the renderer.
 * comp_id: clear-glass.ipc.handler-registry
 * UUID: cg-ipc-handler-registry-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "so he can do everything clearglass can do?" Measured on 0.39.271: 172 ipcMain.handle channels,
 * 46 /cli/* HTTP routes. What the Clear Glass window can do and copilot could not was everything in the difference —
 * window control, settings writes, the login portal, plugin commands, custom agents, selector assignment, the error
 * log, opening a download, WebExtensions, recording, workflows fed from the UI…
 *
 * Writing 125 more routes by hand would be 125 more places to drift from the handler they copy. Instead this records
 * each handler as it is registered (install() wraps ipcMain.handle once, before any channel exists) and
 * /cli/invoke (ipc/agent-routes.js) calls the SAME function the renderer's ipcRenderer.invoke reaches: one
 * implementation, a second door (the rule every /cli route here already follows).
 *
 * THE EVENT. A handler gets (event, ...args). Most never read the event. The few that do read event.sender (the
 * window that asked). invoke() builds a stand-in whose sender is that agent's own window webContents (by title, the
 * way the page resolver finds windows), or null — a handler that needs a sender and gets none throws, and the error
 * is returned, never a silent success.
 *
 * DENIED, by name, with the reason (I2 — nothing reveals or writes a secret on an agent's behalf):
 *   accounts:portal:credentials — saves a username/password; that stays James's hand in the Accounts window.
 * No channel returns a decrypted password (passwords:list is the public shape: origin, username, dates).
 */

const MODULE_ID = 'clear-glass.ipc.handler-registry';
const VERSION = '1.0.0';

const _handlers = new Map();   // channel → fn
let _installed = false;

const DENIED = Object.freeze({
  'accounts:portal:credentials': 'saves a login secret — James enters credentials himself in the Accounts window',
});

// Grouping for the listing: the prefix before the first ':' (or the whole name).
const groupOf = (ch) => (ch.includes(':') ? ch.split(':')[0] : ch);

function install(ipcMain) {
  if (_installed || !ipcMain || typeof ipcMain.handle !== 'function') return false;
  const real = ipcMain.handle.bind(ipcMain);
  const realRemove = typeof ipcMain.removeHandler === 'function' ? ipcMain.removeHandler.bind(ipcMain) : null;
  ipcMain.handle = (channel, fn) => { _handlers.set(channel, fn); return real(channel, fn); };
  if (realRemove) ipcMain.removeHandler = (channel) => { _handlers.delete(channel); return realRemove(channel); };
  _installed = true;
  return true;
}

/** register(channel, fn) — for tests and for handlers registered before install() (none in 0.39.272). */
function register(channel, fn) { _handlers.set(channel, fn); }

function list() {
  return [..._handlers.keys()].sort().map(channel => ({ channel, group: groupOf(channel), denied: !!DENIED[channel], ...(DENIED[channel] ? { reason: DENIED[channel] } : {}) }));
}

function _senderFor(agentId, electron) {
  if (!agentId) return null;
  try {
    const el = electron || require('electron');
    const win = el.BrowserWindow.getAllWindows().find(w => { try { return !w.isDestroyed() && String(w.getTitle()).includes(agentId); } catch (_) { return false; } });
    return win ? win.webContents : null;
  } catch (_) { return null; }
}

/**
 * invoke(channel, args, { agentId, timeoutMs, electron }) → { ok, channel, result } | { ok:false, error, denied? }
 * args: an array (spread as the handler's arguments after the event) or one value (the single argument).
 */
async function invoke(channel, args, { agentId = null, timeoutMs = 30000, electron = null } = {}) {
  if (!channel) return { ok: false, error: 'channel required — GET /cli/invoke lists them' };
  if (DENIED[channel]) return { ok: false, denied: true, channel, error: `"${channel}" is not available to agents: ${DENIED[channel]}` };
  const fn = _handlers.get(channel);
  if (!fn) return { ok: false, channel, error: `no handler "${channel}" — GET /cli/invoke lists the ${_handlers.size} that exist` };
  const list = Array.isArray(args) ? args : args === undefined ? [] : [args];
  const sender = _senderFor(agentId, electron);
  const event = { sender, senderFrame: null, returnValue: undefined, _nexusInvoke: true, agentId };
  let t;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => fn(event, ...list)),
      new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`"${channel}" did not finish within ${timeoutMs}ms`)), timeoutMs); }),
    ]);
    return { ok: !(result && result.ok === false), channel, result: result === undefined ? null : result };
  } catch (e) {
    return { ok: false, channel, error: e.message, ...(sender ? {} : /sender|webContents|getURL|executeJavaScript/i.test(e.message) ? { hint: 'this channel needs the asking window — pass agentId of an open Clear Glass window' } : {}) };
  } finally { clearTimeout(t); }
}

function _reset() { _handlers.clear(); }

module.exports = { MODULE_ID, VERSION, DENIED, install, register, list, invoke, groupOf, _reset };
