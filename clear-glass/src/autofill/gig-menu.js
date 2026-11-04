'use strict';
/**
 * clear-glass/src/autofill/gig-menu.js — the gig as a fill menu: every part a row to tick, with its kind, its options and its value.
 * comp_id: nexus.clear-glass.autofill.gig-menu
 * UUID: nexus-clear-glass-autofill-gig-menu-v1-0000-2026-1029-jamesbrooks-001
 * Spec: clear-glass/spec/gated-flows.spec MOD-GM1 · Map: docs/2026-10-28-gated-flows-phasemap.spec GM1
 *
 * James, 2026-10-29, after the Press & Hold page stopped the fill: "okay the autofill still isn't working, do everything you can, invent,
 * expand, anything to get fiverr operational as a source of income. need to do better than a button, make a full menu with check boxes,
 * adn drop downs if applicable."
 *
 * Pure: no page, no Electron. The bridge (src/ipc/bridge.js _gigFill) fills the ticked keys; the screen (renderer/gig-menu.js) draws rows.
 *   menu(gig, page)    → { page, rows: [{ key, label, group, page, kind, value, options?, checked, max? }] }
 *   apply(gig, edits)  → a copy of the gig with { key: value } edits put back where each part lives
 * Option lists are what Fiverr's gig editor offers (read from the editor, 2026-10); the gig's own value is always one of them.
 */

const MODULE_ID = 'nexus.clear-glass.autofill.gig-menu';
const VERSION = '1.0.0';
const TIERS = ['basic', 'standard', 'premium'];
const DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 75, 90];
const DELIVERY = DAYS.map(d => `${d} day${d === 1 ? '' : 's'}`);
const REVISIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Unlimited'];
const CATEGORIES = Object.freeze({
  'Programming & Tech': ['Website Development', 'Software Development', 'AI Development', 'Chatbot Development', 'Desktop Applications',
    'Mobile App Development', 'Web Programming', 'Support & IT', 'QA & Review', 'Automations & Workflows', 'Data Science & ML', 'Cybersecurity'],
  'AI Services': ['AI Agents', 'AI Applications', 'AI Integrations', 'AI Chatbots', 'AI Consulting', 'AI Automation', 'Data Labeling & Annotation'],
  'Data': ['Data Entry', 'Data Processing', 'Data Scraping', 'Data Analytics', 'Data Visualization', 'Databases'],
  'Digital Marketing': ['Search Engine Optimization (SEO)', 'Social Media Marketing', 'E-Commerce Marketing', 'Marketing Strategy'],
  'Writing & Translation': ['Technical Writing', 'Articles & Blog Posts', 'Website Content', 'Proofreading & Editing', 'Translation'],
  'Graphics & Design': ['Logo Design', 'Website Design', 'App Design', 'UX Design'],
  'Video & Animation': ['Video Editing', 'Explainer Videos', 'Animation'],
  'Business': ['Virtual Assistant', 'Business Consulting', 'Project Management'],
  'Consulting': ['Software & Tech Consulting', 'AI Consulting'],
  'Music & Audio': ['Voice Over', 'Mixing & Mastering'],
  'Finance': ['Accounting & Bookkeeping'],
  'Personal Growth': ['Career Development'],
  'Photography': ['Product Photography'],
});
const PAGE_OF = { overview: 'Overview', pricing: 'Scope & Pricing', description: 'Description & FAQ', requirements: 'Requirements' };
const T = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;

function _withOwn(list, v) { const s = v == null ? '' : String(v); return s && !list.includes(s) ? [s, ...list] : list.slice(); }
function _days(n) { return Number.isFinite(Number(n)) && n !== '' && n != null ? `${Number(n)} day${Number(n) === 1 ? '' : 's'}` : ''; }
function _revs(r) { return r == null || r === '' ? '' : /unlimited/i.test(String(r)) ? 'Unlimited' : String(r); }

/** menu(gig, page) — every part of the gig as a row; ticked when it has a value and belongs on the page open in the tab */
function menu(gig, page = null) {
  if (!gig || !gig.title) return { page, rows: [], why: 'no gig yet — write one or load a .gig file' };
  const rows = [];
  const add = (r) => rows.push({ ...r, checked: r.value !== '' && r.value != null && (!page || r.page === page) });
  add({ key: 'title', label: 'Gig title', group: 'Overview', page: 'overview', kind: 'text', value: gig.title || '', max: 80 });
  const cats = Object.keys(CATEGORIES);
  add({ key: 'category', label: 'Category', group: 'Overview', page: 'overview', kind: 'choice', value: gig.category || '', options: _withOwn(cats, gig.category) });
  add({ key: 'subcategory', label: 'Subcategory', group: 'Overview', page: 'overview', kind: 'choice', value: gig.subcategory || '', options: _withOwn(CATEGORIES[gig.category] || [], gig.subcategory), free: true });
  add({ key: 'serviceType', label: 'Service type', group: 'Overview', page: 'overview', kind: 'text', value: gig.serviceType || '' });   // GT5
  // GT6 — one row: "TAB: a, b; TAB: c", as gigParts says it; an edit is read back the same way
  add({ key: 'metadata', label: 'Gig metadata (TAB: a, b; TAB: c)', group: 'Overview', page: 'overview', kind: 'text', value: Object.entries(gig.metadata || {}).map(([t, v]) => `${t}: ${v.join(', ')}`).join('; ') });
  add({ key: 'tags', label: 'Search tags (up to 5)', group: 'Overview', page: 'overview', kind: 'tags', value: (gig.tags || []).slice(0, 5).join(', ') });
  for (const t of TIERS) {
    const p = gig.packages && gig.packages[t]; if (!p) continue;
    const g = `${T(t)} package`;
    add({ key: `${t}.name`, label: 'Name', group: g, page: 'pricing', kind: 'text', value: p.name || '', max: 35 });
    add({ key: `${t}.description`, label: 'Description', group: g, page: 'pricing', kind: 'textarea', value: p.description || '', max: 100 });
    add({ key: `${t}.delivery`, label: 'Delivery time', group: g, page: 'pricing', kind: 'choice', value: _days(p.deliveryDays), options: _withOwn(DELIVERY, _days(p.deliveryDays)) });
    add({ key: `${t}.revisions`, label: 'Revisions', group: g, page: 'pricing', kind: 'choice', value: _revs(p.revisions), options: _withOwn(REVISIONS, _revs(p.revisions)) });
    add({ key: `${t}.price`, label: 'Price ($)', group: g, page: 'pricing', kind: 'number', value: p.price != null ? String(p.price) : '' });
    for (const [row, v] of Object.entries(p.features || {})) {
      add({ key: `${t}.feature.${row}`, label: row, group: g, page: 'pricing', kind: v === true || v === false ? 'check' : 'text', value: v === true || v === false ? v : String(v) });
    }
  }
  add({ key: 'description', label: 'Gig description', group: 'Description & FAQ', page: 'description', kind: 'textarea', value: gig.description || '', max: 1200 });
  (gig.faq || []).forEach((f, i) => {
    add({ key: `faq.${i}.question`, label: `FAQ ${i + 1} — question`, group: 'Description & FAQ', page: 'description', kind: 'text', value: f.question || '' });
    add({ key: `faq.${i}.answer`, label: `FAQ ${i + 1} — answer`, group: 'Description & FAQ', page: 'description', kind: 'textarea', value: f.answer || '' });
  });
  (gig.requirements || []).forEach((q, i) => add({ key: `requirement.${i}`, label: `Buyer question ${i + 1}`, group: 'Requirements', page: 'requirements', kind: 'textarea', value: q || '' }));
  return { page, pageName: page ? PAGE_OF[page] || page : null, rows };
}

/** apply(gig, edits) — the menu's edits put back into a copy of the gig, each where its part lives */
function apply(gig, edits = {}) {
  const g = JSON.parse(JSON.stringify(gig || {}));
  for (const [key, raw] of Object.entries(edits || {})) {
    const v = typeof raw === 'string' ? raw : raw;
    if (key === 'title' || key === 'category' || key === 'subcategory' || key === 'description' || key === 'serviceType') { g[key] = String(v); continue; }
    if (key === 'metadata') { const m = {}; String(v).split(';').forEach(part => { const i = part.indexOf(':'); if (i < 0) return; const t = part.slice(0, i).trim(), vals = part.slice(i + 1).split(',').map(s => s.trim()).filter(Boolean); if (t && vals.length) m[t] = vals; });
      if (Object.keys(m).length) g.metadata = m; else delete g.metadata; continue; }
    if (key === 'tags') { g.tags = String(v).split(',').map(s => s.trim()).filter(Boolean).slice(0, 5); continue; }
    let m = /^faq\.(\d+)\.(question|answer)$/.exec(key);
    if (m) { g.faq = g.faq || []; g.faq[+m[1]] = { ...(g.faq[+m[1]] || {}), [m[2]]: String(v) }; continue; }
    m = /^requirement\.(\d+)$/.exec(key);
    if (m) { g.requirements = g.requirements || []; g.requirements[+m[1]] = String(v); continue; }
    m = /^(basic|standard|premium)\.(name|description|delivery|revisions|price|feature)(?:\.(.+))?$/.exec(key);
    if (!m) continue;
    g.packages = g.packages || {}; const p = g.packages[m[1]] = g.packages[m[1]] || {};
    if (m[2] === 'name' || m[2] === 'description') p[m[2]] = String(v);
    else if (m[2] === 'delivery') { const n = parseInt(String(v), 10); if (Number.isFinite(n)) p.deliveryDays = n; }
    else if (m[2] === 'revisions') p.revisions = /unlimited/i.test(String(v)) ? 'unlimited' : parseInt(String(v), 10);
    else if (m[2] === 'price') { const n = Number(String(v).replace(/[$,\s]/g, '')); if (Number.isFinite(n)) p.price = n; }
    else if (m[2] === 'feature' && m[3]) { p.features = p.features || {}; p.features[m[3]] = v === true || v === false ? v : String(v); }
  }
  return g;
}

module.exports = { MODULE_ID, VERSION, menu, apply, DELIVERY, REVISIONS, CATEGORIES, PAGE_OF };
