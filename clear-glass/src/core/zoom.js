'use strict';
/**
 * clear-glass/src/core/zoom.js — page zoom, one implementation in Clear Glass's core (BS14, 0.60.183).
 * Spec: clear-glass/spec/browser-shell.spec MOD-BSH-ZOOM-CORE. comp_id: cg.core.zoom
 *
 * James, 2026-10-21: "migrate page zoom to the core of clearglass." Zoom lived twice: the window's applyZoom (+0.1 steps, saved per site
 * from the renderer) and the Page Zoom plugin (driver.exec zoom: its own +0.1 and 0.25–5 bounds, never saved, never shown in the address
 * bar). Now one ladder (Firefox's), one clamp, one store (site settings' zoomFactor, by origin): the window (zoom:* IPC), the shortcuts and
 * agents (the driver's zoom action) all come here. 100% is kept as no setting at all, so a site at the default leaves no row behind.
 */

const STEPS = Object.freeze([0.3, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.2, 1.33, 1.5, 1.7, 2, 2.4, 3]);
const MIN = STEPS[0], MAX = STEPS[STEPS.length - 1];

function clamp(f) { const n = Number(f); return Number.isFinite(n) ? Math.round(Math.min(MAX, Math.max(MIN, n)) * 100) / 100 : 1; }

/** step(factor, 'in'|'out') → the next rung of the ladder (from between two rungs, the next one in that direction) */
function step(factor, dir) {
  const f = clamp(factor);
  if (dir === 'in') return STEPS.find(s => s > f + 1e-6) ?? MAX;
  if (dir === 'out') return [...STEPS].reverse().find(s => s < f - 1e-6) ?? MIN;
  return 1;
}

/** createZoom({ siteSettings }) — applies to a webContents and keeps the factor per site */
function createZoom({ siteSettings = null } = {}) {
  const saved = (url) => { try { const v = siteSettings && siteSettings.get(url, 'zoomFactor'); return v == null ? 1 : clamp(v); } catch (_) { return 1; } };
  function persist(url, f) {
    if (!siteSettings || !/^https?:/i.test(String(url || ''))) return false;
    try { return f === 1 ? (siteSettings.deleteKey(url, 'zoomFactor'), true) : siteSettings.set(url, 'zoomFactor', f) !== false; } catch (_) { return false; }
  }
  function set(wc, factor, { persist: keep = true } = {}) {
    if (!wc || typeof wc.setZoomFactor !== 'function') return { ok: false, error: 'no page to zoom' };
    const f = clamp(factor); wc.setZoomFactor(f);
    const url = typeof wc.getURL === 'function' ? wc.getURL() : '';
    return { ok: true, factor: f, saved: keep ? persist(url, f) : false };
  }
  const current = (wc) => { try { return clamp(wc.getZoomFactor()); } catch (_) { return 1; } };
  return {
    set,
    step: (wc, dir) => set(wc, step(current(wc), dir)),
    reset: (wc) => set(wc, 1),
    restore: (wc) => { const url = wc && typeof wc.getURL === 'function' ? wc.getURL() : ''; return set(wc, saved(url), { persist: false }); },
    saved, current,
  };
}

let _one = null;
/** zoom() — the process's one zoom (main sets siteSettings at boot; the driver and the IPC reach it here) */
function zoom(opts) { if (opts || !_one) _one = createZoom(opts || {}); return _one; }

module.exports = { STEPS, MIN, MAX, clamp, step, createZoom, zoom };
