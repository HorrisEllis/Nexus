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

  /** pagePoint(rect, point, zoom) → the page's own right-click point in this window's CSS pixels (BS19: CSS on both sides, no OS scaling) */
  function pagePoint(rect, point, zoom = 1) {
    if (!rect || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return { x: rect.left + point.x * z, y: rect.top + point.y * z };
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
  async function open(menu, { x, y, params = {}, chrome = false, pluginRows = 0, page = null, usePointer = !chrome && !page } = {}) {
    prepare(menu, contextOf(params, { chrome, pluginRows }), params);
    if (root.CGIcons) root.CGIcons.apply(menu);
    let px = x, py = y, source = chrome ? 'event' : 'params';
    if (page) { px = page.x; py = page.y; source = 'page'; }   // BS19: the page's own point first
    else if (usePointer) { const p = await pointer(); if (p) { px = p.x; py = p.y; source = 'pointer'; } }
    menu.dataset.points = JSON.stringify({ used: source, page, params: chrome ? null : { x, y } });   // for the next screenshot: what was used, what else was known
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

  // ── BS18 (0.60.185): Firefox's menus for Clear Glass's own UI ─────────────────────────────────────────────────────────────────────────
  // James, 2026-10-21: "context menu for the clearglass ui like the last 2 images, but matching the them eand dynamic to the click". Which menu
  // is decided by where the click landed (zoneOf); each row names an action the window (browser.js) supplies in `acts`, so a row whose action is
  // missing is not drawn. Not offered, said: Add Folder / Add Separator (the bookmark store has no folders), Select All Tabs and vertical tabs
  // (one page is shared by the tabs).
  function zoneOf(t) {
    if (!t || !t.closest) return 'toolbar';
    if (t.closest('.tab-item')) return 'tab';
    if (t.closest('#tab-bar')) return 'tabstrip';
    if (t.closest('#bookmarks-list .bk-btn')) return 'bookmark';
    if (t.closest('#bookmarks-bar')) return 'bookmarks';
    if (t.closest('#url-bar')) return 'urlbar';
    return 'toolbar';
  }
  const BAR = [
    { label: 'Menu Bar', act: 'menuBar', checked: 'isMenuBar' },
    { label: 'Bookmarks Toolbar', sub: [
      { label: 'Always Show', act: 'barAlways', radio: 'barMode', value: 'always' },
      { label: 'Only Show on New Tab', act: 'barNewTab', radio: 'barMode', value: 'newtab' },
      { label: 'Never Show', act: 'barNever', radio: 'barMode', value: 'never' }] },
    '-',
    { label: 'Customize Toolbar…', icon: 'pin', act: 'customize' },
  ];
  function chromeRows(zone) {
    switch (zone) {
      case 'tab': return [
        { label: 'New Tab', icon: 'plus', kbd: 'Ctrl+T', act: 'newTab' }, '-',
        { label: 'Reload Tab', icon: 'reload', kbd: 'Ctrl+R', act: 'reloadTab' }, { label: 'Duplicate Tab', icon: 'copy', act: 'duplicateTab' },
        { label: 'Bookmark Tab…', icon: 'star', act: 'bookmarkTab' }, { label: 'Move to Background Tab', icon: 'layers', act: 'bgTab' }, '-',
        { label: 'Close Tab', icon: 'close', kbd: 'Ctrl+W', act: 'closeTab' }, { label: 'Close Other Tabs', act: 'closeOthers' },
        { label: 'Reopen Closed Tab', icon: 'history', kbd: 'Ctrl+Shift+T', act: 'reopenClosed' }, '-', ...BAR];
      case 'tabstrip': return [
        { label: 'New Tab', icon: 'plus', kbd: 'Ctrl+T', act: 'newTab' }, { label: 'Reopen Closed Tab', icon: 'history', kbd: 'Ctrl+Shift+T', act: 'reopenClosed' }, '-', ...BAR];
      case 'bookmark': return [
        { label: 'Open', act: 'bmOpen' }, { label: 'Open in New Tab', icon: 'plus', act: 'bmOpenTab' }, { label: 'Open in New Agent Window', icon: 'window', act: 'bmOpenWindow' }, '-',
        { label: 'Edit Bookmark…', icon: 'star', act: 'bmEdit' }, { label: 'Copy Link', icon: 'link', act: 'bmCopy' }, { label: 'Delete Bookmark', icon: 'close', act: 'bmDelete' }, '-',
        { label: 'Open All Bookmarks', act: 'openAll' }, { label: 'Manage Bookmarks', icon: 'folder', act: 'manageBookmarks' }, '-', ...BAR];
      case 'bookmarks': return [
        { label: 'Open All Bookmarks', act: 'openAll' }, '-',
        { label: 'Add Bookmark…', icon: 'star', kbd: 'Ctrl+D', act: 'addBookmark' }, { label: 'Manage Bookmarks', icon: 'folder', act: 'manageBookmarks' }, '-', ...BAR];
      case 'urlbar': return [
        { label: 'Undo', icon: 'undo', kbd: 'Ctrl+Z', act: 'editUndo' }, '-',
        { label: 'Cut', icon: 'cut', kbd: 'Ctrl+X', act: 'editCut' }, { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', act: 'editCopy' },
        { label: 'Paste', icon: 'paste', kbd: 'Ctrl+V', act: 'editPaste' }, { label: 'Paste and Go', act: 'editPasteGo' }, '-',
        { label: 'Select All', icon: 'select', kbd: 'Ctrl+A', act: 'editSelectAll' }];
      default: return [{ label: 'Unpin from Toolbar', icon: 'pin', act: 'unpin', when: 'canUnpin' }, ...BAR];
    }
  }

  let chromeEl = null, subEl = null;
  function closeChrome() { if (subEl) subEl.remove(); subEl = null; if (chromeEl) chromeEl.remove(); chromeEl = null; }
  function drawRows(box, rows, acts, ctx) {
    let lastSep = true;
    for (const it of rows) {
      if (it === '-') { if (!lastSep) { box.append(Object.assign(document.createElement('div'), { className: 'ctx-item sep' })); lastSep = true; } continue; }
      if (it.when && !(acts[it.when] && acts[it.when](ctx))) continue;
      if (!it.sub && typeof acts[it.act] !== 'function') continue;
      const row = document.createElement('div'); row.className = 'ctx-item'; row.setAttribute('role', 'menuitem'); if (it.act) row.dataset.chrome = it.act;
      const ico = document.createElement('span'); ico.className = 'ci-ico';
      const on = it.checked ? !!(acts[it.checked] && acts[it.checked](ctx)) : it.radio ? (acts[it.radio] && acts[it.radio](ctx)) === it.value : null;
      if (on !== null) { row.setAttribute(it.radio ? 'aria-checked' : 'aria-checked', String(on)); if (on) ico.dataset.icon = 'check'; }
      else if (it.icon) ico.dataset.icon = it.icon;
      ico.dataset.iconSize = '16';
      const lab = document.createElement('span'); lab.className = 'ci-label'; lab.textContent = it.label;
      row.append(ico, lab);
      if (it.kbd) { const k = document.createElement('kbd'); k.textContent = it.kbd; row.append(k); }
      if (it.sub) {
        const ch = document.createElement('span'); ch.className = 'ci-sub'; ch.textContent = '›'; row.append(ch); row.classList.add('has-sub');
        const show = () => openSub(row, it.sub, acts, ctx);
        row.addEventListener('mouseenter', show); row.addEventListener('click', (e) => { e.stopPropagation(); show(); });
      } else {
        row.addEventListener('mouseenter', () => { if (subEl && !subEl.contains(row)) { subEl.remove(); subEl = null; } });
        row.addEventListener('click', (e) => { e.stopPropagation(); closeChrome(); try { acts[it.act](ctx); } catch (err) { console.warn(`[ctxmenu] ${it.label}: ${err.message}`); } });
      }
      box.append(row); lastSep = false;
    }
    while (box.lastChild && box.lastChild.classList.contains('sep')) box.lastChild.remove();
    if (root.CGIcons) root.CGIcons.apply(box);
  }
  function openSub(row, rows, acts, ctx) {
    if (subEl) subEl.remove();
    subEl = document.createElement('div'); subEl.className = 'cg-cmenu cg-cmenu-sub visible'; subEl.setAttribute('role', 'menu');
    drawRows(subEl, rows, acts, ctx); document.body.append(subEl);
    const r = row.getBoundingClientRect(); const w = subEl.offsetWidth, h = subEl.offsetHeight;
    let left = r.right - 2; if (left + w > root.innerWidth - GAP) left = r.left - w + 2;
    const top = Math.max(GAP, Math.min(r.top - 4, root.innerHeight - h - GAP));
    subEl.style.left = Math.max(GAP, left) + 'px'; subEl.style.top = top + 'px';
  }
  /** openChrome({ x, y, target, acts }) → { zone, rows } — the menu for where the click landed, at the click */
  function openChrome({ x, y, target, acts = {} } = {}) {
    closeChrome();
    const zone = zoneOf(target); const ctx = { zone, target };
    chromeEl = document.createElement('div'); chromeEl.id = 'ctx-chrome-menu'; chromeEl.className = 'cg-cmenu visible'; chromeEl.setAttribute('role', 'menu'); chromeEl.dataset.zone = zone;
    drawRows(chromeEl, chromeRows(zone), acts, ctx);
    if (!chromeEl.childElementCount) { chromeEl = null; return { zone, rows: 0 }; }
    chromeEl.style.visibility = 'hidden'; document.body.append(chromeEl);
    const at = place(x, y, chromeEl.offsetWidth || 240, chromeEl.offsetHeight || 200, root.innerWidth, root.innerHeight);
    chromeEl.style.left = at.left + 'px'; chromeEl.style.top = at.top + 'px'; chromeEl.style.visibility = '';
    return { zone, rows: chromeEl.querySelectorAll('.ctx-item:not(.sep)').length, ...at };
  }
  if (root && root.document) {
    root.document.addEventListener('click', (e) => { if (chromeEl && !chromeEl.contains(e.target) && !(subEl && subEl.contains(e.target))) closeChrome(); });
    root.document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChrome(); });
    root.addEventListener('blur', closeChrome);
  }

  const api = { place, pagePoint, contextOf, prepare, open, pointer, keys, zoneOf, chromeRows, openChrome, closeChrome };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && root.document) root.CGCtxMenu = api;
})(typeof window !== 'undefined' ? window : globalThis);
