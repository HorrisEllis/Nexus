'use strict';
/**
 * lib/tool-index.js — the living tool index in cortex (agnostic; §AP1)
 * UUID: nexus-tool-index-v1-0000-2026-0807-001
 *
 * James: "tool index in cortex with file dir and consumer and intent or edge
 * cases that populate over time."
 *
 * NOT a static list — a LIVING registry. Each tool has a row (file/dir, provides),
 * and record() appends real observations over time: which agent/system CONSUMED
 * it, with what INTENT, and any EDGE CASE (a refusal, a miss, an error). So the
 * index grows from actual usage — after a week of agent runs it knows which tools
 * are used for what, by whom, and where they break. That's the data the
 * intelligence system (AP4) optimizes on.
 *
 * "Lib is for agnostic tools" — lives in lib/, any system records here. Persists
 * to a cortex dynamic JAA table (tool_index) — jaaDB.insert creates it live
 * (§2.2 cortex is the source of truth). §1.2 recording never breaks the caller.
 */

const TABLE = 'tool_index';
let _mem = new Map();   // in-process cache; cortex is the durable store

function _cortex() { try { return require('../cortex/memory/jaa-db').jaaDB || require('../cortex/memory/jaa-db'); } catch (_) { return null; } }

/**
 * register(tool) — declare a tool's static facts (file/dir, provides, consumers-
 * so-far). Idempotent by id. Seeds the row; usage fills the rest.
 * @param tool { id, file, dir, provides, intents?, consumers?, edgeCases? }
 */
function register(tool) {
  if (!tool || !tool.id) return { ok: false, reason: 'tool needs an id' };
  const existing = _mem.get(tool.id) || { id: tool.id, consumers: [], intents: [], edgeCases: [], calls: 0 };
  const row = { ...existing, ...tool, consumers: existing.consumers, intents: existing.intents, edgeCases: existing.edgeCases, updatedAt: Date.now() };
  _mem.set(tool.id, row);
  _persist(row);
  return { ok: true, tool: row };
}

/**
 * record(obs) — append a real observation from a tool call/pull. This is what
 * makes the index populate over time.
 * @param obs { tool|agentId, intent, ok, consumer?, edgeCase? }
 */
function record(obs = {}) {
  const id = obs.tool || obs.id;
  if (!id) return;
  const row = _mem.get(id) || { id, file: null, dir: null, provides: null, consumers: [], intents: [], edgeCases: [], calls: 0 };
  row.calls = (row.calls || 0) + 1;
  const consumer = obs.consumer || obs.agentId;
  if (consumer && !row.consumers.includes(consumer)) row.consumers.push(consumer);
  if (obs.intent && !row.intents.includes(obs.intent)) row.intents.push(obs.intent);
  // an edge case = a non-ok observation, or an explicitly flagged one.
  if (obs.ok === false || obs.edgeCase) {
    const ec = obs.edgeCase || obs.reason || 'failed';
    if (!row.edgeCases.some(e => e.note === ec)) row.edgeCases.push({ note: ec, at: Date.now(), consumer });
    if (row.edgeCases.length > 50) row.edgeCases.shift();   // bounded
  }
  row.updatedAt = Date.now();
  _mem.set(id, row);
  _persist(row);
}

function _persist(row) {
  try {
    const db = _cortex();
    if (db && db.insert) db.insert(TABLE, { ...row, _key: row.id });   // dynamic table, created on first insert
  } catch (_) { /* §1.2 — persistence best-effort; the in-mem index still works */ }
}

/** get(id) / list() — read the index (from mem; cortex is the durable mirror). */
function get(id) { return _mem.get(id) || null; }
function list(opts = {}) {
  let rows = [..._mem.values()];
  if (opts.consumer) rows = rows.filter(r => r.consumers.includes(opts.consumer));
  if (opts.withEdgeCases) rows = rows.filter(r => r.edgeCases.length > 0);
  return rows.sort((a, b) => (b.calls || 0) - (a.calls || 0));
}

/** summary() — what the index has learned so far (for diagnostics / AP4). */
function summary() {
  const rows = [..._mem.values()];
  return {
    tools: rows.length,
    totalCalls: rows.reduce((s, r) => s + (r.calls || 0), 0),
    withEdgeCases: rows.filter(r => r.edgeCases.length > 0).length,
    text: `${rows.length} tools indexed; ${rows.reduce((s, r) => s + (r.calls || 0), 0)} calls observed; ${rows.filter(r => r.edgeCases.length).length} with edge cases recorded.`,
  };
}

function _resetForTest() { _mem = new Map(); }
module.exports = { register, record, get, list, summary, TABLE, _resetForTest, MODULE_ID: 'tool-index', VERSION: '1.0.0' };
