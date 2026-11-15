/* ERAVOS runtime — add-menu.js → window.AddMenu (spec eravos.shell-expansion § add menu)
 * ＋ Add opens a full popup, not a side panel:
 *   rail     — Modes · All tools · categories (active modes first, then everything a pack installed)
 *   main     — the modes page (agnostic canvas) or a grid of tool cards; search filters everything
 *   detail   — the selected tool's dependency list: mode, services, what it adds to the toolbar (✚ new / ✓ already
 *              there), inputs, outputs, works-with, presets — read from Expansion.deps(), the same list the specs print
 * 3.63 a click on a card opens that tool's page (a suite's: its suite page) — ← Back on the page returns here, as you left it.
 * Keyboard: type to search · ↑↓←→ move · Enter adds · Space opens the page · Esc closes. Domain-free: every word on screen comes from
 * descriptors, modes and units the packs registered. */
(function (global) {
  'use strict';
  const IC = (x, text, fb) => global.Icons ? global.Icons.label(x, text, { fallback: fb }) : ((fb || '') + ' ' + text).trim();   // 3.64 a drawn icon, then the words
  let open = null;

  function show(S, X, o) {
    o = o || {};
    if (open) { open.close(); return null; }
    const UI = global.UIKit, h = UI.h, F = global.OrganismFactory;
    S.activate();
    const state = { view: o.view || (X.agnostic() && X.modes().length ? 'modes' : 'all'), cat: o.cat || null, sel: o.sel || null, q: o.q || '' };
    const ov = h('div', { class: 'overlay addpop', role: 'dialog', 'aria-label': 'Add to canvas' });
    const q = h('input', { class: 'ap-search', placeholder: 'Search tools, modes, what they do…', 'aria-label': 'Search' });
    const closeBtn = h('button', { class: 'ap-x', title: 'Close (Esc)', text: '×' });
    const modeChips = h('div', { class: 'ap-chips' });
    const rail = h('nav', { class: 'ap-rail' }), main = h('section', { class: 'ap-main' }), detail = h('aside', { class: 'ap-detail' });
    const foot = h('div', { class: 'ap-foot', text: 'Click a tool for its page · type to search · ↑↓ move · Enter adds · Space: its page · Esc closes' });
    const box = h('div', { class: 'ap-box' }, [
      h('header', { class: 'ap-head' }, [h('div', { class: 'ap-title' }, [h('b', { text: '＋ Add to canvas' }), modeChips]), q, closeBtn]),
      h('div', { class: 'ap-body' }, [rail, main, detail]), foot,
    ]);
    ov.appendChild(box);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); unsub(); unsubCat(); if (open && open.ov === ov) open = null; }
    closeBtn.onclick = close;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });

    // P38 catalog: installed tools (defined) + tools the catalog offers but this canvas has not installed (cards say so; adding installs)
    const Cat = global.Catalog;
    const avail = () => Cat ? Cat.available().filter(t => !t.hidden && !Cat.isRemoved(t.id)).map(t => ({ id: t.id, label: t.label, icon: t.icon, accent: t.accent, blurb: t.summary, category: t.category, presets: {}, _avail: t })) : [];
    // 3.48 suites (eravos.suites ADDENDUM 2026-10-21): each suite is a card of its own; adding it opens its suite window
    // (a fresh profile has not installed the suite window yet: the card still shows, from the catalog, and adding installs it)
    const hubMeta = (s) => F.def(s.hub) || (Cat && Cat.meta && Cat.meta(s.hub)) || null;
    const suiteCards = () => global.Suites ? global.Suites.list().filter(s => hubMeta(s)).map(s => ({ id: 'suite:' + s.id, label: s.label, icon: s.icon, accent: s.accent, blurb: s.blurb,
      category: hubMeta(s).category, presets: {}, _suite: s })) : [];
    const defs = () => F.defined().filter(d => !d.hidden && !(Cat && Cat.isRemoved(d.id))).concat(avail(), suiteCards());
    const NODEP = { pending: [], toolbar: [], services: [], inputs: [], outputs: [], works_with: [], notes: [], mode: null, modeLabel: null };
    const depOf = new Map();
    const dep = (d) => { if (d._avail) return NODEP; if (d._suite) return depOf.get(d.id) || (depOf.set(d.id, Object.assign({}, F.def(d._suite.hub) ? X.deps(F.def(d._suite.hub)) : NODEP, { works_with: d._suite.parts.map(p => p.tool).filter(t => F.def(t)) })), depOf.get(d.id)); if (!depOf.has(d.id)) depOf.set(d.id, X.deps(d)); return depOf.get(d.id); };
    const unsub = X.onChange(() => { depOf.clear(); render(); }), unsubCat = Cat ? Cat.onChange(() => { depOf.clear(); render(); }) : () => {};

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

    async function add(d) {
      if (d._suite) { const id = await global.Suites.openAsync(d._suite.id, { K: S.K }); if (id) S.toast(`${d.label} — its window is on the canvas: ＋ Build the whole system, or add parts one by one`, 'good', 3200); close(); return; }
      if (d._avail) { S.toast(`Installing ${d.label}…`, '', 1500); const got = await Cat.install(d.id, S.K); if (!got.includes(d.id)) { S.toast(`${d.label} could not be installed — details: the red dot, top right.`, 'bad', 6000); return; } }
      const id = F.spawn(d.id);
      if (id) S.toast(`${d.label} added`, 'good', 1800);
      close();
    }

    // 3.63 a tool's page (a suite's page) instead of the menu; ← Back on it opens the menu again where you were
    function page(d) {
      const TP = global.ToolPage; if (!TP || d._avail) { select(d.id); return false; }
      const back = () => show(S, X, { view: state.view, cat: state.cat, sel: d.id, q: state.q }), K = S.K;
      close(); if (d._suite) TP.openSuite(d._suite.id, { K, back }); else TP.open(d.id, { K, back });
      return true;
    }

    // 3.64 the drawn picture of a card with no screenshot: the icon on its accent; a suite also shows the tools it is made of
    function tileOf(d, size, cls) {
      if (!global.Icons) return h('span', { class: cls || '', text: d.icon || '◻' });
      const t = global.Icons.tile(d, { size, accent: d.accent, fallback: d.icon || '◻' }); if (cls) t.classList.add(cls); return t;
    }
    function cardArt(d) {
      const art = h('div', { class: 'ap-art' }, [tileOf(d, 64, 'ap-art-tile')]);
      if (d._suite) art.appendChild(h('div', { class: 'ap-art-parts' }, d._suite.parts.slice(0, 8).map(p => {
        const o = F.def(p.tool) || (Cat && Cat.meta && Cat.meta(p.tool)) || { id: p.tool };
        return h('span', { class: 'ap-art-part', title: (o.label || p.tool) + (p.role ? ' — ' + p.role : ''), html: IC(o.id ? o : { id: p.tool }, '', o.icon || '◻') });
      })));
      return art;
    }

    // ---------------------------------------------------------------- rail
    function renderRail() {
      rail.innerHTML = '';
      const item = (label, count, on, fn, cls, ic) => rail.appendChild(h('button', { class: 'ap-rail-item ' + (on ? 'on ' : '') + (cls || ''), onclick: fn }, [h('span', { class: 'ap-rail-l', html: IC(ic || null, label) }), count !== null ? h('small', { text: String(count) }) : null]));
      if (X.modes().length) item('Modes', X.modes().length, state.view === 'modes' && !state.q, () => { state.view = 'modes'; state.q = ''; q.value = ''; render(); }, 'top', 'layers');
      item('All tools', defs().length, state.view === 'all' && !state.q, () => { state.view = 'all'; state.q = ''; q.value = ''; render(); }, 'top', 'square-stack');
      const cats = categories(); if (!cats.length) return;
      rail.appendChild(h('div', { class: 'ap-rail-sec', text: 'CATEGORIES' }));
      cats.forEach(c => item(c.id, c.n, state.view === 'cat' && state.cat === c.id && !state.q, () => { state.view = 'cat'; state.cat = c.id; state.q = ''; q.value = ''; render(); }, '', 'cat:' + c.id));
    }
    function renderChips() {
      modeChips.innerHTML = '';
      const act = X.modes().filter(m => X.isActive(m.id));
      if (!act.length) modeChips.appendChild(chip(X.built().length ? 'expanded by the tools you added' : 'agnostic canvas — nothing loaded yet', 'dim'));
      act.forEach(m => { const c = chip('', 'mode', 'active mode'); c.innerHTML = IC('mode:' + m.id, m.label, m.icon); modeChips.appendChild(c); });
    }

    // ---------------------------------------------------------------- modes page
    function renderModes() {
      main.innerHTML = '';
      main.appendChild(h('div', { class: 'ap-lead' }, [h('h2', { text: 'Pick a mode — or stay agnostic' }), h('p', { text: 'The canvas starts empty and domain-free. A mode turns on the toolbar and tools it needs. Adding any single tool turns on only what that tool needs.' })]));
      const grid = h('div', { class: 'ap-modes' });
      X.modes().forEach(m => {
        const on = X.isActive(m.id);
        const tools = defs().filter(d => m.categories.includes(d.category)).length;
        const unitsRow = h('div', { class: 'ap-chiprow' }, m.units.map(u => { const L = X.units().find(x => x.id === u); return chip((L ? L.label : u).trim(), L && L.built ? 'built' : 'new', L ? L.describes : ''); }));
        grid.appendChild(h('div', { class: 'ap-mode ' + (on ? 'on' : ''), style: { '--acc': m.accent || '#00d4ff' } }, [
          h('div', { class: 'ap-mode-top' }, [h('span', { class: 'ap-mode-ic', html: IC('mode:' + m.id, '', m.icon || '◈') }), h('div', {}, [h('b', { text: m.label }), h('small', { text: `${tools} tools · ${m.categories.length} categories` })])]),
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
        if (dd.modeLabel && !X.isActive(dd.mode)) chips.push(chip(dd.modeLabel, 'mode', 'belongs to this mode — adding the tool does not switch the mode on'));
        if (dd.pending.length) chips.push(chip('＋' + dd.pending.length + ' toolbar', 'new', 'adds: ' + dd.pending.map(u => u.label).join(', ')));
        else if (dd.toolbar.length) chips.push(chip('ready', 'built', 'everything it needs is already on'));
        const meta = Cat && Cat.meta(d.id), np = d._avail ? d._avail.presets : Object.keys(d.presets || {}).length;
        if (d._avail) chips.unshift(chip('not installed', 'new', 'adding it installs it (it stays installed until you remove it)'));
        if (np) chips.push(chip(np + ' presets', 'dim', 'presets in its packs'));
        // 3.44: the card leads with the tool's own display (thumb.png, 16:10) — the old 84×52 corner of the whole window showed
        // only a title bar. No picture → the icon on the tool's colour, same frame, so the grid stays even.
        // 3.88 a painting of what it does (art.svg) leads when the tool has one
        const pic = meta && (meta.art || meta.thumb || meta.preview), frame = h('div', { class: 'ap-card-pic' + (meta && (meta.art || meta.thumb) ? '' : ' fit') + (meta && meta.art ? ' painted' : '') + (d._suite ? ' suite' : '') }, [cardArt(d)]);
        if (pic) frame.appendChild(h('img', { class: 'ap-card-img', src: pic, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }));
        const card = h('div', { class: 'ap-card' + (d._avail ? ' avail' : ''), tabindex: '-1', style: { '--acc': d.accent || '#00d4ff' }, 'data-id': d.id }, [
          frame,
          h('div', { class: 'ap-card-tx' }, [h('b', {}, [h('span', { class: 'ap-card-glyph', html: IC(d, '', d.icon || '') }), d.label]), h('small', { text: d.blurb || '' }), h('div', { class: 'ap-chiprow' }, chips)]),
        ]);
        card.onclick = () => page(d);
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
      const d = state.sel && (F.def(state.sel) || defs().find(x => x.id === state.sel));
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
      // 3.48 fix (his screenshot, 2026-10-21): a tool not installed yet has no page or remove button; append(null) printed "nullnull"
      detail.append(...[
        h('div', { class: 'ap-d-head', style: { '--acc': d.accent || '#00d4ff' } }, [tileOf(d, 48, 'ap-d-tile'), h('div', {}, [h('h3', { text: d.label }), h('small', { text: (d.category || 'General') + ' · v' + (d.version || '1.0.0') })])]),
        (Cat && Cat.meta(d.id) && Cat.meta(d.id).preview) ? h('div', { class: 'ap-d-shot' }, [h('img', { src: Cat.meta(d.id).preview, alt: d.label + ' — the whole window', onerror: (e) => e.target.parentNode.remove() })]) : '',
        h('p', { class: 'ap-d-blurb', text: d.blurb || '' }),
        // 3.71 his call: the page is the pink button, Add to canvas under it
        !d._avail && global.ToolPage ? h('button', { class: 'tb-btn primary ap-addbtn ap-pagebtn', html: IC('book-open', d._suite ? 'Open the suite page' : 'Open its page'), title: d._suite ? 'every part, its scenes and macros, how it is wired: build it whole or a part at a time' : 'its panel, live, and everything it can do: mods, packs, motion, macros', onclick: () => page(d) }) : null,
        h('button', { class: 'tb-btn ' + (!d._avail && global.ToolPage ? 'ap-addbtn2' : 'primary ap-addbtn'), html: IC('plus', d._suite ? 'Open the suite' : d._avail ? 'Install + add to canvas' : dd.pending.length ? `Add — turns on ${dd.pending.length} toolbar item${dd.pending.length > 1 ? 's' : ''}` : 'Add to canvas'), onclick: () => add(d) }),
        Cat && Cat.meta(d.id) && !d._avail ? h('button', { class: 'tb-btn ap-rmbtn', text: 'Remove from this canvas', title: 'uninstall: gone from ＋ Add now; its code leaves at the next start. Windows already open keep working.', onclick: () => { Cat.remove(d.id); S.toast(`${d.label} removed — gone after the next start. Add it again any time from ＋ Add.`, '', 4000); } }) : null,
      ].filter(Boolean));
      [
        sec('MODE', [row(d._avail ? 'not installed yet — adding it installs it' + (d._avail.domain ? ' (' + d._avail.domain + ')' : '') : dd.modeLabel ? dd.modeLabel : 'none — domain-free', dd.mode ? (X.isActive(dd.mode) ? 'active' : 'stays off — only what this tool needs turns on') : '')]),
        sec('NEEDS', dd.services.map(s => row('• ' + s.label, s.why || ''))),
        sec('ADDS TO THE TOOLBAR', dd.toolbar.map(u => row((u.built ? '✓ ' : '✚ ') + u.label, u.built ? 'already on' : u.describes, u.built ? 'built' : 'new'))),
        sec('INPUTS', ins.map(x => row('← ' + portName(x), x.intent))),
        sec('OUTPUTS', outs.map(x => row('→ ' + portName(x), x.intent))),
        sec('FOLLOWS', follows.length ? [row(follows.map(x => x.kind.split('|')[0]).join(' · '), 'global broadcasts — no wire needed')] : []),
        sec('WORKS WITH', dd.works_with.length ? [h('div', { class: 'ap-chiprow' }, dd.works_with.map(id => { const o = F.def(id); const c = chip('', 'link'); c.innerHTML = IC(o, o.label, o.icon); c.onclick = () => { if (!cards.some(x => x.d.id === id)) { state.view = 'all'; state.q = ''; q.value = ''; renderTools(); } select(id); }; return c; }))] : []),
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
      const cols = Math.max(1, Math.round(main.querySelector('.ap-grid') ? main.querySelector('.ap-grid').clientWidth / 280 : 1));
      const go = (n) => { e.preventDefault(); select(cards[Math.max(0, Math.min(cards.length - 1, n))].d.id); };
      if (e.key === 'ArrowDown') go(i + cols); else if (e.key === 'ArrowUp') go(i - cols);
      else if (e.key === 'ArrowRight' && e.target !== q) go(i + 1); else if (e.key === 'ArrowLeft' && e.target !== q) go(i - 1);
      else if (e.key === 'Enter') { e.preventDefault(); const c = cards[i]; if (c) add(c.d); }
      else if (e.key === ' ' && e.target !== q) { e.preventDefault(); const c = cards[i]; if (c) page(c.d); }
    }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    q.value = state.q; render(); if (o.sel && cards.some(c => c.d.id === o.sel)) select(o.sel); q.focus();
    open = { ov, close };
    return open;
  }

  global.AddMenu = { show, isOpen: () => !!open, close: () => { if (open) open.close(); } };
})(typeof window !== 'undefined' ? window : globalThis);
