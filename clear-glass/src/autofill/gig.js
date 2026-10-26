'use strict';
/**
 * clear-glass/src/autofill/gig.js — write a Fiverr gig, and fill Fiverr's gig form with it.
 * UUID: cg-autofill-gig-v1-0000-2026-1002-jamesbrooks-001
 *
 * §0.39.301 — James: "I just want it to write gigs for me. Not automate talking or posting. Just write the gigs for
 * me." · "No. I want ClearGlass to use autofill."
 *
 *   buildGigPrompt({ profile, offer, extra })   the co-pilot prompt: one gig, as JSON, from the profile's own facts
 *                                               and James's one line about what he is offering — told never to
 *                                               invent experience, clients or results the profile does not state
 *   parseGig(text)                              the co-pilot's reply → a gig held to Fiverr's limits, every cut and
 *                                               every fix reported as a warning, never silent
 *   gigText(gig)                                the whole gig as plain text, one part per block, to copy
 *   gigParts(gig)                               each part on its own (title, tags, description, packages, FAQ,
 *                                               buyer questions) — what the panel shows with a Copy button each
 *   matchGigFields(domFields, gig)              which field on the open page takes which part, evidence-graded
 *                                               like matcher.js (name/id → medium, label → medium, placeholder → low)
 *   detectGig(dom, gig, opts) / fillGig(...)    the preview and the fill, through the same dom bridge autofill uses
 *
 * Nothing here talks to anyone, posts, saves or publishes. A fill only types into fields; James reads the page and
 * presses Save or Publish on Fiverr himself. What the page does not offer as a plain field (Fiverr's own dropdowns,
 * a rich-text description box) is left alone and stays one click away to copy.
 *
 * The limits below are Fiverr's as known when this was written; Fiverr's own character counter is the judge. They
 * live in one place so a change on Fiverr's side is a one-line change here.
 */

const LIMITS = Object.freeze({
  title: 80,            // including "I will"
  description: 1200,
  tags: 5, tag: 20,
  packageName: 35, packageDescription: 100,
  minPrice: 5,
  faq: 5, faqQuestion: 150, faqAnswer: 300,
  requirements: 5, requirement: 200,
});
const TIERS = ['basic', 'standard', 'premium'];

function _clip(s, n, what, warnings) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  warnings.push(`${what} was ${t.length} characters; cut to ${n} — read it before you use it`);
  const cut = t.slice(0, n), sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s-]+$/, '');
}
function _clipBlock(s, n, what, warnings) {   // keeps line breaks (the description has paragraphs)
  const t = String(s == null ? '' : s).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length <= n) return t;
  warnings.push(`${what} was ${t.length} characters; cut to ${n} — read the end of it before you use it`);
  const cut = t.slice(0, n), stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
  return (stop > n * 0.6 ? cut.slice(0, stop + 1) : cut).trim();
}

/** buildGigPrompt({ profile, offer, extra }) → { prompt } | { error } */
// §0.59.3 — the buyer's questions are the end-state conditions of the work: what is asked here is what Idearium needs to
// build it. Each maps to a spec section (briefToSpec), so a buyer's answers become a spec without retyping.
const END_STATE_QUESTIONS = Object.freeze([
  { id: 'end_state',  ask: 'what the finished result must do or be — the end state, in the buyer\'s words',          section: 'purpose',  title: 'End state' },
  { id: 'users',      ask: 'who will use it and where (people, devices, platform)',                                   section: 'context',  title: 'Who uses it, and where' },
  { id: 'rules',      ask: 'what it must always do and must never do',                                               section: 'axioms',   title: 'Must and must never' },
  { id: 'acceptance', ask: 'how the buyer will check it is done (the test they will run or the thing they will look at)', section: 'tests', title: 'How we know it is done' },
  { id: 'materials',  ask: 'materials, examples, logins or files the seller needs',                                  section: 'materials', title: 'Materials and examples' },
]);

/**
 * briefToSpec({ gig, answers, buyer, order }) → { title, sections[] } — a buyer's answers to the gig's questions as the
 * sections of an Idearium spec (workshop form). answers: [string] in the gig's question order, or { end_state, … }.
 * Nothing is invented: an unanswered question gives an empty section that says so.
 */
function briefToSpec({ gig = {}, answers = [], buyer = '', order = '' } = {}) {
  const qs = (gig.requirements && gig.requirements.length ? gig.requirements : END_STATE_QUESTIONS.map(q => q.ask));
  const ans = Array.isArray(answers) ? answers : END_STATE_QUESTIONS.map(q => (answers || {})[q.id] || '');
  const sections = END_STATE_QUESTIONS.map((q, i) => {
    const a = String(ans[i] || '').trim();
    return { id: q.section, title: q.title, body: `Asked: ${qs[i] || q.ask}\n\n${a || '(not answered yet — ask the buyer)'}\n` };
  });
  // anything the buyer said past the five questions is kept, not dropped
  for (let i = END_STATE_QUESTIONS.length; i < ans.length; i++) if (String(ans[i] || '').trim()) sections.push({ id: `buyer_note_${i + 1}`, title: `Buyer note ${i + 1}`, body: `Asked: ${qs[i] || '—'}\n\n${String(ans[i]).trim()}\n` });
  const gigLine = gig.title ? `Gig: ${gig.title}` : '';
  sections.unshift({ id: 'order', title: 'The order', body: [gigLine, buyer && `Buyer: ${buyer}`, order && `Order: ${order}`].filter(Boolean).join('\n') + '\n' });
  const first = String(ans[0] || '').split(/[.\n]/)[0].trim().slice(0, 60);
  return { title: `${buyer ? `${buyer} — ` : ''}${first || gig.title || 'Fiverr order'}`, sections };
}

function buildGigPrompt({ profile, offer, extra = '' } = {}) {
  if (!profile || !profile.fields) return { error: 'pick an autofill profile' };
  const what = String(offer || '').trim();
  if (what.length < 8) return { error: 'say in a line what this gig offers (e.g. "simple websites for small businesses")' };
  const f = profile.fields || {}, d = profile.documents || {};
  const facts = [
    f.headline && `Headline: ${f.headline}`, f.skills && `Skills: ${f.skills}`, f.summary && `Summary: ${f.summary}`,
    f['years-experience'] && `Years of experience: ${f['years-experience']}`, f.languages && `Languages: ${f.languages}`,
    f['hourly-rate'] && `Usual rate: ${f['hourly-rate']}`, (d.portfolioUrl || f.url) && `Portfolio: ${d.portfolioUrl || f.url}`,
  ].filter(Boolean);
  const prompt = [
    'Write ONE Fiverr gig for the seller described below. Output ONLY a JSON object, no prose before or after it.',
    `What the gig offers (the seller's own words): ${what}`,
    'The JSON shape, exactly:',
    '{"title": "I will …", "category": "…", "subcategory": "…", "tags": ["…"], "description": "…",',
    ' "packages": {"basic": {"name": "…", "description": "…", "deliveryDays": 3, "revisions": 1, "price": 30},',
    '              "standard": {…same keys…}, "premium": {…same keys…}},',
    ' "faq": [{"question": "…", "answer": "…"}], "requirements": ["…"]}',
    `Rules: the title starts with "I will", at most ${LIMITS.title} characters, plain words a buyer would search for. ` +
      `At most ${LIMITS.tags} tags of at most ${LIMITS.tag} characters, lowercase, no #. ` +
      `The description at most ${LIMITS.description} characters: what the buyer gets, how it works, what makes it reliable, short paragraphs. ` +
      `Each package: a name of at most ${LIMITS.packageName} characters, a description of at most ${LIMITS.packageDescription} characters saying exactly what is delivered, ` +
      `whole days, revisions as a number, a price in US dollars (at least ${LIMITS.minPrice}); basic < standard < premium in scope and price. ` +
      `Up to ${LIMITS.faq} FAQ entries a buyer would really ask. ` +
      // §0.59.3 — James: "i was thinking to have the questions for the end state conditions in the gigs, so i can just send them to idearium and have them built."
      `Exactly ${LIMITS.requirements} questions the buyer must answer before work starts, in this order, phrased for this gig so the answers define the finished result: ` +
      END_STATE_QUESTIONS.map((q, i) => `(${i + 1}) ${q.ask}`).join(' ') + '.',
    'Use ONLY facts from "About the seller". Never invent clients, reviews, years, numbers, tools or results that are not there. ' +
      'Promise only what can be delivered within the stated days; prefer a smaller promise kept to a larger one broken.',
    extra ? `Also: ${String(extra).trim()}` : null,
    facts.length ? `About the seller:\n${facts.join('\n')}` : 'About the seller: nothing beyond the offer above — do not claim any experience at all.',
  ].filter(Boolean).join('\n\n');
  return { prompt };
}

function _json(text) {
  const t = String(text || '').replace(/```(?:json|ya?ml)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) { /* not JSON — a .gig is YAML */ } }
  // 2026-10-12 — a .gig file is YAML (gigFile / gigTemplate below); a .gig.json still loads above
  try { const y = require('js-yaml').load(t); return y && typeof y === 'object' && !Array.isArray(y) ? y : null; } catch (_) { return null; }
}
function _int(v, min, what, warnings, dflt) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < min) { warnings.push(`${what} was "${v}"; set to ${dflt}`); return dflt; }
  return n;
}

/** parseGig(text) → { ok: true, gig, warnings } | { ok: false, error } */
function parseGig(text) {
  const raw = _json(text);
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'the reply was not a gig (no JSON object in it) — try again' };
  const warnings = [];
  let title = String(raw.title || '').replace(/\s+/g, ' ').trim();
  if (!title) return { ok: false, error: 'the reply had no title — try again' };
  if (!/^i will\b/i.test(title)) { title = `I will ${title.replace(/^i\s+/i, '')}`; warnings.push('the title did not start with "I will"; added') }
  title = 'I will' + title.slice(6);
  title = _clip(title, LIMITS.title, 'the title', warnings);

  const seen = new Set();
  const tagsIn = Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',');
  const tags = [];
  for (const t of tagsIn) {
    const v = String(t || '').replace(/^#+/, '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!v || seen.has(v)) continue;
    if (v.length > LIMITS.tag) { warnings.push(`tag "${v}" is over ${LIMITS.tag} characters; left out`); continue; }
    seen.add(v); tags.push(v);
  }
  if (tags.length > LIMITS.tags) { warnings.push(`${tags.length} tags; kept the first ${LIMITS.tags}`); tags.length = LIMITS.tags; }

  const description = _clipBlock(raw.description, LIMITS.description, 'the description', warnings);
  if (!description) warnings.push('no description came back — write one before you publish');

  const pk = raw.packages || {};
  const packages = {};
  for (const tier of TIERS) {
    const p = pk[tier] || pk[tier[0].toUpperCase() + tier.slice(1)] || null;
    if (!p) { warnings.push(`no ${tier} package came back`); continue; }
    packages[tier] = {
      name: _clip(p.name || tier[0].toUpperCase() + tier.slice(1), LIMITS.packageName, `the ${tier} package name`, warnings),
      description: _clip(p.description, LIMITS.packageDescription, `the ${tier} package description`, warnings),
      deliveryDays: _int(p.deliveryDays ?? p.delivery ?? p.days, 1, `${tier} delivery days`, warnings, tier === 'basic' ? 3 : tier === 'standard' ? 5 : 7),
      revisions: /unlimited/i.test(String(p.revisions)) ? 'unlimited' : _int(p.revisions, 0, `${tier} revisions`, warnings, 1),
      price: _int(String(p.price ?? '').replace(/[^0-9.]/g, ''), LIMITS.minPrice, `${tier} price`, warnings, tier === 'basic' ? 30 : tier === 'standard' ? 60 : 120),
    };
  }
  const order = TIERS.filter(t => packages[t]);
  for (let i = 1; i < order.length; i++) if (packages[order[i]].price <= packages[order[i - 1]].price) warnings.push(`the ${order[i]} price is not above the ${order[i - 1]} price — Fiverr buyers expect it to be`);

  const faq = (Array.isArray(raw.faq) ? raw.faq : []).map(x => ({
    question: _clip(x && (x.question || x.q), LIMITS.faqQuestion, 'an FAQ question', warnings),
    answer: _clip(x && (x.answer || x.a), LIMITS.faqAnswer, 'an FAQ answer', warnings),
  })).filter(x => x.question && x.answer);
  if (faq.length > LIMITS.faq) { warnings.push(`${faq.length} FAQ entries; kept ${LIMITS.faq}`); faq.length = LIMITS.faq; }
  const requirements = (Array.isArray(raw.requirements) ? raw.requirements : []).map(r => _clip(typeof r === 'string' ? r : r && (r.question || r.text), LIMITS.requirement, 'a buyer question', warnings)).filter(Boolean);
  if (requirements.length > LIMITS.requirements) { warnings.push(`${requirements.length} buyer questions; kept ${LIMITS.requirements}`); requirements.length = LIMITS.requirements; }

  // §FD2 0.60.267 — James, 2026-10-26, Fiverr's next rows: "Service type" (a dropdown) and "Gig metadata" (groups of options:
  // PROGRAMMING LANGUAGE, FRONTEND FRAMEWORK, …): "also these bulllet points." metadata: { 'Programming language': ['JavaScript'], … }
  const metadata = {};
  if (raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)) {
    for (const [k, v] of Object.entries(raw.metadata)) {
      const vals = (Array.isArray(v) ? v : [v]).map(x => String(x == null ? '' : x).trim()).filter(Boolean).slice(0, 10);
      if (String(k).trim() && vals.length) metadata[String(k).trim().slice(0, 60)] = vals;
    }
  }
  const gig = { title, category: String(raw.category || '').trim(), subcategory: String(raw.subcategory || '').trim(), serviceType: String(raw.serviceType || raw.service_type || '').trim(),
    tags, description, packages, faq, requirements, ...(Object.keys(metadata).length ? { metadata } : {}) };
  return { ok: true, gig, warnings };
}

/** gigParts(gig) → [{ key, label, text }] — each part on its own, in the order Fiverr's editor asks for them. */
function gigParts(gig) {
  if (!gig) return [];
  const out = [{ key: 'title', label: 'Gig title', text: gig.title }];
  if (gig.category) out.push({ key: 'category', label: 'Category', text: gig.subcategory ? `${gig.category} › ${gig.subcategory}` : gig.category });
  if (gig.serviceType) out.push({ key: 'serviceType', label: 'Service type', text: gig.serviceType });   // §FD2
  for (const [g, v] of Object.entries(gig.metadata || {})) out.push({ key: `metadata.${g}`, label: g, text: v.join(', ') });
  if (gig.tags && gig.tags.length) out.push({ key: 'tags', label: 'Search tags', text: gig.tags.join(', ') });
  for (const t of TIERS) {
    const p = gig.packages && gig.packages[t];
    if (!p) continue;
    out.push({ key: `${t}.name`, label: `${t[0].toUpperCase() + t.slice(1)} — name`, text: p.name });
    out.push({ key: `${t}.description`, label: `${t[0].toUpperCase() + t.slice(1)} — description`, text: p.description });
    out.push({ key: `${t}.terms`, label: `${t[0].toUpperCase() + t.slice(1)} — delivery, revisions, price`, text: `${p.deliveryDays} day${p.deliveryDays === 1 ? '' : 's'} · ${p.revisions === 'unlimited' ? 'unlimited' : p.revisions} revision${p.revisions === 1 ? '' : 's'} · $${p.price}` });
  }
  if (gig.description) out.push({ key: 'description', label: 'Description', text: gig.description });
  (gig.faq || []).forEach((x, i) => { out.push({ key: `faq.${i}.question`, label: `FAQ ${i + 1} — question`, text: x.question }); out.push({ key: `faq.${i}.answer`, label: `FAQ ${i + 1} — answer`, text: x.answer }); });
  (gig.requirements || []).forEach((r, i) => out.push({ key: `requirement.${i}`, label: `Buyer question ${i + 1}`, text: r }));
  return out;
}

/** gigText(gig) → the whole gig as plain text, to copy in one go. */
function gigText(gig) {
  return gigParts(gig).map(p => `${p.label.toUpperCase()}\n${p.text}`).join('\n\n');
}

// Which field takes which part. Checked against the field's name, id, visible label, aria-label and placeholder —
// the same facts dom_query already returns (src/dom/archaeology.js buildMeta). Order matters: the specific before
// the general ("package description" before "description").
const GIG_PATTERNS = [
  { part: 'title',              re: /gig[-_ ]?title|^\s*title\s*$|^i will\b|do something i'?m really good at/i },
  { part: 'tags',               re: /search[-_ ]?tags?|^\s*tags?\s*$|positive[-_ ]?keywords|keywords/i },
  { part: 'package.name',       re: /package[-_ ]?(name|title)|name[-_ ]?your[-_ ]?package/i },
  { part: 'package.description',re: /package[-_ ]?desc|describe[-_ ]?the[-_ ]?details|details[-_ ]?of[-_ ]?your[-_ ]?offering/i },
  { part: 'package.price',      re: /\bprice\b|package[-_ ]?price/i },
  { part: 'faq.question',       re: /add[-_ ]?a?[-_ ]?question|faq[-_ ]?question|^\s*question\s*$/i },
  { part: 'faq.answer',         re: /add[-_ ]?an?[-_ ]?answer|faq[-_ ]?answer|^\s*answer\s*$/i },
  { part: 'requirement',        re: /requirement|write[-_ ]?your[-_ ]?question[-_ ]?here|what[-_ ]?do[-_ ]?you[-_ ]?need[-_ ]?from[-_ ]?the[-_ ]?buyer/i },
  { part: 'description',        re: /description|briefly[-_ ]?describe[-_ ]?your[-_ ]?gig|about[-_ ]?this[-_ ]?gig/i },
];
function _gigPart(text) {
  if (!text) return null;
  const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
  for (const { part, re } of GIG_PATTERNS) if (re.test(t)) return part;
  return null;
}

/**
 * matchGigFields(domFields, gig) → [{ cgId, part, key, value, confidence, source }]
 * Repeated fields (three package names, several FAQ questions) are taken in page order: first → basic / FAQ 1, and
 * so on. A field whose purpose is clear but the gig has nothing for it is left out — nothing to fill, not a failure.
 */
function matchGigFields(domFields, gig) {
  if (!Array.isArray(domFields)) throw new Error('matchGigFields: domFields must be the dom_query array');
  if (!gig || !gig.title) throw new Error('matchGigFields: a parsed gig is required');
  const used = {}, out = [];
  for (const field of domFields) {
    if (!field || !field.id) continue;
    const tag = String(field.tag || '').toLowerCase();
    if (!['input', 'textarea'].includes(tag)) continue;   // Fiverr's dropdowns are its own widgets — copied, not filled
    const type = String(field.type || '').toLowerCase();
    if (['submit', 'button', 'hidden', 'checkbox', 'radio', 'file', 'image', 'reset', 'search'].includes(type)) continue;
    let part = null, confidence = null, source = null;
    for (const [src, text, conf] of [['name', field.name, 'medium'], ['id', field.attrs && (field.attrs.id || field.id_attr), 'medium'],
      ['label', field.label, 'medium'], ['label', field.attrs && field.attrs['aria-label'], 'medium'], ['context', field.context, 'medium'],   // §FQ4 the row's heading
      ['placeholder', field.attrs && field.attrs.placeholder, 'low']]) {
      const p = _gigPart(text);
      if (p) { part = p; source = src; confidence = conf; break; }
    }
    if (!part) continue;
    const n = used[part] = (used[part] || 0) + 1, i = n - 1;
    let key = part, value;
    if (part === 'title') value = n === 1 ? gig.title.replace(/^I will\s+/, '') : undefined;   // the editor shows "I will" itself
    else if (part === 'tags') value = n === 1 ? gig.tags.join(', ') : undefined;
    else if (part === 'description') value = n === 1 ? gig.description : undefined;
    else if (part.startsWith('package.')) {
      const tier = TIERS[i], p = tier && gig.packages[tier], k = part.split('.')[1];
      key = tier ? `${tier}.${k}` : part;
      value = p ? (k === 'price' ? String(p.price) : p[k]) : undefined;
    } else if (part === 'faq.question' || part === 'faq.answer') {
      const x = gig.faq[i]; key = `faq.${i}.${part.split('.')[1]}`; value = x ? x[part.split('.')[1]] : undefined;
    } else if (part === 'requirement') { key = `requirement.${i}`; value = gig.requirements[i]; }
    if (value === undefined || value === null || value === '') continue;
    if (part === 'title' && tag === 'input' && String(value).length > LIMITS.title) continue;
    out.push({ cgId: field.id, part, key, value: String(value), confidence, source });
  }
  return out;
}

const RANK = { high: 3, medium: 2, low: 1 };

/** detectGig(dom, gig, { agentId }) — what would be filled where; nothing is typed. */
async function detectGig(dom, gig, { agentId = 'default' } = {}) {
  const domFields = await (dom.queryFields ? dom.queryFields({ agentId, selector: 'input, textarea' }) : dom.handleQuery({ agentId, selector: 'input, textarea' }));   // §FQ1 0.60.262
  if (!Array.isArray(domFields)) return { error: (domFields && domFields.error) || 'the page did not list its fields' };
  if (domFields && domFields.error) return { error: domFields.error };
  const matches = matchGigFields(domFields, gig);
  const filledKeys = new Set(matches.map(m => m.key));
  return { totalFields: domFields.length, matches, leftToCopy: gigParts(gig).filter(p => !filledKeys.has(p.key)).map(p => p.key) };
}

/** fillGig(dom, gig, { agentId, minConfidence }) — types the matched parts in. Never saves, never publishes. */
async function fillGig(dom, gig, { agentId = 'default', minConfidence = 'medium' } = {}) {
  const domFields = await (dom.queryFields ? dom.queryFields({ agentId, selector: 'input, textarea' }) : dom.handleQuery({ agentId, selector: 'input, textarea' }));   // §FQ1 0.60.262
  if (!Array.isArray(domFields)) return { error: (domFields && domFields.error) || 'the page did not list its fields' };
  if (domFields && domFields.error) return { error: domFields.error };
  const floor = RANK[minConfidence] || RANK.medium;
  const all = matchGigFields(domFields, gig);
  const toFill = all.filter(m => RANK[m.confidence] >= floor);
  const skipped = all.filter(m => !toFill.includes(m)).map(m => ({ key: m.key, confidence: m.confidence, reason: 'below minConfidence' }));
  const filled = [], failed = [];
  for (const m of toFill) {
    try {
      const r = await dom.handleMutate({ agentId, cgId: m.cgId, mutation: { value: m.value } });
      if (r && r.error) failed.push({ key: m.key, error: r.error }); else filled.push({ key: m.key, confidence: m.confidence, source: m.source });
    } catch (err) { failed.push({ key: m.key, error: err.message }); }
  }
  // §FD1 0.60.266 — the category and subcategory dropdowns (Fiverr's own widgets, not <select>s): opened and chosen in the page
  let selects = null;
  if (gig.category || gig.serviceType || gig.metadata) {
    try { selects = await fillGigSelects(dom, gig, { agentId }); } catch (err) { selects = { error: err.message }; }
    for (const x of (selects && selects.results) || []) {
      if (x.chose) filled.push({ key: x.key, confidence: x.exact ? 'high' : 'medium', source: 'dropdown', chose: x.chose });
      else failed.push({ key: x.key, error: x.why || 'not chosen', ...(x.options ? { options: x.options } : {}) });
    }
  }
  const done = new Set(filled.map(f => f.key));
  // the category part is one key (category › subcategory): done when the category was chosen
  if (done.has('category.main')) done.add('category');
  return { totalFields: domFields.length, filled, skipped, failed, leftToCopy: gigParts(gig).filter(p => !done.has(p.key)).map(p => p.key), ...(selects && selects.error ? { selectsError: selects.error } : {}) };
}

// §FD1 0.60.266 — James, 2026-10-26: "can you fix the drop down mewnu?" (Fiverr's Category / Subcategory, left "to copy by hand").
// They are custom widgets: a box reading "SELECT A CATEGORY" that opens a list on mouse down. This runs in the page: find the box by
// its words (category, then subcategory, which only enables after), open it as a mouse would (pointer/mouse down, up, click), wait
// for the list, choose the option whose words match the gig's (exact first, then the closest by shared words), and say the options
// when none fits. A native <select> is set by its option text with input/change. Never saves or publishes.
const SELECT_SCRIPT = `async (want, meta) => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const press = (el) => { for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); };
  const words = (s) => new Set(norm(s).split(' ').filter(w => w.length > 2 && w !== 'and'));
  const best = (opts, v) => {
    const nv = norm(v); let top = null, score = 0;
    for (const o of opts) { const no = norm(o.innerText);
      if (no === nv) return { el: o, exact: true };
      const a = words(v), b = words(o.innerText); let k = 0; for (const w of a) if (b.has(w)) k++;
      const sc = k / Math.max(a.size, 1) + (no.includes(nv) || nv.includes(no) ? 0.5 : 0);
      if (sc > score) { score = sc; top = o; } }
    return score >= 0.5 ? { el: top, exact: false } : null;
  };
  const findBox = (what) => {
    const native = [...document.querySelectorAll('select')].filter(vis).find(s => new RegExp(what, 'i').test((s.name || '') + ' ' + (s.id || '') + ' ' + (s.options[0] ? s.options[0].text : '')));
    if (native) return native;
    const cands = [...document.querySelectorAll('[role="combobox"],[aria-haspopup],[class*="select" i],[class*="dropdown" i],button,div')]
      .filter(vis).filter(e => { const t = (e.innerText || '').trim(); if (!t.length || t.length > 50) return false; const nt = norm(t); return ['select a ', 'select ', 'choose a ', 'choose '].some(p => nt === p + what); });   // no regex escapes: this lives in a template literal
    return cands.sort((a, b) => a.innerText.length - b.innerText.length || b.querySelectorAll('*').length - a.querySelectorAll('*').length).pop() || null;
  };
  const results = [];
  for (const w of want) {
    if (!w.value) continue;
    const box = findBox(w.what);
    if (!box) { results.push({ key: w.key, why: 'no ' + w.what + ' dropdown found on this page' }); continue; }
    if (box.tagName === 'SELECT') {
      const o = best([...box.options].map(x => ({ innerText: x.text, opt: x })), w.value);
      if (!o) { results.push({ key: w.key, why: 'no option matches "' + w.value + '"', options: [...box.options].map(x => x.text).slice(0, 40) }); continue; }
      const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value'); d.set.call(box, o.el.opt.value);
      box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true }));
      results.push({ key: w.key, chose: o.el.innerText, exact: o.exact }); await sleep(400); continue;
    }
    const before = new Set([...document.querySelectorAll('[role="option"],li,[class*="option" i]')]);
    press(box); await sleep(500);
    let opts = [...document.querySelectorAll('[role="option"],li,[class*="option" i]')].filter(vis).filter(o => { const t = (o.innerText || '').trim(); return t && t.length < 80 && !o.querySelector('[role="option"],li'); });
    const fresh = opts.filter(o => !before.has(o)); if (fresh.length) opts = fresh;
    if (!opts.length) { results.push({ key: w.key, why: 'the ' + w.what + ' list did not open' }); continue; }
    const o = best(opts, w.value);
    if (!o) { results.push({ key: w.key, why: 'no option matches "' + w.value + '"', options: opts.map(x => x.innerText.trim()).slice(0, 40) }); press(box); await sleep(200); continue; }
    o.el.scrollIntoView({ block: 'nearest' }); press(o.el); await sleep(700);
    results.push({ key: w.key, chose: o.el.innerText.trim(), exact: o.exact });
  }
  // §FD2 0.60.267 — the gig's metadata: each group (a tab or heading reading its name, e.g. "PROGRAMMING LANGUAGE") is opened, then
  // each wanted option is ticked by its own words (its <label>, or the text beside a radio / checkbox / option). One already ticked is
  // left as it is. A group or option the page does not have is said, with what it does have.
  for (const [group, vals] of Object.entries(meta || {})) {
    const ng = norm(group);
    const tab = [...document.querySelectorAll('li,a,button,div,span,h3,h4,label,[role="tab"]')].filter(vis)
      .filter(e => norm(e.innerText).replace(/ *$/, '') === ng || norm(e.innerText) === ng + ' ')
      .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    if (tab) { press(tab); await sleep(400); }
    const boxes = [...document.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],[role="option"]')];
    const textOf = (b) => { const l = b.labels && b.labels[0]; if (l) return l.innerText; const p = b.closest('label') || b.parentElement; return p ? p.innerText : (b.innerText || ''); };
    for (const v of vals) {
      const nv = norm(v);
      const hit = boxes.find(b => vis(b.closest('label') || b.parentElement || b) && norm(textOf(b)) === nv);
      if (!hit) { results.push({ key: 'metadata.' + group, why: (tab ? '' : 'no "' + group + '" group found; ') + 'no option "' + v + '"', options: [...new Set(boxes.filter(b => vis(b.closest('label') || b.parentElement || b)).map(b => textOf(b).trim()).filter(t => t && t.length < 40))].slice(0, 40) }); continue; }
      const on = hit.checked === true || hit.getAttribute('aria-checked') === 'true' || hit.getAttribute('aria-selected') === 'true';
      if (!on) { const target = hit.labels && hit.labels[0] ? hit.labels[0] : (hit.tagName === 'INPUT' ? hit : hit); target.click(); await sleep(200); }
      results.push({ key: 'metadata.' + group, chose: v, exact: true, already: on });
    }
  }
  return { results };
}`;

/** fillGigSelects(dom, gig, { agentId }) → { results: [{ key, chose?, exact?, why?, options? }] } */
async function fillGigSelects(dom, gig, { agentId = 'default' } = {}) {
  const wc = dom && dom._getWebContents ? dom._getWebContents(agentId) : null;
  if (!wc) return { error: 'no tab for the dropdowns' };
  const want = [{ key: 'category.main', what: 'category', value: gig.category }, { key: 'category.sub', what: 'subcategory', value: gig.subcategory },
    { key: 'serviceType', what: 'service type', value: gig.serviceType }];   // §FD2
  return wc.executeJavaScript(`(${SELECT_SCRIPT})(${JSON.stringify(want)}, ${JSON.stringify(gig.metadata || {})})`, true);
}

// ── .gig files (YAML) ─────────────────────────────────────────────────────────
// 2026-10-12 — James: "make a template with a download button in the settings for the fiverr, next to download gig
// file. maybe you could use a yaml file with a real .gig extension." A .gig is YAML a person can read and edit, with the
// limits written beside each field; parseGig reads it (and a .gig.json) and holds it to the same limits as a written gig.
const GIG_FORMAT = 'clearglass.gig/1';

function _slug(title) {
  return String(title || 'gig').toLowerCase().replace(/^i will\s+/, '').replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-+|-+$/g, '') || 'gig';
}

/** gigFile(gig) → { text, filename } — the gig as a .gig YAML file */
function gigFile(gig = {}) {
  const yaml = require('js-yaml');
  const body = yaml.dump({ format: GIG_FORMAT, platform: 'fiverr', ...gig }, { lineWidth: 100, noRefs: true, quotingType: '"' });
  return { text: `# Clear Glass gig file (${GIG_FORMAT}) — load it in Settings → Autofill → Gig, or in the gig panel.\n${body}`, filename: `${_slug(gig.title)}.gig` };
}

/** gigFilename(name) → the name ending in .gig, never .gig.json or .yaml (§AT4 0.60.256, James: "fix it so its .gig not .gig.json") */
function gigFilename(name) {
  const base = String(name || 'gig').replace(/[\\/:*?"<>|]+/g, '-').replace(/(\.(json|ya?ml|txt|gig))+$/i, '') || 'gig';
  return `${base}.gig`;
}

/** gigTemplate() → { text, filename } — an empty .gig with every field, its limit and what it is for */
function gigTemplate() {
  const L = LIMITS;
  const q = END_STATE_QUESTIONS.map(x => { const a = x.ask.replace(/"/g, "'"); return `  - "${a[0].toUpperCase()}${a.slice(1)}?"`; }).join('\n');
  const pkg = (tier, days, rev, price) => [
    `  ${tier}:`,
    `    name: ""            # at most ${L.packageName} characters`,
    `    description: ""     # at most ${L.packageDescription} characters — exactly what is delivered`,
    `    deliveryDays: ${days}`,
    `    revisions: ${rev}`,
    `    price: ${price}            # US dollars, at least ${L.minPrice}; basic < standard < premium`,
  ].join('\n');
  const text = [
    `# Clear Glass gig file (${GIG_FORMAT}) — a template. Fill it in, then load it: Settings → Autofill → Gig → "Load a gig file…".`,
    '# Every limit below is checked when it loads (Fiverr\'s own counter is the judge). Only write what is true about you.',
    `format: ${GIG_FORMAT}`,
    'platform: fiverr',
    `title: "I will "        # starts with "I will", at most ${L.title} characters, the words a buyer would search for`,
    'category: ""',
    'subcategory: ""',
    '# Service type: the dropdown under Category (Fiverr\'s exact words), e.g. "AI Agents"',
    'serviceType: ""',
    '# Gig metadata: each group as Fiverr names it, with the options to tick (its exact words)',
    'metadata:',
    '  Programming language: [""]',
    `tags: []                # at most ${L.tags} tags, each at most ${L.tag} characters, lowercase, no #`,
    `description: |          # at most ${L.description} characters: what the buyer gets, how it works, why it is reliable`,
    '  Write the description here. Keep the two-space indent on every line.',
    'packages:',
    pkg('basic', 2, 1, 30), pkg('standard', 4, 2, 90), pkg('premium', 7, 3, 250),
    `faq:                    # up to ${L.faq}: questions a buyer would really ask`,
    '  - question: ""',
    '    answer: ""',
    `requirements:           # ${L.requirements} questions the buyer answers before work starts — their answers are the end state Idearium builds to`,
    q,
    '',
  ].join('\n');
  return { text, filename: 'gig-template.gig' };
}

module.exports = { fillGigSelects, SELECT_SCRIPT, GIG_FORMAT, gigFile, gigFilename, gigTemplate, END_STATE_QUESTIONS, briefToSpec, LIMITS, TIERS, GIG_PATTERNS, buildGigPrompt, parseGig, gigParts, gigText, matchGigFields, detectGig, fillGig };
