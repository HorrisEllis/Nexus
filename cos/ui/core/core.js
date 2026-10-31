/**
 * cos/ui/core/core.js — what every COS page shares and nothing else (MOD-MG-UI-CORE). MG18, 0.60.336.
 * Map: docs/2026-10-24-cos-manager-phasemap.spec MG18_the_supervisor_screen, MG_D12, MG_D16.
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus."
 *
 *   await COS.page(id)            the handshake: reads the manager's contract, keeps this page's declared routes and events (GATE-MGUI-001)
 *   await COS.call(method, path, body)   a call, only if this page declares it (GATE-MGUI-002); a refusal is shown on the page, never swallowed
 *   COS.on(event, fn) / COS.emit(event, data)   the bus: events relayed by the shell from the manager's stream; only declared ones
 *   await COS.confirm({ title, body, act, danger })   a person's act, named before it runs (the shell draws it over everything)
 *   COS.h(tag, attrs, ...children) · COS.icon(name) · COS.ago(ts) · COS.dur(ms) · COS.say(el, {...}) · COS.param(name)
 * Plain JS, no framework, no build step, so a page can be rebuilt from the spec alone.
 */
(function () {
  'use strict';
  const state = { id: null, page: null, contract: null, routes: [], listens: new Set(), emits: new Set(), handlers: new Map(), pending: new Map(), seq: 0 };
  const inFrame = window.parent && window.parent !== window;

  const toRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/\*$/, '(?:/.+)?').replace(/:[a-zA-Z]+/g, '[^/]+') + '$');
  const pathOnly = (p) => p.split('?')[0];

  class Refused extends Error { constructor(msg) { super(msg); this.refused = true; } }
  class Down extends Error { constructor(msg) { super(msg); this.down = true; } }

  async function page(id) {
    state.id = id;
    const theme = (() => { try { return localStorage.getItem('cos.theme'); } catch (_) { return null; } })();
    if (theme) document.documentElement.dataset.theme = theme;
    let r;
    try { r = await fetch('/api/cos/contract', { cache: 'no-store' }); } catch (e) { throw new Down(e.message); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.contract) { if (j.down || r.status === 502) throw new Down(j.error || `the manager answered ${r.status}`); throw new Error(j.error || `the contract did not load (${r.status})`); }
    state.contract = j.contract;
    state.page = (j.contract.pages || []).find(p => p.id === id);
    if (!state.page) throw new Refused(`page "${id}" is not in the manager's contract: the shell does not load undeclared pages`);
    state.routes = (state.page.routes || []).map(s => { const [method, path] = s.split(' '); return { method, path, re: toRe(path) }; });
    state.listens = new Set(state.page.listens || []); state.emits = new Set(state.page.emits || []);
    if (inFrame) window.parent.postMessage({ type: 'cos.ready', page: id, listens: [...state.listens] }, location.origin);
    return state.page;
  }

  function refuse(msg) {
    const box = document.createElement('div'); box.className = 'refused rise';
    box.innerHTML = `<span>${icon('x')}</span><div><b>Refused.</b> ${esc(msg)}</div>`;
    (document.querySelector('[data-refusals]') || document.body).prepend(box);
    return new Refused(msg);
  }

  async function call(method, path, body) {
    const p = pathOnly(path);
    if (!state.routes.some(r => r.method === method && r.re.test(p))) throw refuse(`${method} ${p} is not declared by this page in the manager's contract.`);
    const url = p.startsWith('/api/cos/') ? path : `/ap${path}`;
    let r;
    try { r = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw new Down(`the cockpit server did not answer: ${e.message}`); }
    const j = await r.json().catch(() => ({ ok: false, error: `not JSON (${r.status})` }));
    if (r.status === 502 && j.down) throw new Down(j.error);
    if (!r.ok || j.ok === false) { const e = new Error(j.error || `${method} ${p} answered ${r.status}`); e.status = r.status; e.body = j; throw e; }
    j._legacy = r.headers.get('X-Nexus-Legacy');
    return j;
  }

  function on(event, fn) {
    if (!state.listens.has(event)) { refuse(`this page does not declare that it listens to "${event}".`); return () => {}; }
    if (!state.handlers.has(event)) state.handlers.set(event, new Set());
    state.handlers.get(event).add(fn); return () => state.handlers.get(event).delete(fn);
  }
  function emit(event, data) {
    if (!state.emits.has(event)) { refuse(`this page does not declare that it emits "${event}".`); return false; }
    if (inFrame) window.parent.postMessage({ type: 'cos.emit', page: state.id, event, data }, location.origin);
    else if (event === 'cos.ui.navigate') location.href = `/${data.to}`;
    return true;
  }
  window.addEventListener('message', (m) => {
    if (m.origin !== location.origin || !m.data) return;
    const d = m.data;
    if (d.type === 'cos.event' && state.handlers.has(d.event)) for (const fn of state.handlers.get(d.event)) { try { fn(d.data); } catch (e) { console.error(e); } }
    if (d.type === 'cos.confirmed' && state.pending.has(d.id)) { state.pending.get(d.id)(!!d.yes); state.pending.delete(d.id); }
    if (d.type === 'cos.theme') document.documentElement.dataset.theme = d.theme;
  });

  function confirm({ title, body = '', act = 'Confirm', danger = false }) {
    if (!inFrame) return Promise.resolve(window.confirm(`${title}\n\n${body}`));
    const id = `c${++state.seq}`;
    return new Promise((res) => { state.pending.set(id, res); window.parent.postMessage({ type: 'cos.confirm', id, title, body, act, danger }, location.origin); });
  }
  const notice = (level, text) => (state.emits.has('cos.ui.notice') ? emit('cos.ui.notice', { level, text }) : console.log(`[${level}] ${text}`));
  const navigate = (to) => emit('cos.ui.navigate', { to });

  // ── helpers ──
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
    return el;
  }
  const P = {
    play: 'M7 4.5v15l12-7.5z', stop: 'M6 6h12v12H6z', restart: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5', reset: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
    open: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', check: 'M5 12.5l4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6L6 18',
    bolt: 'M13 3L5 13.5h6L10 21l9-11h-6z', search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', inbox: 'M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5', gear: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1M5.3 18.7l2.1-2.1m9.2-9.2 2.1-2.1',
    compass: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM15.5 8.5l-2 5-5 2 2-5z', chevron: 'M9 6l6 6-6 6', terminal: 'M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4',
    pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21', file: 'M6 3h8l4 4v14H6zM14 3v4h4', db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    api: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16', flask: 'M9 3h6M10 3v6L4.5 19a1.3 1.3 0 0 0 1.1 2h12.8a1.3 1.3 0 0 0 1.1-2L14 9V3', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    folder: 'M3 6.5h6l2 2h10V19H3z', clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7.5V12l3 2', layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', cpu: 'M7 7h10v10H7zM10 3v4m4-4v4m-4 10v4m4-4v4M3 10h4m-4 4h4m10-4h4m-4 4h4',
    spark: 'M12 3v6m0 6v6M3 12h6m6 0h6', moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', arrow: 'M5 12h14M13 6l6 6-6 6', back: 'M19 12H5M11 6l-6 6 6 6', hand: 'M8 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5V4.5a1.5 1.5 0 0 1 3 0V11m0-1V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5.4-2.9L4 15.5a1.6 1.6 0 0 1 2.6-1.8L8 15.5',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[n] || P.spark}"/></svg>`;
  function ago(ts) {
    if (!ts) return '—'; const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 5) return 'just now'; if (s < 60) return `${Math.floor(s)}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
  }
  function dur(ms) {
    if (ms == null) return '—'; if (ms < 1000) return `${Math.round(ms)} ms`; const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`; if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`; return `${Math.floor(s / 86400)}d ${Math.floor(s % 86400 / 3600)}h`;
  }
  const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function say(el, { glyph = 'spark', title, text = '', code = '' }) {
    el.replaceChildren(h('div', { class: 'say rise' }, h('div', { class: 'glyph', html: icon(glyph) }), h('h3', {}, title), text ? h('p', { html: text }) : null, code ? h('code', {}, code) : null));
  }
  function down(el, why) {
    say(el, { glyph: 'bolt', title: 'COS\'s manager is not answering', text: `Nothing here can be read or done until it runs. ${esc(why || '')}<br><br>Start it with`, code: 'npm run start:all' });
  }
  const param = (n) => new URLSearchParams(location.search).get(n);
  const STATES = { up: 'up', starting: 'starting', restarting: 'restarting', degraded: 'degraded', 'waiting-memory': 'waiting for memory', stopping: 'stopping',
    idling: 'idling', idle: 'idle', stopped: 'stopped', declared: 'not started', down: 'down', 'circuit-open': 'circuit open', external: 'external' };
  const stateLabel = (s) => STATES[s] || s;

  window.COS = { page, call, on, emit, confirm, notice, navigate, h, icon, esc, ago, dur, clock, say, down, param, stateLabel, Refused, Down, get contract() { return state.contract; }, get self() { return state.page; } };
})();
