'use strict';
/**
 * clear-glass/src/autofill/gig-takeback.js — the autofill learns from what he typed: the Scope & Pricing table, read off the page, written
 * back into the last gig (2026-11-14, TB1).
 *
 * James, 2026-11-14, on Scope & Pricing with the autofill's values wrong ($50/$160/$380, 2/5/9 days) and his own typed in ($60/$180/$420,
 * 3/7/14): "i want to be able to update the autofill from what i use instead."
 *
 *   pricingReadScript()          → page script: { basic|standard|premium: { name, description, delivery, revisions, price } } as the page shows
 *   applyPricingRead(gig, read)  → { gig, changes: [{ part, from, to }], skipped: [{ part, shown, why }] }. Pure. What the page shows unset
 *                                  ("SELECT", "DELIVERY TIME", blank) never overwrites the gig; a value it cannot read is said, never guessed.
 */

const TIERS = Object.freeze(['basic', 'standard', 'premium']);
const UNSET = /^(select|delivery time|)$/i;

function pricingReadScript() {
  return `(function () {
  function vis(e) { var r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  function norm(t) { return String(t || '').replace(/\\s+/g, ' ').trim(); }
  var leaves = Array.prototype.filter.call(document.querySelectorAll('body *'), function (e) { return e.children.length === 0 && vis(e) && !e.closest('[id^="__cg_"],[data-cg-chip-ui]'); });
  var heads = {}; ['BASIC', 'STANDARD', 'PREMIUM'].forEach(function (h) { var el = leaves.filter(function (e) { return norm(e.textContent).toUpperCase() === h; })[0]; if (el) heads[h.toLowerCase()] = el.getBoundingClientRect(); });
  if (!Object.keys(heads).length) return { error: 'no BASIC / STANDARD / PREMIUM columns on this page' };
  function colOf(el) { var r = el.getBoundingClientRect(), cx = r.left + r.width / 2; for (var h in heads) { var b = heads[h]; if (cx >= b.left - 40 && cx <= b.right + 40) return h; } return null; }
  function rowBand(label) { var l = leaves.filter(function (e) { return new RegExp('^' + label + '$', 'i').test(norm(e.textContent)); })[0]; if (!l) return null; var b = l.getBoundingClientRect(); return { top: b.top - 24, bottom: b.bottom + 24 }; }
  function inBand(el, band) { var r = el.getBoundingClientRect(), cy = r.top + r.height / 2; return band && cy >= band.top && cy <= band.bottom; }
  var out = {}; Object.keys(heads).forEach(function (t) { out[t] = {}; });
  var areas = Array.prototype.filter.call(document.querySelectorAll('textarea'), vis);
  Object.keys(heads).forEach(function (t) {
    var mine = areas.filter(function (a) { return colOf(a) === t; }).sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    if (mine[0]) out[t].name = mine[0].value; if (mine[1]) out[t].description = mine[1].value; });
  leaves.forEach(function (e) { var t = norm(e.textContent), c = colOf(e); if (c && /^\\d+\\s*days?\\s*delivery$/i.test(t)) out[c].delivery = t; });
  var rev = rowBand('Revisions'), price = rowBand('Price');
  leaves.forEach(function (e) { var c = colOf(e); if (!c) return; var t = norm(e.textContent); if (t && inBand(e, rev) && !/^revisions$/i.test(t)) out[c].revisions = t; });
  Array.prototype.filter.call(document.querySelectorAll('input'), vis).forEach(function (i) { var c = colOf(i); if (c && inBand(i, price)) out[c].price = i.value; });
  return out;
})()`;
}

function _days(s) { const m = /^\s*(\d+)\s*(days?\s*(delivery)?)?\s*$/i.exec(String(s)); return m ? Number(m[1]) : null; }
function _price(s) { const m = /^\s*\$?\s*(\d+(?:\.\d+)?)\s*$/.exec(String(s)); return m ? Number(m[1]) : null; }
function _revisions(s) { if (/unlimited/i.test(String(s))) return 'Unlimited'; const m = /^\s*(\d+)\s*$/.exec(String(s)); return m ? Number(m[1]) : null; }

function applyPricingRead(gig, read) {
  const changes = [], skipped = [];
  if (!read || read.error) return { gig, changes, skipped: [{ part: 'pricing', shown: null, why: (read && read.error) || 'nothing read' }] };
  const next = JSON.parse(JSON.stringify(gig || {}));
  next.packages = next.packages || {};
  for (const tier of TIERS) {
    const r = read[tier]; if (!r) continue;
    const p = next.packages[tier] = next.packages[tier] || {};
    const take = (part, key, shown, parse) => {
      if (shown == null || UNSET.test(String(shown).trim())) return;
      const v = parse ? parse(shown) : String(shown).trim();
      if (v === null || v === '') { skipped.push({ part: `${tier}.${part}`, shown, why: 'could not read a value' }); return; }
      if (String(p[key]) !== String(v)) { changes.push({ part: `${tier}.${part}`, from: p[key] === undefined ? null : p[key], to: v }); p[key] = v; }
    };
    take('name', 'name', r.name);
    take('description', 'description', r.description);
    take('delivery', 'deliveryDays', r.delivery, _days);
    take('revisions', 'revisions', r.revisions, _revisions);
    take('price', 'price', r.price, _price);
  }
  return { gig: next, changes, skipped };
}

module.exports = { pricingReadScript, applyPricingRead, TIERS };
