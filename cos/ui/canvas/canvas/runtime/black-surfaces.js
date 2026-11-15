/* ERAVOS runtime — black-surfaces.js → window.BlackSurfaces (3.103). Domain-free.
 * His words, 2026-11-05: "i dont like the tint. everything but the colors should be what they are. make them darker even. like black".
 * A SURFACE is a dark colour with little colour in it (a panel, a card, a well, a cell, a display's background): every one becomes a
 * neutral grey a little darker than it was — no tool colour, no blue cast. A COLOUR (anything bright, or dark but clearly coloured — a
 * dim red pad, a deep accent) is left exactly as it is. Applied wherever a surface can come from, so new tools get it too:
 *   · every stylesheet rule's backgrounds (and dark custom properties), as each stylesheet arrives (tools load theirs later)
 *   · colours a tool writes inline (ui-kit's inline-colour hook calls BlackSurfaces.surface for background properties)
 *   · what a tool draws on its displays (2D canvas fills, strokes and gradient stops inside a window or a tool page)
 *   BlackSurfaces.neutral(colour) → the colour, or its neutral darker grey when it is a surface · isSurface(colour) · sweep() */
(function (global) {
  'use strict';
  const doc = global.document;
  const MAX = 80, CHROMA = 36, DARKEN = 0.72;   // a surface: brightest of r/g/b ≤ 80, all three within 36 of each other (the old blue-grey #223044 is one; a dim red pad #3a1020 is a colour)
  const LIT = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g;
  function parse(c) {
    c = String(c).trim(); let m = /^#([0-9a-f]{3})$/i.exec(c); if (m) c = '#' + m[1].split('').map(x => x + x).join('');
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c); if (m) return { rgb: [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)), a: m[2] ? parseInt(m[2], 16) / 255 : null, hex: true };
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(c);
    if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? null : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4]), hex: false };
    return null;
  }
  const isSurfaceRGB = (rgb) => { const mx = Math.max(...rgb), mn = Math.min(...rgb); return mx <= MAX && mx - mn <= CHROMA && mx - mn >= 0; };
  function neutral(c) {
    if (typeof c !== 'string') return c; const p = parse(c); if (!p || !isSurfaceRGB(p.rgb)) return c;
    // already neutral → left as it is: neutral(neutral(x)) === neutral(x). Without this every pass (a sheet written again, a colour lit
    // and put back) darkened it once more — the compounding he saw (3.106, tests/p106-reactive-drift.test.js)
    if (Math.max(...p.rgb) - Math.min(...p.rgb) <= 1) return c;
    const [r, g, b] = p.rgb, y = Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * DARKEN);
    if (p.hex && p.a === null) { const h = ('0' + y.toString(16)).slice(-2); return '#' + h + h + h; }
    return p.a === null ? `rgb(${y}, ${y}, ${y})` : `rgba(${y}, ${y}, ${y}, ${+p.a.toFixed(3)})`;
  }
  const isSurface = (c) => { const p = parse(c); return !!p && isSurfaceRGB(p.rgb); };
  const inText = (v) => typeof v === 'string' ? v.replace(LIT, neutral) : v;
  // a background property (camelCase or kebab-case)
  const BG = /^background|^border|^outline|^box-?shadow|^--/i;   // surfaces, and the lines around them (guide S3)
  const surface = (prop, v) => BG.test(prop) ? inText(v) : v;

  // ---- stylesheets: every rule's backgrounds and dark custom properties
  const done = new WeakSet();
  function rules(list, fn) { for (const r of Array.from(list || [])) { if (r.style) fn(r.style); if (r.cssRules) rules(r.cssRules, fn); } }
  function sheet(s) {
    if (!s || done.has(s)) return; let list; try { list = s.cssRules; } catch (e) { return; }   // another origin's sheet: not ours
    done.add(s);
    rules(list, (st) => {
      // a shorthand that mixes a variable and a literal (background: linear-gradient(var(--x), #18130e)) hides the literal from its
      // longhands (they read '' until the variable is filled in): read and write the shorthand itself
      ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'outline'].forEach(n => { const sh = st.getPropertyValue(n); if (sh && /var\(/.test(sh) && /#|rgb/.test(sh)) { const s2 = inText(sh); if (s2 !== sh) st.setProperty(n, s2, st.getPropertyPriority(n)); } });
      for (let i = 0; i < st.length; i++) {
        const p = st[i]; if (!/^background|^border|^outline|^box-shadow|^--/.test(p)) continue;
        if (/^--rcs?-/.test(p)) continue;   // the reactive colours' own copies of a rule's colours: theirs to keep exact (they may be text)   // a shadow's dark edge is a surface too; its glow is a colour (left)
        const v = st.getPropertyValue(p); if (!v || !/#|rgb/.test(v)) continue;
        const v2 = p.startsWith('--') ? (isSurface(v.trim()) ? neutral(v.trim()) : v) : inText(v);
        if (v2 !== v) st.setProperty(p, v2, st.getPropertyPriority(p));
      }
    });
  }
  function sweep() { if (doc) Array.from(doc.styleSheets).forEach(sheet); }
  if (doc) {
    sweep();
    const later = () => sweep();
    doc.addEventListener('DOMContentLoaded', later); global.addEventListener && global.addEventListener('load', later);
    // a stylesheet a tool loads later (a <link> or <style> added to the page): swept when it has loaded
    if (global.MutationObserver) new global.MutationObserver((recs) => recs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return; if (n.tagName === 'STYLE') setTimeout(later, 0); else if (n.tagName === 'LINK' && /stylesheet/i.test(n.rel)) n.addEventListener('load', later, { once: true });
    }))).observe(doc.documentElement, { childList: true, subtree: true });
  }
  // ---- displays: what a tool draws on a 2D canvas inside a window or a tool page
  (function patchCanvas() {
    const P = global.CanvasRenderingContext2D && global.CanvasRenderingContext2D.prototype; if (!P || P._eravosBS) return; P._eravosBS = true;
    // with Light over the tools on (his opt-in: the colour washes over everything), drawn surfaces are left to the reactive colours
    const inside = (cv) => cv && cv.closest && doc.documentElement.dataset.reactLight !== 'over' && cv.closest('.wm-win, .wm-panel, .tp-overlay');
    ['fillStyle', 'strokeStyle'].forEach(name => { const d = Object.getOwnPropertyDescriptor(P, name); if (!d || !d.set) return;
      Object.defineProperty(P, name, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { d.set.call(this, typeof v === 'string' && inside(this.canvas) ? neutral(v) : v); } }); });
    const GP = global.CanvasGradient && global.CanvasGradient.prototype, stop = GP && GP.addColorStop;
    if (stop) GP.addColorStop = function (off, c) { return stop.call(this, off, typeof c === 'string' && this._bsIn ? neutral(c) : c); };
    ['createLinearGradient', 'createRadialGradient', 'createConicGradient'].forEach(m => { const f = P[m]; if (f) P[m] = function () { const g = f.apply(this, arguments); if (g && inside(this.canvas)) g._bsIn = true; return g; }; });
  })();
  global.BlackSurfaces = { neutral, isSurface, surface, sweep, MAX, CHROMA, DARKEN };
})(typeof window !== 'undefined' ? window : globalThis);
