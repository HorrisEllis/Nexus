/* ERAVOS runtime — tool-page.js → window.ToolPage (spec eravos.tool-pages). Domain-free.
 * 📘 A whole page for every tool: what it is, its SUITE (the tools it was made to play with — load the lot in one click or
 * one by one), every MOD that fits each of its slots, the tools it LINKS with, every SOUND PACK with ▶ to hear a preset
 * and Load to put it on, every control (range, default, what can move it) and every input and output.
 * Opened from 📘 on a window (it then works on that window) or from ＋ Add (it works on a window it opens when needed).
 *   descriptor.suite { label?, blurb?, members: [member] }
 *     member { tool, as: 'mod' | 'linked', slot? (as mod), preset?, why?,
 *              wire?: { from: [ref, hookId], to: [ref, hookId] } }   ref = 'host' | 'self' | another member's tool id
 *     A linked member with no wire is joined to the host by the first pair of ports that fit (its link rule's way first);
 *     wire: false leaves it unwired (a tool that follows its partner without a cable).
 * Every step acts like the user: spawn, ui:* events, kernel wires, Mods.add — so all of it is undoable and saved.
 * 3.63 A SUITE has a page too (openSuite): what it is, every part (▶ hear its preset, ＋ add just that one, 📘 its own page),
 * its scenes, its macros and how it is wired — and ＋ Build the whole suite. A suite window's 📘 (or its name) opens it.
 * o.back (both pages): a ← button that takes you back where you came from (＋ Add opens pages this way). */
(function (global) {
  'use strict';
  const doc = global.document;
  const extraTabs = [];
  const TP = { addTab: (fn) => { extraTabs.push(fn); }, addKind, ioWords, kindGroups, open, openSuite, close, isOpen: () => !!cur, load, loadSuite, addMod, addLinked, presetGroups, partners, current: () => cur && (cur.suite ? { suiteId: cur.suite.id, target: cur.target } : { defId: cur.d.id, target: cur.target }) };
  let cur = null;   // { d, target, el, K, made: Map(tool → instanceId) }

  const F = () => global.OrganismFactory;
  // 3.64 drawn icons: IC(thing, words) → an icon then the words (markup); E escapes words for markup
  const E = (t) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const IC = (x, text, fb) => global.Icons ? global.Icons.label(x, text || '', { fallback: fb }) : E(((fb || '') + ' ' + (text || '')).trim());
  const tileOf = (x, size, fb) => global.Icons ? global.Icons.tile(x, { size, accent: x && x.accent, fallback: fb }) : global.UIKit.h('span', { class: 'tp-ic', text: fb || '◻' });
  const defOf = (id) => F().def(id) || { id, label: id };
  const nameH = (id) => { const x = defOf(id); return IC(x, x.label, x.icon || '◻'); };
  const kern = (o) => (o && o.K) || global.Kernel;
  const live = (id) => { const r = id && F().handle(id); return r && !r.unmounted ? r : null; };
  const toast = (m, k, ms) => { if (global.Shell && global.Shell.toast) global.Shell.toast(m, k || '', ms || 2200); };
  const hostedIds = () => new Set(Array.from(doc.querySelectorAll('.wm-win[data-instance]')).map(w => w.getAttribute('data-instance')));
  // windows of this tool on the canvas (mods hosted inside another tool have no window of their own)
  function windowsOf(K, defId) { const open_ = hostedIds(); return K.registry.byOrganism(defId).map(r => r.instance_id).filter(id => open_.has(id) && live(id)); }

  // ---------------------------------------------------------------- doing things (the page and tests use these)
  function ensureHost(st) {
    if (live(st.target)) return st.target;
    const id = F().spawn(st.d.id, { K: st.K }); if (!id) return null;
    dropSketch(st, id);   // what you set on the page's sketch comes along
    st.target = id; st.made.set(st.d.id, id); repaint(); return id;
  }
  function dropSketch(st, into) {
    const sk = live(st.sketch); st.sketch = null; if (!sk) return;
    if (into) { const r = live(into); if (r && sk.ctx.serialize) { try { r.ctx.deserialize(JSON.parse(JSON.stringify(sk.ctx.serialize()))); } catch (e) {} } }
    try { st.K.silence({ hard: true, instanceId: sk.instanceId, reason: 'page' }); } catch (e) {}
    F().close(sk.instanceId, 'page');
  }
  function presetLoad(K, id, name) { if (name) K.bus.publish('ui:preset_load:' + id, { name }); }
  function nextTo(hostId, n) {
    const w = global.CanvasWM && global.CanvasWM.windowOf(hostId); if (!w) return {};
    return { x: Math.round(parseFloat(w.style.left) + w.offsetWidth + 24), y: Math.round(parseFloat(w.style.top) + n * 60) };
  }
  // the instance a member's ref names
  function refId(st, ref, selfId) {
    if (ref === 'host') return st.target; if (ref === 'self') return selfId;
    if (live(st.made.get(ref))) return st.made.get(ref);
    return windowsOf(st.K, ref).filter(id => id !== st.target)[0] || null;
  }
  const ports = (d, dir) => (d.hooks || []).filter(h => !h.internal && (h.direction === dir || h.direction === 'inout') && !/^slot\./.test(h.hook_id));
  // first pair of ports that fit, a → b
  function autoWire(K, a, b) {
    const da = live(a).def, db = live(b).def;
    for (const o of ports(da, 'out')) for (const i of ports(db, 'in')) {
      if (o.wire_type !== i.wire_type || o.wire_type === 'event_bus') continue;
      const r = K.wires.register({ src: { instanceId: a, hookId: o.hook_id }, dst: { instanceId: b, hookId: i.hook_id } });
      if (r && r.ok) return r.wire_id;
    }
    return null;
  }
  function addMod(st, slotId, tool, preset) {
    st = st || cur; const host = ensureHost(st); if (!host) return null;
    const M = global.Mods, u = M.add(host, slotId, tool); if (!u) return null;
    if (preset) {
      let n = 0; const tryLoad = () => { const c = M.childOf(host, u); if (c) presetLoad(st.K, c, preset); else if (n++ < 30) global.setTimeout(tryLoad, 20); };
      tryLoad();
    }
    return u;
  }
  function addLinked(st, tool, o) {
    st = st || cur; o = o || {};
    const host = ensureHost(st); if (!host) return null;
    const id = F().spawn(tool, Object.assign({ K: st.K }, nextTo(host, st.made.size))); if (!id) return null;
    st.made.set(tool, id); presetLoad(st.K, id, o.preset);
    let ok = false;
    if (o.wire) {
      const src = refId(st, o.wire.from[0], id), dst = refId(st, o.wire.to[0], id);
      const r = src && dst && st.K.wires.register({ src: { instanceId: src, hookId: o.wire.from[1] }, dst: { instanceId: dst, hookId: o.wire.to[1] } });
      ok = !!(r && r.ok);
    }
    if (!ok && o.wire === undefined) ok = !!(o.dir === 'in' ? (autoWire(st.K, id, host) || autoWire(st.K, host, id)) : (autoWire(st.K, host, id) || autoWire(st.K, id, host)));
    return id;
  }
  function load(st, m) { st = st || cur; return m.as === 'mod' ? addMod(st, m.slot, m.tool, m.preset) : addLinked(st, m.tool, m); }
  function loadSuite(st) {
    st = st || cur; const s = st.d.suite; if (!s || !(s.members || []).length) return [];
    if (!ensureHost(st)) return [];
    // linked tools first (a mod's wire may name one), then the mods
    const order = s.members.filter(m => m.as !== 'mod').concat(s.members.filter(m => m.as === 'mod'));
    const out = order.map(m => load(st, m));
    toast(`${st.d.label}: the whole suite is on (${out.filter(Boolean).length} of ${order.length}) — Ctrl+Z takes it back a step at a time`, 'good', 3500);
    return out;
  }

  // ---------------------------------------------------------------- what the page lists
  // 3.48.3 packs carry more than presets (kits, patterns, anything a tool takes): a domain says how this page loads
  // a kind — ToolPage.addKind(kind, { label, noun, apply(K, instanceId, item), extra?(descriptor) → [{ label, items }] })
  const KINDS = new Map();
  let IOW = {};   // 3.101 in/out in words, given by the domains: { kinds: { wire_type: word }, named: { port: name }, upper: [abbreviations] }
  function ioWords(w) { if (!w) return; IOW = { kinds: Object.assign({}, IOW.kinds, w.kinds), named: Object.assign({}, IOW.named, w.named), upper: (IOW.upper || []).concat(w.upper || []), quiet: (IOW.quiet || []).concat(w.quiet || []) }; }
  function addKind(kind, o) { if (kind && o && typeof o.apply === 'function') KINDS.set(kind, o); }
  // every non-preset kind this tool's packs hold, grouped by pack (+ what the domain adds, e.g. your own saved ones)
  function kindGroups(d) {
    const CP = global.ContentPacks, out = new Map();
    if (CP) CP.list({ tool: d.id }).forEach(p => {
      const pk = CP.get(p.id), mine = (pk && pk.items && pk.items[d.id]) || {};
      Object.keys(mine).filter(k => k !== 'presets').forEach(k => {
        const v = mine[k], items = Array.isArray(v) ? v.map((x, i) => ({ name: (x && (x.name || x.label)) || String(i + 1), value: x })) : Object.keys(v || {}).map(n => ({ name: n, value: v[n] }));
        if (!items.length) return; if (!out.has(k)) out.set(k, []);
        out.get(k).push({ pack: p.id, label: p.label, enabled: p.enabled, author: p.author, items });
      });
    });
    KINDS.forEach((o, k) => { const ex = o.extra ? (o.extra(d) || []) : []; ex.filter(g => g.items && g.items.length).forEach(g => { if (!out.has(k)) out.set(k, []); out.get(k).push(Object.assign({ enabled: true }, g)); }); });
    return out;
  }
  function presetGroups(d) {
    const CP = global.ContentPacks, keys = Object.keys(d.presets || {}), used = new Set(), groups = [];
    if (CP) CP.list({ tool: d.id, kind: 'presets' }).forEach(p => {
      const pk = CP.get(p.id), tag = pk && (pk.prefix !== undefined ? pk.prefix : pk.label);
      const names = Object.keys((pk && pk.items[d.id] && pk.items[d.id].presets) || {});
      // a preset two packs both carry (same name) is listed once, under the first
      const items = names.map(n => ({ name: n, key: (tag ? tag + ' · ' : '') + n })).filter(x => !used.has(x.key) && (!p.enabled || keys.includes(x.key)));
      items.forEach(x => used.add(x.key)); if (!items.length) return;
      groups.push({ pack: p.id, label: p.label, enabled: p.enabled, author: p.author, items });
    });
    const rest = keys.filter(k => !used.has(k));
    if (rest.length) groups.unshift({ pack: null, label: 'Built in', enabled: true, items: rest.map(k => ({ name: k, key: k })) });
    return groups;
  }
  // tools it links with: its own rules naming tools, and other tools whose rules name it
  function partners(d) {
    const out = new Map();
    (d.links || []).forEach(r => [].concat(r.with || []).forEach(t => { if (F().def(t) && !out.has(t)) out.set(t, { tool: t, dir: r.dir || 'out', hint: r.hint || '' }); }));
    F().defined().filter(o => !o.hidden).forEach(o => (o.links || []).forEach(r => { if ([].concat(r.with || []).includes(d.id) && !out.has(o.id)) out.set(o.id, { tool: o.id, dir: r.dir === 'out' ? 'in' : 'out', hint: r.hint || '' }); }));
    return Array.from(out.values());
  }

  // ---------------------------------------------------------------- the page
  function open(defId, o) {
    o = o || {}; const K = kern(o), d = F().def(defId); if (!d) return null;
    // a suite window → the page of the suite it is
    const SU = global.Suites, hubOf = live(o.instanceId) && SU && SU.list().some(x => x.hub === defId) ? live(o.instanceId).ctx.params.get('suite') : null;
    if (hubOf && SU.get(hubOf)) return openSuite(hubOf, o);
    close();
    const target = live(o.instanceId) ? o.instanceId : windowsOf(K, defId)[0] || null;
    cur = { d, K, target, made: new Map(), el: null, q: '', back: o.back || null };
    return mount(d.label, d.accent);
  }
  function mount(label, accent) {
    const K = cur.K;
    const UI = global.UIKit, h = UI.h;
    const el = cur.el = h('div', { class: 'tp-overlay', role: 'dialog', 'aria-label': label + ' — its page', style: { '--acc': accent || '#00d4ff' } });
    el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    el.appendChild(h('div', { class: 'tp-page', tabindex: '-1' }));
    doc.body.appendChild(el);
    cur.unsubs = ['kernel:organism-mounted', 'kernel:organism-unmounted', 'canvas:mods', 'contentpacks:changed'].concat(cur.suite ? ['kernel:wire-registered', 'kernel:wire-removed'] : []).map(tp => K.bus.subscribe(tp, () => soon(), 'tool-page'));
    if (global.ContentPacks) cur.unsubs.push(global.ContentPacks.onChange(() => soon()));
    repaint(); el.querySelector('.tp-page').focus();
    return el;
  }
  let pend = null;
  function soon() { if (pend) return; pend = global.setTimeout(() => { pend = null; repaint(); }, 30); }
  function close() {
    if (!cur) return; (cur.unsubs || []).forEach(u => { try { u(); } catch (e) {} }); (cur.views || []).forEach(v => { try { v.dispose(); } catch (e) {} });
    dropSketch(cur);
    if (global.Preview && global.Preview.current && (cur.suite ? cur.suite.parts.some(p => p.tool === global.Preview.current.defId) : global.Preview.current.defId === cur.d.id)) global.Preview.stop();
    cur.el.remove(); cur = null;
  }

  // 3.48.4 "tabs, not a long page": the bar above the sections is a tab bar — one section shows at a time, and the page
  // keeps the tab you picked while it repaints (a window opening, a pack switched on…)
  function tabBtn(nav, btn, st, page, id, label, ic) {
    nav.setAttribute('role', 'tablist');
    const b = btn(label, label, () => { st.tab = id; showTab(st, page); page.scrollTop = 0; }, 'tp-tab', ic);
    b.dataset.tab = id; b.setAttribute('role', 'tab'); nav.appendChild(b); return b;
  }
  function showTab(st, page) {
    const secs = Array.from(page.querySelectorAll(':scope > .tp-sec')); if (!secs.length) return;
    if (!secs.some(x => x.dataset.sec === st.tab)) st.tab = secs[0].dataset.sec;
    secs.forEach(x => { x.hidden = x.dataset.sec !== st.tab; x.setAttribute('role', 'tabpanel'); });
    page.querySelectorAll('.tp-nav [data-tab]').forEach(b => { const on = b.dataset.tab === st.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  }
  function repaint() {
    if (!cur) return; if (cur.suite) return repaintSuite();
    const st = cur, d = st.d, K = st.K, UI = global.UIKit, h = UI.h, M = global.Mods;
    const page = st.el.querySelector('.tp-page'), keepY = page.scrollTop; (st.views || []).forEach(v => { try { v.dispose(); } catch (e) {} }); st.views = []; page.innerHTML = '';
    if (!live(st.target)) st.target = null;
    const btn = (text, title, fn, cls, ic) => { const b = h('button', { class: 'tp-btn ' + (cls || ''), title, html: ic ? IC(ic, text) : E(text) }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    const sec = (title, sub, kids, id, ic) => h('section', { class: 'tp-sec', 'data-sec': id }, [h('h3', { class: 'tp-h', html: IC(ic, title) + (sub ? `<small> ${E(sub)}</small>` : '') })].concat(kids));

    // head: what it is + which window the page works on
    const wins = windowsOf(K, d.id);
    const pick = h('select', { class: 'tp-target', 'aria-label': 'which window this page works on' },
      [h('option', { value: '', text: '— a new window (opened when you add something)' })].concat(wins.map(id => h('option', { value: id, text: `${d.label} · ${id.split('-').slice(-2).join('')}` }))));
    pick.value = st.target || ''; pick.addEventListener('change', () => { st.target = pick.value || null; repaint(); });
    const suite = d.suite && (d.suite.members || []).length ? d.suite : null;
    // 3.88 its painting (art.svg, from the catalogue) in place of the icon tile, when it has one
    const meta = global.Catalog && global.Catalog.meta && global.Catalog.meta(d.id), art = meta && meta.art;
    page.appendChild(h('header', { class: 'tp-head' + (art ? ' has-art' : '') }, [
      art ? h('img', { class: 'tp-art', src: art, alt: '', draggable: 'false' }) : tileOf(d, 56, d.icon || '◻'),
      h('div', { class: 'tp-ht' }, [h('h2', { text: d.label }), h('div', { class: 'tp-meta', text: [d.category, 'v' + d.version].filter(Boolean).join(' · ') }), h('p', { text: d.blurb || '' })]),
      h('div', { class: 'tp-act' }, [
        btn(st.target ? 'Go to it' : 'Add to canvas', st.target ? 'show its window' : 'open one on the canvas', () => { if (st.target) { K.bus.publish('canvas:focus-request', { instanceId: st.target }); close(); } else ensureHost(st); }, 'pri', st.target ? 'arrow-up-right' : 'plus'),
        suite ? btn('Load the whole setup', 'the tool and every tool in its setup (its mods inside, the tools wired into it), wired up and set — one click (Ctrl+Z takes it back)', () => loadSuite(st), 'pri tp-suite-all', 'layers') : null,
        backBtn(btn), btn('', 'close (Esc)', close, 'tp-x tp-ico', 'x'),
      ]),
    ]));
    page.appendChild(h('div', { class: 'tp-on' }, [h('span', { text: 'Works on: ' }), pick]));
    // 3.49 (P49.4): this tool as parts — a suite whose allInOne names it (and the suites it is a part of)
    const SU = global.Suites, asParts = SU ? SU.list().filter(x => x.allInOne === d.id) : [], partOf = SU ? SU.forTool(d.id) : [];
    if (asParts.length || partOf.length) page.appendChild(h('div', { class: 'tp-on tp-parts' }, [].concat(
      asParts.map(x => btn('As parts: ' + x.label, 'the same tool rebuilt from parts you can swap and use elsewhere — opens its suite window', () => { close(); SU.openAsync(x.id, { K }); }, 'pri tp-asparts', 'suite:' + x.id)),
      partOf.map(x => btn('Part of: ' + x.label, 'open its page', () => openSuite(x.id, { K, back: () => open(d.id, { K, instanceId: st.target, back: st.back }) }), 'tp-partof', 'suite:' + x.id)))));

    const nav = h('nav', { class: 'tp-nav' }); page.appendChild(nav);
    const navTo = (id, label, ic) => tabBtn(nav, btn, st, page, id, label, ic);

    // 3.48.3 its own panel, live (every tool's whole window, its editors included) — edit it right here
    const uiFn = F().ui && F().ui(d.id);
    if (uiFn) {
      navTo('panel', 'Panel', 'sliders-horizontal');
      // 3.71 the panel is there the moment the page opens: with none on the canvas, a sketch (no window, not saved, not in
      // undo) is played here — Add to canvas carries everything set on it over to the real window
      if (!live(st.target) && !live(st.sketch)) st.sketch = F().spawn(d.id, { K, ephemeral: true, headless: true }) || null;
      const box = h('div', { class: 'tp-panel' }), rec = live(st.target) || live(st.sketch);
      let v = null;
      if (rec) {
        v = F().makeView(rec, box); st.views.push(v); v.inPage = true; v.pageTabs = []; v.pageTab = (id, label, el, ic) => v.pageTabs.push({ id, label, el, ic });
        try { uiFn(v); if (rec.ctx.syncUI) rec.ctx.syncUI(); } catch (x) { box.appendChild(UI.hint('its panel could not open here: ' + x.message)); }
      } else box.append(h('p', { class: 'tp-p tp-dim', text: `${d.label}'s own controls open here, live, once one is on the canvas.` }), btn('Add to canvas', 'open one — its panel appears here', () => ensureHost(st), 'pri', 'plus'));
      page.appendChild(sec('Its panel', !rec ? '' : live(st.target) ? '· the tool itself, live — every change is its window\'s too' : '· try it here — Add to canvas keeps what you set', [box], 'panel', 'sliders-horizontal'));
      // the tool's own extra tabs (view.pageTab), then what its domain adds for every such tool (UIKit.pageTabsFor)
      if (v) [].concat(v.pageTabs, (UI.pageTabsFor && UI.pageTabsFor(v)) || []).forEach(t => {
        navTo(t.id, t.label, t.ic || 'sliders-horizontal'); page.appendChild(h('section', { class: 'tp-sec', 'data-sec': t.id }, [h('div', { class: 'tp-panel' }, [t.el])]));   // the tab names it; its panel heads itself
      });
    }

    // the suite
    if (suite) {
      navTo('suite', 'Setup', 'layers');   // 3.126 a tool with whole tools around it is a setup; a suite is a tool and its components
      page.appendChild(sec(suite.label || 'Its setup', `· ${suite.members.length} tools`, [
        suite.blurb ? h('p', { class: 'tp-p', text: suite.blurb }) : null,
        h('div', { class: 'tp-list' }, suite.members.map(m => {
          const ok = !!F().def(m.tool), slot = m.as === 'mod' && (d.slots || []).find(s => s.id === m.slot);
          return h('div', { class: 'tp-row' + (ok ? '' : ' off') }, [
            tileOf(defOf(m.tool), 30, (defOf(m.tool).icon || '◻')),
            h('div', { class: 'tp-rt' }, [h('b', { html: E(defOf(m.tool).label) + (m.preset ? `<span class="tp-pre-n"> — ${E(m.preset)}</span>` : '') }), h('small', { text: m.why || (slot ? 'inside: ' + (slot.label || slot.id) : '') })]),
            ok && m.preset && global.Preview ? global.Preview.button(m.tool, m.preset) : null,
            h('span', { class: 'tp-tag ' + (m.as === 'mod' ? 'mod' : 'lnk'), text: m.as === 'mod' ? 'mod' : 'linked' }),
            ok ? btn('', 'add just this one', () => load(st, m), 'tp-ico', 'plus') : h('small', { class: 'tp-dim', text: 'not installed' }),
          ]);
        })),
      ], 'suite', 'suite:' + ((SU && SU.list().find(x => x.allInOne === d.id || x.parts.some(p => p.tool === d.id)) || {}).id || '')));
    }

    // mods, slot by slot
    if ((d.slots || []).length && M) {
      navTo('mods', 'Mods', 'puzzle');
      const kids = (d.slots || []).map(sl => {
        const inIt = st.target ? M.entries(st.target).filter(e => e.slot === sl.id) : [];
        const fits = st.target ? M.compatible(st.target, sl.id) : compatibleFor(d, sl);
        const q = h('input', { class: 'tp-q', placeholder: `find a mod (${fits.length})`, value: st.q });
        const grid = h('div', { class: 'tp-grid' });
        const paint = () => {
          grid.innerHTML = ''; const s = q.value.trim().toLowerCase(); st.q = q.value; let cat = null;
          fits.filter(t => !s || (t.label + ' ' + t.category + ' ' + t.blurb).toLowerCase().includes(s)).forEach(t => {
            if (t.category !== cat) { cat = t.category; grid.appendChild(h('div', { class: 'tp-cat', text: cat || 'other' })); }
            grid.appendChild(h('div', { class: 'tp-mod' }, [h('div', { class: 'tp-rt' }, [h('b', { html: IC(t, t.label, t.icon) }), h('small', { text: t.blurb })]), btn('', `put ${t.label} inside ${d.label} — ${sl.label || sl.id}`, () => addMod(st, sl.id, t.id), 'tp-ico', 'plus')]));
          });
        };
        q.addEventListener('input', paint); q.addEventListener('keydown', (e) => e.stopPropagation()); paint();
        return h('div', { class: 'tp-slot' }, [
          h('div', { class: 'tp-sh' }, [h('b', { text: sl.label || sl.id }), h('small', { text: ' ' + (sl.hint || '') })]),
          inIt.length ? h('div', { class: 'tp-list' }, inIt.map(e => h('div', { class: 'tp-row' + (e.bypass ? ' off' : '') }, [
            h('span', { class: 'tp-tag mod', text: e.bypass ? '⏻ off' : 'inside' }), h('div', { class: 'tp-rt' }, [h('b', { html: nameH(e.tool) })]),
            btn('⏻', 'switch it on / off', () => M.bypass(st.target, e.uid)), btn('×', 'take it out', () => M.remove(st.target, e.uid)),
          ]))) : h('p', { class: 'tp-p tp-dim', text: st.target ? 'nothing inside yet — add one below' : 'add one and a window opens with it inside' }),
          q, grid,
        ]);
      });
      page.appendChild(sec('Mods', '· tools that run inside it, one by one', kids, 'mods', 'puzzle'));
    }

    // tools it links with
    const ps = partners(d);
    if (ps.length) {
      navTo('links', 'Links', 'link-2');
      page.appendChild(sec('Plays with', '· wired in, they show their controls on its window', [h('div', { class: 'tp-list' }, ps.map(p => h('div', { class: 'tp-row' }, [
        h('span', { class: 'tp-tag lnk', text: p.dir === 'in' ? '⇠ feeds it' : '⇢ it feeds' }),
        h('div', { class: 'tp-rt' }, [h('b', { html: nameH(p.tool) }), h('small', { text: p.hint })]),
        btn('', 'add it next to this one, wired up', () => addLinked(st, p.tool, { dir: p.dir }), 'tp-ico', 'plus'),
      ])))], 'links', 'link-2'));
    }

    // delete for good — a pack, or one thing in it (shipped ones too: "some of them suck … don't sound good, or are blown")
    const CPx = global.ContentPacks;
    const delPack = (g) => g.pack && CPx && CPx.discard ? btn('🗑', 'delete this pack for good — everything in it', () => { if (global.confirm(`Delete the pack “${g.label}” for good? It will not come back.`)) { CPx.discard(g.pack); toast(`Deleted “${g.label}”`, 'good', 2000); } }, 'tp-ico bad') : null;
    const delItem = (g, kind, name) => g.pack && CPx && CPx.discardItem ? btn('🗑', 'delete it for good', () => { if (global.confirm(`Delete “${name}” for good? It will not come back.`)) { CPx.discardItem(g.pack, d.id, kind, name); toast(`Deleted “${name}”`, 'good', 2000); } }, 'tp-ico bad') : null;

    // sound packs
    const groups = presetGroups(d);
    if (groups.length) {
      navTo('packs', 'Packs', 'package');
      const total = groups.reduce((n, g) => n + g.items.length, 0);
      page.appendChild(sec('Sound packs', `· ${total} presets in ${groups.length} pack${groups.length > 1 ? 's' : ''}`, groups.map(g => {
        const on = g.enabled !== false;
        const tog = g.pack && global.ContentPacks ? btn(on ? 'on' : 'off', on ? 'this pack is on — click to switch it off' : 'switch this pack on', () => global.ContentPacks.setEnabled(g.pack, !on), on ? 'on' : '') : null;
        return h('div', { class: 'tp-pack' + (on ? '' : ' off') }, [
          h('div', { class: 'tp-sh' }, [h('b', { text: g.label }), h('small', { text: ` · ${g.items.length}` + (g.author ? ' · ' + g.author : '') }), h('span', { class: 'wm-spacer' }), tog, delPack(g)]),
          h('div', { class: 'tp-presets' }, g.items.map(x => h('div', { class: 'tp-pre' }, [
            on && global.Preview ? global.Preview.button(d.id, x.key) : null,
            h('span', { class: 'tp-pn', text: x.name, title: x.key }),
            on ? btn('Load', st.target ? 'put it on the window this page works on' : 'open one with this preset', () => { const id = ensureHost(st); presetLoad(K, id, x.key); toast(`${d.label}: ${x.name}`, 'good', 1500); }) : null,
            delItem(g, 'presets', x.name),
          ]))),
        ]);
      }), 'packs', 'package'));
    }

    // the other kinds its packs hold (kits, patterns, …)
    kindGroups(d).forEach((gs, kind) => {
      const act = KINDS.get(kind), noun = (act && act.noun) || kind, cap = noun.charAt(0).toUpperCase() + noun.slice(1), total = gs.reduce((n, g) => n + g.items.length, 0);
      navTo('kind-' + kind, cap, 'package');
      page.appendChild(sec(cap, `· ${total} in ${gs.length} pack${gs.length > 1 ? 's' : ''}`, gs.map(g => {
        const on = g.enabled !== false;
        const tog = g.pack && global.ContentPacks ? btn(on ? 'on' : 'off', on ? 'this pack is on — click to switch it off' : 'switch this pack on', () => global.ContentPacks.setEnabled(g.pack, !on), on ? 'on' : '') : null;
        return h('div', { class: 'tp-pack' + (on ? '' : ' off'), 'data-kind': kind }, [
          h('div', { class: 'tp-sh' }, [h('b', { text: g.label }), h('small', { text: ` · ${g.items.length}` + (g.author ? ' · ' + g.author : '') }), h('span', { class: 'wm-spacer' }), tog, delPack(g)]),
          h('div', { class: 'tp-presets' }, g.items.map(x => h('div', { class: 'tp-pre' }, [
            h('span', { class: 'tp-pn', text: x.name }),
            on && act ? btn(act.label || 'Load', act.title || 'put it on the window this page works on', () => { const id = ensureHost(st); if (id) { act.apply(K, id, x); toast(`${d.label}: ${x.name}`, 'good', 1500); } }) : null,
            delItem(g, kind, x.name),
          ]))),
        ]);
      }), 'kind-' + kind, 'package'));
    });

    // every control
    const params = (d.config || []).filter(c => !c.hidden);
    if (params.length) {
      navTo('controls', 'Controls', 'sliders-vertical');
      const movable = new Set((d.hooks || []).filter(x => x.direction === 'in' && /\.mod_/.test(x.hook_id)).map(x => x.mod_key || x.port));
      const range = (c) => c.type === 'enum' ? (c.options || []).join(' · ') : c.type === 'boolean' ? 'on / off' : (c.min !== undefined ? `${c.min} – ${c.max}${c.unit ? ' ' + c.unit : ''}` : c.type);
      const show = (v) => v === undefined ? '' : typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'object' ? '…' : String(v);
      const byGroup = new Map(); params.forEach(c => { const g = c.group || 'Settings'; if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(c); });
      page.appendChild(sec('Every control', `· ${params.length}`, Array.from(byGroup.entries()).map(([g, cs]) => h('div', { class: 'tp-cg' }, [
        h('div', { class: 'tp-sh' }, [h('b', { text: g })]),
        h('table', { class: 'tp-tab' }, [h('tbody', {}, cs.map(c => h('tr', {}, [
          h('td', { class: 'tp-cl' }, [c.label || c.key, movable.has(c.key) ? h('span', { class: 'tp-mv', title: 'an input can move this', text: ' ∿' }) : null, c.settingsOnly ? h('span', { class: 'tp-dim', title: 'in ⚙ settings', text: ' ⚙' }) : null]),
          h('td', { class: 'tp-cr', text: range(c) }), h('td', { class: 'tp-cd', text: show(c.default) }), h('td', { class: 'tp-ch', text: c.hint || '' }),
        ])))]),
      ])), 'controls', 'sliders-vertical'));
    }

    // inputs and outputs
    const io = (d.hooks || []).filter(x => !x.internal && !/^slot\./.test(x.hook_id) && x.wire_type !== 'ui');
    if (io.length) {
      navTo('io', 'In / out', 'arrow-left-right');
      // 3.101 in words: "Cutoff" (an input that moves a knob) — not its hook id
      // the words come from the domain (ToolPage.ioWords): the page itself knows no domain's terms (tests/boundary.test.js)
      const KIND = IOW.kinds || {}, NAMED = IOW.named || {}, UPPER = new Set(IOW.upper || []);
      const cfgLabel = (k) => { const c = (d.config || []).find(c => c.key === k); return c && (c.label || c.key); };
      const nameOf = (x) => { const port = String(x.port || x.hook_id.split('.').pop()), m = /^(?:mod[._])?(?:knob[._])?(.+)$/.exec(port.replace(/^mod\./, '')); const key = /^mod/.test(x.hook_id.split('.').slice(-2).join('.')) || /^mod/.test(port) ? m[1] : null;
        const words = (t) => { t = String(t).replace(/[_.]/g, ' ').trim(); return UPPER.has(t.toLowerCase()) ? t.toUpperCase() : t.replace(/^\w/, ch => ch.toUpperCase()); };
        return NAMED[port] || (key && (cfgLabel(key) || words(key))) || cfgLabel(port) || words(port); };
      const ins = io.filter(x => x.direction !== 'out'), outs = io.filter(x => x.direction === 'out');
      const row = (x) => h('div', { class: 'tp-row' }, [
        h('span', { class: 'tp-tag ' + (x.direction === 'out' ? 'lnk' : 'mod'), text: x.direction === 'out' ? 'out ⇢' : '⇠ in' }),
        h('div', { class: 'tp-rt' }, [h('b', { text: nameOf(x) }), x.intent && !(IOW.quiet || []).some(q => String(x.intent).toLowerCase().startsWith(q)) ? h('small', { text: x.intent }) : null]),
        h('span', { class: 'tp-tag kind', title: x.hook_id, text: KIND[x.wire_type] || String(x.wire_type).replace(/_/g, ' ') }),
      ]);
      page.appendChild(sec('Inputs and outputs', `· ${outs.length} out · ${ins.length} in`, [h('div', { class: 'tp-list tp-io' }, outs.concat(ins).map(row))], 'io', 'arrow-left-right'));
    }

    // 3.126 SUITES — its own tab (his words, 2026-11-06: "each component/ui/packs/mod/suite/etc all with a clear line of seperation"):
    // the suite that is this tool and its components wired (open it as a suite), the suites it is a part of, the setups it plays in
    if (SU) {
      const setups = (SU.setups ? SU.setups() : []).filter(x => x.parts.some(p => p.tool === d.id));
      const sRow = (x, tag, title, run, ic) => h('div', { class: 'tp-row' }, [tileOf({ id: 'suite:' + x.id, accent: x.accent, icon: x.icon }, 30, x.icon || '◈'),
        h('div', { class: 'tp-rt' }, [h('b', { text: x.label }), h('small', { text: x.blurb ? x.blurb.split('. ')[0] + '.' : '' })]), h('span', { class: 'tp-tag lnk', text: tag }), btn(title, '', run, '', ic)]);
      const rows = [].concat(
        asParts.map(x => sRow(x, 'this tool as a suite', 'Open as suite', () => { close(); SU.openAsync(x.id, { K }).then(hub => { if (hub) SU.build(K, hub); }); }, 'blocks')),
        partOf.filter(x => !asParts.includes(x)).map(x => sRow(x, 'a part of it', 'Its page', () => openSuite(x.id, { K, back: () => open(d.id, { K, instanceId: st.target, back: st.back }) }), 'book-open')),
        setups.map(x => sRow(x, 'setup', 'Start it', () => { close(); global.Recipes && global.Recipes.run('setup:' + x.id, { K }); }, 'play')));
      navTo('suites', 'Suites', 'blocks');
      page.appendChild(sec('Suites', `· ${rows.length ? rows.length + ' — a suite is a tool and its components, wired' : 'none yet'}`, [
        rows.length ? h('div', { class: 'tp-list' }, rows) : null,
        h('p', { class: 'tp-p tp-dim', text: 'Make your own: wire tools together on the canvas, right-click any of them › Save what is wired here as a suite.' }),
      ].filter(Boolean), 'suites', 'blocks'));
    }
    // 3.126 what a domain adds to every tool's page, each in its own tab (ToolPage.addTab) — e.g. the components a tool is made of
    extraTabs.forEach(fn => { let t = null; try { t = fn({ def: d, K, target: st.target, h, btn }); } catch (e) { console.error('[ERAVOS] page tab failed', e); }
      (Array.isArray(t) ? t : t ? [t] : []).forEach(x => { navTo(x.id, x.label, x.ic || 'blocks'); page.appendChild(sec(x.title || x.label, x.sub || '', [x.el], x.id, x.ic || 'blocks')); }); });
    showTab(st, page); page.scrollTop = keepY;
  }
  const backBtn = (btn) => cur && cur.back ? btn('Back', 'back to where you were', () => { const b = cur.back; close(); b(); }, 'tp-back', 'arrow-left') : null;

  // ---------------------------------------------------------------- 3.63 the page of a SUITE
  function openSuite(suiteId, o) {
    o = o || {}; const SU = global.Suites, s = SU && SU.get(suiteId); if (!s) return null;
    close();
    const K = kern(o), hubs = suiteWindows(K, s), target = live(o.instanceId) && hubs.includes(o.instanceId) ? o.instanceId : hubs[0] || null;
    cur = { suite: s, d: { id: 'suite:' + s.id, label: s.label, icon: s.icon, accent: s.accent }, K, target, made: new Map(), el: null, q: '', back: o.back || null };
    return mount(s.label, s.accent);
  }
  // the suite windows on the canvas that are this suite
  function suiteWindows(K, s) { return F().def(s.hub) ? windowsOf(K, s.hub).filter(id => live(id).ctx.params.get('suite') === s.id) : []; }
  async function ensureSuite(st) {
    if (live(st.target)) return st.target;
    const id = await global.Suites.openAsync(st.suite.id, { K: st.K }); if (!id) return null;
    st.target = id; if (cur === st) repaint(); return id;
  }
  async function buildSuite(st) { st = st || cur; const hub = await ensureSuite(st); if (!hub) return []; const out = global.Suites.build(st.K, hub); soon(); return out; }
  async function addSuitePart(st, tool, preset) { const hub = await ensureSuite(st); if (!hub) return null; const id = global.Suites.addPart(st.K, hub, tool, preset ? { preset } : {}); soon(); return id; }
  async function suiteScene(st, name) { const hub = await ensureSuite(st); if (!hub) return 0; const n = global.Suites.scene(st.K, hub, name); toast(`${st.suite.label}: ${name}`, 'good', 1600); soon(); return n; }
  TP.buildSuite = buildSuite; TP.addSuitePart = addSuitePart; TP.suiteScene = suiteScene;

  function repaintSuite() {
    const st = cur, s = st.suite, K = st.K, SU = global.Suites, UI = global.UIKit, h = UI.h;
    const page = st.el.querySelector('.tp-page'), keepY = page.scrollTop; page.innerHTML = '';
    if (!live(st.target)) st.target = null;
    const btn = (text, title, fn, cls, ic) => { const b = h('button', { class: 'tp-btn ' + (cls || ''), title, html: ic ? IC(ic, text) : E(text) }); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    const sec = (title, sub, kids, id, ic) => h('section', { class: 'tp-sec', 'data-sec': id }, [h('h3', { class: 'tp-h', html: IC(ic, title) + (sub ? `<small> ${E(sub)}</small>` : '') })].concat(kids));
    const hub = st.target, stat = hub ? SU.status(K, hub) : [], here = (tool) => stat.find(x => x.part.tool === tool && x.instanceId);

    const hubs = suiteWindows(K, s);
    const pick = h('select', { class: 'tp-target', 'aria-label': 'which suite window this page works on' },
      [h('option', { value: '', text: '— a new suite window (opened when you add something)' })].concat(hubs.map(id => h('option', { value: id, text: `${s.label} · ${id.split('-').slice(-2).join('')}` }))));
    pick.value = st.target || ''; pick.addEventListener('change', () => { st.target = pick.value || null; repaint(); });
    const nParts = s.parts.length, nOn = stat.filter(x => x.instanceId && !x.mixed).length;
    page.appendChild(h('header', { class: 'tp-head' }, [
      tileOf({ id: 'suite:' + s.id, accent: s.accent, icon: s.icon }, 56, s.icon || '◻'),
      h('div', { class: 'tp-ht' }, [h('h2', { text: s.label }), h('div', { class: 'tp-meta', text: ['Suite', nParts + ' parts', s.version ? 'v' + s.version : ''].filter(Boolean).join(' · ') + (hub ? ` · ${nOn} of ${nParts} on the canvas` : '') }), h('p', { text: s.blurb || '' })]),
      h('div', { class: 'tp-act' }, [
        btn('Build the whole suite', 'every part it needs, wired up, on its starter scene' + (s.starter ? ' (' + s.starter + ')' : '') + ' — one click (Ctrl+Z takes it back)', () => buildSuite(st), 'pri tp-suite-all', 'layers'),
        btn(hub ? 'Go to it' : 'Just the suite window', hub ? 'show the suite window' : 'open the suite window and add the parts yourself', () => { if (hub) { K.bus.publish('canvas:focus-request', { instanceId: hub }); close(); } else ensureSuite(st); }, '', hub ? 'arrow-up-right' : 'box'),
        s.user ? btn('Delete this suite', 'one you saved from the canvas — removed for good (the tools on the canvas stay)', () => { if (SU.removeUser(s.id)) { toast(`Deleted “${s.label}”.`, '', 2500); close(); } }, 'tp-del', 'trash-2') : null,
        backBtn(btn), btn('', 'close (Esc)', close, 'tp-x tp-ico', 'x'),
      ].filter(Boolean)),
    ]));
    page.appendChild(h('div', { class: 'tp-on' }, [h('span', { text: 'Works on: ' }), pick]));
    if (s.allInOne && F().def(s.allInOne)) page.appendChild(h('div', { class: 'tp-on tp-parts' }, [btn('All in one: ' + defOf(s.allInOne).label, 'the same thing in one window — its page', () => open(s.allInOne, { K, back: () => openSuite(s.id, { K, back: st.back }) }), 'tp-allinone', s.allInOne)]));

    const nav = h('nav', { class: 'tp-nav' }); page.appendChild(nav);
    const navTo = (id, label, ic) => tabBtn(nav, btn, st, page, id, label, ic);

    // the parts
    navTo('parts', 'Parts', 'blocks');
    page.appendChild(sec('Parts', `· ${nParts} tools — each one still a tool of its own`, [h('div', { class: 'tp-list' }, s.parts.map(p => {
      const ok = !!F().def(p.tool), on = here(p.tool), inn = p.as === 'mod' && p.in ? ' · inside ' + defOf(p.in).label + (p.slot ? ' (' + p.slot + ')' : '') : '';
      return h('div', { class: 'tp-row tp-part' + (ok ? '' : ' off') + (on ? ' on' : ''), 'data-tool': p.tool }, [
        tileOf(defOf(p.tool), 34, defOf(p.tool).icon || '◻'),
        h('div', { class: 'tp-rt' }, [h('b', { html: E(defOf(p.tool).label) + (p.preset ? `<span class="tp-pre-n"> — ${E(p.preset)}</span>` : '') + `<span class="tp-tag ${p.as === 'mod' ? 'mod' : 'lnk'}">${E((p.role || (p.as === 'mod' ? 'mod' : 'part')) + (p.required ? '' : ' · extra'))}</span>` }), h('small', { text: (p.why || '') + inn })]),
        ok && p.preset && global.Preview ? global.Preview.button(p.tool, p.preset) : null,
        on ? h('span', { class: 'tp-onmark', html: IC('circle-check', 'On') }) : ok ? btn('Add', 'add just this one to the suite', () => addSuitePart(st, p.tool), '', 'plus') : h('small', { class: 'tp-dim', text: 'installs with the suite' }),
        ok ? btn('', 'its own page', () => open(p.tool, { K, instanceId: on ? on.instanceId : undefined, back: () => openSuite(s.id, { K, instanceId: st.target, back: st.back }) }), 'tp-partpage tp-ico', 'book-open') : null,
      ]);
    }))], 'parts', 'blocks'));

    // scenes
    const scenes = Object.keys(s.scenes || {});
    if (scenes.length) {
      navTo('scenes', 'Scenes', 'clapperboard');
      const curScene = hub ? live(hub).ctx.params.get('scene') : null;
      page.appendChild(sec('Scenes', '· one click sets every part', [h('div', { class: 'tp-list' }, scenes.map(n => h('div', { class: 'tp-row tp-scene' + (n === curScene ? ' on' : '') }, [
        h('span', { class: 'tp-tag lnk', text: n === s.starter ? '★ starter' : 'scene' }),
        h('div', { class: 'tp-rt' }, [h('b', { text: n }), h('small', { text: Object.keys(s.scenes[n]).map(t => (F().def(t) ? F().def(t).label : t) + ': ' + (s.scenes[n][t].preset || '…')).join(' · ') })]),
        btn(n === curScene ? '✓ on' : 'Load', hub ? 'set every part to this scene' : 'open the suite and set it to this scene', () => suiteScene(st, n)),
      ])))], 'scenes', 'clapperboard'));
    }

    // macros
    if ((s.macros || []).length) {
      navTo('macros', 'Macros', 'sliders-horizontal');
      page.appendChild(sec('Macros', '· one knob turns several parts — on the suite window', [h('div', { class: 'tp-list' }, s.macros.map(m => h('div', { class: 'tp-row' }, [
        h('span', { class: 'tp-tag mod', text: m.label }),
        h('div', { class: 'tp-rt' }, [h('b', { html: (m.targets || []).map(t => nameH(t.tool) + ' <span class="tp-dim">· ' + E(t.key) + '</span>').join('<span class="tp-plus">+</span>') }), h('small', { text: m.hint || '' })]),
      ])))], 'macros', 'sliders-horizontal'));
    }

    // wiring
    const wires = hub ? SU.wiring(K, hub) : (s.wiring || []).map(w => ({ wire: w })).concat(SU.outputs(s).map(t => ({ wire: { from: [t], to: ['suite'] }, toSuite: true })));
    if (wires.length) {
      navTo('wiring', 'Wiring', 'cable');
      const short = (hk) => hk ? ' · ' + String(hk).split('.').pop().replace(/_/g, ' ') : '';
      page.appendChild(sec('How it is wired', '· the suite makes these wires for you', [h('div', { class: 'tp-list' }, wires.map(w => h('div', { class: 'tp-row' + (hub && !w.on ? ' off' : '') }, [
        h('span', { class: 'tp-tag ' + (w.toSuite ? 'mod' : 'lnk'), text: hub ? (w.on ? '● on' : w.possible ? '○ off' : '○ —') : w.toSuite ? 'out' : 'wire' }),
        h('div', { class: 'tp-rt' }, [h('b', { html: nameH(w.wire.from[0]) + E(short(w.wire.from[1])) + '<span class="tp-arrow">→</span>' + (w.toSuite ? IC({ id: 'suite:' + s.id, icon: s.icon }, s.label, s.icon) : nameH(w.wire.to[0]) + E(short(w.wire.to[1]))) })]),
      ])))], 'wiring', 'cable'));
    }
    showTab(st, page); page.scrollTop = keepY;
  }

  // no window yet: which tools would fit a slot (the same rule Mods.compatible uses, read from the descriptors)
  function compatibleFor(d, sl) {
    const io = (x, dir) => (x.hooks || []).some(h => h.wire_type === sl.wire_type && h.direction === dir && !h.internal);
    const acc = sl.accepts || {};
    return F().defined().filter(x => x.id !== d.id && !x.singleton && !x.system && !x.noMod && io(x, 'in') && io(x, 'out')
      && (!acc.provides || (x.provides || []).includes(acc.provides)) && (!acc.category || String(x.category || '').toLowerCase() === String(acc.category).toLowerCase()) && !(acc.not || []).includes(x.id))
      .map(x => ({ id: x.id, label: x.label, icon: x.icon || '', category: x.category || '', blurb: x.blurb || '' }))
      .sort((a, b) => (a.category + a.label).localeCompare(b.category + b.label));
  }

  // a crisp drawn icon (an emoji book renders fragmented at title-bar size on some systems)
  const BOOK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M2.5 3.2c1.9-.7 3.8-.6 5.5.6v9.1c-1.7-1.1-3.6-1.2-5.5-.5zM13.5 3.2c-1.9-.7-3.8-.6-5.5.6v9.1c1.7-1.1 3.6-1.2 5.5-.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => !d.system,
    make(rec) {
      const b = global.UIKit.h('button', { class: 'wm-min tp-open', title: 'its page — mods, sound packs, suite, every control', 'aria-label': rec.def.label + ' page' });
      b.innerHTML = BOOK;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); open(rec.id, { instanceId: rec.instanceId, K: rec.K }); });
      return b;
    },
  });
  // clicking a window's icon or name opens its page (a drag of the title bar still moves the window)
  if (doc) {
    let down = null;
    doc.addEventListener('pointerdown', (e) => { const t = e.target.closest && e.target.closest('.wm-head .wm-icon, .wm-head .wm-title'); down = t ? { x: e.clientX, y: e.clientY, t } : null; }, true);
    doc.addEventListener('pointerup', (e) => {
      const d = down; down = null; if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const win = d.t.closest('.wm-win'), id = win && win.getAttribute('data-instance'), rec = id && F().handle(id);
      if (rec && !rec.def.system) open(rec.id, { instanceId: id, K: rec.K });
    }, true);
  }
  global.ToolPage = TP;
})(typeof window !== 'undefined' ? window : globalThis);
