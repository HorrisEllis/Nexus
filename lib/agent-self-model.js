'use strict';
/**
 * lib/agent-self-model.js — SM1 (0.60.171): each agent's model of itself inside Nexus — intent, needs, constraints, what it has
 * learned — and a way to interrogate it about a pipeline issue.
 * comp_id: nexus.lib.agent-self-model
 * Map: docs/2026-10-19-pipeline-root-causes-phasemap.spec SM1, SM2
 *
 * James, 2026-10-19: "what if we have agents improving the understanding of themselves for nexus. like each agent/provider has
 * its' own model for intent, constraints, learning, etc. like if there is a issue in the pipeline, we could interrogate them? or
 * prompt them? for proposed fixes and improvements and learning optimization?"
 *
 *   get(provider, { root })                    → the model: seed (what it said it needs, its known quirks) + what was observed
 *   observe(provider, { jobType, outcome, cls, note }, { root }) → counts per job type and outcome; the last failure notes
 *   interrogationPrompt(provider, issue, { root }) → the prompt that asks it: root cause, its own part, a proposed fix (where and
 *                                                what), what it needs in its briefs, confidence — answered as one JSON block
 *   parseAnswer(text)                          → that JSON, validated, or { ok:false, error }
 *   propose(provider, answer, { root, issue }) → kept as a PROPOSAL, status 'proposed', for James — never applied by itself:
 *                                                AXIOMS §7.2 (ideas cannot affect runtime) and §8.2 (hostile review first)
 *   briefNeeds(provider, { root })             → its recorded needs, for lib/coder-brief.js to honour
 * One JSON file per provider under <root>/data/agent-models/ (this module the one writer). The seed for gemini is its own answer
 * of 2026-10-19 as James pasted it; the others start from what Nexus's logs show of them, marked as observed, not self-reported.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.agent-self-model';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const KEEP_NOTES = 20;

const SEED = Object.freeze({
  gemini: {
    intent: 'the first browser coder for Nexus builds (James, 2026-10-19: "prioritize gemini")',
    needs: [
      'the tech stack and environment: language and version, frameworks, where it runs',
      'constraints and code-style standards: patterns, libraries to use or avoid, error handling, performance',
      'concrete context: only the relevant slice, and the input/output contract (examples of what goes in and comes out)',
      'an explicit output format',
      'a self-critique step: critique for performance, security and missing edge cases, then give the refactored version',
    ],
    needsSource: 'self-reported — its own answer of 2026-10-19, pasted by James',
    constraints: [
      'Guardian keeps a 15 s gap between jobs to it (economy)',
      'its transcript can carry the page label "Gemini said" next to a file path (seen 2026-10-19; lib/path-guard.js guards it)',
      'answers a confirmation prompt in about 4 characters (seen 17:19, 20:10, 21:00)',
    ],
  },
  chatgpt: { intent: 'browser coder after gemini', needs: [], needsSource: 'none recorded yet — ask it (interrogate)', constraints: ['Guardian keeps a 15 s gap between jobs to it'] },
  claude: { intent: 'browser coder', needs: [], needsSource: 'none recorded yet — ask it (interrogate)', constraints: ['its reply was not found on the page at 20:16 ("needs-you": pick the reply with ◎)'] },
  deepseek: { intent: 'browser coder', needs: [], needsSource: 'none recorded yet — ask it (interrogate)', constraints: ['needs a saved sign-in (skipped account sync at 20:16)'] },
  ollama: { intent: 'local coder, first when it fits free memory (lib/pipeline-routing.js byFit)', needs: [], needsSource: 'a local model is asked the same way', constraints: ['qwen3.5:9b exceeded 600 s on a 9.4k-char tool-loop prompt (17:34)', 'loading a 7–9B model is when free memory drops below 10%'] },
});

const _dir = (root) => path.join(root || ROOT, 'data', 'agent-models');
const _file = (root, p) => path.join(_dir(root), `${String(p).replace(/[^a-z0-9._-]/gi, '_')}.json`);
const _base = (p) => String(p || '').toLowerCase().split(':')[0];

function _load(provider, root) {
  try { return JSON.parse(fs.readFileSync(_file(root, provider), 'utf8')); } catch (_) { return null; }
}
function _save(provider, root, doc) {
  fs.mkdirSync(_dir(root), { recursive: true });
  const f = _file(root, provider), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2)); fs.renameSync(tmp, f);
}

function get(provider, { root = ROOT } = {}) {
  const p = _base(provider);
  if (!p) throw new Error('agent-self-model.get: a provider is required');
  const seed = SEED[p] || { intent: 'an agent Nexus can dispatch to', needs: [], needsSource: 'none recorded yet', constraints: [] };
  const stored = _load(p, root) || {};
  return {
    provider: p, ...seed, ...stored,
    needs: [...new Set([...(seed.needs || []), ...((stored.needs) || [])])],
    constraints: [...new Set([...(seed.constraints || []), ...((stored.constraints) || [])])],
    learned: stored.learned || { byJob: {}, notes: [] },
    proposals: stored.proposals || [],
  };
}

function observe(provider, { jobType = 'unknown', outcome = 'unknown', cls = null, note = null } = {}, { root = ROOT } = {}) {
  const p = _base(provider);
  const doc = _load(p, root) || {};
  const L = doc.learned || { byJob: {}, notes: [] };
  const j = L.byJob[jobType] || (L.byJob[jobType] = {});
  j[outcome] = (j[outcome] || 0) + 1;
  if (outcome !== 'ok' && note) { L.notes.push({ at: Date.now(), jobType, outcome, cls, note: String(note).slice(0, 300) }); L.notes = L.notes.slice(-KEEP_NOTES); }
  doc.learned = L;
  _save(p, root, doc);
  return L;
}

function interrogationPrompt(provider, issue, { root = ROOT } = {}) {
  if (!issue || !issue.summary) throw new Error('agent-self-model.interrogationPrompt: issue.summary is required');
  const m = get(provider, { root });
  const fails = m.learned.notes.slice(-5).map(n => `- ${n.jobType}: ${n.outcome}${n.cls ? ` (${n.cls})` : ''} — ${n.note}`);
  return [
    `You are ${m.provider}, one of the agents Nexus (a local build system) dispatches coding work to through a browser tab. Nexus is trying to understand how to work with you better. Answer honestly; "I don't know" is a valid answer.`,
    `## What Nexus currently believes about you`,
    `- Your role: ${m.intent}`,
    `- What you need in a brief (${m.needsSource}): ${m.needs.length ? m.needs.join('; ') : 'nothing recorded yet'}`,
    `- Constraints Nexus has seen: ${m.constraints.length ? m.constraints.join('; ') : 'none recorded'}`,
    fails.length ? `- Recent failures with you:\n${fails.join('\n')}` : '- No failures with you are recorded yet.',
    `## The issue`,
    issue.summary,
    issue.evidence ? `Evidence (from Nexus's logs, verbatim):\n\`\`\`\n${String(issue.evidence).slice(0, 4000)}\n\`\`\`` : '',
    issue.brief ? `The brief you were given:\n\`\`\`\n${String(issue.brief).slice(0, 3000)}\n\`\`\`` : '',
    `## Answer with exactly one JSON block and nothing else`,
    '```json',
    '{ "root_cause": "…", "your_part": "what in your own behaviour contributed, or \\"none\\"", "proposed_fix": { "where": "brief | pipeline | your output", "what": "…" }, "what_you_need_in_briefs": ["…"], "confidence": 0.0 }',
    '```',
  ].filter(Boolean).join('\n');
}

function parseAnswer(text) {
  const m = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/) || [null, String(text || '')];
  let j; try { j = JSON.parse(m[1].trim()); } catch (e) { return { ok: false, error: `no JSON block could be read: ${e.message}` }; }
  const miss = ['root_cause', 'proposed_fix'].filter(k => !(k in j));
  if (miss.length) return { ok: false, error: `the answer lacks ${miss.join(', ')}` };
  const c = Number(j.confidence);
  return { ok: true, answer: { root_cause: String(j.root_cause), your_part: String(j.your_part || 'none'), proposed_fix: j.proposed_fix,
    needs: Array.isArray(j.what_you_need_in_briefs) ? j.what_you_need_in_briefs.map(String).slice(0, 10) : [], confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : null } };
}

function propose(provider, answer, { root = ROOT, issue = null } = {}) {
  const p = _base(provider);
  const doc = _load(p, root) || {};
  const prop = { id: `prop-${Date.now().toString(36)}`, at: Date.now(), status: 'proposed', issue: issue && issue.summary ? String(issue.summary).slice(0, 300) : null, ...answer };
  doc.proposals = [...(doc.proposals || []), prop];
  _save(p, root, doc);
  return prop;
}

/** decide(provider, id, 'accepted'|'rejected', { root }) — James's call on a proposal; an accepted one's needs join the model */
function decide(provider, id, status, { root = ROOT } = {}) {
  if (!['accepted', 'rejected'].includes(status)) throw new Error(`agent-self-model.decide: status must be accepted or rejected, got ${status}`);
  const p = _base(provider);
  const doc = _load(p, root) || {};
  const prop = (doc.proposals || []).find(x => x.id === id);
  if (!prop) throw new Error(`agent-self-model.decide: no proposal ${id} for ${p}`);
  prop.status = status; prop.decidedAt = Date.now();
  if (status === 'accepted' && prop.needs && prop.needs.length) doc.needs = [...new Set([...(doc.needs || []), ...prop.needs])];
  _save(p, root, doc);
  return prop;
}

function briefNeeds(provider, { root = ROOT } = {}) { return get(provider, { root }).needs; }

module.exports = { MODULE_ID, VERSION, SEED, get, observe, interrogationPrompt, parseAnswer, propose, decide, briefNeeds };
