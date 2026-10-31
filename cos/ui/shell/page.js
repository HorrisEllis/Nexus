/**
 * cos/ui/shell/page.js — the frame, the tree, the router, and the bus (MOD-MG-UI-SHELL). MG18, 0.60.336.
 * Map: docs/2026-10-24-cos-manager-phasemap.spec MG18_the_supervisor_screen, MG_D12, MG_D16.
 * James, 2026-10-31: "okay. lets build cos ui. floating, above the event bus. all of the phases, build it."
 *
 * The shell holds the one event stream (GET /api/cos/events) and relays to each page only what that page declares it listens to; a page's
 * emit is honoured only if the contract declares it (GATE-MGUI-SHELL-001: pages from the contract only). Each page runs in its own frame, so
 * one page failing leaves the others. While the stream is down the shell says so and reads /api/cos/systems every 5 s instead (said, never
 * silent); the pages still hear cos.system.state.
 */
(function () {
  'use strict';
  const { h, icon, esc } = COS;
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const S = { contract: null, systems: [], frames: new Map(), listens: new Map(), current: null, es: null, poll: null, events: 0, proposals: 0, last: new Map() };
  const ICON = { overview: 'grid', ledger: 'list', proposals: 'inbox', automation: 'gear', planned: 'compass', cockpit: 'layers' };
  const THEMES = ['nexus', 'midnight', 'graphite'];

  // ── fetch for the shell's own reads (declared in the contract as the "shell" page) ──
  const get = async (p) => { const r = await fetch(p, { cache: 'no-store' }); const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) { const e = new Error(j.error || r.status); e.down = !!j.down || r.status === 502; throw e; } return j; };

  // ── theme ──
  function setTheme(t) {
    document.documentElement.dataset.theme = t; try { localStorage.setItem('cos.theme', t); } catch (_) {}
    $('theme').innerHTML = `${icon('moon')}<span>${t}</span>`;
    for (const f of S.frames.values()) f.contentWindow && f.contentWindow.postMessage({ type: 'cos.theme', theme: t }, location.origin);
    BUS.lanes(S.systems.map(s => s.name));
  }
  $('theme').onclick = () => setTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % THEMES.length]);

  // ── the rail ──
  function renderNav() {
    const pages = S.contract.pages.filter(p => p.built);
    const link = (p) => h('a', { href: p.route, 'data-page': p.id, html: `${icon(ICON[p.id] || 'spark')}<span>${esc(p.title)}</span>${p.id === 'proposals' ? '<span class="badge" hidden></span>' : ''}` });
    $('nav-main').replaceChildren(...pages.filter(p => p.nav === 'main').map(link));
    $('nav-foot').replaceChildren(...pages.filter(p => p.nav === 'foot').map(link));
    renderSystems(); markCurrent();
  }
  function renderSystems() {
    $('sys-count').textContent = S.systems.length ? `${S.systems.filter(s => s.state === 'up').length}/${S.systems.length}` : '';
    $('nav-systems').replaceChildren(...S.systems.map(s => h('a', { href: `#/c/${encodeURIComponent(s.name)}`, 'data-sys': s.name, title: `${s.name} — ${COS.stateLabel(s.state)}` },
      h('span', { class: 'dot', 'data-s': s.state }), h('span', {}, s.name), s.port ? h('span', { class: 'port' }, `:${s.port}`) : null)));
    markCurrent();
  }
  function badge() { const b = document.querySelector('[data-page="proposals"] .badge'); if (b) { b.hidden = !S.proposals; b.textContent = S.proposals; } }
  function markCurrent() {
    const r = S.current || {};
    document.querySelectorAll('.nav a').forEach(a => a.removeAttribute('aria-current'));
    const sel = r.page && r.page.id === 'cockpit' ? `[data-sys="${CSS.escape(r.system || '')}"]` : r.page ? `[data-page="${r.page.id}"]` : null;
    const a = sel && document.querySelector(`.nav a${sel}`); if (a) a.setAttribute('aria-current', 'page');
  }

  // ── the router: every page from the contract, each in its own frame ──
  function resolve(hash) {
    const parts = (hash || '#/overview').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (!parts.length) return resolve('#/overview');
    if (parts[0] === 'c') return { page: S.contract.pages.find(p => p.id === 'cockpit'), system: parts[1], tab: parts[2] || 'overview', key: `cockpit:${parts[1]}` };
    const page = S.contract.pages.find(p => p.route === `#/${parts[0]}` && p.built);
    return page ? { page, key: page.id } : { missing: parts.join('/') };
  }
  function route() {
    if (!S.contract) return;
    const r = resolve(location.hash); S.current = r; markCurrent();
    stage.querySelectorAll('.say').forEach(e => e.remove());
    if (r.missing) { for (const f of S.frames.values()) f.classList.remove('on'); $('crumb-eyebrow').textContent = 'COS'; $('crumb-title').textContent = 'No such page';
      const box = h('div'); stage.append(box); COS.say(box, { glyph: 'compass', title: 'No such page', text: `Nothing in the manager's contract answers <code>#/${esc(r.missing)}</code>.` }); return; }
    if (r.page.id === 'cockpit' && !S.systems.some(s => s.name === r.system)) {
      for (const f of S.frames.values()) f.classList.remove('on'); $('crumb-eyebrow').textContent = 'System'; $('crumb-title').textContent = r.system || '—';
      const box = h('div'); stage.append(box); COS.say(box, { glyph: 'layers', title: `No system "${esc(r.system)}" is declared`, text: 'A system appears here when its compartment.json declares a process (runtime.process).' }); return;
    }
    $('crumb-eyebrow').textContent = r.page.id === 'cockpit' ? 'System' : r.page.nav === 'foot' ? 'COS' : 'Compartment OS';
    $('crumb-title').textContent = r.page.id === 'cockpit' ? r.system : r.page.title;
    document.title = `${r.page.id === 'cockpit' ? r.system : r.page.title} · COS`;
    let f = S.frames.get(r.key);
    if (!f) {
      const qs = r.page.id === 'cockpit' ? `?system=${encodeURIComponent(r.system)}&tab=${encodeURIComponent(r.tab)}` : '';
      f = h('iframe', { src: `../${r.page.path}index.html${qs}`, title: r.page.title, 'data-page': r.page.id });
      f.addEventListener('load', () => f.contentWindow.postMessage({ type: 'cos.theme', theme: document.documentElement.dataset.theme }, location.origin));
      stage.append(f); S.frames.set(r.key, f);
      if (S.frames.size > 8) { const [k, old] = S.frames.entries().next().value; if (old !== f) { old.remove(); S.frames.delete(k); } }
    } else if (r.page.id === 'cockpit') f.contentWindow.postMessage({ type: 'cos.event', event: 'cos.ui.tab', data: { tab: r.tab } }, location.origin);
    for (const x of S.frames.values()) x.classList.toggle('on', x === f);
  }
  addEventListener('hashchange', route);

  // ── the bus: one stream, relayed by declaration ──
  function relay(event, data) {
    for (const [win, listens] of S.listens) { if (!win || win.closed) { S.listens.delete(win); continue; } if (listens.has(event)) win.postMessage({ type: 'cos.event', event, data }, location.origin); }
  }
  function onState({ name, state, pid }) {
    const s = S.systems.find(x => x.name === name); if (!s) return;
    if (s.state !== state) BUS.flash(name, state);
    Object.assign(s, { state, pid }); renderSystems(); relay('cos.system.state', { name, state, pid });
  }
  function busState(kind, label) {
    const el = $('bus-state'); el.querySelector('.dot').dataset.s = kind; el.querySelector('.label').textContent = label;
    $('bus-count').textContent = S.events ? `${S.events}` : '';
  }
  function connect() {
    if (S.es) S.es.close();
    const es = new EventSource('/api/cos/events'); S.es = es;
    es.addEventListener('cos.hello', (m) => { stopPoll(); busState('up', 'live'); const d = JSON.parse(m.data); for (const s of d.systems) onState(s); });
    es.addEventListener('cos.ledger', (m) => { const { entry } = JSON.parse(m.data); S.events++; busState('up', 'live');
      BUS.pulse(entry.system, `${entry.kind}${/^person|^agent/.test(entry.by || '') ? ' by-person' : ''}`); relay('cos.ledger', { entry });
      if (/^proposal-/.test(entry.kind)) refreshProposals(); });
    es.addEventListener('cos.system.state', (m) => onState(JSON.parse(m.data)));
    es.onerror = () => { busState('starting', 'reconnecting — reading every 5 s'); startPoll(); };
  }
  function startPoll() {
    if (S.poll) return;
    S.poll = setInterval(async () => { try { const j = await get('/api/cos/systems'); for (const s of j.systems) onState({ name: s.name, state: s.state, pid: s.pid }); }
      catch (e) { busState('down', 'the manager is not answering'); } }, 5000);
  }
  function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  // ── messages from pages ──
  addEventListener('message', (m) => {
    if (m.origin !== location.origin || !m.data) return; const d = m.data;
    if (d.type === 'cos.ready') { S.listens.set(m.source, new Set(d.listens || [])); return; }
    if (d.type === 'cos.confirm') { confirmAsk(d).then(yes => m.source.postMessage({ type: 'cos.confirmed', id: d.id, yes }, location.origin)); return; }
    if (d.type === 'cos.emit') {
      const page = S.contract.pages.find(p => p.id === d.page);
      if (!page || !(page.emits || []).includes(d.event)) { notice('err', `Refused: page "${d.page}" emitted "${d.event}", which the contract does not declare for it.`); return; }
      if (d.event === 'cos.ui.navigate' && d.data && d.data.to) location.hash = d.data.to.replace(/^#?/, '#');
      else if (d.event === 'cos.ui.notice') notice(d.data.level || 'info', d.data.text || '');
      else relay(d.event, d.data);
    }
  });

  // ── confirm, over everything ──
  function confirmAsk({ title, body, act, danger }) {
    const sc = $('confirm'), dlg = sc.querySelector('.dialog');
    $('confirm-title').textContent = title; $('confirm-body').innerHTML = body || ''; $('confirm-yes').textContent = act || 'Confirm';
    $('confirm-ic').innerHTML = icon(danger ? 'bolt' : 'hand'); dlg.classList.toggle('danger', !!danger); sc.hidden = false; $('confirm-yes').focus();
    return new Promise((res) => {
      const done = (v) => { sc.hidden = true; $('confirm-yes').onclick = $('confirm-no').onclick = sc.onclick = null; removeEventListener('keydown', key); res(v); };
      const key = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
      $('confirm-yes').onclick = () => done(true); $('confirm-no').onclick = () => done(false); sc.onclick = (e) => { if (e.target === sc) done(false); };
      addEventListener('keydown', key);
    });
  }
  function notice(level, text) {
    const n = h('div', { class: `notice ${level}` }, h('span', { class: 'ic', html: icon(level === 'err' ? 'x' : level === 'ok' ? 'check' : level === 'warn' ? 'bolt' : 'spark') }), h('div', { html: esc(text) }));
    $('notices').append(n); setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 320); }, level === 'err' ? 9000 : 4500);
  }

  // ── the top bar: the manager, the host ──
  async function refreshTop() {
    try {
      const [hl, us] = await Promise.all([get('/api/cos/health'), get('/api/cos/usage')]);
      $('manager').querySelector('.dot').dataset.s = 'up';
      $('manager-text').textContent = `manager · pid ${hl.pid} · ${hl.systems} systems`;
      const host = us.usage.host, cpu = Math.min(1, host.load1 / host.cpus), used = 1 - host.freeMemPct / 100;
      const mc = $('m-cpu'), mm = $('m-mem');
      mc.querySelector('i').style.width = `${Math.round(cpu * 100)}%`; mc.querySelector('.v').textContent = `${Math.round(cpu * 100)}%`; mc.classList.toggle('hot', cpu > 0.85);
      mm.querySelector('i').style.width = `${Math.round(used * 100)}%`; mm.querySelector('.v').textContent = `${Math.round(used * 100)}%`;
      const fl = mm.querySelector('.floor'); if (host.haltPct != null) { fl.style.display = 'block'; fl.style.left = `${(1 - host.haltPct) * 100}%`; }
      mm.classList.toggle('hot', host.haltPct != null && host.freeMemPct / 100 < host.haltPct * 1.5);
      mm.title = `host memory in use: ${host.totalMB - host.freeMB} of ${host.totalMB} MB · the supervisor halts spawns below ${Math.round((host.haltPct || 0) * 100)}% free`;
    } catch (e) { $('manager').querySelector('.dot').dataset.s = 'down'; $('manager-text').textContent = 'manager not answering'; }
  }
  async function refreshProposals() { try { S.proposals = (await get('/api/cos/proposals?open=1')).proposals.length; badge(); } catch (_) {} }

  // ── go to ──
  let sel = 0;
  function gotoOpen() {
    $('goto').hidden = false; $('goto-q').value = ''; gotoList(); $('goto-q').focus();
  }
  function gotoItems(q) {
    const items = [...S.contract.pages.filter(p => p.built && p.nav !== 'systems').map(p => ({ t: p.title, k: 'page', to: p.route, ic: ICON[p.id] })),
      ...S.systems.map(s => ({ t: s.name, k: COS.stateLabel(s.state), to: `#/c/${encodeURIComponent(s.name)}`, ic: 'layers' }))];
    q = q.trim().toLowerCase(); return q ? items.filter(i => i.t.toLowerCase().includes(q)) : items;
  }
  function gotoList() {
    const items = gotoItems($('goto-q').value); sel = Math.min(sel, Math.max(0, items.length - 1));
    $('goto-list').replaceChildren(...items.map((i, n) => h('a', { href: i.to, class: n === sel ? 'sel' : '', html: `${icon(i.ic)}<span>${esc(i.t)}</span><span class="k">${esc(i.k)}</span>`, onclick: () => { $('goto').hidden = true; } })));
    if (!items.length) $('goto-list').replaceChildren(h('div', { class: 'say', style: 'padding:24px' }, h('p', {}, 'Nothing by that name.')));
  }
  $('goto-open').innerHTML = `<span class="ic">${icon('search')}</span><span>Go to</span><kbd>${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl '}K</kbd>`;
  $('goto-open').onclick = gotoOpen; $('goto-q').oninput = () => { sel = 0; gotoList(); };
  $('goto').onclick = (e) => { if (e.target === $('goto')) $('goto').hidden = true; };
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('goto').hidden ? gotoOpen() : ($('goto').hidden = true); return; }
    if ($('goto').hidden) return;
    const items = gotoItems($('goto-q').value);
    if (e.key === 'Escape') $('goto').hidden = true;
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); gotoList(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); gotoList(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { location.hash = items[sel].to; $('goto').hidden = true; }
  });

  // ── start ──
  async function start() {
    setTheme((() => { try { return localStorage.getItem('cos.theme'); } catch (_) { return null; } })() || 'nexus');
    try {
      S.contract = (await get('/api/cos/contract')).contract;
      S.systems = (await get('/api/cos/systems')).systems;
    } catch (e) {
      stage.replaceChildren(); const box = h('div'); stage.append(box); COS.down(box, e.message);
      $('manager').querySelector('.dot').dataset.s = 'down'; $('manager-text').textContent = 'manager not answering'; busState('down', 'no manager');
      setTimeout(start, 3000); return;
    }
    stage.replaceChildren();
    BUS.lanes(S.systems.map(s => s.name)); renderNav(); route(); connect(); refreshTop(); refreshProposals();
    setInterval(refreshTop, 5000);
  }
  start();
})();
