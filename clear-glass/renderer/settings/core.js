'use strict';
/**
 * renderer/settings/core.js — Clear Glass Settings runtime
 * §BUILT 2026-09-23 — James: "a beautiful, fully built, settings page with
 * every feature in mind." Follows the clear-glass UI1 principle
 * (docs/2026-09-22-clear-glass-tab-per-repo-and-ui-expansion-phasemap.spec:
 * "one file per UI area, no monoliths"): this file is the shared runtime;
 * every settings area is its own file under ./sections/, registering itself
 * with CGS.section(). No inline <script> anywhere, so the page's CSP drops
 * script-src 'unsafe-inline' (the follow-up the old settings.html's own
 * CSP comment named).
 *
 * Everything is built with h() (createElement + textContent), never an
 * HTML string with data in it — account labels, emails and page titles come from
 * real users and real sites.
 */
(function () {
  const cg = window.ClearGlass;
  // clear-glass's own wire server (src/main/index.js _startWire): mesh
  // routes, automation, and the ErosmancerOS proxy. Same constant
  // agent-mesh.js/macro.js use (EROS_WIRE_PORT default 7704).
  const WIRE_PORT = 7704;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // ── results: every backend here answers in one of three shapes ─────────
  // {error}, {ok:false,error}, or data. unwrap() turns the first two into a
  // thrown Error so callers can't silently treat a refusal as success (§1.2).
  function unwrap(r, what = 'request') {
    if (r === undefined || r === null) throw new Error(`${what}: no response (backend not wired?)`);
    if (r && typeof r === 'object' && (r.error || r.ok === false)) throw new Error(r.error || `${what} failed`);
    return r;
  }
  async function call(fn, what) { return unwrap(await fn(), what); }

  async function wire(path, { method = 'GET', body, allowNotOk = false } = {}) {
    let res;
    try {
      res = await fetch(`http://127.0.0.1:${WIRE_PORT}${path}`, {
        method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
      });
    } catch (e) { throw new Error(`clear-glass wire :${WIRE_PORT} unreachable (${e.name === 'TimeoutError' ? 'timed out' : e.message})`); }
    let j = null; try { j = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok || (j && j.ok === false && !allowNotOk)) throw new Error((j && j.error) || `HTTP ${res.status} on ${path}`);
    return j || {};
  }

  // ── feedback ────────────────────────────────────────────────────────────
  function toast(msg, kind = 'ok', ms = 3600) {
    const t = h('div', { class: `toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status', text: msg });
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), ms);
  }
  const fail = (e) => toast(e && e.message ? e.message : String(e), 'bad', 6000);

  /** busy(button, fn) — disables while running, reports failure as a toast; returns fn's result or undefined. */
  async function busy(btn, fn) {
    const label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try { return await fn(); } catch (e) { fail(e); return undefined; }
    finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }

  /**
   * modal({title, body:[nodes], actions:[{label, primary, danger, run}], wide})
   * resolves with the action's run() return value, or null on cancel/Escape.
   * run() throwing keeps the modal open and shows the error (never a silent close).
   */
  function modal({ title, body = [], actions = [], wide = false }) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const errLine = h('div', { class: 'blurb', style: { color: 'var(--bad)' }, role: 'alert' });
      const close = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const foot = h('div', { class: 'foot' },
        h('button', { class: 'btn ghost', onclick: () => close(null), text: 'Cancel' }),
        actions.map(a => h('button', {
          class: `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`, text: a.label,
          onclick: async (e) => {
            errLine.textContent = '';
            const b = e.currentTarget; b.disabled = true;
            try { const v = a.run ? await a.run() : true; close(v === undefined ? true : v); }
            catch (err) { errLine.textContent = err.message; b.disabled = false; }
          },
        })));
      const box = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        h('h2', { text: title }), h('div', { class: 'body' }, body, errLine), foot);
      const scrim = h('div', { id: 'scrim', onclick: (e) => { if (e.target === scrim) close(null); } }, box);
      document.body.append(scrim);
      document.addEventListener('keydown', onKey);
      const first = box.querySelector('input, select, textarea, button.primary');
      first && first.focus();
    });
  }
  const confirmDo = (title, text, label = 'Confirm', danger = true) =>
    modal({ title, body: [h('p', { class: 'blurb', text })], actions: [{ label, danger, primary: !danger }] });

  // ── widgets ─────────────────────────────────────────────────────────────
  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  }
  function toggle(on, onChange, label) {
    const t = h('button', { class: 'tog', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label || 'toggle' });
    t.addEventListener('click', async () => {
      const next = t.getAttribute('aria-checked') !== 'true';
      t.setAttribute('aria-checked', String(next));
      try { await onChange(next); }
      catch (e) { t.setAttribute('aria-checked', String(!next)); fail(e); }
    });
    return t;
  }
  function row(title, desc, ...acts) {
    return h('div', { class: 'row' }, h('div', { class: 'what' }, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null),
      h('div', { class: 'acts' }, acts));
  }
  function pane({ title, sub, tools, body, flush, prov, cls }) {
    const p = h('section', { class: `pane${prov ? ' prov' : ''}${cls ? ' ' + cls : ''}` });
    if (prov) p.style.setProperty('--prov', prov);
    if (title) p.append(h('div', { class: 'pane-head' }, prov ? h('span', { class: 'dot' }) : null,
      h('div', { class: 'grow' }, h('h2', { text: title }), sub ? h('div', { class: 'sub', text: sub }) : null), tools || null));
    p.append(h('div', { class: `pane-body${flush ? ' flush' : ''}` }, body || []));
    return p;
  }
  const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`.trim(), onclick, text: label });
  const chip = (text, kind = '') => h('span', { class: `chip ${kind}`.trim(), text });
  const empty = (text, ...acts) => h('div', { class: 'empty' }, h('span', { text }), acts);
  function ago(ts) {
    if (!ts) return 'never';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'just now'; if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`; return `${Math.round(s / 86400)}d ago`;
  }
  function copy(text) { navigator.clipboard.writeText(text).then(() => toast('Copied'), fail); }

  /** agentPicker(selectEl) — fills a <select> with live windows + background tabs (real ids only). */
  async function agentOptions() {
    const [wins, bg] = await Promise.all([cg.window.list().catch(() => []), cg.bgTabs.list().catch(() => [])]);
    const ids = new Map();
    ((wins && wins.windows) || []).forEach(id => ids.set(id, `${id} (window)`));
    (bg || []).forEach(b => ids.set(b.agentId, `${b.agentId} (background${b.url ? ' · ' + b.url : ''})`));
    return [...ids.entries()].map(([value, label]) => ({ value, label }));
  }
  const select = (opts, value, attrs = {}) =>
    h('select', attrs, opts.map(o => h('option', { value: o.value ?? o, text: o.label ?? o, selected: (o.value ?? o) === value ? 'selected' : null })));

  // ── sections + router ───────────────────────────────────────────────────
  const sections = [];
  const GROUPS = ['Identity', 'Agents', 'Browser', 'System'];
  function section(def) { sections.push(def); }

  // §LIBRARY 0.39.241 — the Library window (renderer/library.html) runs on this
  // same runtime so it IS the Settings UI, not a copy of its look: same frame,
  // rail, panes, rows, modals and toasts. What differs per page is passed to
  // boot(): its rail groups, first area, where area CSS lives, how the window
  // closes, and what the rail's search box does ('rail' dims areas — Settings;
  // 'list' filters the shown area's list — Library, like Firefox's Library).
  // Settings calls boot() with no options and gets exactly what it had.
  const CFG = {
    groups: GROUPS, defaultId: 'accounts', cssBase: 'settings/sections/',
    close: () => cg.window.closeSettings(), search: 'rail', searchPlaceholder: 'Find a setting',
  };
  let listQuery = '';
  const query = () => listQuery;

  let current = null, pollers = [];
  const loadedCss = new Set();
  function loadAreaCss(id) {
    if (loadedCss.has(id)) return;
    loadedCss.add(id);
    document.head.append(h('link', { rel: 'stylesheet', href: `${CFG.cssBase}${id}.css`, dataset: { area: id } }));
  }
  function onLeave(fn) { pollers.push(fn); }

  async function show(id) {
    const def = sections.find(s => s.id === id) || sections[0];
    pollers.forEach(f => { try { f(); } catch (_) {} }); pollers = [];
    const same = current === def.id;   // a re-render (search, refresh, poll) keeps what is on screen until the new render is ready
    if (CFG.search === 'list' && !same) {   // a new area starts unfiltered
      listQuery = ''; const sb = document.getElementById('search'); if (sb) sb.value = '';
    }
    current = def.id;
    document.querySelectorAll('.rail-item').forEach(b => b.setAttribute('aria-current', b.dataset.id === def.id ? 'page' : 'false'));
    // The hash is only a bookmark for reopening on the same section — never worth failing a render over.
    if (location.hash !== '#' + def.id) { try { history.replaceState(null, '', '#' + def.id); } catch (_) { /* opaque origin */ } }
    const main = document.getElementById('main');
    const keep = same ? [...((main.querySelector('.page') || {}).childNodes || [])] : [];
    const scroll = same ? main.scrollTop : 0;
    main.replaceChildren();
    // v0.39.227 — one stylesheet per area (sections/<id>.css), loaded the first
    // time the area is shown; its rules are scoped to body[data-area="<id>"]
    // so one area's styles can never leak into another.
    main.dataset.area = def.id;
    document.body.dataset.area = def.id;   // modals live on body, outside #main — scope area CSS from body
    loadAreaCss(def.id);
    const tools = h('div', { class: 'tools' });
    main.append(h('header', { class: 'page-head' }, h('h1', { text: def.label }), def.blurb ? h('p', { text: def.blurb }) : null, tools));
    const page = h('div', { class: 'page' }, keep.length ? keep : h('div', { class: 'loading', text: 'Loading…' }));
    main.append(page);
    if (scroll) main.scrollTop = scroll;
    const rerender = () => show(def.id);
    try {
      const nodes = await def.render({ page, tools, rerender, query: listQuery });
      if (current !== def.id) return;
      page.replaceChildren(...[].concat(nodes || []));
      if (scroll) main.scrollTop = scroll;
    } catch (e) {
      if (current !== def.id) return;
      page.replaceChildren(h('div', { class: 'err-box' }, h('div', { style: { flex: 1 } },
        h('div', { text: `${def.label} could not load.` }), h('div', { class: 'blurb', text: e.message })), btn('Retry', rerender)));
    }
  }

  function buildRail() {
    const rail = document.getElementById('rail');
    const search = h('input', { id: 'search', type: 'search', placeholder: CFG.searchPlaceholder, 'aria-label': CFG.searchPlaceholder });
    rail.append(search);
    for (const g of CFG.groups) {
      const items = sections.filter(s => s.group === g);
      if (!items.length) continue;
      rail.append(h('div', { class: 'rail-group' }, h('h3', { text: g }),
        items.map(s => h('button', { class: 'rail-item', dataset: { id: s.id, keys: `${s.label} ${s.keywords || ''}`.toLowerCase() }, onclick: () => show(s.id) },
          h('span', { class: 'ico', 'aria-hidden': 'true', text: s.icon || '•' }), h('span', { text: s.label })))));
    }
    if (CFG.search === 'list') {
      let t = null;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { listQuery = search.value.trim().toLowerCase(); if (current) show(current); }, 160);
      });
      return;
    }
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      rail.querySelectorAll('.rail-item').forEach(b => b.classList.toggle('dim', !!q && !b.dataset.keys.includes(q)));
    });
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const hit = [...rail.querySelectorAll('.rail-item')].find(b => !b.classList.contains('dim'));
      hit && show(hit.dataset.id);
    });
  }

  function boot(opts = {}) {
    Object.assign(CFG, opts);
    document.getElementById('close').addEventListener('click', () => CFG.close());
    buildRail();
    show((location.hash || '').slice(1) || CFG.defaultId);
    // a link or the back button changing #section re-renders that section
    window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== current) show(id); });
  }

  window.CGS = { cg, h, unwrap, call, wire, toast, fail, busy, modal, confirmDo, field, toggle, row, pane, btn, chip, empty, ago, copy,
    agentOptions, select, section, show, onLeave, boot, query, current: () => current, WIRE_PORT };
})();
