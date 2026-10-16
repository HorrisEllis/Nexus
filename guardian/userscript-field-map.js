// guardian/userscript-field-map.js — the picked fields, used by every provider userscript.
// comp_id: nexus.guardian.userscript-field-map
// Version: 1.1.0
//
// §0.60.2 — James: "can you also have the picker mapped to the scripts injected for the interaction field or the x y z
// coords for the elements?"
//
// A shared prelude, loaded the same way as userscript-nexus-wake.js and userscript-chat-stream.js (clear-glass/src/
// providers/host.js _loadSharedPrelude injects it before the provider script). It attaches window.NexusFields:
//
//   NexusFields.set(provider, msg)  — the GUARDIAN_SELECTORS map (guardian/lib/selector-map.js): selectors, which are
//                                     verified (picked on a live page), and each key's anchor — where the picked element
//                                     sat: x, y, w, h, its centre as a fraction of the viewport (rx, ry), and z (the
//                                     element's place in the stack at that point, its z-index, its DOM depth).
//   NexusFields.find(key)           — the element for input | send | resp, or null. Only a VERIFIED key is used — a seed
//                                     value never overrides the provider script's own lookup. When the selector matches
//                                     more than one element (the claude send selector matched 27), the one nearest the
//                                     anchor with the same tag wins (resp: the last, the way the reply is read); when it
//                                     matches nothing, the element at the anchor's point is used if it is the same kind
//                                     of element (an editable box for input, a button for send).
//   NexusFields.type(text)          — writes text into the mapped input (contenteditable or textarea/input); true if done.
//   NexusFields.press()             — clicks the mapped send button; { ok, how } or null when no verified send.
//
// §SP2 0.60.50 — each verified key may carry its semantic address (role + accessible name + landmark path, recorded by
// the picker). When the selector matches nothing (a class change), the address is resolved in the page through
// window.NexusSemantic (clear-glass/src/page/semantic-tree.js, injected just before this prelude) before the anchor's
// point is tried. A reply's address names a container ("main › article"); the LAST node of that shape is the reply.
//
// The provider scripts call type() first in injectText and press() first in submit, and fall back to their own lookup
// when it returns nothing — so a pick changes what the next job uses, and no pick changes nothing.
(function (root) {
  'use strict';
  if (root.NexusFields) return;
  const VERSION = '1.1.0';
  let map = null;   // { provider, selectors, verified, anchors, semantics }

  function _all(sel) { try { return sel ? Array.from(document.querySelectorAll(sel)) : []; } catch (_) { return []; } }
  function _visible(el) { try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (_) { return false; } }
  function _rich(el) { return !!el && (el.isContentEditable === true || ['', 'true', 'plaintext-only'].includes(el.getAttribute && el.getAttribute('contenteditable'))); }
  function _editable(el) { return !!el && (_rich(el) || /^(TEXTAREA|INPUT)$/.test(el.tagName)); }
  function _clickable(el) { return !!el && (el.tagName === 'BUTTON' || (el.getAttribute && el.getAttribute('role') === 'button')); }
  function _kindOk(key, el) { return key === 'input' ? _editable(el) : key === 'send' ? _clickable(el) : !!el; }

  /** the anchor's point now: the same fraction of the viewport (a window resized keeps its layout's proportions) */
  function _point(a) {
    if (!a) return null;
    if (typeof a.rx === 'number' && typeof a.ry === 'number') return { x: a.rx * innerWidth, y: a.ry * innerHeight };
    if (typeof a.x === 'number') return { x: a.x + (a.w || 0) / 2, y: a.y + (a.h || 0) / 2 };
    return null;
  }
  function _nearest(els, a) {
    const p = _point(a); if (!p) return els[0] || null;
    let best = null, bd = Infinity;
    for (const el of els) {
      if (!_visible(el)) continue;
      if (a.tag && el.tagName.toLowerCase() !== a.tag) continue;
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - p.x, r.top + r.height / 2 - p.y);
      if (d < bd) { bd = d; best = el; }
    }
    return best || els.find(_visible) || null;
  }
  function _atPoint(key, a) {
    const p = _point(a); if (!p) return null;
    let stack = [];
    try { stack = document.elementsFromPoint(p.x, p.y); } catch (_) { return null; }
    // z: the layer the pick was on, when it is still the same kind of element; else the first that is
    if (a && typeof a.layer === 'number' && stack[a.layer]) {
      const el = stack[a.layer].closest ? (key === 'send' ? stack[a.layer].closest('button,[role="button"]') : stack[a.layer]) : null;
      if (el && _kindOk(key, el)) return el;
    }
    for (const n of stack) {
      const el = key === 'send' && n.closest ? n.closest('button,[role="button"]') : n;
      if (el && _kindOk(key, el)) return el;
    }
    return null;
  }

  function set(provider, msg) {
    if (!msg || !msg.selectors) return;
    map = { provider, selectors: msg.selectors || {}, verified: msg.verified || {}, anchors: msg.anchors || {}, semantics: msg.semantics || {} };
  }
  const _bare = (a) => String(a || '').split(' \u203a ').map(s => s.replace(/\s+#\d+$/, '')).join(' \u203a ');
  /** the element a semantic address names now (null when the page cannot say, or says something else) */
  function _bySemantic(key) {
    const se = map.semantics && map.semantics[key], S = root.NexusSemantic;
    if (!se || !se.address || !S) return null;
    try {
      const tree = S.tree({ maxNodes: 5000, maxName: 80 });
      let sel = null;
      if (key === 'resp') {   // the last node of the reply's shape, whatever its #n
        const want = _bare(se.address); const hits = tree.nodes.filter(n => _bare(n.address) === want && n.selector);
        sel = hits.length ? hits[hits.length - 1].selector : null;
      } else {
        const r = S.resolve({ tree, address: se.address });
        sel = r && r.ok ? r.selector : null;
      }
      const el = sel ? document.querySelector(sel) : null;
      if (el) { lastHow[key] = 'semantic'; return el; }
    } catch (_) {}
    return null;
  }
  const lastHow = {};
  function find(key) {
    if (!map || !map.verified || !map.verified[key]) return null;
    const sel = map.selectors[key], a = map.anchors[key] || null;
    const els = _all(sel);
    lastHow[key] = 'selector';
    if (key === 'resp') return els.length ? els[els.length - 1] : _bySemantic('resp');
    let el = els.length === 1 ? els[0] : els.length > 1 ? _nearest(els, a) : null;
    if (!el) { const s2 = _bySemantic(key); if (s2 && _kindOk(key, s2)) return s2; }
    if (!el) { el = _atPoint(key, a); lastHow[key] = 'anchor'; }
    return el && _kindOk(key, el) ? el : null;
  }
  function type(text) {
    const el = find('input'); if (!el) return false;
    el.focus();
    if (_rich(el)) {   // one notion of "rich editor" with find(): the attribute counts where isContentEditable is not computed
      if (typeof document.execCommand === 'function') { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); }
      if (!(el.textContent || '').includes(String(text).slice(0, 20))) { el.textContent = text; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return true;
    }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  function press() {
    const el = find('send'); if (!el) return null;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return null;   // the script's own lookup says why
    el.click();
    return { ok: true, how: 'mapped-button' };
  }
  function state() { return map ? { provider: map.provider, verified: map.verified, anchors: Object.keys(map.anchors), semantics: Object.keys(map.semantics || {}), lastHow: { ...lastHow } } : null; }

  root.NexusFields = { VERSION, set, find, type, press, state };
})(typeof window !== 'undefined' ? window : globalThis);
