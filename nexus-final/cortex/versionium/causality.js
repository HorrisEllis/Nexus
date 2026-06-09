'use strict';
// ── versionium/causality.js ───────────────────────────────────────────────────
// UUID: mod-versionium-causality-v5-0000-4000-0000-000000000001
//
// §A3 causality walk over JAA tables. Replaces kernel.ancestors() / kernel.descendants().
// v5.0: Walks the causedBy chain through event_log. (§G-V5-04 resolved)
//
// §M1: init(cfg) + stop().
// §M2: reads: event_log, versionium_commits. writes: event_log, failures.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'versionium/causality';
const MAX_DEPTH  = 20; // prevent runaway cycles

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
  // Causality walks are on-demand — nothing to poll proactively
  // Tick just writes a heartbeat to poll_log for observability
  try {
    jaaDB.insert('poll_log', {
      uuid:   uid(),
      module: MODULE_ID,
      ts:     Date.now(),
      source: MODULE_ID,
    });
  } catch {}
}

// ── ancestors(uuid) — walk up causedBy chain ──────────────────────────────────
// Returns chain from root → target in causal order.
function ancestors(startUuid, table = 'event_log') {
  const chain  = [];
  let   cursor = startUuid;
  const seen   = new Set();

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (!cursor || seen.has(cursor)) break;
    seen.add(cursor);

    const row = jaaDB.get(table, cursor);
    if (!row) break;
    chain.unshift(row); // prepend — oldest first

    cursor = row.causedBy || null;
    if (!cursor) break;
  }

  return chain;
}

// ── descendants(uuid) — walk all rows that trace back to this uuid ────────────
// Returns all event_log rows whose causal chain includes startUuid.
function descendants(startUuid, table = 'event_log', depth = 0) {
  if (depth >= MAX_DEPTH) return [];

  const direct = jaaDB.query(table, r => r.causedBy === startUuid, 100);
  const all    = [...direct];

  for (const row of direct) {
    const children = descendants(row.uuid, table, depth + 1);
    all.push(...children);
  }

  return all;
}

// ── causalChain(uuid) — full formatted trace ──────────────────────────────────
function causalChain(startUuid) {
  const anc  = ancestors(startUuid);
  const desc = descendants(startUuid);

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
