'use strict';
/**
 * lib/event-ledger.js — Universal Event Ledger
 * UUID: nexus-event-ledger-v1-0000-4000-0000-000000000001
 *
 * §LAW II — Memory Authority: JAA insert before behavior.
 *            No event acts on the system without first being written.
 *
 * §7.6  — The codebase is a materialised view of the ledger.
 *          The ledger is the learning system. Everything else is derived.
 *
 * Every system wraps its bus.emit() through this.
 * Every event gets: uuid, type, source, payload, ts, causedBy, _seq
 * Written to event_log JSONL append-only before any subscriber sees it.
 *
 * Over time the ledger accumulates:
 *   - What events fire, in what order, at what frequency
 *   - What the normal inter-event interval is (BPM baseline)
 *   - What events co-occur (invariant patterns)
 *   - What events precede failures (leading indicators)
 *   - What the SNR of each system looks like session over session
 *
 * The ledger IS the baseline. Deviation from it IS the anomaly.
 * Nothing needs to be configured. It learns by accumulating.
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function createEventLedger({ ledgerDir, systemId, onEvent = null } = {}) {
  if (!ledgerDir) throw new Error('EventLedger: ledgerDir required');
  if (!systemId)  throw new Error('EventLedger: systemId required');

  const LEDGER_FILE = path.join(ledgerDir, 'event_log.jsonl');
  const STATS_FILE  = path.join(ledgerDir, 'event_stats.json');

  let _stream   = null;
  let _seq      = 0;
  let _stats    = {};   // type → { count, lastTs, intervals[], totalMs }
  let _baseline = {};   // type → { avgInterval, stddev, count } — computed from history

  // ── Open ────────────────────────────────────────────────────────────────────
  function open() {
    fs.mkdirSync(ledgerDir, { recursive: true });
    _stream = fs.createWriteStream(LEDGER_FILE, { flags: 'a' });

    // Load existing stats to continue learning from previous sessions
    if (fs.existsSync(STATS_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        _stats    = saved.stats    || {};
        _baseline = saved.baseline || {};
      } catch(_) {}
    }

    return { file: LEDGER_FILE };
  }

  function close() {
    _saveStats();
    _stream?.end();
    _stream = null;
  }

  // ── Write ────────────────────────────────────────────────────────────────────
  /**
   * Record an event. Call this BEFORE any subscriber processes it.
   * Returns the ledger record — callers can use it for causedBy chaining.
   */
  function record(type, payload = {}, opts = {}) {
    const ts  = Date.now();
    const seq = ++_seq;
    // Guard: if not yet opened, try to open lazily
    if (!_stream) {
      try { open(); } catch(_) { return { uuid: 'noop', seq, type, ts }; }
    }

    const row = {
      uuid:      opts.uuid     || randomUUID(),
      seq,
      type,
      source:    opts.source   || systemId,
      causedBy:  opts.causedBy || null,
      sessionId: opts.sessionId || null,
      payload,
      ts,
      _system:   systemId,
      _writtenAt: ts,
    };

    // §LAW II — write first
    _stream?.write(JSON.stringify(row) + '\n');

    // Update running stats (learns baseline from every event)
    _updateStats(type, ts);

    // Notify subscriber after write
    onEvent?.(row);

    return row;
  }

  // ── Baseline learning ────────────────────────────────────────────────────────
  function _updateStats(type, ts) {
    if (!_stats[type]) {
      _stats[type] = { count: 0, lastTs: null, intervals: [], totalMs: 0 };
    }
    const s = _stats[type];
    s.count++;
    if (s.lastTs !== null) {
      const interval = ts - s.lastTs;
      s.intervals.push(interval);
      s.totalMs += interval;
      // Keep last 100 intervals per type — enough for baseline
      if (s.intervals.length > 100) s.intervals.shift();
      // Recompute baseline after every 10 new events
      if (s.count % 10 === 0) _recomputeBaseline(type);
    }
    s.lastTs = ts;
  }

  function _recomputeBaseline(type) {
    const s = _stats[type];
    if (!s || s.intervals.length < 5) return;

    const avg = s.intervals.reduce((a,b) => a+b, 0) / s.intervals.length;
    const variance = s.intervals.reduce((v,i) => v + Math.pow(i-avg,2), 0) / s.intervals.length;
    const stddev = Math.sqrt(variance);
    const cv = avg > 0 ? stddev / avg : 1; // coefficient of variation — lower = more consistent

    _baseline[type] = {
      avgIntervalMs: Math.round(avg),
      stddevMs:      Math.round(stddev),
      consistency:   Math.max(0, Math.min(1, 1 - cv)),
      count:         s.count,
      sampleSize:    s.intervals.length,
      computedAt:    Date.now(),
    };
  }

  // ── Anomaly detection ────────────────────────────────────────────────────────
  /**
   * Check if a gap between events is anomalous given the baseline.
   * Returns { anomaly, score, expected, actual, type }
   * score 0 = normal, 1 = extreme anomaly
   */
  function checkAnomaly(type, actualIntervalMs) {
    const b = _baseline[type];
    if (!b || b.count < 20) return { anomaly: false, score: 0, reason: 'insufficient baseline' };

    const deviation = Math.abs(actualIntervalMs - b.avgIntervalMs);
    const sigmas    = b.stddevMs > 0 ? deviation / b.stddevMs : 0;

    // > 3 sigma = anomaly
    const anomaly = sigmas > 3;
    const score   = Math.min(1, sigmas / 6); // 6 sigma = score 1.0

    return {
      anomaly,
      score,
      sigmas:   Math.round(sigmas * 10) / 10,
      expected: b.avgIntervalMs,
      actual:   actualIntervalMs,
      type,
    };
  }

  // ── Invariant detection ──────────────────────────────────────────────────────
  /**
   * Over time: which event types always co-occur?
   * Which events always precede failures?
   * Answers emerge from the ledger — they are not configured.
   *
   * This runs as a background scan, not on every event.
   * Call periodically (e.g. every 60s) to update the invariant index.
   */
  function scanInvariants(windowMs = 5000) {
    // Read recent events from disk and find co-occurrence patterns
    // Returns { coOccurrences, failurePrecursors }
    // This is the learning pass — called by the orchestrator hourly
    if (!fs.existsSync(LEDGER_FILE)) return { coOccurrences: {}, failurePrecursors: [] };

    const lines = fs.readFileSync(LEDGER_FILE, 'utf8')
      .split('\n').filter(Boolean).slice(-1000); // last 1000 events

    const events = [];
    for (const line of lines) {
      try { events.push(JSON.parse(line)); } catch(_) {}
    }

    // Co-occurrence: events within windowMs of each other
    const coOccurrences = {};
    for (let i = 0; i < events.length; i++) {
      const a = events[i];
      for (let j = i+1; j < events.length; j++) {
        const b = events[j];
        if (b.ts - a.ts > windowMs) break;
        const key = [a.type, b.type].sort().join('::');
        coOccurrences[key] = (coOccurrences[key] || 0) + 1;
      }
    }

    // Failure precursors: what events appear in the 30s before a failure?
    const failures = events.filter(e => e.type.includes('failure') ||
      e.type.includes('error') || e.type.includes('halted') ||
      e.type.includes('dead') || e.type.includes('gap'));
    const failurePrecursors = {};
    for (const failure of failures) {
      const precursors = events.filter(e =>
        e.ts < failure.ts && e.ts > failure.ts - 30000 && e.type !== failure.type
      );
      for (const p of precursors) {
        failurePrecursors[p.type] = (failurePrecursors[p.type] || 0) + 1;
      }
    }

    return { coOccurrences, failurePrecursors, eventCount: events.length };
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  function getBaseline(type) { return _baseline[type] || null; }
  function getAllBaselines()  { return { ..._baseline }; }
  function getStats(type)    { return _stats[type] || null; }
  function getAllStats()      { return { ..._stats }; }
  function getSeq()          { return _seq; }

  /**
   * Tail the ledger — last N events from disk.
   */
  function tail(n = 20) {
    if (!fs.existsSync(LEDGER_FILE)) return [];
    const lines = fs.readFileSync(LEDGER_FILE, 'utf8')
      .split('\n').filter(Boolean).slice(-n);
    return lines.map(l => { try { return JSON.parse(l); } catch(_) { return null; } })
      .filter(Boolean);
  }

  // ── Persistence ──────────────────────────────────────────────────────────────
  function _saveStats() {
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify({ stats: _stats, baseline: _baseline }, null, 2));
    } catch(_) {}
  }

  // Save stats every 60s so they survive crashes
  let _saveInterval = null;
  function startAutoSave(intervalMs = 60000) {
    _saveInterval = setInterval(_saveStats, intervalMs);
    _saveInterval.unref();
  }

  function stopAutoSave() {
    clearInterval(_saveInterval);
    _saveInterval = null;
  }

  return {
    open, close,
    record, checkAnomaly, scanInvariants,
    getBaseline, getAllBaselines, getStats, getAllStats, getSeq,
    tail, startAutoSave, stopAutoSave,
  };
}

module.exports = { createEventLedger };
