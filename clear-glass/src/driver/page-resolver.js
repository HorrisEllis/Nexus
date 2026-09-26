'use strict';
/**
 * clear-glass/src/driver/page-resolver.js — the ONE place that turns an agentId into the webContents of the
 * page the agent lives in. 2026-09-19.
 *
 * Replaces three broken copies (driver, archaeology, and the mesh's workaround for them). They all
 *  (1) matched only the top-level window by title, so a <webview> guest (where spawned agent tabs put the
 *      chat page) was unreachable, and
 *  (2) fell back to getFocusedWebContents() || all[0]: an unmatched agentId would type into WHATEVER PAGE
 *      WAS FOCUSED. For a tool that pastes whole code bases into chat boxes, that is unacceptable.
 * This resolver fails LOUDLY instead: it throws an Error whose `.stage` is 'no_window' or 'no_webview'.
 */
function mkErr(stage, message) { const e = new Error(message); e.stage = stage; return e; }
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (_) { return ''; } };

function createPageResolver({ electron } = {}) {
  const el = electron || require('electron');
  function resolve(agentId, { preferUrl = null } = {}) {
    if (!agentId) throw mkErr('no_window', 'agentId is required');
    const all = el.webContents.getAllWebContents();
    let win = null;
    for (const wc of all) {
      try { const w = el.BrowserWindow.fromWebContents(wc); if (w && !w.isDestroyed() && String(w.getTitle()).includes(agentId)) { win = w; break; } } catch (_) {}
    }
    if (!win) throw mkErr('no_window', `no window for agent ${agentId}`);
    const host = preferUrl ? hostOf(preferUrl) : null;
    const guests = all.filter((g) => { try { return g.getType() === 'webview' && g.hostWebContents === win.webContents && !g.isDestroyed(); } catch (_) { return false; } });
    const real = guests.filter((g) => { const u = g.getURL(); return u && u !== 'about:blank'; });
    const pick = (host && real.find((g) => hostOf(g.getURL()) === host)) || real[0] || guests[0];
    if (pick) return pick;
    const own = win.webContents;                               // the page may be loaded directly in the window
    if (own && !own.isDestroyed() && (!host || hostOf(own.getURL()) === host)) {
      const u = own.getURL();
      if (u && u !== 'about:blank' && !/browser\.html/.test(u)) return own;
    }
    throw mkErr('no_webview', `window found for ${agentId} but it has no ${host || 'chat'} webview`);
  }
  return { resolve };
}
module.exports = { createPageResolver, mkErr };
