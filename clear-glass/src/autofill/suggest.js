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
    add(m.cgId, { value: m.value, label: `${m.fieldType} · ${profileName}`, source: 'profile', confidence: m.confidence || 'low' });
  }
  for (const m of Array.isArray(gigMatches) ? gigMatches : []) add(m.cgId, { value: m.value, label: `gig · ${m.key}`, source: 'gig', confidence: m.confidence || 'low' });
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
      var all = document.querySelectorAll('input, textarea, select, [contenteditable="true"]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!el.__cgId || want.indexOf(el.__cgId) < 0) continue;
        var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.bottom < 0 || r.top > innerHeight) continue;
        out.push({ cgId: el.__cgId, x: r.left, y: r.bottom, w: r.width, v: el.isContentEditable ? (el.textContent || '') : String(el.value == null ? '' : el.value), focus: document.activeElement === el });
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

module.exports = { combine, reporterScript };
