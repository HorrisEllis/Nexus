'use strict';
/**
 * clear-glass/src/autofill/gig-pages.js — which page of Fiverr's gig editor is open, and what the fill does there (0.60.222). Pure.
 *
 * James, 2026-10-28, with screenshots of Overview and Scope & Pricing: "like autofill should detect pages, so it can know when to paste, or
 * detect the actual elements. like hook into the element picker, mayne use it for correcting or creating macros/automation".
 *
 * The facts, from his screenshots: Overview shows "Suggested categories" (links "Programming & Tech > AI Development"), "Service type" (a
 * dropdown) and "Gig metadata" (tabs of checkboxes); Scope & Pricing shows "Scope & Pricing" and "Packages" with BASIC / STANDARD / PREMIUM.
 * The editor's other pages are not on record: a page this cannot place is said as unknown, never guessed. 2026-10-30 GF2: Description & FAQ,
 * Requirements and Gallery placed by their words and the address's tab= (the coder's reading, to confirm on his machine).
 *
 *   gigPage(read)          read = the driver's readPage (url, title, headings, text, links) → { page: 'overview'|'pricing'|'description'|
 *                          'requirements'|'gallery'|null, why }
 *   PARTS[page]            the gig parts each page takes, in order — the fill does these and nothing else there
 *   targetKey(page, part)  'fiverr:<page>:<part>' — where a picked element is remembered (page-memory setTarget)
 *   suggestedCategory(links, gig) → the "Category > Subcategory" link for the gig's category, by option-match (ambiguous / missing said)
 *   macroName(page)        'fiverr <page>' — his recorded choices for a page, replayed by every fill of that page (0.60.224)
 *   pageMacroSteps(steps)  a recording → steps for THIS page of any gig: no navigation (the recording's URL is another gig), each click waits
 *                          for its element first (a dropdown's options exist only once it is open), no publish/save/continue click kept
 */
const OM = require('../page/option-match');

const SIGNS = Object.freeze({
  pricing: [/scope\s*&\s*pricing/i, /\bpackages\b/i],
  overview: [/suggested categories/i, /gig metadata/i, /service type/i,
    // 0.60.283 — James, 2026-10-29, with a screenshot of a NEW gig's Overview (Gig title, SELECT A CATEGORY, Search tags): "the autofill is still
    // buggy. like i want autofill to do it all if possible." A new gig shows none of the three above until a category is picked.
    /gig title/i, /select a category/i, /search tags/i, /positive keywords/i],
  // 2026-10-30 GF2 — James: "fix the autofill to work with all fields". The editor's other pages, by their own words (the coder's reading of
  // Fiverr's editor, not his screenshots: to confirm on his machine). A page still not placed is said, never guessed.
  description: [/description\s*&\s*faq/i, /briefly describe your gig/i, /frequently asked questions/i, /\badd faq\b/i],
  requirements: [/get all the information you need from buyers/i, /add new question/i, /requirements?\b/i, /answer type/i],
  gallery: [/gig gallery/i, /showcase your services/i, /images?\s*\(up to 3\)/i, /documents?\s*\(up to 2\)/i],
});
// the editor's address names its page (?tab=…): worth two signs, as the new-gig address already was
const TAB_OF = { general: 'overview', pricing: 'pricing', description: 'description', requirements: 'requirements', gallery: 'gallery' };

const PARTS = Object.freeze({
  overview: ['title', 'category', 'tags'],   // 0.60.283: tags too (Search tags, typed one by one); 2026-10-30 GF2: the title
  pricing: ['basic.name', 'standard.name', 'premium.name', 'basic.description', 'standard.description', 'premium.description',
    'basic.delivery', 'standard.delivery', 'premium.delivery',
    // 0.60.286 GM2 — James: "do everything you can ... to get fiverr operational": revisions and price were never filled
    'basic.revisions', 'standard.revisions', 'premium.revisions', 'basic.price', 'standard.price', 'premium.price'],
  description: ['description', 'faq'],        // 2026-10-30 GF2: every FAQ is one part, filled item by item (bridge _gigList)
  requirements: ['requirement'],              // every buyer question, item by item
  gallery: [],                                // his files to add: said, never guessed
});

function gigPage(read) {
  const r = read || {};
  const hay = [r.title || '', ...(r.headings || []).map(h => (h && h.text) || h || ''), String(r.text || '').slice(0, 6000)].join('\n');
  if (!/fiverr\.com/i.test(String(r.url || '')) && !/fiverr/i.test(r.title || '')) return { page: null, why: 'not a Fiverr page' };
  const url = String(r.url || '');
  const tab = (/[?&]tab=(\w+)/i.exec(url) || [])[1];
  const score = (p) => SIGNS[p].filter(re => re.test(hay)).length
    + (TAB_OF[tab && tab.toLowerCase()] === p ? 2 : 0) + (p === 'overview' && /manage_gigs\/new/i.test(url) && !tab ? 2 : 0);
  const pr = score('pricing'), ov = score('overview');
  if (pr >= 2 && pr >= ov) return { page: 'pricing', why: 'shows Scope & Pricing and Packages' };
  // GF2: the address's tab decides first among the others; then the page's words
  const rest = ['description', 'requirements', 'gallery'].map(p => [p, score(p)]).sort((a, b) => b[1] - a[1]);
  if (rest[0][1] >= 2 && rest[0][1] > ov) return { page: rest[0][0], why: `shows the ${rest[0][0]} page's words${TAB_OF[tab] === rest[0][0] ? ' and its tab in the address' : ''}` };
  if (ov >= 2) return { page: 'overview', why: 'shows the category and gig metadata sections' };
  return { page: null, why: 'a Fiverr page this does not know yet (Overview, Scope & Pricing, Description & FAQ, Requirements, Gallery are known) — point at the fields to teach it' };
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

const macroName = (page) => `fiverr ${page}`;
// a click whose element names one of these is his to press (0.39.301: "Not automate talking or posting"), so it never enters a page macro
const HIS_BUTTONS = /\b(publish|save|continue|submit|send|pay)\b/i;

function pageMacroSteps(steps) {
  const out = [], dropped = [];
  for (const st of Array.isArray(steps) ? steps : []) {
    if (!st || !st.action) continue;
    if (st.action === 'navigate') { dropped.push('navigate (the recording was on another gig\'s address)'); continue; }
    if (st.action === 'click' && HIS_BUTTONS.test(`${(st.data && st.data.selector) || ''} ${st.label || ''}`)) { dropped.push(`click ${st.label ? `"${st.label}"` : st.data.selector} (yours to press)`); continue; }
    if (st.action === 'click' && st.data && st.data.selector) out.push({ action: 'wait_for', data: { selector: st.data.selector } });
    out.push(st);
  }
  return { steps: out, dropped };
}

// valueOf(gig, part) — what a gig part holds ('basic.delivery' → '3'); the fill and the chips read parts the same way (0.60.268)
function valueOf(gig, part) {
  if (!gig) return null;
  if (part === 'category') return gig.category ? (gig.subcategory ? `${gig.category} > ${gig.subcategory}` : gig.category) : null;
  if (part === 'tags') return Array.isArray(gig.tags) && gig.tags.length ? gig.tags.slice(0, 5).join(', ') : null;   // 0.60.283
  // 2026-10-30 GF2 — the title without the "I will" the editor shows itself; the description; the lists as a count (filled item by item)
  if (part === 'title') return gig.title ? String(gig.title).replace(/^I will\s+/i, '') : null;
  if (part === 'description') return gig.description ? String(gig.description) : null;
  if (part === 'faq') return Array.isArray(gig.faq) && gig.faq.some(f => f && f.question && f.answer) ? `${gig.faq.filter(f => f && f.question && f.answer).length} FAQ` : null;
  if (part === 'requirement') return Array.isArray(gig.requirements) && gig.requirements.some(Boolean) ? `${gig.requirements.filter(Boolean).length} question(s)` : null;
  const [tier, k] = String(part).split('.'); const p = gig.packages && gig.packages[tier]; if (!p) return null;
  const v = k === 'delivery' ? (Number.isFinite(p.deliveryDays) ? String(p.deliveryDays) : null)
    : k === 'revisions' ? (p.revisions == null || p.revisions === '' ? null : /unlimited/i.test(String(p.revisions)) ? 'Unlimited' : String(p.revisions))   // 0.60.286 GM2
    : p[k];
  return v === undefined || v === null || v === '' ? null : String(v);
}

// 0.60.283 — the Search tags box of the Overview: the text input in the section that says "Search tags" or "Positive keywords" (never the
// title), marked data-cg-tags="1" for the driver. A tag is typed and Enter pressed; tagShownScript is its gate: the section shows the tag as a
// chip and the box no longer holds it.
const TAGS_SECTION = /positive keywords|search tags/i;
function tagInputScript() {
  return `(function(){
  var re = ${TAGS_SECTION.toString()};
  function vis(el){ var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }
  var inputs = Array.prototype.filter.call(document.querySelectorAll('input:not([type]),input[type="text"],input[type="search"]'), vis);
  for (var i = 0; i < inputs.length; i++) { var el = inputs[i], up = el;
    for (var d = 0; d < 6 && up; d++, up = up.parentElement) { if (re.test(up.textContent || '')) { el.setAttribute('data-cg-tags', '1'); return { found: true, placeholder: el.placeholder || null }; } } }
  return { found: false };
})()`;
}
function tagShownScript(tag) {
  return `(function(t){
  var el = document.querySelector('[data-cg-tags="1"]'); if (!el) return false;
  var up = el; for (var d = 0; d < 6 && up && !${TAGS_SECTION.toString()}.test(up.textContent || ''); d++) up = up.parentElement;
  var text = String((up || document.body).innerText || '').toLowerCase();
  return text.indexOf(String(t).toLowerCase()) >= 0 && String(el.value || '').trim().toLowerCase() !== String(t).toLowerCase();
})(${JSON.stringify(String(tag))})`;
}

module.exports = { gigPage, PARTS, targetKey, suggestedCategory, macroName, pageMacroSteps, valueOf, tagInputScript, tagShownScript };
