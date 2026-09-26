'use strict';
/**
 * lib/bus-subscriptions.js — §B1: cross-process subscriber counts
 * UUID: nexus-lib-bus-subscriptions-v1-0000-4000-0000-000000000001
 * @version 1.0.0
 *
 * THE BLOCKER THIS CLOSES (docs/nexus-tablet.spec, B1):
 *   "consumer graph is single-process; most edges do not exist yet"
 *   "cross-process subscriber counts — the connectome's edges. Single-process only."
 *
 * lib/consumer-registry.js derives real producers from event_log (disk, shared,
 * cross-process — correct already) but reads consumers from `_bus.listenerCount()`
 * — the LOCAL EventEmitter. NEXUS runs 9+ processes, each with its own bus. So
 * every subscriber in every other process was invisible, and `unconsumed()`
 * reported events as "emitted into the void" when the void was another process
 * doing its job. The brain view built on that would have been, in the spec's own
 * words, "authoritative-looking and mostly wrong."
 *
 * MECHANISM — chosen to match what already works here, not invented:
 * every process PUBLISHES its own bus's subscription map into the shared JAA
 * store (one upserted row per system, id = systemId), exactly the way
 * lib/component-registry.js already publishes components. Reads then aggregate
 * across all systems from DISK.
 *
 * Why disk and not process-to-process RPC:
 *   - §5.12 decoupling: no system needs a live socket to another to be mapped.
 *   - The tablet's observation law: "MUST be disk-backed where possible. If
 *     cortex is wedged the tablet must still show WHY." A connectome that goes
 *     dark when a process hangs is most useless exactly when it is most needed.
 *   - cortex is the data root (James, 2026-07-18 / reconfirmed 2026-07-24), so
 *     the shared store is the right home for shared truth.
 *
 * §1.2 STALENESS IS NOT LIVENESS — the hard honesty requirement here. A crashed
 * process leaves its last row behind. Those are NOT live edges. Every read
 * stamps age and marks rows past STALE_MS as stale, and aggregate counts report
 * live and stale SEPARATELY rather than summing them into one confident number.
 * Reporting a dead process's 40 listeners as live wiring is precisely the
 * authoritative-looking-and-wrong failure this module exists to prevent.
 */

const MODULE_ID = 'lib/bus-subscriptions';
const VERSION   = '1.0.0';
const TABLE     = 'bus_subscriptions';

// A system republishes on a heartbeat-ish cadence (see publishPeriodically).
// Anything older than this is presumed dead rather than quiet. Deliberately
// generous relative to a 10s republish: three missed publishes, not one, so a
// GC pause or a slow disk never mislabels a healthy system as gone.
const STALE_MS = 35000;

/**
 * Snapshot this process's bus subscriptions into the shared store.
 * Call AFTER a system has wired its listeners, or the snapshot is of a bus
 * that has not subscribed to anything yet (a real footgun: publishing at the
 * top of boot records zeros and looks like "this system consumes nothing").
 *
 * @param {object} o
 * @param {string} o.systemId  owning system (required — an anonymous row is unusable)
 * @param {object} o.bus       the process's bus (needs eventNames + listenerCount)
 * @param {object} o.jaa       shared JAA store (needs insert/find or upsert)
 * @returns {object} { ok, systemId, types, totalListeners, reason? }
 */
function publish({ systemId, bus, jaa } = {}) {
  if (!systemId || typeof systemId !== 'string') {
    throw new Error(`[${MODULE_ID}] publish: 'systemId' is required — an unattributable subscription row cannot be mapped to a process`);
  }
  if (!bus || typeof bus.eventNames !== 'function' || typeof bus.listenerCount !== 'function') {
    return { ok: false, systemId, types: 0, totalListeners: 0, reason: 'bus does not expose eventNames/listenerCount — nothing observable to publish' };
  }
  if (!jaa || typeof jaa.insert !== 'function') {
    return { ok: false, systemId, types: 0, totalListeners: 0, reason: 'no JAA store — cross-process publish impossible' };
  }

  const subscriptions = {};
  let totalListeners = 0;
  for (const type of bus.eventNames()) {
    // eventNames() can return symbols; the graph is keyed by string event
    // types and a symbol has no meaning to another process.
    if (typeof type !== 'string') continue;
    const n = bus.listenerCount(type);
    if (n > 0) { subscriptions[type] = n; totalListeners += n; }
  }

  const row = {
    id: systemId,               // upsert key — one CURRENT row per system
    systemId,
    pid: process.pid,
    subscriptions,
    types: Object.keys(subscriptions).length,
    totalListeners,
    ts: Date.now(),
  };

  try {
    // insert() with an explicit id does a FULL REPLACE (tbl.set(id, row)).
    // That is required here and upsert() would be WRONG: upsert merges
    // ({...existing, ...row}), so an event type a system STOPPED subscribing
    // to would survive in the map forever and be drawn as a live edge. A
    // subscription snapshot must replace wholesale, never accumulate.
    // (Verified against guardian/jaa-store.js:106-131, not assumed.)
    jaa.insert(TABLE, row);
    return { ok: true, systemId, types: row.types, totalListeners };
  } catch (e) {
    // Loud, never silent — but not fatal: a system must not fail to boot
    // because the connectome could not be updated.
    console.error(`[${MODULE_ID}] publish failed for '${systemId}': ${e.message}`);
    return { ok: false, systemId, types: row.types, totalListeners, reason: e.message };
  }
}

/**
 * Republish on an interval so the map tracks late-wired listeners and lets
 * staleness mean something. Returns the timer (unref'd — this must never be
 * the reason a process stays alive).
 */
function publishPeriodically({ systemId, bus, jaa, intervalMs = 10000 } = {}) {
  publish({ systemId, bus, jaa });
  const t = setInterval(() => {
    try { publish({ systemId, bus, jaa }); } catch (_) { /* publish already logs */ }
  }, intervalMs);
  if (t.unref) t.unref();
  return t;
}

/**
 * Read every system's published row.
 *
 * §COMPAT — this codebase has TWO real store facades and both are live:
 *   guardian/jaa-store.js  JaaStore   → read-many is all(table, where)
 *   cortex/memory/jaa-db.js jaaDB      → read-many is query(table, where, opts)
 *                                        (it wraps the same JaaStore; there is
 *                                        no .all on the facade)
 * Supporting only one would make this module silently return "observed:false"
 * for every caller holding the other — indistinguishable from "no subscribers
 * anywhere," which is the exact confident-and-wrong failure this file exists
 * to prevent. Checked against both classes, not assumed.
 */
function _readAll(jaa) {
  if (!jaa) return null;
  if (typeof jaa.all === 'function')   return jaa.all(TABLE, {});
  if (typeof jaa.query === 'function') return jaa.query(TABLE, {});
  return null;
}

function all(jaa) {
  const rows0 = (() => { try { return _readAll(jaa); } catch (e) { return { __err: e.message }; } })();
  if (rows0 && rows0.__err) return { observed: false, reason: `store read failed: ${rows0.__err}`, systems: [] };
  if (rows0 === null) {
    return { observed: false, reason: 'no JAA store (needs .all or .query) — cross-process subscriptions unreadable', systems: [] };
  }
  const rows = rows0 || [];

  const now = Date.now();
  // §CLOCK-SKEW FIX 2026-07-27 — found by round-two simulation (T5.1), and it
  // is the nastiest kind of staleness bug: a row dated in the FUTURE gives a
  // NEGATIVE ageMs, which can never exceed STALE_MS, so a system with a skewed
  // clock was reported LIVE FOREVER — including long after it died. Staleness
  // detection silently stopped working for exactly the machine most likely to
  // be misbehaving.
  //
  // A future timestamp is not evidence of freshness; it is evidence the clock
  // is wrong, which is itself worth surfacing. So it is flagged rather than
  // trusted OR silently clamped: `skewed` says the row cannot be aged, and it
  // counts as STALE, because "I cannot tell how old this is" must never be
  // reported as "this is current" (§1.2 — unknown is not zero).
  const SKEW_TOLERANCE_MS = 5000;   // ordinary clock jitter between hosts
  const systems = rows.map(r => {
    const rawAge = now - (r.ts || 0);
    const skewed = rawAge < -SKEW_TOLERANCE_MS;
    if (skewed) {
      console.warn(`[${MODULE_ID}] '${r.systemId || r.id}' published a subscription row dated ${Math.round(-rawAge / 1000)}s in the FUTURE — its clock is skewed, so its liveness cannot be judged. Treating as stale.`);
    }
    // Clamp small negatives (normal jitter) to 0 so a healthy host is not
    // penalised for being a second ahead.
    const ageMs = skewed ? rawAge : Math.max(0, rawAge);
    return {
      systemId: r.systemId || r.id,
      pid: r.pid ?? null,
      subscriptions: r.subscriptions || {},
      types: r.types ?? Object.keys(r.subscriptions || {}).length,
      totalListeners: r.totalListeners ?? 0,
      ts: r.ts || null,
      ageMs,
      skewed,
      stale: skewed || ageMs > STALE_MS,
    };
  }).sort((a, b) => (a.systemId < b.systemId ? -1 : 1));

  return { observed: true, staleAfterMs: STALE_MS, systems };
}

/**
 * Cross-process consumer count for one event type.
 *
 * Live and stale are reported SEPARATELY and never summed (§1.2). `live` is
 * the only number safe to draw an edge from; `stale` is evidence a process
 * that used to consume this has not published recently — which is itself
 * worth showing, but as a different kind of edge.
 *
 * @returns {object} { observed, live, stale, bySystem[], staleAfterMs, reason? }
 */
function consumersOf(eventType, jaa) {
  const snap = all(jaa);
  if (!snap.observed) return { observed: false, reason: snap.reason, live: null, stale: null, bySystem: [] };

  let live = 0, stale = 0;
  const bySystem = [];
  for (const s of snap.systems) {
    const n = s.subscriptions[eventType];
    if (!n) continue;
    if (s.stale) stale += n; else live += n;
    bySystem.push({ systemId: s.systemId, listeners: n, stale: s.stale, ageMs: s.ageMs });
  }
  return { observed: true, live, stale, bySystem, staleAfterMs: STALE_MS };
}

/**
 * The full cross-process edge list: event type → consuming systems.
 * This is the connectome's consumer half — the thing that did not exist
 * before this module, and the thing T4's brain view needs to draw a real edge.
 */
function edges(jaa) {
  const snap = all(jaa);
  if (!snap.observed) return { observed: false, reason: snap.reason, edges: [] };

  const byType = new Map();
  for (const s of snap.systems) {
    for (const [type, n] of Object.entries(s.subscriptions)) {
      if (!byType.has(type)) byType.set(type, { type, live: 0, stale: 0, systems: [] });
      const e = byType.get(type);
      if (s.stale) e.stale += n; else e.live += n;
      e.systems.push({ systemId: s.systemId, listeners: n, stale: s.stale });
    }
  }
  return {
    observed: true,
    staleAfterMs: STALE_MS,
    edges: [...byType.values()].sort((a, b) => b.live - a.live || (a.type < b.type ? -1 : 1)),
  };
}

// §12.6 — health reports what is actually observable right now, not that a
// test once passed.
function health(jaa) {
  const snap = all(jaa);
  if (!snap.observed) return { ok: false, module: MODULE_ID, version: VERSION, reason: snap.reason };
  const liveSystems = snap.systems.filter(s => !s.stale);
  return {
    ok: true, module: MODULE_ID, version: VERSION,
    systemsPublishing: snap.systems.length,
    systemsLive: liveSystems.length,
    systemsStale: snap.systems.length - liveSystems.length,
    totalLiveListeners: liveSystems.reduce((a, s) => a + s.totalListeners, 0),
    staleAfterMs: STALE_MS,
  };
}

module.exports = { MODULE_ID, VERSION, TABLE, STALE_MS, publish, publishPeriodically, all, consumersOf, edges, health };
