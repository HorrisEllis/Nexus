'use strict';
/**
 * lib/context-atlas.js — one door to every memory system and graph NEXUS keeps.
 * comp_id: nexus.lib.context-atlas
 * UUID: nexus-lib-context-atlas-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "idearium agents should be able to find the context easily when talking to them, all of the
 * memory systems, graphs, etc."
 *
 * THE MAP, measured before building (not assumed):
 *   - cortex's JAA store holds ~70 named tables written by ~40 modules (chat_log, memory_unified, crystals, fix_map,
 *     bep_patterns, gaps, fault_log, agent_notes, repo_hat_memory, person_model_*, idearium_ideas, decision_log,
 *     tool_index, case_index, opportunities …). Each has its own reader, if it has one at all.
 *   - graphs: each repo's graph.json (lib/repo-context.js), the system blueprint (blueprint-index.json, 590KB),
 *     person_model_nodes/edges, relationship_lattice.
 *   - semantic memory: lib/vector-memory.js (Ollama embeddings) — only when initialised in the calling process.
 *   - the download manager (0.39.269): every agent exchange, filed by agent — lib/agent-memory.js search().
 *   - prose: every .spec and CHANGELOG — why things are the way they are.
 *   - agent tools that read one slice each: query_recall, agent_chat_search, meta_query, nexus_map, nexus_intelligence,
 *     intelligence_query, idearium.repo_chunks.tool, fault_log, notes_todo …
 * An agent in an Idearium compartment was shown none of this. It could only find a memory if it already knew which of
 * ~15 tools read which of ~70 tables. directory() is the answer to "what is there"; search() is one query across all
 * of it, every hit citing its source and id so it can be fetched whole with get().
 *
 * RULES: read-only. Deterministic keyword ranking (no model, no network) so it works on a 4 GB GPU box with Ollama
 * down; vector search is added only when vector-memory is ready in this process, and says so when it is not. Noisy
 * telemetry tables (event_log, sigma_*, ledgers) are skipped by default and named in `skipped`, never silently.
 */

const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.context-atlas';
const VERSION = '1.0.0';
const ROOT = path.join(__dirname, '..');

// What each table IS, and which tool reads it deeper. A table not listed here is still searched — it is just
// described by its name. Keep this list honest: every entry was checked against a real writer.
const DESCRIBED = Object.freeze({
  chat_log:               { system: 'cortex',    what: 'every AI exchange (NCP, Ollama, direct) with content', tool: 'agent_chat_search' },
  guardian_chat_log:      { system: 'guardian',  what: 'guardian-side chat transcript', tool: 'agent_chat_search' },
  memory_unified:         { system: 'cortex',    what: 'the unified push/recall store — current long-term memory', tool: 'query_recall' },
  cortex_memory:          { system: 'cortex',    what: 'short-term cortex memory rows', tool: 'query_recall' },
  working_memory:         { system: 'cortex',    what: 'this-session working memory (decays in 2h)', tool: 'query_recall' },
  crystals:               { system: 'intelligence', what: 'crystallised patterns (graduated long-term knowledge)', tool: 'nexus_intelligence' },
  bep_patterns:           { system: 'cortex',    what: 'behaviour/error patterns learned from runs', tool: 'query_recall' },
  fix_map:                { system: 'cortex',    what: 'failure → fix that worked', tool: 'query_recall' },
  failure_modes:          { system: 'cortex',    what: 'named failure modes', tool: 'fault_log' },
  fault_log:              { system: 'nexus',     what: 'every fault, richly tagged — first-class failure data', tool: 'fault_log' },
  fault_taxonomy:         { system: 'cortex',    what: 'fault classes and their aggregate state', tool: 'fault_log' },
  gaps:                   { system: 'cortex',    what: 'open gaps (gap field) — what is missing or broken', tool: 'diagnose' },
  decision_log:           { system: 'cortex',    what: 'routing/agent decisions and why', tool: 'raid_snr' },
  raid_decisions:         { system: 'orchestrator', what: 'RAID routing decisions', tool: 'raid_snr' },
  agent_notes:            { system: 'nexus',     what: 'per-agent constraint notes (token limits, quirks)', tool: 'agent_notes' },
  agent_capability:       { system: 'nexus',     what: 'measured per-agent capability stats', tool: 'agent_capability' },
  agent_model_hypotheses: { system: 'nexus',     what: 'hypotheses about each agent model', tool: null },
  repo_hat_memory:        { system: 'idearium',  what: 'what each repo agent learned about its project (@learn)', tool: 'nexus.context.tool' },
  repo_agent_log:         { system: 'idearium',  what: 'repo agent exchanges per compartment', tool: 'nexus.context.tool' },
  repo_agent_settings:    { system: 'idearium',  what: 'repo agent provider / scope / prompt blocks', tool: null },
  idearium_ideas:         { system: 'idearium',  what: 'ideas, with provenance (user vs agent)', tool: 'propose_idea' },
  idearium_project_containers: { system: 'idearium', what: 'project containers', tool: null },
  person_model_nodes:     { system: 'copilot',   what: 'the model of James — nodes (graph)', tool: null },
  person_model_edges:     { system: 'copilot',   what: 'the model of James — edges (graph)', tool: null },
  person_model_sessions:  { system: 'copilot',   what: 'session ledger chaining conversations', tool: null },
  relationship_lattice:   { system: 'copilot',   what: 'relationship lattice (graph)', tool: null },
  self_model:             { system: 'copilot',   what: 'copilot\'s model of itself', tool: 'copilot_identity' },
  tool_index:             { system: 'nexus',     what: 'living tool index: consumers, intents, edge cases', tool: 'nexus_help' },
  tool_call_reuse:        { system: 'nexus',     what: 'past tool results for reuse', tool: null },
  reuse_index:            { system: 'nexus',     what: 'reusable outputs index', tool: null },
  case_index:             { system: 'nexus',     what: 'queryable case library (compartment outcomes)', tool: null },
  notes_todos:            { system: 'nexus',     what: 'notes and todos', tool: 'notes_todo' },
  interstitial_spaces:    { system: 'intelligence', what: 'liminal/interstitial spaces', tool: 'nexus_intelligence' },
  forged_tools:           { system: 'nexus',     what: 'tools agents forged', tool: 'forge_tool' },
  forged_hats:            { system: 'nexus',     what: 'hats (personas) forged', tool: 'hat_forge' },
  scheduled_tasks:        { system: 'nexus',     what: 'scheduled tasks', tool: 'schedule_task' },
  triggers:               { system: 'nexus',     what: 'registered triggers', tool: 'register_trigger' },
  artifacts:              { system: 'guardian',  what: 'artifacts produced by jobs', tool: null },
  snapshots:              { system: 'nexus',     what: 'snapshots', tool: null },
  opportunities:          { system: 'nexus',     what: 'job/gig/lead pipeline (stage, score, drafts, fill reports)', tool: 'nexus.opportunity.tool' },
  opportunity_profile:    { system: 'nexus',     what: 'James\'s job profile (skills, roles, policy)', tool: 'nexus.opportunity.tool' },
  opportunity_answers:    { system: 'nexus',     what: 'answer bank for application questions', tool: 'nexus.opportunity.tool' },
  opportunity_ledger:     { system: 'nexus',     what: 'every pipeline transition and action', tool: 'nexus.opportunity.tool' },
  opportunity_outcomes:   { system: 'nexus',     what: 'what applications led to (responses, interviews, offers) — learned weights', tool: 'nexus.opportunity.tool' },
  cg_site_memory:         { system: 'clear-glass', what: 'what copilot learned about each site: actions that worked or failed, healed selectors', tool: 'clearglass.learned.tool' },
  cg_learned_flows:       { system: 'clear-glass', what: 'flows that worked on a site, replayable, promotable to macros', tool: 'clearglass.learned.tool' },
  ollama_activity:        { system: 'ollama',    what: 'every Ollama call', tool: null },
  idearium_spec_chunks:   { system: 'idearium',  what: 'spec chunks (large; opt-in: sources=["jaa:idearium_spec_chunks"])', tool: 'idearium.repo_chunks.tool', heavy: true },
  idearium_spec_manifests:{ system: 'idearium',  what: 'spec manifests (large; opt-in)', tool: null, heavy: true },
});
// Telemetry: high volume, low signal for "what do we know about X". Searchable by naming them in `sources`.
// §0.39.375 — activity_log (lib/activity-log/compartment.js) is telemetry too: left in, a repo agent was handed its own
// "task.chat running — <this very question> — started" row as memory for the question it was being asked.
const NOISY = new Set(['activity_log', 'event_log', 'sigma_records', 'sigma_live', 'sigma_rollups', 'component_ledger', 'cfr_tension_history', 'compaction_log',
  'decay_log', 'dedup_log', 'schema_drift', 'settings', 'active_traces', 'meta_observations', 'constitution_decisions', 'compartment_dom_ledger',
  'bus_subscriptions', 'integrity_baseline', 'raid_tunables', 'delta_records', 'seam_records', 'phasemap_history', 'queue_compartments']);
const MAX_ROWS_PER_TABLE = 20000;
const FIELD_CHARS = 4000;

function _jaa() { return require('../cortex/memory/jaa-db.js').jaaDB; }
function _storeDir() { try { return _jaa()._store().dir; } catch (_) { return process.env.JAA_DATA_DIR || path.join(ROOT, 'data', 'cortex', 'memory'); } }

function tables() {
  const dir = _storeDir();
  let names = [];
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.')).map(f => f.slice(0, -5)); } catch (_) {}
  // tables already loaded in this process but not yet flushed to disk
  // tables already loaded (or written) in this process but not yet flushed — JaaStore keeps them in a Map, debounces disk
  try { const st = _jaa()._store(); if (st && st._tables) for (const k of (st._tables instanceof Map ? st._tables.keys() : Object.keys(st._tables))) if (!names.includes(k)) names.push(k); } catch (_) {}
  return [...new Set(names)].sort();
}

const STOP = new Set('a an and are as at be by for from has have how i in is it its of on or that the this to was what when where which who why will with you your about did do does me my we our'.split(' '));
function qtokens(q) { return [...new Set(String(q || '').toLowerCase().split(/[^a-z0-9_.#+/-]+/).map(t => t.replace(/^[-./]+|[-./]+$/g, '')).filter(t => t.length > 1 && !STOP.has(t)))]; }

// Identifiers are not content: matching a query against a uuid or a foreign key only adds noise to scores and snippets.
const ID_KEY = /^(id|uuid|key|dedupKey|dedupeKey|shortid|hash)$|(Id|Uuid|Ids|Uuids)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function rowText(row) {
  const parts = [];
  for (const [k, v] of Object.entries(row || {})) {
    if (k.startsWith('_') || k === 'embedding' || k === 'vector' || ID_KEY.test(k)) continue;
    if (typeof v === 'string' && UUID_RE.test(v)) continue;
    if (typeof v === 'string') parts.push(v.length > FIELD_CHARS ? v.slice(0, FIELD_CHARS) : v);
    else if (Array.isArray(v) && v.length && typeof v[0] === 'string') parts.push(v.slice(0, 40).join(' '));
    else if (v && typeof v === 'object' && !Array.isArray(v)) { const s = JSON.stringify(v); parts.push(s.length > FIELD_CHARS ? s.slice(0, FIELD_CHARS) : s); }
  }
  return parts.join(' \n ');
}

function scoreText(text, toks, phrase) {
  if (!text || !toks.length) return 0;
  const lower = text.toLowerCase();
  let hit = 0;
  for (const t of toks) if (lower.includes(t)) hit++;
  if (!hit) return 0;
  const need = toks.length <= 2 ? toks.length : Math.ceil(toks.length * 0.5);
  if (hit < need) return 0;
  let s = hit / toks.length;
  if (phrase && phrase.length > 4 && lower.includes(phrase)) s += 0.5;
  return s;
}
function snippet(text, toks, len = 260) {
  const lower = text.toLowerCase();
  let at = -1; for (const t of toks) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  const start = Math.max(0, at - 80);
  return (start ? '…' : '') + text.slice(start, start + len).replace(/\s+/g, ' ').trim() + (start + len < text.length ? '…' : '');
}
const tsOf = (r) => r.ts || r._ts || r.updatedAt || r.createdAt || r.created_at || null;
// A table whose rows carry their own uuid (repo_hat_memory, person_model_*) is addressed by it; JaaStore's id is then a
// storage key the owning module never uses.
const idOf = (r) => r.uuid || r.id || r.key || null;

// ── prose sources: specs + changelogs (cached 60s) ─────────────────────────────────────────────────────────────
let _prose = null, _proseAt = 0;
function _proseFiles() {
  if (_prose && Date.now() - _proseAt < 60000) return _prose;
  const out = [];
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === 'data' || e.name.startsWith('.') || e.name === '_archive' || e.name === 'repos') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.spec$/.test(e.name) || (depth === 0 && /^CHANGELOG.*\.md$/.test(e.name))) {
        try { const st = fs.statSync(p); if (st.size < 400000) out.push({ path: path.relative(ROOT, p), mtime: st.mtimeMs }); } catch (_) {}
      }
    }
  };
  walk(ROOT);
  _prose = out; _proseAt = Date.now();
  return out;
}
function _searchProse(toks, phrase, limit) {
  const hits = [];
  for (const f of _proseFiles()) {
    let text; try { text = fs.readFileSync(path.join(ROOT, f.path), 'utf8'); } catch (_) { continue; }
    // score per paragraph, keep the best paragraph per file
    let best = null;
    for (const para of text.split(/\n\s*\n/)) {
      const s = scoreText(para, toks, phrase);
      if (s && (!best || s > best.s)) best = { s, para };
    }
    // prose is context, not memory: weighted below a direct record match so specs do not crowd out what was learned
    if (best) hits.push({ source: f.path.startsWith('CHANGELOG') ? 'changelog' : 'spec', id: f.path, score: +(best.s * 0.7).toFixed(3), snippet: snippet(best.para, toks, 320), ts: f.mtime });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── graphs ─────────────────────────────────────────────────────────────────────────────────────────────────────
function _searchRepoGraph(repoDir, toks, limit) {
  if (!repoDir) return [];
  let g; try { g = require('./repo-context.js').readGraph(repoDir); } catch (_) { return []; }
  if (!g) return [];
  const hits = [];
  for (const f of g.files) {
    const o = [...(g.out.get(f) || [])].slice(0, 8), i = [...(g.inn.get(f) || [])].slice(0, 8);
    const lower = [f, ...o, ...i].join(' ').toLowerCase();
    const hit = toks.filter(tk => lower.includes(tk)).length;
    if (!hit) continue;
    // the file's own path matching weighs more than a neighbour's; this repo's graph is the agent's own project (+0.3)
    const own = toks.filter(tk => f.toLowerCase().includes(tk)).length;
    const s = (own + 0.5 * (hit - own)) / toks.length + 0.3;
    hits.push({ source: 'repo-graph', id: f, score: +s.toFixed(3), snippet: `${f}${o.length ? ` imports ${o.join(', ')}` : ''}${i.length ? `; imported by ${i.join(', ')}` : ''}` });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
let _bp = null, _bpAt = 0;
function _searchBlueprint(toks, phrase, limit) {
  if (!_bp || Date.now() - _bpAt > 300000) {
    try { _bp = JSON.parse(fs.readFileSync(path.join(ROOT, 'blueprint-index.json'), 'utf8')); _bpAt = Date.now(); } catch (_) { _bp = null; }
  }
  if (!_bp) return [];
  const hits = [];
  for (const sys of _bp.systems || []) {
    for (const c of sys.components || sys.cli || []) {
      const route = c.route && typeof c.route === 'object' ? `${c.route.method || ''} ${c.route.path || ''}` : c.route;
      const text = [c.id, c.name, c.command, c.description, c.path, route, (c.tags || []).join(' ')].filter(Boolean).join(' ');
      const s = scoreText(text, toks, phrase);
      if (s) hits.push({ source: 'blueprint', id: `${sys.systemId}:${c.id || c.command || c.path}`, score: +(s * 0.8).toFixed(3), snippet: `${sys.systemId}${sys.port ? ' :' + sys.port : ''} — ${text.slice(0, 220)}` });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * directory({ counts }) → { sources: [...], tables: [...] } — what exists, how big, what it is, which tool reads it.
 */
function directory({ counts = true } = {}) {
  const jaa = _jaa();
  const tbls = tables().map(t => {
    const d = DESCRIBED[t] || {};
    let rows = null;
    if (counts && !d.heavy) { try { rows = jaa.count(t, {}); } catch (_) { rows = null; } }
    return { source: `jaa:${t}`, table: t, rows, system: d.system || null, what: d.what || null, tool: d.tool || null, searchedByDefault: !NOISY.has(t) && !d.heavy };
  });
  return {
    ok: true,
    sources: [
      { source: 'jaa', kind: 'tables', what: `cortex JAA store — ${tbls.length} tables (listed below)`, where: _storeDir() },
      { source: 'repo-graph', kind: 'graph', what: 'a repo\'s import graph (graph.json): who imports whom', where: '<repoDir>/graph.json', needs: 'repoDir (given automatically to a repo agent)' },
      { source: 'blueprint', kind: 'graph', what: 'every system\'s components, CLI commands and routes', where: 'blueprint-index.json', tool: 'nexus_map' },
      { source: 'spec', kind: 'prose', what: 'every .spec — what each system is supposed to be', where: '**/*.spec' },
      { source: 'changelog', kind: 'prose', what: 'CHANGELOG-*.md — what changed, when, and why', where: 'CHANGELOG-*.md' },
      { source: 'downloads', kind: 'exchanges', what: 'the Clear Glass download manager: every agent exchange (prompt, reply, files written), by agent', where: 'artifact-chat-index (lib/agent-memory.js)' },
      { source: 'vector', kind: 'semantic', what: 'Ollama-embedded semantic memory (lib/vector-memory.js)', note: 'used by search() only where vector memory is initialised in that process (it needs Ollama); keyword search covers the same tables either way' },
    ],
    tables: tbls,
    tools: ['nexus.context.tool (this)', 'query_recall', 'agent_chat_search', 'meta_query', 'nexus_map', 'nexus_intelligence', 'intelligence_query', 'idearium.repo_chunks.tool', 'fault_log', 'notes_todo', 'nexus.opportunity.tool', 'clearglass.browser.tool'],
    ts: Date.now(),
  };
}

/**
 * search(query, { sources, limit, repoDir, repoUuid, perSource }) → { hits, bySource, searched, skipped, blind }
 * sources: omit for the default set; or name them: ['jaa:chat_log', 'repo-graph', 'spec', 'changelog', 'blueprint', 'vector', 'jaa:*']
 */
async function search(query, { sources = null, limit = 20, repoDir = null, repoUuid = null, perSource = 5, excludeAgent = null, excludeDownloads = false } = {}) {
  const toks = qtokens(query);
  if (!toks.length) return { ok: false, error: 'query has no searchable words' };
  const phrase = String(query || '').toLowerCase().trim();
  const want = Array.isArray(sources) && sources.length ? new Set(sources) : null;
  const on = (name) => !want || want.has(name) || (name.startsWith('jaa:') && want.has('jaa:*'));
  const hits = [], searched = [], skipped = [], blind = [];
  const jaa = _jaa();

  for (const t of tables()) {
    const src = `jaa:${t}`;
    const d = DESCRIBED[t] || {};
    const explicit = want && want.has(src);
    if (!explicit && (NOISY.has(t) || d.heavy)) { skipped.push(src); continue; }
    if (!on(src)) continue;
    let rows;
    try {
      rows = jaa.query(t, repoUuid && (t === 'repo_hat_memory' || t === 'repo_agent_log') ? (r => r.repoUuid === repoUuid) : {});
    } catch (e) { blind.push({ source: src, error: e.message }); continue; }
    if (rows.length > MAX_ROWS_PER_TABLE) rows = rows.slice(-MAX_ROWS_PER_TABLE);
    searched.push(src);
    const local = [];
    for (const r of rows) {
      const text = rowText(r);
      const s = scoreText(text, toks, phrase);
      // what this repo's own agent learned is the most relevant memory a repo agent has (+0.3, same as its graph)
      const boost = repoUuid && r.repoUuid === repoUuid ? 0.3 : 0;
      if (s) local.push({ source: src, id: idOf(r), score: +(s + boost).toFixed(3), snippet: snippet(text, toks), ts: tsOf(r) });
    }
    // recency breaks ties inside a table
    local.sort((a, b) => b.score - a.score || (b.ts || 0) - (a.ts || 0));
    hits.push(...local.slice(0, perSource));
  }
  if (on('repo-graph') && repoDir) { searched.push('repo-graph'); hits.push(..._searchRepoGraph(repoDir, toks, perSource)); }
  // the download manager — every agent's exchanges (lib/agent-memory.js's own read path). A repo agent already gets its
  // OWN exchanges in the {memory} block, so excludeAgent keeps them out of {atlas} there (no line sent twice).
  if (on('downloads') && !(sources === null && excludeDownloads)) {
    try {
      const rows = require('./agent-memory.js').search({ query, limit: perSource * 2 }).filter(r => !excludeAgent || r.agentId !== excludeAgent).slice(0, perSource);
      searched.push('downloads');
      for (const r of rows) hits.push({ source: 'downloads', id: r.id, score: +(Math.min(1, r.score / Math.max(1, toks.length)) * 0.9).toFixed(3), snippet: `[${r.agentId || '?'} via ${r.provider || '?'}] ${r.summary}`, ts: r.ts });
    } catch (e) { blind.push({ source: 'downloads', error: e.message }); }
  }
  if (on('blueprint')) { searched.push('blueprint'); hits.push(..._searchBlueprint(toks, phrase, perSource)); }
  if (on('spec') || on('changelog')) {
    const prose = _searchProse(toks, phrase, perSource * 2).filter(h => on(h.source));
    searched.push(...['spec', 'changelog'].filter(on));
    hits.push(...prose.slice(0, perSource));
  }
  if (on('vector')) {
    try {
      const vm = require('./vector-memory.js');
      const st = vm.status ? await vm.status() : null;   // async — reads the index stats
      if (st && st.ready) {
        const r = await vm.search(query, { k: perSource });
        searched.push('vector');
        for (const x of r.results || []) hits.push({ source: `vector:${x.table || '?'}`, id: x.uuid || x.id || null, score: +(x.similarity || 0).toFixed(3), snippet: String(x.text || x.snippet || '').slice(0, 260) });
      } else if (want && want.has('vector')) blind.push({ source: 'vector', error: 'vector memory not initialised in this process' });
    } catch (e) { if (want && want.has('vector')) blind.push({ source: 'vector', error: e.message }); }
  }
  hits.sort((a, b) => b.score - a.score || (b.ts || 0) - (a.ts || 0));
  const top = hits.slice(0, limit);
  const bySource = {};
  for (const h of hits) bySource[h.source] = (bySource[h.source] || 0) + 1;
  return { ok: true, query, tokens: toks, hits: top, total: hits.length, bySource, searched, skipped, blind };
}

/** get(source, id) — the whole row / file behind a hit. */
function get(source, id) {
  if (!source || !id) return { ok: false, error: 'source and id required (both come from a search hit)' };
  if (source.startsWith('jaa:')) {
    const t = source.slice(4);
    const jaa = _jaa();
    const row = jaa.get(t, { id }) || jaa.get(t, { uuid: id }) || jaa.get(t, { key: id });
    return row ? { ok: true, source, row } : { ok: false, error: `no row ${id} in ${t}` };
  }
  if (source === 'spec' || source === 'changelog') {
    const p = path.join(ROOT, id);
    if (!p.startsWith(ROOT)) return { ok: false, error: 'path outside the tree' };
    try { const text = fs.readFileSync(p, 'utf8'); return { ok: true, source, path: id, text: text.length > 60000 ? text.slice(0, 60000) : text, truncated: text.length > 60000 }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  if (source === 'downloads') {
    try { const idx = require('../clear-glass/src/downloads/artifact-chat-index.js'); const it = idx.readItem(process.env.AGENT_MEMORY_ROOT || idx.defaultRoot(), id); return it ? { ok: true, source, item: it } : { ok: false, error: `no download-manager item ${id}` }; }
    catch (e) { return { ok: false, error: e.message }; }
  }
  return { ok: false, error: `get() supports jaa:<table>, spec, changelog, downloads — for ${source} the hit itself is the whole record` };
}

/**
 * block(query, opts) — search rendered as a compact text block for a prompt ({memory} in repo-prompt-blocks.js).
 * Budgeted; each line cites source + id so the agent can fetch the whole record with nexus.context.tool get.
 */
async function block(query, { budget = 2400, limit = 12, ...opts } = {}) {
  const r = await search(query, { limit, ...opts });
  if (!r.ok || !r.hits.length) return { text: '', hits: 0, reason: r.ok ? 'nothing matched' : r.error };
  const lines = [];
  let used = 0;
  for (const h of r.hits) {
    const line = `- [${h.source}${h.id ? ' ' + String(h.id).slice(0, 60) : ''}] ${h.snippet}`;
    if (used + line.length > budget) break;
    lines.push(line); used += line.length + 1;
  }
  return { text: lines.join('\n'), hits: lines.length, total: r.total };
}

/** directoryBlock() — the short "what memory exists" text for {directory}. Cached 60s (row counts). */
let _dirCache = null, _dirAt = 0;
function directoryBlock({ budget = 1600 } = {}) {
  if (!_dirCache || Date.now() - _dirAt > 60000) { _dirCache = directory({ counts: true }); _dirAt = Date.now(); }
  const d = _dirCache;
  const top = d.tables.filter(t => t.searchedByDefault && (t.rows === null || t.rows > 0) && t.what).slice(0, 40)
    .map(t => `${t.table}${t.rows !== null ? ` (${t.rows})` : ''}: ${t.what}`);
  const lines = [
    'Memory you can search with nexus.context.tool (action "search", query; "get" for a whole record; "directory" for all of it):',
    ...top.map(x => `- ${x}`),
    '- downloads: every agent\'s past exchanges · repo-graph: this project\'s import graph · blueprint: every system\'s components · spec / changelog: why things are as they are',
  ];
  let out = '';
  for (const l of lines) { if (out.length + l.length > budget) break; out += (out ? '\n' : '') + l; }
  return out;
}

module.exports = { MODULE_ID, VERSION, DESCRIBED, NOISY, tables, directory, search, get, block, directoryBlock, qtokens, scoreText };
