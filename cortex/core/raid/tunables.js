'use strict';
/**
 * cortex/core/raid/tunables.js — RAID's Cortex-backed tunable parameters
 * UUID: nexus-raid-tunables-v1-0000-2026-0706-jamesbrooks-001
 *
 * Every threshold and neutral-fallback value RAID and its SNR gate use is
 * a row in `raid_tunables` (JAA), not a JS constant. §2.1/§2.2 — a value
 * that only lives in a JS file does not exist as system state; it can't be
 * observed, tuned, or learned from outcomes without a code deploy.
 *
 * Boot behavior: if the table is empty, DEFAULTS are seeded as real rows
 * (logged as raid.tunables.seeded — not a silent fallback masquerading as
 * config). Every change after that — human or, later, reflection-driven —
 * writes to Cortex first and logs raid.tunables.changed with the prior and
 * new value, per §0.3 (nothing simply disappears).
 *
 * get()/set() operate on an in-memory cache populated from Cortex at
 * load() — Cortex is still the source of truth (§2.2); the cache exists
 * because these values are read on every single RAID fitness calculation,
 * a genuinely hot path, and re-querying Cortex per-call would be its own
 * kind of dishonesty (unnecessary I/O pretending to be rigor). reload()
 * exists for callers (or a future reflection-driven tuner) that need to
 * force a fresh read after an external change.
 */

const { jaaDB, uid } = require('../../memory/jaa-db');

const TABLE = 'raid_tunables'; // intended tier: long — infrequent writes, needed at every boot

const DEFAULTS = {
  invariantThreshold:     0.7,  // snr-filter tier 1 — forge_patches successRate above this counts as a known fix
  frictionThreshold:      0.5,  // snr-filter tier 3 — fault_taxonomy friction above this counts as an open loop
  neutralConfidence:      0.5,  // roleConfidence/topologicalProximity fallback when evidence is insufficient
  minCallsForConfidence:  3,    // roleConfidence: fewer observed calls than this → neutralConfidence, not a real ratio
  maxGraphHopDepth:       12,   // topologicalProximity: BFS depth cap in componentDistance()
};

let _cache = null; // null until load() — get() before load() throws rather than silently returning a default

function _seedIfEmpty() {
  const existing = jaaDB.query(TABLE, () => true, 1000);
  if (existing.length > 0) return existing;
  const seeded = [];
  for (const [key, value] of Object.entries(DEFAULTS)) {
    seeded.push(jaaDB.insert(TABLE, { uuid: uid(), key, value, ts: Date.now(), source: 'default-seed' }));
  }
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'raid.tunables.seeded',
    payload: { count: seeded.length, keys: Object.keys(DEFAULTS) }, ts: Date.now(),
  });
  return seeded;
}

function load() {
  const rows = _seedIfEmpty();
  _cache = {};
  for (const row of rows) _cache[row.key] = row.value;
  return { ..._cache };
}

function get(key) {
  if (_cache === null) load();
  if (!(key in _cache)) {
    throw new Error(`[raid/tunables] unknown key '${key}' — not in Cortex, not in DEFAULTS. §1.2: no silent fallback.`);
  }
  return _cache[key];
}

function set(key, value, opts = {}) {
  if (_cache === null) load();
  const prior = _cache[key];
  const existing = jaaDB.query(TABLE, r => r.key === key, 1);
  if (existing.length) {
    jaaDB.update(TABLE, { key }, { value, ts: Date.now() });
  } else {
    jaaDB.insert(TABLE, { uuid: uid(), key, value, ts: Date.now(), source: opts.source || 'manual' });
  }
  _cache[key] = value;
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'raid.tunables.changed',
    payload: { key, prior, value, source: opts.source || 'manual' }, ts: Date.now(),
  });
  return value;
}

function reload() { _cache = null; return load(); }

module.exports = { get, set, load, reload, reset: reload, DEFAULTS, TABLE };
