'use strict';
/**
 * lib/node-index.js — a live, queryable jaaDB-backed index + ledger for
 * any node type, usable by any system's node-registry (or a future
 * per-system one), not just guardian's.
 *
 * §BUILT ON, NOT INSTEAD OF — guardian/lib/node-registry.js's own real
 * "one file per node" model (a .type file on disk is still the real,
 * canonical source James specified — "each node is the entire unit per
 * node... 1 unit of measurement") and its own local _ledger.jsonl are
 * both left exactly as they are. This module adds a SECOND, queryable
 * view of the same real data — a live jaaDB table per node type — so
 * anything already using jaaDB.query() elsewhere in the codebase can
 * find/filter real nodes without knowing the file-watcher's in-memory
 * Map exists, and so the index survives a process restart, which the
 * in-memory Map does not.
 *
 * §REAL TABLE NAMING — one jaaDB table per node type: `nodes_<type>`
 * (e.g. `nodes_tool`, `nodes_capability`), same one-table-per-real-concept
 * convention already used throughout this codebase (bep_patterns,
 * healer_proposals, versionium_branches — checked, not invented). A
 * companion `nodes_<type>_ledger` table records every add/change/delete,
 * matching node-registry.js's own explicit design: "a ledger per folder
 * to track new .nodes, changes, edits, deletes" — this is that same
 * per-type ledger, as a real, queryable jaaDB table instead of (in
 * addition to) a flat .jsonl file.
 *
 * §HONEST LIMIT — uses jaaDB's real upsert(table, row, keyField) for the
 * index (soft-delete on removal, same convention as clear-glass/macro.js
 * and this session's search-engine.js — a deleted row is a new row with
 * _deleted:true, never a mutation) and real insert() for the ledger
 * (append-only, never updated). Verified via direct, isolated tests
 * against a real temp-directory jaaDB, not assumed from reading the API.
 *
 * §GENERALIZED 2026-09-12 — James: "in each data folder we use a jaa
 * database for each node type." Every function here originally hardcoded
 * the one, central, shared cortex jaaDB singleton — real and correct for
 * guardian/lib/node-registry.js's own call (guardian's real nodes live in
 * the shared store), but it meant no OTHER system could get its own,
 * separate, sovereign nodes_<type> index without either sharing cortex's
 * store (the exact multi-tenant collision risk guardian/jaa-store.js's
 * own tablePrefix mechanism exists to prevent — see its header) or a
 * second, parallel copy of this whole file. Every function now takes an
 * optional trailing `jaa` handle; omitted, each falls back to the
 * original central singleton — guardian/lib/node-registry.js's existing
 * call sites are untouched, zero behavior change for the one real caller
 * that already exists. A per-system caller passes its own real JaaStore
 * instance (e.g. `new (require('../guardian/jaa-store').JaaStore)(path.
 * join(systemDir, 'data', 'node-index'))`) instead.
 */

function _jaa() {
  try { return require('../cortex/memory/jaa-db.js').jaaDB; }
  catch (e) { return null; }
}

function _table(type) { return `nodes_${type}`; }
function _ledgerTable(type) { return `nodes_${type}_ledger`; }

/**
 * indexNode(type, doc, filePath, jaa?) — upserts the current state of one
 * real node into its type's index table, and appends one ledger entry.
 * doc is the real, validated envelope (node-export.js's importFromFile()
 * shape: {uuid, type, id, context, intent, summary, system, tags,
 * exported_at, source, payload}) — the exact same object
 * guardian/lib/node-registry.js's _processFile() already has in hand
 * after its own schema check passes.
 *
 * §BUGFIX — found by actually running the ledger against a real jaaDB,
 * not assumed correct from reading the API: guardian/jaa-store.js's real
 * insert(table, row) uses `row.id || row.key || _uuid()` as its own
 * internal Map key (`tbl.set(id, r)`) — checked directly. An append-only
 * ledger table where every row's `id` field is the SAME node's id (by
 * design — that's how you'd query "this node's history") therefore
 * silently overwrote itself on every entry; two inserts left exactly one
 * row, not two. Fixed by never putting the node's id under the literal
 * `id` key on ledger rows — it lives under `nodeId` instead, so jaaDB's
 * own identity mechanism generates a fresh row id per insert via its
 * `_uuid()` fallback, the same way every other real append-only ledger
 * in this codebase (dedup_log, healer_proposals) avoids this by never
 * setting `id` explicitly either.
 */
function indexNode(type, doc, filePath, jaa) {
  jaa = jaa || _jaa();
  if (!jaa) return { ok: false, error: 'jaaDB unavailable' };
  const table = _table(type);
  const existing = jaa.query(table, (r) => r.id === doc.id && !r._deleted);
  const isNew = existing.length === 0;
  const row = {
    id: doc.id, uuid: doc.uuid, type, filePath: filePath || null,
    context: doc.context, intent: doc.intent, summary: doc.summary,
    system: doc.system, tags: doc.tags, payload: doc.payload,
    exportedAt: doc.exported_at, updatedAt: Date.now(), _deleted: false,
  };
  jaa.upsert(table, row, 'id');
  jaa.insert(_ledgerTable(type), {
    uuid: require('crypto').randomUUID(), nodeId: doc.id, type,
    action: isNew ? 'added' : 'changed', filePath: filePath || null, ts: Date.now(),
  });
  return { ok: true, isNew };
}

/** removeNode(type, id, jaa?) — soft-deletes from the index, logs 'deleted' to the ledger. */
function removeNode(type, id, jaa) {
  jaa = jaa || _jaa();
  if (!jaa) return { ok: false, error: 'jaaDB unavailable' };
  const table = _table(type);
  const existing = jaa.query(table, (r) => r.id === id && !r._deleted);
  if (!existing.length) return { ok: false, error: `no indexed node "${id}" of type "${type}"` };
  jaa.upsert(table, { ...existing[existing.length - 1], _deleted: true, deletedAt: Date.now() }, 'id');
  jaa.insert(_ledgerTable(type), {
    uuid: require('crypto').randomUUID(), nodeId: id, type, action: 'deleted', ts: Date.now(),
  });
  return { ok: true };
}

/** queryNodes(type, predicate?, jaa?) — every real, live (non-deleted) node of a type, filtered. */
function queryNodes(type, predicate, jaa) {
  jaa = jaa || _jaa();
  if (!jaa) return [];
  return jaa.query(_table(type), (r) => !r._deleted && (predicate ? predicate(r) : true));
}

/** history(type, id, jaa?) — every real ledger entry for one node, in insertion (chronological) order — the real "movement" record. */
function history(type, id, jaa) {
  jaa = jaa || _jaa();
  if (!jaa) return [];
  return jaa.query(_ledgerTable(type), (r) => r.nodeId === id);
}

module.exports = { indexNode, removeNode, queryNodes, history };
