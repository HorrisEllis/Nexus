'use strict';
/**
 * renderer/processes.js — the Processes window (SP6, 0.60.220).  (page: processes.html, styles: processes.css)
 * Spec: clear-glass/spec/site-profile.spec MOD-SP-PROCESSES-UI · Map: docs/2026-10-23-site-profile-processes-phasemap.spec SP6
 *
 * James, 2026-10-23: "Also need a processes screen for background tabs and activity."
 * Every 2 s: ClearGlass.processes.list() (one row per process, its pages under it) and .activity(). The sort and the selected row survive a
 * refresh (the table is redrawn from the same keys). Close (a background tab) and End (a site's process) are his, each confirmed, then
 * ClearGlass.processes.end(webContentsId); the answer, a refusal included, is shown. If Clear Glass does not answer, the banner says so.
 */
(function () {
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const KIND = { tab: 'Tab', 'background-tab': 'Background tab', provider: 'Agent tab', window: 'Clear Glass window', gpu: 'GPU', browser: 'Browser', utility: 'Utility' };
  const host = (u) => { try { return new URL(u).host; } catch (_) { return u || ''; } };
  const state = { sort: 'memoryMB', dir: -1, selected: null, rows: [], timer: null, busy: false };

  function nameOf(r) {
    if (r.kind === 'browser') return 'Clear Glass (main process)';
    if (r.kind === 'gpu') return 'GPU';
    if (r.kind === 'utility') return 'Utility';
    const t = r.tabs && r.tabs[0];
    if (r.kind === 'window') return t && t.agentId ? `Window · ${t.agentId}` : 'Clear Glass window';
    return (t && (t.title || host(t.url))) || r.title || host(r.url) || `Process ${r.pid}`;
  }
  const keyOf = (r) => `p${r.pid}`;

  function sorted(rows) {
    const k = state.sort, d = state.dir;
    const val = (r) => (k === 'name' ? nameOf(r).toLowerCase() : k === 'kind' ? (KIND[r.kind] || r.kind) : (r[k] == null ? -1 : r[k]));
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * d || a.pid - b.pid; });
  }

  function action(r, tab) {
    const t = tab || (r.tabs || [])[0];
    if (!t || t.kind === 'window' || !t.webContentsId) return null;
    const isBg = t.kind === 'background-tab';
    const b = el('button', `btn sm ${isBg ? '' : 'danger'}`, isBg ? 'Close' : 'End');
    b.dataset.wc = String(t.webContentsId);
    b.dataset.act = isBg ? 'close' : 'end';
    b.title = isBg ? 'Close this background tab' : 'End this page’s process (the tab shows a crashed page; reload starts it again)';
    b.addEventListener('click', (e) => { e.stopPropagation(); ask(t, isBg); });
    return b;
  }

  function draw() {
    const pagesOnly = $('pr-pages-only').checked;
    const rows = sorted(state.rows.filter(r => !pagesOnly || ['tab', 'background-tab', 'provider'].includes(r.kind)));
    const body = $('pr-rows');
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = el('tr', `pr-row kind-${r.kind}${state.selected === keyOf(r) ? ' sel' : ''}`);
      tr.dataset.key = keyOf(r); tr.dataset.kind = r.kind; tr.dataset.pid = String(r.pid);
      const name = el('td', 'name');
      name.append(el('span', `pr-dot kind-${r.kind}`), el('span', 'pr-name', nameOf(r)));
      const t0 = (r.tabs || [])[0];
      if (t0 && t0.url && r.kind !== 'window') name.append(el('span', 'pr-url', host(t0.url)));
      if (t0 && t0.crashed) name.append(el('span', 'pr-badge bad', 'ended'));
      const act = el('td', 'act'); const a = action(r); if (a) act.append(a);
      tr.append(name, el('td', 'kind', KIND[r.kind] || r.kind), el('td', 'num', r.memoryMB == null ? '—' : `${r.memoryMB.toLocaleString()} MB`),
        el('td', 'num', r.cpu == null ? '—' : `${r.cpu}%`), el('td', 'num mono', String(r.pid)), act);
      tr.addEventListener('click', () => { state.selected = keyOf(r); draw(); });
      frag.append(tr);
      for (const t of (r.tabs || []).slice(1)) {
        if (t.kind === 'window') continue;
        const sub = el('tr', 'pr-sub'); sub.dataset.wc = String(t.webContentsId);
        const n = el('td', 'name'); n.append(el('span', 'pr-indent', '└'), el('span', 'pr-name', t.title || host(t.url) || `page ${t.webContentsId}`), el('span', 'pr-url', host(t.url)));
        const sa = el('td', 'act'); const b = action(r, t); if (b) sa.append(b);
        sub.append(n, el('td', 'kind', KIND[t.kind] || t.kind), el('td', 'num', ''), el('td', 'num', ''), el('td', 'num', ''), sa);
        frag.append(sub);
      }
    }
    body.replaceChildren(frag);
    document.querySelectorAll('#pr-table th[data-sort]').forEach(th => { th.classList.toggle('sorted', th.dataset.sort === state.sort); th.dataset.dir = th.dataset.sort === state.sort ? (state.dir > 0 ? 'asc' : 'desc') : ''; });
  }

  function totals(t, why) {
    const box = $('pr-totals'); box.replaceChildren();
    const chip = (label, v) => { const c = el('span', 'pr-total'); c.append(el('b', null, v), el('span', null, label)); return c; };
    box.append(chip('processes', String(t.processes || 0)), chip('memory', `${(t.memoryMB || 0).toLocaleString()} MB`), chip('CPU', `${t.cpu || 0}%`), chip('background tabs', String(t.backgroundTabs || 0)));
    if (why) box.append(el('span', 'pr-why', why));
  }

  function feed(events) {
    const ol = $('pr-feed');
    if (!events.length) { ol.replaceChildren(el('li', 'pr-empty', 'Nothing yet.')); return; }
    ol.replaceChildren(...events.map(e => {
      const li = el('li', `pr-ev lvl-${e.level} kind-${e.kind.split('.')[0]}`); li.dataset.kind = e.kind;
      const top = el('div', 'pr-ev-top');
      top.append(el('span', 'pr-ev-kind', e.kind), el('span', 'pr-ev-time', new Date(e.ts).toLocaleTimeString()));
      li.append(top, el('div', 'pr-ev-what', e.what));
      const meta = [e.by, e.origin ? host(e.origin) : null].filter(Boolean).join(' · ');
      if (meta) li.append(el('div', 'pr-ev-meta', meta));
      return li;
    }));
  }

  async function refresh() {
    if (state.busy) return; state.busy = true;
    try {
      if (!cg() || !cg().processes) throw new Error('this window has no connection to Clear Glass');
      const [l, a] = await Promise.all([cg().processes.list(), cg().processes.activity({ limit: 200, kind: $('pr-kind').value || null, origin: siteFilter() })]);
      if (!l || !Array.isArray(l.rows)) throw new Error((l && (l.error || l.why)) || 'Clear Glass sent no process list');
      state.rows = l.rows; totals(l.totals || {}, l.why); draw();
      feed((a && a.events) || []);
      $('pr-banner').hidden = true;
    } catch (e) {
      const b = $('pr-banner'); b.textContent = `Clear Glass did not answer: ${e.message}`; b.hidden = false;
    } finally { state.busy = false; }
  }
  function siteFilter() {
    const v = $('pr-site').value.trim(); if (!v) return null;
    try { return new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`).origin; } catch (_) { return null; }
  }

  let pending = null;
  function ask(t, isBg) {
    pending = t;
    $('pr-confirm-title').textContent = isBg ? 'Close this background tab?' : 'End this page’s process?';
    $('pr-confirm-text').textContent = `${t.title || host(t.url) || 'This page'}${t.url ? ` — ${host(t.url)}` : ''}. ${isBg ? 'The tab is closed; whatever it was doing stops.' : 'The page stops at once and shows that it crashed; reload it to start again. Anything not saved on it is lost.'}`;
    $('pr-ok').textContent = isBg ? 'Close tab' : 'End process';
    $('pr-confirm').hidden = false; $('pr-ok').focus();
  }
  async function confirmEnd() {
    const t = pending; $('pr-confirm').hidden = true; pending = null;
    if (!t) return;
    let r; try { r = await cg().processes.end(t.webContentsId); } catch (e) { r = { ok: false, why: e.message }; }
    const b = $('pr-banner');
    if (!r || r.ok === false) { b.textContent = (r && (r.why || r.error)) || 'Not ended'; b.hidden = false; }
    await refresh();
  }

  function boot() {
    $('close').addEventListener('click', () => { try { cg().window.closeProcesses(); } catch (_) { window.close(); } });
    document.querySelectorAll('#pr-table th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sort; state.dir = state.sort === k ? -state.dir : (k === 'name' || k === 'kind' ? 1 : -1); state.sort = k; draw();
    }));
    $('pr-pages-only').addEventListener('change', draw);
    $('pr-kind').addEventListener('change', refresh);
    $('pr-site').addEventListener('input', () => { clearTimeout(state.siteT); state.siteT = setTimeout(refresh, 250); });
    $('pr-cancel').addEventListener('click', () => { $('pr-confirm').hidden = true; pending = null; });
    $('pr-ok').addEventListener('click', confirmEnd);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('pr-confirm').hidden) { $('pr-confirm').hidden = true; pending = null; } });
    refresh();
    state.timer = setInterval(refresh, 2000);
  }
  window.CGProcesses = { refresh, state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
