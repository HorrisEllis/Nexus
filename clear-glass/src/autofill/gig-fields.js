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
 *   shownScript(text)          the page shows this text (an FAQ or a question once added) → boolean
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

module.exports = { MODULE_ID, VERSION, HIS_BUTTONS, SECTIONS, fieldScript, readScript, clickButtonScript, listBoxesScript, shownScript, readsBack };
