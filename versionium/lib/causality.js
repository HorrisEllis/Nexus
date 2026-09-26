'use strict';
/**
 * versionium/lib/causality.js — migrated wholesale from cortex/
 * versionium/causality.js (§VS1, docs/2026-09-02-versionium-sovereign-
 * and-cleanup-phasemap.spec).
 * UUID: nexus-versionium-causality-v1-0000-2026-0902-jamesbrooks-001
 *
 * §DELIBERATE EXCEPTION — this file reads BOTH tables:
 *   - versionium_commits: versionium's own, from ./store.js (VS1's real
 *     sovereign data folder).
 *   - event_log: cortex's shared, cross-system causal log (see store.js's
 *     own header for the full reasoning) — a commit's real causal
 *     ancestor is often an event_log row from a DIFFERENT system
 *     entirely (the original 2026-07-13 fix this file's own header
 *     already documents), so tracing "why did this commit happen" needs
 *     visibility into the shared log, not just versionium's own tables.
 *     Reached through cortex's own jaaDB module, same multi-process
 *     shared-file-store convention every other system already uses for
 *     this exact table.
 */
const { jaaDB, uid } = require('./store.js');
const { CausalGraph } = require('../../intelligence/cfr/graph.js');

const MODULE_ID  = 'versionium/causality';
const MAX_DEPTH  = 20;

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 5000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    jaaDB.insert('poll_log', { uuid: uid(), module: MODULE_ID, ts: Date.now(), source: MODULE_ID });
  } catch {}
}

let _cachedGraph = null;
let _cachedKey   = null;
let _cachedAt    = 0;
const GRAPH_CACHE_MS = 5000;

/**
 * §VS1 — reads versionium_commits from this system's own sovereign
 * store, event_log from cortex's shared one (see this file's own header).
 * Every other table name passed in is assumed to be versionium's own —
 * a caller asking for a table this system doesn't recognize as shared
 * gets versionium's own store, honestly (not a silent cross-system
 * reach that was never asked for).
 */
function _tableStore(table) {
  return table === 'event_log' ? require('../../cortex/memory/jaa-db').jaaDB : jaaDB;
}

function _buildGraph(tables) {
  const tableList = Array.isArray(tables) ? tables : [tables];
  const key = tableList.slice().sort().join(',');
  const now = Date.now();
  if (_cachedGraph && _cachedKey === key && (now - _cachedAt) < GRAPH_CACHE_MS) {
    return _cachedGraph;
  }
  const graph = new CausalGraph();
  for (const table of tableList) {
    let rows = [];
    try { rows = _tableStore(table).query(table, () => true, 5000); }
    catch (e) { console.warn(`[${MODULE_ID}] failed to read table "${table}" (non-fatal, skipped): ${e.message}`); }
    for (const row of rows) graph.ingest(row);
  }
  _cachedGraph = graph;
  _cachedKey = key;
  _cachedAt = now;
  return graph;
}

function ancestors(startUuid, table = 'event_log') {
  const graph = _buildGraph(table);
  return graph.ancestors(startUuid, MAX_DEPTH);
}

function descendants(startUuid, table = 'event_log') {
  const graph = _buildGraph(table);
  return graph.descendants(startUuid, MAX_DEPTH);
}

function causalChain(startUuid, table = ['versionium_commits', 'event_log']) {
  const anc  = ancestors(startUuid, table);
  const desc = descendants(startUuid, table);

  return {
    root:        anc[0]   || null,
    target:      anc[anc.length - 1] || null,
    ancestors:   anc,
    descendants: desc,
    depth:       anc.length,
    spread:      desc.length,
  };
}

module.exports = { init, stop, ancestors, descendants, causalChain };
