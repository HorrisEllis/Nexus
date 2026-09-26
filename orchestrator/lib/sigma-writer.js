'use strict';
// ── lib/sigma-writer.js ───────────────────────────────────────────────────────
// UUID: nexus-sigma-writer-v1-0000-4000-0000-000000000002
// Version: 1.0.0
// Phase: 14.6 — Sigma Producer
//
// THE OTHER MISSING WIRE.
//
// lib/autonomous-loop.js (line ~55-60) documents it explicitly:
//   "grepping every insert('sigma_records'...) call site: zero results.
//    The sigma safety check is real code that would halt a run the moment
//    a real numeric sigma >= 0.70 appears — but until something builds a
//    sigma producer, that will never happen in practice."
//
// lib/cfr/sigma.js has computeSigma() — a complete three-axis scorer.
// lib/event-ledger.js computes per-type baselines and detects anomalies.
// lib/cfr/field.js tracks a live 5-dimension CFR field.
//
// This module is the producer that was always meant to exist. It:
//   1. Subscribes to the nexus-bus ('*' wildcard)
//   2. On every event: computes a sigma score against the event-ledger
//      baseline + current CFR field state
//   3. Writes the record to JAA 'sigma_records' (§LAW II: before behavior)
//   4. Emits bus events at thresholds (0.50 warning, 0.70 halt-risk)
//   5. Computes a rolling 60-second composite system sigma and writes that
//      too — this is what autonomous-loop's safety check queries
//
// ── WHAT THIS ENABLES ────────────────────────────────────────────────────────
//   • autonomous-loop.js sigma safety check becomes real — runs will halt
//     when the system is genuinely diverging (sigma >= 0.70)
//   • versionium divergence watcher gets a populated table to query
//   • diagnostic service gets behavioral drift signal
//   • gap-loop can see sigma trajectories when evaluating escalations
//
// ── §LAW II COMPLIANCE ───────────────────────────────────────────────────────
// Every sigma_record row is written to JAA BEFORE any bus.emit call.
// The event that triggered the computation is not acknowledged as processed
// until the record is persisted.
//
// ── AXIOMS ───────────────────────────────────────────────────────────────────
// §1.1  Every sigma record has a UUID.
// §1.2  Threshold breaches are emitted — never silently absorbed.
// §2.1  sigma_records is append-only (no update, no delete — only insert).
// §2.2  JAA is source of truth. Bus is broadcast, not storage.

const crypto = require('crypto');

const MODULE_ID = 'sigma-writer';
const VERSION   = '1.0.0';

// ── Config ────────────────────────────────────────────────────────────────────
const WARN_THRESHOLD   = parseFloat(process.env.SIGMA_WARN_THRESHOLD  || '0.50');
const HALT_THRESHOLD   = parseFloat(process.env.SIGMA_HALT_THRESHOLD  || '0.70');
const COMPOSITE_WINDOW = parseInt(process.env.SIGMA_COMPOSITE_WINDOW_MS || '60000');  // 60s
const COMPOSITE_WRITE_INTERVAL = parseInt(process.env.SIGMA_COMPOSITE_INTERVAL_MS || '5000'); // 5s
const SKIP_TYPES_RE    = /sigma\.|diagnostic\.|watchdog\.tick|heartbeat\.pulse/; // avoid feedback loops

// ── Lazy deps ─────────────────────────────────────────────────────────────────
let _jaa, _uid, _bus, _ledger, _cfr, _sigmaLib;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }
function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../../nexus/nexus-bus'); } catch (_) {}
  return _bus;
}
function _getLedger() {
  if (_ledger) return _ledger;
  // §FIX 2026-07-24 — this ALWAYS threw before the .cjs rename: plain-CJS
  // event-ledger.js was force-interpreted as ESM by idearium/package.json's
  // "type":"module" (its whole tree), so `require('fs')` inside it threw
  // "ReferenceError: require is not defined in ES module scope" on every
  // call. Caught right here, so _ledger has been permanently null and
  // every record/checkAnomaly/scanInvariants call through this accessor
  // has been a silent no-op for as long as this existed. Fixed by renaming
  // to event-ledger.cjs, not by rewriting it to ESM — it never needed to be.
  try { _ledger = require('../../idearium/lib/event-ledger.cjs'); } catch (_) {}
  return _ledger;
}
function _getCFR() {
  if (_cfr) return _cfr;
  try { _cfr = require('../../intelligence/cfr/field'); } catch (_) {}
  return _cfr;
}
function _getSigmaLib() {
  if (_sigmaLib) return _sigmaLib;
  try { _sigmaLib = require('../../intelligence/cfr/sigma'); } catch (_) {}
  return _sigmaLib;
}

// ── Per-type last-seen timestamps (for temporal axis) ─────────────────────────
const _lastSeen = new Map();  // type → ts (ms)

// ── Rolling window for composite sigma ────────────────────────────────────────
// A circular buffer of recent sigma scores keyed by time.
// Composite = weighted mean of scores in the window, weighted by recency.
const _window = [];   // [{ ts, score, type }]

function _pruneWindow(now) {
  const cutoff = now - COMPOSITE_WINDOW;
  while (_window.length && _window[0].ts < cutoff) _window.shift();
}

function _computeComposite(now) {
  _pruneWindow(now);
  if (!_window.length) return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const item of _window) {
    // Exponential recency weight — events 60s ago get weight ~0.37 vs 1.0 now
    const age    = (now - item.ts) / COMPOSITE_WINDOW;
    const weight = Math.exp(-age * 2);
    weightedSum += item.score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? +(weightedSum / totalWeight).toFixed(4) : 0;
}

// ── Core: score and persist one event ────────────────────────────────────────
function _scoreEvent(eventType, eventPayload, ts) {
  const jaa    = _getJAA();
  const ledger = _getLedger();
  const cfr    = _getCFR();
  const lib    = _getSigmaLib();
  if (!jaa || !lib) return null;

  // Temporal: how long since we last saw this event type?
  const lastTs    = _lastSeen.get(eventType) || 0;
  const intervalMs = lastTs ? ts - lastTs : 0;
  _lastSeen.set(eventType, ts);

  // Baseline from event-ledger
  const baseline = ledger?.getBaseline?.(eventType) || null;

  // CFR field state — defensive fallback if CFR not yet initialised
  let cfrState = { coherence: 0.5, entropy: 0.5, friction: 0.5, resonance: 0.5 };
  try {
    if (cfr?.getState) cfrState = cfr.getState();
    else if (cfr?.field) cfrState = cfr.field;
  } catch (_) {}

  const synthEvent = { type: eventType, payload: eventPayload || {} };
  const result = lib.computeSigma(synthEvent, baseline, cfrState, intervalMs);

  const record = {
    uuid:        uid(),
    sigma:       result.score,
    type:        eventType,
    axes:        result.axes,
    reason:      result.reason,
    intervalMs,
    cfrState:    { ...cfrState },
    baselineSnap: baseline ? {
      avgIntervalMs: baseline.avgIntervalMs,
      count:         baseline.count,
    } : null,
    source:      MODULE_ID,
    ts,
  };

  // §LAW II: persist BEFORE any bus emission
  try {
    jaa.insert('sigma_records', record);
  } catch (e) {
    // If JAA insert fails, we must not emit — §2.1
    return null;
  }

  // Update rolling window
  _window.push({ ts, score: result.score, type: eventType });
  if (_window.length > 2000) _window.shift(); // cap memory

  return record;
}

// ── Composite sigma writer ────────────────────────────────────────────────────
// Written on a fixed interval — this is what autonomous-loop queries.
// Row shape: { uuid, sigma, type: 'COMPOSITE', windowMs, sampleCount, ts, source }
let _compositeInterval = null;

function _writeComposite() {
  const jaa = _getJAA();
  if (!jaa) return;
  const now       = Date.now();
  const composite = _computeComposite(now);
  const count     = _window.length;

  const record = {
    uuid:        uid(),
    sigma:       composite,
    type:        'COMPOSITE',
    windowMs:    COMPOSITE_WINDOW,
    sampleCount: count,
    source:      MODULE_ID,
    ts:          now,
  };

  try { jaa.insert('sigma_records', record); } catch (_) { return; }

  // Threshold events
  const bus = _getBus();
  // §VERSIONIUM STEP 4 2026-08-28 — record.uuid was missing from both
  // composite emits, unlike the per-event path below (_subscribe's own
  // sigma.event.* emits already include it correctly). Without it, a
  // real subscriber (the new versionium auto-commit hook) had no way to
  // reference the actual causing sigma_records row for causedBy — same
  // real gap, same fix, matching the pattern already correct elsewhere
  // in this same file.
  if (composite >= HALT_THRESHOLD) {
    bus?.emit('sigma.composite.halt_risk', { sigma: composite, count, uuid: record.uuid, ts: now });
  } else if (composite >= WARN_THRESHOLD) {
    bus?.emit('sigma.composite.warning', { sigma: composite, count, uuid: record.uuid, ts: now });
  }
}

// ── Bus listener ──────────────────────────────────────────────────────────────
let _subscribed = false;

function _subscribe() {
  if (_subscribed) return;
  const bus = _getBus();
  if (!bus) return;

  // §BUG FIXED 2026-07-09 (root cause of the 600 cfr/sigma coercion warnings
  // in the live console) — this was `bus.on('*', (eventType, payload) => ...)`.
  // But nexus-bus.js:72 emits `super.emit('*', event)` with a SINGLE argument:
  // the whole event object. So `eventType` was that object and `payload` was
  // always undefined. computeSigma() then received `{type: {…}}`, warned
  // "non-string event.type (object) — coercing", and every sigma_record
  // written since §P106 stored a type of "[object Object]" and scored against
  // an empty payload. The warnings were the symptom; this signature was the
  // disease. Specific-type listeners get the same single-object shape
  // (nexus-bus.js:71), so this is the bus's real contract, not a special case.
  bus.on('*', (event) => {
    const eventType = event?.type;
    const payload   = event?.payload;

    // Skip feedback-loop-prone event types and our own emissions
    if (!eventType || typeof eventType !== 'string' || SKIP_TYPES_RE.test(eventType)) return;

    const ts     = Date.now();
    const record = _scoreEvent(eventType, payload, ts);
    if (!record) return;

    // Per-event threshold emissions
    if (record.sigma >= HALT_THRESHOLD) {
      bus.emit('sigma.event.halt_risk', {
        sigma:  record.sigma,
        type:   eventType,
        axes:   record.axes,
        reason: record.reason,
        uuid:   record.uuid,
        ts,
      });
    } else if (record.sigma >= WARN_THRESHOLD) {
      bus.emit('sigma.event.warning', {
        sigma:  record.sigma,
        type:   eventType,
        axes:   record.axes,
        reason: record.reason,
        uuid:   record.uuid,
        ts,
      });
    }
  });

  _subscribed = true;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  const compositeMs = cfg.compositeIntervalMs ?? COMPOSITE_WRITE_INTERVAL;

  // Subscribe immediately — if bus isn't up yet, retry every 1s until it is
  const _trySubscribe = () => {
    _subscribe();
    if (!_subscribed) setTimeout(_trySubscribe, 1000);
  };
  _trySubscribe();

  // Composite writer on a fixed interval
  _compositeInterval = setInterval(_writeComposite, compositeMs);
  _compositeInterval.unref?.();

  console.log(`[${MODULE_ID}] v${VERSION} — warn:${WARN_THRESHOLD} halt:${HALT_THRESHOLD} composite_interval:${compositeMs}ms window:${COMPOSITE_WINDOW}ms`);
}

function stop() {
  if (_compositeInterval) { clearInterval(_compositeInterval); _compositeInterval = null; }
  _subscribed = false;
}

function getComposite() {
  return _computeComposite(Date.now());
}

function validateWiring() {
  const checks = {
    jaa:           !!_getJAA(),
    bus:           !!_getBus(),
    ledger:        !!_getLedger(),
    cfr:           !!_getCFR(),
    sigmaLib:      !!_getSigmaLib(),
    subscribed:    _subscribed,
    windowSize:    _window.length,
    lastSeenTypes: _lastSeen.size,
  };
  const ok = [checks.jaa, checks.bus, checks.ledger, checks.cfr, checks.sigmaLib, checks.subscribed]
    .filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${ok}/6 ready. window: ${checks.windowSize} events`);
  return checks;
}

module.exports = {
  init, stop, validateWiring,
  getComposite,
  _scoreEvent,        // test-only
  _computeComposite,  // test-only
  MODULE_ID, VERSION,
  WARN_THRESHOLD, HALT_THRESHOLD,
};
