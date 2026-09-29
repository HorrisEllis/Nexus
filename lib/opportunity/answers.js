'use strict';
/**
 * lib/opportunity/answers.js — the answer bank: every screening question answered once, reused after.
 * comp_id: nexus.lib.opportunity.answers
 * Version: 1.0.0
 *
 * Application forms ask the same forty questions in four hundred wordings ("Are you legally authorized to work in
 * the US?", "Do you have work authorization?"). An answer James approved once is the answer; a model re-writing it
 * each time is both slower and a chance to get it wrong on a form that cannot be edited after submit.
 *
 * RULES
 *   - Only an APPROVED answer (approvedBy:'user') is used automatically. An answer a model drafted is stored as a
 *     candidate and shown in the fill report; approving the application approves the candidates it used.
 *   - Matching is deterministic: token overlap (Jaccard) on normalised questions, plus profile-derived rules for the
 *     questions every form asks (contact, links, authorization, salary, notice). No model in the match.
 *   - A match reports its source and confidence, so a low-confidence fill is visible, never silent.
 */

const crypto = require('crypto');
const { T, jaa, ledger } = require('./store');

const STOP = new Set('a an and are as at be by can do does for from have how i if in is it of on or please the this to what when where which who why will with you your yes no'.split(' '));
function norm(q) { return String(q || '').toLowerCase().replace(/\*|\(required\)|\brequired\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !STOP.has(t)); }
function similarity(a, b) {
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

// Questions every form asks, answered from the profile. [pattern on the label, profile path, note]
const PROFILE_RULES = [
  [/\b(first|given)\s*name\b/i, 'contact.firstName'], [/\b(last|family|sur)\s*name\b/i, 'contact.lastName'],
  [/^(full\s*)?name$|\byour name\b|\blegal name\b/i, 'contact.fullName'],
  [/e-?mail/i, 'contact.email'], [/phone|mobile|telephone/i, 'contact.phone'],
  [/linkedin/i, 'links.linkedin'], [/github/i, 'links.github'], [/portfolio|personal (web)?site|website/i, 'links.portfolio'],
  [/\bcity\b|current location|where (are you|do you) (based|live)|location/i, 'contact.location'],
  [/authori[sz]ed to work|work authori[sz]ation|legally (able|eligible|permitted) to work|right to work/i, 'eligibility.workAuthorization'],
  [/sponsor(ship)?/i, 'eligibility.needsSponsorship'],
  [/salary|compensation|pay expectation|expected (pay|rate)|desired (pay|rate)|rate expectation/i, 'preferences.salaryExpectation'],
  [/notice period|when can you start|start date|availability to start/i, 'preferences.availability'],
  [/years of (professional )?experience|how many years/i, 'experience.years'],
  [/pronoun/i, 'contact.pronouns'],
  [/how did you hear|where did you (hear|find|learn)/i, 'preferences.referralSource'],
];
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);

function list({ approvedOnly = false } = {}) {
  return jaa().query(T.answers, r => !approvedOnly || r.approvedBy === 'user');
}

/** add({ question, answer, by, tags }) — by:'user' is approved at once; anything else is a candidate. */
function add({ question, answer, by = 'agent', tags = [], oppId = null } = {}) {
  if (!question || answer === undefined || answer === null || String(answer).trim() === '') return { ok: false, error: 'question and answer required' };
  const existing = list().find(r => similarity(r.question, question) >= 0.9);
  if (existing) {
    // A user's answer replaces a candidate; a candidate never overwrites a user's answer.
    if (existing.approvedBy === 'user' && by !== 'user') return { ok: true, answer: existing, deduped: true };
    const patch = { answer: String(answer), updatedAt: Date.now(), ...(by === 'user' ? { approvedBy: 'user', approvedAt: Date.now() } : {}) };
    jaa().update(T.answers, { id: existing.id }, patch);
    ledger('answer.updated', { oppId, shape: 'answer', tags: [by], context: { question } });
    return { ok: true, answer: { ...existing, ...patch }, updated: true };
  }
  const row = { id: crypto.randomUUID(), question: String(question).slice(0, 500), answer: String(answer), tags, by,
    approvedBy: by === 'user' ? 'user' : null, approvedAt: by === 'user' ? Date.now() : null, uses: 0, createdAt: Date.now(), oppId };
  jaa().insert(T.answers, row);
  ledger('answer.added', { oppId, shape: 'answer', tags: [by], context: { question: row.question } });
  return { ok: true, answer: row };
}

function approve(id, by = 'user') {
  if (by !== 'user') return { ok: false, error: 'only James approves an answer for reuse' };
  const row = jaa().get(T.answers, { id });
  if (!row) return { ok: false, error: `no answer ${id}` };
  jaa().update(T.answers, { id }, { approvedBy: 'user', approvedAt: Date.now() });
  return { ok: true };
}

function remove(id) { return { ok: jaa().delete(T.answers, { id }) > 0 }; }

/**
 * answerFor(question, profile, { options }) → { answer, source, confidence, id? } | null
 * options: a select/radio's option texts — the answer is mapped onto one of them (yes/no, or best token overlap).
 */
function answerFor(question, profile = {}, { options = null, minSimilarity = 0.55 } = {}) {
  let hit = null;
  let best = null, bestSim = 0;
  for (const r of list({ approvedOnly: true })) { const s = similarity(r.question, question); if (s > bestSim) { bestSim = s; best = r; } }
  if (best && bestSim >= minSimilarity) hit = { answer: best.answer, source: 'answer-bank', confidence: bestSim >= 0.8 ? 'high' : 'medium', id: best.id, similarity: +bestSim.toFixed(2) };
  if (!hit) {
    for (const [re, path] of PROFILE_RULES) {
      if (!re.test(String(question || ''))) continue;
      let v = get(profile, path);
      if (path === 'contact.fullName' && !v) v = [get(profile, 'contact.firstName'), get(profile, 'contact.lastName')].filter(Boolean).join(' ') || null;
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
      hit = { answer: String(v), source: `profile:${path}`, confidence: 'high' };
      break;
    }
  }
  if (!hit) return null;
  if (Array.isArray(options) && options.length) {
    const opt = mapToOption(hit.answer, options);
    if (!opt) return { ...hit, unmapped: true, options };
    return { ...hit, answer: opt, mappedFrom: hit.answer };
  }
  return hit;
}

function mapToOption(answer, options) {
  const a = String(answer).trim().toLowerCase();
  const texts = options.map(o => (typeof o === 'string' ? o : (o.text || o.value || ''))).filter(Boolean);
  const exact = texts.find(t => t.trim().toLowerCase() === a);
  if (exact) return exact;
  const yn = /^(yes|y|true)\b/.test(a) ? 'yes' : /^(no|n|false)\b/.test(a) ? 'no' : null;
  if (yn) { const t = texts.find(t => new RegExp(`^\\s*${yn}\\b`, 'i').test(t)); if (t) return t; }
  let best = null, bs = 0;
  for (const t of texts) { const s = similarity(t, a); if (s > bs) { bs = s; best = t; } }
  return bs >= 0.34 ? best : null;
}

function markUsed(ids = []) {
  for (const id of ids) { const r = jaa().get(T.answers, { id }); if (r) jaa().update(T.answers, { id }, { uses: (r.uses || 0) + 1, lastUsed: Date.now() }); }
}

module.exports = { list, add, approve, remove, answerFor, mapToOption, markUsed, similarity, norm, PROFILE_RULES };
