/* cos/ui/shell/console.js — the bell, COS's command line and Add system, in the shell (SC5, 0.60.379). MOD-MG-UI-SHELL.
   Map: docs/2026-11-02-cos-console-phasemap.spec SC5_the_console_ui.
   James, 2026-11-02: "Also have a notification bell for update, system status,  notications" · "Need the system cli." · "Also needs to be an
   add system in the proposal section, or just in the general homepage."
   The bell reads GET /api/cos/notices and hears cos.notice on the shell's one stream (page.js relays it as a window event). An update's notice
   opens the update tool itself (lib/ui/update-popup, CE4). The command line runs COS's own table (POST /api/cos/cli). Add system posts
   /api/cos/systems as his act; Overview and Proposals open it through window.COS_ADD (same-origin frames). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id), { h, icon, ago } = COS;
  const B = { counts: { unread: 0 }, list: [], tab: 'all', open: false };
  const call = async (method, p, body) => {
    const r = await fetch(p, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: `not JSON (${r.status})` })); if (!r.ok || j.ok === false) throw new Error(j.error || `${method} ${p}: ${r.status}`); return j;
  };

  // ── the bell ──
  $('bell').insertAdjacentHTML('afterbegin', icon('bell')); $('cli-open').innerHTML = icon('terminal');
  const TABS = [['all', 'All'], ['update', 'Updates'], ['system', 'Systems'], ['notice', 'Notices']];
  function badge() {
    const n = B.counts.unread || 0, b = $('bell-n'); b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
    $('bell').classList.toggle('err', !!B.counts.error); $('bell').title = n ? `${n} unread${B.counts.error ? `, ${B.counts.error} errors` : ''}` : 'Notifications';
  }
  function render() {
    $('bell-tabs').replaceChildren(...TABS.map(([k, l]) => h('button', { class: `btn quiet sm${B.tab === k ? ' on' : ''}`, 'data-tab': k, onclick: () => { B.tab = k; render(); } }, `${l}${k !== 'all' && B.counts[k] ? ` ${B.counts[k]}` : ''}`)));
    const rows = B.list.filter(n => B.tab === 'all' || n.kind === B.tab);
    $('bell-list').replaceChildren(...(rows.length ? rows.map(n => h('li', { class: `n ${n.level}${n.read ? ' read' : ''}`, 'data-id': n.id, tabindex: '0', onclick: () => act(n) },
      h('span', { class: 'dot', 'data-s': n.level === 'error' ? 'down' : n.level === 'warn' ? 'starting' : 'up' }),
      h('div', {}, h('b', {}, n.title), n.body ? h('p', {}, n.body) : null, h('small', { class: 'mono faint' }, `${n.kind}${n.system ? ` · ${n.system}` : ''} · ${ago(n.at)}`)))) : [h('li', { class: 'empty faint' }, 'Nothing here.')]));
  }
  async function load() { try { const j = await call('GET', '/api/cos/notices?limit=80'); B.list = j.notices; B.counts = j.counts; badge(); if (B.open) render(); } catch (_) { /* the manager down: page.js says so */ } }
  async function act(n) {
    if (!n.read) { try { const r = await call('POST', '/api/cos/notices/read', { ids: [n.id] }); B.counts = r.counts; n.read = true; badge(); render(); } catch (_) {} }
    if (n.action && n.action.tool === 'update' && window.NexusUpdatePopup) { try { const j = await call('GET', '/api/cos/update/notice'); toggle(false); window.NexusUpdatePopup.tool(j); } catch (_) {} return; }
    if (n.action && n.action.page) { location.hash = `#/${n.action.page}`; toggle(false); return; }
    if (n.system) { location.hash = `#/c/${encodeURIComponent(n.system)}/logs`; toggle(false); }
  }
  function toggle(on = !B.open) { B.open = on; $('bell-panel').hidden = !on; $('bell').setAttribute('aria-expanded', String(on)); if (on) { render(); load(); } }
  $('bell').onclick = (e) => { e.stopPropagation(); toggle(); };
  $('bell-read').onclick = async () => { try { const r = await call('POST', '/api/cos/notices/read', { all: true }); B.counts = r.counts; B.list.forEach(n => { n.read = true; }); badge(); render(); } catch (_) {} };
  addEventListener('click', (e) => { if (B.open && !$('bell-panel').contains(e.target)) toggle(false); });
  addEventListener('cos-notice', (e) => { const d = e.detail || {}; if (d.counts) B.counts = d.counts; if (d.notice) { B.list.unshift(d.notice); $('bell').classList.add('ring'); setTimeout(() => $('bell').classList.remove('ring'), 900); } badge(); if (B.open) render(); });
  load(); setInterval(load, 60000);

  // ── COS's command line ──
  const hist = []; let hi = 0;
  const out = (text, cls) => { const o = $('console-out'); o.append(h('span', { class: cls || '' }, text + '\n')); o.scrollTop = o.scrollHeight; };
  function cli(on = $('console').hidden) { $('console').hidden = !on; if (on) { $('console-line').focus(); if (!$('console-out').textContent) out('COS command line. help lists the table.', 'faint'); } }
  $('cli-open').onclick = () => cli(); $('console-close').onclick = () => cli(false);
  addEventListener('keydown', (e) => { if (e.key === '`' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cli(); } if (e.key === 'Escape' && !$('console').hidden && document.activeElement === $('console-line')) cli(false); });
  $('console-line').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hist.length) { hi = Math.max(0, hi - 1); e.target.value = hist[hi] || ''; e.preventDefault(); }
    if (e.key === 'ArrowDown' && hist.length) { hi = Math.min(hist.length, hi + 1); e.target.value = hist[hi] || ''; e.preventDefault(); }
  });
  $('console-form').onsubmit = async (e) => {
    e.preventDefault(); const line = $('console-line').value.trim(); if (!line) return;
    hist.push(line); hi = hist.length; $('console-line').value = ''; out(`cos> ${line}`, 'cmd');
    if (line === 'clear') { $('console-out').textContent = ''; return; }
    try { const r = await call('POST', '/api/cos/cli', { line, by: 'person' }); for (const l of r.lines) out(l); }
    catch (err) { const m = /^\{/.test(err.message) ? err.message : err.message; out(m, 'err'); }
  };

  // ── Add system (his act; Overview and Proposals open it through COS_ADD) ──
  function addOpen() { $('add-err').hidden = true; $('add-sys').hidden = false; $('add-form').elements.name.focus(); }
  $('add-no').onclick = () => { $('add-sys').hidden = true; };
  $('add-form').elements.name.addEventListener('input', (e) => { const d = $('add-form').elements.dir; if (!d.dataset.touched) d.value = e.target.value; });
  $('add-form').elements.dir.addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
  $('add-form').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), body = { by: 'person' };
    for (const [k, v] of f.entries()) if (String(v).trim()) body[k] = k === 'port' ? Number(v) : String(v).trim();
    try { const r = await call('POST', '/api/cos/systems', body); $('add-sys').hidden = true;
      dispatchEvent(new CustomEvent('cos-added', { detail: r })); location.hash = `#/c/${encodeURIComponent(body.name)}/config`; setTimeout(() => location.reload(), 50); }
    catch (err) { $('add-err').textContent = err.message; $('add-err').hidden = false; }
  };
  window.COS_ADD = addOpen;
})();
