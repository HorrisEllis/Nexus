'use strict';
/**
 * clear-glass/src/autofill/suggest.js — what can go in every field on the page, for the chip under each input (0.60.267, AF3).
 * Map: docs/2026-10-26-inline-autofill-ui-phasemap.spec AF3 (and its 2026-10-28 addendum).
 *
 * James, 2026-10-26: "need to have a autofill ui for relevant pages. like firefox has, like a autofill button where it shows under the input" ·
 * 2026-10-28: "needs to autofill any field it can. also needs to have the autopill under each input fieled."
 *
 * Pure. Built on what exists: the profile matches come from matcher.detectFields (the active profile, the site's choice, the learned map),
 * the gig matches from gig.matchGigFields (the gig written in the panel). Every confidence is offered — the chip is a suggestion he clicks,
 * not a fill — and each says where it came from.
 *
 *   combine({ profileMatches, gigMatches, profileName }) → [{ cgId, options: [{ value, label, source, confidence }] }]  best first
 *   reporterScript(ids) → the page-side script: it reports WHERE the suggested fields are (never a value: values stay in Clear Glass's own
 *                         window until he clicks), and says when the page's set of fields changes, so the chips follow Fiverr's steps
 */
const RANK = { high: 3, medium: 2, low: 1 };
const short = (v) => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return s.length > 60 ? s.slice(0, 57) + '…' : s; };

function combine({ profileMatches = [], gigMatches = [], profileName = 'profile' } = {}) {
  const by = new Map();
  const add = (cgId, opt) => {
    if (!cgId || opt.value === undefined || opt.value === null || String(opt.value) === '') return;
    const e = by.get(cgId) || { cgId, options: [] };
    if (!e.options.some(o => o.value === String(opt.value))) e.options.push({ ...opt, value: String(opt.value), preview: short(opt.value) });
    by.set(cgId, e);
  };
  for (const m of Array.isArray(profileMatches) ? profileMatches : []) {
    if (m.needsEdit) continue;   // a template with {{placeholders}} still to fill is not offered as it stands
    add(m.cgId, { value: m.value, label: `${m.fieldType} · ${profileName}`, source: 'profile', confidence: m.confidence || 'low', ...(m.dropdown ? { dropdown: true } : {}) });
  }
  for (const m of Array.isArray(gigMatches) ? gigMatches : []) add(m.cgId, { value: m.value, label: `gig · ${m.key}`, source: 'gig', confidence: m.confidence || 'low', ...(m.dropdown ? { dropdown: true } : {}) });
  const out = [...by.values()];
  for (const e of out) e.options.sort((a, b) => (RANK[b.confidence] || 0) - (RANK[a.confidence] || 0));
  return out;
}

function reporterScript(ids) {
  return `(function (ids) {
  window.__cgChipIds = ids;
  if (!window.__cgChipRep) {
    window.__cgChipRep = true;
    var raf = 0, lastN = -1;
    var send = function () {
      raf = 0;
      var want = window.__cgChipIds || [], out = [];
      var all = document.querySelectorAll('input, textarea, select, [contenteditable="true"], [data-cg-dd]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!el.__cgId || want.indexOf(el.__cgId) < 0) continue;
        var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.bottom < 0 || r.top > innerHeight) continue;
        var dd = el.hasAttribute('data-cg-dd');   // AF6: a dropdown that is not a form field — what it shows is its text
        var v = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : (dd || el.isContentEditable) ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : String(el.value == null ? '' : el.value);
        out.push({ cgId: el.__cgId, x: r.left, y: r.bottom, w: r.width, v: v, focus: document.activeElement === el || el.contains(document.activeElement), dd: dd });
      }
      if (window.__cg) window.__cg.send('autofill:rects', out);
      var n = document.querySelectorAll('input, textarea, select').length;
      if (lastN >= 0 && n !== lastN && window.__cg) window.__cg.send('autofill:stale', { n: n });
      lastN = n;
    };
    var q = function () { if (!raf) raf = requestAnimationFrame(send); };
    window.__cgChipQ = q;
    addEventListener('scroll', q, true); addEventListener('resize', q); addEventListener('focusin', q, true); addEventListener('input', q, true);
    try { new MutationObserver(q).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    setInterval(q, 1500);
  }
  window.__cgChipQ();
  return true;
})(${JSON.stringify(Array.isArray(ids) ? ids : [])})`;
}

// 2026-10-30 AF6 — James: "when it shows the black autfill chip, can you make that work for drop down also?" A dropdown that is not a form field
// (Fiverr's SELECT A CATEGORY, DELIVERY TIME, Revisions; any [role=combobox] / [aria-haspopup=listbox]) is found and marked data-cg-dd=<what it
// is>, so the chip can sit under it and the driver can choose in it. → [{ key, kind: 'gig' | 'combo', label?, name? }]. Marks only; reads only.
function dropdownScript() {
  return `(function () {
  function vis(e) { var r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  function norm(t) { return String(t || '').replace(/\\s+/g, ' ').trim(); }
  document.querySelectorAll('[data-cg-dd]').forEach(function (e) { e.removeAttribute('data-cg-dd'); });
  var leaves = Array.prototype.filter.call(document.querySelectorAll('body *'), function (e) { return e.children.length === 0 && vis(e); });
  var heads = {}; ['BASIC', 'STANDARD', 'PREMIUM'].forEach(function (h) { var el = leaves.filter(function (e) { return norm(e.textContent).toUpperCase() === h; })[0]; if (el) heads[h] = el.getBoundingClientRect(); });
  function colOf(el) { var r = el.getBoundingClientRect(), cx = r.left + r.width / 2; for (var h in heads) { var b = heads[h]; if (cx >= b.left - 40 && cx <= b.right + 40) return h; } return null; }
  function rowOf(el) { var r = el.getBoundingClientRect(), cy = r.top + r.height / 2, best = null;
    leaves.forEach(function (e) { var b = e.getBoundingClientRect(); var t = norm(e.textContent); if (b.right <= r.left + 2 && cy >= b.top - 6 && cy <= b.bottom + 6 && t && t.length < 40 && (!best || b.right > best.r)) best = { t: t, r: b.right }; });
    return best && best.t; }
  var out = [], n = 0;
  var mark = function (el, key, extra) { var trig = el.closest('[role=combobox],[aria-haspopup],button,[tabindex]') || el; if (trig.hasAttribute('data-cg-dd')) return; trig.setAttribute('data-cg-dd', key); out.push(Object.assign({ key: key }, extra)); };
  leaves.forEach(function (e) { var t = norm(e.textContent).toUpperCase();
    if (t === 'SELECT A CATEGORY') mark(e, 'category', { kind: 'gig' });
    else if (t === 'SELECT A SUBCATEGORY') mark(e, 'subcategory', { kind: 'gig' });
    else if (t === 'DELIVERY TIME') { var c = colOf(e); if (c) mark(e, c.toLowerCase() + '.delivery', { kind: 'gig' }); } });
  document.querySelectorAll('[role=combobox],[aria-haspopup=listbox]').forEach(function (e) {
    if (!vis(e) || e.hasAttribute('data-cg-dd') || /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName)) return;
    var row = rowOf(e), col = colOf(e);
    if (col && row && /revision/i.test(row)) { mark(e, col.toLowerCase() + '.revisions', { kind: 'gig' }); return; }
    var lb = e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'));
    mark(e, 'combo-' + (++n), { kind: 'combo', label: norm(e.getAttribute('aria-label') || (lb && lb.textContent) || row || ''), name: e.getAttribute('name') || e.id || '' });
  });
  return out;
})()`;
}

module.exports = { combine, reporterScript, dropdownScript };
