'use strict';
/**
 * clear-glass/src/driver/glass.js — drive a page in Clear Glass's engine from Node. Replaces Playwright.
 * UUID: nexus-clear-glass-glass-driver-v1-0000-2026-0926-jamesbrooks-001
 * Version: 1.0.0
 *
 * §0.39.263 — James: "playright? no what is that for? litterally have clearglas".
 * Playwright was a root devDependency for three probe scripts. Clear Glass is
 * already a Chromium (Electron) with its own driver, so the probes now drive
 * Clear Glass's engine directly over the DevTools protocol.
 *
 * Engines, first found wins:
 *   1. Clear Glass's Electron (node_modules/electron) running glass-host/main.js —
 *      pages are BrowserWindows, CDP spoken through webContents.debugger.
 *   2. Any Chromium binary (GLASS_CHROMIUM / PW_CHROMIUM / PLAYWRIGHT_CHROMIUM or a
 *      well-known path) over its DevTools websocket, with Node's own WebSocket.
 *      Only for machines without the Electron binary.
 *
 * The page API is the subset of Playwright's the probes used, same names, so a
 * probe changes one require line:
 *   const { chromium } = require('<root>/clear-glass/src/driver/glass.js');
 *   const browser = await chromium.launch(); const pg = await browser.newPage({ viewport });
 *   pg.on('pageerror'|'console'|'response'|'requestfailed', fn)   pg.addInitScript(src)
 *   pg.goto(url)  pg.evaluate(fn, arg)  pg.waitForTimeout(ms)  pg.waitForSelector(sel, {timeout,state})
 *   pg.waitForFunction(fn, arg, {timeout})  pg.$(sel)  pg.$$(sel)  pg.$eval  pg.$$eval
 *   pg.click(sel)  pg.fill(sel, v)  pg.selectOption(sel, v|{index}|{value}|{label})  pg.keyboard.press(key)
 *   pg.locator(sel).{count,isVisible,isHidden,textContent,innerText,click,fill,…}  pg.screenshot({path,fullPage})  pg.close()
 *   pg.route(glob|RegExp|fn, (route) => route.fulfill({status,contentType,body}) | route.continue())
 *   pg.exposeFunction(name, fn)  pg.waitForLoadState()  pg.innerText(sel)  pg.textContent(sel)
 * Selectors: CSS, plus `text=foo` (case-insensitive, the innermost element holding it),
 * `:has-text("foo")` on any compound, and `a >> b` chaining, as in Playwright.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');

const HOST_DIR = path.join(__dirname, 'glass-host');
const ROOT = path.resolve(__dirname, '..', '..', '..');

function electronBinary() {
  if (process.env.GLASS_ELECTRON && fs.existsSync(process.env.GLASS_ELECTRON)) return process.env.GLASS_ELECTRON;
  for (const base of [path.join(ROOT, 'node_modules', 'electron'), path.join(ROOT, 'clear-glass', 'node_modules', 'electron')]) {
    try {
      const rel = fs.readFileSync(path.join(base, 'path.txt'), 'utf8').trim();
      const bin = path.join(base, 'dist', rel);
      if (fs.existsSync(bin)) return bin;
    } catch (_) {}
  }
  return null;
}

function chromiumBinary() {
  for (const v of ['GLASS_CHROMIUM', 'PW_CHROMIUM', 'PLAYWRIGHT_CHROMIUM']) if (process.env[v] && fs.existsSync(process.env[v])) return process.env[v];
  const cands = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  try { for (const d of fs.readdirSync('/opt/pw-browsers')) if (/^chromium-\d+$/.test(d)) cands.unshift(path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome')); } catch (_) {}
  return cands.find(c => fs.existsSync(c)) || null;
}

/** which engine launch() would use, without starting it */
function engine() {
  const e = electronBinary(); if (e) return { kind: 'clear-glass', bin: e };
  const c = chromiumBinary(); if (c) return { kind: 'chromium', bin: c };
  return null;
}

// ── transports: each gives { open(w,h) -> pageId, send(page, method, params), close(page), quit(), events } ──

function glassTransport(bin) {
  const events = new EventEmitter();
  const args = [HOST_DIR, '--no-sandbox'];
  const headless = process.platform === 'linux' && !process.env.DISPLAY;
  if (headless) args.unshift('--ozone-platform=headless', '--disable-gpu');
  const env = { ...process.env, GLASS_OFFSCREEN: headless ? '1' : '' };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
  const pending = new Map(); let seq = 0; let buf = ''; let stderr = '';
  let readyResolve, readyReject; const ready = new Promise((a, b) => { readyResolve = a; readyReject = b; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => {
    buf += c; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.startsWith('§G ')) continue;
      let m; try { m = JSON.parse(line.slice(3)); } catch (_) { continue; }
      if (m.ready) { readyResolve(m); continue; }
      if (m.event) { events.emit('event', m.event); continue; }
      const p = pending.get(m.id); if (!p) continue; pending.delete(m.id);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    }
  });
  child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-4000); });
  child.on('exit', (code) => {
    readyReject(new Error(`Clear Glass host exited (${code}) before ready: ${stderr.split('\n').filter(l => !/dbus|ANGLE|EGL|gl_display|viz_main/.test(l)).slice(-5).join(' | ')}`));
    for (const p of pending.values()) p.reject(new Error('Clear Glass host exited'));
    pending.clear();
  });
  const call = (o) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, ...o }) + '\n'); });
  return {
    kind: 'clear-glass', ready, events,
    open: async (w, h) => (await call({ op: 'open', width: w, height: h })).page,
    send: (page, method, params) => call({ op: 'cdp', page, method, params }),
    close: (page) => call({ op: 'close', page }),
    quit: () => new Promise((r) => { child.once('exit', r); try { child.stdin.write(JSON.stringify({ op: 'quit' }) + '\n'); child.stdin.end(); } catch (_) {} setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} r(); }, 3000).unref(); }),
  };
}

function chromiumTransport(bin) {
  const events = new EventEmitter();
  const os = require('os');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-chromium-'));
  const child = spawn(bin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ws, seq = 0; const pending = new Map(); const sessions = new Map();
  const ready = new Promise((resolve, reject) => {
    let err = '';
    child.stderr.on('data', (c) => {
      err += c; const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m && !ws) {
        ws = new WebSocket(m[1]);
        ws.onopen = () => resolve({ chrome: 'chromium' });
        ws.onerror = (e) => reject(new Error('CDP websocket: ' + (e.message || 'error')));
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id) { const p = pending.get(msg.id); if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); } return; }
          if (msg.sessionId && sessions.has(msg.sessionId)) events.emit('event', { page: sessions.get(msg.sessionId), method: msg.method, params: msg.params });
        };
      }
    });
    child.on('exit', (code) => reject(new Error(`chromium exited (${code}): ${err.slice(-400)}`)));
  });
  const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const pageSession = new Map();
  return {
    kind: 'chromium', ready, events,
    open: async (w, h) => {
      const { targetId } = await raw('Target.createTarget', { url: 'about:blank', width: w, height: h });
      const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
      sessions.set(sessionId, targetId); pageSession.set(targetId, sessionId);
      return targetId;
    },
    send: (page, method, params) => method === 'Glass.setSize' ? Promise.resolve({}) : raw(method, params, pageSession.get(page)),
    close: (page) => raw('Target.closeTarget', { targetId: page }).catch(() => {}),
    quit: async () => { try { await raw('Browser.close'); } catch (_) {} try { child.kill(); } catch (_) {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {} },
  };
}

// ── in-page selector engine (installed once per document, idempotent) ──
const PAGE_LIB = `(() => {
  if (window.__glass) return;
  const splitTop = (s) => { const out = []; let cur = '', q = null, depth = 0;
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth--;
      if (/\\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
      cur += ch;
    } if (cur) out.push(cur); return out; };
  const HAS = /:has-text\\((["'])(.*?)\\1\\)/g;
  const txt = (el) => (el.innerText !== undefined && el.isConnected ? el.innerText : el.textContent) || '';
  function innermost(root, needle) {
    const n = needle.toLowerCase(), hits = [];
    for (const el of [...(root.nodeType === 1 ? [root] : []), ...root.querySelectorAll('*')]) {   // the element itself can hold the text (a >> text=b)
      if (/^(SCRIPT|STYLE|HEAD|HTML|BODY)$/.test(el.tagName)) continue;
      if (!txt(el).toLowerCase().includes(n) && !String(el.value || '').toLowerCase().includes(n)) continue;
      if ([...el.children].some(c => txt(c).toLowerCase().includes(n))) continue;
      hits.push(el);
    } return hits; }
  function all(sel, root) {
    root = root || document; sel = String(sel).trim();
    if (sel.includes(' >> ')) {   // chained: each part searched inside the previous part's matches
      let ctx = [root];
      for (const part of sel.split(' >> ')) { const next = new Set(); for (const c of ctx) for (const el of all(part, c)) next.add(el); ctx = [...next]; }
      return ctx;
    }
    if (/^text=/.test(sel)) { let t = sel.slice(5); if (/^(["']).*\\1$/.test(t)) t = t.slice(1, -1); return innermost(root, t); }
    if (!sel.includes(':has-text(')) return [...root.querySelectorAll(sel)];
    let ctx = [root], child = false;
    for (const part of splitTop(sel)) {
      if (part === '>') { child = true; continue; }
      const texts = []; const css = part.replace(HAS, (_m, _q, t) => { texts.push(t.toLowerCase()); return ''; }) || '*';
      const next = new Set();
      for (const c of ctx) for (const el of c.querySelectorAll(child ? ':scope > ' + css : css)) if (texts.every(t => txt(el).toLowerCase().includes(t))) next.add(el);
      ctx = [...next]; child = false;
    } return ctx; }
  const visible = (el) => { if (!el || !el.isConnected) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  window.__glass = { all, one: (s) => all(s)[0] || null, visible };
})()`;

const KEYS = { Escape: 27, Enter: 13, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, ' ': 32, Space: 32 };

class Page extends EventEmitter {
  constructor(transport, id) {
    super();
    this._t = transport; this._id = id; this._loadWaiters = []; this._reqUrl = new Map(); this._closed = false;
    this._routes = []; this._fetchOn = false; this._bindings = new Map();
    this.keyboard = { press: (key) => this._press(key) };
    this._onEvent = (ev) => { if (ev.page === this._id) this._event(ev.method, ev.params || {}); };
    transport.events.on('event', this._onEvent);
  }
  _send(method, params) { return this._t.send(this._id, method, params); }
  async _init(viewport) {
    await Promise.all([this._send('Page.enable'), this._send('Runtime.enable'), this._send('Network.enable')]);
    if (viewport) await this.setViewportSize(viewport);
  }
  async setViewportSize({ width, height }) {
    await this._send('Glass.setSize', { width, height });
    await this._send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  }
  _event(method, p) {
    if (method === 'Page.loadEventFired') { const w = this._loadWaiters; this._loadWaiters = []; w.forEach(f => f()); }
    else if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {}; const ex = d.exception || {};
      const message = (ex.description || d.text || 'error').split('\n')[0].replace(/^Uncaught\s+/, '').replace(/^\w*Error:\s*/, '');
      const err = new Error(message); err.stack = ex.description || message; this.emit('pageerror', err);
    } else if (method === 'Runtime.consoleAPICalled') {
      const text = (p.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      const fr = (p.stackTrace && p.stackTrace.callFrames && p.stackTrace.callFrames[0]) || {};
      const type = p.type === 'warning' ? 'warning' : p.type;
      this.emit('console', { type: () => type, text: () => text, location: () => ({ url: fr.url || '', lineNumber: fr.lineNumber, columnNumber: fr.columnNumber }) });
    } else if (method === 'Fetch.requestPaused') this._paused(p);
    else if (method === 'Runtime.bindingCalled') this._bound(p);
    else if (method === 'Network.requestWillBeSent') this._reqUrl.set(p.requestId, p.request.url);
    else if (method === 'Network.responseReceived') { const r = p.response; this.emit('response', { status: () => r.status, url: () => r.url }); }
    else if (method === 'Network.loadingFinished') { this.emit('requestfinished', { url: () => this._reqUrl.get(p.requestId) }); this._reqUrl.delete(p.requestId); }
    else if (method === 'Network.loadingFailed') { if (!p.canceled) this.emit('requestfailed', { url: () => this._reqUrl.get(p.requestId) || '', failure: () => ({ errorText: p.errorText }) }); this._reqUrl.delete(p.requestId); }
  }

  // ── route(pattern, handler): answer requests from the probe (Fetch domain) ──
  // pattern: a glob ('https://chatgpt.com/**', '**/api/*'), a RegExp, or a predicate(url)
  async route(pattern, handler) {
    const test = typeof pattern === 'function' ? pattern : pattern instanceof RegExp ? (u) => pattern.test(u) : (() => {
      const re = new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
      return (u) => re.test(u);
    })();
    this._routes.unshift({ test, handler });
    if (!this._fetchOn) { this._fetchOn = true; await this._send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }); }
  }
  async unroute() { this._routes = []; if (this._fetchOn) { this._fetchOn = false; await this._send('Fetch.disable').catch(() => {}); } }
  async _paused(p) {
    const id = p.requestId, req = p.request;
    const r = this._routes.find(x => { try { return x.test(req.url); } catch (_) { return false; } });
    const cont = () => this._send('Fetch.continueRequest', { requestId: id }).catch(() => {});
    if (!r) return cont();
    let done = false;
    const route = {
      request: () => ({ url: () => req.url, method: () => req.method, headers: () => req.headers || {}, postData: () => req.postData || null,
        postDataJSON: () => { try { return JSON.parse(req.postData || 'null'); } catch (_) { return null; } } }),
      fulfill: async ({ status = 200, contentType, headers = {}, body = '', json } = {}) => {
        if (done) return; done = true;
        if (json !== undefined) { body = JSON.stringify(json); contentType = contentType || 'application/json'; }
        const h = { ...headers }; if (contentType) h['Content-Type'] = contentType;
        await this._send('Fetch.fulfillRequest', { requestId: id, responseCode: status, responseHeaders: Object.entries(h).map(([name, value]) => ({ name, value: String(value) })),
          body: Buffer.from(Buffer.isBuffer(body) ? body : String(body)).toString('base64') }).catch(() => {});
      },
      continue: async () => { if (done) return; done = true; await cont(); },
      abort: async (reason = 'Failed') => { if (done) return; done = true; await this._send('Fetch.failRequest', { requestId: id, errorReason: reason }).catch(() => {}); },
    };
    try { await r.handler(route, route.request()); } catch (_) { /* a throwing handler lets the request through */ }
    if (!done) await route.continue();
  }

  // ── exposeFunction(name, fn): window[name](...args) -> Promise of fn's result, in every document ──
  async exposeFunction(name, fn) {
    const binding = '__glass_bind_' + name;
    this._bindings.set(binding, { name, fn });
    await this._send('Runtime.addBinding', { name: binding });
    const src = `(() => { const b = window[${JSON.stringify(binding)}]; if (!b) return; window.__glassCalls = window.__glassCalls || new Map(); let n = 0;
      window[${JSON.stringify(name)}] = (...args) => new Promise((resolve, reject) => { const id = ++n + ':' + Math.random(); window.__glassCalls.set(id, { resolve, reject }); b(JSON.stringify({ id, args })); }); })()`;
    await this._send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    await this._eval(src).catch(() => {});
  }
  async _bound(p) {
    const b = this._bindings.get(p.name); if (!b) return;
    let msg; try { msg = JSON.parse(p.payload); } catch (_) { return; }
    let res, errm = null;
    try { res = await b.fn(...(msg.args || [])); } catch (e) { errm = e.message || String(e); }
    const settle = errm === null ? `c.resolve(${JSON.stringify(res === undefined ? null : res)})` : `c.reject(new Error(${JSON.stringify(errm)}))`;
    await this._eval(`(() => { const c = window.__glassCalls && window.__glassCalls.get(${JSON.stringify(msg.id)}); if (c) { window.__glassCalls.delete(${JSON.stringify(msg.id)}); ${settle}; } })()`).catch(() => {});
  }

  /** cdp(method, params) — the page's DevTools session directly (Playwright's newCDPSession(page).send) */
  cdp(method, params = {}) { return this._send(method, params); }

  async addInitScript(script, arg) {
    const source = typeof script === 'function' ? `(${script})(${JSON.stringify(arg)})` : (script && script.content) || String(script);
    await this._send('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  async goto(url, { timeout = 30000 } = {}) {
    const loaded = new Promise((resolve, reject) => { this._loadWaiters.push(resolve); setTimeout(() => reject(new Error(`goto ${url}: no load event in ${timeout} ms`)), timeout).unref(); });
    const r = await this._send('Page.navigate', { url });
    if (r && r.errorText) throw new Error(`goto ${url}: ${r.errorText}`);
    await loaded;
  }
  url() { return this.evaluate(() => location.href); }

  async _eval(expression) {
    const r = await this._send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception || {};
      throw new Error((ex.description || r.exceptionDetails.text || 'evaluate failed').split('\n')[0]);
    }
    return r.result ? r.result.value : undefined;
  }
  evaluate(fn, arg) {
    return this._eval(typeof fn === 'function' ? `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})` : String(fn));
  }
  _q(body, sel, extra = '') { return this._eval(`${PAGE_LIB};(() => { const G = window.__glass; const sel = ${JSON.stringify(sel)}; ${extra} ${body} })()`); }

  async $(sel) { return (await this._q('return G.all(sel).length;', sel)) ? { selector: sel, index: 0 } : null; }
  async $$(sel) { const n = await this._q('return G.all(sel).length;', sel); return Array.from({ length: n }, (_, index) => ({ selector: sel, index })); }
  async $eval(sel, fn, arg) {
    const r = await this._q(`const el = G.one(sel); if (!el) return { __missing: true }; return { v: (${fn})(el, ${JSON.stringify(arg)}) };`, sel);
    if (r && r.__missing) throw new Error(`$eval: no element matches ${sel}`);
    return r.v;
  }
  $$eval(sel, fn, arg) { return this._q(`return (${fn})(G.all(sel), ${JSON.stringify(arg)});`, sel); }

  waitForTimeout(ms) { return new Promise(r => setTimeout(r, ms)); }
  async waitForLoadState(state = 'load', { timeout = 30000 } = {}) {
    const want = state === 'domcontentloaded' ? ['interactive', 'complete'] : ['complete'];
    await this.waitForFunction((w) => w.includes(document.readyState), want, { timeout });
    if (state === 'networkidle') await this.waitForTimeout(500);
  }
  async innerText(sel, o) { await this.waitForSelector(sel, { state: 'attached', ...(o || {}) }); return this._q('return G.one(sel).innerText;', sel); }
  async textContent(sel, o) { await this.waitForSelector(sel, { state: 'attached', ...(o || {}) }); return this._q('return G.one(sel).textContent;', sel); }
  async getAttribute(sel, name) { return this._q('const el = G.one(sel); return el ? el.getAttribute(n) : null;', sel, `const n = ${JSON.stringify(name)};`); }
  content() { return this.evaluate(() => document.documentElement.outerHTML); }
  async waitForFunction(fn, arg, { timeout = 30000, polling = 50 } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      let v; try { v = await this.evaluate(fn, arg); } catch (_) { v = false; }
      if (v) return v;
      if (Date.now() > end) throw new Error(`waitForFunction: not true in ${timeout} ms`);
      await this.waitForTimeout(polling);
    }
  }
  async waitForSelector(sel, { timeout = 30000, state = 'visible' } = {}) {
    const end = Date.now() + timeout;
    for (;;) {
      const s = await this._q('const els = G.all(sel); return { n: els.length, vis: els.some(G.visible) };', sel).catch(() => ({ n: 0, vis: false }));
      const ok = state === 'attached' ? s.n > 0 : state === 'detached' ? s.n === 0 : state === 'hidden' ? !s.vis : s.vis;
      if (ok) return state === 'detached' || state === 'hidden' ? null : { selector: sel, index: 0 };
      if (Date.now() > end) throw new Error(`waitForSelector ${sel}: not ${state} in ${timeout} ms`);
      await this.waitForTimeout(50);
    }
  }

  async click(sel, { timeout = 30000 } = {}) {
    await this.waitForSelector(sel, { timeout });
    const box = await this._q(`const el = G.all(sel).find(G.visible); el.scrollIntoView({ block: 'center', inline: 'center' });
      // an inline element that wraps has several line boxes; the centre of its bounding box can fall between them
      const r = [...el.getClientRects()].find(b => b.width > 0 && b.height > 0) || el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`, sel);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this._send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
    }
  }
  async fill(sel, value, { timeout = 30000 } = {}) {
    await this.waitForSelector(sel, { timeout });
    await this._q(`const el = G.all(sel).find(G.visible); el.focus();
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const set = Object.getOwnPropertyDescriptor(proto, 'value'); if (el.isContentEditable) el.textContent = v; else set.set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;`, sel, `const v = ${JSON.stringify(String(value))};`);
  }
  async selectOption(sel, value, { timeout = 30000 } = {}) {
    await this.waitForSelector(sel, { timeout, state: 'attached' });
    return this._q(`const el = G.one(sel); const o = [...el.options];
      const want = typeof v === 'object' && v !== null ? v : { value: v };
      const i = want.index !== undefined ? want.index : o.findIndex(x => (want.value !== undefined && x.value === String(want.value)) || (want.label !== undefined && x.label === want.label));
      if (i < 0 || i >= o.length) throw new Error('selectOption: no such option');
      el.selectedIndex = i; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return [o[i].value];`, sel, `const v = ${JSON.stringify(value)};`);
  }
  async _press(key) {
    const code = KEYS[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    const base = { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await this._send('Input.dispatchKeyEvent', { type: key.length === 1 ? 'keyDown' : 'rawKeyDown', ...base, ...(key.length === 1 ? { text: key } : {}) });
    await this._send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  locator(sel) {
    const pg = this;
    return {
      count: () => pg._q('return G.all(sel).length;', sel),
      isVisible: () => pg._q('return G.all(sel).some(G.visible);', sel),
      isHidden: () => pg._q('return !G.all(sel).some(G.visible);', sel),
      textContent: () => pg._q('const el = G.one(sel); return el ? el.textContent : null;', sel),
      innerText: () => pg._q('const el = G.one(sel); return el ? el.innerText : null;', sel),
      allInnerTexts: () => pg._q('return G.all(sel).map(e => e.innerText);', sel),
      allTextContents: () => pg._q('return G.all(sel).map(e => e.textContent);', sel),
      getAttribute: (n) => pg.getAttribute(sel, n),
      waitFor: (o) => pg.waitForSelector(sel, o),
      click: (o) => pg.click(sel, o),
      fill: (v, o) => pg.fill(sel, v, o),
    };
  }

  async screenshot({ path: file, fullPage = false } = {}) {
    const params = { format: 'png' };
    if (fullPage) {
      const m = await this._send('Page.getLayoutMetrics');
      const cs = m.cssContentSize || m.contentSize;
      params.clip = { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.ceil(cs.height), scale: 1 };
      params.captureBeyondViewport = true;
    }
    const { data } = await this._send('Page.captureScreenshot', params);
    const buf = Buffer.from(data, 'base64');
    if (file) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); }
    return buf;
  }

  async close() {
    if (this._closed) return; this._closed = true;
    this._t.events.off('event', this._onEvent);
    await this._t.close(this._id).catch(() => {});
  }
}

class Browser {
  constructor(t) { this._t = t; this._pages = []; }
  get engine() { return this._t.kind; }
  async newPage({ viewport = { width: 1280, height: 800 } } = {}) {
    const id = await this._t.open(viewport.width, viewport.height);
    const pg = new Page(this._t, id);
    await pg._init(viewport);
    this._pages.push(pg);
    return pg;
  }
  async newContext() { return { newPage: (o) => this.newPage(o), close: async () => {} }; }
  async close() { for (const p of this._pages) await p.close(); await this._t.quit(); }
}

async function launch({ executablePath } = {}) {
  let t;
  if (executablePath) t = /electron/i.test(path.basename(executablePath)) ? glassTransport(executablePath) : chromiumTransport(executablePath);
  else {
    const e = engine();
    if (!e) throw new Error('no page engine: install the root devDependencies (electron, Clear Glass\'s engine) or set GLASS_CHROMIUM');
    t = e.kind === 'clear-glass' ? glassTransport(e.bin) : chromiumTransport(e.bin);
  }
  await t.ready;
  return new Browser(t);
}

const chromium = { launch };
module.exports = { chromium, launch, engine, Browser, Page, PAGE_LIB };
