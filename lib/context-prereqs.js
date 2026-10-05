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
 *   check({ domain, repoDir, message, agentId, record, memorySearch, …the domain's own inputs }) →
 *     { domain, intent, target, items: [{ id, need, status: found|remembered|missing, source, detail, ids, content }],
 *       ask: [questions], lines: [one per item], complete, shadow }
 *
 * §0.39.339 SB39 — James: "we could use that for more than coding. coudl use it for debugging, dom in clearglass, or any
 * data fed into a pipeline". The engine is general; a DOMAIN says what its questions are and where things are found:
 *   { name, sourceName, intentOf(ctx), checklistFor(intent, ctx) → [{ id, need, ask? }], prepare(ctx) → state,
 *     find(item, state, ctx) → { detail, ids?, content? } | null, missingDetail(item, state, ctx), memoryQuery(item, ctx) }
 * The engine does the rest, the same for every domain: the domain's own source, then past conversations, then ask;
 * the lines, the gaps. Built in: 'code' (SB38) and 'data' (any record fed into a pipeline — its needs are the fields the
 * caller names) and 'topic' (anything else: every store Nexus keeps). registerDomain() takes more. A found item carries
 * its content, so the working set can start from it (copilot/lib/workset.js, SB39).
 */

const path = require('path');

const MODULE_ID = 'lib.context-prereqs';
const VERSION = '1.1.0';   // 1.1.0 (0.39.339): the engine and its domains — 'code' (1.0.0's behaviour), 'data', 'topic'; learn() for any of them; found items carry content

const CONTENT_MAX = 1500;   // chars of an item's own context handed to the working set

// ── the 'code' domain (SB38) ─────────────────────────────────────────────────────────────────────────────────────
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
const _cap = (t, n = CONTENT_MAX) => { t = String(t == null ? '' : t); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** the code domain's checklist for an intent: [{ id, need, from: 'index'|'question', key, ask? }] */
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

const CODE = {
  name: 'code',
  sourceName: 'index',
  intentOf: (ctx) => intentOf(ctx.message),
  checklistFor: (intent) => checklistFor(intent),
  prepare(ctx) {
    const CI = ctx.codeIntel || require('./code-intel/index.js');
    const st = { CI, target: null, card: null, why: null };
    if (!ctx.repoDir) { st.why = 'no repo directory'; return st; }
    try {
      const q = CI.query(ctx.repoDir, String(ctx.message || ''), { limit: 3 });
      if (q.error) st.why = q.error;
      const top = q.hits && q.hits[0];
      if (top) { st.card = (CI.load(ctx.repoDir).cards || {})[top.id] || null; st.target = { id: top.id, file: top.file, name: top.name || null, at: `${top.file}:${top.range.start_line}-${top.range.end_line}` }; }
    } catch (e) { st.why = e.message; }
    return st;
  },
  find(it, st, ctx) {
    if (it.from === 'question') return SAYS[it.key].test(String(ctx.message || '')) ? { detail: 'said in the question', source: 'the question', content: String(ctx.message || '') } : null;
    const card = st.card;
    if (!card) return null;
    if (it.key === 'target') {
      let code = '';
      try { const r = st.CI.card(ctx.repoDir, card.id, { code: true, around: false }); code = (r && r.text) || ''; } catch (_) { /* the card alone */ }
      return { detail: _brief(card), ids: [card.id], content: _cap([_brief(card), card.signature, card.summary || card.doc, code].filter(Boolean).join('\n')) };
    }
    if (it.key === 'tests') { const t = card.tests || []; return { detail: t.length ? `${t.length} test chunk(s)` : 'none cover it', ids: t.slice(0, 5), content: t.length ? `tests covering ${_brief(card)}: ${t.slice(0, 10).join(', ')}` : '' }; }
    const l = card[it.key] || [];
    const detail = l.length ? `${_names(l)}${l.length > 4 ? `, ${l.length - 4} more` : ''}` : 'none';
    return { detail, ids: l.slice(0, 5).map(u => u.chunkId).filter(Boolean), content: l.length ? `${it.need} (${_brief(card)}): ${_names(l, 12)}` : '' };
  },
  missingDetail: (it, st) => it.from === 'question' ? 'not in the question or a past conversation' : (st.why ? `not in the index (${st.why})` : 'nothing in the index matched'),
  askFor: (it) => it.ask || 'Which part of the project do you mean — a file, a function or a feature name?',
  memoryQuery: (it, ctx) => it.from === 'question' ? `${ctx.message || ''} ${it.need}` : String(ctx.message || ''),
};

// ── the 'data' domain (SB39): any record fed into a pipeline ───────────────────────────────────────────────────────
// ctx.input  the record (an object); ctx.needs [{ id, need, path: 'a.b[0].c', ask, test?(value) → bool }]
const _at = (obj, p) => String(p || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
const _present = (v) => !(v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length));
const DATA = {
  name: 'data',
  sourceName: 'the input',
  intentOf: (ctx) => ctx.intent || 'process',
  checklistFor: (intent, ctx) => (ctx.needs || []).map(n => ({ id: n.id, need: n.need || n.id, path: n.path || n.id, ask: n.ask, test: n.test })),
  prepare: () => ({}),
  find(it, st, ctx) {
    const v = _at(ctx.input, it.path);
    if (!_present(v) || (typeof it.test === 'function' && !it.test(v))) return null;
    const shown = typeof v === 'string' ? v : JSON.stringify(v);
    return { detail: _cap(shown, 120), content: `${it.need} (${it.path}): ${_cap(shown)}` };
  },
  missingDetail: (it, st, ctx) => (_present(_at(ctx.input, it.path)) ? `${it.path} is there but not what is needed` : `${it.path} is not in the input`),
  askFor: (it) => it.ask || `What is ${it.need}?`,
  memoryQuery: (it, ctx) => `${it.need} ${ctx.message || ''}`,
};

// ── the 'topic' domain (SB39): anything an agent wants to learn — every store Nexus keeps ─────────────────────────
// James: "im saying for anything it wants to learn. agnostic tool for context". The source is lib/context-atlas.js —
// one search across cortex's tables, the repo graph, the system blueprint, every spec and changelog, every agent's
// exchanges — and the code index when there is a repo. What it is · where it lives · what it connects to · what was said
// or done about it before (that one may be empty: nothing before is not a question).
const _hitLine = (h) => `[${h.source}${h.id ? ` ${h.id}` : ''}] ${String(h.snippet || '').replace(/\s+/g, ' ').trim()}`;
const _bySource = (hits, rx, not = null) => (hits || []).filter(h => rx.test(h.source) && !(not && not.test(h.source)));
const TOPIC = {
  name: 'topic',
  sourceName: 'Nexus\'s stores',
  intentOf: () => 'learn',
  checklistFor: () => [
    { id: 'what', need: 'what it is', ask: 'What is it — what does it do, or where did it come up?' },
    { id: 'where', need: 'where it lives', ask: 'Where does it live — which system, file or page?' },
    { id: 'connects', need: 'what it connects to', ask: 'What does it work with — what feeds it, what uses it?' },
    { id: 'before', need: 'what was said or done about it before', optional: true },
  ],
  async prepare(ctx) {
    const st = { hits: [], code: null, why: null };
    const about = String(ctx.message || '');
    try {
      const r = await (ctx.atlas || require('./context-atlas.js')).search(about, { limit: 30, perSource: 4, repoDir: ctx.repoDir || null, repoUuid: ctx.repoUuid || null });
      if (r && r.ok) st.hits = r.hits; else st.why = (r && r.error) || 'the stores did not answer';
    } catch (e) { st.why = e.message; }
    if (ctx.repoDir) { try { const c = CODE.prepare(ctx); st.code = c.card ? c : null; } catch (_) { /* no code index */ } }
    return st;
  },
  find(it, st, ctx) {
    const pick = (list, n = 3) => list.slice(0, n);
    let hits = [];
    if (it.id === 'what') hits = pick(_bySource(st.hits, /^(spec|changelog|blueprint|jaa:|vector)/, /^jaa:(chat_log|agent_notes)$/));
    if (it.id === 'where') {
      if (st.code) return { detail: _brief(st.code.card), ids: [st.code.card.id], content: CODE.find({ key: 'target' }, st.code, ctx).content, source: 'the code index' };
      hits = pick(_bySource(st.hits, /^(blueprint|repo-graph)$/), 2);
    }
    if (it.id === 'connects') {
      if (st.code) { const c = st.code.card; const rel = [..._names(c.uses || [], 4).split(', '), ..._names(c.usedBy || [], 4).split(', ')].filter(Boolean); if (rel.length) return { detail: rel.slice(0, 6).join(', '), source: 'the code index', content: `${_brief(c)} uses ${_names(c.uses || [], 8) || 'nothing'}; used by ${_names(c.usedBy || [], 8) || 'nothing'}` }; }
      hits = pick(_bySource(st.hits, /^(repo-graph|blueprint|jaa:(relationship_lattice|person_model_edges|component_ledger))$/), 3);
    }
    if (it.id === 'before') hits = pick(_bySource(st.hits, /^(downloads|jaa:(chat_log|agent_notes|repo_hat_memory|decision_log|memory_unified))$/), 3);
    if (!hits.length) return null;
    return { detail: _cap(hits.map(h => h.source).join(', '), 120), ids: hits.map(h => `${h.source}:${h.id}`).filter(Boolean), content: _cap(hits.map(_hitLine).join('\n')) };
  },
  missingDetail: (it, st) => st.why ? `not found (${st.why})` : 'nothing in Nexus\'s stores',
  askFor: (it) => it.ask,
  memoryQuery: (it, ctx) => `${ctx.message || ''} ${it.need}`,
};

const DOMAINS = new Map([['code', CODE], ['data', DATA], ['topic', TOPIC]]);
/** registerDomain(domain) — a new kind of checklist (a Clear Glass page, a failed run …). Returns the domain names. */
function registerDomain(d) {
  for (const k of ['name', 'intentOf', 'checklistFor', 'find']) if (!d || !d[k]) throw new Error(`[${MODULE_ID}] a domain needs ${k}`);
  DOMAINS.set(d.name, { prepare: () => ({}), missingDetail: () => 'not found', askFor: (it) => it.ask || `What is ${it.need}?`, memoryQuery: (it, ctx) => `${it.need} ${ctx.message || ''}`, sourceName: d.name, ...d });
  return [...DOMAINS.keys()];
}
function domains() { return [...DOMAINS.keys()]; }

/** a past conversation that answers an item: this repo's agent first, then copilot — never another project's */
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

/** the engine, once, as a generator: it yields what a domain returned (a value, or a promise for an async domain) */
function* _engine(opts) {
  const { domain = 'code', agentId = null, record = false, subject = null } = opts;
  const D = DOMAINS.get(domain);
  if (!D) throw new Error(`[${MODULE_ID}] unknown domain "${domain}" — one of: ${domains().join(', ')}`);
  let memorySearch = opts.memorySearch;
  if (memorySearch === undefined) { try { memorySearch = require('./agent-memory.js').search; } catch (_) { memorySearch = null; } }
  const ctx = { ...opts };
  const intent = D.intentOf(ctx);
  let st;
  try { st = (yield D.prepare(ctx)) || {}; } catch (e) { st = { why: e.message }; }

  const items = [];
  for (const it of D.checklistFor(intent, ctx)) {
    const item = { id: it.id, need: it.need, status: 'missing', source: null, detail: null, ids: [], content: '' };
    let f = null;
    try { f = yield D.find(it, st, ctx); } catch (e) { f = null; st.why = st.why || e.message; }
    if (f) Object.assign(item, { status: 'found', source: f.source || D.sourceName, detail: f.detail || null, ids: f.ids || [], content: f.content || '' });
    else {
      const m = _remembered(memorySearch, D.memoryQuery(it, ctx), agentId);
      if (m) Object.assign(item, { status: 'remembered', source: 'past conversation', detail: m.detail, ids: m.ids, content: m.detail });
      else if (it.optional) Object.assign(item, { status: 'found', source: D.sourceName, detail: 'none yet' });   // nothing before is not a question
      else { item.detail = D.missingDetail(it, st, ctx); item.ask = D.askFor(it, st, ctx); }
    }
    items.push(item);
  }

  const ask = [...new Set(items.filter(i => i.status === 'missing' && i.ask).map(i => i.ask))];
  const mark = { found: '✓', remembered: '↺', missing: '✗' };
  const lines = items.map(i => `${mark[i.status]} ${i.need}: ${i.detail || ''}${i.source && i.source !== D.sourceName ? ` — from ${i.source}` : ''}`);
  if (ask.length) lines.push(...ask.map(q => `? ${q}`));
  const target = st.target || null;

  // §SB38 — what was not found is a gap (lib/shadow.js: declared, settled, each absence recorded), so intelligence
  // sees what the agents keep lacking
  let shadow = null;
  if (record) {
    try {
      const SH = require('./shadow.js');
      const sh = SH.declare({ step: domain === 'code' ? 'context.prereqs' : `context.prereqs.${domain}`, expects: { fields: items.map(i => i.id) }, subject: subject || { intent, target: target && target.id }, causedBy: `context-prereqs:${agentId || 'agent'}` });
      const r = SH.settle(sh, { fields: items.filter(i => i.status !== 'missing').map(i => i.id) });
      shadow = { id: sh.id, absent: (r.absent && r.absent.fields) || [], gaps: (r.gaps || []).length };
    } catch (e) { shadow = { error: e.message }; }
  }
  return { domain, intent, target, items, ask, lines, complete: !items.some(i => i.status === 'missing'), shadow };
}

/**
 * check({ domain = 'code', …ctx }) — the sync driver, for a domain whose sources are synchronous (code, data). Never
 * throws on a source: one that cannot be read leaves its items missing, with the reason, and they are asked. An
 * unknown domain, or an async one (use learn()), is refused by name.
 */
function check(opts = {}) {
  const g = _engine(opts);
  let r = g.next();
  while (!r.done) {
    if (r.value && typeof r.value.then === 'function') throw new Error(`[${MODULE_ID}] the "${opts.domain}" domain is async — use learn()`);
    r = g.next(r.value);
  }
  return r.value;
}

/**
 * learn({ about, domain?, …ctx }) — the async driver, for every domain. §SB39 — James: "for anything it wants to learn.
 * agnostic tool for context". The domain, when not named: 'data' with an input, 'code' when the thing names code in a
 * repo (the code index ranks a chunk for it), else 'topic' (every store).
 */
async function learn(opts = {}) {
  const o = { ...opts, message: opts.message || opts.about || '' };
  if (!o.domain) {
    if (o.input !== undefined) o.domain = 'data';
    else if (o.repoDir && /[\w$]+\(|[\w-]+\.(js|ts|mjs|cjs|py|json|css|html)\b|\b(function|class|method|file|module|component)\b/i.test(o.message)) o.domain = 'code';
    else o.domain = 'topic';
  }
  const g = _engine(o);
  let r = g.next(), v;
  while (!r.done) {
    try { v = await r.value; } catch (e) { r = g.throw(e); continue; }
    r = g.next(v);
  }
  return r.value;
}

module.exports = { MODULE_ID, VERSION, check, learn, intentOf, checklistFor, registerDomain, domains };
