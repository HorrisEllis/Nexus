'use strict';
/**
 * clear-glass/src/page/reader.js — one call that tells an agent what is on the page.
 * comp_id: clear-glass.page.reader
 * UUID: cg-page-reader-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely."
 *
 * THE GAP THIS CLOSES. Before this, an agent that wanted to know what a page said had three partial doors:
 * dom.query (one selector or the whole tree, element metadata, no prose), eval (anything, but the agent has to
 * write the extraction script itself, every time, and a small model writes it wrong), and screenshot (pixels a
 * text model cannot read). None of them answered "what is on this page, what can I type into, what can I press".
 *
 * readPage is that answer, in one shape: url, title, the readable text (budgeted), headings, links, every form
 * field with its label and a selector that will find it again, and every button. The selectors it returns are the
 * ones driver.click/type/select/check/upload take, so read → act needs no guessing in between.
 *
 * SHAPE OF THIS FILE (SISO split): pageScript(opts) builds the in-page script as a string (it runs inside the page
 * through driver.eval, so it cannot close over anything here); normalize(raw, opts) is pure and runs in Node.
 * Both are testable without Electron: the script runs in jsdom (tests/modules/clear-glass-page-reader.test.js).
 */

const MODULE_ID = 'clear-glass.page.reader';
const VERSION = '1.0.0';

const DEFAULTS = Object.freeze({ maxText: 12000, maxLinks: 80, maxFields: 120, maxButtons: 60 });

/**
 * The in-page extraction. Written as a real function and serialised with toString(), so the code that runs in
 * the page is the same code the tests run in jsdom — no second copy in a template string to drift.
 */
function _inPage(opts) {
  const doc = document;
  const cssEscape = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const st = window.getComputedStyle ? getComputedStyle(el) : null;
    if (st && (st.display === 'none' || st.visibility === 'hidden')) return false;
    if (el.type === 'hidden') return false;
    return true;
  };
  const selectorFor = (el) => {
    if (el.id && doc.querySelectorAll('#' + cssEscape(el.id)).length === 1) return '#' + cssEscape(el.id);
    const name = el.getAttribute && el.getAttribute('name');
    if (name) {
      const s = el.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\"') + '"]';
      if (doc.querySelectorAll(s).length === 1) return s;
    }
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
      if (cur.id && doc.querySelectorAll('#' + cssEscape(cur.id)).length === 1) { parts.unshift('#' + cssEscape(cur.id)); break; }
      const tag = cur.tagName.toLowerCase();
      let i = 1, sib = cur;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === cur.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  const labelFor = (el) => {
    if (el.id) {
      const l = doc.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]');
      if (l && l.textContent.trim()) return l.textContent.trim();
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && wrap.textContent.trim()) return wrap.textContent.trim();
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map(id => { const n = doc.getElementById(id); return n ? n.textContent.trim() : ''; }).join(' ').trim(); if (t) return t; }
    // The nearest preceding text in the same field group — how many real application forms label a question.
    const group = el.closest && el.closest('fieldset, .field, .form-group, .form-field, li, div');
    if (group) { const lg = group.querySelector('legend, label, h3, h4, p, span'); if (lg && lg !== el && lg.textContent.trim()) return lg.textContent.trim().slice(0, 300); }
    return el.getAttribute('placeholder') || '';
  };

  const text = (doc.body ? (doc.body.innerText || doc.body.textContent || '') : '').replace(/\n{3,}/g, '\n\n').trim();
  const headings = [...doc.querySelectorAll('h1, h2, h3')].filter(visible).map(h => ({ level: +h.tagName[1], text: h.textContent.trim() })).filter(h => h.text).slice(0, 60);
  const links = [...doc.querySelectorAll('a[href]')].filter(visible).map(a => ({ text: (a.textContent || '').trim().slice(0, 160), href: a.href, selector: selectorFor(a) }))
    .filter(l => l.text || l.href).slice(0, opts.maxLinks);

  const fields = [];
  for (const el of doc.querySelectorAll('input, textarea, select, [contenteditable="true"]')) {
    if (fields.length >= opts.maxFields) break;
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'contenteditable';
    if (['submit', 'button', 'image', 'reset'].includes(type)) continue;
    const f = {
      selector: selectorFor(el), tag, type,
      name: el.getAttribute('name') || null, id: el.id || null,
      label: labelFor(el).replace(/\s+/g, ' ').slice(0, 300),
      required: !!(el.required || el.getAttribute('aria-required') === 'true'),
      autocomplete: el.getAttribute('autocomplete') || null,
      // A <select> showing its placeholder option ("Select…", value "") is NOT filled, even though .value is non-empty
      // when the option has no value attribute.
      filled: type === 'checkbox' || type === 'radio' ? !!el.checked
        : tag === 'select' ? !!(el.value && el.selectedIndex >= 0 && !/^\s*(select|choose|please|--|—)/i.test((el.options[el.selectedIndex] || {}).textContent || '') && !(el.selectedIndex === 0 && el.options[0] && el.options[0].value === ''))
        : !!(el.value || (type === 'contenteditable' && el.textContent.trim())),
    };
    if (type === 'file') f.accept = el.getAttribute('accept') || null;
    if (type === 'radio') f.value = el.value;
    // A radio/checkbox's own label is the OPTION ("Yes"); the question is the group's legend or heading.
    if (type === 'radio' || type === 'checkbox') {
      const fs = el.closest && el.closest('fieldset');
      const lg = fs && fs.querySelector('legend');
      const rg = el.closest && el.closest('[role="radiogroup"], [role="group"]');
      let q = (lg && lg.textContent.trim()) || (rg && (rg.getAttribute('aria-label') || '')) || '';
      if (!q && rg && rg.getAttribute('aria-labelledby')) { const n = doc.getElementById(rg.getAttribute('aria-labelledby')); if (n) q = n.textContent.trim(); }
      if (q) f.question = q.replace(/\s+/g, ' ').slice(0, 300);
    }
    if (tag === 'select') f.options = [...el.options].map(o => ({ value: o.value, text: o.textContent.trim() })).slice(0, 80);
    fields.push(f);
  }
  const buttons = [...doc.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')].filter(visible)
    .map(b => ({ text: (b.textContent || b.value || b.getAttribute('aria-label') || '').trim().slice(0, 120), type: (b.getAttribute('type') || '').toLowerCase() || null, selector: selectorFor(b) }))
    .filter(b => b.text).slice(0, opts.maxButtons);

  return { url: location.href, title: doc.title, text, headings, links, fields, buttons, forms: doc.forms ? doc.forms.length : 0 };
}

/** pageScript(opts) → the code string driver.eval runs. */
function pageScript(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  return `(${_inPage.toString()})(${JSON.stringify(o)})`;
}

/**
 * normalize(raw, opts) — pure. Budgets the text (a page can be megabytes; an agent's context cannot), records
 * what was cut instead of cutting silently, and marks which fields still need a value.
 */
function normalize(raw, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'page returned nothing readable (no document, or the eval was blocked)' };
  const fullText = String(raw.text || '');
  const text = fullText.length > o.maxText ? fullText.slice(0, o.maxText) : fullText;
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  return {
    ok: true,
    url: raw.url || null,
    title: raw.title || '',
    text,
    truncated: fullText.length > o.maxText ? { shown: text.length, total: fullText.length } : null,
    headings: raw.headings || [],
    links: raw.links || [],
    fields,
    unfilledRequired: fields.filter(f => f.required && !f.filled).map(f => f.selector),
    buttons: raw.buttons || [],
    forms: raw.forms || 0,
  };
}

module.exports = { MODULE_ID, VERSION, DEFAULTS, pageScript, normalize, _inPage };
