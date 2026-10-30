'use strict';
/**
 * clear-glass/src/page/element-gate.js — one gate for any element on any page. Pure: no Electron; page reads are expressions the caller runs.
 * comp_id: nexus.clear-glass.page.element-gate
 * UUID: nexus-clear-glass-page-element-gate-v1-0000-2026-1030-jamesbrooks-001
 * Spec: clear-glass/spec/gated-flows.spec MOD-UG1 · Map: docs/2026-10-28-gated-flows-phasemap.spec UG1
 *
 * James, 2026-10-30: "each field/drop down/ or anything should be gated." · "it needs to be universal for all dom elements. like for the job
 * applications for instance, even if we need a way to create them per page using the element picker, per site settings, macros and automation
 * features. stop thinking so narrow"
 *
 * An expectation: where + what must hold.
 *   where   selector (CSS) | xpath | cgId (the DOM mesh's id) | choice: { column, row, selector } (read by the driver's readChoice)
 *           | checkAt: { column, row } (read by the driver's checkAt) | none (the whole page: text, url)
 *   what    value (the element holds this; contained, whitespace aside) · equals (exactly, whitespace aside) · matches ('/regex/flags')
 *           · shows (the choice it shows) · checked (true/false) · text (its text, or the page's, contains) · visible · gone · url (glob)
 *   value / equals / shows / text may be '{{value}}': the value the write just put there (a gate he made: "holds what was typed").
 *   A site gate (his, made with the picker) adds: id, label, page (a URL glob within the site; none = every page of it).
 *
 *   WRITES                     the driver actions that write to a page, each gated
 *   derive(action, args, res)  the expectation a write implies, or null (a click implies nothing on its own)
 *   normalize(gate, written)   a gate with {{value}} put in; FG3's macro gate keys (selector + value, choice) read the same way
 *   validate(gate)             { ok, why } — an element or the page, and at least one thing to hold
 *   stateScript(exp)           a page expression → { url, found, visible, value, shows, checked, text } — only reads
 *   sameElementScript(a, b)    a page expression → do two "where"s name the same element (a site gate applies to the write)
 *   evaluate(exp, state, OM)   { open, saw }
 *   settle(check, opts)        read until open (timeoutMs), then again after settleMs: a page that puts its own value back is caught
 *   gateTiming(step, site)     a part's timing: { timeoutMs, settleMs, every, retries, backoff: { baseMs, factor, capMs }, after } (GT1)
 *   quietScript(quietMs, capMs) a page expression → a promise of { quiet, waitedMs, mutations }: no DOM change for quietMs (GT4), capped
 *   backoffMs(timing, n)       the wait before try n+1: baseMs × factor^n, capped (architecture-spec RULE D)
 *   matchSite(map, url)        his gates for this page: map is { [origin]: [gate] }
 */

const MODULE_ID = 'nexus.clear-glass.page.element-gate';
const VERSION = '1.0.0';
const WRITES = Object.freeze(new Set(['type', 'setValue', 'insertText', 'typeAt', 'select', 'choose', 'check', 'checkAt']));
const WHAT = ['value', 'equals', 'matches', 'shows', 'checked', 'text', 'visible', 'gone', 'url'];
const WHERE = ['selector', 'xpath', 'cgId', 'choice', 'checkAt'];

const _isXPath = (s) => typeof s === 'string' && /^(\(|\/)/.test(s.trim());
const _norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
const _str = (v) => (v == null ? '' : String(v));

function derive(action, args = {}, res = {}) {
  const a = args || {}, r = res || {};
  const sel = a.selector || null;
  const typed = (t) => typeof t === 'string' && t.replace(/\r?\n/g, '').trim() !== '';
  switch (action) {
    case 'type': return sel && typed(a.text) ? { selector: sel, value: a.text, why: 'typed' } : null;
    case 'setValue': return sel && typed(_str(a.value)) ? { selector: sel, value: _str(a.value), why: 'set' } : null;
    case 'insertText': return sel && typed(a.text) ? { selector: sel, value: a.text, why: 'typed' } : null;
    case 'typeAt': return r.selector && typed(_str(a.text)) ? { selector: r.selector, value: _str(a.text), why: 'typed at its column and row' } : null;
    case 'select': return sel ? { selector: sel, shows: _str(a.text != null ? a.text : a.value), why: 'selected' } : null;
    case 'choose': {
      const shows = _str(a.option); if (!shows.trim()) return null;
      if (a.column || a.row || sel) return { choice: { column: a.column || null, row: a.row || null, selector: sel }, shows, why: 'chosen' };
      return { text: _str(r.option || shows), why: 'chosen (the page shows it)' };
    }
    case 'check': return sel ? { selector: sel, checked: a.checked !== false, why: a.checked === false ? 'cleared' : 'ticked' } : null;
    case 'checkAt': return a.column && a.row && !a.read ? { checkAt: { column: a.column, row: a.row }, checked: a.checked !== false, why: 'ticked at its column and row' } : null;
    case 'mutate': return a.cgId && a.value != null ? { cgId: a.cgId, value: _str(a.value), why: 'set' } : null;
    default: return null;
  }
}

function normalize(gate = {}, written = null) {
  const g = { ...gate };
  for (const k of ['value', 'equals', 'shows', 'text']) if (g[k] === '{{value}}') g[k] = written == null ? null : String(written);
  // FG3 / KB4 macro gates: { selector, value } and { choice: { column|row|selector, is } } read as the same expectation
  if (g.choice && g.choice.is != null && g.shows == null) { g.shows = String(g.choice.is); g.choice = { column: g.choice.column || null, row: g.choice.row || null, selector: g.choice.selector || null }; }
  if (g.selector && _isXPath(g.selector)) { g.xpath = g.selector; delete g.selector; }
  return g;
}

function validate(gate) {
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) return { ok: false, why: 'a gate is { where, what must hold }' };
  const has = (k) => gate[k] !== undefined && gate[k] !== null && gate[k] !== '';
  if (!WHAT.some(has)) return { ok: false, why: `say what must hold: one of ${WHAT.join(', ')}` };
  const where = WHERE.some(has);
  if (!where && WHAT.filter(has).some(k => !['text', 'url'].includes(k))) return { ok: false, why: 'name the element (pick it, or give a selector / XPath): only text and url are checked on the whole page' };
  if (has('matches')) { const m = /^\/(.*)\/([a-z]*)$/.exec(String(gate.matches)); try { new RegExp(m ? m[1] : gate.matches, m ? m[2] : ''); } catch (e) { return { ok: false, why: `matches is not a pattern: ${e.message}` }; } }
  for (const k of ['checked', 'visible', 'gone']) if (has(k) && typeof gate[k] !== 'boolean') return { ok: false, why: `${k} is true or false` };
  if (has('page') && typeof gate.page !== 'string') return { ok: false, why: 'page is a URL pattern' };
  return { ok: true, why: null };
}

// the page-side finder, shared by stateScript and sameElementScript
const LOCATE = `function locate(w){ if (!w) return null; var el = null;
  if (w.cgId) el = Array.prototype.find.call(document.querySelectorAll('input,textarea,select,button,[contenteditable],[role]'), function(e){ return e.__cgId === w.cgId; }) || null;
  else if (w.xpath) { try { el = document.evaluate(w.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (_) {} }
  else if (w.selector) { try { el = document.querySelector(w.selector); } catch (_) {} }
  return el; }`;

function stateScript(exp = {}) {
  const w = { selector: exp.selector || null, xpath: exp.xpath || null, cgId: exp.cgId || null };
  return `(function(w, page){ ${LOCATE}
  var out = { url: location.href };
  var el = (w.selector || w.xpath || w.cgId) ? locate(w) : null;
  if (page) { out.text = String(document.body ? document.body.innerText : ''); out.found = true; return out; }
  out.found = !!el; if (!el) return out;
  var r = el.getBoundingClientRect(), cs = getComputedStyle(el); out.visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  var tag = el.tagName;
  if (tag === 'SELECT') { out.value = String(el.value); out.shows = (el.options[el.selectedIndex] || {}).text || ''; }
  else if (tag === 'INPUT' || tag === 'TEXTAREA') { out.value = String(el.value); out.shows = out.value; }
  else { out.value = String(el.innerText || el.textContent || ''); out.shows = out.value; }
  if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) out.checked = !!el.checked;
  else if (el.getAttribute('aria-checked') != null) out.checked = el.getAttribute('aria-checked') === 'true';
  out.text = String(el.innerText || el.textContent || '') + (tag === 'INPUT' || tag === 'TEXTAREA' ? ' ' + el.value : '');
  return out;
})(${JSON.stringify(w)}, ${!(w.selector || w.xpath || w.cgId)})`;
}

function sameElementScript(a = {}, b = {}) {
  const wa = { selector: a.selector || null, xpath: a.xpath || null, cgId: a.cgId || null }, wb = { selector: b.selector || null, xpath: b.xpath || null, cgId: b.cgId || null };
  return `(function(a, b){ ${LOCATE} var x = locate(a), y = locate(b); return !!x && x === y; })(${JSON.stringify(wa)}, ${JSON.stringify(wb)})`;
}

function _glob(pattern, url) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(String(pattern));
  try {
    if (m) return new RegExp(m[1], m[2]).test(String(url || ''));
    const esc = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^?#]*').replace(/\u0000/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$').test(String(url || ''));
  } catch (_) { return false; }
}

function evaluate(exp = {}, state = {}, OM = null) {
  const s = state || {}, bad = [], ok = [];
  const q = (v) => JSON.stringify(String(v == null ? '' : v).slice(0, 60));
  const put = (good, yes, no) => (good ? ok : bad).push(good ? yes : no);
  if (exp.url != null) put(_glob(exp.url, s.url), 'the address matches', `the address is ${q(s.url)}`);
  if (exp.gone != null) { put(exp.gone ? !s.found : !!s.found, exp.gone ? 'gone' : 'there', exp.gone ? 'still there' : 'not on the page'); return { open: !bad.length, saw: (bad.length ? bad : ok).join('; ') }; }
  const pageWide = !(exp.selector || exp.xpath || exp.cgId || exp.choice || exp.checkAt);
  if (!pageWide && !s.found) return { open: false, saw: 'not on the page' };
  if (exp.visible != null) put(!!s.visible === !!exp.visible, exp.visible ? 'visible' : 'hidden', exp.visible ? 'hidden' : 'visible');
  if (exp.value != null) put(_norm(s.value).includes(_norm(exp.value)), `holds ${q(exp.value)}`, `holds ${q(s.value)}`);
  if (exp.equals != null) put(_norm(s.value) === _norm(exp.equals), `is ${q(exp.equals)}`, `is ${q(s.value)}`);
  if (exp.matches != null) { const m = /^\/(.*)\/([a-z]*)$/.exec(String(exp.matches)); let good = false; try { good = new RegExp(m ? m[1] : exp.matches, m ? m[2] : '').test(String(s.value || '')); } catch (_) {} put(good, `matches ${exp.matches}`, `${q(s.value)} does not match ${exp.matches}`); }
  if (exp.shows != null) { const shown = s.shows == null ? '' : s.shows; const good = OM && OM.shows ? OM.shows(shown, String(exp.shows)) : _norm(shown).includes(_norm(exp.shows)); put(good, `shows ${q(exp.shows)}`, `shows ${q(shown)}`); }
  if (exp.checked != null) put(s.checked === !!exp.checked, exp.checked ? 'ticked' : 'clear', s.checked == null ? 'no tick to read' : (s.checked ? 'ticked' : 'clear'));
  if (exp.text != null) put(_norm(s.text).includes(_norm(exp.text)), `shows ${q(exp.text)}`, `${q(exp.text)} is not shown`);
  return { open: !bad.length && ok.length > 0, saw: (bad.length ? bad : ok).join('; ') || 'nothing to check' };
}

async function settle(check, { timeoutMs = 2500, settleMs = 400, every = 150 } = {}) {
  const until = Date.now() + timeoutMs; let c = { open: false, saw: 'not read' };
  for (;;) {
    try { c = await check(); } catch (e) { c = { open: false, saw: e.message }; }
    if (c.open || Date.now() >= until) break;
    await new Promise(res => setTimeout(res, every));
  }
  if (!c.open) return { open: false, saw: c.saw, held: false };
  await new Promise(res => setTimeout(res, settleMs));
  let d; try { d = await check(); } catch (e) { d = { open: false, saw: e.message }; }
  return d.open ? { open: true, saw: d.saw, held: true } : { open: false, saw: `it showed ${c.saw}, then the page changed it: ${d.saw}`, held: false };
}

// 2026-10-30 GT1 — James: "wheich needs more timing for the gates for the drop down menus." A gate's timing is the part's, not two constants.
// Text gates keep today's (2500 ms, 400 ms, one retry, no wait between); a choice waits as long as choose waits for its options (8 s), is
// tried three times, and waits longer before each retry (architecture-spec RULE D: "increasing the timing little by little"). The site's
// gates.timeoutMs / gates.settleMs (his keys) lift the floor; the step's own fields win over both (USER_AUTONOMY).
const TIMING = Object.freeze({
  text:   { timeoutMs: 2500, settleMs: 400, every: 150, retries: 1, backoff: { baseMs: 0,   factor: 1, capMs: 0 } },
  choice: { timeoutMs: 8000, settleMs: 600, every: 200, retries: 2, backoff: { baseMs: 600, factor: 2, capMs: 4000 } },
});
function gateTiming(step = {}, site = {}) {
  const s = step || {}, kind = s.kind === 'choice' ? 'choice' : 'text', d = TIMING[kind], st = site || {};
  const num = (v, min, max) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(min, Math.min(max, Number(v))) : null);
  const pick = (k, min, max) => { const own = num(s[k], min, max); if (own != null) return own; const fromSite = num(st[k], min, max); return fromSite != null ? Math.max(fromSite, d[k]) : d[k]; };
  const b = s.backoff || {};
  return {
    kind, timeoutMs: pick('timeoutMs', 100, 60000), settleMs: pick('settleMs', 0, 10000), every: num(s.every, 50, 5000) || d.every,
    retries: num(s.retries, 0, 10) != null ? num(s.retries, 0, 10) : d.retries,
    backoff: { baseMs: num(b.baseMs, 0, 60000) != null ? num(b.baseMs, 0, 60000) : d.backoff.baseMs, factor: num(b.factor, 1, 10) || d.backoff.factor, capMs: num(b.capMs, 0, 120000) != null ? num(b.capMs, 0, 120000) : d.backoff.capMs },
    after: s.after || null,
  };
}
// 2026-10-30 GT4 — the page has finished re-rendering when nothing in it has changed for quietMs; never waits past capMs (a page that never
// stops, an animated banner, is said: quiet false)
function quietScript(quietMs = 400, capMs = 4000) {
  return `new Promise(function(done){ var t0 = Date.now(), last = Date.now(), n = 0;
  var mo = new MutationObserver(function(m){ n += m.length; last = Date.now(); });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  (function tick(){ var now = Date.now();
    if (now - last >= ${Number(quietMs) || 0}) { mo.disconnect(); return done({ quiet: true, waitedMs: now - t0, mutations: n }); }
    if (now - t0 >= ${Number(capMs) || 0}) { mo.disconnect(); return done({ quiet: false, waitedMs: now - t0, mutations: n }); }
    setTimeout(tick, 50); })(); })`;
}
function backoffMs(t, n) { const b = (t && t.backoff) || {}; if (!b.baseMs) return 0; return Math.min(b.capMs || Infinity, Math.round(b.baseMs * Math.pow(b.factor || 1, n))); }

function originOf(url) { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}` : null; } catch (_) { return null; } }
function matchSite(map = {}, url) {
  const o = originOf(url); if (!o || !map || !Array.isArray(map[o])) return [];
  return map[o].filter(g => g && (!g.page || _glob(g.page, url)));
}

module.exports = { MODULE_ID, VERSION, WRITES, WHAT, WHERE, TIMING, derive, normalize, validate, stateScript, sameElementScript, evaluate, settle, gateTiming, backoffMs, quietScript, matchSite, originOf, isXPath: _isXPath };
