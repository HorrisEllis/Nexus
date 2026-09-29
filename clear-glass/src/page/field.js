'use strict';
/**
 * clear-glass/src/page/field.js — the interaction field: the page as numbered targets on x/y/z coordinates.
 * comp_id: clear-glass.page.field
 * Version: 1.0.0
 *
 * §0.39.279 — James: "i also want to be able to have copilot interact on clearglass using a virtual input through
 * erosmanceros, nexus nerve, spotlight injected css into web pages, and a interaction field for xyz coords to help the
 * agents see and navigate the ui in clearglass. I really need to get a job, and i want to be able to automate as much
 * as possible."
 *
 * readPage (page/reader.js) says WHAT is on a page; nothing said WHERE. A model that cannot see pixels could only act
 * through selectors, and a selector a small model writes is often wrong, or names an element hidden behind a cookie
 * banner or a modal. The field is the missing view:
 *
 *   field(opts)      every interactive element in the viewport, numbered 1…n, with its box (x, y, w, h), its centre
 *                    (cx, cy) and z — how many layers cover its centre (0 = on top, clickable; 2 = under a modal and
 *                    a banner; -1 = off-screen) — plus its name, role, a selector, and its CSS z-index.
 *                    With overlay:true the same numbers are DRAWN on the page (injected CSS, in a pointer-events:none
 *                    layer that is never part of the page's own layout): a badge per target, an outline, and a
 *                    coordinate grid every `grid` px, so James sees exactly what the agent sees.
 *   at({ x, y })     the stack under one point, top first: z 0 is what a click there would hit.
 *   spotlight(opts)  a ring (and a dimmed page around it) on a target (n, selector, or x/y/w/h), with a label —
 *                    the agent showing James what it is about to do. Removed after ttl ms, or by spotlight({off:true}).
 *   describe(map)    Node side: the field as short text lines a 3B model reads better than JSON:
 *                    "#3 button "Apply now" (412,580) 120×32 z0".
 *
 * The in-page functions are real functions serialised with toString(), so the code that runs in the page is the code
 * the tests run (same rule as page/reader.js). Acting on a target is the driver's job (driver 'pointer': native
 * sendInputEvent or ErosmancerOS's human-paced CDP input) — this file only sees and shows.
 */

const MODULE_ID = 'clear-glass.page.field';
const VERSION = '1.0.0';
const DEFAULTS = Object.freeze({ max: 150, grid: 100, overlay: false, offscreen: false });

/* eslint-disable no-undef */
function _fieldInPage(opts) {
  const OVERLAY_ID = '__cg_field__', STYLE_ID = '__cg_field_css__';
  const doc = document;
  const old = doc.getElementById(OVERLAY_ID); if (old) old.remove();
  const vw = window.innerWidth, vh = window.innerHeight;
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,label[for],[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=textbox],[role=combobox],[onclick],[contenteditable=""],[contenteditable=true],[tabindex]:not([tabindex="-1"])';
  const cssEscape = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  const selectorOf = (el) => {
    if (el.id && doc.querySelectorAll('#' + cssEscape(el.id)).length === 1) return '#' + cssEscape(el.id);
    const nm = el.getAttribute('name');
    if (nm) { const s = el.tagName.toLowerCase() + '[name="' + nm.replace(/"/g, '\\"') + '"]'; if (doc.querySelectorAll(s).length === 1) return s; }
    const al = el.getAttribute('aria-label');
    if (al) { const s = el.tagName.toLowerCase() + '[aria-label="' + al.replace(/"/g, '\\"') + '"]'; if (doc.querySelectorAll(s).length === 1) return s; }
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== doc.documentElement; e = e.parentElement) {
      let i = 1; for (let p = e.previousElementSibling; p; p = p.previousElementSibling) if (p.tagName === e.tagName) i++;
      parts.unshift(e.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      if (e.id && doc.querySelectorAll('#' + cssEscape(e.id)).length === 1) { parts[0] = '#' + cssEscape(e.id); break; }
    }
    return parts.join(' > ');
  };
  const nameOf = (el) => {
    const lab = el.id ? doc.querySelector('label[for="' + cssEscape(el.id) + '"]') : null;
    const t = el.getAttribute('aria-label') || (lab && lab.textContent) || el.getAttribute('placeholder') || el.getAttribute('title')
      || (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type) ? el.value : '') || el.innerText || el.textContent || el.getAttribute('alt') || el.getAttribute('name') || '';
    return String(t).replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  const zIndexOf = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const z = getComputedStyle(e).zIndex; if (z && z !== 'auto') return parseInt(z, 10) || 0; } return 0; };
  const depthAt = (el, x, y) => {
    if (x < 0 || y < 0 || x >= vw || y >= vh) return -1;
    const stack = doc.elementsFromPoint ? doc.elementsFromPoint(x, y) : [];
    for (let i = 0; i < stack.length; i++) if (stack[i] === el || el.contains(stack[i]) || stack[i].contains(el)) return i === 0 || el.contains(stack[0]) ? 0 : i;
    return stack.length ? stack.length : 0;
  };
  const out = [];
  const seen = new Set();
  for (const el of doc.querySelectorAll(SEL)) {
    if (out.length >= opts.max) break;
    if (seen.has(el) || (el.closest && el.closest('#' + OVERLAY_ID))) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const onscreen = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    if (!onscreen && !opts.offscreen) continue;
    // a label counts only when its control is not a target itself (a styled checkbox whose input is hidden): the
    // control is listed, named by the label
    if (el.tagName === 'LABEL' && el.control) { const cr = el.control.getBoundingClientRect(); if (cr.width >= 2 && cr.height >= 2 && getComputedStyle(el.control).visibility !== 'hidden') continue; }
    seen.add(el);
    const cx = Math.round(Math.min(Math.max(r.left + r.width / 2, 0), vw - 1)), cy = Math.round(Math.min(Math.max(r.top + r.height / 2, 0), vh - 1));
    const z = onscreen ? depthAt(el, cx, cy) : -1;
    out.push({ n: out.length + 1, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || null, role: el.getAttribute('role') || null,
      name: nameOf(el), selector: selectorOf(el), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      cx, cy, z, zIndex: zIndexOf(el), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      value: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? String(el.value || '').slice(0, 60) : undefined });
  }
  if (opts.overlay) {
    if (!doc.getElementById(STYLE_ID)) {
      const s = doc.createElement('style'); s.id = STYLE_ID;
      s.textContent = '#' + OVERLAY_ID + '{position:fixed;inset:0;pointer-events:none;z-index:2147483646;font:11px/1 ui-monospace,monospace}'
        + '#' + OVERLAY_ID + ' .g{position:absolute;background:rgba(56,189,248,.18)}'
        + '#' + OVERLAY_ID + ' .gl{position:absolute;color:rgba(56,189,248,.9);background:rgba(2,6,23,.6);padding:1px 2px}'
        + '#' + OVERLAY_ID + ' .t{position:absolute;outline:1.5px solid rgba(250,204,21,.9);border-radius:3px}'
        + '#' + OVERLAY_ID + ' .t.c{outline-color:rgba(248,113,113,.9);outline-style:dashed}'
        + '#' + OVERLAY_ID + ' .b{position:absolute;transform:translate(-40%,-60%);background:#facc15;color:#111;font-weight:700;padding:1px 3px;border-radius:3px}'
        + '#' + OVERLAY_ID + ' .t.c+.b{background:#f87171}';
      (doc.head || doc.documentElement).appendChild(s);
    }
    const ov = doc.createElement('div'); ov.id = OVERLAY_ID;
    const g = Math.max(20, opts.grid | 0);
    for (let x = g; x < vw; x += g) { const l = doc.createElement('div'); l.className = 'g'; l.style.cssText = 'left:' + x + 'px;top:0;width:1px;height:100%'; ov.appendChild(l);
      const lb = doc.createElement('div'); lb.className = 'gl'; lb.style.cssText = 'left:' + (x + 2) + 'px;top:2px'; lb.textContent = x; ov.appendChild(lb); }
    for (let y = g; y < vh; y += g) { const l = doc.createElement('div'); l.className = 'g'; l.style.cssText = 'top:' + y + 'px;left:0;height:1px;width:100%'; ov.appendChild(l);
      const lb = doc.createElement('div'); lb.className = 'gl'; lb.style.cssText = 'top:' + (y + 2) + 'px;left:2px'; lb.textContent = y; ov.appendChild(lb); }
    for (const t of out) {
      if (t.z < 0) continue;
      const box = doc.createElement('div'); box.className = 't' + (t.z > 0 ? ' c' : ''); box.style.cssText = 'left:' + t.x + 'px;top:' + t.y + 'px;width:' + t.w + 'px;height:' + t.h + 'px'; ov.appendChild(box);
      const b = doc.createElement('div'); b.className = 'b'; b.style.cssText = 'left:' + t.x + 'px;top:' + t.y + 'px'; b.textContent = t.n; ov.appendChild(b);
    }
    (doc.body || doc.documentElement).appendChild(ov);
  }
  return { url: location.href, title: doc.title, viewport: { w: vw, h: vh, scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY), dpr: window.devicePixelRatio || 1 },
    overlay: !!opts.overlay, grid: opts.overlay ? opts.grid : null, targets: out };
}

function _fieldOffInPage() {
  let n = 0;
  for (const id of ['__cg_field__', '__cg_field_css__', '__cg_spot__']) { const e = document.getElementById(id); if (e) { e.remove(); n++; } }
  return { removed: n };
}

function _atInPage(opts) {
  const x = Number(opts.x), y = Number(opts.y);
  const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [];
  return { x, y, stack: stack.filter(el => !(el.closest && (el.closest('#__cg_field__') || el.closest('#__cg_spot__')))).slice(0, opts.limit || 8).map((el, z) => {
    const r = el.getBoundingClientRect();
    return { z, tag: el.tagName.toLowerCase(), id: el.id || null, cls: typeof el.className === 'string' ? el.className.slice(0, 60) : null,
      name: String(el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), zIndex: getComputedStyle(el).zIndex };
  }) };
}

function _spotlightInPage(opts) {
  const ID = '__cg_spot__';
  const old = document.getElementById(ID); if (old) old.remove();
  if (window.__cgSpotTimer) { clearTimeout(window.__cgSpotTimer); window.__cgSpotTimer = null; }
  if (opts.off) return { ok: true, off: true };
  let r = null;
  if (opts.selector) { const el = document.querySelector(opts.selector); if (!el) return { ok: false, error: 'no element for ' + opts.selector }; el.scrollIntoView({ block: 'center', inline: 'center' }); r = el.getBoundingClientRect(); }
  else if ([opts.x, opts.y].every(v => typeof v === 'number')) r = { left: opts.x, top: opts.y, width: opts.w || 24, height: opts.h || 24 };
  if (!r) return { ok: false, error: 'spotlight needs a selector or x/y' };
  const pad = 6, L = r.left - pad, T = r.top - pad, W = r.width + pad * 2, H = r.height + pad * 2;
  const d = document.createElement('div'); d.id = ID;
  d.style.cssText = 'position:fixed;left:' + L + 'px;top:' + T + 'px;width:' + W + 'px;height:' + H + 'px;pointer-events:none;z-index:2147483647;'
    + 'border:3px solid ' + (opts.color || '#38bdf8') + ';border-radius:8px;box-shadow:0 0 0 9999px rgba(2,6,23,' + (opts.dim === false ? 0 : 0.35) + '),0 0 18px ' + (opts.color || '#38bdf8') + ';transition:all .2s';
  if (opts.label) { const lb = document.createElement('div'); lb.textContent = opts.label;
    lb.style.cssText = 'position:absolute;left:0;top:-26px;background:' + (opts.color || '#38bdf8') + ';color:#020617;font:600 12px/1.6 system-ui,sans-serif;padding:0 8px;border-radius:6px;white-space:nowrap';
    d.appendChild(lb); }
  (document.body || document.documentElement).appendChild(d);
  const ttl = opts.ttl === 0 ? 0 : (opts.ttl || 6000);
  if (ttl) window.__cgSpotTimer = setTimeout(() => { const e = document.getElementById(ID); if (e) e.remove(); }, ttl);
  return { ok: true, rect: { x: Math.round(L), y: Math.round(T), w: Math.round(W), h: Math.round(H) }, ttl };
}
/* eslint-enable no-undef */

const _call = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg)})`;

/** fieldScript(opts) — the in-page script for the field (driver.eval runs it). */
function fieldScript(opts = {}) { return _call(_fieldInPage, { ...DEFAULTS, ...opts }); }
function fieldOffScript() { return `(${_fieldOffInPage.toString()})()`; }
function atScript({ x, y, limit } = {}) { return _call(_atInPage, { x, y, limit }); }
function spotlightScript(opts = {}) { return _call(_spotlightInPage, opts); }

/**
 * describe(map, { limit, all }) -> text — one line per target, clickable ones first. A covered target (z > 0) says
 * so, because clicking its centre hits whatever covers it; an off-screen one (z -1) needs a scroll first.
 */
function describe(map, { limit = 60, all = false } = {}) {
  if (!map || !Array.isArray(map.targets)) return '';
  const v = map.viewport || {};
  const list = map.targets.filter(t => all || t.z >= 0).slice(0, limit);
  const lines = list.map(t => {
    const kind = t.role || (t.tag === 'input' && t.type ? `input[${t.type}]` : t.tag);
    const state = [t.disabled ? 'disabled' : '', t.z > 0 ? `covered×${t.z}` : '', t.z < 0 ? 'off-screen' : '', t.value ? `value="${t.value}"` : ''].filter(Boolean).join(' ');
    return `#${t.n} ${kind} "${t.name || '(no label)'}" (${t.cx},${t.cy}) ${t.w}×${t.h} z${t.z}${state ? ' ' + state : ''}`;
  });
  const more = map.targets.length - list.length;
  return `${map.title || ''} — ${map.url || ''}\nviewport ${v.w}×${v.h} scroll ${v.scrollX},${v.scrollY}` + (lines.length ? '\n' + lines.join('\n') : '\n(no interactive elements in view)')
    + (more > 0 ? `\n…${more} more (field with offscreen:true or a larger limit)` : '');
}

/** target(map, n) -> the numbered target or null. */
function target(map, n) { return (map && Array.isArray(map.targets) && map.targets.find(t => t.n === Number(n))) || null; }

/**
 * pointerPath(from, to, { steps, curve, jitter, rand }) -> [{ x, y }] — a human-paced cursor path (cubic curve with
 * a little noise), ending exactly on `to`. Used by the driver's native pointer; ErosmancerOS has its own.
 */
function pointerPath(from, to, { steps = 14, curve = 0.25, jitter = 1.5, rand = Math.random } = {}) {
  const a = from && Number.isFinite(from.x) ? from : { x: to.x - 120, y: to.y - 60 };
  const dx = to.x - a.x, dy = to.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len, bend = (rand() - 0.5) * 2 * curve * len;
  const c1 = { x: a.x + dx * 0.3 + nx * bend, y: a.y + dy * 0.3 + ny * bend };
  const c2 = { x: a.x + dx * 0.7 + nx * bend * 0.5, y: a.y + dy * 0.7 + ny * bend * 0.5 };
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, mt = 1 - t;
    let x = mt ** 3 * a.x + 3 * mt ** 2 * t * c1.x + 3 * mt * t ** 2 * c2.x + t ** 3 * to.x;
    let y = mt ** 3 * a.y + 3 * mt ** 2 * t * c1.y + 3 * mt * t ** 2 * c2.y + t ** 3 * to.y;
    if (i < steps) { x += (rand() - 0.5) * 2 * jitter; y += (rand() - 0.5) * 2 * jitter; }
    pts.push({ x: Math.round(x), y: Math.round(y) });
  }
  pts[pts.length - 1] = { x: Math.round(to.x), y: Math.round(to.y) };
  return pts;
}

module.exports = { MODULE_ID, VERSION, DEFAULTS, fieldScript, fieldOffScript, atScript, spotlightScript, describe, target, pointerPath,
  _fieldInPage, _atInPage, _spotlightInPage, _fieldOffInPage };
