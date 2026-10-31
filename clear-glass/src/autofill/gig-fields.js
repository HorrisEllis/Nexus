'use strict';
/**
 * clear-glass/src/autofill/gig-fields.js — the gig parts that are not dropdowns, found on the page by the words of their section. Pure: each
 * export returns a page expression the driver evaluates (action 'eval'); no Electron here.
 * comp_id: nexus.clear-glass.autofill.gig-fields
 * UUID: nexus-clear-glass-autofill-gig-fields-v1-0000-2026-1030-jamesbrooks-001
 * Spec: clear-glass/spec/gated-flows.spec MOD-GF1 · Map: docs/2026-10-28-gated-flows-phasemap.spec GF1
 *
 * James, 2026-10-30: "the fiverr automation. isn't working. like the autofill needs to do all the work it can. like can you fix the autofill
 * to work with all fields, and if you run into friction use the per site keybindings that I proposed."
 *
 *   fieldScript(key, sectionRe, { exclude, prefer })  marks data-cg-part=<key> on the visible text box (input, textarea, or a rich editor)
 *                                                     nearest under the words sectionRe, never one under exclude → { found, kind, why }
 *   readScript(key)            what the marked field holds now (value, or a rich editor's text) → string | null
 *   clickButtonScript(re)      clicks the visible button whose words match re, never one of HIS_BUTTONS → { clicked, text, why }
 *   listBoxesScript(kind)      after an Add: the empty visible boxes of an FAQ (question, answer) or a buyer question (question), marked
 *                              data-cg-part=<kind>.question / <kind>.answer → { found, why }
 *   valueAtScript({ selector | cgId, key })  what a box shows now, marked data-cg-part=<key> → { found, value }   (GG1, a part's gate)
 *   shownScript(text)          the page shows this text (an FAQ or a question once added) → boolean
 *   metaTabsScript()           Gig metadata's tabs, marked data-cg-meta-tab=<i> → { found, tabs: [{ name, required, open }] }   (GT6)
 *   metaPanelScript()          the open tab's choices, marked data-cg-meta-opt=<j> → { found, kind, options, limit, count, counter } (GT6)
 * Fiverr's other editor pages are not on record (gig-pages.js); the words matched here are the editor's own labels, a reading to confirm on
 * his machine. What does not match falls to his site keys (bridge _gigSiteKey), then to "point at it".
 */

const MODULE_ID = 'nexus.clear-glass.autofill.gig-fields';
const VERSION = '1.0.0';
// his to press (0.39.301 "Not automate talking or posting"; FI_D1): never clicked by these scripts
const HIS_BUTTONS = /\b(publish|save|continue|submit|send|pay)\b/i;
const SECTIONS = Object.freeze({
  title: { re: /gig title/i },
  description: { re: /description/i, exclude: /frequently asked|\bfaq\b/i, prefer: 'rich' },
});

const _re = (r) => (r ? r.toString() : 'null');
const VIS = 'function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; }';
const BOXES = 'input:not([type]),input[type="text"],textarea,[contenteditable="true"],[contenteditable=""]';

function fieldScript(key, sectionRe, { exclude = null, prefer = null } = {}) {
  return `(function(key, re, ex, prefer){
  ${VIS}
  var best = null;
  Array.prototype.forEach.call(document.querySelectorAll(${JSON.stringify(BOXES)}), function(el){
    if (!vis(el)) return;
    var mark = el.getAttribute('data-cg-part'); if (mark && mark !== key) return;
    if (el.parentElement && el.parentElement.closest('[contenteditable="true"]')) return;   // inside a rich editor: the editor is the box
    var rich = el.isContentEditable && !/^(INPUT|TEXTAREA)$/.test(el.tagName);
    // the nearest ancestor that says either: only the section's words → this box; the excluded words too (another section, or the page-wide
    // "Description & FAQ") → never this box, so a box nothing nearer names is not taken
    var up = el.parentElement;
    for (var d = 1; d < 9 && up; d++, up = up.parentElement) {
      var own = String(up.innerText || up.textContent || ''), hit = re.test(own), bad = !!(ex && ex.test(own));
      if (!hit && !bad) continue;
      if (!hit || bad) return;
      var score = d * 2 + (prefer === 'rich' && !rich ? 1 : 0);
      if (!best || score < best.score) best = { el: el, score: score, rich: rich };
      return;
    }
  });
  if (!best) return { found: false, why: 'no text box under the words ' + re };
  document.querySelectorAll('[data-cg-part="' + key + '"]').forEach(function(e){ if (e !== best.el) e.removeAttribute('data-cg-part'); });
  best.el.setAttribute('data-cg-part', key);
  return { found: true, kind: best.rich ? 'rich' : best.el.tagName.toLowerCase(), selector: '[data-cg-part="' + key + '"]' };
})(${JSON.stringify(String(key))}, ${_re(sectionRe)}, ${_re(exclude)}, ${JSON.stringify(prefer)})`;
}

function readScript(key) {
  return `(function(k){ var el = document.querySelector('[data-cg-part="' + k + '"]'); if (!el) return null;
  return /^(INPUT|TEXTAREA)$/.test(el.tagName) ? String(el.value) : String(el.innerText || el.textContent || ''); })(${JSON.stringify(String(key))})`;
}

function clickButtonScript(re) {
  return `(function(re, his){
  ${VIS}
  var els = Array.prototype.filter.call(document.querySelectorAll('button,[role="button"],a'), vis);
  for (var i = 0; i < els.length; i++) { var t = String(els[i].innerText || els[i].textContent || '').trim();
    if (re.test(t)) { if (his.test(t)) return { clicked: false, text: t, why: 'yours to press' }; els[i].click(); return { clicked: true, text: t }; } }
  return { clicked: false, why: 'no button saying ' + re };
})(${_re(re)}, ${_re(HIS_BUTTONS)})`;
}

// an FAQ: a question box (input or textarea) and an answer box; a buyer question: one box. Empty and visible, the ones just opened by Add.
function listBoxesScript(kind) {
  return `(function(kind){
  ${VIS}
  var boxes = Array.prototype.filter.call(document.querySelectorAll(${JSON.stringify(BOXES)}), function(el){
    if (!vis(el) || el.getAttribute('data-cg-part') && !/^(faq|requirement)\\./.test(el.getAttribute('data-cg-part'))) return false;
    var v = /^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value : (el.innerText || ''); return !String(v).trim(); });
  var hint = function(el){ var s = (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('name') || '');
    var up = el.parentElement; for (var d = 0; d < 3 && up; d++, up = up.parentElement) { var l = up.querySelector('label'); if (l) { s += ' ' + l.textContent; break; } } return s; };
  document.querySelectorAll('[data-cg-part^="faq."],[data-cg-part^="requirement."]').forEach(function(e){ e.removeAttribute('data-cg-part'); });
  if (kind === 'faq') {
    var q = boxes.filter(function(b){ return /question/i.test(hint(b)); })[0], a = boxes.filter(function(b){ return /answer/i.test(hint(b)); })[0];
    if (!q && !a && boxes.length >= 2) { q = boxes[0]; a = boxes[1]; }
    if (!q || !a) return { found: false, why: 'no empty question and answer boxes after Add FAQ' };
    q.setAttribute('data-cg-part', 'faq.question'); a.setAttribute('data-cg-part', 'faq.answer'); return { found: true };
  }
  var b = boxes.filter(function(x){ return /question|request|detail/i.test(hint(x)); })[0] || boxes[0];
  if (!b) return { found: false, why: 'no empty question box after Add New Question' };
  b.setAttribute('data-cg-part', 'requirement.question'); return { found: true };
})(${JSON.stringify(String(kind))})`;
}

// 2026-10-30 GG1 — James: "each field/drop down/ or anything should be gated." What a box shows now, found by a selector or by the id the DOM
// mesh gave it (a field the label-matching pass filled); the box is marked data-cg-part=<key> so a retry can type into it.
function valueAtScript({ selector = null, cgId = null, key = null } = {}) {
  return `(function(sel, id, key){ var el = null;
  if (sel) { try { el = document.querySelector(sel); } catch (_) {} }
  else if (id) el = Array.prototype.find.call(document.querySelectorAll('input,textarea,select,[contenteditable]'), function(e){ return e.__cgId === id; }) || null;
  if (!el) return { found: false };
  if (key) el.setAttribute('data-cg-part', key);
  var v = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : /^(INPUT|TEXTAREA)$/.test(el.tagName) ? String(el.value) : String(el.innerText || el.textContent || '');
  return { found: true, value: v };
})(${JSON.stringify(selector)}, ${JSON.stringify(cgId)}, ${JSON.stringify(key)})`;
}

function shownScript(text) {
  return `(function(t){ var hay = String(document.body.innerText || '').replace(/\\s+/g, ' ').toLowerCase();
  return hay.indexOf(String(t).replace(/\\s+/g, ' ').trim().toLowerCase().slice(0, 60)) >= 0; })(${JSON.stringify(String(text))})`;
}

// what a rich editor or a box shows, against what was meant: whitespace aside (an editor renders a line break its own way), the start of the
// value must be there
function readsBack(shown, value) {
  const n = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  const v = n(value); if (!v) return true;
  return n(shown).includes(v.slice(0, 60));
}

// 2026-10-30 GT6 — James: "then the bullets for each tab for each catagory." Fiverr's Gig metadata is a list of tabs (PROGRAMMING LANGUAGE*,
// FRONTEND FRAMEWORK …) beside a panel of choices for the open tab: radio buttons (one) or checkboxes (up to a limit, a counter "3 / 5").
// Both are found under the words "Gig metadata", never by a class name; the tab list is the visible text in the section that is not a
// choice's label. Read only, except the marks for the driver: data-cg-meta-tab=<i> on each tab, data-cg-meta-opt=<j> on each choice.
const META_PRELUDE = `var re = /gig metadata/i;
  function vis(el){ if (!el) return false; var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  function txt(el){ return String(el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim(); }
  function name(t){ return String(t || '').replace(/\\*/g, '').replace(/\\s+/g, ' ').trim(); }
  var head = Array.prototype.find.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,legend,p,span,div,strong,b'), function(e){ return vis(e) && !e.children.length && re.test(txt(e)); });
  var root = null;
  for (var p = head && head.parentElement, i = 0; p && i < 6; p = p.parentElement, i++) if (p.querySelector('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]')) { root = p; break; }
  function boxes(){ return Array.prototype.filter.call(root.querySelectorAll('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"]'), function(b){ return vis(b) || vis(b.closest('label') || b.parentElement); }); }
  function labelOf(b){ return b.closest('label') || (b.id && document.querySelector('label[for="' + b.id + '"]')) || b.parentElement; }
  function isOn(b){ return b.tagName === 'INPUT' ? !!b.checked : b.getAttribute('aria-checked') === 'true'; }`;

// metaTabsScript() → { found, tabs: [{ name, required, open }], why } — each tab marked data-cg-meta-tab=<i>
function metaTabsScript() {
  return `(function(){ ${META_PRELUDE}
  if (!head) return { found: false, why: 'no "Gig metadata" section on the page' };
  if (!root) return { found: false, why: 'a "Gig metadata" heading with no choices under it' };
  document.querySelectorAll('[data-cg-meta-tab]').forEach(function(e){ e.removeAttribute('data-cg-meta-tab'); });
  var inChoice = function(el){ return boxes().some(function(b){ var l = labelOf(b); return l && (l === el || l.contains(el) || el.contains(b)); }); };
  var seen = {}, tabs = [];
  Array.prototype.forEach.call(root.querySelectorAll('li,button,[role="tab"],a,div,span,p'), function(el){
    if (!vis(el) || el === head || el.contains(head) || inChoice(el)) return;
    var t = txt(el); if (!t || t.length > 60 || re.test(t) || /\\d+\\s*\\/\\s*\\d+/.test(t) || /select up to|choose up to/i.test(t)) return;
    if (Array.prototype.some.call(el.children, function(c){ return vis(c) && txt(c) === t; })) return;   // the innermost element with this text
    if (Array.prototype.some.call(el.querySelectorAll('*'), function(c){ return vis(c) && txt(c) && txt(c) !== t && c.children.length === 0; })) return;   // one label, not a group
    var n = name(t); if (!n || seen[n.toLowerCase()]) return;
    if (t !== t.toUpperCase() && !el.closest('[role="tablist"],ul,ol,nav')) return;   // tab names are shown in capitals, or sit in a list
    seen[n.toLowerCase()] = 1;
    var open = el.getAttribute('aria-selected') === 'true' || /(^|[\\s_-])(active|selected|current)([\\s_-]|$)/i.test(String(el.className || '')) || /(^|[\\s_-])(active|selected|current)([\\s_-]|$)/i.test(String((el.parentElement || {}).className || ''));
    el.setAttribute('data-cg-meta-tab', String(tabs.length)); tabs.push({ name: n, required: /\\*/.test(t), open: open });
  });
  return { found: true, tabs: tabs };
})()`;
}

// metaPanelScript() → { found, kind: 'radio'|'checkbox', options: [{ label, checked }], limit, count, counter } — each choice's label marked
// data-cg-meta-opt=<j>. limit: the counter's "/ N", else "up to N" in the section, else 1 for radio buttons, else null (none said).
function metaPanelScript() {
  return `(function(){ ${META_PRELUDE}
  if (!root) return { found: false, why: head ? 'a "Gig metadata" heading with no choices under it' : 'no "Gig metadata" section on the page' };
  document.querySelectorAll('[data-cg-meta-opt]').forEach(function(e){ e.removeAttribute('data-cg-meta-opt'); });
  var bs = boxes(), radio = bs.length && bs.every(function(b){ return b.type === 'radio' || b.getAttribute('role') === 'radio'; });
  var options = bs.map(function(b, j){ var l = labelOf(b); var t = name(txt(l) || b.value || b.getAttribute('aria-label') || ''); (vis(l) ? l : b).setAttribute('data-cg-meta-opt', String(j)); return { label: t, checked: isOn(b) }; });
  var all = txt(root), c = /(\\d+)\\s*\\/\\s*(\\d+)/.exec(all), u = /(?:select|choose) up to (\\d+)/i.exec(all);
  var limit = c ? Number(c[2]) : u ? Number(u[1]) : radio ? 1 : null;
  return { found: true, kind: radio ? 'radio' : 'checkbox', options: options, limit: limit, count: options.filter(function(o){ return o.checked; }).length, counter: c ? c[0].replace(/\\s+/g, ' ') : null };
})()`;
}

module.exports = { MODULE_ID, VERSION, HIS_BUTTONS, SECTIONS, fieldScript, readScript, clickButtonScript, listBoxesScript, valueAtScript, shownScript, readsBack, metaTabsScript, metaPanelScript };
