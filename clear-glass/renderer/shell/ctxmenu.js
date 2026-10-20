'use strict';
/**
 * renderer/shell/ctxmenu.js — the right-click menu: which rows apply, and where it opens (BS15, 0.60.183).
 * Spec: clear-glass/spec/browser-shell.spec MOD-BSH-CTXMENU. comp_id: cg.renderer.shell.ctxmenu
 *
 * James, 2026-10-21: "moright click menu needs to be redone in the same themeand in relation to the mouse is way of f onthe right clicskk"
 * Why it was off: the page's right-click reported params.x/y in the page's own coordinates; browser.js added the webview's offset, which is
 * only the window's coordinates when the page is at 100% and the display unscaled. Now the point is the pointer itself, asked of the main
 * process (window:cursor: screen.getCursorScreenPoint() less the window's content bounds, in this window's CSS pixels); params.x/y plus
 * the offset is the fallback. place() opens the menu down-right of the point and flips it left or up at the window's edges, as a native
 * menu does. What it shows: groups marked data-when (bare, page, chrome, link, plugins, image, selection, editable) appear when they apply; a row
 * a field cannot do (editFlags) is dimmed. browser.js keeps every action's handler.
 */
(function (root) {
  const GAP = 4;
  /** place(x, y, w, h, vw, vh) → { left, top, flipX, flipY } — down-right of the point; flipped at the edges; never off the window */
  function place(x, y, w, h, vw, vh) {
    const px = Number.isFinite(x) ? x : 0, py = Number.isFinite(y) ? y : 0;
    let left = px + 1, top = py + 1, flipX = false, flipY = false;
    if (left + w > vw - GAP) { left = px - w - 1; flipX = true; }
    if (top + h > vh - GAP) { top = py - h - 1; flipY = true; }
    left = Math.max(GAP, Math.min(left, vw - w - GAP));
    top = Math.max(GAP, Math.min(top, vh - h - GAP));
    return { left: Math.round(left), top: Math.round(top), flipX, flipY };
  }

  /** contextOf(params, chrome) → which groups apply */
  function contextOf(params = {}, { chrome = false, pluginRows = 0 } = {}) {
    if (chrome) return { chrome: true };
    const link = /^https?:\/\//i.test(params.linkURL || '');
    const image = params.mediaType === 'image' && !!params.srcURL;
    const selection = !!String(params.selectionText || '').trim() && !params.isEditable;
    const editable = !!params.isEditable;
    // bare: nothing in particular was clicked — then (as Firefox) the navigation row and the page's own rows; on a link, image, selection or
    // field those give way to the rows for it, which keeps the menu short enough to open beside the pointer
    return { page: true, bare: !(link || image || selection || editable), link, image, selection, editable, plugins: pluginRows > 0 };
  }

  const short = (t, n = 28) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function prepare(menu, ctx, params = {}) {
    for (const g of menu.querySelectorAll('.ctx-group')) g.hidden = !ctx[g.dataset.when];
    let first = true;
    for (const g of menu.querySelectorAll('.ctx-group')) { if (g.hidden) continue; g.classList.toggle('first', first); first = false; }
    const sel = short(params.selectionText);
    const label = (a, text) => { const el = menu.querySelector(`[data-action="${a}"] .ci-label`); if (el) el.textContent = text; };
    if (ctx.selection) { label('sel-search', `Search the web for “${sel}”`); label('sel-copilot', `Ask Co-pilot about “${sel}”`); }
    const f = params.editFlags || {};
    const dim = { 'edit-undo': f.canUndo, 'edit-cut': f.canCut, 'edit-copy': f.canCopy, 'edit-paste': f.canPaste, 'edit-selectall': f.canSelectAll };
    for (const [a, ok] of Object.entries(dim)) { const el = menu.querySelector(`[data-action="${a}"]`); if (el) el.classList.toggle('disabled', ctx.editable && ok === false); }
  }

  /** the pointer in this window's CSS pixels, from the main process; null when it cannot say */
  async function pointer() {
    try { const cg = root.ClearGlass; if (!cg || !cg.window || typeof cg.window.cursor !== 'function') return null; const r = await cg.window.cursor(); return r && r.ok && Number.isFinite(r.x) ? r : null; }
    catch (_) { return null; }
  }

  /** open(menu, { x, y, params, chrome, pluginRows, usePointer }) — show the rows that apply, at the pointer */
  async function open(menu, { x, y, params = {}, chrome = false, pluginRows = 0, usePointer = !chrome } = {}) {
    prepare(menu, contextOf(params, { chrome, pluginRows }), params);
    if (root.CGIcons) root.CGIcons.apply(menu);
    let px = x, py = y, source = 'event';
    if (usePointer) { const p = await pointer(); if (p) { px = p.x; py = p.y; source = 'pointer'; } }
    menu.style.visibility = 'hidden'; menu.classList.add('visible');
    const w = menu.offsetWidth || 240, h = menu.offsetHeight || 300;
    const at = place(px, py, w, h, root.innerWidth, root.innerHeight);
    menu.style.left = at.left + 'px'; menu.style.top = at.top + 'px';
    menu.style.transformOrigin = `${at.flipX ? 'right' : 'left'} ${at.flipY ? 'bottom' : 'top'}`;
    menu.dataset.source = source; menu.style.visibility = '';
    return { ...at, x: px, y: py, source };
  }

  // keyboard: arrows move through the visible rows, Enter runs one (the menu's own click handler does the rest)
  function keys(menu, e) {
    if (!menu.classList.contains('visible')) return false;
    const rows = [...menu.querySelectorAll('.ctx-group:not([hidden]) .ctx-item:not(.sep):not(.disabled)')].filter(r => r.style.display !== 'none');
    if (!rows.length) return false;
    const i = rows.indexOf(menu.querySelector('.ctx-item.kb'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); rows.forEach(r => r.classList.remove('kb'));
      rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length].classList.add('kb'); return true;
    }
    if (e.key === 'Enter' && i >= 0) { e.preventDefault(); rows[i].click(); return true; }
    return false;
  }

  const api = { place, contextOf, prepare, open, pointer, keys };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) root.CGCtxMenu = api;
})(typeof window !== 'undefined' ? window : globalThis);
