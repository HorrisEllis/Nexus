'use strict';
/**
 * lib/opportunity/draft.js — cover letters, proposals, replies, screening answers, follow-ups, gig copy.
 * comp_id: nexus.lib.opportunity.draft
 * Version: 1.0.0
 *
 * Same rule as idearium's repo agent (0.39.258): the text sent to the model is the template, exactly as James edited
 * it, with placeholders filled from data he can see. Nothing is prepended. Templates live in opportunity_templates;
 * the defaults below are used until he edits one, and an edit is never overwritten by a newer default.
 *
 * PLACEHOLDERS (data, never prose): {name} {headline} {summary} {skills} {resume} {links} {voice}
 *   {title} {company} {description} {url} {question} {message} {previous} {days} {extra}
 *   0.39.272: {platform_guide} Clear Glass's own guide per platform (clear-glass/src/autofill/proposal.js PLATFORM_GUIDE, reused)
 *             {template}       James's own cover-letter / proposal template from his Clear Glass autofill profile
 *             {examples}       the last drafts of this kind James EDITED (his final text) — the pipeline learns his voice
 * A line whose placeholders ALL filled empty is dropped, so templates need no conditionals.
 *
 * WHERE IT IS SENT: copilot :3750 decides WHO answers (GET /api/prompt/resolve → its default backend, or the
 * profile's draftBackend), and the composed text goes straight to that backend — the same path idearium's repo
 * agent takes, so copilot adds no context of its own. send is injectable for tests.
 */

const http = require('http');
const { T, jaa, ledger } = require('./store');

const COPILOT_URL = process.env.COPILOT_URL || 'http://127.0.0.1:3750';

const VOICE = 'Plain, specific, first person. No clichés ("I am excited to", "passionate", "synergy"), no flattery, no invented facts. If the profile does not say it, do not claim it.';

const DEFAULT_TEMPLATES = Object.freeze({
  cover_letter: [
    'Write a cover letter for this job, as {name}. 180-260 words. Output only the letter.',
    'Voice: {voice}',
    '',
    '## Me', '{headline}', '{summary}', 'Skills: {skills}', 'Links: {links}', '',
    '## Resume', '{resume}', '',
    '## The job', '{title} at {company}', '{url}', '{description}', '',
    'Open with the one thing from my background that fits this role best. Name 2-3 concrete matches between the job and my resume. End with a short, direct line about next steps.',
    'Platform: {platform_guide}',
    'My own cover-letter template (follow its structure and phrasing where it fits): {template}',
    'Drafts of mine I edited before — match my edits in voice and length:',
    '{examples}',
    '{extra}',
  ].join('\n'),
  proposal: [
    'Write a freelance proposal for this project, as {name}. 120-200 words. Output only the proposal.',
    'Voice: {voice}',
    '', '## Me', '{headline}', 'Skills: {skills}', 'Links: {links}', '{summary}', '',
    '## The project', '{title}', '{url}', '{description}', '',
    'First line: restate the client\'s actual problem in one sentence. Then how I would do it (2-4 short steps), a relevant proof point from my background, and one clarifying question. No price unless the project asks for one.',
    'Platform: {platform_guide}',
    'My own proposal template (follow its structure and phrasing where it fits): {template}',
    'Proposals of mine I edited before — match my edits in voice and length:',
    '{examples}',
    '{extra}',
  ].join('\n'),
  fiverr_reply: [
    'Draft a reply to this Fiverr buyer message, as {name} (the seller). Under 120 words. Output only the reply.',
    'Voice: {voice}',
    '', '## My gig / me', '{headline}', 'Skills: {skills}', '{summary}', '',
    '## Their message', '{message}', '',
    '## Earlier in the thread', '{previous}', '',
    'Answer what they asked. If scope is unclear, ask the one question that decides it. If it fits a package, say which. Keep all communication on Fiverr; never ask for or offer contact details or payment outside Fiverr.',
    'Platform: {platform_guide}',
    'Replies of mine I edited before — match my edits in voice and length:',
    '{examples}',
    '{extra}',
  ].join('\n'),
  screening_answer: [
    'Answer this job application question, as {name}. Output only the answer text, ready to paste.',
    'Voice: {voice}',
    '', '## Question', '{question}', '',
    '## The job', '{title} at {company}', '{description}', '',
    '## Me', '{headline}', '{summary}', 'Skills: {skills}', '## Resume', '{resume}', '',
    'Length: match the question (one line for a fact, 60-150 words for an open question). If the resume does not support an answer, say what is true instead of inventing experience.',
  ].join('\n'),
  follow_up: [
    'Write a short follow-up about my application for {title} at {company}, sent {days} days ago, as {name}. Under 90 words. Output only the message.',
    'Voice: {voice}',
    'One line reaffirming fit (from: {skills}), one line of new relevant information if any ({extra}), a polite ask about timeline.',
  ].join('\n'),
  gig_description: [
    'Write a Fiverr gig for this service, as {name}: a title (max 80 chars, starts with "I will"), a description (900-1200 characters), 5 search tags, and 3 packages (Basic/Standard/Premium: name, what is included, delivery days). Output in that order with those headings.',
    'Voice: {voice}',
    '', '## The service', '{extra}', '', '## Me', '{headline}', 'Skills: {skills}', '{summary}', 'Links: {links}',
  ].join('\n'),
});
const IDS = Object.keys(DEFAULT_TEMPLATES);

function getTemplate(id) {
  if (!IDS.includes(id)) throw new Error(`unknown template "${id}" — one of: ${IDS.join(', ')}`);
  const row = jaa().get(T.templates, { id });
  return row && typeof row.text === 'string' ? { id, text: row.text, edited: row.text !== DEFAULT_TEMPLATES[id] } : { id, text: DEFAULT_TEMPLATES[id], edited: false };
}
function listTemplates() { return IDS.map(getTemplate); }
function setTemplate(id, text) {
  if (!IDS.includes(id)) return { ok: false, error: `unknown template "${id}"` };
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'text must be a non-empty string' };
  jaa().upsert(T.templates, { id, text, updatedAt: Date.now() });
  ledger('template.edited', { shape: 'template', context: { id } });
  return { ok: true, template: getTemplate(id) };
}
function resetTemplate(id) { if (!IDS.includes(id)) return { ok: false, error: `unknown template "${id}"` }; jaa().delete(T.templates, { id }); return { ok: true, template: getTemplate(id) }; }

function dataFor(profile = {}, opp = {}, extra = {}) {
  const c = profile.contact || {};
  const links = Object.entries(profile.links || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return {
    name: c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '',
    headline: profile.headline || '', summary: profile.summary || '', skills: (profile.skills || []).join(', '),
    resume: String(profile.resumeText || '').slice(0, 7000), links, voice: profile.voice || VOICE,
    title: opp.title || '', company: opp.company || '', description: String(opp.description || '').slice(0, 5000), url: opp.url || '',
    question: extra.question || '', message: extra.message || '', previous: extra.previous || '', days: extra.days !== undefined ? String(extra.days) : '',
    extra: extra.extra || '',
    platform_guide: platformGuide(opp), template: extra.template || '', examples: extra.examples || '',
  };
}

// Clear Glass already wrote a guide per platform for its proposal drafter — reused, not rewritten (§8.6).
function platformGuide(opp = {}) {
  let G = null; try { G = require('../../clear-glass/src/autofill/proposal.js').PLATFORM_GUIDE; } catch (_) { return ''; }
  let host = ''; try { host = new URL(opp.url || opp.applyUrl || '').host; } catch (_) {}
  if (/fiverr\.com$/.test(host) || opp.kind === 'lead') return G.fiverr || '';
  if (/upwork\.com$/.test(host) || opp.kind === 'gig' || opp.kind === 'brief') return G.upwork || '';
  return G.job || '';
}

/** render(templateText, data) — pure; drops a line whose placeholders are all empty. */
function render(text, data) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const keys = [...line.matchAll(/\{([a-z_]+)\}/g)].map(m => m[1]).filter(k => k in data);
    const filled = line.replace(/\{([a-z_]+)\}/g, (m, k) => (k in data ? data[k] : m));
    if (keys.length && keys.every(k => !String(data[k] || '').trim())) continue;
    out.push(filled);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function _http(method, url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch (e) { resolve({ status: res.statusCode, json: null, raw: d.slice(0, 300) }); } });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${timeoutMs}ms`)));
    if (payload) req.write(payload);
    req.end();
  });
}

/** defaultSend(prompt, { backend }) — copilot picks who; the composed prompt goes to that backend as it stands. */
async function defaultSend(prompt, { backend = null, agent = null, timeoutMs = 240000 } = {}) {
  let be = backend, ag = agent;
  if (!be) {
    const r = await _http('GET', `${COPILOT_URL}/api/prompt/resolve`, null, 5000).catch(e => ({ status: 0, json: { ok: false, error: e.message } }));
    if (!r.json || !r.json.ok || !r.json.backend) throw new Error(`copilot could not resolve a backend (${(r.json && r.json.error) || 'no answer from :3750'}) — nothing sent`);
    be = r.json.backend; ag = r.json.agent || null;
  }
  const res = await _http('POST', `${COPILOT_URL}/api/prompt`, { prompt, backend: be, ...(ag ? { agent: ag } : {}), channel: 'opportunity', sessionId: `opportunity-${Date.now()}`, ...(be === 'guardian' ? { timeoutMs } : {}) }, timeoutMs + 10000);
  if (res.status !== 200 || !res.json || typeof res.json.text !== 'string' || !res.json.text.trim()) throw new Error((res.json && res.json.error) || `copilot returned ${res.status} with no text`);
  return { text: res.json.text.trim(), backend: be, agent: ag };
}

/**
 * draft(kind, { profile, opp, extra, send }) → { ok, text, prompt, template, backend }
 */
async function draft(kind, { profile = {}, opp = {}, extra = {}, send = null } = {}) {
  const tpl = getTemplate(kind);
  const prompt = render(tpl.text, dataFor(profile, opp, extra));
  const [b, a] = String(profile.draftBackend || '').split(':');
  try {
    const r = await (send || defaultSend)(prompt, { backend: b || null, agent: a || null });
    const text = String(r.text || r).replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    return { ok: true, text, prompt, template: kind, edited: tpl.edited, backend: r.backend || null };
  } catch (e) {
    return { ok: false, error: e.message, prompt, template: kind };
  }
}

module.exports = { platformGuide, DEFAULT_TEMPLATES, IDS, VOICE, getTemplate, listTemplates, setTemplate, resetTemplate, render, dataFor, draft, defaultSend };
