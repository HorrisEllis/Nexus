'use strict';

/**
 * ClearDriver — NEXUS sovereign browser automation
 * No Playwright. No Puppeteer. Own the primitives.
 * 
 * Commands arrive as NEXUS bus messages.
 * Results stream back on SSE.
 * All actions are CFR-logged with intent/agent/progress.
 */

const { BrowserWindow, webContents } = require('electron');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.

class ClearDriver {
  constructor({ ctxMgr, dom, vault, sse }) {
    this.ctxMgr = ctxMgr;
    this.dom    = dom;
    this.vault  = vault;
    this.sse    = sse;
    this.queue  = new Map(); // agentId → action queue
  }

  // ── Primary dispatch ──────────────────────────────────────────────────
  async exec(payload) {
    const { action, agentId = 'default', ...args } = payload;
    const execId = uuidv4();

    this.sse.emit('driver.start', { execId, action, agentId, ts: Date.now() });

    let result;
    try {
      result = await this._dispatch(action, agentId, args, execId);
      this.sse.emit('driver.result', { execId, action, agentId, result, ts: Date.now() });
    } catch (err) {
      this.sse.emit('driver.error', { execId, action, agentId, error: err.message, ts: Date.now() });
      throw err;
    }

    return result;
  }

  async _dispatch(action, agentId, args, execId) {
    switch (action) {
      case 'navigate':       return this._navigate(agentId, args);
      case 'click':          return this._click(agentId, args);
      case 'type':           return this._type(agentId, args);
      case 'scroll':         return this._scroll(agentId, args);
      case 'hover':          return this._hover(agentId, args);
      case 'wait':           return this._wait(agentId, args);
      case 'waitFor':        return this._waitFor(agentId, args);
      case 'screenshot':     return this._screenshot(agentId, args);
      case 'toast':          return this._toast(agentId, args);
      case 'eval':           return this._eval(agentId, args);
      case 'zoom':           return this._zoom(agentId, args);
      case 'findInPage':     return this._findInPage(agentId, args);
      case 'stopFindInPage': return this._stopFindInPage(agentId, args);
      case 'print':          return this._print(agentId, args);
      case 'getUrl':         return this._getUrl(agentId);
      case 'getTitle':       return this._getTitle(agentId);
      case 'back':           return this._back(agentId);
      case 'forward':        return this._forward(agentId);
      case 'reload':         return this._reload(agentId);
      case 'cookies.get':    return this._getCookies(agentId, args);
      case 'cookies.set':    return this._setCookie(agentId, args);
      case 'cookies.clear':  return this._clearCookies(agentId, args);
      case 'storage.get':    return this._storageGet(agentId, args);
      case 'storage.set':    return this._storageSet(agentId, args);
      case 'network.block':  return this._networkBlock(agentId, args);
      case 'network.intercept': return this._networkIntercept(agentId, args);
      case 'picker.enable':  return this._enablePicker(agentId);
      case 'picker.disable': return this._disablePicker(agentId);
      case 'inject':         return this._inject(agentId, args);
      case 'record.start':   return this._recordStart(agentId, args);
      case 'record.stop':    return this._recordStop(agentId);
      default:
        throw new Error(`Unknown driver action: ${action}`);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────
  async _navigate(agentId, { url, waitUntil = 'domcontentloaded' }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Navigate timeout')), 30000);

      wc.once('did-finish-load', () => {
        clearTimeout(timeout);
        this.sse.emit('nav.loaded', { agentId, url: wc.getURL(), ts: Date.now() });
        resolve({ url: wc.getURL(), title: wc.getTitle() });
      });

      wc.once('did-fail-load', (e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`Navigation failed: ${desc} (${code})`));
      });

      wc.loadURL(url);
      this.sse.emit('nav.started', { agentId, url, ts: Date.now() });
    });
  }

  // ── Click ─────────────────────────────────────────────────────────────
  async _click(agentId, { selector, x, y, button = 'left', delay = 0 }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    if (selector) {
      // Resolve element position via DOM
      const pos = await this._evalJs(wc, `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width/2, y: r.top + r.height/2 };
        })()
      `);
      if (!pos) throw new Error(`Element not found: ${selector}`);
      x = pos.x; y = pos.y;
    }

    if (x === undefined || y === undefined) throw new Error('selector or x,y required for click');

    // Human-like timing variance
    if (delay > 0) await this._sleep(delay + Math.random() * 50);

    wc.sendInputEvent({ type: 'mouseMove', x, y });
    await this._sleep(30 + Math.random() * 30);
    wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount: 1 });
    await this._sleep(50 + Math.random() * 50);
    wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount: 1 });

    return { clicked: { x, y, selector } };
  }

  // ── Type ──────────────────────────────────────────────────────────────
  async _type(agentId, { selector, text, clearFirst = false, delay = 50 }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    if (selector) await this._click(agentId, { selector });
    if (clearFirst) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
      await this._sleep(50);
    }

    for (const char of text) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: char });
      wc.sendInputEvent({ type: 'char', keyCode: char });
      wc.sendInputEvent({ type: 'keyUp', keyCode: char });
      await this._sleep(delay + Math.random() * 30 - 15);
    }

    return { typed: text.length };
  }

  // ── Scroll ────────────────────────────────────────────────────────────
  async _scroll(agentId, { x = 0, y = 0, deltaX = 0, deltaY = 100 }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX, deltaY, wheelTicksX: 0, wheelTicksY: 1 });
    return { scrolled: { deltaX, deltaY } };
  }

  // ── Hover ─────────────────────────────────────────────────────────────
  async _hover(agentId, { selector, x, y }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    if (selector) {
      const pos = await this._evalJs(wc, `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width/2, y: r.top + r.height/2 };
        })()
      `);
      if (pos) { x = pos.x; y = pos.y; }
    }

    wc.sendInputEvent({ type: 'mouseMove', x: x || 0, y: y || 0 });
    return { hovered: { x, y } };
  }

  // ── Wait ──────────────────────────────────────────────────────────────
  async _wait(agentId, { ms = 1000 }) {
    await this._sleep(ms);
    return { waited: ms };
  }

  async _waitFor(agentId, { selector, timeout = 10000 }) {
    const wc  = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await this._evalJs(wc, `!!document.querySelector(${JSON.stringify(selector)})`);
      if (found) return { found: true, elapsed: Date.now() - start };
      await this._sleep(200);
    }
    throw new Error(`WaitFor timeout: ${selector}`);
  }

  // ── Screenshot ────────────────────────────────────────────────────────
  async _screenshot(agentId, { rect } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    const image = await wc.capturePage(rect);
    const png   = image.toPNG();
    const b64   = png.toString('base64');

    this.sse.emit('driver.screenshot', { agentId, data: b64, ts: Date.now() });
    return { screenshot: b64, format: 'png' };
  }

  // ── Toast ─────────────────────────────────────────────────────────────
  // §BUILT 2026-08-23 — real, visible notification, triggered externally.
  // Reuses window.__cgToast, just exposed in renderer/browser.js — same
  // real _getWebContents()+executeJavaScript pattern _screenshot/_eval
  // already use above, not a new mechanism.
  async _toast(agentId, { msg, type = 'info', durationMs = 3500 } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!msg || typeof msg !== 'string') throw new Error('toast requires a real, non-empty msg string');
    // JSON.stringify each value rather than template-interpolating raw
    // strings into the executeJavaScript code — the real, safe way to
    // cross this boundary without a message containing a quote or
    // backtick breaking out of the generated script.
    const code = `window.__cgToast && window.__cgToast(${JSON.stringify(msg)}, ${JSON.stringify(type)}, ${JSON.stringify(durationMs)})`;
    await this._evalJs(wc, code);
    return { ok: true, agentId, msg, type };
  }

  // ── Eval ──────────────────────────────────────────────────────────────
  async _eval(agentId, { code, worldId }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const result = await this._evalJs(wc, code, worldId);
    return { result };
  }

  // ── Zoom ──────────────────────────────────────────────────────────────
  // §NEW 2026-08-24 — real gap named directly in CLEAR-GLASS-FULL-CHROME-
  // MAP-2026-08-23.md's §8: "Zero real code. Electron's webContents.
  // setZoomFactor() is a real, built-in API this could wire to directly —
  // genuinely small, scoped, buildable gap." Wired here using the ACTUAL
  // native API, not a CSS-transform hack via eval — a real browser zoom
  // (reflows text, respects layout) is a different, correct thing from
  // faking it with `document.body.style.zoom`.
  //   mode: 'set' (factor required), 'in' (+0.1), 'out' (-0.1), 'reset' (1.0)
  // Clamped to Chromium's own real supported range (0.25–5.0, the same
  // bounds Chrome's own UI enforces) — checked directly against
  // Electron's docs before picking these numbers, not guessed.
  async _zoom(agentId, { mode = 'reset', factor } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const ZOOM_MIN = 0.25, ZOOM_MAX = 5.0, ZOOM_STEP = 0.1;
    const current = wc.getZoomFactor();
    let next;
    switch (mode) {
      case 'set':   next = typeof factor === 'number' ? factor : current; break;
      case 'in':    next = current + ZOOM_STEP; break;
      case 'out':   next = current - ZOOM_STEP; break;
      case 'reset': next = 1.0; break;
      default: throw new Error(`Unknown zoom mode: ${mode}`);
    }
    next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    wc.setZoomFactor(next);
    return { agentId, factor: next };
  }

  // ── Find in Page ──────────────────────────────────────────────────────
  // §NEW 2026-08-24 — real gap named in CLEAR-GLASS-FULL-CHROME-MAP-
  // 2026-08-23.md's §5 ('Find in Page' — zero). Electron's real,
  // documented webContents.findInPage() is event-based (results arrive
  // via the 'found-in-page' event, not a return value), not a simple
  // synchronous call like zoom — wrapped in a real Promise here, with a
  // safety timeout in case a page never fires the event (a real
  // defensive measure, not expected normal behavior — Electron's own
  // docs confirm found-in-page fires even for a 0-match search).
  async _findInPage(agentId, { text, forward = true, findNext = false, matchCase = false } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!text) { wc.stopFindInPage('clearSelection'); return { matches: 0, activeMatchOrdinal: 0 }; }
    return new Promise((resolve) => {
      let settled = false;
      const onFound = (event, result) => {
        if (settled) return;
        settled = true;
        wc.removeListener('found-in-page', onFound);
        resolve({ matches: result.matches, activeMatchOrdinal: result.activeMatchOrdinal, requestId: result.requestId });
      };
      wc.on('found-in-page', onFound);
      wc.findInPage(text, { forward, findNext, matchCase });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        wc.removeListener('found-in-page', onFound);
        resolve({ matches: 0, activeMatchOrdinal: 0, timedOut: true });
      }, 5000);
    });
  }

  async _stopFindInPage(agentId, { action = 'clearSelection' } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    wc.stopFindInPage(action);
    return { stopped: true };
  }

  // ── Print ─────────────────────────────────────────────────────────────
  // §NEW 2026-08-24 — real gap named in the same map doc's §5 ('Print' —
  // zero). Electron's real webContents.print() is callback-based, not
  // promise-based natively — wrapped here to match this codebase's own
  // async/await convention everywhere else. silent:false by default (the
  // real OS print dialog opens) — a user cancelling that dialog produces
  // a real, expected 'cancelled' failureReason, treated as a genuine
  // rejection here so a caller can distinguish "printed" from "didn't."
  async _print(agentId, { silent = false, printBackground = true, ...opts } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    return new Promise((resolve, reject) => {
      wc.print({ silent, printBackground, ...opts }, (success, failureReason) => {
        if (success) resolve({ printed: true });
        else reject(new Error(failureReason || 'print failed or was cancelled'));
      });
    });
  }

  // ── URL / Title ───────────────────────────────────────────────────────
  async _getUrl(agentId) {
    const wc = this._getWebContents(agentId);
    return { url: wc?.getURL() || null };
  }

  async _getTitle(agentId) {
    const wc = this._getWebContents(agentId);
    return { title: wc?.getTitle() || null };
  }

  // ── Navigation controls ───────────────────────────────────────────────
  async _back(agentId) {
    const wc = this._getWebContents(agentId);
    if (wc?.canGoBack()) wc.goBack();
    return { ok: true };
  }

  async _forward(agentId) {
    const wc = this._getWebContents(agentId);
    if (wc?.canGoForward()) wc.goForward();
    return { ok: true };
  }

  async _reload(agentId) {
    this._getWebContents(agentId)?.reload();
    return { ok: true };
  }

  // ── Cookies ───────────────────────────────────────────────────────────
  async _getCookies(agentId, { url, name } = {}) {
    const ctx = await this.ctxMgr.ensureContext(agentId);
    const filter = {};
    if (url)  filter.url  = url;
    if (name) filter.name = name;
    const cookies = await ctx.session.cookies.get(filter);
    return { cookies };
  }

  async _setCookie(agentId, { url, name, value, domain, path: p, secure, httpOnly, expirationDate }) {
    const ctx = await this.ctxMgr.ensureContext(agentId);
    await ctx.session.cookies.set({ url, name, value, domain, path: p, secure, httpOnly, expirationDate });
    return { ok: true };
  }

  async _clearCookies(agentId, { url, name } = {}) {
    const ctx = await this.ctxMgr.ensureContext(agentId);
    if (url && name) {
      await ctx.session.cookies.remove(url, name);
    } else {
      await ctx.session.clearStorageData({ storages: ['cookies'] });
    }
    return { ok: true };
  }

  // ── Storage ───────────────────────────────────────────────────────────
  async _storageGet(agentId, { key, type = 'local' }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const result = await this._evalJs(wc, `
      (function() {
        const s = ${type === 'local' ? 'localStorage' : 'sessionStorage'};
        return ${key ? `s.getItem(${JSON.stringify(key)})` : 'Object.fromEntries(Object.entries(s))'};
      })()
    `);
    return { result };
  }

  async _storageSet(agentId, { key, value, type = 'local' }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    await this._evalJs(wc, `
      ${type === 'local' ? 'localStorage' : 'sessionStorage'}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})
    `);
    return { ok: true };
  }

  // ── Network intercept ─────────────────────────────────────────────────
  async _networkBlock(agentId, { patterns = [] }) {
    const ctx = await this.ctxMgr.ensureContext(agentId);
    ctx.session.webRequest.onBeforeRequest({ urls: patterns }, (details, callback) => {
      callback({ cancel: true });
      this.sse.emit('driver.network.blocked', { agentId, url: details.url, ts: Date.now() });
    });
    return { blocked: patterns };
  }

  async _networkIntercept(agentId, { patterns = [], redirectUrl }) {
    const ctx = await this.ctxMgr.ensureContext(agentId);
    ctx.session.webRequest.onBeforeRequest({ urls: patterns }, (details, callback) => {
      this.sse.emit('driver.network.intercepted', { agentId, url: details.url, ts: Date.now() });
      callback(redirectUrl ? { redirectURL: redirectUrl } : {});
    });
    return { intercepting: patterns };
  }

  // ── Element picker ────────────────────────────────────────────────────
  async _enablePicker(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    await this._evalJs(wc, this._pickerScript(agentId));
    return { pickerEnabled: true };
  }

  async _disablePicker(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) return { pickerEnabled: false };
    await this._evalJs(wc, `if (window.__cgPicker) window.__cgPicker.destroy();`);
    return { pickerEnabled: false };
  }

  _pickerScript(agentId) {
    return `
(function() {
  if (window.__cgPicker) window.__cgPicker.destroy();

  const overlay = document.createElement('div');
  overlay.id = '__cg-picker-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;pointer-events:all;';
  document.body.appendChild(overlay);

  const highlight = document.createElement('div');
  highlight.id = '__cg-picker-highlight';
  highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #00f5ff;background:rgba(0,245,255,0.08);transition:all 0.08s;box-shadow:0 0 12px #00f5ff44;';
  document.body.appendChild(highlight);

  const tooltip = document.createElement('div');
  tooltip.id = '__cg-picker-tooltip';
  tooltip.style.cssText = 'position:fixed;z-index:2147483648;background:#0a0a0f;color:#00f5ff;font:11px monospace;padding:4px 8px;border:1px solid #00f5ff44;border-radius:4px;pointer-events:none;max-width:300px;word-break:break-all;';
  document.body.appendChild(tooltip);

  let lastTarget = null;

  overlay.addEventListener('mousemove', (e) => {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = 'all';
    if (!el || el === lastTarget) return;
    lastTarget = el;

    const r = el.getBoundingClientRect();
    highlight.style.top    = r.top + 'px';
    highlight.style.left   = r.left + 'px';
    highlight.style.width  = r.width + 'px';
    highlight.style.height = r.height + 'px';

    const tag  = el.tagName.toLowerCase();
    const id   = el.id ? '#' + el.id : '';
    const cls  = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    tooltip.textContent = tag + id + cls;
    tooltip.style.left  = Math.min(e.clientX + 12, window.innerWidth - 310) + 'px';
    tooltip.style.top   = Math.min(e.clientY + 12, window.innerHeight - 40) + 'px';
  });

  overlay.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = 'all';
    if (!el) return;

    const r       = el.getBoundingClientRect();
    const tag     = el.tagName.toLowerCase();
    const id      = el.id;
    const classes = el.className;
    const text    = el.innerText?.slice(0, 100);
    const attrs   = {};
    for (const a of el.attributes) attrs[a.name] = a.value;

    // Send to main process
    if (window.__cgSendPick) {
      window.__cgSendPick({
        tag, id, classes, text, attrs,
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        agentId: ${JSON.stringify(agentId)},
        ts: Date.now(),
      });
    }

    window.__cgPicker.destroy();
  });

  window.__cgPicker = {
    destroy() {
      overlay.remove();
      highlight.remove();
      tooltip.remove();
      window.__cgPicker = null;
    }
  };
})();
    `;
  }

  // ── Inject script ─────────────────────────────────────────────────────
  async _inject(agentId, { code, worldId, persistent = false }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    if (persistent) {
      // Re-inject on every navigation
      wc.on('did-navigate', async () => {
        await this._evalJs(wc, code, worldId).catch(() => {});
      });
    }

    const result = await this._evalJs(wc, code, worldId);
    return { result };
  }

  // ── Recording ─────────────────────────────────────────────────────────
  async _recordStart(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    // §IMPROVED 2026-09-26 — selectors a replay can actually find again
    // (id, name, data-testid, aria-label, else a short nth-of-type path, all
    // checked unique), the field type (so src/macros/recording.js can keep
    // passwords out of the macro), Enter keys only, and the start url.
    // Listeners are installed once per page; a second start just resets.
    const startUrl = await this._evalJs(wc, `
      window.__cgRecording = [];
      if (!window.__cgRecorderInstalled) {
        window.__cgRecorderInstalled = true;
        const esc = (v) => (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        const uniq = (s) => { try { return document.querySelectorAll(s).length === 1; } catch (_) { return false; } };
        const selOf = (el) => {
          if (!el || el.nodeType !== 1) return null;
          if (el.id && uniq('#' + esc(el.id))) return '#' + esc(el.id);
          const tag = el.tagName.toLowerCase();
          for (const a of ['name', 'data-testid', 'data-test', 'aria-label', 'placeholder']) {
            const v = el.getAttribute(a);
            if (v) { const s = tag + '[' + a + '="' + v.replace(/"/g, '\\"') + '"]'; if (uniq(s)) return s; }
          }
          const parts = []; let cur = el;
          while (cur && cur.nodeType === 1 && parts.length < 5) {
            if (cur.id && uniq('#' + esc(cur.id))) { parts.unshift('#' + esc(cur.id)); break; }
            const t = cur.tagName.toLowerCase(); const p = cur.parentElement;
            const same = p ? [...p.children].filter(c => c.tagName === cur.tagName) : [];
            parts.unshift(same.length > 1 ? t + ':nth-of-type(' + (same.indexOf(cur) + 1) + ')' : t);
            const s = parts.join(' > '); if (uniq(s)) return s;
            cur = p;
          }
          return parts.join(' > ');
        };
        ['click','input','change','keydown','submit'].forEach(type => {
          document.addEventListener(type, (e) => {
            if (!window.__cgRecording) return;
            if (type === 'keydown' && e.key !== 'Enter') return;
            const el = e.target;
            window.__cgRecording.push({ type, sel: selOf(el), value: el && el.value, inputType: el && el.type, key: e.key, url: location.href, ts: Date.now() });
          }, true);
        });
      }
      location.href;
    `);

    return { recording: true, startUrl };
  }

  async _recordStop(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);

    const recording = await this._evalJs(wc, '(() => { const r = window.__cgRecording || []; window.__cgRecording = null; return r; })()');
    this.sse.emit('driver.recording', { agentId, recording, ts: Date.now() });
    return { recording };
  }

  // ── Internals ──────────────────────────────────────────────────────────
  _getWebContents(agentId) {
    // 2026-09-19: agent ids (mesh-*, ncp-*: the pages that receive whole code bases; §0.39.265 auto-*: workflow pages) resolve through the ONE shared
    // page-resolver and are NEVER allowed to fall back to the focused window (that typed into whatever page was
    // focused). Non-agent ids keep the legacy fallback: the interactive browser tabs may rely on it.
    try { return this._pageResolver().resolve(agentId); }
    catch (e) { if (/^(mesh|ncp|auto)-/.test(String(agentId))) return null; }
    const all = webContents.getAllWebContents();
    for (const wc of all) {
      try {
        const win = BrowserWindow.fromWebContents(wc);
        if (win && win.getTitle().includes(agentId)) return wc;
      } catch {}
    }
    return webContents.getFocusedWebContents() || all[0] || null;
  }
  _pageResolver() { return this.__resolver || (this.__resolver = require('./page-resolver').createPageResolver({ electron: require('electron') })); }

  async _evalJs(wc, code, worldId) {
    return wc.executeJavaScript(code, true);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = ClearDriver;
