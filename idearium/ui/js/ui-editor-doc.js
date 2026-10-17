// ════════════════════════════════════════════════════════════════════════════
// idearium/ui/js/ui-editor-doc.js — the UI editor's round trip: a page's file → the editor → the same file (UE1, 0.60.122)
// Map: docs/2026-10-10-design-surface-phasemap.spec (addendum 2026-10-17, UE1)
//
// James, 2026-10-17: "the ui editor is for editing uis, whether its electron, html, etc. ... we need a full editor ... like
// full enterprise grade" · "always make effective use of what you already have."
//
// Pure functions, no DOM, so the browser page and the Node test use the same code:
//   split(html)                      → { head, bodyAttrs, body, before, after, links: [href], styles: [css], scripted }
//       before/after: everything outside <body>…</body>, kept byte for byte on save; links: the page's local stylesheets
//       (http(s)/protocol-relative ones are not the repo's and are left alone); styles: its inline <style> blocks;
//       scripted: the page builds markup from script (a <script> that writes innerHTML / createElement / a template) —
//       saving the editor's body over such a page would erase what the script makes, so UE2 refuses it (said, not hidden).
//   merge(html, { body, css, target }) → the file to write: the original with only its body replaced, and when target is
//       'inline' the editor's CSS in one marked <style data-nexus-ui-editor> in the head (replacing an earlier one).
//   resolve(fromPath, href)          → a stylesheet's repo path, relative to the page (null when it leaves the repo)
// ════════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';
  const MARK = 'data-nexus-ui-editor';

  function split(html) {
    const s = String(html || '');
    const bo = s.search(/<body\b[^>]*>/i);
    const bc = s.search(/<\/body\s*>/i);
    let before = '', after = '', body = s, bodyAttrs = '';
    if (bo >= 0) {
      const open = s.slice(bo).match(/^<body\b([^>]*)>/i);
      bodyAttrs = open ? open[1] : '';
      const start = bo + (open ? open[0].length : 0);
      const end = bc > start ? bc : s.length;
      before = s.slice(0, start); body = s.slice(start, end); after = s.slice(end);
    }
    const headM = s.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i);
    const head = headM ? headM[1] : '';
    const links = [];
    for (const m of s.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      if (!/rel\s*=\s*["']?stylesheet/i.test(tag)) continue;
      const h = (tag.match(/href\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (h && !/^([a-z]+:)?\/\//i.test(h) && !/^data:/i.test(h)) links.push(h);
    }
    const styles = [];
    for (const m of s.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)) styles.push({ css: m[2], ours: new RegExp(MARK, 'i').test(m[1]) });
    const scripts = [...s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
    const scripted = scripts.some(t => /\.innerHTML\s*[+]?=|insertAdjacentHTML|document\.createElement\s*\(|\.appendChild\s*\(|`[^`]*<[a-z][^`]*`/i.test(t))
      || /<script\b[^>]*\bsrc=/i.test(body);
    return { head, bodyAttrs, body, before, after, links, styles, scripted };
  }

  function merge(html, { body = '', css = null, target = 'inline' } = {}) {
    const d = split(html);
    let before = d.before, after = d.after;
    if (!before) { before = '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n</head>\n<body>\n'; after = '\n</body>\n</html>\n'; }
    if (css != null && target === 'inline') {
      const block = `<style ${MARK}>\n${css}\n</style>`;
      const re = new RegExp(`<style\\b[^>]*${MARK}[^>]*>[\\s\\S]*?<\\/style\\s*>`, 'i');
      if (re.test(before)) before = before.replace(re, block);
      else if (/<\/head\s*>/i.test(before)) before = before.replace(/<\/head\s*>/i, `${block}\n</head>`);
      else before = before.replace(/<body\b/i, `${block}\n<body`);
    }
    return `${before}${body}${after}`;
  }

  function resolve(fromPath, href) {
    const h = String(href || '').split(/[?#]/)[0];
    if (!h || /^([a-z]+:)?\/\//i.test(h)) return null;
    const baseParts = String(fromPath || '').split('/').slice(0, -1);
    const parts = h.startsWith('/') ? [] : baseParts;
    for (const seg of h.replace(/^\/+/, '').split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(seg);
    }
    return parts.join('/');
  }

  const api = { split, merge, resolve, MARK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.UIEditorDoc = api;
})(typeof window !== 'undefined' ? window : globalThis);
