/* ERAVOS core — elements/elements.js → window.ElementSynthesis (ES1, 2026-11-13; specs/eravos.ui-field.spec ADDENDUM 2026-11-13 (3)).
 * His words (2026-11-13): "Each component of each tool has a element for the ui to synthesis." · "make sure you are seperating the elements
 * for synthesis. i want to add the element synthesis".
 * A tool's face, synthesised from its elements: every control names the element it belongs to (config `element:` — a component the tool
 * announces, or the tool's own part `own:<name>`); the elements are ordered as the sound flows (the tool's announced components, in its DAG's
 * order, its own parts where their controls first appear — or the tool's own `elementOrder`); one card per element, drawn with the same kit as
 * every face today (uk-group cards, UI.paramControl). Domain-free: it names no domain, tool or topic; a domain gives an element its words
 * (def.elementWords). Nothing replaces a tool's own face: this is shown as a preview beside it (his rule: show first, or add).
 *   ElementSynthesis.elementsOf(def, components?) → [{ id, words, keys: [control keys] }] in order
 *   ElementSynthesis.check(def, components?)      → [problems] (a control with no element; an element the tool does not announce)
 *   ElementSynthesis.face(view, o?)               → a DOM node: the synthesised face. o.size: knob size · o.skip: keys the tool already shows
 *                                                   elsewhere (its header — no duplicates) · o.face: the keys on the face (def.faceKeys by default);
 *                                                   the rest fold, element by element, behind More depth ▸ (power without overwhelm) */
(function (global) {
  'use strict';
  const own = (e) => String(e).indexOf('own:') === 0;
  const first = (e) => Array.isArray(e) ? e[0] : e;
  const announced = (def, comps) => comps || (global.Catalog && global.Catalog.meta && (global.Catalog.meta(def.id) || {}).components) || [];
  const wordsOf = (def, id) => ((def.elementWords || {})[id]) || String(id).replace(/^own:/, '').replace(/-/g, ' ').toUpperCase();
  function elementsOf(def, comps) {
    const C = announced(def, comps), cfg = (def.config || []).filter(c => c && c.key && !c.hidden && c.element), by = new Map();
    cfg.forEach(c => { const e = first(c.element); if (!by.has(e)) by.set(e, []); by.get(e).push(c.key); });
    let order;
    if (Array.isArray(def.elementOrder)) order = def.elementOrder.filter(e => by.has(e)).concat([...by.keys()].filter(e => !def.elementOrder.includes(e)));
    else {   // the announced components in their order; an own part goes just after the last component its preceding controls reached
      const rank = new Map(); let last = -1;
      cfg.forEach(c => { const e = first(c.element); if (own(e)) { if (!rank.has(e)) rank.set(e, last + 0.5); } else { const i = C.indexOf(e); if (i >= 0) { last = i; if (!rank.has(e)) rank.set(e, i); } } });
      order = [...by.keys()].sort((a, b) => (rank.has(a) ? rank.get(a) : 1e9) - (rank.has(b) ? rank.get(b) : 1e9));
    }
    return order.map(id => ({ id, words: wordsOf(def, id), keys: by.get(id) }));
  }
  function check(def, comps) {
    const C = announced(def, comps), out = [];
    (def.config || []).filter(c => c && c.key && !c.hidden).forEach(c => {
      if (!c.element) { out.push(`${c.key}: names no element`); return; }
      [].concat(c.element).forEach(e => { if (!own(e) && !C.includes(e)) out.push(`${c.key}: element ${e} is not a component the tool announces`); });
    });
    return out;
  }
  function face(view, o) {
    o = o || {}; const UI = view.ui, h = UI.h, def = view.descriptor, cfg = (k) => def.config.find(c => c.key === k);
    const skip = new Set(o.skip || []), onFace = o.face || def.faceKeys || null;
    const ctl = (k) => { const c = UI.paramControl(view, cfg(k), { size: o.size || 32, segMax: 6 }); if (!c) return null; c.el.dataset.key = k; return c.el; };
    const cards = (pick) => elementsOf(def).map(el => ({ el, keys: el.keys.filter(k => !skip.has(k) && pick(k)) })).filter(x => x.keys.length)
      .map(x => h('div', { class: 'uk-group', 'data-element': x.el.id }, [h('div', { class: 'uk-group-title', text: x.el.words }), h('div', { class: 'uk-row' }, x.keys.map(ctl).filter(Boolean))]));
    const root = h('div', { class: 'es-face', 'data-synthesised': 'elements' });
    root.appendChild(h('div', { class: 'uk-panel' }, cards(k => !onFace || onFace.includes(k))));
    if (onFace) {
      const deep = h('div', { class: 'uk-panel' }, cards(k => !onFace.includes(k))); deep.style.display = 'none';
      const b = UI.Button({ label: 'More depth ▸', hint: 'the rest of its controls, element by element', onClick: () => { const show = deep.style.display === 'none'; deep.style.display = show ? '' : 'none'; b.el.textContent = show ? 'More depth ▾' : 'More depth ▸'; } });
      if (deep.childNodes.length) { root.appendChild(h('div', { class: 'org-row' }, [b.el])); root.appendChild(deep); }
    }
    return root;
  }
  global.ElementSynthesis = { elementsOf, check, face };
})(window);
