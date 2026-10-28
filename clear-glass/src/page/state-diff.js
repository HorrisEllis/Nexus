'use strict';
/**
 * clear-glass/src/page/state-diff.js — what a key press (or anything) changed on a page's html and body (FP4, 0.60.221).
 * Pure: two snapshots in, the difference out; the page only runs snapshotScript (to read) and revertScript (to put back).
 * Spec: clear-glass/spec/flow-cores.spec MOD-FC-DIFF · Map: docs/2026-10-28-first-principles-phasemap.spec FP4
 *
 * James, 2026-10-28: "how do i turn this off, the accessabilit, i hit tab too many times." · "only whats needed for a fact."
 * The fact (F4): nothing in Clear Glass changes a page on Tab, so the change is the site's and not yet known. The probe is
 * snapshot → Tab → snapshot → diffState; only what it shows is ever undone.
 */

/** snapshotScript() → a page expression: { html: {classes, attrs}, body: {classes, attrs}, sheets } */
function snapshotScript() {
  return `(function(){
  function part(el){ if (!el) return { classes: [], attrs: {} }; var a = {};
    for (var i = 0; i < el.attributes.length; i++) { var x = el.attributes[i]; if (x.name !== 'class') a[x.name] = x.value; }
    return { classes: Array.prototype.slice.call(el.classList), attrs: a }; }
  var sheets = Array.prototype.map.call(document.querySelectorAll('style,link[rel~="stylesheet"]'), function(s, i){
    return s.id ? '#' + s.id : (s.href || ('style:' + i + ':' + (s.textContent || '').length)); });
  return { html: part(document.documentElement), body: part(document.body), sheets: sheets }; })()`;
}

function _part(s, k) { const p = (s && s[k]) || {}; return { classes: Array.isArray(p.classes) ? p.classes : [], attrs: p.attrs && typeof p.attrs === 'object' ? p.attrs : {} }; }

/** diffState(before, after) → { classes, removed, attrs, sheets, empty } */
function diffState(before, after) {
  const out = { classes: { html: [], body: [] }, removed: { html: [], body: [] }, attrs: { html: {}, body: {} }, sheets: [], empty: true };
  for (const k of ['html', 'body']) {
    const b = _part(before, k), a = _part(after, k);
    out.classes[k] = a.classes.filter(c => !b.classes.includes(c));
    out.removed[k] = b.classes.filter(c => !a.classes.includes(c));
    for (const [n, v] of Object.entries(a.attrs)) if (b.attrs[n] !== v) out.attrs[k][n] = v;
    for (const n of Object.keys(b.attrs)) if (!(n in a.attrs)) out.attrs[k][n] = null;
  }
  const bs = Array.isArray(before && before.sheets) ? before.sheets : [], as = Array.isArray(after && after.sheets) ? after.sheets : [];
  out.sheets = as.filter(s => !bs.includes(s));
  out.empty = !out.sheets.length && ['html', 'body'].every(k => !out.classes[k].length && !out.removed[k].length && !Object.keys(out.attrs[k]).length);
  return out;
}

/** revertScript(diff, before) → a page expression that undoes the diff: added classes off, removed back on, attrs to their before values, added sheets disabled */
function revertScript(diff, before) {
  const d = diff || {}, b = { html: _part(before, 'html'), body: _part(before, 'body') };
  const plan = { html: { add: (d.removed || {}).html || [], drop: (d.classes || {}).html || [], attrs: {} }, body: { add: (d.removed || {}).body || [], drop: (d.classes || {}).body || [], attrs: {} }, sheets: d.sheets || [] };
  for (const k of ['html', 'body']) for (const n of Object.keys(((d.attrs || {})[k]) || {})) plan[k].attrs[n] = n in b[k].attrs ? b[k].attrs[n] : null;
  return `(function(p){
  function fix(el, q){ if (!el) return; q.drop.forEach(function(c){ el.classList.remove(c); }); q.add.forEach(function(c){ el.classList.add(c); });
    Object.keys(q.attrs).forEach(function(n){ if (q.attrs[n] === null) el.removeAttribute(n); else el.setAttribute(n, q.attrs[n]); }); }
  fix(document.documentElement, p.html); fix(document.body, p.body);
  Array.prototype.forEach.call(document.querySelectorAll('style,link[rel~="stylesheet"]'), function(s, i){
    var id = s.id ? '#' + s.id : (s.href || ('style:' + i + ':' + (s.textContent || '').length)); if (p.sheets.indexOf(id) >= 0) s.disabled = true; });
  return true; })(${JSON.stringify(plan)})`;
}

module.exports = { snapshotScript, diffState, revertScript };
