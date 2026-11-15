/* ERAVOS runtime — context-menu.js → window.ContextMenu (3.70, map specs/eravos.phase70-map.spec P70.2). Domain-free.
 * James, 2026-10-24: "also right clikc on the canvas for context menu. tool dependant context menu".
 * Right-click on the empty canvas: add a tool here, tidy, show everything, undo / redo, stop all.
 * Right-click on a window: that tool's own items first (its UI sets view.contextMenu = () => items; a domain adds items for its tools
 * with ContextMenu.contribute(fn)), then its presets, then the window: duplicate (same settings), its page, settings, expand, fold, close.
 * It opens only where nothing else took the right-click (a knob's "Move with", a grid that deletes on right-click: e.defaultPrevented),
 * and never over a text field (the browser's own menu stays there). Esc or a click elsewhere closes it.
 * An item: { label, hint?, keys? (shown right-aligned), run(), disabled?, danger? } · { section: 'title' } · { sep: true } */
(function (global) {
  'use strict';
  const doc = global.document;
  const contributors = [];
  let menuEl = null, offFn = null;
  const F = () => global.OrganismFactory, WM = () => global.CanvasWM;
  function close() { if (menuEl) { menuEl.remove(); menuEl = null; } if (offFn) { doc.removeEventListener('pointerdown', offFn, true); offFn = null; } }
  function show(x, y, items, title) {
    close();
    const h = global.UIKit.h, list = (items || []).filter(Boolean);
    if (!list.length) return null;
    menuEl = h('div', { class: 'cm', role: 'menu', 'aria-label': title || 'menu' }, (title ? [h('div', { class: 'cm-h', text: title })] : []).concat(list.map(it => {
      if (it.sep) return h('div', { class: 'cm-sep', role: 'separator' });
      if (it.section) return h('div', { class: 'cm-s', text: it.section });
      const b = h('button', { class: 'cm-item' + (it.danger ? ' danger' : ''), role: 'menuitem', text: it.label, title: it.hint || '' });
      if (it.keys) { b.textContent = ''; b.append(h('span', { class: 'cm-l', text: it.label }), h('span', { class: 'cm-k', text: it.keys })); }   // its key, right-aligned
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); try { it.run && it.run(); } catch (err) { console.error('[ERAVOS] menu item failed', err); } });
      return b;
    })));
    ['pointerdown', 'wheel', 'keydown'].forEach(t => menuEl.addEventListener(t, (e) => { if (t !== 'keydown' || e.key !== 'Escape') e.stopPropagation(); }));
    doc.body.appendChild(menuEl);
    const W = global.innerWidth || 1200, H = global.innerHeight || 800;
    menuEl.style.left = Math.max(4, Math.min(x, W - menuEl.offsetWidth - 8)) + 'px';
    menuEl.style.top = Math.max(4, Math.min(y, H - menuEl.offsetHeight - 8)) + 'px';
    setTimeout(() => { offFn = (ev) => { if (menuEl && !menuEl.contains(ev.target)) close(); }; doc.addEventListener('pointerdown', offFn, true); }, 0);
    const first = menuEl.querySelector('.cm-item:not([disabled])'); if (first) first.focus({ preventScroll: true });
    return menuEl;
  }
  // ---- what the canvas offers
  function canvasItems(e) {
    const K = global.Kernel, H = global.ShellHistory, at = WM() && WM().toWorld ? WM().toWorld(e.clientX, e.clientY) : null, hs = H && H.state ? H.state() : {};
    return [
      { label: '＋ Add a tool here…', hint: 'the tool list — what you pick lands where you clicked', run: () => { placeNext(at); if (global.ShellAdd) global.ShellAdd(); } },
      { sep: true },
      { label: '⊞ Tidy up', hint: 'every window in rows, nothing overlapping', run: () => WM().tidy() },
      { label: '⤢ Show everything', hint: 'zoom so every window fits', run: () => WM().fitAll() },
      { sep: true },
      { label: '↶ Undo' + (hs.undoLabel ? ': ' + hs.undoLabel : ''), disabled: !hs.canUndo, run: () => H.undo() },
      { label: '↷ Redo' + (hs.redoLabel ? ': ' + hs.redoLabel : ''), disabled: !hs.canRedo, run: () => H.redo() },
      { sep: true },
      { label: '■ Stop all', hint: 'everything quiet at once (Shift+Esc)', danger: true, run: () => K && K.silence({ hard: true, reason: 'stop all' }) },
    ];
  }
  // the next tool added (within 60 s) lands where the canvas was right-clicked
  let pending = null, hooked = false;
  function placeNext(at) {
    if (!at) return; pending = { at, until: Date.now() + 60000 };
    if (!hooked && F() && F().onChange) { hooked = true; F().onChange((ev, id) => { if (ev !== 'spawn' || !pending || Date.now() > pending.until) return; const p = pending.at; pending = null; setTimeout(() => WM().place(id, { x: Math.round(p.x), y: Math.round(p.y) }), 0); }); }
  }
  // ---- what a window offers: its own items, its domain's, its presets, then the window
  function duplicate(rec) {
    const r = WM().rectOf(rec.instanceId) || {}; let state = null; try { state = JSON.parse(JSON.stringify(rec.ctx.serialize())); } catch (e) {}
    return F().spawn(rec.id, { K: rec.K, state, x: (r.x || 0) + 30, y: (r.y || 0) + 30, w: r.w, h: r.h });
  }
  function windowItems(rec, e) {
    const d = rec.def, K = rec.K, id = rec.instanceId, out = [];
    let own = []; try { own = (rec.view && typeof rec.view.contextMenu === 'function' && rec.view.contextMenu(e)) || []; } catch (err) { console.error('[ERAVOS] tool menu failed', err); }
    contributors.forEach(fn => { try { own = own.concat(fn({ rec, def: d, K, instanceId: id, event: e }) || []); } catch (err) { console.error('[ERAVOS] menu contribution failed', err); } });
    own = own.filter(Boolean); if (own.length) out.push(...own, { sep: true });
    const presets = Object.keys(d.presets || {});
    if (presets.length) {
      out.push({ section: 'presets' });
      presets.slice(0, 10).forEach(n => out.push({ label: n, hint: 'load this preset', run: () => K.bus.publish('ui:preset_load:' + id, { name: n }) }));
      if (presets.length > 10) out.push({ label: '… all ' + presets.length + ' on its page', run: () => global.ToolPage && global.ToolPage.open(rec.id, { instanceId: id, K }) });
      out.push({ sep: true });
    }
    out.push({ label: '⧉ Duplicate', hint: 'a second one with the same settings, beside it (not wired)', run: () => duplicate(rec) });
    // 3.126 a suite of your own from what is wired here (his words, 2026-11-06: "setups on the screen. Like what’s wired together")
    const SU = global.Suites; if (SU && SU.capture && SU.wiredGroup(K, id).length > 1) out.push({ label: '◈ Save what is wired here as a suite…', hint: 'every window joined to this one by wires — its parts, wires and settings — saved as a suite of your own (Add › Suites)',
      run: () => global.UIKit.ask('Suite name', 'My suite').then(n => { if (!n) return; const s = SU.capture(K, id, { label: n }); if (s && SU.saveUser(s) && global.Shell) global.Shell.toast(`Saved “${s.label}” — ${s.parts.length} parts, ${s.wiring.length} wires. Find it under ＋ Add › Suites.`, 'good', 5000); }) });
    if (global.ToolPage && !d.system) out.push({ label: '📖 Its page', hint: 'mods, packs, every control', run: () => global.ToolPage.open(rec.id, { instanceId: id, K }) });
    if (global.ToolSettings && global.ToolSettings.has && global.ToolSettings.has(d)) out.push({ label: '⚙ Settings', run: () => global.ToolSettings.toggle(rec) });
    const win = WM().windowOf(id), maxed = win && win.classList.contains('maximized'), folded = win && win.classList.contains('collapsed');
    out.push({ label: maxed ? '⤡ Back to its size' : '⤢ Expand', run: () => WM().maximize(id, !maxed) });
    out.push({ label: folded ? '▾ Unfold' : '– Fold', run: () => K.bus.publish('canvas:collapse', { instanceId: id, on: !folded }) });
    out.push({ sep: true }, { label: '× Close', danger: true, hint: 'Ctrl+Z brings it back with its settings and wires', run: () => F().close(id) });
    return out;
  }
  function onContext(e) {
    if (e.defaultPrevented) return;
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('input, textarea, select, [contenteditable="true"], .cm')) return;
    const wm = WM(); if (!wm || !wm.canvas) return;
    const win = t.closest('.wm-win'), inCanvas = wm.canvas.contains(t);
    if (win) {
      const rec = F().handle(win.getAttribute('data-instance')); if (!rec) return;
      e.preventDefault(); show(e.clientX, e.clientY, windowItems(rec, e), (rec.def.icon ? rec.def.icon + ' ' : '') + rec.def.label);
    } else if (inCanvas) { e.preventDefault(); show(e.clientX, e.clientY, canvasItems(e), 'Canvas'); }
  }
  if (doc) {
    doc.addEventListener('contextmenu', onContext);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuEl) { e.preventDefault(); close(); } }, true);
  }
  const CM = { show, close, contribute(fn) { if (typeof fn === 'function') contributors.push(fn); }, canvasItems, windowItems, duplicate, get open() { return !!menuEl; }, placeNext };
  global.ContextMenu = CM;
})(typeof window !== 'undefined' ? window : globalThis);
