'use strict';
/**
 * src/shortcuts/site-keys.js — keys bound to elements, per site (KB2, 0.60.275). Pure: no Electron, runs under node for tests and the CLI.
 *
 * James, 2026-10-28: "could always try arrows, or a number. any way you can add all of that to the keybindings. like elements to keys, per site?"
 *
 * A binding is { do, selector?, option?, key?, macro?, label? } under a site (its origin) and a key (an accelerator, as registry.js normalizes):
 *   click   — the element (a CSS selector, or the XPath the element picker gives), with the pointer
 *   choose  — the dropdown at the element, the option meant (ClearDriver choose: arrows and the number when a click does not take)
 *   key     — one key into the page (Down, Up, Enter, a digit …), after a click on the element when one is named
 *   macro   — a saved macro, run on that page as him
 * On that site the binding wins over a global shortcut on the same key; on every other site the key does what it did.
 *
 *   validate(binding)            → { ok, binding } | { ok:false, why }
 *   bind(map, url, accel, b)     → { map } | { error }      map is { [origin]: { [accel]: binding } }
 *   unbind(map, url, accel)      → { map } | { error }
 *   forUrl(map, url)             → { [accel]: binding }     this site's keys
 *   lookup(map, url, accel)      → binding | null
 *   steps(binding)               → [{ action, … }]          the ClearDriver commands it runs (a macro is { macro })
 *   isXPath(selector)            → true for an XPath ("/html/…", "//div", "(//a)[2]")
 *   markScript(xpath)            → a page expression: marks the element the XPath names (data-cg-sitekey) → true, or false when it is not there
 *   MARKED                       '[data-cg-sitekey="1"]' — the CSS selector for it
 */
const R = require('./registry');

const DO = ['click', 'choose', 'key', 'macro'];

function originOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}` : null; } catch (_) { return null; } }
function isXPath(sel) { return typeof sel === 'string' && /^(\(|\/)/.test(sel.trim()); }
const short = (v, n = 400) => typeof v === 'string' && v.trim() && v.length <= n;

function validate(b) {
  if (!b || typeof b !== 'object') return { ok: false, why: 'a binding is { do, selector, option, key, macro, label }' };
  if (!DO.includes(b.do)) return { ok: false, why: `do is one of ${DO.join(', ')} (got ${JSON.stringify(b.do)})` };
  const out = { do: b.do };
  if (b.selector != null && b.selector !== '') { if (!short(b.selector, 2000)) return { ok: false, why: 'selector is a CSS selector or an XPath' }; out.selector = b.selector.trim(); }
  if ((b.do === 'click' || b.do === 'choose') && !out.selector) return { ok: false, why: `${b.do} needs the element (selector)` };
  if (b.do === 'choose') { if (!short(String(b.option ?? ''), 120)) return { ok: false, why: 'choose needs the option (its text or its number)' }; out.option = String(b.option).trim(); }
  if (b.do === 'key') { if (!short(b.key, 20)) return { ok: false, why: 'key needs the key to press (Down, Up, Enter, a digit …)' }; out.key = b.key.trim(); }
  if (b.do === 'macro') { if (!short(b.macro, 120)) return { ok: false, why: 'macro needs the macro\'s name' }; out.macro = b.macro.trim(); }
  if (b.label != null && b.label !== '') out.label = String(b.label).slice(0, 120);
  return { ok: true, binding: out };
}

function bind(map = {}, url, accel, b) {
  const origin = originOf(url); if (!origin) return { error: `not a site: ${url}` };
  const a = R.normalize(accel); if (!a) return { error: 'not a key combination' };
  if (!R.isSafe(a)) return { error: `${a} would steal ordinary typing — use Ctrl, Alt or a function key` };
  const v = validate(b); if (!v.ok) return { error: v.why };
  const site = { ...((map || {})[origin] || {}), [a]: v.binding };
  return { map: { ...(map || {}), [origin]: site }, origin, accel: a, binding: v.binding };
}

function unbind(map = {}, url, accel) {
  const origin = originOf(url); if (!origin) return { error: `not a site: ${url}` };
  const a = R.normalize(accel); if (!a) return { error: 'not a key combination' };
  const site = { ...((map || {})[origin] || {}) }; delete site[a];
  const next = { ...(map || {}) }; if (Object.keys(site).length) next[origin] = site; else delete next[origin];
  return { map: next, origin, accel: a };
}

function forUrl(map = {}, url) { const o = originOf(url); return (o && map && map[o]) ? { ...map[o] } : {}; }
function lookup(map = {}, url, accel) { const a = R.normalize(accel); return (a && forUrl(map, url)[a]) || null; }

function steps(b) {
  if (!b) return [];
  if (b.do === 'click') return [{ action: 'pointer', selector: b.selector, do: 'click', label: b.label || 'key' }];
  if (b.do === 'choose') return [{ action: 'choose', selector: b.selector, option: b.option }];
  if (b.do === 'key') return [...(b.selector ? [{ action: 'pointer', selector: b.selector, do: 'click', label: b.label || 'key' }] : []), { action: 'pressKey', key: b.key }];
  if (b.do === 'macro') return [{ macro: b.macro }];
  return [];
}

const MARKED = '[data-cg-sitekey="1"]';
function markScript(xpath) {
  return `(function(x){ var el = document.evaluate(x, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (!el) return false; document.querySelectorAll('[data-cg-sitekey]').forEach(function(e){ e.removeAttribute('data-cg-sitekey'); }); el.setAttribute('data-cg-sitekey', '1'); return true; })(${JSON.stringify(xpath)})`;
}

/** describe(b) — a person-readable line for a binding */
function describe(b) {
  if (!b) return '';
  const on = b.label || b.selector || '';
  if (b.do === 'click') return `Click ${on}`;
  if (b.do === 'choose') return `Choose "${b.option}" in ${on}`;
  if (b.do === 'key') return `Press ${b.key}${b.selector ? ` in ${on}` : ''}`;
  if (b.do === 'macro') return `Run macro “${b.macro}”`;
  return b.do;
}

module.exports = { DO, MARKED, originOf, isXPath, markScript, validate, bind, unbind, forUrl, lookup, steps, describe };
