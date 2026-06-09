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

    if (frictions.length > 0 && overallSigma > this.sigmaThreshold) {
      const gapId = `${this.name}:baseline-deviation:${Date.now()}`;
      const gap = {
        uuid:       uid(),
        type:       'baseline_deviation',
        system:     this.name,
        sigma:      +overallSigma.toFixed(4),
        frictions,
        event,
        detectedAt: Date.now(),
        status:     'open',
      };
      this._gaps.set(gapId, gap);
      this._appendLedger({ type: 'gap.found', gap, ts: Date.now() });

      if (this.onGap) this.onGap(gap);
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

  baseline() { return this._baseline; }

  gaps() { return [...this._gaps.values()].filter(g => g.status === 'open'); }

  closeGap(uuid) {
    for (const [k, g] of this._gaps) {
      if (g.uuid === uuid) { g.status = 'closed'; g.closedAt = Date.now(); break; }
    }
  }

  stats() {
    return {
      name:              this.name,
      baselineEstablished: !!this._baseline,
      events:            this._events.length,
      sigma:             +sigma(this._latencies).toFixed(4),
      friction:          this.friction(),
      openGaps:          this.gaps().length,
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
