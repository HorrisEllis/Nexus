/* ERAVOS runtime — add-menu.js → window.AddMenu (spec eravos.shell-expansion § add menu)
 * ＋ Add opens a full popup, not a side panel:
 *   rail     — Modes · All tools · categories (active modes first, then everything a pack installed)
 *   main     — the modes page (agnostic canvas) or a grid of tool cards; search filters everything
 *   detail   — the selected tool's dependency list: mode, services, what it adds to the toolbar (✚ new / ✓ already
 *              there), inputs, outputs, works-with, presets — read from Expansion.deps(), the same list the specs print
 * Keyboard: type to search · ↑↓←→ move · Enter adds · Esc closes. Domain-free: every word on screen comes from
 * descriptors, modes and units the packs registered. */
(function (global) {
  'use strict';
  let open = null;

  function show(S, X, o) {
    o = o || {};
    if (open) { open.close(); return null; }
    const UI = global.UIKit, h = UI.h, F = global.OrganismFactory;
    S.activate();
    const state = { view: o.view || (X.agnostic() && X.modes().length ? 'modes' : 'all'), cat: null, sel: null, q: '' };
    const ov = h('div', { class: 'overlay addpop', role: 'dialog', 'aria-label': 'Add to canvas' });
    const q = h('input', { class: 'ap-search', placeholder: 'Search tools, modes, what they do…', 'aria-label': 'Search' });
    const closeBtn = h('button', { class: 'ap-x', title: 'Close (Esc)', text: '×' });
    const modeChips = h('div', { class: 'ap-chips' });
    const rail = h('nav', { class: 'ap-rail' }), main = h('section', { class: 'ap-main' }), detail = h('aside', { class: 'ap-detail' });
    const foot = h('div', { class: 'ap-foot', text: 'Type to search · ↑↓ move · Enter adds · Esc closes' });
    const box = h('div', { class: 'ap-box' }, [
      h('header', { class: 'ap-head' }, [h('div', { class: 'ap-title' }, [h('b', { text: '＋ Add to canvas' }), modeChips]), q, closeBtn]),
      h('div', { class: 'ap-body' }, [rail, main, detail]), foot,
    ]);
    ov.appendChild(box);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); unsub(); if (open && open.ov === ov) open = null; }
    closeBtn.onclick = close;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });

    const defs = () => F.defined().filter(d => !d.hidden);
    const depOf = new Map();
    const dep = (d) => { if (!depOf.has(d.id)) depOf.set(d.id, X.deps(d)); return depOf.get(d.id); };
    const unsub = X.onChange(() => { depOf.clear(); render(); });

    // categories: those of active modes first (their order), then every other mode's, then anything else
    // 3.26: inside a mode, the menu shows that mode's tools only — other modes' tools stay one search (or the Modes page) away
    const inMode = (d) => { if (!X.active().length) return true; const m = dep(d).mode; return !m || X.isActive(m); };
    const shown = () => defs().filter(d => state.q || inMode(d));
    function categories() {
      const order = [], push = (c) => { if (c && !order.includes(c)) order.push(c); };
      X.modes().filter(m => X.isActive(m.id)).forEach(m => m.categories.forEach(push));
      X.modes().filter(m => !X.isActive(m.id)).forEach(m => m.categories.forEach(push));
      shown().forEach(d => push(d.category || 'General'));
      return order.map(c => ({ id: c, n: shown().filter(d => (d.category || 'General') === c).length })).filter(c => c.n);
    }
    function matches(d) {
      const s = state.q.trim().toLowerCase(); if (!s) return true;
      const dd = dep(d);
      const hay = [d.label, d.id, d.blurb, d.category, dd.modeLabel, ...(dd.toolbar || []).map(u => u.label), ...Object.keys(d.presets || {})].join(' ').toLowerCase();
      return s.split(/\s+/).every(w => hay.includes(w));
    }
    function list() {
      let ds = shown().filter(matches);
      if (!state.q && state.view === 'cat' && state.cat) ds = ds.filter(d => (d.category || 'General') === state.cat);
      const cats = categories().map(c => c.id);
      return ds.sort((a, b) => cats.indexOf(a.category || 'General') - cats.indexOf(b.category || 'General'));
    }

    function chip(text, cls, title) { return h('span', { class: 'ap-chip ' + (cls || ''), text, title: title || '' }); }

    function add(d) {
      const id = F.spawn(d.id);
      if (id) S.toast(`${d.icon || ''} ${d.label} added`, 'good', 1800);
      close();
    }

    // ---------------------------------------------------------------- rail
    function renderRail() {
      rail.innerHTML = '';
      const item = (label, count, on, fn, cls) => rail.appendChild(h('button', { class: 'ap-rail-item ' + (on ? 'on ' : '') + (cls || ''), onclick: fn }, [h('span', { text: label }), count !== null ? h('small', { text: String(count) }) : null]));
      if (X.modes().length) item('◈ Modes', X.modes().length, state.view === 'modes' && !state.q, () => { state.view = 'modes'; state.q = ''; q.value = ''; render(); }, 'top');
      item('▦ All tools', defs().length, state.view === 'all' && !state.q, () => { state.view = 'all'; state.q = ''; q.value = ''; render(); }, 'top');
      const cats = categories(); if (!cats.length) return;
      rail.appendChild(h('div', { class: 'ap-rail-sec', text: 'CATEGORIES' }));
      cats.forEach(c => item(c.id, c.n, state.view === 'cat' && state.cat === c.id && !state.q, () => { state.view = 'cat'; state.cat = c.id; state.q = ''; q.value = ''; render(); }));
    }
    function renderChips() {
      modeChips.innerHTML = '';
      const act = X.modes().filter(m => X.isActive(m.id));
      if (!act.length) modeChips.appendChild(chip(X.built().length ? 'expanded by the tools you added' : 'agnostic canvas — nothing loaded yet', 'dim'));
      act.forEach(m => modeChips.appendChild(chip((m.icon || '') + ' ' + m.label, 'mode', 'active mode')));
    }

    // ---------------------------------------------------------------- modes page
    function renderModes() {
      main.innerHTML = '';
      main.appendChild(h('div', { class: 'ap-lead' }, [h('h2', { text: 'Pick a mode — or stay agnostic' }), h('p', { text: 'The canvas starts empty and domain-free. A mode turns on the toolbar and tools it needs. Adding any single tool turns on only what that tool needs.' })]));
      const grid = h('div', { class: 'ap-modes' });
      X.modes().forEach(m => {
        const on = X.isActive(m.id);
        const tools = defs().filter(d => m.categories.includes(d.category)).length;
        const unitsRow = h('div', { class: 'ap-chiprow' }, m.units.map(u => { const L = X.units().find(x => x.id === u); return chip((L ? (L.icon + ' ' + L.label) : u).trim(), L && L.built ? 'built' : 'new', L ? L.describes : ''); }));
        grid.appendChild(h('div', { class: 'ap-mode ' + (on ? 'on' : ''), style: { '--acc': m.accent || '#00d4ff' } }, [
          h('div', { class: 'ap-mode-top' }, [h('span', { class: 'ap-mode-ic', text: m.icon || '◈' }), h('div', {}, [h('b', { text: m.label }), h('small', { text: `${tools} tools · ${m.categories.length} categories` })])]),
          h('p', { text: m.blurb || '' }),
          h('div', { class: 'ap-sub', text: 'Turns on' }), unitsRow,
          h('div', { class: 'ap-sub', text: 'Shows' }), h('div', { class: 'ap-chiprow' }, m.categories.map(c => chip(c, 'cat'))),
          h('div', { class: 'ap-mode-act' }, [
            on ? h('button', { class: 'tb-btn on', text: '✓ Active — browse its tools', onclick: () => { state.view = 'cat'; state.cat = m.categories[0]; render(); } })
               : h('button', { class: 'tb-btn primary', text: 'Enter ' + m.label, onclick: () => { X.enterMode(m.id); state.view = 'cat'; state.cat = m.categories[0]; render(); } }),
          ]),
        ]));
      });
      grid.appendChild(h('div', { class: 'ap-mode ghost' }, [
        h('div', { class: 'ap-mode-top' }, [h('span', { class: 'ap-mode-ic', text: '◻' }), h('div', {}, [h('b', { text: 'Stay agnostic' }), h('small', { text: `${defs().length} tools from every pack` })])]),
        h('p', { text: 'Browse everything without switching anything on. Each tool lists what it needs; only that turns on when you add it.' }),
        h('div', { class: 'ap-mode-act' }, [h('button', { class: 'tb-btn', text: 'Browse all tools', onclick: () => { state.view = 'all'; render(); } })]),
      ]));
      main.appendChild(grid);
      if (!defs().length) main.appendChild(h('p', { class: 'ap-empty', text: 'No tools installed yet — drop a pack (.zip) onto the canvas.' }));
    }

    // ---------------------------------------------------------------- tool grid
    let cards = [];
    function renderTools() {
      main.innerHTML = ''; cards = [];
      const ds = list();
      const title = state.q ? `“${state.q}” — ${ds.length} found` : state.view === 'cat' ? state.cat : 'All tools';
      main.appendChild(h('div', { class: 'ap-gridhead' }, [h('h2', { text: title }), h('small', { text: ds.length + ' tools' })]));
      if (!ds.length) { main.appendChild(h('p', { class: 'ap-empty', text: 'Nothing matches. Try what you want to make or do, a category, or a mode.' })); return; }
      const grid = h('div', { class: 'ap-grid' });
      let lastCat = null;
      ds.forEach(d => {
        const cat = d.category || 'General';
        if (state.view !== 'cat' && cat !== lastCat) { grid.appendChild(h('div', { class: 'ap-grid-sec', text: cat.toUpperCase() })); lastCat = cat; }
        const dd = dep(d);
        const chips = [];
        if (dd.modeLabel && !X.isActive(dd.mode)) chips.push(chip(((X.mode_(dd.mode) || {}).icon || '') + ' ' + dd.modeLabel, 'mode', 'belongs to this mode — adding the tool does not switch the mode on'));
        if (dd.pending.length) chips.push(chip('＋' + dd.pending.length + ' toolbar', 'new', 'adds: ' + dd.pending.map(u => u.label).join(', ')));
        else if (dd.toolbar.length) chips.push(chip('ready', 'built', 'everything it needs is already on'));
        const card = h('div', { class: 'ap-card', tabindex: '-1', style: { '--acc': d.accent || '#00d4ff' }, 'data-id': d.id }, [
          h('span', { class: 'ap-card-ic', text: d.icon || '◻' }),
          h('div', { class: 'ap-card-tx' }, [h('b', { text: d.label }), h('small', { text: d.blurb || '' }), h('div', { class: 'ap-chiprow' }, chips)]),
        ]);
        card.onclick = () => select(d.id); card.ondblclick = () => add(d);
        grid.appendChild(card); cards.push({ el: card, d });
      });
      main.appendChild(grid);
      if (!state.sel || !ds.some(d => d.id === state.sel)) state.sel = ds[0].id;
      mark();
    }
    function mark() { cards.forEach(c => c.el.classList.toggle('sel', c.d.id === state.sel)); renderDetail(); }
    function select(id) { state.sel = id; mark(); const c = cards.find(x => x.d.id === id); if (c) c.el.scrollIntoView({ block: 'nearest' }); }

    // ---------------------------------------------------------------- detail = the dependency list
    function renderDetail() {
      detail.innerHTML = '';
      const d = state.sel && F.def(state.sel);
      if (!d || state.view === 'modes' && !state.q) {
        detail.appendChild(h('div', { class: 'ap-d-empty' }, [h('b', { text: 'Dependencies, up front' }), h('p', { text: 'Every tool says what it needs before you add it: the mode it belongs to, the services it relies on, and exactly what will appear on the toolbar.' })]));
        return;
      }
      const dd = dep(d);
      const sec = (t, kids) => { if (!kids || !kids.length) return null; return h('div', { class: 'ap-d-sec' }, [h('div', { class: 'ap-sub', text: t }), ...kids]); };
      const row = (a, b, cls) => h('div', { class: 'ap-d-row ' + (cls || '') }, [h('span', { text: a }), b ? h('small', { text: b }) : null]);
      const presets = Object.keys(d.presets || {});
      const ins = dd.inputs.filter(x => !x.ambient), outs = dd.outputs.filter(x => !x.ambient), follows = dd.inputs.filter(x => x.ambient);
      const portName = (x) => (x.port ? x.port + ' · ' : '') + x.kind;
      detail.append(
        h('div', { class: 'ap-d-head', style: { '--acc': d.accent || '#00d4ff' } }, [h('span', { class: 'ap-d-ic', text: d.icon || '◻' }), h('div', {}, [h('h3', { text: d.label }), h('small', { text: (d.category || 'General') + ' · v' + (d.version || '1.0.0') })])]),
        h('p', { class: 'ap-d-blurb', text: d.blurb || '' }),
        h('button', { class: 'tb-btn primary ap-addbtn', text: dd.pending.length ? `Add — turns on ${dd.pending.length} toolbar item${dd.pending.length > 1 ? 's' : ''}` : 'Add to canvas', onclick: () => add(d) }),
      );
      [
        sec('MODE', [row(dd.modeLabel ? ((X.mode_(dd.mode) || {}).icon || '') + ' ' + dd.modeLabel : 'none — domain-free', dd.mode ? (X.isActive(dd.mode) ? 'active' : 'stays off — only what this tool needs turns on') : '')]),
        sec('NEEDS', dd.services.map(s => row('• ' + s.label, s.why || ''))),
        sec('ADDS TO THE TOOLBAR', dd.toolbar.map(u => row((u.built ? '✓ ' : '✚ ') + (u.icon ? u.icon + ' ' : '') + u.label, u.built ? 'already on' : u.describes, u.built ? 'built' : 'new'))),
        sec('INPUTS', ins.map(x => row('← ' + portName(x), x.intent))),
        sec('OUTPUTS', outs.map(x => row('→ ' + portName(x), x.intent))),
        sec('FOLLOWS', follows.length ? [row(follows.map(x => x.kind.split('|')[0]).join(' · '), 'global broadcasts — no wire needed')] : []),
        sec('WORKS WITH', dd.works_with.length ? [h('div', { class: 'ap-chiprow' }, dd.works_with.map(id => { const o = F.def(id); const c = chip((o.icon || '') + ' ' + o.label, 'link'); c.onclick = () => { if (!cards.some(x => x.d.id === id)) { state.view = 'all'; state.q = ''; q.value = ''; renderTools(); } select(id); }; return c; }))] : []),
        sec('PRESETS', presets.length ? [h('div', { class: 'ap-chiprow' }, presets.slice(0, 10).map(p => chip(p, 'dim')).concat(presets.length > 10 ? [chip('+' + (presets.length - 10) + ' more', 'dim')] : []))] : []),
        sec('NOTES', dd.notes.map(n => row(n))),
      ].forEach(x => { if (x) detail.appendChild(x); });
    }

    function render() {
      renderChips(); renderRail();
      if (state.view === 'modes' && !state.q) { renderModes(); renderDetail(); }
      else renderTools();
    }
    q.addEventListener('input', () => { state.q = q.value; render(); });
    function onKey(e) {
      if (!document.body.contains(ov)) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (!cards.length || state.view === 'modes' && !state.q) return;
      const i = Math.max(0, cards.findIndex(c => c.d.id === state.sel));
      const cols = Math.max(1, Math.round(main.querySelector('.ap-grid') ? main.querySelector('.ap-grid').clientWidth / 260 : 1));
      const go = (n) => { e.preventDefault(); select(cards[Math.max(0, Math.min(cards.length - 1, n))].d.id); };
      if (e.key === 'ArrowDown') go(i + cols); else if (e.key === 'ArrowUp') go(i - cols);
      else if (e.key === 'ArrowRight' && e.target !== q) go(i + 1); else if (e.key === 'ArrowLeft' && e.target !== q) go(i - 1);
      else if (e.key === 'Enter') { e.preventDefault(); const c = cards[i]; if (c) add(c.d); }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    render(); q.focus();
    open = { ov, close };
    return open;
  }

  global.AddMenu = { show, isOpen: () => !!open, close: () => { if (open) open.close(); } };
})(typeof window !== 'undefined' ? window : globalThis);
