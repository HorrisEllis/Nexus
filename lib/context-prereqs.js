'use strict';
/**
 * lib/context-prereqs.js — the questions first: what context a question needs, looked for before the agent answers,
 * and what is not found asked of James instead of guessed.
 * comp_id: nexus.lib.context-prereqs
 * UUID: nexus-lib-context-prereqs-v1-0000-2026-1005-jamesbrooks-001
 *
 * §0.39.338 SB38 (docs/2026-10-05-build-from-the-spec-phasemap.spec). James: "predetermine what context is needed. So
 * make like prerequisites. Then uh, use those as a checklist for context." · "Yeah, the, the prerequisites, the
 * questions, right? That way, then if it can't, if it can't find context, then it'll, it'll just ask me the rest, or
 * reference the past conversations".
 *
 * No model anywhere in here (a 3B model is the weakest link in writing its own checklist):
 *   1. intent      explain · change · debug · build — from the question's words
 *   2. target      the chunk the Code tab's search ranks first (lib/code-intel query)
 *   3. checklist   what that intent needs of that target; each item checkable — a chunk id, or a fact of the question
 *   4. looked for  the index first (lib/code-intel cards: the chunk, what it uses, what uses it, its tests), then past
 *                  conversations (lib/agent-memory search: this repo's agent, then copilot — never another project's)
 *   5. not found   a question for James — never a guess. Recorded as a gap through lib/shadow.js (declare → settle):
 *                  his answer becomes a past conversation, so the same question finds it next time.
 *
 *   check({ repoDir, message, agentId, record, memorySearch }) →
 *     { intent, target, items: [{ id, need, status: found|remembered|missing, source, detail, ids }], ask: [questions],
 *       lines: [one per item], shadow }
 */

const path = require('path');

const MODULE_ID = 'lib.context-prereqs';
const VERSION = '1.0.0';

// the words that say what kind of question this is; checked in this order (a "why does X fail" is debug, not explain)
const INTENTS = [
  ['debug',  /\b(error|errors|fail(s|ed|ing)?|broken|crash(es|ed)?|bug|exception|throws?|not working|doesn'?t work|stack ?trace|undefined is not)\b/i],
  ['change', /\b(add|change|fix|update|refactor|rename|remove|delete|replace|make it|implement|modify|move|rewrite|improve)\b/i],
  ['build',  /\b(build|create|new|write an?|scaffold|generate|set up|start a)\b/i],
  ['explain', /./],
];
// what a question already says, for the items only James can answer
const SAYS = {
  acceptance: /\b(so that|so it|should|must|needs? to|instead|expected|to make|so the|until|without|when .+ then)\b/i,
  error: /(["'`].{6,}["'`]|\b\w*(Error|Exception)\b|\bat .+:\d+|\bcode \d{3}\b|\bE[A-Z]{3,}\b|\b(stack|trace|log)\b)/,
  place: /([\w.-]+\/[\w./-]+|\b(in|under|inside|into) (the )?[\w.-]+ (folder|dir|directory|module|system|tab|file)\b)/i,
};

function intentOf(message) {
  for (const [name, rx] of INTENTS) if (rx.test(String(message || ''))) return name;
  return 'explain';
}

const _brief = (c) => c ? `${c.qualifiedName || c.name || c.kind || c.id} (${c.file}:${c.range.start_line}-${c.range.end_line})` : '';
const _names = (list, n = 4) => (list || []).slice(0, n).map(u => `${u.name || u.chunkId}${u.file ? ` (${u.file})` : ''}`).join(', ');

/** the checklist for an intent: [{ id, need, from: 'index'|'question', key }] */
function checklistFor(intent) {
  const chunk = [{ id: 'target', need: 'the code it is about', from: 'index', key: 'target' }];
  const graph = [{ id: 'uses', need: 'what it uses', from: 'index', key: 'uses' }, { id: 'used-by', need: 'what uses it', from: 'index', key: 'usedBy' }];
  if (intent === 'change') return [...chunk, ...graph, { id: 'tests', need: 'the tests that cover it', from: 'index', key: 'tests' },
    { id: 'acceptance', need: 'what it should do once changed', from: 'question', key: 'acceptance', ask: 'What should it do once it is changed — how will you know it is right?' }];
  if (intent === 'debug') return [...chunk, { id: 'used-by', need: 'what calls it', from: 'index', key: 'usedBy' }, { id: 'tests', need: 'the tests that cover it', from: 'index', key: 'tests' },
    { id: 'error', need: 'the error exactly as it appeared', from: 'question', key: 'error', ask: 'What is the exact error or log line, and what were you doing when it happened?' }];
  if (intent === 'build') return [{ id: 'similar', need: 'what already exists like it', from: 'index', key: 'target' },
    { id: 'place', need: 'where it goes', from: 'question', key: 'place', ask: 'Where should it go — which system, folder or tab?' },
    { id: 'acceptance', need: 'what done looks like', from: 'question', key: 'acceptance', ask: 'What should it do — what does done look like to you?' }];
  return [...chunk, ...graph];
}

/** a past conversation that answers an item: agent-memory search over every agent's exchanges */
function _remembered(memorySearch, query, agentId) {
  if (typeof memorySearch !== 'function') return null;
  try {
    // this repo's own agent first, then copilot (James's general chats) — never another project's agent: a word in
    // common with some other repo's conversation is not an answer about this one
    const hits = [...(agentId ? memorySearch({ query, agentId, limit: 3 }) || [] : []), ...(memorySearch({ query, agentId: 'copilot', limit: 3 }) || [])];
    const hit = hits.find(h => (h.score || 0) >= 2);
    return hit ? { detail: String(hit.summary || '').replace(/\s+/g, ' ').slice(0, 220), ids: [hit.id].filter(Boolean) } : null;
  } catch (_) { return null; }
}

/**
 * check({ repoDir, message, agentId, record, memorySearch, codeIntel }) — see the header. Never throws: a store that
 * cannot be read leaves its items missing, with the reason, and they are asked.
 */
function check({ repoDir = null, message = '', agentId = null, record = false, memorySearch = undefined, codeIntel = null, subject = null } = {}) {
  const msg = String(message || '');
  const intent = intentOf(msg);
  const CI = codeIntel || require('./code-intel/index.js');
  if (memorySearch === undefined) { try { memorySearch = require('./agent-memory.js').search; } catch (_) { memorySearch = null; } }

  let target = null, card = null, why = null;
  if (repoDir) {
    try {
      const q = CI.query(repoDir, msg, { limit: 3 });
      if (q.error) why = q.error;
      const top = q.hits && q.hits[0];
      if (top) { card = (CI.load(repoDir).cards || {})[top.id] || null; target = { id: top.id, file: top.file, name: top.name || null, at: `${top.file}:${top.range.start_line}-${top.range.end_line}` }; }
    } catch (e) { why = e.message; }
  } else why = 'no repo directory';

  const items = [];
  for (const it of checklistFor(intent)) {
    const item = { id: it.id, need: it.need, status: 'missing', source: null, detail: null, ids: [] };
    if (it.from === 'index') {
      if (card) {
        item.status = 'found'; item.source = 'index';
        if (it.key === 'target') { item.detail = _brief(card); item.ids = [card.id]; }
        else if (it.key === 'tests') { const t = card.tests || []; item.detail = t.length ? `${t.length} test chunk(s)` : 'none cover it'; item.ids = t.slice(0, 5); }
        else { const l = card[it.key] || []; item.detail = l.length ? `${_names(l)}${l.length > 4 ? `, ${l.length - 4} more` : ''}` : 'none'; item.ids = l.slice(0, 5).map(u => u.chunkId).filter(Boolean); }
      } else {
        const m = _remembered(memorySearch, msg, agentId);
        if (m) Object.assign(item, { status: 'remembered', source: 'past conversation', detail: m.detail, ids: m.ids });
        else { item.detail = why ? `not in the index (${why})` : 'nothing in the index matched'; item.ask = 'Which part of the project do you mean — a file, a function or a feature name?'; }
      }
    } else if (SAYS[it.key].test(msg)) {
      Object.assign(item, { status: 'found', source: 'the question', detail: 'said in the question' });
    } else {
      const m = _remembered(memorySearch, `${msg} ${it.need}`, agentId);
      if (m) Object.assign(item, { status: 'remembered', source: 'past conversation', detail: m.detail, ids: m.ids });
      else { item.detail = 'not in the question or a past conversation'; item.ask = it.ask; }
    }
    items.push(item);
  }

  const ask = [...new Set(items.filter(i => i.status === 'missing' && i.ask).map(i => i.ask))];
  const mark = { found: '✓', remembered: '↺', missing: '✗' };
  const lines = items.map(i => `${mark[i.status]} ${i.need}: ${i.detail || ''}${i.source && i.source !== 'index' ? ` — from ${i.source}` : ''}`);
  if (ask.length) lines.push(...ask.map(q => `? ${q}`));

  // §SB38 — what was not found is a gap (lib/shadow.js: declared, settled, each absence recorded), so intelligence
  // sees what the agents keep lacking
  let shadow = null;
  if (record) {
    try {
      const SH = require('./shadow.js');
      const sh = SH.declare({ step: 'context.prereqs', expects: { fields: items.map(i => i.id) }, subject: subject || { intent, target: target && target.id }, causedBy: `context-prereqs:${agentId || 'agent'}` });
      const r = SH.settle(sh, { fields: items.filter(i => i.status !== 'missing').map(i => i.id) });
      shadow = { id: sh.id, absent: (r.absent && r.absent.fields) || [], gaps: (r.gaps || []).length };
    } catch (e) { shadow = { error: e.message }; }
  }
  return { intent, target, items, ask, lines, shadow };
}

module.exports = { MODULE_ID, VERSION, check, intentOf, checklistFor };
