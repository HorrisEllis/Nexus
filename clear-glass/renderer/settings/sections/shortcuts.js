'use strict';
/**
 * renderer/settings/sections/shortcuts.js — Keyboard shortcuts  (styles: shortcuts.css)
 *
 * §0.39.265 — James: "add keyboard shortcuts including macro support."
 * Every browser action, and any macro or Automation workflow, can have a key.
 * The main process catches them everywhere — in the toolbar and inside pages
 * (src/main/index.js; defaults and rules in src/shortcuts/registry.js). This
 * page records a key by having you press it, warns before taking a key from
 * another action, and never lets a plain typing key become a shortcut.
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, select, section } = window.CGS;

  // same rules as src/shortcuts/registry.js (the backend re-checks them)
  const KEY_NAMES = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc', '+': '=' };
  function accelOf(e) {
    let key = e.key;
    if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return null;
    key = KEY_NAMES[key] || key;
    if (key.length === 1) key = key.toUpperCase();
    if (e.shiftKey && /^Digit\d$/.test(e.code)) key = e.code.slice(5);
    if (e.shiftKey && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', key].filter(Boolean).join('+');
  }
  const safe = (a) => /(^|\+)F([1-9]|1\d|2[0-4])$/.test(a) || /(^|\+)(Ctrl|Alt|Meta)\+/.test(a);
  const kbd = (accel) => h('span', { class: 'kbd-set' }, accel.split('+').map(k => h('kbd', { text: k })));

  function nameOf(action, ctx) {
    const a = ctx.actions.find(x => x.id === action);
    if (a) return a.label;
    if (action.startsWith('macro:')) return `Run macro “${action.slice(6)}”`;
    if (action.startsWith('workflow:')) { const w = ctx.workflows.find(x => x.id === action.slice(9)); return `Run workflow “${w ? w.name : action.slice(9)}”`; }
    return action;
  }

  /** capture(ctx, action) — "press the keys" dialog; resolves with the saved result or null. */
  async function capture(ctx, action, current) {
    let accel = null;
    const shown = h('div', { class: 'capture', tabindex: '0', 'aria-live': 'polite' }, h('span', { class: 'hint', text: 'Press the keys…' }));
    const note = h('p', { class: 'blurb' });
    const paint = () => {
      shown.replaceChildren(accel ? kbd(accel) : h('span', { class: 'hint', text: 'Press the keys…' }));
      note.className = 'blurb';
      if (!accel) { note.textContent = current ? `Now: ${current}. Esc cancels.` : 'Use Ctrl, Alt or a function key with it. Esc cancels.'; return; }
      if (!safe(accel)) { note.textContent = `${accel} would steal ordinary typing — add Ctrl or Alt, or use a function key.`; note.className = 'blurb bad'; return; }
      const taken = ctx.bindings[accel];
      if (taken && taken !== action) { note.textContent = `${accel} is “${nameOf(taken, ctx)}” now — saving moves it here and leaves that without a key.`; note.className = 'blurb warn'; return; }
      note.textContent = taken === action ? 'That’s already its key.' : 'Free — save to use it.';
    };
    shown.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) return;   // the modal closes
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) return;
      e.preventDefault(); e.stopPropagation();
      const a = accelOf(e);
      if (a) { accel = a; paint(); }
    });
    paint();
    setTimeout(() => shown.focus(), 30);
    return modal({ title: nameOf(action, ctx), body: [shown, note], actions: [{ label: 'Save', primary: true, run: async () => {
      if (!accel) throw new Error('Press the keys first.');
      if (!safe(accel)) throw new Error(`${accel} would steal ordinary typing.`);
      const r = await call(() => cg.shortcuts.set(accel, action), 'save shortcut');
      if (r && r.error) throw new Error(r.error);
      return { accel, replaced: r.replaced };
    } }] });
  }

  section({
    id: 'shortcuts', group: 'Browser', icon: '⌨', label: 'Keyboard shortcuts',
    keywords: 'keyboard shortcut hotkey keys accelerator macro workflow bind',
    blurb: 'Keys for browser actions, and for any macro or workflow. They work everywhere in Clear Glass — in the toolbar and inside pages.',
    related: ['macros', 'automation'],
    async render({ tools, rerender }) {
      const [sc, macros, wf] = await Promise.all([
        call(() => cg.shortcuts.list(), 'shortcuts'),
        cg.macros.list().then(r => (r && r.macros) || (Array.isArray(r) ? r : [])).catch(() => []),
        wire('/automation/workflows').then(r => r.workflows || []).catch(() => []),
      ]);
      const ctx = { actions: sc.actions || [], bindings: sc.bindings || {}, workflows: wf };
      const keysOf = (action) => Object.entries(ctx.bindings).filter(([, v]) => v === action).map(([k]) => k);
      const defaultOf = (action) => Object.entries(sc.defaults || {}).find(([, v]) => v === action)?.[0] || null;

      const change = (action) => async () => {
        const r = await capture(ctx, action, keysOf(action)[0]);
        if (r) { toast(`${nameOf(action, ctx)}: ${r.accel}${r.replaced ? ` (taken from “${nameOf(r.replaced, ctx)}”)` : ''}`); rerender(); }
      };
      const remove = (accel) => busy(null, async () => { await call(() => cg.shortcuts.remove(accel), 'remove shortcut'); rerender(); });
      const actionRow = (id, label, sub) => {
        const keys = keysOf(id), def = defaultOf(id);
        const changed = def ? keys[0] !== def : keys.length > 0;
        return row(label, sub || (changed && def ? `default ${def}` : null),
          keys.length ? kbd(keys[0]) : h('span', { class: 'none', text: 'no key' }),
          btn(keys.length ? 'Change' : 'Set key', change(id), 'sm'),
          keys.length ? btn('Remove', () => remove(keys[0]), 'sm ghost') : null);
      };

      const groups = [...new Set(ctx.actions.map(a => a.group))];
      const panes = groups.map(g => pane({ title: g, flush: true, body: ctx.actions.filter(a => a.group === g).map(a => actionRow(a.id, a.label)) }));

      // macros & workflows: ones with a key first, then everything that could have one
      const macroIds = macros.map(m => `macro:${m.name}`), wfIds = wf.map(w => `workflow:${w.id}`);
      const bound = Object.values(ctx.bindings).filter(v => v.startsWith('macro:') || v.startsWith('workflow:'));
      const listed = [...new Set([...bound, ...macroIds, ...wfIds])];
      const mw = pane({ title: 'Macros & workflows', sub: 'A macro runs in the window you press its key in.', flush: true,
        body: listed.length ? listed.map(id => actionRow(id, nameOf(id, ctx), id.startsWith('macro:') && !macroIds.includes(id) ? 'this macro no longer exists' : id.startsWith('workflow:') && !wfIds.includes(id) ? 'this workflow no longer exists' : null))
          : empty('No macros or workflows yet. Record a macro on the Macros page or build a workflow in Automation.') });

      tools.append(btn('Reset all to defaults', async () => {
        if (await confirmDo('Reset every shortcut?', 'Your changes are removed; the built-in keys come back.', 'Reset')) { await busy(null, () => call(() => cg.shortcuts.reset(), 'reset shortcuts')); toast('Shortcuts reset'); rerender(); }
      }, 'danger'));
      return [mw, ...panes];
    },
  });
})();
