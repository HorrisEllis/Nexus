'use strict';
/**
 * lib/ledger-fanin/index.js — the unified event fan-in (agnostic lib tool)
 * UUID: nexus-ledger-fanin-v1-0000-2026-0804-001
 *
 * James: "every system and the intelligence system needs to read the SSE and
 * event ledger."
 *
 * TODAY: each system has its OWN event ledger (idearium/lib/event-ledger.cjs,
 * createEventLedger per systemId), and consumers subscribe in corners — eravos
 * organisms subscribe to their own, intelligence does cross-ledger analysis over
 * SOME ledgers, autopilot keeps its own. There is no ONE place where every
 * system's events fan in and every consumer (intelligence, autopilot, co-pilot)
 * reads the SAME unified stream. That scattering is why "intelligence isn't
 * detecting everything" — it only sees the ledgers it happens to read.
 *
 * THIS: a single fan-in hub. Every system registers its ledger (or just emits
 * here); every consumer subscribes ONCE and receives EVERY system's events,
 * tagged with their source. Intelligence, autopilot, and co-pilot's continuous
 * stream all read from this — so the whole system sees the whole system.
 *
 * §8.6 — composes the existing event-ledger record shape; adds no new ledger
 * format. §agnostic — lib/, no system owns it. §1.2 — a slow/broken subscriber
 * is isolated (its throw doesn't stop the fan-out or other subscribers). §0.3 —
 * a bounded ring buffer keeps recent events so a late subscriber can catch up
 * rather than starting blind.
 */

const RING_SIZE = 500;   // recent events a late subscriber can replay

let _subscribers = [];    // { id, fn, filter }
let _ring = [];           // bounded recent-event buffer
let _sources = new Set(); // which systems have fed in (for coverage reporting)
let _counts = {};         // per-source event counts (detection coverage)

/**
 * emit(event) — a system pushes one event into the fan-in. Accepts the standard
 * ledger row shape ({ type, source/_system, payload, ts, ... }). Fans out to
 * every subscriber whose filter matches; never throws to the emitter.
 */
function emit(event) {
  if (!event || !event.type) return { ok: false, reason: 'event needs a type' };
  const source = event.source || event._system || 'unknown';
  const row = { ...event, source, _faninAt: Date.now() };

  _sources.add(source);
  _counts[source] = (_counts[source] || 0) + 1;

  // Ring buffer (§0.3 — recent history for late subscribers).
  _ring.push(row);
  if (_ring.length > RING_SIZE) _ring.shift();

  // Fan out — each subscriber isolated (§1.2 one bad subscriber can't stop the rest).
  for (const sub of _subscribers) {
    try {
      if (!sub.filter || sub.filter(row)) sub.fn(row);
    } catch (_) { /* isolate — a throwing subscriber does not break the fan-out */ }
  }
  return { ok: true, source, subscribers: _subscribers.length };
}

/**
 * subscribe(id, fn, opts) — a consumer (intelligence, autopilot, co-pilot)
 * registers to receive EVERY system's events. opts.filter(row)->bool narrows;
 * opts.replay=true delivers the ring buffer first so it starts caught-up, not
 * blind. Returns an unsubscribe fn.
 */
function subscribe(id, fn, opts = {}) {
  const sub = { id, fn, filter: opts.filter || null };
  _subscribers = _subscribers.filter(s => s.id !== id).concat(sub);   // idempotent by id
  if (opts.replay) {
    for (const row of _ring) { try { if (!sub.filter || sub.filter(row)) fn(row); } catch (_) {} }
  }
  return () => { _subscribers = _subscribers.filter(s => s.id !== id); };
}

/**
 * bridgeLedger(ledger) — connect an existing per-system event-ledger so its
 * records also flow into the fan-in. Wraps its onEvent without replacing it.
 * This is how a system that already uses createEventLedger joins the fan-in
 * with one line, keeping its own local ledger intact (§8.6 — don't replace it).
 */
function bridgeLedger(ledger, systemId) {
  if (!ledger) return { ok: false, reason: 'no ledger' };
  const prior = ledger.onEvent;
  ledger.onEvent = (row) => {
    try { prior && prior(row); } catch (_) {}
    emit({ ...row, source: row.source || systemId || row._system });
  };
  return { ok: true, bridged: systemId || 'unknown' };
}

/**
 * coverage() — which systems are actually feeding the fan-in, and how much. This
 * is the answer to "is intelligence detecting everything": if a known system is
 * absent here, its events are NOT reaching intelligence/autopilot/co-pilot. The
 * diagnostic system reads this to flag a system that's gone silent.
 */
function coverage(expectedSystems = []) {
  const seen = [..._sources];
  const missing = expectedSystems.filter(s => !_sources.has(s));
  return {
    feeding: seen,
    counts: { ..._counts },
    missing,                                   // expected but never emitted → a real detection gap
    total: Object.values(_counts).reduce((a, b) => a + b, 0),
    subscribers: _subscribers.map(s => s.id),
    ringSize: _ring.length,
  };
}

function recent(n = 50, filter = null) {
  const rows = filter ? _ring.filter(filter) : _ring;
  return rows.slice(-n);
}

function _resetForTest() { _subscribers = []; _ring = []; _sources = new Set(); _counts = {}; }

module.exports = { emit, subscribe, bridgeLedger, coverage, recent, RING_SIZE, _resetForTest, MODULE_ID: 'ledger-fanin', VERSION: '1.0.0' };
