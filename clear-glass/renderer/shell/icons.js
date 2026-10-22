'use strict';
/**
 * renderer/shell/icons.js — Clear Glass's own icon set (BS8, 0.60.180). Spec: clear-glass/spec/browser-shell.spec MOD-BSH-DESIGN.
 * comp_id: cg.renderer.shell.icons
 *
 * James, 2026-10-21: "omg this looks bad. enterprise grade, production quality. outliar level ui". The toolbar used emoji, which every OS
 * draws differently and which read as a prototype. These are drawn for Clear Glass: a 24-unit grid, 1.75 stroke, round caps and joins,
 * currentColor — the manner of Firefox's Proton icons and Lucide. No font, no network.
 *   CGIcons.svg(name, { size }) → '<svg …>'     CGIcons.apply(root) — every [data-icon] element gets its drawing (once)
 * A button keeps its aria-label and title: the icon is decoration.
 */
(function () {
  const P = (d) => d.map(x => (x.startsWith('<') ? x : `<path d="${x}"/>`)).join('');
  const ICONS = {
    back:     P(['M15 18l-6-6 6-6']),
    forward:  P(['M9 18l6-6-6-6']),
    reload:   P(['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v5h-5']),
    home:     P(['M4 10.5 12 4l8 6.5', 'M6 9v11h12V9', 'M10 20v-5h4v5']),
    star:     P(['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z']),
    lock:     P(['<rect x="5" y="10.5" width="14" height="10" rx="2.2"/>', 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3']),
    warn:     P(['M12 4 21 19.5H3z', 'M12 10v4.5', 'M12 17.2v.1']),
    snow:     P(['M12 2.5v19', 'M3.8 7.25l16.4 9.5', 'M3.8 16.75l16.4-9.5', 'M9.5 4.2 12 6l2.5-1.8', 'M9.5 19.8 12 18l2.5 1.8', 'M4 11.2l2.6.8-.6 2.8', 'M20 11.2l-2.6.8.6 2.8']),
    plugins:  P(['M9 4.5h2.2a1.8 1.8 0 1 1 3.6 0H17a1.5 1.5 0 0 1 1.5 1.5v2.2a1.8 1.8 0 1 1 0 3.6V14a1.5 1.5 0 0 1-1.5 1.5h-2.2a1.8 1.8 0 1 0-3.6 0H9A1.5 1.5 0 0 1 7.5 14v-2.2a1.8 1.8 0 1 0 0-3.6V6A1.5 1.5 0 0 1 9 4.5z']),
    download: P(['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 19.5h14']),
    sparkle:  P(['M12 3.5c.6 4.3 3.9 7.6 8.5 8.5-4.6.9-7.9 4.2-8.5 8.5-.6-4.3-3.9-7.6-8.5-8.5 4.6-.9 7.9-4.2 8.5-8.5z']),
    terminal: P(['<rect x="3" y="4.5" width="18" height="15" rx="2.5"/>', 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4.5']),
    menu:     P(['M4 7h16', 'M4 12h16', 'M4 17h16']),
    agents:   P(['<rect x="5" y="8" width="14" height="11" rx="3"/>', 'M12 4.5V8', '<circle cx="12" cy="3.6" r="1"/>', 'M9.5 13v1', 'M14.5 13v1', 'M2.5 12.5v3', 'M21.5 12.5v3']),
    plus:     P(['M12 5v14', 'M5 12h14']),
    minus:    P(['M5 12h14']),   // 0.60.211 zoom out
    close:    P(['M6.5 6.5l11 11', 'M17.5 6.5l-11 11']),
    minimize: P(['M6 12h12']),
    maximize: P(['<rect x="6" y="6" width="12" height="12" rx="1.5"/>']),
    search:   P(['<circle cx="11" cy="11" r="6.5"/>', 'M20 20l-4.4-4.4']),
    history:  P(['<circle cx="12" cy="12" r="8.5"/>', 'M12 7.5V12l3 2']),
    settings: P(['M4 7h9', 'M17 7h3', '<circle cx="15" cy="7" r="2"/>', 'M4 17h3', 'M11 17h9', '<circle cx="9" cy="17" r="2"/>']),
    mic:      P(['<rect x="9" y="3.5" width="6" height="11" rx="3"/>', 'M5.5 11.5a6.5 6.5 0 0 0 13 0', 'M12 18v2.5']),
    send:     P(['M4.5 12 20 4.5 13.5 20l-2-6.5z', 'M11.5 13.5 20 4.5']),
    play:     P(['M8 5.5v13l10-6.5z']),
    stop:     P(['<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>']),
    eye:      P(['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', '<circle cx="12" cy="12" r="3"/>']),
    folder:   P(['M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z']),
    mesh:     P(['<circle cx="6" cy="6" r="2.2"/>', '<circle cx="18" cy="6" r="2.2"/>', '<circle cx="12" cy="18" r="2.2"/>', 'M8 7.2l2.8 8.8', 'M16 7.2l-2.8 8.8', 'M8.2 6h7.6']),
    script:   P(['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5.5l-3 13']),
    target:   P(['<circle cx="12" cy="12" r="7.5"/>', '<circle cx="12" cy="12" r="2.5"/>', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3']),
    user:     P(['<circle cx="12" cy="8.5" r="3.8"/>', 'M4.5 20a7.5 7.5 0 0 1 15 0']),
    queue:    P(['M5 7h14', 'M5 12h14', 'M5 17h9']),
    shield:   P(['M12 3.5l7 3v5.3c0 4.4-2.9 7.4-7 8.7-4.1-1.3-7-4.3-7-8.7V6.5z']),
    key:      P(['<circle cx="8" cy="15" r="3.8"/>', 'M10.8 12.3 19 4', 'M15.5 7.5l2.5 2.5', 'M13.5 9.5l1.8 1.8']),
    pause:    P(['M9 6v12', 'M15 6v12']),
    radar:    P(['<circle cx="12" cy="12" r="1.6"/>', 'M8.5 8.5a5 5 0 0 0 0 7', 'M15.5 8.5a5 5 0 0 1 0 7', 'M5.6 5.6a9 9 0 0 0 0 12.8', 'M18.4 5.6a9 9 0 0 1 0 12.8']),
    pin:      P(['M9 4h6l-1 5 3 3H7l3-3z', 'M12 12v8']),
    external: P(['M14 4.5h5.5V10', 'M19.5 4.5 11 13', 'M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10']),
    // BS15 (0.60.183) — the right-click menu's rows
    copy:     P(['<rect x="8.5" y="8.5" width="11" height="11" rx="2"/>', 'M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5']),
    cut:      P(['<circle cx="6.5" cy="17.5" r="2.5"/>', '<circle cx="17.5" cy="17.5" r="2.5"/>', 'M8.3 15.7 18 4.5', 'M15.7 15.7 6 4.5']),
    paste:    P(['M9 4.5h6v3H9z', 'M15 6h2.5A1.5 1.5 0 0 1 19 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H9']),
    link:     P(['M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1']),
    image:    P(['<rect x="4" y="5" width="16" height="14" rx="2"/>', '<circle cx="9" cy="10" r="1.5"/>', 'M20 16l-4.5-4.5L7 20']),
    code:     P(['M9 8l-4 4 4 4', 'M15 8l4 4-4 4', 'M13.5 5.5l-3 13']),
    undo:     P(['M9 7 5 11l4 4', 'M5 11h9.5a4.5 4.5 0 0 1 0 9H12']),
    select:   P(['M4.5 8V5.5a1 1 0 0 1 1-1H8', 'M16 4.5h2.5a1 1 0 0 1 1 1V8', 'M19.5 16v2.5a1 1 0 0 1-1 1H16', 'M8 19.5H5.5a1 1 0 0 1-1-1V16', 'M9 12h6']),
    camera:   P(['M4.5 8.5A1.5 1.5 0 0 1 6 7h2l1.5-2h5L16 7h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z', '<circle cx="12" cy="12.5" r="3"/>']),
    print:    P(['M7 9V4.5h10V9', '<rect x="4.5" y="9" width="15" height="7" rx="1.5"/>', 'M7 14h10v5.5H7z']),
    window:   P(['<rect x="4" y="5" width="16" height="14" rx="2"/>', 'M4 9h16']),
    layers:   P(['M12 4 3.5 8.5 12 13l8.5-4.5z', 'M3.5 12.5 12 17l8.5-4.5', 'M3.5 16.5 12 21l8.5-4.5']),
    zoom:     P(['<circle cx="11" cy="11" r="6.5"/>', 'M20 20l-4.4-4.4', 'M8.5 11h5', 'M11 8.5v5']),   // 0.60.211 zoom controls
    briefcase: P(['<rect x="3.5" y="7.5" width="17" height="12" rx="2.2"/>', 'M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5', 'M3.5 12.5h17']),   // 0.60.210 Fiverr gigs
    check:    P(['M5 12.5l4.5 4.5L19 7.5']),   // BS18 (0.60.185) a checked menu row
    token:    P(['<circle cx="12" cy="12" r="7.5"/>', 'M9.5 9.5h5', 'M12 9.5v6']),
  };
  function svg(name, { size = 18 } = {}) {
    const body = ICONS[name]; if (!body) return null;
    return `<svg class="cg-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  function apply(root = document) {
    for (const el of root.querySelectorAll('[data-icon]')) {
      if (el.dataset.iconDone) continue;
      const s = svg(el.dataset.icon, { size: +el.dataset.iconSize || 18 });
      if (!s) { console.warn(`[icons] no drawing for "${el.dataset.icon}"`); continue; }
      const keep = [...el.children].filter(c => c.matches && c.matches('.sh-ring, .sh-badge'));   // live parts a button carries (ring, count)
      el.innerHTML = s; keep.forEach(k => el.append(k)); el.dataset.iconDone = '1';
    }
  }
  // each built-in plugin's drawing (its manifest glyph stays the fallback for a plugin with none here)
  const PLUGIN = { zoom: 'search', snowflake: 'snow', adblocker: 'shield', passwords: 'key', permissions: 'lock', 'captcha-pause': 'pause', 'guardian-listeners': 'radar' };
  const plugin = (p, opts) => svg(PLUGIN[p && p.name] || '', opts);
  window.CGIcons = { svg, apply, plugin, ICONS, PLUGIN };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply()); else apply();
})();
