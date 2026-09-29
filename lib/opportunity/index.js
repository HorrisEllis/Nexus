'use strict';
/**
 * lib/opportunity/index.js — the job / freelance / lead pipeline. One module, one CLI, one HTTP surface, one tool.
 * comp_id: nexus.lib.opportunity
 * UUID: nexus-lib-opportunity-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "do anything you can to help me automate job applications, fiverr, etc. expand it as much as possible."
 *
 * WHAT IT DOES
 *   profile   who James is on paper and what he wants (skills, roles, floor, remote, sources, per-platform policy)
 *   cycle     fetch every enabled source → normalise → dedupe → score → shortlist → draft the top N → report
 *   capture   the job/gig/Fiverr message on the page Clear Glass has open → into the pipeline, scored
 *   draft     cover letter / proposal / Fiverr reply / screening answer / follow-up / gig copy, from editable templates
 *   approve   James's gate (user-only). Submitting (James) adopts the answers the agent drafted into the answer bank
 *   prepare   Clear Glass opens the application and fills it (autofill + answer bank + drafts + resume upload); stops
 *   submit    presses submit — James, or the agent when policy says auto (and the platform's terms are acknowledged)
 *   followups submitted, no response after N days → FOLLOW_UP_DUE with a drafted follow-up
 *   status    counts per stage and what is waiting on James (copilot's L8 layer reads this)
 *
 * Everything is ledgered (opportunity_ledger); every refusal names its rule. Components below are pure where they can
 * be (stages, score, sources.normalize*, answers.similarity, apply.planFill, draft.render) and tested in isolation.
 */

const crypto = require('crypto');
const { T, jaa, ledger, ledgerFor } = require('./store');
const stages = require('./stages');
const scoring = require('./score');
const sources = require('./sources');
const answers = require('./answers');
const drafting = require('./draft');
const apply = require('./apply');

const MODULE_ID = 'nexus.lib.opportunity';
const VERSION = '1.0.0';

// ── profile ─────────────────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_PROFILE = Object.freeze({
  id: 'default',
  contact: { firstName: '', lastName: '', fullName: '', email: '', phone: '', location: '', pronouns: '' },
  links: { linkedin: '', github: '', portfolio: '' },
  headline: '', summary: '', resumeText: '', resumePath: '', coverLetterPath: '',
  skills: [], roles: [], mustHave: [], avoid: [], excludeCompanies: [], locations: [],
  remoteOnly: false, minSalary: 0, maxAgeDays: 30, kinds: [],
  eligibility: { workAuthorization: null, needsSponsorship: null },
  preferences: { salaryExpectation: '', availability: '', referralSource: '' },
  experience: { years: null },
  autofillProfileId: null, autoConsent: false, partition: 'persist:opportunity',
  shortlistAbove: scoring.DEFAULTS.shortlistAbove, draftTop: 3, followUpDays: 7, draftBackend: '',
  voice: '',
  sources: [
    { type: 'remotive', enabled: true },
    { type: 'remoteok', enabled: true },
    { type: 'arbeitnow', enabled: false },
    { type: 'hn', enabled: false },
    { type: 'rss', url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss', name: 'weworkremotely', enabled: false },
  ],
  policy: { default: { mode: 'approve' } },
  schedule: { everyMinutes: 0 },
});

function getProfile(id = 'default') {
  const row = jaa().get(T.profile, { id });
  return _merge(DEFAULT_PROFILE, row || {});
}
function _merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = _merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}
const ARRAY_KEYS = ['skills', 'roles', 'mustHave', 'avoid', 'excludeCompanies', 'locations', 'kinds'];
function setProfile(patch = {}, id = 'default') {
  const errors = [];
  for (const k of ARRAY_KEYS) if (patch[k] !== undefined) {
    if (typeof patch[k] === 'string') patch[k] = patch[k].split(',').map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(patch[k])) errors.push(`${k} must be a list`);
  }
  if (patch.sources !== undefined) {
    if (!Array.isArray(patch.sources)) errors.push('sources must be a list of { type, ... }');
    else for (const s of patch.sources) if (!s || !sources.TYPES[s.type]) errors.push(`unknown source type "${s && s.type}" — one of: ${Object.keys(sources.TYPES).join(', ')}`);
  }
  if (patch.policy) for (const [k, p] of Object.entries(patch.policy)) if (p && p.mode && !['manual', 'approve', 'auto'].includes(p.mode)) errors.push(`policy.${k}.mode must be manual|approve|auto`);
  if (errors.length) return { ok: false, errors };
  const current = jaa().get(T.profile, { id }) || { id };
  const next = _merge(current, { ...patch, id, updatedAt: Date.now() });
  if (next.contact && !next.contact.fullName && (next.contact.firstName || next.contact.lastName)) next.contact.fullName = [next.contact.firstName, next.contact.lastName].filter(Boolean).join(' ');
  jaa().upsert(T.profile, next);
  ledger('profile.updated', { shape: 'profile', context: { keys: Object.keys(patch) } });
  return { ok: true, profile: getProfile(id) };
}

// A small, explicit vocabulary — suggestions from the resume, never auto-applied to the profile.
const SKILL_VOCAB = ['javascript', 'typescript', 'node.js', 'node', 'react', 'vue', 'svelte', 'angular', 'next.js', 'python', 'django', 'flask', 'fastapi',
  'go', 'golang', 'rust', 'java', 'kotlin', 'swift', 'c#', '.net', 'c++', 'php', 'laravel', 'ruby', 'rails', 'sql', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis',
  'graphql', 'rest', 'grpc', 'docker', 'kubernetes', 'terraform', 'aws', 'gcp', 'azure', 'linux', 'bash', 'git', 'ci/cd', 'electron', 'playwright', 'puppeteer',
  'selenium', 'web scraping', 'automation', 'llm', 'ai', 'machine learning', 'pytorch', 'tensorflow', 'nlp', 'prompt engineering', 'rag', 'embeddings', 'ollama',
  'openai', 'anthropic', 'data analysis', 'pandas', 'excel', 'tableau', 'figma', 'ui/ux', 'css', 'html', 'tailwind', 'wordpress', 'shopify', 'seo', 'copywriting',
  'technical writing', 'video editing', 'photoshop', 'illustrator', 'music production', 'audio', 'dsp', 'webaudio', 'three.js', 'webgl', 'unity', 'unreal',
  'system design', 'distributed systems', 'microservices', 'event-driven', 'devops', 'security', 'testing', 'tdd', 'api design', 'chrome extension', 'userscripts'];
async function importResume(filePath, { id = 'default' } = {}) {
  const fs = require('fs'); const path = require('path');
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: `no file at ${filePath}` };
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  try {
    if (ext === '.txt' || ext === '.md') text = fs.readFileSync(filePath, 'utf8');
    else if (ext === '.docx') {
      const AdmZip = require('adm-zip');
      const xml = new AdmZip(filePath).readAsText('word/document.xml');
      text = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    } else if (ext === '.pdf') {
      const { execFileSync } = require('child_process');
      try { text = execFileSync('pdftotext', ['-layout', filePath, '-'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }); }
      catch (e) { return { ok: false, error: `reading a PDF needs pdftotext (poppler) on PATH — ${e.code === 'ENOENT' ? 'not installed' : e.message}. Or save the resume as .docx/.txt.` }; }
    } else return { ok: false, error: `unsupported resume type ${ext} — use .pdf, .docx, .txt or .md` };
  } catch (e) { return { ok: false, error: `could not read ${filePath}: ${e.message}` }; }
  text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const lower = text.toLowerCase();
  const found = SKILL_VOCAB.filter(s => scoring.has(lower, s));
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [null])[0];
  const r = setProfile({ resumeText: text, resumePath: path.resolve(filePath) }, id);
  return { ok: r.ok, chars: text.length, suggestedSkills: found, email, note: 'suggestedSkills are not added to the profile — set them with profile set skills=...' };
}

/**
 * identityFromAutofill(af) — 0.39.272 (§8.6 reuse): Clear Glass's AutofillProfile is James's canonical identity for
 * forms (25 fields + job/freelance extras + documents: resume path, cover letter, proposal). The opportunity profile
 * keeps only what a SEARCH needs (roles, sources, policy…); identity comes from the autofill profile it names.
 * Pure: maps an autofill profile into the opportunity profile's shape. A value James set locally still wins.
 */
function identityFromAutofill(af = {}) {
  const f = af.fields || {}, d = af.documents || {};
  const yes = (v) => (v === undefined || v === null || v === '') ? null : /^(y|yes|true|1)$/i.test(String(v).trim()) ? true : /^(n|no|false|0)$/i.test(String(v).trim()) ? false : String(v);
  return {
    contact: { firstName: f['given-name'] || '', lastName: f['family-name'] || '', fullName: f.name || [f['given-name'], f['family-name']].filter(Boolean).join(' '),
      email: f.email || '', phone: f.tel || '', location: [f['address-level2'], f['address-level1'], f['country-name']].filter(Boolean).join(', '), pronouns: f.pronouns || '' },
    links: { linkedin: d.linkedinUrl || '', github: f.github || '', portfolio: d.portfolioUrl || f.url || '', upwork: f['upwork-url'] || '', fiverr: f['fiverr-url'] || '' },
    headline: f.headline || f['organization-title'] || '', summary: f.summary || '',
    skills: f.skills ? String(f.skills).split(/[,;\n]/).map(x => x.trim()).filter(Boolean) : [],
    eligibility: { workAuthorization: yes(f['work-authorization']), needsSponsorship: yes(f.sponsorship) },
    preferences: { salaryExpectation: f['desired-salary'] || f['hourly-rate'] || '', availability: f['available-from'] || f['notice-period'] || '', relocate: yes(f.relocate), remote: f['remote-preference'] || '' },
    experience: { years: f['years-experience'] || null },
    resumePath: (d.resume && (d.resume.path || d.resume)) || '',
    coverLetterTemplate: d.coverLetter || '', proposalTemplate: d.proposal || '',
  };
}
function _isEmpty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); }
function _fillEmpty(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = _fillEmpty(base[k] && typeof base[k] === 'object' ? base[k] : {}, v);
    else if (_isEmpty(out[k]) && !_isEmpty(v)) out[k] = v;
  }
  return out;
}
/** effectiveProfile() — the opportunity profile with identity filled from the Clear Glass autofill profile it names. */
async function effectiveProfile(id = 'default') {
  const p = getProfile(id);
  if (!p.autofillProfileId) return { ...p, identitySource: 'opportunity profile' };
  try {
    const r = await cg({ action: 'autofill_profile', profileId: p.autofillProfileId });
    const af = r && (r.profile || (r.fields ? r : null));
    if (!af) return { ...p, identitySource: `opportunity profile (autofill profile ${p.autofillProfileId} unreadable: ${(r && r.error) || 'no profile'})` };
    return { ..._fillEmpty(p, identityFromAutofill(af)), identitySource: `Clear Glass autofill profile "${af.label || af.id}"` };
  } catch (e) { return { ...p, identitySource: `opportunity profile (Clear Glass unreachable: ${e.message})` }; }
}

// ── opportunities ───────────────────────────────────────────────────────────────────────────────────────────────
function get(id) {
  const row = jaa().get(T.opps, { id }) || jaa().query(T.opps, r => r.id.startsWith(String(id || '#')))[0] || null;
  return row;
}
function list({ stage = null, kind = null, limit = 50, minScore = null, q = null } = {}) {
  const stageSet = stage ? new Set(String(stage).toUpperCase().split(',')) : null;
  const ql = q ? String(q).toLowerCase() : null;
  return jaa().query(T.opps, r => (!stageSet || stageSet.has(r.stage)) && (!kind || r.kind === kind) && (minScore === null || (r.score || 0) >= minScore)
      && (!ql || `${r.title} ${r.company} ${r.source}`.toLowerCase().includes(ql)))
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, limit)
    .map(r => ({ id: r.id, stage: r.stage, score: r.score, kind: r.kind, title: r.title, company: r.company, source: r.source, url: r.url, updatedAt: r.updatedAt }));
}

function transition(id, to, { by = 'agent', note = null, patch = {} } = {}) {
  const opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  const c = stages.check(opp.stage, to, by);
  if (!c.ok) { ledger('transition.refused', { oppId: opp.id, shape: `${opp.stage}->${to}`, tags: [by], context: { error: c.error } }); return { ok: false, error: c.error, stage: opp.stage }; }
  const history = [...(opp.history || []), { from: opp.stage, to, by, note, ts: Date.now() }].slice(-100);
  const next = { ...patch, stage: to, history, updatedAt: Date.now() };
  jaa().update(T.opps, { id: opp.id }, next);
  ledger('transition', { oppId: opp.id, shape: `${opp.stage}->${to}`, tags: [by, opp.kind, opp.source], context: note ? { note } : null, progress: to });
  return { ok: true, opp: { ...opp, ...next } };
}

// ── outcome learning (0.39.272, L4) ───────────────────────────────────────────────────────────────────────────
const POSITIVE = new Set(['RESPONDED', 'INTERVIEW', 'OFFER']);
function recordOutcome(opp, outcome, { by = 'system' } = {}) {
  if (!opp) return null;
  const profile = getProfile();
  const body = [opp.title, opp.description, (opp.tags || []).join(' ')].join(' ').toLowerCase();
  const skills = (profile.skills || []).filter(k => scoring.has(body, k)).map(k => String(k).toLowerCase());
  const row = { id: crypto.randomUUID(), oppId: opp.id, source: opp.source, sourceKey: String(opp.source || '').split(':')[0], kind: opp.kind,
    company: opp.company || null, skills, outcome, positive: POSITIVE.has(outcome), by, ts: Date.now() };
  jaa().insert(T.outcomes, row);
  ledger('outcome', { oppId: opp.id, shape: outcome, tags: [row.sourceKey, by], context: { skills } });
  return row;
}
/**
 * learnedWeights() — per source and per skill: how often an application there got a positive answer, against the
 * overall rate. Needs ≥3 outcomes for a key before it counts; bounded ±15 (sources) / ±5 per skill. Pure over the table.
 */
function learnedWeights({ minN = 3 } = {}) {
  const rows = jaa().query(T.outcomes, () => true);
  if (!rows.length) return { sources: {}, skills: {}, total: 0, rate: null };
  const pos = rows.filter(r => r.positive).length;
  const base = (pos + 1) / (rows.length + 2);
  const agg = (keyOf) => { const m = new Map(); for (const r of rows) for (const k of [].concat(keyOf(r) || [])) { const a = m.get(k) || { n: 0, p: 0 }; a.n++; if (r.positive) a.p++; m.set(k, a); } return m; };
  const sources = {}, skills = {};
  for (const [k, a] of agg(r => [r.source, r.sourceKey])) {
    if (a.n < minN) continue;
    const rate = (a.p + 1) / (a.n + 2);
    const w = Math.max(-15, Math.min(15, Math.round((rate - base) * 40)));
    if (w) sources[k] = { w, n: a.n, p: a.p, why: `${k} → ${a.p} of ${a.n} applications answered (overall ${pos} of ${rows.length})` };
  }
  for (const [k, a] of agg(r => r.skills)) {
    if (a.n < minN) continue;
    const rate = (a.p + 1) / (a.n + 2);
    const w = Math.max(-5, Math.min(5, Math.round((rate - base) * 15)));
    if (w) skills[k] = { w, n: a.n, p: a.p, why: `"${k}" jobs → ${a.p} of ${a.n} answered` };
  }
  return { sources, skills, total: rows.length, positives: pos, rate: +base.toFixed(3) };
}

/** upsertFound(item, profile) — dedupe, insert as DISCOVERED, score → SCORED/SHORTLISTED/DISMISSED. */
function upsertFound(item, profile) {
  const key = scoring.dedupeKey(item);
  const existing = jaa().get(T.opps, { dedupeKey: key });
  if (existing) {
    const seen = [...new Set([...(existing.seenIn || [existing.source]), item.source])];
    if (seen.length !== (existing.seenIn || []).length) jaa().update(T.opps, { id: existing.id }, { seenIn: seen, lastSeen: Date.now() });
    return { opp: existing, created: false };
  }
  const id = crypto.randomUUID();
  const row = { id, dedupeKey: key, ...item, seenIn: [item.source], stage: 'DISCOVERED', createdAt: Date.now(), updatedAt: Date.now(),
    history: [{ from: null, to: 'DISCOVERED', by: 'system', ts: Date.now() }], retry_count: 0, failure_log: [], drafts: {} };
  jaa().insert(T.opps, row);
  ledger('discovered', { oppId: id, shape: item.kind, tags: [item.source], context: { title: item.title, company: item.company } });
  const sc = scoring.score(row, profile, { learned: _learnedCache() });
  if (sc.hardReject) { transition(id, 'DISMISSED', { by: 'system', note: sc.hardReject, patch: { score: 0, scoreReasons: sc.reasons } }); }
  else {
    transition(id, 'SCORED', { by: 'system', patch: { score: sc.score, scoreReasons: sc.reasons } });
    if (sc.score >= (profile.shortlistAbove || scoring.DEFAULTS.shortlistAbove)) transition(id, 'SHORTLISTED', { by: 'system', note: `score ${sc.score}` });
  }
  return { opp: get(id), created: true, score: sc };
}

/** rescore() — the profile changed; re-rank everything not yet past SHORTLISTED. */
function rescore({ id = 'default' } = {}) {
  const profile = getProfile(id);
  let moved = 0;
  const learned = learnedWeights();
  for (const o of jaa().query(T.opps, r => ['SCORED', 'SHORTLISTED', 'DISMISSED'].includes(r.stage))) {
    const sc = scoring.score(o, profile, { learned });
    jaa().update(T.opps, { id: o.id }, { score: sc.score, scoreReasons: sc.reasons });
    const want = sc.hardReject ? 'DISMISSED' : sc.score >= profile.shortlistAbove ? 'SHORTLISTED' : 'SCORED';
    if (want !== o.stage && stages.check(o.stage, want, 'system').ok) { transition(o.id, want, { by: 'system', note: 'rescored' }); moved++; }
  }
  return { ok: true, moved };
}

async function draftFor(id, { kind = null, extra = {}, send = null } = {}) {
  const opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  const profile = await effectiveProfile();
  const k = kind || (opp.kind === 'lead' ? 'fiverr_reply' : opp.kind === 'gig' || opp.kind === 'brief' ? 'proposal' : 'cover_letter');
  const ex = { ...extra };
  // 0.39.272 (L5) — James's own template from his autofill profile, and the drafts of this kind he edited before.
  if (ex.template === undefined) ex.template = k === 'cover_letter' ? (profile.coverLetterTemplate || '') : (k === 'proposal' || k === 'fiverr_reply') ? (profile.proposalTemplate || '') : '';
  if (ex.examples === undefined) ex.examples = editedExamples(k, { exclude: opp.id });
  if (k === 'fiverr_reply' && !ex.message) ex.message = opp.message || String(opp.description || '').slice(-3000);
  if (k === 'follow_up' && ex.days === undefined && opp.submittedAt) ex.days = Math.round((Date.now() - opp.submittedAt) / 86400000);
  const d = await drafting.draft(k, { profile, opp, extra: ex, send });
  ledger(d.ok ? 'drafted' : 'draft.failed', { oppId: opp.id, shape: k, tags: [d.backend || 'unknown'], context: d.ok ? { chars: d.text.length } : { error: d.error } });
  if (!d.ok) return d;
  const drafts = { ...(opp.drafts || {}), [k]: { text: d.text, at: Date.now(), backend: d.backend, edited: false } };
  jaa().update(T.opps, { id: opp.id }, { drafts, updatedAt: Date.now() });
  if (['SHORTLISTED', 'SCORED'].includes(opp.stage)) { if (opp.stage === 'SCORED') transition(opp.id, 'SHORTLISTED', { by: 'system', note: 'drafted on request' }); transition(opp.id, 'DRAFTED', { by: 'agent', note: k }); }
  return { ok: true, id: opp.id, kind: k, text: d.text, prompt: d.prompt };
}

/**
 * editedExamples(kind) — 0.39.272 (L5, voice learning). The last drafts of this kind James EDITED, as his final text.
 * They go into {examples} in the drafting template, so the next draft starts closer to how he writes. Budgeted; each
 * names where it came from. Empty until he has edited one.
 */
function editedExamples(kind, { limit = 3, maxChars = 900, exclude = null } = {}) {
  const rows = jaa().query(T.opps, r => r.id !== exclude && r.drafts && r.drafts[kind] && r.drafts[kind].edited)
    .sort((a, b) => (b.drafts[kind].at || 0) - (a.drafts[kind].at || 0)).slice(0, limit);
  return rows.map(r => `--- (${r.title}${r.company ? ' at ' + r.company : ''}) ---\n${String(r.drafts[kind].text).slice(0, maxChars)}`).join('\n');
}

/** editDraft — James's edit of a draft. The edited text is what gets used. */
function editDraft(id, kind, text) {
  const opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  const drafts = { ...(opp.drafts || {}), [kind]: { ...(opp.drafts || {})[kind], text: String(text), edited: true, at: Date.now() } };
  jaa().update(T.opps, { id: opp.id }, { drafts, updatedAt: Date.now() });
  ledger('draft.edited', { oppId: opp.id, shape: kind, tags: ['user'] });
  return { ok: true };
}

function approve(id, { by = 'user', note = null } = {}) {
  const opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  if (opp.stage === 'SCORED') { const r = transition(opp.id, 'SHORTLISTED', { by, note: 'approved from SCORED' }); if (!r.ok) return r; }
  const r = transition(opp.id, 'APPROVED', { by, note, patch: { approvedBy: by, approvedAt: Date.now() } });
  if (r.ok) {
    // The answers this application's fill generated are James's now: approving the application approves them.
    for (const g of (opp.fillReport && opp.fillReport.generated) || []) answers.add({ question: g.label, answer: g.value, by: 'user', oppId: opp.id });
  }
  return r;
}
function dismiss(id, { by = 'user', note = null } = {}) { return transition(id, 'DISMISSED', { by, note }); }

// ── Clear Glass (the browser) ───────────────────────────────────────────────────────────────────────────────────
let _browser = null;
function setBrowser(fn) { _browser = fn; }          // tests inject a fake; production uses clearglass.browser.tool
function cg(args) {
  const exec = _browser || require('../agent-tools/tools/clear-glass/browser.js').execute;
  return exec(args);
}
const agentIdFor = (opp) => opp.agentId || `opp-${opp.id.slice(0, 8)}`;

/** capture({ agentId }) — the page Clear Glass has open → an opportunity (scored). */
async function capture({ agentId = 'default', page = null, kind = null } = {}) {
  const p = page || await cg({ action: 'read', agentId });
  if (!p || p.ok === false) return { ok: false, error: `could not read the page: ${(p && p.error) || 'no reply'}` };
  const item = sources.fromPage(p);
  if (!item) return { ok: false, error: 'page has no url' };
  if (kind) item.kind = kind;
  if (item.kind === 'lead') item.message = String(p.text || '').slice(-4000);
  const r = upsertFound(item, getProfile());
  return { ok: true, created: r.created, id: r.opp.id, stage: r.opp.stage, score: r.opp.score, title: r.opp.title, kind: r.opp.kind };
}

function _fail(opp, stage, error, extra = {}) {
  const failure_log = [...(opp.failure_log || []), { at: Date.now(), stage, error }].slice(-20);
  return transition(opp.id, 'FAILED', { by: 'system', note: error, patch: { failure_log, retry_count: (opp.retry_count || 0) + 1, ...extra } });
}

/**
 * prepare(id, { send }) — open, fill, stop. Returns the fill report; the stage says what happens next.
 */
async function prepare(id, { send = null, force = false } = {}) {
  let opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  const allowed = ['APPROVED', 'FAILED', 'NEEDS_LOGIN', 'NEEDS_INPUT', 'READY'];
  if (!allowed.includes(opp.stage) && !force) return { ok: false, error: `prepare needs James's approval first — stage is ${opp.stage} (approve it, or pass force from the CLI)` };
  if ((opp.retry_count || 0) >= 3 && opp.stage === 'FAILED' && !force) return { ok: false, error: `failed ${opp.retry_count} times — escalated to James (see failure_log); pass force to try again` };
  const profile = await effectiveProfile();
  if (opp.stage !== 'PREPARING') { const t = transition(opp.id, 'PREPARING', { by: 'agent' }); if (!t.ok) return t; opp = t.opp; }
  const agentId = agentIdFor(opp);
  const url = opp.applyUrl || opp.url;

  const tab = await cg({ action: 'open_tab', agentId, url, partition: profile.partition || 'persist:opportunity' });
  if (tab && tab.ok === false) return _fail(opp, 'open_tab', tab.error);
  if (tab && tab.reused) await cg({ action: 'act', agentId, driverAction: 'navigate', args: { url } });
  await cg({ action: 'act', agentId, driverAction: 'wait', args: { ms: 2500 } });
  let page = await cg({ action: 'read', agentId });
  if (!page || page.ok === false) return _fail(opp, 'read', (page && page.error) || 'page unreadable');

  const hasPassword = (page.fields || []).some(f => f.type === 'password');
  if (hasPassword || (!(page.fields || []).length && apply.LOGIN_RE.test(String(page.text || '').slice(0, 3000)))) {
    return transition(opp.id, 'NEEDS_LOGIN', { by: 'system', note: `log in once in tab ${agentId} (partition ${profile.partition}); then prepare again`, patch: { agentId } });
  }
  const entry = (page.fields || []).filter(f => f.type !== 'hidden').length < 2 ? apply.findApplyEntry(page.buttons, page.links) : null;
  if (entry) {
    await cg({ action: 'act', agentId, driverAction: 'click', args: { selector: entry.selector } });
    await cg({ action: 'act', agentId, driverAction: 'wait', args: { ms: 3000 } });
    page = await cg({ action: 'read', agentId });
    if (!page || page.ok === false) return _fail(opp, 'read-after-apply', (page && page.error) || 'unreadable');
  }

  let autofill = null;
  if (profile.autofillProfileId) {
    autofill = await cg({ action: 'autofill_fill', agentId, profileId: profile.autofillProfileId });
    page = await cg({ action: 'read', agentId });
  }

  let coverLetter = opp.drafts && opp.drafts.cover_letter && opp.drafts.cover_letter.text;
  const needsCover = (page.fields || []).some(f => /cover\s*letter/i.test(f.label || '') && f.type !== 'file');
  if (needsCover && !coverLetter) { const d = await draftFor(opp.id, { kind: 'cover_letter', send }); if (d.ok) coverLetter = d.text; opp = get(opp.id); }

  const used = [];
  const answerFor = (q, o = {}) => { const a = answers.answerFor(q, profile, o); if (a && a.id) used.push(a.id); return a; };
  const plan = apply.planFill(page.fields || [], { profile, answerFor, coverLetter, resumePath: profile.resumePath || null, coverLetterPath: profile.coverLetterPath || null });

  // Open questions with no approved answer: draft one each (screening_answer), fill it, mark it generated.
  const generated = [];
  for (const q of plan.open.filter(x => x.type === 'textarea' || x.type === 'text' || x.type === 'contenteditable').slice(0, 8)) {
    const d = await drafting.draft('screening_answer', { profile, opp, extra: { question: q.label }, send });
    if (d.ok && d.text) { plan.steps.push({ action: 'setValue', selector: q.selector, value: d.text }); generated.push({ selector: q.selector, label: q.label, value: d.text }); answers.add({ question: q.label, answer: d.text, by: 'agent', oppId: opp.id }); }
  }
  const stillOpen = plan.open.filter(q => !generated.find(g => g.selector === q.selector));

  const fill = plan.steps.length ? await cg({ action: 'sequence', agentId, steps: plan.steps, stopOnError: false }) : { ok: true, results: [] };
  answers.markUsed(used);
  page = await cg({ action: 'read', agentId });
  const unfilledRequired = (page && page.unfilledRequired) || [];
  const shot = await cg({ action: 'act', agentId, driverAction: 'screenshot' }).catch(() => null);

  const fillReport = { at: Date.now(), agentId, url: page && page.url, autofill: autofill && (autofill.filled || autofill.result || autofill.ok !== false),
    planned: plan.planned, generated, open: stillOpen, skipped: plan.skipped, unfilledRequired,
    stepErrors: ((fill && fill.results) || []).filter(r => !r.ok).map(r => ({ step: r.step, action: r.action, error: r.error })),
    screenshotBytes: shot && shot.result && shot.result.bytes || null };
  ledger('prepared', { oppId: opp.id, shape: 'fill', tags: [agentId], context: { planned: plan.planned.length, generated: generated.length, unfilledRequired: unfilledRequired.length, stepErrors: fillReport.stepErrors.length } });

  const next = unfilledRequired.length || stillOpen.length ? 'NEEDS_INPUT' : 'READY';
  const t = transition(opp.id, next, { by: 'agent', patch: { fillReport, agentId }, note: next === 'NEEDS_INPUT' ? `${unfilledRequired.length} required field(s) empty, ${stillOpen.length} unanswered` : `tab ${agentId} filled — review and submit` });
  if (!t.ok) return t;
  if (next === 'READY' && opp.approvedBy === 'user' && apply.mayAutoSubmit(profile, opp).ok) return submit(opp.id, { by: 'agent' });
  return { ok: true, id: opp.id, stage: next, agentId, fillReport, submit: apply.mayAutoSubmit(profile, opp) };
}

/** submit(id, { by }) — press the button. James may always; the agent only under policy auto (+ ToS ack). */
async function submit(id, { by = 'user' } = {}) {
  const opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  if (!['READY', 'NEEDS_INPUT'].includes(opp.stage)) return { ok: false, error: `submit needs a prepared application (READY) — stage is ${opp.stage}` };
  const profile = getProfile();
  if (by !== 'user') {
    if (opp.approvedBy !== 'user') return { ok: false, error: 'not approved by James — the agent will not submit' };
    const m = apply.mayAutoSubmit(profile, opp);
    if (!m.ok) return { ok: false, error: m.why };
    if (opp.stage !== 'READY') return { ok: false, error: 'required fields are still empty — the agent will not submit an incomplete application' };
  }
  const agentId = agentIdFor(opp);
  const page = await cg({ action: 'read', agentId });
  if (!page || page.ok === false) return { ok: false, error: `could not read tab ${agentId}: ${(page && page.error) || 'no reply'}` };
  const recipe = getRecipe(apply.platformFor(opp.url).host);
  const btn = recipe && recipe.submitSelector ? { selector: recipe.submitSelector, text: 'recipe' } : apply.findSubmit(page.buttons);
  if (!btn) return { ok: false, error: `no submit button found on ${page.url} — buttons: ${(page.buttons || []).map(b => b.text).slice(0, 12).join(' | ')} (set a recipe submitSelector for this site)` };
  const click = await cg({ action: 'act', agentId, driverAction: 'click', args: { selector: btn.selector } });
  if (click && click.ok === false) return _fail(opp, 'submit-click', click.error);
  await cg({ action: 'act', agentId, driverAction: 'wait', args: { ms: 4000 } });
  const after = await cg({ action: 'read', agentId });
  const text = String((after && after.text) || '').slice(0, 6000);
  // James reviewed the filled form and pressed submit: the answers the agent drafted for it are his now, reusable.
  // (Approval comes BEFORE prepare drafts them, so approve() alone cannot adopt them — found writing OP-605.)
  const adopt = () => { if (by === 'user') for (const g of (opp.fillReport && opp.fillReport.generated) || []) answers.add({ question: g.label, answer: g.value, by: 'user', oppId: opp.id }); };
  if (apply.DONE_RE.test(text)) { adopt(); return transition(opp.id, 'SUBMITTED', { by, note: 'confirmation seen', patch: { submittedAt: Date.now(), submitConfirmed: true } }); }
  if (apply.ERROR_RE.test(text) && after && after.url === page.url) return _fail(opp, 'submit-validate', `page still shows validation errors after submit: "${(text.match(apply.ERROR_RE) || [''])[0]}"`);
  adopt();
  return transition(opp.id, 'SUBMITTED', { by, note: 'submitted — no confirmation text seen; check the tab', patch: { submittedAt: Date.now(), submitConfirmed: false } });
}

/** prepareReply(id) — Fiverr/Upwork message thread: put the approved reply in the box. Send is submit()'s rule. */
async function prepareReply(id, { kind = null, send = null } = {}) {
  let opp = get(id);
  if (!opp) return { ok: false, error: `no opportunity ${id}` };
  if (!['APPROVED', 'NEEDS_INPUT', 'READY', 'FAILED'].includes(opp.stage)) return { ok: false, error: `approve the reply first — stage is ${opp.stage}` };
  const k = kind || (opp.kind === 'lead' ? 'fiverr_reply' : 'proposal');
  let text = opp.drafts && opp.drafts[k] && opp.drafts[k].text;
  if (!text) { const d = await draftFor(opp.id, { kind: k, send }); if (!d.ok) return d; text = d.text; opp = get(opp.id); }
  if (opp.stage !== 'PREPARING') { const t = transition(opp.id, 'PREPARING', { by: 'agent' }); if (!t.ok) return t; }
  const profile = await effectiveProfile();
  const agentId = agentIdFor(opp);
  await cg({ action: 'open_tab', agentId, url: opp.url, partition: profile.partition || 'persist:opportunity' });
  await cg({ action: 'act', agentId, driverAction: 'wait', args: { ms: 2500 } });
  const page = await cg({ action: 'read', agentId });
  if (!page || page.ok === false) return _fail(get(opp.id), 'read', (page && page.error) || 'unreadable');
  if ((page.fields || []).some(f => f.type === 'password')) return transition(opp.id, 'NEEDS_LOGIN', { by: 'system', note: `log in once in tab ${agentId}`, patch: { agentId } });
  const box = apply.findReplyBox(page.fields || [], getRecipe(apply.platformFor(opp.url).host) || {});
  if (!box) return transition(opp.id, 'NEEDS_INPUT', { by: 'system', note: 'no reply box found on the page (set a recipe replySelector for this site)', patch: { agentId } });
  const r = await cg({ action: 'act', agentId, driverAction: 'setValue', args: { selector: box.selector, value: text } });
  if (r && r.ok === false) return _fail(get(opp.id), 'setValue', r.error);
  return transition(opp.id, 'READY', { by: 'agent', note: `reply typed into ${box.selector} in tab ${agentId} — review and send`, patch: { agentId, fillReport: { at: Date.now(), reply: { selector: box.selector, chars: text.length } } } });
}

function markResponse(id, stage, { note = null, by = 'user' } = {}) {
  const s = String(stage || '').toUpperCase();
  if (!['RESPONDED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ARCHIVED'].includes(s)) return { ok: false, error: 'stage must be RESPONDED, INTERVIEW, OFFER, REJECTED or ARCHIVED' };
  const r = transition(id, s, { by, note, patch: { respondedAt: Date.now() } });
  if (r.ok && s !== 'ARCHIVED') { recordOutcome(r.opp, s, { by }); _learned = null; }   // 0.39.272 (L4) — learn from it
  return r;
}

async function followups({ send = null, draft = true } = {}) {
  const profile = getProfile();
  const days = profile.followUpDays || 7;
  const due = jaa().query(T.opps, r => r.stage === 'SUBMITTED' && r.submittedAt && (Date.now() - r.submittedAt) > days * 86400000 && !r.followedUpAt);
  const out = [];
  for (const o of due) {
    transition(o.id, 'FOLLOW_UP_DUE', { by: 'system', note: `${days}+ days, no response` });
    recordOutcome(o, 'NO_RESPONSE'); _learned = null;   // 0.39.272 (L4) — silence is an outcome too
    const d = draft ? await draftFor(o.id, { kind: 'follow_up', send }) : null;
    out.push({ id: o.id, title: o.title, company: o.company, drafted: !!(d && d.ok) });
  }
  return { ok: true, due: out.length, items: out };
}

// ── recipes (per-site selectors James can fix without code) ────────────────────────────────────────────────────
function getRecipe(host) { return host ? jaa().get(T.recipes, { id: host }) : null; }
function setRecipe(host, patch = {}) {
  if (!host) return { ok: false, error: 'host required (e.g. fiverr.com)' };
  const allowed = ['replySelector', 'submitSelector', 'note'];
  const bad = Object.keys(patch).filter(k => !allowed.includes(k));
  if (bad.length) return { ok: false, error: `unknown recipe keys: ${bad.join(', ')} — allowed: ${allowed.join(', ')}` };
  jaa().upsert(T.recipes, { id: host, ...patch, updatedAt: Date.now() });
  return { ok: true, recipe: getRecipe(host) };
}

// ── cycle ───────────────────────────────────────────────────────────────────────────────────────────────────────
let _learned = null, _learnedAt = 0;
function _learnedCache() { if (!_learned || Date.now() - _learnedAt > 60000) { _learned = learnedWeights(); _learnedAt = Date.now(); } return _learned; }

let _cycling = false;
async function cycle({ draft = null, send = null, fetchImpl = undefined } = {}) {
  if (_cycling) return { ok: false, error: 'a cycle is already running' };
  _cycling = true;
  const started = Date.now();
  try {
    const profile = getProfile();
    const enabled = (profile.sources || []).filter(s => s.enabled !== false);
    const report = { sources: [], found: 0, created: 0, shortlisted: 0, drafted: 0, autoApproved: 0, problems: [] };
    for (const src of enabled) {
      const r = await sources.fetchSource(src, fetchImpl ? { fetchImpl } : {});
      report.sources.push({ type: src.type, label: src.board || src.company || src.org || src.name || src.query || null, ok: r.ok, items: r.items.length, dropped: r.dropped || 0, error: r.error || null });
      if (!r.ok) report.problems.push(r.error);
      for (const item of r.items) {
        report.found++;
        const u = upsertFound(item, profile);
        if (u.created) { report.created++; if (u.opp.stage === 'SHORTLISTED') report.shortlisted++; }
      }
    }
    // auto-approve (only where James set autoApproveAbove for that platform/source) — recorded as policy, by:'user'
    for (const o of jaa().query(T.opps, r => r.stage === 'SHORTLISTED')) {
      const pol = apply.policyFor(profile, o);
      if (pol.autoApproveAbove !== null && (o.score || 0) >= pol.autoApproveAbove) {
        const r = transition(o.id, 'APPROVED', { by: 'user', note: `auto-approved by James's policy (score ${o.score} ≥ ${pol.autoApproveAbove})`, patch: { approvedBy: 'user', approvedByPolicy: true, approvedAt: Date.now() } });
        if (r.ok) report.autoApproved++;
      }
    }
    const n = draft === null ? (profile.draftTop || 0) : draft;
    if (n > 0) {
      const top = jaa().query(T.opps, r => r.stage === 'SHORTLISTED' && !(r.drafts && Object.keys(r.drafts).length)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, n);
      for (const o of top) { const d = await draftFor(o.id, { send }); if (d.ok) report.drafted++; else report.problems.push(`draft ${o.id.slice(0, 8)}: ${d.error}`); }
    }
    const f = await followups({ send, draft: n > 0 });
    report.followUpsDue = f.due;
    report.ms = Date.now() - started;
    ledger('cycle', { shape: 'cycle', context: { found: report.found, created: report.created, shortlisted: report.shortlisted, drafted: report.drafted, problems: report.problems.length }, progress: 'done' });
    return { ok: true, ...report, status: status() };
  } finally { _cycling = false; }
}

function status() {
  const all = jaa().query(T.opps, () => true);
  const byStage = Object.fromEntries(stages.STAGES.map(s => [s, 0]));
  for (const o of all) byStage[o.stage] = (byStage[o.stage] || 0) + 1;
  const needsYou = all.filter(o => stages.NEEDS_YOU.includes(o.stage)).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20)
    .map(o => ({ id: o.id, stage: o.stage, score: o.score, title: o.title, company: o.company, why: (o.history || []).slice(-1)[0]?.note || null }));
  return { total: all.length, byStage, needsYou };
}

function show(id) {
  const o = get(id);
  if (!o) return { ok: false, error: `no opportunity ${id}` };
  return { ok: true, opportunity: o, ledger: ledgerFor(o.id, 40), policy: apply.policyFor(getProfile(), o) };
}

module.exports = {
  MODULE_ID, VERSION, DEFAULT_PROFILE,
  getProfile, setProfile, importResume, effectiveProfile, identityFromAutofill,
  get, list, show, transition, upsertFound, rescore, approve, dismiss, draftFor, editDraft, editedExamples,
  capture, prepare, submit, prepareReply, markResponse, followups, cycle, status, recordOutcome, learnedWeights,
  getRecipe, setRecipe, setBrowser,
  answers, drafting, sources, stages, scoring, apply,
};
