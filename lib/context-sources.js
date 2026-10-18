'use strict';
/**
 * lib/context-sources.js — GM5 (0.60.156): the table of context sources. The context stream (lib/context-stream.js) asks
 * every row; it names none of them.
 * comp_id: nexus.lib.context-sources
 *
 * James, 2026-10-18: "it needs to be non linear and agnostic" · "look at siso". Map: docs/2026-10-18-gate-memory-phasemap.spec
 * addendum (b). A source is a SISO gate keyed by its own signature; joining is adding a row here, never a line in the finder.
 *
 * A row: { signature, system, cost, kinds, phase?, ask(request) → Promise<[piece]> }
 *   cost   'free'  asked for every request, all at once
 *          'model' asked only for the residue (the need no free piece covered) — the caller supplies its ask
 *          'build' never asked by the finder: what is still uncovered is returned as what a build would be asked
 *   kinds  the edge kinds its pieces carry (exact | causal | wire | reference | temporal | resembles)
 *   phase  the phase that builds what the row reads, when it is not built yet — the row is asked anyway and says it failed
 * A piece: { id, text, score, kind?, covers? } — references with a short text, never the whole record (GM0c).
 *
 * Another system is reached by its route (lib/nexus-client.js), never by its files (drawbridge, SB-06).
 */

const MODULE_ID = 'nexus.lib.context-sources';
const VERSION = '1.0.0';

const _route = (system, path) => async (rq) => require('./nexus-client.js').post(system, path, rq, { timeout: rq.timeoutMs || 4000 });

const ROWS = [
  { signature: 'atlas', system: 'lib', cost: 'free', kinds: ['reference'],
    about: 'lib/context-atlas.js — every memory table, the specs and changelogs, the repo graph',
    ask: async (rq) => {
      const r = await require('./context-atlas.js').search(rq.text, { limit: rq.limit || 8, perSource: 3, repoUuid: rq.repoUuid || null, repoDir: rq.repoDir || null });
      return (r.hits || []).map(h => ({ id: `${h.source}:${h.id != null ? h.id : ''}`, text: h.snippet || '', score: Math.min(1, (h.score || 0) / 20), kind: 'reference' }));
    } },
  { signature: 'components', system: 'lib', cost: 'free', kinds: ['exact', 'resembles'],
    about: 'lib/component-store.js — every component WARP built, found again',
    ask: async (rq) => require('./component-store.js').find(rq.text, { limit: rq.limit || 6 })
      .map((c, i) => ({ id: c.id, text: `${c.file} — ${c.why}`, score: Math.max(0.2, 0.8 - i * 0.1), kind: 'resembles' })) },
  { signature: 'ledger', system: 'lib', cost: 'free', kinds: ['causal'],
    about: 'lib/gate-context.js over the contract ledger — what this gate was given and got before',
    ask: async (rq) => {
      if (!rq.repoUuid || !rq.gate) return [];
      const GC = require('./gate-context.js');
      const c = await GC.context(rq.repoUuid, rq.gate);
      const note = GC.note(c);
      return note ? [{ id: `gate:${rq.gate}`, text: note, score: 0.9, kind: 'causal' }] : [];
    } },
  { signature: 'vector', system: 'lib', cost: 'free', kinds: ['resembles'],
    about: 'lib/vector-memory.js — what reads like it (TF-IDF when Ollama is down)',
    ask: async (rq) => {
      const VM = require('./vector-memory.js');
      // its search answers [] when it was never initialised: an empty answer that is really "not asked" is said (§1.2)
      if (!(await VM.status()).ready) throw new Error('vector memory not initialised in this process (lib/vector-memory.js init)');
      const r = await VM.search(rq.text, { k: rq.limit || 6 });
      return r.results.map(x => ({ id: `vector:${x.id || x.uuid || x.key || ''}`, text: String(x.text || x.content || '').slice(0, 240), score: x.similarity != null ? x.similarity : (x.score || 0.5), kind: 'resembles' }));
    } },
  { signature: 'intuition', system: 'intelligence', cost: 'free', kinds: ['resembles'],
    about: 'intelligence/intuition.js by its route — what is crystallised',
    ask: async (rq) => {
      const r = await _route('intelligence', '/api/intelligence/intuition')({ prompt: rq.text, timeoutMs: rq.timeoutMs });
      return r && r.text ? [{ id: `intuition:${r.intent || 'answer'}`, text: r.text, score: r.confidence || 0.5, kind: 'resembles' }] : [];
    } },
  { signature: 'lattice', system: 'intelligence', cost: 'free', kinds: ['causal', 'wire', 'reference', 'temporal'], phase: 'GM4_the_node_lattice',
    about: 'the node lattice by its route — what is joined to the gate\'s refs',
    ask: async (rq) => {
      const r = await _route('intelligence', '/api/intelligence/lattice/neighbours')({ refs: rq.refs || [], text: rq.text, timeoutMs: rq.timeoutMs });
      return (r.neighbours || []).map(n => ({ id: n.id, text: n.text || n.id, score: n.score || 0.5, kind: n.kind || 'reference' }));
    } },
  { signature: 'fulfilled', system: 'cortex', cost: 'free', kinds: ['exact'], phase: 'GM3_the_fulfilled_contract_index',
    about: 'the approved, fulfilled contract index by its route — an answer already approved',
    ask: async (rq) => {
      const r = await _route('cortex', '/api/raid/contracts/find')({ text: rq.text, refs: rq.refs || [], timeoutMs: rq.timeoutMs });
      return (r.hits || []).map(h => ({ id: h.id, text: h.text || h.id, score: h.exact ? 1 : (h.score || 0.6), kind: h.exact ? 'exact' : 'resembles' }));
    } },
  { signature: 'agent-tools', system: 'caller', cost: 'model', kinds: ['reference'],
    about: 'the agent\'s own tools — asked only the residue; the caller supplies the ask', ask: null },
  { signature: 'build', system: 'caller', cost: 'build', kinds: [],
    about: 'a build — never asked here; what is still uncovered is returned as what it would be asked', ask: null },
];

/** rows({ only, extra }) → the table, optionally narrowed by signature, with extra rows joined (a test, a caller's own source). */
function rows({ only = null, extra = [] } = {}) {
  const all = [...ROWS, ...extra];
  const seen = new Set();
  for (const r of all) { if (seen.has(r.signature)) throw new Error(`[context-sources §1.2] signature collision: '${r.signature}'`); seen.add(r.signature); }
  return only ? all.filter(r => only.includes(r.signature)) : all;
}

module.exports = { MODULE_ID, VERSION, ROWS, rows };
