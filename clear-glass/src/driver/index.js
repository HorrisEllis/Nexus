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

// actions that change a page: refused where the site says agents may not drive it (navigate checks its target instead)
const DRIVING = new Set(['click', 'type', 'scroll', 'hover', 'eval', 'select', 'choose', 'check', 'checkAt', 'typeAt', 'setValue', 'pressKey', 'upload', 'pointer', 'inject', 'cookies.set', 'cookies.clear', 'storage.set', 'back', 'forward', 'reload']);
const AGENT_PAGE = /^(mesh|ncp|auto)-/;

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
    const { action, agentId = 'default', by = null, ...args } = payload;
    const execId = uuidv4();
    // §0.60.216 SP2 — an agent's call: a door marks it (POST /cli/driver) or its page is an agent's (mesh-, ncp-, auto-). A person's own
    // runs (his macros, userscripts, rewind, the window's buttons) are never refused by a site's "agents may not drive".
    args._agentCall = by === 'agent' || (by !== 'person' && AGENT_PAGE.test(String(agentId)));

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
    const agentCall = args._agentCall; delete args._agentCall;
    if (agentCall && DRIVING.has(action)) this._siteAllows(agentId);
    switch (action) {
      case 'navigate':       return this._navigate(agentId, { ...args, agentCall });
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
      // 0.39.259 — what an agent needs to fill a real form without writing its own script each time.
      case 'readPage':       return this._readPage(agentId, args);
      case 'readTree':       return this._readTree(agentId, args);   // 0.60.49 SP1 — the semantic tree
      case 'resolve':        return this._resolve(agentId, args);    // 0.60.49 SP1 — a semantic address → its element
      case 'select':         return this._select(agentId, args);
      case 'choose':         return this._choose(agentId, args);
      case 'readChoice':     return this._readChoice(agentId, args);   // 0.60.280 KB4 — a macro step's choice gate
      case 'net':            return this._net(agentId, args);          // 0.60.281 SN1 — Snowflake as a step (src/net/step.js)
      case 'checkAt':        return this._checkAt(agentId, args);      // 0.60.281 AP1 — the checkbox at a column and a row, to a state, read back
      case 'rowLabels':      return this._rowLabels(agentId, args);    // 0.60.281 AP1 — the row labels of a priced table (left of a column)
      case 'typeAt':         return this._typeAt(agentId, args);       // 0.60.286 GM2 — the text box at a column and a row (a package's price), typed, read back
      case 'check':          return this._check(agentId, args);
      case 'setValue':       return this._setValue(agentId, args);
      case 'pressKey':       return this._pressKey(agentId, args);
      case 'upload':         return this._upload(agentId, args);
      // §0.39.279 — the interaction field (src/page/field.js): see the page as numbered x/y/z targets, point at one
      case 'field':          return this._field(agentId, args);
      case 'fieldOff':       return this._fieldOff(agentId);
      case 'at':             return this._at(agentId, args);
      case 'spotlight':      return this._spotlight(agentId, args);
      case 'pointer':        return this._pointer(agentId, args);
      // §0.60.175 PM5 — the page map (src/page/page-session.js): blocks → chunks → a map that learns → intent → targets
      case 'pageMap':        return this._page('map', agentId, args);
      case 'pageFind':       return this._page('find', agentId, args);
      case 'pageChunks':     return this._page('chunks', agentId, args);
      case 'pageScrape':     return this._page('scrape', agentId, args);
      case 'pageOutcome':    return this._pageSession().outcome({ agentId, ...args });
      default:
        throw new Error(`Unknown driver action: ${action}`);
    }
  }

  // §0.60.216 SP2 — acting on a page whose site says agents may not drive it is refused, with the site and the setting
  _siteAllows(agentId) {
    let url = null; try { const wc = this._getWebContents(agentId); url = wc && wc.getURL(); } catch (_) {}
    const site = url ? require('../site-settings/readers').driverPolicy(url) : null;
    if (site && !site.allowed) throw new Error(`ClearDriver may not drive ${site.origin}: its site settings say agents may not drive it (driver.allowed, ${site.from.allowed})`);
  }

  // ── Navigation ────────────────────────────────────────────────────────
  async _navigate(agentId, { url, waitUntil = 'domcontentloaded', agentCall = false }) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    // §0.60.216 SP2 — the site's own setting: agents may not drive it, or it has its own timeout (unset: 30 s, as before)
    const site = require('../site-settings/readers').driverPolicy(url);
    if (agentCall && site && !site.allowed) throw new Error(`ClearDriver may not drive ${site.origin}: its site settings say agents may not drive it (driver.allowed, ${site.from.allowed})`);
    const navMs = (site && site.navTimeoutMs) || 30000;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Navigate timeout (${navMs} ms)`)), navMs);

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

  async _waitFor(agentId, { selector, timeout }) {
    const wc  = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (timeout == null) { const site = require('../site-settings/readers').driverPolicy(wc.getURL()); timeout = (site && site.waitTimeoutMs) || 10000; }   // §0.60.216 SP2

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
  // BS14 (0.60.183) — James: "migrate page zoom to the core of clearglass." The ladder, the clamp and the per-site store are core
  // (src/core/zoom.js), shared with the window and its shortcuts; this action is how an agent reaches them. modes as before:
  // 'set' (factor), 'in', 'out', 'reset'. `zoomed: true` lets the window's address-bar readout follow (browser.js, driver.result).
  async _zoom(agentId, { mode = 'reset', factor } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const z = require('../core/zoom').zoom();
    let r;
    switch (mode) {
      case 'set':   r = z.set(wc, typeof factor === 'number' ? factor : z.current(wc)); break;
      case 'in':    r = z.step(wc, 'in'); break;
      case 'out':   r = z.step(wc, 'out'); break;
      case 'reset': r = z.reset(wc); break;
      default: throw new Error(`Unknown zoom mode: ${mode}`);
    }
    if (!r.ok) throw new Error(r.error);
    return { agentId, factor: r.factor, zoomed: true };
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

  // ── 0.39.259 — read the page, and the form actions typing alone could not do ─────────────────────────────────
  // readPage: clear-glass/src/page/reader.js — url, title, budgeted text, headings, links, every field with its label
  // and a selector these actions accept, every button. One eval, one shape.
  async _readPage(agentId, { maxText, maxLinks, maxFields, maxButtons } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const reader = require('../page/reader');
    const opts = Object.fromEntries(Object.entries({ maxText, maxLinks, maxFields, maxButtons }).filter(([, v]) => typeof v === 'number'));
    const raw = await this._evalJs(wc, reader.pageScript(opts));
    return reader.normalize(raw, opts);
  }

  // §0.60.49 SP1 — James: "what about a semantic tree for our own browser agent?" readTree: the page as the browser's
  // own accessibility tree (CDP), pruned to landmarks, headings, chat messages and everything actionable, each with a
  // semantic address (main › form › button "Send prompt"); source 'page' (or a debugger already in use) computes the
  // same tree in the page. resolve: an address → the element's selector, which click/type/setValue take.
  async _readTree(agentId, { source = 'auto', maxNodes } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const ST = require('../page/semantic-tree');
    const opts = typeof maxNodes === 'number' ? { maxNodes } : {};
    if (source !== 'page') {
      try { const r = await ST.readAX(wc, opts); if (r && r.ok) return r; if (source === 'ax') return r; } catch (e) { if (source === 'ax') throw e; }
    }
    const raw = await this._evalJs(wc, ST.pageScript(opts));
    return ST.normalize(raw, opts);
  }
  async _resolve(agentId, { address } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!address) throw new Error('resolve requires address');
    return this._evalJs(wc, require('../page/semantic-tree').resolveScript(address));
  }

  // select: a <select> cannot be typed into reliably (typing jumps between options by first letter). Sets the option
  // whose value OR visible text matches, then fires input+change so the page's own framework sees it.
  async _select(agentId, { selector, value, text } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!selector) throw new Error('select requires selector');
    if (value === undefined && text === undefined) throw new Error('select requires value or text');
    const r = await this._evalJs(wc, `(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok:false, error:'element not found' };
      if (el.tagName !== 'SELECT') return { ok:false, error:'not a <select> (it is <' + el.tagName.toLowerCase() + '>)' };
      const want = ${JSON.stringify(value === undefined ? null : String(value))}, wantText = ${JSON.stringify(text === undefined ? null : String(text).toLowerCase())};
      const opt = [...el.options].find(o => (want !== null && o.value === want) || (wantText !== null && o.textContent.trim().toLowerCase() === wantText))
               || (wantText !== null ? [...el.options].find(o => o.textContent.trim().toLowerCase().includes(wantText)) : null);
      if (!opt) return { ok:false, error:'no option matches', options:[...el.options].map(o => o.textContent.trim()).slice(0,50) };
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
      return { ok:true, value: opt.value, text: opt.textContent.trim() };
    })()`);
    if (!r || r.ok === false) throw new Error(`select ${selector}: ${(r && r.error) || 'failed'}${r && r.options ? ' — options: ' + r.options.join(' | ') : ''}`);
    return r;
  }

  // choose (0.60.221) — James, 2026-10-28: "it needs to do the drop down menus. one by one ... using erosmancer and mouse curve and the virtual
  // input" · "the drop down doesn't work". select took a native <select> only; Fiverr's dropdowns are its own widgets. One dropdown per call:
  //   find it — by selector, or by what a person sees: the column's header (BASIC) and the row's label ("Number of APIs integrated") or the
  //   text it shows (DELIVERY TIME), by where they sit on the page (no class names);
  //   a native <select> → select, with the option matched first (src/page/option-match.js);
  //   a widget → opened with the curved pointer (via 'native', or 'eros' for ErosmancerOS's virtual input), the options that appeared read,
  //   the wanted one matched (ambiguous or missing → refused with the options seen), clicked with the pointer, and read back: a dropdown
  //   that does not show the choice is a failure, never a silent pass.
  // 0.60.271 — James, 2026-10-28: "it needs delays in between the dropdown menu. like drop down and then click. Also should use electrons
  // digital input and mouse curve from erosmanceros to simulate a human mouse". A person's pace now: a pause after the dropdown opens
  // (openWait), a look at the options before the click (pickWait), a settle after it (settleWait) — each in ms, a [min, max] picked at
  // random, overridable per step (his macro node can set them). via 'auto' (the default) moves with ErosmancerOS's curve when Eros is
  // wired and answering, else Electron's own input along the native curved path; a fallback is said in the result (viaWhy).
  async _humanPointer(agentId, args) {
    if (args.via !== 'auto') return this._pointer(agentId, args);
    if (typeof this.erosInput === 'function') {
      try { return await this._pointer(agentId, { ...args, via: 'eros' }); }
      catch (e) { const r = await this._pointer(agentId, { ...args, via: 'native' }); return { ...r, viaWhy: `ErosmancerOS did not take it (${e.message}) — Electron input instead` }; }
    }
    const r = await this._pointer(agentId, { ...args, via: 'native' }); return { ...r, viaWhy: 'ErosmancerOS is not wired here — Electron input' };
  }
  _pause(span) { const [a, b] = Array.isArray(span) ? span : [span, span]; return this._sleep(a + Math.random() * Math.max(0, b - a)); }

  async _choose(agentId, { selector, column, row, shows: showsText, option, via = 'auto', openWait = [600, 1100], pickWait = [300, 650], settleWait = [500, 900], optionsWaitMs = 8000, pick = 'auto', keys = null, keysFor = null } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (option === undefined || option === null || option === '') throw new Error('choose requires option');
    if (!selector && !column && !showsText) throw new Error('choose requires selector, column with row or shows, or shows alone');   // 0.60.283: shows alone (the Overview's SELECT A CATEGORY)
    const OM = require('../page/option-match');
    const found = await this._evalJs(wc, `(function(sel, col, row, showsText){
      function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
      function norm(t){ return String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
      function ownText(el){ return norm(Array.prototype.map.call(el.childNodes, function(n){ return n.nodeType === 3 ? n.textContent : ''; }).join(' ')) || (el.children.length ? '' : norm(el.textContent)); }
      function byText(t){ var want = norm(t), out = []; document.querySelectorAll('body *').forEach(function(el){ if (vis(el) && (ownText(el) === want || (!el.children.length && norm(el.textContent) === want))) out.push(el); }); return out; }
      var trig = null;
      if (sel) { try { trig = document.querySelector(sel); } catch (_) {} if (!trig) return { error: 'no element for ' + sel }; }
      else {
        // 0.60.283 — no column: the dropdown is found by the text it shows anywhere on the page (Fiverr's SELECT A CATEGORY)
        var h = null;
        if (col) { var heads = byText(col); if (!heads.length) return { error: 'no column headed "' + col + '" on the page' }; h = heads[0].getBoundingClientRect(); }
        var band = null;
        if (row) { var rows = byText(row); if (!rows.length) return { error: 'no row labelled "' + row + '" on the page' };
          var rl = rows[0], box = (rl.closest('tr') || rl.parentElement || rl).getBoundingClientRect(); band = { top: box.top, bottom: box.bottom }; }
        var cands = [];
        document.querySelectorAll('select,[role="combobox"],[aria-haspopup],button,[tabindex],div,span').forEach(function(el){
          if (!vis(el)) return; var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          if (h && (cx < h.left || cx > h.right)) return;
          if (band && (cy < band.top || cy > band.bottom)) return;
          if (!band && showsText && norm(el.textContent) !== norm(showsText)) return;
          if (!band && !showsText) return;
          cands.push(el); });
        // the outermost control that is a select or looks like a dropdown trigger; else the innermost match
        trig = cands.find(function(el){ return el.tagName === 'SELECT'; })
            || cands.find(function(el){ return el.getAttribute('role') === 'combobox' || el.hasAttribute('aria-haspopup'); })
            || cands.filter(function(el){ return !cands.some(function(o){ return o !== el && el.contains(o); }); })[0] || null;
        if (!trig) return { error: (col ? 'no dropdown in column "' + col + '"' : 'no dropdown') + (row ? ' and row "' + row + '"' : ' showing "' + showsText + '"') };
      }
      window.__cgChooseN = (window.__cgChooseN || 0) + 1;
      trig.setAttribute('data-cg-choose', String(window.__cgChooseN));
      trig.scrollIntoView({ block: 'center' });
      var native = trig.tagName === 'SELECT' ? trig : trig.querySelector('select');
      if (native) native.setAttribute('data-cg-choose-native', String(window.__cgChooseN));
      // what is already on screen, so the options that appear on opening can be told apart
      // 0.60.275 — James: "it keeps freezing". What is on screen before opening is kept in a page-side WeakSet, not written onto every
      // element: an attribute on each of thousands of elements is a mutation storm the site's scripts and Clear Glass's own DOM observer both answer.
      window.__cgPre = new WeakSet();
      document.querySelectorAll('body *').forEach(function(el){ window.__cgPre.add(el); });
      return { n: window.__cgChooseN, native: !!native, shown: norm(trig.innerText || trig.textContent).slice(0, 200),
        options: native ? Array.prototype.map.call(native.options, function(o){ return o.textContent.trim(); }) : null };
    })(${JSON.stringify(selector || null)}, ${JSON.stringify(column || null)}, ${JSON.stringify(row || null)}, ${JSON.stringify(showsText || null)})`);
    if (!found || found.error) throw new Error(`choose: ${(found && found.error) || 'page did not answer'}`);
    const trigSel = `[data-cg-choose="${found.n}"]`;
    if (found.native) {
      const m = OM.matchOption(found.options, option);
      if (!m.ok) throw new Error(`choose: ${m.why} — options: ${m.candidates.join(' | ')}`);
      const r = await this._select(agentId, { selector: `[data-cg-choose-native="${found.n}"]`, text: m.option });
      return { kind: 'native', option: m.option, shown: r.text, by: m.by, via: 'native' };
    }
    // 0.60.275 — James, 2026-10-28: "the drop downs. it needs to wait for the system. it keeps freezing. and then, opens the drop down, doesn't
    // click. could always try arrows, or a number." Before each step it waits until the page answers quickly (a frozen page is waited for, not
    // clicked at); the options are read until they hold still; and a pick that does not show is tried again with the keyboard — the arrows to
    // the option and Enter, then the option's number typed and Enter — and last a direct click. Each is read back; the result says which took.
    const scan = () => this._evalJs(wc, `(function(){
        function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
        function fresh(el){ return !(window.__cgPre && window.__cgPre.has(el)); }
        var all = Array.prototype.filter.call(document.querySelectorAll('[role="option"],[role="menuitem"],li,[class*="option" i],[class*="item" i]'), function(el){ return fresh(el) && vis(el); });
        // 0.60.222b — a site whose options are plain divs: what appeared on opening, with short text of its own
        if (!all.length) all = Array.prototype.filter.call(document.querySelectorAll('body *'), function(el){ if (!fresh(el)) return false; var t = (el.innerText || '').trim(); return t && t.length <= 80 && t.indexOf('\\n') < 0 && vis(el); });
        var leaves = all.filter(function(el){ return !all.some(function(o){ return o !== el && el.contains(o); }); });
        document.querySelectorAll('[data-cg-opt]').forEach(function(el){ el.removeAttribute('data-cg-opt'); });
        return leaves.slice(0, 200).map(function(el, i){ el.setAttribute('data-cg-opt', String(i)); return (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(); });
      })()`);
    const readOptions = async (budgetMs) => {   // until the list holds still (the same options twice), or the budget is spent
      let last = null, t0 = Date.now();
      while (Date.now() - t0 < budgetMs) {
        await this._waitResponsive(wc);
        const o = await scan();
        if (Array.isArray(o) && o.length && Array.isArray(last) && last.join('\n') === o.join('\n')) return o;
        last = Array.isArray(o) ? o : null; await this._sleep(200);
      }
      return last;
    };
    const open = async () => {
      await this._waitResponsive(wc);
      const r = await this._humanPointer(agentId, { selector: trigSel, do: 'click', via, label: `open ${column || selector}` });
      await this._pause(openWait);   // drop down … (his words) — the menu animates in before anything is read
      return r;
    };
    const opened = await open();
    let opts = await readOptions(optionsWaitMs);
    if (!opts || !opts.length) { await open(); opts = await readOptions(optionsWaitMs); }   // the first click may have landed while the page was busy
    if (!opts || !opts.length) throw new Error(`choose: the dropdown did not open (no new options after clicking ${column || selector}, twice)`);
    const m = OM.matchOption(opts, option);
    if (!m.ok) throw new Error(`choose: ${m.why} — options: ${m.candidates.slice(0, 40).join(' | ')}`);
    await this._pause(pickWait);   // … and then click
    const optSel = `[data-cg-opt="${m.index}"]`;
    const readShown = () => this._evalJs(wc, `(function(){ var t = document.querySelector(${JSON.stringify(trigSel)}); return t ? (t.innerText || t.textContent || '').replace(/\\s+/g, ' ').trim() : null; })()`);
    const isOpen = () => this._evalJs(wc, `(function(){ var o = document.querySelector(${JSON.stringify(optSel)}); return !!(o && o.isConnected); })()`).catch(() => false);
    // 0.60.280 KB5 — James, 2026-10-29: "bind arrow keys, or numbers to each drop down menu value". The ways to pick, in the order `pick` says
    // (not `by`: every person's run already passes by: 'person', who acted):
    // auto (pointer → arrows → number → direct click), pointer (pointer → direct click), keys (arrows → number), number (number → arrows).
    // Keys bound in the node (keys, or keysFor[option]) are pressed exactly as written instead. Each way is read back; `tried` says each.
    const tried = []; let shown = null, clickedBy = null, picked = null;
    const reopen = async () => { if (!(await isOpen())) { await open(); await readOptions(optionsWaitMs); } };
    const KEYN = { arrowdown: 'Down', down: 'Down', arrowup: 'Up', up: 'Up', enter: 'Enter', return: 'Enter', tab: 'Tab', escape: 'Escape', esc: 'Escape', space: 'Space', home: 'Home', end: 'End', pagedown: 'PageDown', pageup: 'PageUp' };
    const bound = (() => {
      let k = keys != null ? keys : (keysFor && (keysFor[String(option)] != null ? keysFor[String(option)] : keysFor[m.option]));
      if (k == null || k === '') return null;
      const list = Array.isArray(k) ? k : String(k).trim().split(/[\s,]+/);
      return list.filter(Boolean).map(x => KEYN[String(x).toLowerCase()] || String(x));
    })();
    const num = (/\d+/.exec(m.option) || [])[0];
    const WAYS = {
      bound: async () => {
        await reopen();
        for (const k of bound) { await this._key(wc, k, k.length === 1); await this._sleep(90 + Math.random() * 90); }
        await this._pause(settleWait); shown = await readShown(); tried.push(`keys ${bound.join(' ')} → "${shown}"`); return 'keys (bound)';
      },
      pointer: async () => {
        await reopen(); await this._waitResponsive(wc);
        picked = await this._humanPointer(agentId, { selector: optSel, do: 'click', via, label: m.option, scroll: 'within' });
        await this._pause(settleWait); shown = await readShown(); tried.push(`pointer → "${shown}"`); return 'pointer';
      },
      keys: async () => {   // arrows from the option the menu has highlighted (or from the top) to the one meant, then Enter
        await reopen();
        const cur = await this._evalJs(wc, `(function(){ var os = Array.prototype.slice.call(document.querySelectorAll('[data-cg-opt]'));
          for (var i = 0; i < os.length; i++) { var o = os[i]; if (o.getAttribute('aria-selected') === 'true' || o.getAttribute('aria-current') === 'true' || /(^|[\\s_-])(active|focused|highlighted|hover)/i.test(o.className || '')) return Number(o.getAttribute('data-cg-opt')); }
          return -1; })()`).catch(() => -1);
        const steps = m.index - (Number.isInteger(cur) ? cur : -1);
        for (let i = 0; i < Math.abs(steps); i++) { await this._key(wc, steps > 0 ? 'Down' : 'Up'); await this._sleep(90 + Math.random() * 90); }
        await this._key(wc, 'Enter');
        await this._pause(settleWait); shown = await readShown(); tried.push(`arrows ${steps > 0 ? '↓' : '↑'}×${Math.abs(steps)} + Enter → "${shown}"`); return 'keys';
      },
      number: async () => {   // the option's number typed, then Enter ("6 DAYS DELIVERY" → 6)
        if (!num) { tried.push('number: the option has no number'); return null; }
        await reopen();
        for (const ch of num) { await this._key(wc, ch, true); await this._sleep(60 + Math.random() * 60); }
        await this._key(wc, 'Enter');
        await this._pause(settleWait); shown = await readShown(); tried.push(`typed ${num} + Enter → "${shown}"`); return 'number';
      },
      page: async () => {   // 0.60.273 — a direct click on the option while it is still on the page
        await reopen();
        const again = await this._evalJs(wc, `(function(){ var o = document.querySelector(${JSON.stringify(optSel)}); if (!o || !o.isConnected) return false; o.click(); return true; })()`).catch(() => false);
        if (!again) { tried.push('direct click: the option was gone'); return null; }
        await this._pause(settleWait); shown = await readShown(); tried.push(`direct click → "${shown}"`); return 'page';
      },
    };
    const ORDER = { auto: ['pointer', 'keys', 'number', 'page'], pointer: ['pointer', 'page'], keys: ['keys', 'number'], number: ['number', 'keys'] };
    if (!bound && !ORDER[pick]) throw new Error(`choose: pick is auto, pointer, keys or number (got ${JSON.stringify(pick)})`);
    for (const way of (bound ? ['bound'] : ORDER[pick])) {
      const label = await WAYS[way]();
      if (label && OM.shows(shown, m.option)) { clickedBy = label; break; }
    }
    if (!clickedBy) throw new Error(`choose: "${m.option}" did not take — the dropdown shows "${shown}" (tried: ${tried.join('; ')})`);
    return { kind: 'widget', option: m.option, shown, by: m.by, via: picked && picked.via || via, clickedBy, tried, ...((opened && opened.viaWhy) || (picked && picked.viaWhy) ? { viaWhy: (picked && picked.viaWhy) || opened.viaWhy } : {}) };
  }

  // 0.60.281 SN1 — James, 2026-10-29: "also snowflake plugin support to macros and automation." route/unroute this tab's site, start, stop,
  // wait, check, status — through the net service the bridge hands in (driver.netStep), never a second copy of it
  async _net(agentId, params = {}) {
    if (typeof this.netStep !== 'function') throw new Error('net: Snowflake is not wired into this driver');
    const urlOf = () => { try { const wc = this._getWebContents(agentId); return wc ? wc.getURL() : null; } catch (_) { return null; } };
    return this.netStep({ do: params.do, site: params.site || null, via: params.via || 'transport', timeoutMs: params.timeoutMs || 90000, turnOn: params.turnOn !== false, start: params.start !== false }, urlOf);
  }

  // 0.60.281 AP1 — James, 2026-10-29: "update the gig files." A package row that is a checkbox (Data Syncing, Conditional Logic …): the one in
  // the column headed `column` and the row labelled `row`, clicked with the pointer only when it is not already in the wanted state, read back.
  async _checkAt(agentId, { column, row, checked = true, via = 'auto' } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!column || !row) throw new Error('checkAt needs column and row');
    const find = () => this._evalJs(wc, `(function(col, row){
      function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
      function norm(t){ return String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
      function byText(t){ var want = norm(t), out = []; document.querySelectorAll('body *').forEach(function(el){ if (!el.children.length && norm(el.textContent) === want && vis(el)) out.push(el); }); return out; }
      var h = byText(col); if (!h.length) return { error: 'no column headed "' + col + '"' };
      var rw = byText(row); if (!rw.length) return { error: 'no row labelled "' + row + '"' };
      var hr = h[0].getBoundingClientRect(), rb = (rw[0].closest('tr') || rw[0].parentElement || rw[0]).getBoundingClientRect();
      var boxes = Array.prototype.filter.call(document.querySelectorAll('input[type="checkbox"],[role="checkbox"]'), function(el){
        var t = el.type === 'checkbox' && !vis(el) ? (el.closest('label') || el.parentElement) : el; if (!t || !vis(t)) return false;
        var r = t.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; return cx >= hr.left && cx <= hr.right && cy >= rb.top && cy <= rb.bottom; });
      if (!boxes.length) return { error: 'no checkbox at column "' + col + '", row "' + row + '"' };
      var b = boxes[0]; window.__cgCheckN = (window.__cgCheckN || 0) + 1; var target = b.type === 'checkbox' && !vis(b) ? (b.closest('label') || b.parentElement) : b;
      target.setAttribute('data-cg-check', String(window.__cgCheckN));
      return { n: window.__cgCheckN, checked: b.type === 'checkbox' ? !!b.checked : b.getAttribute('aria-checked') === 'true' };
    })(${JSON.stringify(column)}, ${JSON.stringify(row)})`);
    let f = await find();
    if (!f || f.error) throw new Error(`checkAt: ${(f && f.error) || 'page did not answer'}`);
    const want = !!checked;
    if (f.checked === want) return { column, row, checked: want, changed: false };
    await this._waitResponsive(wc);
    await this._humanPointer(agentId, { selector: `[data-cg-check="${f.n}"]`, do: 'click', via, label: `${row} (${column})` });
    await this._pause([250, 450]);
    f = await find();
    if (!f || f.error || f.checked !== want) throw new Error(`checkAt: "${row}" in ${column} is ${f && !f.error ? (f.checked ? 'ticked' : 'clear') : 'gone'} after the click, not ${want ? 'ticked' : 'clear'}`);
    return { column, row, checked: want, changed: true };
  }

  // 0.60.286 GM2 — James, 2026-10-29: "do everything you can ... to get fiverr operational". A package's price had no way in: the text box in the
  // column headed `column` (BASIC) on the row labelled `row` (Price) is marked, typed as him (setValue's native setter + input/change), and read
  // back. { column, row, text, value }
  async _typeAt(agentId, { column, row, text = '' } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!column || !row) throw new Error('typeAt needs column and row');
    const f = await this._evalJs(wc, `(function(col, row){
      function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
      function norm(t){ return String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
      function byText(t){ var want = norm(t), out = []; document.querySelectorAll('body *').forEach(function(el){ if (!el.children.length && norm(el.textContent) === want && vis(el)) out.push(el); }); return out; }
      var h = byText(col); if (!h.length) return { error: 'no column headed "' + col + '"' };
      var rw = byText(row); if (!rw.length) return { error: 'no row labelled "' + row + '"' };
      var hr = h[0].getBoundingClientRect(), rb = (rw[0].closest('tr') || rw[0].parentElement || rw[0]).getBoundingClientRect();
      var boxes = Array.prototype.filter.call(document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea'), function(el){
        if (!vis(el)) return false; var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return cx >= hr.left - 4 && cx <= hr.right + 4 && cy >= rb.top - 2 && cy <= rb.bottom + 2; });
      if (!boxes.length) return { error: 'no text box at column "' + col + '", row "' + row + '"' };
      window.__cgTypeN = (window.__cgTypeN || 0) + 1; boxes[0].setAttribute('data-cg-type', String(window.__cgTypeN));
      return { n: window.__cgTypeN };
    })(${JSON.stringify(column)}, ${JSON.stringify(row)})`);
    if (!f || f.error) throw new Error(`typeAt: ${(f && f.error) || 'page did not answer'}`);
    const selector = `[data-cg-type="${f.n}"]`;
    await this._waitResponsive(wc);
    await this._setValue(agentId, { selector, value: String(text) });
    const back = await this._evalJs(wc, `(function(){ var e = document.querySelector(${JSON.stringify(selector)}); return e ? String(e.value) : null; })()`);
    const want = String(text).replace(/[$,\s]/g, ''), got = String(back == null ? '' : back).replace(/[$,\s]/g, '');
    if (got !== want) throw new Error(`typeAt: "${row}" in ${column} shows "${back}" after typing, not "${text}"`);
    return { column, row, text: String(text), value: back };
  }

  // 0.60.281 AP1 — the row labels of a priced table: the short texts left of the column headed `column`, below its header (so the fill can
  // say which of the page's rows the gig has no value for)
  async _rowLabels(agentId, { column } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const r = await this._evalJs(wc, `(function(col){
      function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
      function norm(t){ return String(t || '').replace(/\\s+/g, ' ').trim(); }
      var h = null; document.querySelectorAll('body *').forEach(function(el){ if (!h && !el.children.length && norm(el.textContent).toLowerCase() === String(col).toLowerCase() && vis(el)) h = el; });
      if (!h) return { error: 'no column headed "' + col + '"' };
      var hr = h.getBoundingClientRect(), out = [];
      document.querySelectorAll('body *').forEach(function(el){ if (el.children.length || !vis(el)) return; var r = el.getBoundingClientRect(), t = norm(el.textContent);
        if (t && t.length <= 80 && r.right <= hr.left + 2 && (r.top + r.bottom) / 2 > hr.bottom && out.indexOf(t) < 0) out.push(t); });
      return { labels: out };
    })(${JSON.stringify(column || 'BASIC')})`);
    if (!r || r.error) throw new Error(`rowLabels: ${(r && r.error) || 'page did not answer'}`);
    return r;
  }

  // 0.60.280 KB4 — James, 2026-10-29: "make the gates for them gated and have them check for the correct value". What a dropdown shows now:
  // the one choose last marked in that column (or row, or the selector); when the page has redrawn it, the short texts in that column. With
  // `is`, matches says whether it shows that value (the same match choose reads back with).
  async _readChoice(agentId, { column = null, row = null, selector = null, is = null } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!column && !row && !selector) throw new Error('readChoice needs column, row or selector');
    const OM = require('../page/option-match');
    const r = await this._evalJs(wc, `(function(sel, col, row){
      function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
      function norm(t){ return String(t || '').replace(/\\s+/g, ' ').trim(); }
      function byText(t){ var want = norm(t).toLowerCase(), out = []; document.querySelectorAll('body *').forEach(function(el){ if (!el.children.length && norm(el.textContent).toLowerCase() === want && vis(el)) out.push(el); }); return out; }
      if (sel) { var e = null; try { e = document.querySelector(sel); } catch (_) {} return e ? { shown: norm(e.innerText || e.textContent), from: 'selector' } : { error: 'no element for ' + sel }; }
      var band = null, cols = null;
      if (col) { var h = byText(col); if (!h.length) return { error: 'no column headed "' + col + '"' }; var hr = h[0].getBoundingClientRect(); cols = { left: hr.left, right: hr.right }; }
      if (row) { var rw = byText(row); if (!rw.length) return { error: 'no row labelled "' + row + '"' }; var rb = (rw[0].closest('tr') || rw[0].parentElement || rw[0]).getBoundingClientRect(); band = { top: rb.top, bottom: rb.bottom }; }
      function inside(el){ var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return (!cols || (cx >= cols.left && cx <= cols.right)) && (!band || (cy >= band.top && cy <= band.bottom)); }
      var marked = Array.prototype.filter.call(document.querySelectorAll('[data-cg-choose]'), function(el){ return vis(el) && inside(el); })
        .sort(function(a, b){ return Number(b.getAttribute('data-cg-choose')) - Number(a.getAttribute('data-cg-choose')); });
      if (marked.length) return { shown: norm(marked[0].innerText || marked[0].textContent), from: 'marked' };
      var texts = []; document.querySelectorAll('body *').forEach(function(el){ if (el.children.length || !vis(el) || !inside(el)) return; var t = norm(el.textContent); if (t && t.length <= 60) texts.push(t); });
      return { shown: null, texts: texts.slice(0, 80), from: 'column' };
    })(${JSON.stringify(selector)}, ${JSON.stringify(column)}, ${JSON.stringify(row)})`);
    if (!r || r.error) throw new Error(`readChoice: ${(r && r.error) || 'page did not answer'}`);
    if (is == null || is === '') return r;
    if (r.shown != null) return { ...r, is, matches: OM.shows(r.shown, String(is)) };
    const hit = (r.texts || []).find(t => OM.shows(t, String(is)));
    return { ...r, shown: hit || null, is, matches: !!hit };
  }

  // 0.60.275 — wait until the page answers quickly: a frozen page (his machine under load) is waited for, not acted on. Up to maxMs, then on.
  async _waitResponsive(wc, { fastMs = 250, maxMs = 20000 } = {}) {
    const t0 = Date.now(); let good = 0;
    while (Date.now() - t0 < maxMs) {
      const a = Date.now();
      try { await this._evalJs(wc, '1'); } catch (_) { return false; }
      if (Date.now() - a < fastMs) { if (++good >= 2) return true; } else good = 0;
      await this._sleep(60);
    }
    return false;
  }

  // 0.60.275 — one key to the page, as the input system makes it: a named key (Down, Up, Enter) or a character
  async _key(wc, key, isChar = false) {
    if (isChar) { wc.sendInputEvent({ type: 'keyDown', keyCode: key }); wc.sendInputEvent({ type: 'char', keyCode: key }); wc.sendInputEvent({ type: 'keyUp', keyCode: key }); return; }
    wc.sendInputEvent({ type: 'keyDown', keyCode: key });
    await this._sleep(30 + Math.random() * 30);
    wc.sendInputEvent({ type: 'keyUp', keyCode: key });
  }

  // check: checkbox/radio to a definite state (a click toggles, so clicking an already-checked box unchecks it).
  async _check(agentId, { selector, checked = true } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!selector) throw new Error('check requires selector');
    const r = await this._evalJs(wc, `(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok:false, error:'element not found' };
      const want = ${JSON.stringify(!!checked)};
      if (el.checked !== want) el.click();
      if (el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles:true })); }
      return { ok: el.checked === want, checked: el.checked };
    })()`);
    if (!r || !r.ok) throw new Error(`check ${selector}: ${(r && r.error) || 'state did not change'}`);
    return r;
  }

  // setValue: long answers (a cover letter) typed key by key take minutes and trip per-key handlers. Sets the value
  // through the element's native setter (so React/Vue-controlled inputs register it), then fires input+change.
  async _setValue(agentId, { selector, value = '' } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!selector) throw new Error('setValue requires selector');
    const r = await this._evalJs(wc, `(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return { ok:false, error:'element not found' };
      const v = ${JSON.stringify(String(value))};
      el.focus && el.focus();
      if (el.isContentEditable) { el.textContent = v; }
      else {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value');
        if (setter && setter.set) setter.set.call(el, v); else el.value = v;
      }
      el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true }));
      el.blur && el.blur();
      return { ok:true, length: v.length };
    })()`);
    if (!r || !r.ok) throw new Error(`setValue ${selector}: ${(r && r.error) || 'failed'}`);
    return r;
  }

  // 0.60.280 KB5 — times: the same key N times at a person's pace (Down ×6 to reach a dropdown's seventh option)
  async _pressKey(agentId, { key = 'Enter', modifiers = [], times = 1 } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const n = Math.max(1, Math.min(200, parseInt(times, 10) || 1));
    for (let i = 0; i < n; i++) {
      if (i) await this._sleep(80 + Math.random() * 80);
      wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers });
      if (key.length === 1) wc.sendInputEvent({ type: 'char', keyCode: key, modifiers });
      wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers });
    }
    return { pressed: key, modifiers, times: n };
  }

  // upload: a file input cannot be filled by typing or by script (browsers forbid setting .value). The one real way
  // is the DevTools protocol's DOM.setFileInputFiles, reached through webContents.debugger. Paths are on THIS
  // machine. If another client holds the debugger, attach fails and that is reported, not worked around.
  async _upload(agentId, { selector, paths } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (!selector) throw new Error('upload requires selector');
    const files = (Array.isArray(paths) ? paths : [paths]).filter(Boolean).map(String);
    if (!files.length) throw new Error('upload requires paths (one or more files on this machine)');
    const fs = require('fs');
    const missing = files.filter(p => !fs.existsSync(p));
    if (missing.length) throw new Error(`upload: file(s) not found: ${missing.join(', ')}`);
    const dbg = wc.debugger;
    let attachedHere = false;
    if (!dbg.isAttached()) {
      try { dbg.attach('1.3'); attachedHere = true; }
      catch (e) { throw new Error(`upload: could not attach the DevTools debugger (${e.message}) — another client may hold it`); }
    }
    try {
      const { root } = await dbg.sendCommand('DOM.getDocument', { depth: 0 });
      const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`upload: element not found: ${selector}`);
      await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files });
      return { ok: true, selector, files };
    } finally {
      if (attachedHere) { try { dbg.detach(); } catch (_) {} }
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────
  _getWebContents(agentId) {
    // 2026-09-19: agent ids (mesh-*, ncp-*: the pages that receive whole code bases; §0.39.265 auto-*: workflow pages) resolve through the ONE shared
    // page-resolver and are NEVER allowed to fall back to the focused window (that typed into whatever page was
    // focused). Non-agent ids keep the legacy fallback: the interactive browser tabs may rely on it.
    // §0.60.216 SP2 — `wc:<id>` names one page exactly (a site's macros on load run on the page that loaded)
    { const m = /^wc:(\d+)$/.exec(String(agentId)); if (m) { const wc = webContents.fromId(Number(m[1])); return wc && !wc.isDestroyed() ? wc : null; } }
    try { return this._pageResolver().resolve(agentId); }
    catch (e) { if (/^(mesh|ncp|auto)-/.test(String(agentId))) return null; }
    // 0.60.7 — James, recording a macro: "the record button doesn't work". Picking "default (window)" and pressing Start
    // recorded the SETTINGS page (file:///…/settings.html#macros): 'default' is not in any window title, so this fell to
    // getFocusedWebContents(), and the focused window was Settings. A window's agentId is the key of main's own windows /
    // bgTabs maps; its browsing page is the <webview> guest inside it. That page, never a Clear Glass UI page.
    const own = this._windowPage(agentId);
    if (own) return own;
    const all = webContents.getAllWebContents();
    for (const wc of all) {
      try {
        const win = BrowserWindow.fromWebContents(wc);
        if (win && win.getTitle().includes(agentId)) return wc;
      } catch {}
    }
    const focused = webContents.getFocusedWebContents();
    if (focused && !this._isChromePage(focused)) return focused;
    return all.find(wc => { try { return wc.getType() === 'webview' && !wc.isDestroyed(); } catch (_) { return false; } }) || null;
  }
  // a Clear Glass page of its own (settings, library, the browser chrome) is never an agent's page
  _isChromePage(wc) {
    try { const u = wc.getURL() || ''; return /^file:.*\/renderer\/[^/]+\.html/.test(u) || /\/renderer\/(settings|library|browser)\.html/.test(u); } catch (_) { return true; }
  }
  _windowPage(agentId) {
    let main; try { main = require('../main/index'); } catch (_) { return null; }
    const win = (main.windows && main.windows.get && main.windows.get(agentId)) || (main.bgTabs && main.bgTabs.get && main.bgTabs.get(agentId)) || null;
    const host = win && (win.webContents || (win.win && win.win.webContents));
    if (!host || host.isDestroyed()) return null;
    const guests = webContents.getAllWebContents().filter(g => { try { return g.getType() === 'webview' && g.hostWebContents === host && !g.isDestroyed(); } catch (_) { return false; } });
    const real = guests.find(g => { const u = g.getURL(); return u && u !== 'about:blank'; });
    if (real || guests[0]) return real || guests[0];
    return this._isChromePage(host) ? null : host;
  }
  _pageResolver() { return this.__resolver || (this.__resolver = require('./page-resolver').createPageResolver({ electron: require('electron') })); }

  async _evalJs(wc, code, worldId) {
    return wc.executeJavaScript(code, true);
  }

  // ── The interaction field (§0.39.279) ─────────────────────────────────
  // James: "a interaction field for xyz coords to help the agents see and navigate the ui in clearglass … virtual
  // input through erosmanceros … spotlight injected css". field() maps the page into numbered targets (box, centre, z =
  // layers covering it) and can draw them; pointer() acts on a target number or x/y with a real input event — native
  // (webContents.sendInputEvent, a curved human-paced path) or through ErosmancerOS (CDP Input.*, its behaviour engine's
  // own path), after a spotlight on the target so James sees what is about to be pressed. The last field per agent is
  // kept so "pointer n:3" needs no second read.
  _fieldMaps() { return this.__fieldMaps || (this.__fieldMaps = new Map()); }
  // §0.60.175 PM5/PM6 — one page session per driver: per window the last map; page-memory (~/.clear-glass/page-maps) learns per
  // site; 'page.map' goes on the bus so attention keeps the window's feel for Nerve (and Ollama through Nerve's bridge)
  _pageSession() {
    if (!this.__pageSession) {
      const PS = require('../page/page-session');
      this.__pageSession = PS.createPageSession({ memory: require('../page/page-memory').shared(), emit: (type, data) => { try { this.sse.emit(type, data); } catch (_) {} } });
    }
    return this.__pageSession;
  }
  /** §0.60.175 PM7 — main/index.js hands every dom.mutations here; a live-mapped window is mapped again once it settles */
  pageMutated(agentId) { return this.__pageSession ? this.__pageSession.poke(agentId) : false; }
  async _page(what, agentId, args = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    return this._pageSession()[what]({ agentId, ...args, evalJs: (code) => this._evalJs(wc, code) });
  }
  _pointerAt() { return this.__pointerAt || (this.__pointerAt = new Map()); }

  async _field(agentId, { overlay = false, grid, max, offscreen, limit, all } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const F = require('../page/field');
    const opts = Object.fromEntries(Object.entries({ overlay: !!overlay, grid, max, offscreen }).filter(([, v]) => v !== undefined));
    const map = await this._evalJs(wc, F.fieldScript(opts));
    this._fieldMaps().set(agentId, { ...map, at: Date.now() });
    try { this.sse.emit('field.map', { agentId, url: map.url, targets: map.targets.length, overlay: map.overlay, ts: Date.now() }); } catch (_) {}
    return { ...map, text: F.describe(map, { limit: limit || 60, all: !!all }) };
  }

  async _fieldOff(agentId) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    return this._evalJs(wc, require('../page/field').fieldOffScript());
  }

  async _at(agentId, { x, y, limit } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    if (![x, y].every(Number.isFinite)) throw new Error('at requires x and y (viewport pixels)');
    return this._evalJs(wc, require('../page/field').atScript({ x, y, limit }));
  }

  async _spotlight(agentId, { n, selector, x, y, w, h, label, ttl, color, dim, off } = {}) {
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const F = require('../page/field');
    let opts = { selector, x, y, w, h, label, ttl, color, dim, off };
    if (n !== undefined && !selector) {
      const t = F.target(this._fieldMaps().get(agentId), n);
      if (!t) throw new Error(`no target #${n} — call field first`);
      opts = { ...opts, selector: t.selector, label: label || `#${t.n} ${t.name || t.tag}` };
    }
    const r = await this._evalJs(wc, F.spotlightScript(opts));
    try { this.sse.emit('field.spotlight', { agentId, ...opts, ok: r && r.ok, ts: Date.now() }); } catch (_) {}
    return r;
  }

  /**
   * pointer({ n | x,y | selector, do: 'move'|'click'|'double'|'right'|'scroll'|'type', text, deltaY, via, spotlight })
   * (`do`, not `action`: the driver command's own name is already `action` — 'pointer')
   * via 'native' (default) — sendInputEvent along a curved path from where the pointer last was;
   * via 'eros' — ErosmancerOS's /api/input over the DevTools protocol (this.erosInput, wired by main/index.js).
   */
  // §FN2 0.59.0 — every pointer act is said on the bus (field.pointer), as field.map and field.spotlight already were, so
  // Clear Glass's attention record (src/page/attention.js) and Nexus Nerve know where an agent pointed
  async _pointer(agentId, args = {}) {
    const r = await this._pointerAct(agentId, args);
    try { this.sse.emit('field.pointer', { agentId, do: r.action, x: r.x, y: r.y, n: r.target ? r.target.n : null, name: r.target ? r.target.name : null, label: args.label || null, covered: !!r.covered, via: r.via, ts: Date.now() }); } catch (_) {}
    return r;
  }

  async _pointerAct(agentId, { n, x, y, selector, do: action = 'click', text, deltaY = 300, via = 'native', spotlight = true, label, scroll = 'page' } = {}) {
    if (!['move', 'click', 'double', 'right', 'scroll', 'type'].includes(action)) throw new Error(`pointer "do" must be move|click|double|right|scroll|type, not "${action}"`);
    const wc = this._getWebContents(agentId);
    if (!wc) throw new Error(`No webcontents for agent: ${agentId}`);
    const F = require('../page/field');
    let tgt = null;
    if (n !== undefined) {
      tgt = F.target(this._fieldMaps().get(agentId), n);
      if (!tgt) throw new Error(`no target #${n} — call field first (the map is per page; call it again after the page changes)`);
      if (tgt.z < 0) throw new Error(`target #${n} is off-screen — scroll (pointer action "scroll") and call field again`);
      x = tgt.cx; y = tgt.cy;
    } else if (selector) {
      // 0.60.273 — scroll 'within': an option in an open dropdown is brought into view inside its own list, and the page moves only if the
      // list itself is off screen (and then the least it can). Centring it on the page moved the page under Fiverr's open menu (his picture 3).
      const pos = await this._evalJs(wc, `(function(within){ const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
        if (!within) el.scrollIntoView({ block: 'center', inline: 'center' });
        else {
          for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
            var cs = getComputedStyle(p); if (!/(auto|scroll)/.test(cs.overflowY) || p.scrollHeight <= p.clientHeight) continue;
            var pr = p.getBoundingClientRect(), er = el.getBoundingClientRect();
            if (er.top < pr.top || er.bottom > pr.bottom) p.scrollTop += (er.top + er.height / 2) - (pr.top + pr.height / 2);
            break;
          }
          var q = el.getBoundingClientRect();
          if (q.top < 0 || q.bottom > innerHeight || q.left < 0 || q.right > innerWidth) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })(${JSON.stringify(scroll === 'within')})`);
      if (!pos) throw new Error(`Element not found: ${selector}`);
      x = pos.x; y = pos.y;
    }
    if (![x, y].every(Number.isFinite)) throw new Error('pointer needs n (a field target), selector, or x and y');
    // what is actually under the point: a covered target is reported, never silently clicked through
    const under = await this._evalJs(wc, F.atScript({ x, y, limit: 3 })).catch(() => null);
    if (spotlight && action !== 'move') {
      await this._evalJs(wc, F.spotlightScript({ x: x - 14, y: y - 14, w: 28, h: 28, label: label || (tgt ? `#${tgt.n} ${action}` : `${action} (${x},${y})`), ttl: 1500, dim: false })).catch(() => {});
      await this._sleep(250);
    }
    if (via === 'eros') {
      if (typeof this.erosInput !== 'function') throw new Error('ErosmancerOS input is not wired in this Clear Glass (via "native" works without it)');
      let url = null; try { url = wc.getURL(); } catch (_) {}
      const r = await this.erosInput(agentId, url, { x, y, action, text, deltaY });
      return { via: 'eros', x, y, action, target: tgt ? { n: tgt.n, name: tgt.name } : null, under: under && under.stack, result: r };
    }
    const from = this._pointerAt().get(agentId);
    for (const p of F.pointerPath(from, { x, y }, { steps: action === 'move' ? 18 : 12 })) {
      wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
      await this._sleep(8 + Math.random() * 10);
    }
    this._pointerAt().set(agentId, { x, y });
    const press = async (button, clickCount) => {
      wc.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount });
      await this._sleep(45 + Math.random() * 45);
      wc.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount });
    };
    if (action === 'click' || action === 'type') await press('left', 1);
    else if (action === 'double') { await press('left', 1); await this._sleep(60); await press('left', 2); }
    else if (action === 'right') await press('right', 1);
    // a positive deltaY moves the page DOWN (Electron's wheel delta is the opposite sign)
    else if (action === 'scroll') wc.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY: -deltaY, wheelTicksX: 0, wheelTicksY: deltaY > 0 ? -1 : 1 });
    if (action === 'type') {
      if (typeof text !== 'string') throw new Error('pointer action "type" needs text');
      await this._sleep(80);
      for (const ch of text) {
        wc.sendInputEvent({ type: 'char', keyCode: ch });
        await this._sleep(25 + Math.random() * 40);
      }
    }
    return { via: 'native', x, y, action, target: tgt ? { n: tgt.n, name: tgt.name, z: tgt.z } : null, under: under && under.stack,
      covered: !!(tgt && tgt.z > 0), note: tgt && tgt.z > 0 ? `#${tgt.n} is covered by ${tgt.z} layer(s) — the event went to what is on top (see under)` : undefined };
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = ClearDriver;
