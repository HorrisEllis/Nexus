/* ERAVOS runtime — mods-rack.js → window.ModsRack (spec eravos.links-and-mods). Domain-free.
 * The MODS rack at the foot of every window whose tool has slots: ＋ adds any tool that fits; each mod is a card with
 * its own controls (its face, or its whole window with ⤢), ⏻ bypass, ↑ ↓ order, ⇱ pop out to a window, × remove;
 * ＋ also moves a window already on the canvas inside (⇲). Every edit is undoable. */
(function (global) {
  'use strict';
  const IC = (x, text, fb) => global.Icons ? global.Icons.label(x, text, { fallback: fb }) : ((fb || '') + ' ' + text).trim();   // 3.64 a drawn icon, then the words
  const doc = global.document;
  const folded = new Map();   // mod child id → 'face' | 'full' | 'shut'

  function init(K) {
    if (init.done) return; init.done = true;
    const F = global.OrganismFactory, UI = global.UIKit, WM = global.CanvasWM, M = global.Mods, h = UI.h;
    const views = new Map();   // hostId → [views]

    function render(hostId) {
      const rec = F.handle(hostId); if (!rec || rec.unmounted || !(rec.def.slots || []).length) return;
      const win = WM.windowOf(hostId); if (!win) return;
      const body = win.querySelector('.wm-body'); if (!body) return;
      (views.get(hostId) || []).forEach(v => v.dispose()); views.set(hostId, []);
      let rack = body.querySelector(':scope > .md-rack');
      if (!rack) { rack = h('div', { class: 'md-rack' }); body.appendChild(rack); }
      rack.innerHTML = '';
      const all = M.entries(hostId);
      rec.def.slots.forEach(sl => {
        const inSlot = all.filter(e => e.slot === sl.id);
        const pick = h('button', { class: 'md-add', title: `put another tool inside — it runs as part of ${rec.def.label}`, text: '＋ mod' });
        const head = h('div', { class: 'md-head' }, [h('span', { class: 'md-title', text: `🧩 MODS · ${sl.label || sl.id}` }), h('span', { class: 'md-count', text: inSlot.length ? String(inSlot.length) : '' }), pick]);
        const box = h('div', { class: 'md-slot' }, [head]);
        pick.addEventListener('click', (e) => { e.stopPropagation(); chooser(hostId, sl, box); });
        if (!inSlot.length) box.appendChild(h('div', { class: 'md-empty', text: sl.hint || 'empty — the sound passes straight through' }));
        inSlot.forEach((e, i) => box.appendChild(card(hostId, e, i, inSlot.length)));
        rack.appendChild(box);
      });
    }
    function card(hostId, e, i, n) {
      const cid = e.child, c = cid && F.handle(cid), d = c ? c.def : F.def(e.tool);
      const mode = folded.get(cid) || 'face';
      const btn = (text, title, fn, on) => { const b = h('button', { class: 'md-btn' + (on ? ' on' : ''), title, text }); b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); return b; };
      const el = h('div', { class: 'md-card' + (e.bypass ? ' off' : ''), style: { '--mc': (d && d.accent) || '#00d4ff', '--acc': (d && d.accent) || '#00d4ff' } });
      el.appendChild(h('div', { class: 'md-chead' }, [
        h('span', { class: 'md-name', html: IC(d || { id: e.tool }, (d && d.label) || e.tool, (d && d.icon) || '◻') }),
        btn('⏻', e.bypass ? 'switched off — click to switch on' : 'on — click to bypass', () => M.bypass(hostId, e.uid), !e.bypass),
        btn('↑', 'earlier in the chain', () => M.move(hostId, e.uid, -1)), btn('↓', 'later in the chain', () => M.move(hostId, e.uid, 1)),
        btn(mode === 'full' ? '▣' : '⤢', mode === 'full' ? 'show just its main controls' : 'show all of it', () => { folded.set(cid, mode === 'full' ? 'face' : 'full'); render(hostId); WM.fitToContent(hostId); }),
        btn(mode === 'shut' ? '▸' : '▾', mode === 'shut' ? 'unfold' : 'fold', () => { folded.set(cid, mode === 'shut' ? 'face' : 'shut'); render(hostId); WM.fitToContent(hostId, { shrink: true }); }),
        btn('⇱', 'pop it out to its own window, wired straight after this one', () => M.popOut(hostId, e.uid)),
        btn('×', 'remove this mod (Ctrl+Z brings it back)', () => M.remove(hostId, e.uid)),
      ]));
      if (!c || mode === 'shut') return el;
      const inner = h('div', { class: 'md-cbody' }); el.appendChild(inner);
      const v = F.makeView(c, inner); views.get(hostId).push(v);
      const uiFn = F.ui(c.id);
      if (mode === 'full' && uiFn) { try { uiFn(v); } catch (x) { inner.appendChild(UI.hint('its controls could not open: ' + x.message)); } }
      else { const keys = global.Links ? global.Links.faceKeys(c.def) : []; inner.appendChild(keys.length ? UI.paramPanel(v, keys, { flat: true, noTitles: true, size: 26, compact: true }) : UI.hint('⤢ shows its controls')); }
      return el;
    }
    function chooser(hostId, sl, box) {
      const old = box.querySelector('.md-pick'); if (old) { old.remove(); return; }
      const tools = M.compatible(hostId, sl.id);
      const q = h('input', { class: 'md-q', placeholder: `find a tool to put inside (${tools.length})` });
      const listEl = h('div', { class: 'md-list' });
      const pop = h('div', { class: 'md-pick' }, [q, listEl]);
      const paint = () => {
        const s = q.value.trim().toLowerCase(); listEl.innerHTML = ''; let cat = null;
        // tools already on the canvas: move one inside (its cables are joined up behind it)
        const here = M.movable(hostId, sl.id).filter(t => !s || t.label.toLowerCase().includes(s));
        if (here.length) {
          listEl.appendChild(h('div', { class: 'md-cat', text: 'on the canvas — move it inside' }));
          here.forEach(t => { const b = h('button', { class: 'md-item', title: 'moves this window inside; what fed it now feeds what it fed', html: '⇲ ' + IC(t, `${t.label} · ${t.instanceId.split('-').slice(-2).join('')}`, t.icon) }); b.addEventListener('click', (ev) => { ev.stopPropagation(); pop.remove(); M.absorb(hostId, sl.id, t.instanceId); }); listEl.appendChild(b); });
        }
        tools.filter(t => !s || (t.label + ' ' + t.category + ' ' + t.blurb).toLowerCase().includes(s)).forEach(t => {
          if (t.category !== cat) { cat = t.category; listEl.appendChild(h('div', { class: 'md-cat', text: cat || 'other' })); }
          const b = h('button', { class: 'md-item', title: t.blurb, html: IC(t, t.label, t.icon) });
          b.addEventListener('click', (ev) => { ev.stopPropagation(); pop.remove(); M.add(hostId, sl.id, t.id); });
          listEl.appendChild(b);
        });
      };
      q.addEventListener('input', paint); q.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') pop.remove(); ev.stopPropagation(); });
      paint(); box.insertBefore(pop, box.children[1] || null); q.focus();
    }

    const soon = new Map();
    const later = (id) => { if (!id || soon.has(id)) return; soon.set(id, global.setTimeout(() => { soon.delete(id); render(id); WM.fitToContent(id); }, 0)); };
    K.bus.subscribe('canvas:window-opened', (p) => later(p.instanceId), 'mods');
    K.bus.subscribe('canvas:mods', (p) => later(p.instanceId), 'mods');
    K.bus.subscribe('kernel:organism-unmounted', (p) => { (views.get(p.instanceId) || []).forEach(v => v.dispose()); views.delete(p.instanceId); folded.delete(p.instanceId); }, 'mods');
    global.ModsRack.render = render;
  }
  global.ModsRack = { init };
})(typeof window !== 'undefined' ? window : globalThis);
