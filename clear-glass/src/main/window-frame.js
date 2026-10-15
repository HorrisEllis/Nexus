'use strict';
/**
 * clear-glass/src/main/window-frame.js — one dark frame for every Clear Glass window that is not the main browser (CS1, 0.60.54)
 * comp_id: clear-glass.main.window-frame
 * Map: docs/2026-10-15-clear-glass-surfaces-phasemap.spec (CS1_one_popup_frame)
 *
 * James, 2026-10-15: "can you make all pop ups from clear glass look like this" (the dark Settings window).
 *
 * Settings, Library and the idearium compartment windows draw their OWN title bar inside the page, so they are frameless. A window that loads
 * someone else's page (the Google or ChatGPT sign-in, any window.open popup) cannot have a title bar painted into a page Clear Glass does not
 * own, so it keeps the OS frame and the frame is made dark: the app theme is dark (so the title bar is), the background is the same #08080d
 * before the first paint, the File/Edit/View menu is gone, and the window has a name. What is inside the page is the site's own and is not restyled.
 *
 * Pure parts are exported for tests; only darkenWindow touches a live window.
 */
const BG = '#08080d';
const BASE = Object.freeze({ backgroundColor: BG, autoHideMenuBar: true });

/** popupOptions(features, title) → overrideBrowserWindowOptions for a page's window.open() */
function popupOptions(features, title) {
  const o = { ...BASE, show: true, resizable: true, title: title || 'Clear Glass' };
  for (const part of String(features || '').split(',')) {
    const [k, v] = part.split('=').map(s => (s || '').trim().toLowerCase()); const n = Number(v);
    if ((k === 'width' || k === 'height') && Number.isFinite(n) && n >= 320) o[k] = Math.round(n);
  }
  return o;
}

/** withDark(opts) → a window's options with the dark base added (never overriding a choice the caller made) */
function withDark(opts = {}) { return { ...BASE, ...opts }; }

/** darkenWindow(win) — the parts only a live window can take: no menu bar, the dark background */
function darkenWindow(win) {
  try { if (win && !win.isDestroyed()) { win.removeMenu(); win.setBackgroundColor(BG); } } catch (_) { /* a closing window is not an error */ }
}

/** setAppTheme(nativeTheme) — once at ready: native title bars follow the app, and the app is dark */
function setAppTheme(nativeTheme) { try { nativeTheme.themeSource = 'dark'; return true; } catch (_) { return false; } }

module.exports = { BG, popupOptions, withDark, darkenWindow, setAppTheme };
