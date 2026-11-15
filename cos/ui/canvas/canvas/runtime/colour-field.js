/* ERAVOS runtime — colour-field.js → window.ColourField (3.98, the Field theme). Domain-free.
 * Asked: "a layer above the canvas is a gradient that's invisible except for where the accents are. The button borders … if you drag the
 * tools around, it changes the colors in relation to where it's at in the canvas" · "I want this a theme. Like they're clear" · "The
 * canvas gradient is stationary so moving the tool shows the gradient. It's the only place you can see it."
 * One gradient lies across the canvas (in canvas units, so panning and zooming carry it with the tools). Nothing draws it; every accent
 * (a button's border and label, a knob's ring, a title, a segment) is coloured with the part of the gradient under it:
 *   --fl  the colour under its left edge · --fc  under its middle · --fr  under its right edge
 * so a wide button shows the field running across it, and dragging a tool changes all its colours. A window also gets --facc (the
 * colour under its middle) — what its drawn displays use. The reactive colours move the whole field at once (eravos.css: --snd-hn turns every
 * hue together, --snd-lv lights them), so every colour stays in step. A CSS fixed background cannot do this: inside the canvas's
 * transform it is measured from each element, not from the screen (measured, 3.98).
 *   ColourField.at(x, y[, phase]) → '#rrggbb' at a canvas point · sweep() · flow() · phase · on() · STOPS · RECT · DRIFT
 * 3.100 the field flows slowly (DRIFT seconds a pass), unless reduced motion is asked for. */
(function (global) {
  'use strict';
  const doc = global.document; if (!doc) return;
  // the field, in canvas units: violet → magenta → rose → ember → gold, at 125° across RECT (beyond it, the end colours)
  const STOPS = [[0, '#6f5cff'], [0.2, '#b04dff'], [0.42, '#ff3d8b'], [0.66, '#ff7a45'], [0.88, '#ffc24a'], [1, '#ffd37a']];
  const RECT = [-100, -100, 2400, 1500], ANGLE = 125;
  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), two = (v) => ('0' + Math.round(v).toString(16)).slice(-2);
  const RGB = STOPS.map(s => [s[0], hex(s[1])]);
  const a = ANGLE * Math.PI / 180, DX = Math.sin(a), DY = -Math.cos(a), SPAN = Math.abs(RECT[2] * DX) + Math.abs(RECT[3] * DY);
  const CX = RECT[0] + RECT[2] / 2, CY = RECT[1] + RECT[3] / 2;
  // 3.100 "can you have the gradient slowly moving": the field flows — its colours travel along it, one full pass in DRIFT seconds, and
  // come back the other way (a mirrored run, so there is never a seam). Still when the system asks for reduced motion.
  const DRIFT = 48;
  let phase = 0;
  const still = () => doc.documentElement.dataset.gfx === 'low' || !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function at(x, y, ph) {
    let t = Math.max(0, Math.min(1, ((x - CX) * DX + (y - CY) * DY) / SPAN + 0.5));
    const p = ph === undefined ? phase : ph; if (p) { t = (t + p) % 2; if (t > 1) t = 2 - t; }
    for (let i = 1; i < RGB.length; i++) if (t <= RGB[i][0]) {
      const [t0, c0] = RGB[i - 1], [t1, c1] = RGB[i], k = (t - t0) / ((t1 - t0) || 1);
      return '#' + c0.map((v, j) => two(v + (c1[j] - v) * k)).join('');
    }
    return STOPS[STOPS.length - 1][1];
  }
  const on = () => doc.documentElement.dataset.theme === 'field';
  // what takes the field: every accent, in a window, on the toolbar or on a tool page
  const SEL = '.uk-btn, .tb-btn, .uk-toggle, .uk-seg, .uk-select, .uk-text, .tp-btn, .ap-btn, .sbk-chip, .sbk-alt, .fl-btn, .wm-title, .uk-knob, .uk-fader, .tp-title, .logo, .brand';
  const canvasEl = () => doc.getElementById('canvas');
  function toCanvas(sx, sy) {
    const WM = global.CanvasWM, c = canvasEl(); if (!WM || !WM.view || !c) return [sx, sy];
    const r = c.getBoundingClientRect(), v = WM.view, z = v.z || 1; return [(sx - r.left - v.x) / z, (sy - r.top - v.y) / z];
  }
  // where each accent sits (canvas units) is measured when something moves; its colours are worked out from that, so the flow itself
  // reads no layout — it only writes the colours that changed
  const painted = new Set(), wins = new Set();
  function colour(el) {
    const P = el._fp; if (!P) return;
    const v = at(P[0], P[1]) + at(P[2], P[3]) + at(P[4], P[5]); if (el._fv === v) return; el._fv = v;
    el.style.setProperty('--fl', v.slice(0, 7)); el.style.setProperty('--fc', v.slice(7, 14)); el.style.setProperty('--fr', v.slice(14));
  }
  function paint(el) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const my = r.top + r.height / 2, L = toCanvas(r.left, my), C = toCanvas(r.left + r.width / 2, my), R = toCanvas(r.right, my);
    el._fp = [L[0], L[1], C[0], C[1], R[0], R[1]]; painted.add(el); colour(el);
    if (!el.hasAttribute('data-f')) el.setAttribute('data-f', '');
  }
  function winColour(w) { const P = w._fp; if (!P) return; const v = at(P[0], P[1]); if (w._fa !== v) { w._fa = v; w.style.setProperty('--facc', v); w.dataset.accLive = v; } }
  function sweep(scope) {
    if (!on()) return 0; let n = 0;
    (scope ? [scope] : [doc]).forEach(s => s.querySelectorAll(SEL).forEach(el => { paint(el); n++; }));
    (scope && scope.classList && scope.classList.contains('wm-win') ? [scope] : Array.from(doc.querySelectorAll('.wm-win'))).forEach(w => {
      const r = w.getBoundingClientRect(); if (!r.width) return; w._fp = toCanvas(r.left + r.width / 2, r.top + r.height / 2); wins.add(w); winColour(w); });
    return n;
  }
  function flow() {
    painted.forEach(el => { if (!el.isConnected) painted.delete(el); else colour(el); });
    wins.forEach(w => { if (!w.isConnected) wins.delete(w); else winColour(w); });
  }
  function clear() {
    doc.querySelectorAll('[data-f]').forEach(el => { ['--fl', '--fc', '--fr'].forEach(k => el.style.removeProperty(k)); el.removeAttribute('data-f'); el._fv = null; el._fp = null; }); painted.clear(); wins.clear();
    doc.querySelectorAll('.wm-win').forEach(w => { w.style.removeProperty('--facc'); w._fa = null; });
  }
  // when to look again: a tool moved or resized, the view moved, or something new appeared — checked each frame (a few numbers), the
  // whole sweep only when they changed, and a slow sweep for content a tool re-rendered in place
  let sig = '', lastFull = 0, lastFlow = 0, raf = 0;
  function tick(t) {
    raf = 0; if (!on()) return;
    const WM = global.CanvasWM, v = WM && WM.view ? WM.view : { x: 0, y: 0, z: 1 };
    let s = v.x.toFixed(0) + ',' + v.y.toFixed(0) + ',' + (v.z || 1).toFixed(3);
    doc.querySelectorAll('.wm-win').forEach(w => { s += '|' + w.style.left + w.style.top + w.offsetWidth + 'x' + w.offsetHeight; });
    if (!still()) phase = ((t / 1000) / DRIFT) % 2;
    if (s !== sig || t - lastFull > 700) { sig = s; lastFull = t; lastFlow = t; sweep(); }
    else if (t - lastFlow > 100 && !still()) { lastFlow = t; flow(); }   // ~10 times a second: slow enough to look smooth, cheap
    raf = global.requestAnimationFrame(tick);
  }
  function start() { if (on() && !raf) raf = global.requestAnimationFrame(tick); if (!on()) { if (raf) { global.cancelAnimationFrame(raf); raf = 0; } clear(); } }
  global.addEventListener('eravos:theme', start);
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
  global.ColourField = { at, sweep, flow, on, STOPS, RECT, ANGLE, DRIFT, start, get phase() { return phase; }, set phase(p) { phase = +p || 0; } };
})(typeof window !== 'undefined' ? window : globalThis);
