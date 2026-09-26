'use strict';
/**
 * clear-glass/src/automation/dom.js — the in-page half of the automation DOM tools.
 * component_id: cg.automation.dom
 *
 * §0.39.265 — James: "as much as i can automate on a browser … dom tools, full
 * enterprise grade." Each function here RETURNS A SCRIPT (a string) that the
 * driver runs in the page with executeJavaScript — nothing here touches
 * Electron, so it is tested in plain Node against a fake document.
 *
 * Every value that crosses into the page goes through JSON.stringify, never
 * string concatenation, so a selector or a value with quotes cannot break out.
 *
 * Selectors (one string, everywhere):
 *   "button.primary"            CSS (the default) — also searched inside open shadow roots
 *   "text=Sign in"              the smallest visible element whose text contains it (case-insensitive)
 *   "text==Sign in"             … whose text IS exactly it
 *   "label=Email"               the form field that label belongs to (for=, nesting, aria-label, placeholder)
 *   "xpath=//a[@href]"  or "//a[@href]"   XPath
 *   "css=div >> text=Save"      chain: search the second selector inside the first match
 *   "… >> nth=2"                the third match (0-based), "nth=-1" the last
 */

// The finder that every script embeds. Written as ordinary source so it reads
// like code; toString() puts it in the page.
/* eslint-disable no-undef */
function __nxFind(selector, all, root) {
  const doc = root || document;
  const vis = (el) => { const r = el.getBoundingClientRect && el.getBoundingClientRect(); const st = el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView.getComputedStyle(el) : null; return !!r && (r.width > 0 || r.height > 0) && (!st || (st.visibility !== 'hidden' && st.display !== 'none')); };
  const deepAll = (scope, css) => {
    let out = [];
    try { out = Array.from(scope.querySelectorAll(css)); } catch (e) { throw new Error('bad CSS selector: ' + css); }
    if (out.length) return out;
    const walk = (node) => { for (const el of node.querySelectorAll('*')) { if (el.shadowRoot) { out.push(...el.shadowRoot.querySelectorAll(css)); walk(el.shadowRoot); } } };
    try { walk(scope); } catch (e) { /* closed roots are unreachable */ }
    return out;
  };
  const one = (scope, sel) => {
    sel = String(sel).trim();
    if (/^nth=-?\d+$/.test(sel)) return null; // handled by the caller
    if (sel.startsWith('xpath=') || sel.startsWith('//') || sel.startsWith('(//')) {
      const xp = sel.startsWith('xpath=') ? sel.slice(6) : sel;
      const r = (scope.ownerDocument || scope).evaluate(xp, scope, null, 7, null);
      const out = []; for (let i = 0; i < r.snapshotLength; i++) out.push(r.snapshotItem(i));
      return out;
    }
    if (sel.startsWith('text=')) {
      const exact = sel.startsWith('text==');
      const want = (exact ? sel.slice(6) : sel.slice(5)).trim().toLowerCase();
      const cands = Array.from(scope.querySelectorAll('a,button,label,input[type=submit],input[type=button],[role=button],[role=link],[role=tab],[role=menuitem],li,td,th,span,div,p,h1,h2,h3,h4,h5,h6,option,summary,strong,em,b'));
      const txt = (el) => String(el.innerText || el.value || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const hits = cands.filter(el => { const t = txt(el); return exact ? t === want : t.includes(want); });
      // the innermost matches: drop any element that contains another hit
      const inner = hits.filter(el => !hits.some(o => o !== el && el.contains(o)));
      const shown = inner.filter(vis);
      return shown.length ? shown : inner;
    }
    if (sel.startsWith('label=')) {
      const want = sel.slice(6).trim().toLowerCase();
      const d = scope.ownerDocument || scope;
      const out = [];
      for (const lab of scope.querySelectorAll('label')) {
        if (!String(lab.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().includes(want)) continue;
        const f = lab.htmlFor ? d.getElementById(lab.htmlFor) : lab.querySelector('input,textarea,select');
        if (f) out.push(f);
      }
      if (out.length) return out;
      return Array.from(scope.querySelectorAll('input,textarea,select,[contenteditable=true]')).filter(el =>
        String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').toLowerCase().includes(want));
    }
    return deepAll(scope, sel.startsWith('css=') ? sel.slice(4) : sel);
  };
  const parts = String(selector || '').split('>>').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('a selector is required');
  let scopes = [doc];
  for (const p of parts) {
    const m = p.match(/^nth=(-?\d+)$/);
    if (m) { const i = +m[1]; const pick = scopes[i < 0 ? scopes.length + i : i]; scopes = pick ? [pick] : []; continue; }
    const next = [];
    for (const s of scopes) for (const el of one(s, p)) if (!next.includes(el)) next.push(el);
    scopes = next;
  }
  const found = scopes.filter(x => x !== doc);
  return all ? found : (found[0] || null);
}
/* eslint-enable no-undef */

const FIND_SRC = __nxFind.toString();
const J = (v) => JSON.stringify(v === undefined ? null : v);
// A thrown error comes back as a value: executeJavaScript does not reliably keep
// a page exception's message, and "element not found: #x" is the useful part.
const wrap = (body) => `(async function(){ try { ${FIND_SRC}\n ${body} } catch (e) { return { __nxError: String((e && e.message) || e) }; } })()`;

/** read one value off an element: text | html | outer | value | attr:<name> | prop:<name> | href | src | exists */
const READ_SRC = `function __nxRead(el, what) {
  if (!el) return null;
  what = what || 'text';
  if (what === 'text') return String(el.innerText != null ? el.innerText : el.textContent || '').replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n').trim();
  if (what === 'html') return el.innerHTML;
  if (what === 'outer') return el.outerHTML;
  if (what === 'value') return el.type === 'checkbox' || el.type === 'radio' ? !!el.checked : el.value;
  if (what === 'href' || what === 'src') return el[what] || el.getAttribute(what);
  if (what.startsWith('attr:')) return el.getAttribute(what.slice(5));
  if (what.startsWith('prop:')) { const v = el[what.slice(5)]; return typeof v === 'object' ? null : v; }
  if (what === 'rect') { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }
  return el.getAttribute(what);
}`;

/**
 * extract({ selector, what, all, limit, fields })
 *   what: text (default) | html | outer | value | href | src | attr:<name> | prop:<name> | count | exists | rect
 *   all: every match (an array) instead of the first
 *   fields: { name: "sub-selector" | "sub-selector@what" | "@what" } — one object per match
 *           ("h2", "a@href", "@attr:data-id", ".price@text")
 */
function extract({ selector, what = 'text', all = false, limit = 500, fields = null } = {}) {
  if (!selector) throw new Error('extract needs a selector');
  return wrap(`${READ_SRC}
    const sel = ${J(selector)}, what = ${J(what)}, fields = ${J(fields)}, lim = ${J(Math.max(1, Math.min(parseInt(limit, 10) || 500, 10000)))};
    if (what === 'count') return __nxFind(sel, true).length;
    if (what === 'exists') return !!__nxFind(sel, false);
    const els = ${all || fields ? '__nxFind(sel, true).slice(0, lim)' : '[__nxFind(sel, false)].filter(Boolean)'};
    const row = (el) => {
      if (!fields) return __nxRead(el, what);
      const o = {};
      for (const [k, spec] of Object.entries(fields)) {
        const s = String(spec); const at = s.lastIndexOf('@');
        const sub = at >= 0 ? s.slice(0, at).trim() : s.trim();
        const w = at >= 0 ? s.slice(at + 1).trim() : 'text';
        const target = sub ? __nxFind(sub, false, el) : el;
        o[k] = __nxRead(target, w);
      }
      return o;
    };
    const out = els.map(row);
    return ${all || fields ? 'out' : 'out.length ? out[0] : null'};`);
}

/** table({ selector, headers }) — an HTML table as rows: objects keyed by the header row, or arrays */
function table({ selector = 'table', headers = true, limit = 5000 } = {}) {
  return wrap(`
    const t = __nxFind(${J(selector)}, false);
    if (!t) return null;
    const rows = Array.from(t.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(c => String(c.innerText || c.textContent || '').replace(/\\s+/g, ' ').trim()));
    if (!${J(!!headers)} || !rows.length) return rows.slice(0, ${J(limit)});
    const head = rows[0].map((h, i) => h || ('col' + (i + 1)));
    return rows.slice(1, ${J(limit)} + 1).filter(r => r.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));`);
}

/** links({ selector, match }) — [{ text, href }] for every link (inside selector, if given), optionally filtered by a substring/regex */
function links({ selector = null, match = null, limit = 1000 } = {}) {
  return wrap(`
    const scope = ${J(selector)} ? __nxFind(${J(selector)}, false) : document;
    if (!scope) return [];
    let re = null; const m = ${J(match)};
    if (m) { try { re = new RegExp(m, 'i'); } catch (e) { re = null; } }
    const out = [];
    for (const a of scope.querySelectorAll('a[href]')) {
      const href = a.href, text = String(a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim();
      if (m && !(re ? re.test(href) || re.test(text) : href.includes(m) || text.includes(m))) continue;
      out.push({ text, href });
      if (out.length >= ${J(limit)}) break;
    }
    return out;`);
}

/** page({ maxText }) — url, title, the visible text (capped), meta description, and form/link counts */
function page({ maxText = 20000 } = {}) {
  return wrap(`
    const txt = String(document.body ? document.body.innerText : '').replace(/\\n\\s*\\n+/g, '\\n').trim();
    const meta = document.querySelector('meta[name=description]');
    return { url: location.href, title: document.title, text: txt.slice(0, ${J(maxText)}), truncated: txt.length > ${J(maxText)},
      description: meta ? meta.content : '', links: document.links.length, forms: document.forms.length, readyState: document.readyState };`);
}

/**
 * act({ op, selector, value, … }) — in-page actions that work where synthetic
 * key events do not (React/Vue inputs, custom selects):
 *   click       scroll into view, then el.click()
 *   fill        set the value through the native setter + input/change events (clear first)
 *   append      same, adding to what is there
 *   clear       empty it
 *   select      a <select> option by value or visible text (value may be a list for multi-select)
 *   check / uncheck   a checkbox or radio
 *   submit      the element's form (or the element if it is a form)
 *   focus / blur
 *   scroll_to   scroll it into view
 *   set_attr    value = "name=value"
 *   remove      remove the element from the page
 *   upload_text value = { name, content, type } — a file made from text into an <input type=file>
 * Returns what it did, or throws "element not found: <selector>".
 */
function act({ op, selector, value = null, all = false } = {}) {
  if (!op) throw new Error('act needs an op');
  if (!selector) throw new Error(`${op} needs a selector`);
  return wrap(`
    const sel = ${J(selector)}, op = ${J(op)}, value = ${J(value)};
    const els = ${all ? '__nxFind(sel, true)' : '[__nxFind(sel, false)].filter(Boolean)'};
    if (!els.length) throw new Error('element not found: ' + sel);
    const setVal = (el, v) => {
      if (el.isContentEditable) { el.focus(); el.textContent = v; el.dispatchEvent(new InputEvent('input', { bubbles: true })); return; }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'value');
      el.focus && el.focus();
      if (d && d.set) d.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let done = 0;
    for (const el of els) {
      switch (op) {
        case 'click': el.scrollIntoView && el.scrollIntoView({ block: 'center' }); el.click(); break;
        case 'fill': setVal(el, value == null ? '' : String(value)); break;
        case 'append': setVal(el, String(el.value || el.textContent || '') + (value == null ? '' : String(value))); break;
        case 'clear': setVal(el, ''); break;
        case 'select': {
          if (el.tagName !== 'SELECT') throw new Error(sel + ' is not a <select>');
          const want = (Array.isArray(value) ? value : [value]).map(v => String(v).trim().toLowerCase());
          let hit = 0;
          for (const o of el.options) { const on = want.includes(String(o.value).toLowerCase()) || want.includes(String(o.textContent).trim().toLowerCase()); if (el.multiple) o.selected = on; else if (on && !hit) { el.value = o.value; } if (on) hit++; }
          if (!hit) throw new Error('no option ' + JSON.stringify(value) + ' in ' + sel);
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
        case 'check': case 'uncheck': { const want = op === 'check'; if (!!el.checked !== want) el.click(); if (!!el.checked !== want) { el.checked = want; el.dispatchEvent(new Event('change', { bubbles: true })); } break; }
        case 'submit': { const f = el.tagName === 'FORM' ? el : el.form || el.closest('form'); if (!f) throw new Error('no form around ' + sel); f.requestSubmit ? f.requestSubmit() : f.submit(); break; }
        case 'focus': el.focus(); break;
        case 'blur': el.blur(); break;
        case 'scroll_to': el.scrollIntoView({ block: 'center', behavior: 'instant' }); break;
        case 'set_attr': { const s = String(value || ''); const i = s.indexOf('='); if (i < 1) throw new Error('set_attr value is name=value'); el.setAttribute(s.slice(0, i), s.slice(i + 1)); break; }
        case 'remove': el.remove(); break;
        case 'upload_text': {
          const v = value || {}; const dt = new DataTransfer();
          dt.items.add(new File([String(v.content || '')], v.name || 'file.txt', { type: v.type || 'text/plain' }));
          el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true })); break;
        }
        default: throw new Error('unknown op ' + op);
      }
      done++;
    }
    return { op, selector: sel, count: done };`);
}

/**
 * check({ kind, selector, text, url }) — one test for wait_until, true/false:
 *   present / absent      in the DOM or not
 *   visible / hidden      on screen or not
 *   text                  the element (or the page, without a selector) contains text
 *   no_text               … does not
 *   url                   location.href contains url (or matches it as /regex/)
 *   enabled               the element exists and is not disabled
 *   ready                 document.readyState is complete
 */
function check({ kind = 'present', selector = null, text = null, url = null } = {}) {
  return wrap(`
    const kind = ${J(kind)}, sel = ${J(selector)}, text = ${J(text)}, url = ${J(url)};
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return (r.width > 0 || r.height > 0) && st.visibility !== 'hidden' && st.display !== 'none'; };
    const el = sel ? __nxFind(sel, false) : null;
    const has = (s) => String(s || '').toLowerCase().includes(String(text || '').toLowerCase());
    switch (kind) {
      case 'present': return !!el;
      case 'absent': return !el;
      case 'visible': return vis(el);
      case 'hidden': return !vis(el);
      case 'text': return has(sel ? (el && (el.innerText || el.value || el.textContent)) : document.body && (document.body.innerText || document.body.textContent));
      case 'no_text': return !has(sel ? (el && (el.innerText || el.value || el.textContent)) : document.body && (document.body.innerText || document.body.textContent));
      case 'enabled': return !!el && !el.disabled;
      case 'ready': return document.readyState === 'complete';
      case 'url': { const u = String(url || ''); if (/^\\/.*\\/[a-z]*$/.test(u)) { const i = u.lastIndexOf('/'); return new RegExp(u.slice(1, i), u.slice(i + 1)).test(location.href); } return location.href.includes(u); }
      default: throw new Error('unknown wait kind ' + kind);
    }`);
}

/** highlight({ selector }) — outline the matches for 2 s (to show what a selector hits) and return how many */
function highlight({ selector, ms = 2000 } = {}) {
  return wrap(`
    const els = __nxFind(${J(selector)}, true);
    for (const el of els) { const o = el.style.outline; el.style.outline = '2px solid #ff3d7f'; setTimeout(() => { el.style.outline = o; }, ${J(ms)}); }
    return els.length;`);
}

/** keyScript({ key, selector }) — a keyboard key dispatched in the page (Enter, Tab, Escape, ArrowDown …) */
function key({ key: k = 'Enter', selector = null } = {}) {
  return wrap(`
    const el = ${J(selector)} ? __nxFind(${J(selector)}, false) : (document.activeElement || document.body);
    if (!el) throw new Error('element not found: ' + ${J(selector)});
    const o = { key: ${J(k)}, code: ${J(k)}, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', o)); el.dispatchEvent(new KeyboardEvent('keypress', o)); el.dispatchEvent(new KeyboardEvent('keyup', o));
    if (${J(k)} === 'Enter' && el.form && el.tagName === 'INPUT') { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); }
    return { key: ${J(k)} };`);
}

module.exports = { extract, table, links, page, act, check, highlight, key, __nxFind, FIND_SRC };
