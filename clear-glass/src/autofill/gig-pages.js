'use strict';
/**
 * clear-glass/src/autofill/gig-pages.js — which page of Fiverr's gig editor is open, and what the fill does there (0.60.222). Pure.
 *
 * James, 2026-10-28, with screenshots of Overview and Scope & Pricing: "like autofill should detect pages, so it can know when to paste, or
 * detect the actual elements. like hook into the element picker, mayne use it for correcting or creating macros/automation".
 *
 * The facts, from his screenshots: Overview shows "Suggested categories" (links "Programming & Tech > AI Development"), "Service type" (a
 * dropdown) and "Gig metadata" (tabs of checkboxes); Scope & Pricing shows "Scope & Pricing" and "Packages" with BASIC / STANDARD / PREMIUM.
 * The editor's other pages are not on record: a page this cannot place is said as unknown, never guessed.
 *
 *   gigPage(read)          read = the driver's readPage (url, title, headings, text, links) → { page: 'overview'|'pricing'|null, why }
 *   PARTS[page]            the gig parts each page takes, in order — the fill does these and nothing else there
 *   targetKey(page, part)  'fiverr:<page>:<part>' — where a picked element is remembered (page-memory setTarget)
 *   suggestedCategory(links, gig) → the "Category > Subcategory" link for the gig's category, by option-match (ambiguous / missing said)
 */
const OM = require('../page/option-match');

const SIGNS = Object.freeze({
  pricing: [/scope\s*&\s*pricing/i, /\bpackages\b/i],
  overview: [/suggested categories/i, /gig metadata/i, /service type/i],
});

const PARTS = Object.freeze({
  overview: ['category'],
  pricing: ['basic.name', 'standard.name', 'premium.name', 'basic.description', 'standard.description', 'premium.description',
    'basic.delivery', 'standard.delivery', 'premium.delivery'],
});

function gigPage(read) {
  const r = read || {};
  const hay = [r.title || '', ...(r.headings || []).map(h => (h && h.text) || h || ''), String(r.text || '').slice(0, 6000)].join('\n');
  if (!/fiverr\.com/i.test(String(r.url || '')) && !/fiverr/i.test(r.title || '')) return { page: null, why: 'not a Fiverr page' };
  const score = (p) => SIGNS[p].filter(re => re.test(hay)).length;
  const pr = score('pricing'), ov = score('overview');
  if (pr >= 2 && pr >= ov) return { page: 'pricing', why: 'shows Scope & Pricing and Packages' };
  if (ov >= 2) return { page: 'overview', why: 'shows the category and gig metadata sections' };
  return { page: null, why: 'a Fiverr page this does not know yet (only Overview and Scope & Pricing are on record) — point at the fields to teach it' };
}

const targetKey = (page, part) => `fiverr:${page}:${part}`;

function suggestedCategory(links, gig) {
  if (!gig || !gig.category) return { ok: false, why: 'the gig has no category' };
  const want = gig.subcategory ? `${gig.category} > ${gig.subcategory}` : gig.category;
  const cands = (Array.isArray(links) ? links : []).filter(l => l && / > /.test(l.text || ''));
  if (!cands.length) return { ok: false, why: 'no suggested categories on the page' };
  const m = OM.matchOption(cands.map(l => l.text), want);
  if (!m.ok) return { ok: false, why: `${m.why} — suggested: ${(m.candidates.length ? m.candidates : cands.map(l => l.text)).join(' | ')}` };
  return { ok: true, link: cands[m.index], text: m.option };
}

module.exports = { gigPage, PARTS, targetKey, suggestedCategory };
