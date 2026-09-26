'use strict';
// lib/baseline.js — Per-Kernel Baseline Monitor
// UUID: nexus-baseline-monitor-v1-0000-4000-0000-000000000001
//
// Every kernel establishes a baseline from its first N events.
// Deviations from baseline are scored by sigma.
// Sigma above threshold → gap.found → diagnostic system.
// All failures logged to the failure mode ledger with:
//   - error description
//   - suggested solution (from fix_map if known)
//   - friction score (how much does this deviation affect baseline)
//
// SEAM CONTRACT (DIAGNOSTIC_CONTRACT):
//   observe(event)           → updates baseline + scores deviation
//   friction(systemId)       → current friction score
//   baseline(systemId)       → current baseline invariant
//   gaps()                   → all open baseline deviations as gaps
//   logFailure(id, entry)    — write to failure mode ledger

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

function uid() { return crypto.randomUUID(); }

// ── Math ──────────────────────────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sigma(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return +Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length).toFixed(4);
}

function slope(arr) {
  if (arr.length < 2) return 0;
  const n  = arr.length;
  const xs = arr.map((_, i) => i);
  const mx = mean(xs), my = mean(arr);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (arr[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den === 0 ? 0 : +(num / den).toFixed(4);
}

// ── BaselineMonitor ───────────────────────────────────────────────────────────

class BaselineMonitor {
  /**
   * @param {object} opts
   * @param {string} opts.name           — system name
   * @param {string} opts.ledgerDir      — where to write event ledger
   * @param {string} opts.failuresDir    — where to write failure mode ledger
   * @param {string} opts.invariantDir   — where to persist baseline invariant
   * @param {number} opts.windowSize     — rolling window for sigma (default 50)
   * @param {number} opts.baselineN      — events before baseline established (default 20)
   * @param {number} opts.sigmaThreshold — sigma above which = friction (default 0.3)
   * @param {Function} opts.onGap        — called when sigma deviation detected
   */
  constructor(opts = {}) {
    this.name           = opts.name           || 'unknown';
    this.ledgerDir      = opts.ledgerDir      || `data/${this.name}/ledger`;
    this.failuresDir    = opts.failuresDir    || `data/${this.name}/failures`;
    this.invariantDir   = opts.invariantDir   || `data/${this.name}/invariant`;
    this.windowSize     = opts.windowSize     || 50;
    this.baselineN      = opts.baselineN      || 20;
    this.sigmaThreshold = opts.sigmaThreshold || 0.3;
    this.onGap          = opts.onGap          || null;

    // Ensure dirs
    for (const d of [this.ledgerDir, this.failuresDir, this.invariantDir]) {
      fs.mkdirSync(d, { recursive: true });
    }

    // Runtime state
    this._events    = [];          // rolling window of event records
    this._latencies = [];          // rolling window of event latencies (ms)
    this._errors    = [];          // rolling window of error flags (1/0)
    this._baseline  = null;        // established baseline invariant
    this._gaps      = new Map();   // open deviations
    // FIX (James, 2026-06-19 — "sigma only goes to .3" / gap spam):
    // _scoreDeviation used to insert a brand-new gap on every single observe()
    // call where overallSigma crossed sigmaThreshold. Because overallSigma is
    // recomputed fresh from the rolling window every call, it naturally
    // oscillates right at the threshold line as the window settles — so one
    // real deviation episode was logging dozens of near-duplicate gaps, all
    // hovering at ~sigmaThreshold, instead of one open gap that updates in
    // place and closes when the system recovers. _openDeviationGap is the
    // latch: at most one open baseline_deviation gap per monitor at a time.
    this._openDeviationGap = null; // gapId of the currently-open deviation gap, or null
    this._lastFrictions    = [];   // most recent per-axis delta scores (see deltas())

    // Load persisted baseline
    this._loadBaseline();
  }

  // ── Observe — feed an event into the monitor ──────────────────────────────

  /**
   * Observe a system event. Updates rolling window, scores deviation.
   * @param {object} event
   * @param {string} event.type       — event type
   * @param {number} event.latencyMs  — operation latency (optional)
   * @param {boolean} event.error     — was this an error event?
   * @param {number} event.ts         — timestamp
   */
  observe(event = {}) {
    const record = {
      type:      event.type      || 'unknown',
      latencyMs: event.latencyMs || 0,
      error:     event.error     || false,
      ts:        event.ts        || Date.now(),
    };

    // Append to ledger
    this._appendLedger(record);

    // Update rolling windows
    this._events.push(record);
    if (this._events.length > this.windowSize) this._events.shift();

    this._latencies.push(record.latencyMs);
    if (this._latencies.length > this.windowSize) this._latencies.shift();

    this._errors.push(record.error ? 1 : 0);
    if (this._errors.length > this.windowSize) this._errors.shift();

    // Establish baseline after N events
    if (!this._baseline && this._events.length >= this.baselineN) {
      this._establishBaseline();
    }

    // Score deviation if baseline exists
    if (this._baseline) {
      this._scoreDeviation(record);
    }

    return this;
  }

  // ── Establish baseline ────────────────────────────────────────────────────

  _establishBaseline() {
    const latencies = this._latencies.slice();
    const errors    = this._errors.slice();

    this._baseline = {
      establishedAt:    Date.now(),
      eventCount:       this._events.length,
      latency: {
        mean:  +mean(latencies).toFixed(2),
        sigma: +sigma(latencies).toFixed(4),
        p95:   this._percentile(latencies, 95),
      },
      errorRate: {
        mean:  +mean(errors).toFixed(4),
        sigma: +sigma(errors).toFixed(4),
      },
      eventTypes: this._eventTypeFreq(),
    };

    this._persistBaseline();

    // Write to invariant store as the ground truth
    const invFile = path.join(this.invariantDir, 'baseline.json');
    fs.writeFileSync(invFile, JSON.stringify(this._baseline, null, 2));

    return this._baseline;
  }

  // ── Score deviation from baseline ────────────────────────────────────────

  _scoreDeviation(event) {
    const b = this._baseline;
    const frictions = [];

    // Latency deviation
    const latSigma = sigma(this._latencies);
    const latDrift = Math.abs(mean(this._latencies) - b.latency.mean);
    const latFriction = latDrift > (b.latency.sigma * 3) ? latDrift / (b.latency.mean + 1) : 0;
    if (latFriction > 0.1) frictions.push({ axis: 'latency', friction: latFriction, sigma: latSigma });

    // Error rate deviation
    const errSigma    = sigma(this._errors);
    const errRateMean = mean(this._errors);
    const errFriction = errSigma > this.sigmaThreshold
      ? errSigma - this.sigmaThreshold : 0;
    if (errFriction > 0) frictions.push({ axis: 'error_rate', friction: errFriction, sigma: errSigma });

    // Overall sigma
    const overallSigma = Math.max(latSigma / (b.latency.sigma + 0.001), errSigma);

    // Delta/friction data is real signal — keep it even when nothing crosses
    // threshold, so callers (stats()/deltas()) always have the current
    // divergence breakdown, not just a boolean "gap or no gap".
    this._lastFrictions = frictions;

    const deviating = frictions.length > 0 && overallSigma > this.sigmaThreshold;

    if (deviating) {
      if (this._openDeviationGap && this._gaps.has(this._openDeviationGap)) {
        // LATCH: already-open gap for this monitor — update in place.
        // No new gap, no repeat onGap() call, no repeat ledger "gap.found".
        const gap = this._gaps.get(this._openDeviationGap);
        gap.sigma          = +overallSigma.toFixed(4);
        gap.frictions       = frictions;
        gap.event           = event;
        gap.lastSeen         = Date.now();
        gap.occurrences      = (gap.occurrences || 1) + 1;
        gap.peakSigma        = Math.max(gap.peakSigma ?? gap.sigma, +overallSigma.toFixed(4));
      } else {
        // New deviation episode — one gap, latched until recovery.
        const gapId = `${this.name}:baseline-deviation:${Date.now()}`;
        const gap = {
          uuid:        uid(),
          type:        'baseline_deviation',
          system:      this.name,
          sigma:       +overallSigma.toFixed(4),
          peakSigma:   +overallSigma.toFixed(4),
          frictions,
          event,
          detectedAt:  Date.now(),
          lastSeen:    Date.now(),
          occurrences: 1,
          status:      'open',
        };
        this._gaps.set(gapId, gap);
        this._openDeviationGap = gapId;
        this._appendLedger({ type: 'gap.found', gap, ts: Date.now() });
        if (this.onGap) this.onGap(gap);
      }
    } else if (this._openDeviationGap) {
      // Recovered — overallSigma back under threshold (or no frictions left).
      // Close the latch so the next real deviation opens a fresh gap instead
      // of silently reusing a stale one.
      const gap = this._gaps.get(this._openDeviationGap);
      if (gap && gap.status === 'open') {
        gap.status      = 'closed';
        gap.closedAt     = Date.now();
        gap.recoveredAt  = Date.now();
        this._appendLedger({ type: 'gap.closed', gap, ts: Date.now() });
      }
      this._openDeviationGap = null;
    }

    return frictions;
  }

  // ── Failure mode ledger ───────────────────────────────────────────────────

  logFailure({ id, error, solution = null, friction = 0.5, source = null }) {
    const entry = {
      uuid:      uid(),
      id,
      error,
      solution,
      friction,    // 0.0 = no friction, 1.0 = system blocked
      source,
      loggedAt:  Date.now(),
    };

    const filepath = path.join(this.failuresDir, `${id || 'general'}.ndjson`);
    fs.appendFileSync(filepath, JSON.stringify(entry) + '\n');
    return entry;
  }

  failureTail(id, n = 20) {
    const f = path.join(this.failuresDir, `${id || 'general'}.ndjson`);
    if (!fs.existsSync(f)) return [];
    const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  friction() {
    const latFriction = this._baseline
      ? Math.max(0, (sigma(this._latencies) - this._baseline.latency.sigma) / (this._baseline.latency.sigma + 0.001))
      : 0;
    const errFriction = sigma(this._errors);
    return +Math.min(1, Math.max(latFriction, errFriction)).toFixed(4);
  }

  // deltas() — the per-axis divergence breakdown from the most recent
  // observe(), independent of whether it crossed sigmaThreshold. This is the
  // "delta scoring instead of just gaps" data: size of the divergence per
  // axis (latency / error_rate), not just a boolean threshold crossing.
  deltas() { return this._lastFrictions.slice(); }

  baseline() { return this._baseline; }

  gaps() { return [...this._gaps.values()].filter(g => g.status === 'open'); }

  closeGap(uuid) {
    for (const [k, g] of this._gaps) {
      if (g.uuid === uuid) {
        g.status = 'closed'; g.closedAt = Date.now();
        if (this._openDeviationGap === k) this._openDeviationGap = null;
        break;
      }
    }
  }

  stats() {
    return {
      name:              this.name,
      baselineEstablished: !!this._baseline,
      events:            this._events.length,
      sigma:             +sigma(this._latencies).toFixed(4),
      friction:          this.friction(),
      deltas:            this.deltas(),
      openGaps:          this.gaps().length,
      gapOccurrences:    this._openDeviationGap && this._gaps.has(this._openDeviationGap)
                            ? this._gaps.get(this._openDeviationGap).occurrences : 0,
      errorRate:         +mean(this._errors).toFixed(4),
      latencyMean:       +mean(this._latencies).toFixed(2),
      slope:             +slope(this._latencies).toFixed(4),
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _appendLedger(record) {
    const f = path.join(this.ledgerDir, 'baseline-events.ndjson');
    try {
      fs.appendFileSync(f, JSON.stringify({ ...record, _ts: Date.now() }) + '\n');
    } catch(_) {}
  }

  _eventTypeFreq() {
    const freq = {};
    for (const e of this._events) freq[e.type] = (freq[e.type] || 0) + 1;
    return freq;
  }

  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx    = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  _persistBaseline() {
    const f = path.join(this.ledgerDir, 'baseline.json');
    try { fs.writeFileSync(f, JSON.stringify(this._baseline, null, 2)); } catch(_) {}
  }

  _loadBaseline() {
    const f = path.join(this.ledgerDir, 'baseline.json');
    if (!fs.existsSync(f)) return;
    try { this._baseline = JSON.parse(fs.readFileSync(f, 'utf8')); } catch(_) {}
  }
}

function createBaseline(opts = {}) {
  return new BaselineMonitor(opts);
}

module.exports = { BaselineMonitor, createBaseline, sigma, mean, slope };
