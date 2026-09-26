/**
 * clear-glass/renderer/selector-check.js — v0.39.251
 * comp_id: nexus.clear-glass.renderer.selector-check
 * UUID: cg-selector-check-v1-0000-2026-0925-jamesbrooks-001
 *
 * Page-side half of "the element picker assigns selectors" (handoff 2026-09-25,
 * step 1). Injected into the provider's page (same fetch-once + executeJavaScript
 * convention as guardian-picker.js and mesh-picker.js). Given the node the user
 * picked (by the picker's own xpath) and what they say it is (resp | input |
 * send), it generates a stable selector for it and CHECKS it on this same page,
 * the way the consumer will use it:
 *
 *   resp  — guardian/userscript-*.js findResponseEl() takes the LAST
 *           querySelectorAll match and reads its innerText. So the last match
 *           must be the picked reply (or the reply container around the picked
 *           spot), matches must not nest, and it must hold text.
 *   input — exactly one match, and it is the editable box that was picked.
 *   send  — exactly one match, and it is the button that was picked.
 *
 * Selector preference: data-* attributes, then a hand-written id, then role /
 * aria-label / name / placeholder, then classes; values that look generated
 * (uuids, long digit runs, React ids) are never used — a selector that names
 * this one message would pass today and break on the next reply.
 *
 * Nothing here guesses: if no candidate passes, it says which ones were tried
 * and why each failed. The result is the evidence guardian's selector map
 * requires (guardian/lib/selector-map.js: source 'picker' needs
 * { url, matched >= 1 }).
 *
 * Also loadable in Node (module.exports = create) so the same code is tested
 * against a real Chromium page by tests/modules/test-cg-selector-assign.test.js.
 */
(function (root) {
  'use strict';
  const VERSION = '1.0.0';
  const KEYS = ['resp', 'input', 'send'];
  const MAX_UP = 8;         // resp: how far above the picked node a reply container may sit
  const MAX_TRIED = 24;     // evidence: how many failed candidates are reported back

  function create(win) {
    const doc = win.document;

    function looksGenerated(v) {
      if (v == null) return true;
      const s = String(v);
      return !s || s.length > 60
        || /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)          // uuid
        || /\d{4,}/.test(s)                                // long digit run
        || /^:[a-z0-9]+:$/i.test(s)                        // React useId (:r1:)
        || /^[0-9]/.test(s)
        || /[-_]\d+$/.test(s)                              // per-instance counter (conversation-turn-6)
        || /[a-z]+[-_][a-z0-9]*\d[a-z0-9]{4,}$/i.test(s);  // css-1x2y3z, sc-abc12de
    }
    function esc(s) { return (win.CSS && win.CSS.escape) ? win.CSS.escape(String(s)) : String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1'); }
    function attr(name, value) { return value === '' ? `[${name}]` : `[${name}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`; }
    function textOf(el) { return ((el && (el.innerText || el.textContent)) || '').trim(); }

    function stableClasses(el) {
      let list = [];
      try { list = Array.from(el.classList || []); } catch (_) {}
      return list.filter(c => /^[a-zA-Z][\w-]{1,30}$/.test(c) && !looksGenerated(c) && !c.startsWith('__g-') && !c.startsWith('cg-')).slice(0, 3);
    }

    /**
     * Candidate selectors for ONE element, most stable first. For resp no #id:
     * an id names one node, and the next reply is a new node — a reply
     * selector has to describe every reply, not the one that was picked.
     */
    function candidatesFor(el, key) {
      const tag = el.tagName.toLowerCase();
      const out = [];
      const push = s => { if (s && !out.includes(s)) out.push(s); };
      const attrs = Array.from(el.attributes || []);
      const testid = el.getAttribute('data-testid');
      if (testid && !looksGenerated(testid)) { push(attr('data-testid', testid)); push(tag + attr('data-testid', testid)); }
      for (const a of attrs) {
        if (!a.name.startsWith('data-') || a.name === 'data-testid' || a.name.startsWith('data-cg')) continue;
        if (looksGenerated(a.value) && a.value !== '') continue;
        push(attr(a.name, a.value)); push(tag + attr(a.name, a.value));
      }
      if (key !== 'resp' && el.id && !looksGenerated(el.id)) push('#' + esc(el.id));
      for (const n of ['role', 'aria-label', 'name', 'placeholder', 'contenteditable']) {
        const v = el.getAttribute(n);
        if (v == null || (v && looksGenerated(v))) continue;
        push(tag + attr(n, v));
      }
      const type = el.getAttribute('type');
      const cls = stableClasses(el);
      if (cls.length) {
        push(tag + '.' + cls.map(esc).join('.'));
        push('.' + cls.map(esc).join('.'));
        if (type && !looksGenerated(type)) push(tag + attr('type', type) + '.' + cls.map(esc).join('.'));
      }
      return out;
    }

    function isEditable(el) {
      if (!el || !el.tagName) return false;
      const t = el.tagName.toLowerCase();
      if (t === 'textarea') return true;
      if (t === 'input') return !/^(button|submit|reset|checkbox|radio|hidden|file|image)$/i.test(el.type || '');
      const ce = el.getAttribute('contenteditable');
      return ce === '' || ce === 'true' || ce === 'plaintext-only';
    }
    function isButton(el) {
      if (!el || !el.tagName) return false;
      const t = el.tagName.toLowerCase();
      return t === 'button' || el.getAttribute('role') === 'button' || (t === 'input' && /^(submit|button)$/i.test(el.type || ''));
    }

    /** The node the consumer should read for this key, starting from what was picked. */
    function targetFor(picked, key) {
      if (key === 'input') {
        const e = picked.closest('textarea, input, [contenteditable]');
        return e && isEditable(e) ? e : null;
      }
      if (key === 'send') return picked.closest('button, [role="button"], input[type="submit"], input[type="button"]');
      return picked;
    }

    /** Check one selector against the live page as the consumer would use it. */
    function evaluate(sel, el, key) {
      let all;
      try { all = doc.querySelectorAll(sel); } catch (e) { return { ok: false, why: 'invalid selector' }; }
      const n = all.length;
      if (!n) return { ok: false, why: 'matches nothing' };
      const arr = Array.from(all);
      if (!arr.includes(el)) return { ok: false, why: 'does not match the picked node', matched: n };
      if (key === 'resp') {
        const last = arr[n - 1];
        // Nesting first: a selector matching the pick AND something inside it is
        // just too loose — it says nothing about whether a later reply exists.
        for (const a of arr) for (const b of arr) if (a !== b && a.contains(b)) return { ok: false, why: 'its matches nest inside each other', matched: n };
        if (last !== el) {
          const later = !!(el.compareDocumentPosition(last) & 4 /* FOLLOWING */);
          return { ok: false, why: later ? 'its last match is not the picked reply — pick the latest answer' : 'its last match is not the picked node', matched: n };
        }
        const text = textOf(last);
        if (!text) return { ok: false, why: 'its last match holds no text', matched: n };
        return { ok: true, matched: n, last, text };
      }
      if (n !== 1) return { ok: false, why: `${n} matches — must be exactly one`, matched: n };
      if (key === 'input' && !isEditable(el)) return { ok: false, why: 'not an editable box', matched: n };
      if (key === 'send' && !isButton(el)) return { ok: false, why: 'not a button', matched: n };
      return { ok: true, matched: n, last: el, text: textOf(el) };
    }

    /**
     * Resolve the picker's xpath. guardian-picker.js getXPath() writes either
     * //*[@id="…"] or a positional /html/body/div[2]/…/svg/path. XPath in an
     * HTML document does not match SVG-namespaced elements by bare name, so a
     * pick on a button's icon (the usual way a send button gets clicked) would
     * never resolve through document.evaluate. The positional form is walked
     * here by localName instead — the same counting getXPath used to write it.
     */
    function resolveXPath(xpath) {
      if (!xpath || typeof xpath !== 'string') return null;
      const positional = /^(\/[a-zA-Z][\w-]*(\[\d+\])?)+$/.test(xpath);
      if (positional) {
        let node = doc;
        for (const step of xpath.split('/').slice(1)) {
          const m = step.match(/^([a-zA-Z][\w-]*)(?:\[(\d+)\])?$/);
          const name = m[1].toLowerCase(), idx = m[2] ? parseInt(m[2], 10) : 1;
          const same = Array.from(node.children || []).filter(c => c.localName.toLowerCase() === name);
          node = same[idx - 1];
          if (!node) return null;
        }
        return node.nodeType === 1 ? node : null;
      }
      try {
        const r = doc.evaluate(xpath, doc, null, 9 /* FIRST_ORDERED_NODE_TYPE */, null);
        const node = r && r.singleNodeValue;
        return node && node.nodeType === 1 ? node : (node && node.parentElement) || null;
      } catch (_) { return null; }
    }

    /**
     * check({ xpath, key }) → { ok, key, selector, matched, text, textLength, depth, tag, url, tried[] }
     *                       | { ok:false, key, why, tried[], url }
     */
    function check({ xpath, key } = {}) {
      const url = win.location.href;
      if (!KEYS.includes(key)) return { ok: false, key, why: `key must be one of ${KEYS.join(', ')}`, tried: [], url };
      const picked = resolveXPath(xpath);
      if (!picked) return { ok: false, key, why: 'the picked node is no longer on the page — pick it again', tried: [], url };
      const target = targetFor(picked, key);
      if (!target) return { ok: false, key, why: key === 'input' ? 'the pick is not inside an editable box' : 'the pick is not inside a button', tried: [], url };

      const tried = [];
      const note = (selector, r) => { if (tried.length < MAX_TRIED) tried.push({ selector, why: r.why, matched: r.matched || 0 }); };
      const found = (selector, r, depth, node) => ({
        ok: true, key, selector, matched: r.matched,
        text: r.text.slice(0, 200), textLength: r.text.length,
        depth, tag: node.tagName.toLowerCase(), url, tried,
      });

      // resp: a selector that describes every reply matches every reply, so a
      // passing candidate with >= 2 matches (last = the pick) beats a unique
      // one — a unique match is usually something naming THIS node only (a
      // one-off data-* value, an anchor). Single matches are only offered when
      // nothing on the page matches more (see the end of this function).
      const singles = []; let laterReply = null;
      const consider = (sel, node, depth) => {
        const r = evaluate(sel, node, key);
        if (!r.ok) {
          // Repeated structure around the pick that ends at a LATER node: the
          // pick is not the latest reply, whatever unique selector also fits it.
          if (key === 'resp' && r.matched >= 2 && /last match is not/.test(r.why) && !laterReply) laterReply = sel;
          note(sel, r); return null;
        }
        if (key !== 'resp' || r.matched >= 2) return found(sel, r, depth, node);
        singles.push(found(sel, r, depth, node));
        note(sel, { why: 'passes, but matches only this one reply', matched: 1 });
        return null;
      };

      // Pass 1 — the node itself (resp: and each container above it, nearest first).
      const levels = [];
      for (let n = target, d = 0; n && n.nodeType === 1 && n !== doc.body && n !== doc.documentElement && d <= (key === 'resp' ? MAX_UP : 0); n = n.parentElement, d++) levels.push([n, d]);
      for (const [node, depth] of levels) {
        for (const sel of candidatesFor(node, key)) { const hit = consider(sel, node, depth); if (hit) return hit; }
      }
      // Pass 2 — anchored under a stable ancestor: "<ancestor> <tag.classes>".
      for (const [node, depth] of levels) {
        const tail = node.tagName.toLowerCase() + stableClasses(node).map(c => '.' + esc(c)).join('');
        for (let a = node.parentElement, up = 0; a && a !== doc.body && up < 5; a = a.parentElement, up++) {
          for (const anchor of candidatesFor(a, 'anchor').slice(0, 4)) { const hit = consider(`${anchor} ${tail}`, node, depth); if (hit) return hit; }
        }
      }
      if (laterReply) return { ok: false, key, why: `the picked reply is not the latest one — "${laterReply}" continues past it; pick the latest answer`, tried, url };
      // One reply on the page: nothing can match twice, so no check can tell a
      // selector naming THIS node from one naming every reply. Not guessed —
      // every passing candidate goes back, nearest first, and the person
      // assigning it chooses (the UI says why).
      if (singles.length) {
        const alternatives = singles.slice(0, 8).map(a => ({ selector: a.selector, depth: a.depth, tag: a.tag, textLength: a.textLength, text: a.text.slice(0, 80) }));
        return { ...singles[0], single: true, alternatives, tried };
      }
      return { ok: false, key, why: 'no stable selector passed the live check', tried, url };
    }

    /** Outline what a selector reads (last match for resp, the one match otherwise) for a few seconds. */
    function mark(selector, key, ms = 2500) {
      let el = null;
      try { const all = doc.querySelectorAll(selector); el = all.length ? all[all.length - 1] : null; } catch (_) {}
      if (!el) return false;
      const prev = el.style.outline, prevOff = el.style.outlineOffset;
      el.style.outline = '2px solid ' + (key === 'resp' ? '#00f5ff' : '#ffb86c');
      el.style.outlineOffset = '2px';
      win.setTimeout(() => { el.style.outline = prev; el.style.outlineOffset = prevOff; }, ms);
      return true;
    }

    return { VERSION, KEYS, check, mark, candidatesFor, looksGenerated };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else root.__cgSelectorCheck = create(root);
})(typeof window !== 'undefined' ? window : this);
