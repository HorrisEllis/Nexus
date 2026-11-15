/* ERAVOS runtime — links.js → window.Links (spec eravos.links-and-mods). Domain-free.
 * Small tools grow when they meet. Every window carries a LINK STRIP: one chip per tool it is wired to (⇠ feeds it,
 * ⇢ it feeds). A chip unfolds that tool's FACE — its main controls, live, inside this window — so a chain of small
 * tools plays like one instrument without hunting for windows.
 *   descriptor.face   [keys]  the controls this tool shows on another tool's window (default: its first six knobs)
 *   descriptor.links  [rule]  { with?: id | [ids], provides?: cap, category?: name, dir?: 'in'|'out',
 *                               face?: [peer keys], label?, hint? } — a matching peer opens on its own when wired
 * Engines see the same list through ctx.links() / ctx.onLinks(fn) (organism-sdk.js). */
(function (global) {
  'use strict';
  const IC = (x, text, fb) => global.Icons ? global.Icons.label(x, text, { fallback: fb }) : ((fb || '') + ' ' + text).trim();   // 3.64 a drawn icon, then the words
  const doc = global.document;
  const SKIP = new Set(['mix', 'inGain', 'outGain', 'bypass', 'mods']);

  function faceKeys(d, rule) {
    if (rule && rule.face) return rule.face;
    if (d.face) return d.face;
    return (d.config || []).filter(c => !c.hidden && !c.settingsOnly && !SKIP.has(c.key) && ['number', 'integer', 'enum', 'boolean'].includes(c.type)).slice(0, 6).map(c => c.key);
  }
  function matches(rule, link) {
    if (rule.dir && rule.dir !== link.dir) return false;
    if (rule.with) { const ids = [].concat(rule.with); if (!ids.includes(link.organism)) return false; }
    if (rule.provides && !link.provides.includes(rule.provides)) return false;
    if (rule.category && String(link.category).toLowerCase() !== String(rule.category).toLowerCase()) return false;
    return true;
  }
  const ruleFor = (d, link) => (d.links || []).find(r => matches(r, link)) || null;

  function init(K) {
    K = K || global.Kernel;
    const F = global.OrganismFactory, UI = global.UIKit, WM = global.CanvasWM, h = UI.h;
    const open = new Map();      // instanceId → Set(peer) unfolded
    const seen = new Map();      // instanceId → Set(peer) already offered (auto-open only once per wire)
    const views = new Map();     // instanceId → [face views] mounted in that window

    function strip(id) {
      const win = WM.windowOf(id); if (!win || win.classList.contains('docked')) return null;
      const body = win.querySelector('.wm-body'); if (!body) return null;
      let el = body.querySelector(':scope > .lk-strip');
      if (!el) { el = h('div', { class: 'lk-strip' }); body.insertBefore(el, body.firstChild); }
      return el;
    }
    function render(id) {
      const rec = F.handle(id); if (!rec || rec.unmounted) return;
      const el = strip(id); if (!el) return;
      (views.get(id) || []).forEach(v => v.dispose()); views.set(id, []);
      el.innerHTML = '';
      const all = global.OrganismSDK.linksOf(K, id), peers = new Map();
      all.forEach(l => { const p = peers.get(l.peer); if (p) p.dirs.add(l.dir); else peers.set(l.peer, Object.assign({}, l, { dirs: new Set([l.dir]) })); });
      el.classList.toggle('empty', !peers.size);
      if (!peers.size) return;
      const mine = open.get(id) || new Set(), offered = seen.get(id) || new Set(); open.set(id, mine); seen.set(id, offered);
      const chips = h('div', { class: 'lk-chips' }, [h('span', { class: 'lk-lab', text: 'linked' })]);
      el.appendChild(chips);
      peers.forEach((l, peer) => {
        const prec = F.handle(peer); if (!prec || prec.unmounted) return;
        // this tool's own rule names which of the peer's controls to show; a rule on the PEER (about this tool) only opens it
        const own = ruleFor(rec.def, l), theirs = own ? null : ruleFor(prec.def, Object.assign({}, l, { organism: rec.id, provides: rec.def.provides || [], category: rec.def.category || '', dir: l.dir === 'in' ? 'out' : 'in' }));
        const rule = own || theirs;
        if (!offered.has(peer)) { offered.add(peer); if (rule) mine.add(peer); }
        const arrow = l.dirs.size > 1 ? '⇄' : l.dirs.has('in') ? '⇠' : '⇢';
        const chip = h('button', { class: 'lk-chip' + (mine.has(peer) ? ' on' : ''), title: (rule && rule.hint) || `${l.dirs.has('in') ? l.label + ' feeds this' : 'this feeds ' + l.label} — click to show its controls here`,
          style: { '--lc': prec.def.accent || '#00d4ff' }, html: arrow + ' ' + IC(prec.def, (rule && rule.label) || l.label, l.icon) });
        chip.addEventListener('click', () => { if (mine.has(peer)) mine.delete(peer); else mine.add(peer); render(id); WM.fitToContent(id); });
        chips.appendChild(chip);
        if (!mine.has(peer)) return;
        const keys = faceKeys(prec.def, own).filter(k => (prec.def.config || []).some(c => c.key === k));
        const face = h('div', { class: 'lk-face', style: { '--lc': prec.def.accent || '#00d4ff', '--acc': prec.def.accent || '#00d4ff' } });
        const v = F.makeView(prec, face); views.get(id).push(v);
        face.appendChild(h('div', { class: 'lk-face-head' }, [
          h('span', { html: IC(prec.def, l.label, l.icon) }),
          h('button', { class: 'lk-go', title: 'go to its window', text: '↗', onclick: () => { K.bus.publish('canvas:focus', { instanceId: peer }); } }),
        ]));
        if (keys.length) face.appendChild(UI.paramPanel(v, keys, { flat: true, noTitles: true, size: 26, compact: true }));
        else face.appendChild(UI.hint('nothing to set here — open its window'));
        el.appendChild(face);
      });
    }
    const soon = new Map();
    function later(id) { if (!id || soon.has(id)) return; soon.set(id, global.setTimeout(() => { soon.delete(id); render(id); }, 0)); }
    const touch = (w) => { if (!w || !w.src) return; later(w.src.instanceId); later(w.dst.instanceId); };
    K.bus.subscribe('kernel:wire-registered', (w) => { if (!(w.meta && w.meta.insert)) touch(w); }, 'links');
    K.bus.subscribe('kernel:wire-removed', (w) => { touch(w); }, 'links');
    K.bus.subscribe('canvas:window-opened', (p) => later(p.instanceId), 'links');
    K.bus.subscribe('kernel:organism-unmounted', (p) => {
      const id = p.instanceId; (views.get(id) || []).forEach(v => v.dispose()); views.delete(id); open.delete(id); seen.delete(id);
      open.forEach((s, host) => { if (s.delete(id)) later(host); }); seen.forEach(s => s.delete(id));
    }, 'links');
    Links.render = render; Links.open = (id, peer, on) => { const s = open.get(id) || new Set(); open.set(id, s); if (on === false) s.delete(peer); else s.add(peer); render(id); };
    Links.isOpen = (id, peer) => !!(open.get(id) && open.get(id).has(peer));
  }

  const Links = { init, faceKeys, matches };
  global.Links = Links;
})(typeof window !== 'undefined' ? window : globalThis);
