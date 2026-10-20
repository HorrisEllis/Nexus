'use strict';
/**
 * renderer/shell/menus.js — the menu bar and the ☰ app menu, from one model (BS3, 0.60.179). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-MENUS.
 * comp_id: cg.renderer.shell.menus
 *
 * James, 2026-10-21: "make it dynamic like firefox. liek a whole toolbar menu." Firefox's menu bar (File Edit View History Bookmarks
 * Tools Help: Alt shows it for one use, View → Toolbars → Menu Bar keeps it) and its ☰ menu order. Every item runs one existing
 * behaviour: `click` presses the element browser.js already wired, `act` calls window.CGShell (browser.js's own functions) or a shell
 * action below. An item whose element is missing is not drawn, and is logged (§1.2).
 */
(function () {
  const S = () => window.CGShell || {};
  const cg = () => window.ClearGlass;
  const $ = (id) => document.getElementById(id);
  const KEY = 'cg.shell.menubar';
  let keepBar = false; try { keepBar = localStorage.getItem(KEY) === '1'; } catch (_) {}

  // shell actions (not in browser.js): each says what it does
  const ACT = {
    newWindow: () => cg().window.open({ url: 'about:blank' }),
    snowflakePage: async () => {
      const url = S().wv && S().wv.getURL ? S().wv.getURL() : '';
      if (!/^https?:/.test(url)) return window.CGShellUI && window.CGShellUI.toast('Open a web page first: Snowflake opens http and https pages.');
      try { const r = await fetch('http://127.0.0.1:7702/cli/net/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) }).then(x => x.json()); if (!r.ok) window.CGShellUI && window.CGShellUI.toast(`Snowflake: ${r.error}`); }
      catch (e) { window.CGShellUI && window.CGShellUI.toast(`Snowflake: the bridge did not answer (${e.message})`); }
    },
    settings: (area) => cg().window.openSettings(area),
    edit: (op) => { const a = document.activeElement; const inShell = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && a.id !== 'wv';
      if (inShell) return document.execCommand(op); const w = S().wv; if (w && typeof w[op] === 'function') w[op](); },
    // BS18 (0.60.185): the bookmarks toolbar has Firefox's three modes (CGShell.bookmarksBar); this toggles Always ↔ Never
    toggleBar: (id) => { if (id === 'bookmarks-bar' && S().bookmarksBar) return S().bookmarksBar(S().bookmarksBar() === 'never' ? 'always' : 'never'); const el = $(id); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; },
    menuBar: () => { keepBar = !keepBar; try { localStorage.setItem(KEY, keepBar ? '1' : '0'); } catch (_) {} showBar(keepBar); },
    extensions: () => window.CGExtensions && window.CGExtensions.open(),
    downloads: () => window.CGDownloads && window.CGDownloads.open(),
    floatCli: () => $('btn-float-cli') && $('btn-float-cli').click(),
  };

  // the model: { label, kbd, click: elementId } | { label, kbd, act: [name, ...args] } | { label, run: 'CGShell.fn' } | '-'
  const MODEL = [
    { id: 'file', label: 'File', items: [
      { label: 'New Tab', kbd: 'Ctrl+T', ico: '＋', run: 'newTab' },
      { label: 'New Window', kbd: 'Ctrl+N', ico: '🗗', act: ['newWindow'] },
      { label: 'Open Page with Snowflake', ico: '❄', act: ['snowflakePage'] },
      '-',
      { label: 'Close Tab', kbd: 'Ctrl+W', ico: '✕', run: 'closeTab' },
      { label: 'Reopen Closed Tab', kbd: 'Ctrl+Shift+T', ico: '↶', run: 'reopenClosed' },
      '-',
      { label: 'Import from Firefox…', ico: '🦊', act: ['settings', 'import'] },
      { label: 'Print…', kbd: 'Ctrl+P', ico: '🖨', run: 'print' },
      '-',
      { label: 'Close Window', ico: '⏻', click: 'btn-close-tray' },
    ] },
    { id: 'edit', label: 'Edit', items: [
      { label: 'Undo', kbd: 'Ctrl+Z', act: ['edit', 'undo'] }, { label: 'Redo', kbd: 'Ctrl+Y', act: ['edit', 'redo'] }, '-',
      { label: 'Cut', kbd: 'Ctrl+X', act: ['edit', 'cut'] }, { label: 'Copy', kbd: 'Ctrl+C', act: ['edit', 'copy'] }, { label: 'Paste', kbd: 'Ctrl+V', act: ['edit', 'paste'] },
      { label: 'Select All', kbd: 'Ctrl+A', act: ['edit', 'selectAll'] }, '-',
      { label: 'Find in Page…', kbd: 'Ctrl+F', ico: '🔍', run: 'find' },
    ] },
    { id: 'view', label: 'View', items: [
      { label: 'Menu Bar', ico: '☰', act: ['menuBar'], checked: () => keepBar },
      { label: 'Bookmarks Toolbar', ico: '★', act: ['toggleBar', 'bookmarks-bar'], checked: () => (S().bookmarksBar ? S().bookmarksBar() !== 'never' : $('bookmarks-bar') && $('bookmarks-bar').style.display !== 'none') },
      { label: 'Co-pilot Sidebar', ico: '✦', click: 'copilot-toggle' },
      { label: 'Floating CLI', kbd: 'Ctrl+Shift+Space', ico: '›_', act: ['floatCli'] },
      '-',
      { label: 'Zoom In', kbd: 'Ctrl++', run: 'zoom', arg: 'in' }, { label: 'Zoom Out', kbd: 'Ctrl+-', run: 'zoom', arg: 'out' }, { label: 'Actual Size', kbd: 'Ctrl+0', run: 'zoom', arg: 'reset' },
      '-',
      { label: 'Page Map', ico: '▦', click: 'btn-page-map' }, { label: 'DOM Archaeology', ico: '⛏', click: 'btn-dom' },
      { label: 'Maximize', ico: '⛶', click: 'btn-maximize' },
    ] },
    { id: 'history', label: 'History', items: [
      { label: 'Show All History', kbd: 'Ctrl+H', ico: '🕐', run: 'history' },
      { label: 'Reopen Closed Tab', kbd: 'Ctrl+Shift+T', ico: '↶', run: 'reopenClosed' },
      { label: 'Session Rewind', ico: '⏮', click: 'btn-rewind' },
      { label: 'Background Tabs', ico: '⬡', run: 'bgTabs' },
      { label: 'Library', kbd: 'Ctrl+J', ico: '📚', run: 'library' },
    ] },
    { id: 'bookmarks', label: 'Bookmarks', items: [
      { label: 'Bookmark This Page', kbd: 'Ctrl+D', ico: '★', click: 'btn-bookmark' },
      { label: 'Manage Bookmarks', ico: '📚', run: 'library', arg: 'bookmarks' },
      { label: 'Bookmarks Toolbar', ico: '▭', act: ['toggleBar', 'bookmarks-bar'] },
    ] },
    { id: 'tools', label: 'Tools', items: [
      { label: 'Downloads', kbd: 'Ctrl+Shift+Y', ico: '⬇', act: ['downloads'] },
      { label: 'Plugins and Add-ons', kbd: 'Ctrl+Shift+A', ico: '🧩', act: ['extensions'] },
      { label: 'Import from Firefox…', ico: '🦊', act: ['settings', 'import'] },
      '-',
      { label: 'Userscripts', ico: '✎', click: 'btn-userscripts' }, { label: 'Element Picker', ico: '◎', click: 'picker-btn' },
      { label: 'Agent Mesh', ico: '⬡', click: 'btn-mesh' }, { label: 'NCP Providers', ico: '⟳', click: 'btn-providers' },
      { label: 'Site Settings', ico: '🛡', run: 'siteSettings' }, { label: 'Network and Snowflake', ico: '❄', act: ['settings', 'network'] },
      { label: 'Diagnostics', ico: '⚕', click: 'btn-diag' },
      '-',
      { label: 'Customize Toolbar…', ico: '🧰', run: 'customize' },
      { label: 'Settings', kbd: 'Ctrl+,', ico: '⚙', click: 'btn-settings' },
    ] },
    { id: 'help', label: 'Help', items: [
      { label: 'Keyboard Shortcuts', ico: '⌨', act: ['settings', 'shortcuts'] },
      { label: 'About Clear Glass', ico: 'ⓘ', act: ['settings', 'general'] },
    ] },
  ];

  // BS17 (0.60.185) — James: "remove the bookmarks from the menuconsolidate the menu ... use the library for the bookmarks". The ☰ menu is this
  // one model now (it was this model plus rows browser.js wrote by hand, and a bookmarks list): Firefox's groups, drawn icons; Bookmarks opens
  // the Library on its bookmarks. `da` keeps each 0.60.184 row's data-action (§0.3). The unpinned tools (browser.js) go under More tools.
  const APP_TOP = [
    { label: 'New Tab', kbd: 'Ctrl+T', icon: 'plus', run: 'newTab' },
    { label: 'New Window', kbd: 'Ctrl+N', icon: 'window', act: ['newWindow'] },
    { label: 'Open Page with Snowflake', icon: 'snow', act: ['snowflakePage'] },
  ];
  const APP_MID = [
    { label: 'Bookmarks', icon: 'star', run: 'library', arg: 'bookmarks', da: 'bookmarks' },
    { label: 'History', kbd: 'Ctrl+H', icon: 'history', run: 'history', da: 'history' },
    { label: 'Downloads', kbd: 'Ctrl+J', icon: 'download', run: 'library', arg: 'downloads', da: 'downloads' },
    { label: 'Library', icon: 'folder', run: 'library', da: 'library' },
    '-',
    { label: 'Plugins and Add-ons', kbd: 'Ctrl+Shift+A', icon: 'plugins', act: ['extensions'] },
    { label: 'Site Settings', icon: 'shield', run: 'siteSettings', da: 'site-settings' },
    { label: 'Background Tabs', icon: 'layers', run: 'bgTabs', da: 'bgtabs' },
    { label: 'Import from Firefox…', icon: 'external', act: ['settings', 'import'] },
    '-',
    { label: 'Print…', kbd: 'Ctrl+P', icon: 'print', run: 'print' },
    { label: 'Find in Page…', kbd: 'Ctrl+F', icon: 'search', run: 'find' },
    { zoom: true },
  ];
  const APP_END = [
    { label: 'Customize Toolbar…', icon: 'pin', run: 'customize', da: 'customize-toolbar' },
    { label: 'Settings', kbd: 'Ctrl+,', icon: 'settings', click: 'btn-settings' },
  ];

  const targetOk = (it) => !it.click || !!$(it.click);
  function run(it) {
    try {
      if (it.click) { const el = $(it.click); if (el) el.click(); else console.warn(`[menus] ${it.label}: #${it.click} is missing`); return; }
      if (it.run) { const f = S()[it.run]; if (typeof f === 'function') return f(it.arg); console.warn(`[menus] ${it.label}: CGShell.${it.run} is not ready`); return; }
      if (it.act) { const [name, ...args] = it.act; return ACT[name] && ACT[name](...args); }
    } catch (e) { console.warn(`[menus] ${it.label} failed: ${e.message}`); }
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ── the menu bar ─────────────────────────────────────────────────────────────
  let openIdx = -1, drop = null;
  function closeDrop() { if (drop) drop.remove(); drop = null; const bar = $('menubar'); if (bar) bar.querySelectorAll('.mb-top').forEach(b => b.classList.remove('open')); openIdx = -1; if (!keepBar) showBar(false); }
  function openDrop(i) {
    const bar = $('menubar'); const tops = bar.querySelectorAll('.mb-top'); if (!tops[i]) return;
    if (drop) drop.remove(); tops.forEach(b => b.classList.remove('open')); tops[i].classList.add('open'); openIdx = i;
    drop = document.createElement('div'); drop.className = 'mb-drop'; drop.setAttribute('role', 'menu');
    const r = tops[i].getBoundingClientRect(); drop.style.left = `${r.left}px`; drop.style.top = `${r.bottom + 2}px`;
    for (const it of MODEL[i].items) {
      if (it === '-') { drop.append(Object.assign(document.createElement('div'), { className: 'mb-sep' })); continue; }
      if (!targetOk(it)) { console.warn(`[menus] ${it.label}: target #${it.click} missing; not drawn`); continue; }
      const row = document.createElement('div'); row.className = 'mb-item'; row.setAttribute('role', 'menuitem'); row.tabIndex = -1;
      const checked = it.checked ? it.checked() : null; if (checked !== null) row.setAttribute('aria-checked', String(!!checked));
      row.innerHTML = `<span class="mb-ico">${checked ? '✓' : esc(it.ico || '')}</span><span>${esc(it.label)}</span>${it.kbd ? `<span class="mb-kbd">${esc(it.kbd)}</span>` : ''}`;
      row.addEventListener('click', () => { closeDrop(); run(it); });
      row.addEventListener('mouseenter', () => { drop.querySelectorAll('.mb-item').forEach(x => x.classList.remove('focus')); row.classList.add('focus'); });
      drop.append(row);
    }
    document.body.append(drop);
  }
  function showBar(on) { const bar = $('menubar'); if (bar) bar.hidden = !on; }
  function mountMenuBar() {
    const bar = $('menubar'); if (!bar) return;
    bar.replaceChildren(...MODEL.map((m, i) => { const b = document.createElement('button'); b.className = 'mb-top'; b.textContent = m.label; b.setAttribute('role', 'menuitem'); b.setAttribute('aria-haspopup', 'true');
      b.addEventListener('click', (e) => { e.stopPropagation(); openIdx === i ? closeDrop() : openDrop(i); });
      b.addEventListener('mouseenter', () => { if (openIdx >= 0 && openIdx !== i) openDrop(i); }); return b; }));
    showBar(keepBar);
    document.addEventListener('click', (e) => { if (drop && !drop.contains(e.target)) closeDrop(); });
    // Firefox: a lone Alt shows the bar (and focuses File); arrows move; Enter runs; Esc closes
    let altAlone = false;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') { altAlone = true; return; }
      altAlone = false;
      if (!drop) return;
      const rows = [...drop.querySelectorAll('.mb-item')]; let k = rows.findIndex(r => r.classList.contains('focus'));
      if (e.key === 'Escape') { closeDrop(); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { k = (k + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; rows.forEach(r => r.classList.remove('focus')); rows[k] && rows[k].classList.add('focus'); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { openDrop((openIdx + (e.key === 'ArrowRight' ? 1 : -1) + MODEL.length) % MODEL.length); e.preventDefault(); }
      else if (e.key === 'Enter' && rows[k]) { rows[k].click(); e.preventDefault(); }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && altAlone) { altAlone = false; if ($('menubar').hidden) { showBar(true); openDrop(0); } else if (!keepBar) closeDrop(); else if (drop) closeDrop(); else openDrop(0); }
    }, true);
  }

  // ── the ☰ menu's rows (browser.js puts them in its panel and calls wire()) ──
  function row(it) {
    if (it.zoom) return `<div class="am-zoom"><span class="lbl">Zoom</span><button class="menu-zoom-btn" data-am-zoom="out" aria-label="Zoom out">−</button><span class="am-zoom-pct">${(S().zoomPct && S().zoomPct()) || 100}%</span><button class="menu-zoom-btn" data-am-zoom="in" aria-label="Zoom in">+</button><button class="menu-zoom-btn" data-am-zoom="reset" title="Actual size">⤢</button></div>`;
    if (it === '-') return '<div class="menu-sep"></div>';
    if (!targetOk(it)) return '';
    const ico = it.icon ? `<span class="mb-ico" data-icon="${esc(it.icon)}" data-icon-size="16"></span>` : `<span class="mb-ico">${esc(it.ico || '')}</span>`;
    return `<div class="menu-item" role="menuitem" data-am="${esc(it.label)}"${it.da ? ` data-action="${esc(it.da)}"` : ''}>${ico}<span class="menu-lbl">${esc(it.label)}</span>${it.kbd ? `<span class="menu-kbd">${esc(it.kbd)}</span>` : ''}</div>`;
  }
  const PARTS = { top: () => APP_TOP, mid: () => APP_MID, end: () => APP_END };
  function appMenuHTML(part) { return (PARTS[part] || PARTS.mid)().map(row).join(''); }
  function wire(panel, close) {
    const all = [...APP_TOP, ...APP_MID, ...APP_END].filter(x => x && x.label);
    if (window.CGIcons) window.CGIcons.apply(panel);
    // BS17 (0.60.185): run after this click has finished — a panel the row opens (Plugins and Add-ons) was being closed by the same click's
    // outside-click handler, found by clicking every row in Clear Glass
    panel.querySelectorAll('[data-am]').forEach(el => el.addEventListener('click', () => { const it = all.find(x => x.label === el.dataset.am); close && close(); if (it) setTimeout(() => run(it), 0); }));
    panel.querySelectorAll('[data-am-zoom]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); S().zoom && S().zoom(el.dataset.amZoom); const p = panel.querySelector('.am-zoom-pct'); if (p && S().zoomPct) p.textContent = `${S().zoomPct()}%`; }));
  }

  window.CGMenus = { model: () => MODEL, app: () => ({ top: APP_TOP, mid: APP_MID, end: APP_END }), run, appMenuHTML, wire, mountMenuBar, showBar, ACT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMenuBar); else mountMenuBar();
})();
