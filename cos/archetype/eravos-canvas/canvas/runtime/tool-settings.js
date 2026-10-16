/* ERAVOS runtime — tool-settings.js → window.ToolSettings (3.34, spec eravos.phase34-map §D)
 * ⚙ on every window that has settings: a panel inside the window (scrolls by itself, always reachable) with every
 * parameter of the tool grouped by its own groups — including the ones its face does not show (settingsOnly) — its
 * presets, Reset to defaults, and the sections domains add (ToolSettings.addSection). Domain-free: it knows tools only
 * through their descriptor (config, groups) and the standard UI hooks (config_change, preset_*). */
(function (global) {
  'use strict';
  const doc = global.document;
  const sections = [];
  const TS = {
    /** s: { id, label, order, when(descriptor) → bool, make(rec, K) → Element } */
    addSection(s) { if (s && s.id && !sections.some(x => x.id === s.id)) { sections.push(s); sections.sort((a, b) => (a.order || 50) - (b.order || 50)); } },
    sections: () => sections.slice(),
    params: (d) => (d.config || []).filter(c => !c.hidden),
    has(d) { return TS.params(d).length > 0 || sections.some(s => safe(() => s.when(d))); },
    open, close, toggle,
  };
  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  function build(rec) {
    const UI = global.UIKit, h = UI.h, d = rec.def, K = rec.K;
    const panel = h('div', { class: 'ts-panel', role: 'dialog', 'aria-label': d.label + ' settings' });
    // a view of its own (bound to this tool's state; disposed with the tool)
    const view = global.OrganismFactory.makeView(rec, panel);
    const shut = h('button', { class: 'uk-btn ts-close', text: '✕ Close', title: 'back to the tool (Esc)', onclick: () => close(rec) });
    const head = h('div', { class: 'ts-head' }, [h('span', { class: 'ts-title', text: '⚙ ' + d.label + ' — settings' }), h('span', { class: 'wm-spacer' }), shut]);
    panel.appendChild(head);
    const params = TS.params(d);
    if (params.length) {
      const find = h('input', { class: 'uk-input ts-find', placeholder: 'Find a setting…', 'aria-label': 'find a setting' });
      const box = UI.paramPanel(view, params.map(c => c.key));
      find.addEventListener('input', () => {
        const q = find.value.trim().toLowerCase();
        box.querySelectorAll('.uk-group').forEach(g => {
          let any = false;
          Array.from(g.querySelectorAll('.uk-row > *')).forEach(el => { const hit = !q || el.textContent.toLowerCase().includes(q) || (g.textContent.toLowerCase().split('\n')[0] || '').includes(q); el.style.display = hit ? '' : 'none'; any = any || hit; });
          g.style.display = any ? '' : 'none';
        });
      });
      const reset = UI.Button({ label: '↺ Reset to defaults', hint: 'every setting back to how the tool starts (Ctrl+Z undoes)', onClick: () => {
        params.forEach(c => { if (c.default !== undefined && JSON.stringify(view.state[c.key]) !== JSON.stringify(c.default)) view.emit('config_change', { key: c.key, value: c.default }); });
      } });
      panel.append(h('div', { class: 'ts-sec' }, [h('div', { class: 'ts-sec-title', text: 'Quick preset' }), h('div', { class: 'org-row' }, [UI.presetBar(view), reset.el])]));
      early(); panel.append(
        h('div', { class: 'ts-sec' }, [h('div', { class: 'ts-sec-title' }, ['Every setting ', h('span', { class: 'uk-hint', text: `(${params.length})` })]), find, box]));
    }
    // sections ordered below 10 sit above "Every setting" (Packs & presets), the rest below it
    function early() { sections.filter(s => (s.order || 50) < 10).forEach(addSec); }
    if (!params.length) early();
    function addSec(s) {
      if (!safe(() => s.when(d))) return;
      const el = safe(() => s.make(rec, K, view)); if (!el) return;
      panel.appendChild(h('div', { class: 'ts-sec', 'data-section': s.id }, [h('div', { class: 'ts-sec-title', text: s.label }), el]));
    }
    sections.filter(s => (s.order || 50) >= 10).forEach(addSec);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(rec); } });
    rec.ctx.syncUI && rec.ctx.syncUI();
    return panel;
  }
  function open(rec) {
    if (typeof rec === 'string') rec = global.OrganismFactory.handle(rec); if (!rec || !rec.win) return null;
    if (!rec._settings) { rec._settings = build(rec); rec.win.appendChild(rec._settings); }
    rec._settings.classList.add('open'); rec.win.classList.add('ts-open');
    return rec._settings;
  }
  function close(rec) { if (typeof rec === 'string') rec = global.OrganismFactory.handle(rec); if (rec && rec._settings) { rec._settings.classList.remove('open'); rec.win && rec.win.classList.remove('ts-open'); } }
  function toggle(rec) { if (typeof rec === 'string') rec = global.OrganismFactory.handle(rec); if (!rec) return; if (rec._settings && rec._settings.classList.contains('open')) close(rec); else open(rec); }

  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => TS.has(d),
    make(rec) {
      const b = global.UIKit.h('button', { class: 'wm-min ts-btn', title: 'settings — every setting of this tool', 'aria-label': 'Settings for ' + rec.def.label, text: '⚙' });
      b.addEventListener('click', (e) => { e.stopPropagation(); toggle(rec); });
      return b;
    },
  });
  global.ToolSettings = TS;
})(typeof window !== 'undefined' ? window : globalThis);
