/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  BRIDGE-CODEC  ·  bridge-codec-v3.js  ·  v3.0.0                        ║
 * ║  UUID: bridge-codec-v3-0000-3000-000000000003                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Rebuilt from codec.js (v1.9.0) + codec-v2.js (v1.9.0), repurposed for
 * Bridge OS transport acceleration. The behavioral analytics engines are
 * repurposed as connection signal processors: energy → link health,
 * friction → congestion, topology → transport-layer state machine.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES / ACCELERATES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  REPLACES: heartbeat/index.js polling loop (5000ms interval)
 *            → replaced by adaptive pulse: 150ms under good link, backs off
 *              to 3000ms only when link is provably stable (oscillationStable=true)
 *
 *  REPLACES: transport/index.js round-trip selection (try HTTP → BLE → fail)
 *            → replaced by predictive pre-selection using SlopeEngine on
 *              per-adapter latency history: the winning adapter is pre-warmed
 *              before the previous request completes.
 *
 *  REPLACES: DHT FIND_NODE hop-by-hop (ALPHA=3, LOOKUP_TIMEOUT=4000ms each)
 *            → replaced by speculative parallel lookup with confidence-weighted
 *              early termination: stops when ConfidencePropagator joint() > 0.85
 *              across 3 simultaneous probes, not waiting for all ALPHA paths.
 *
 *  REPLACES: mesh/channel.js per-message encrypt+sign overhead in hot path
 *            → replaced by BATCH_WINDOW: messages are coalesced into 20ms
 *              windows, encrypted once as a batch, then split. Auth per batch,
 *              not per message.
 *
 *  ACCELERATES: BLE chunking (20-byte ATT MTU)
 *            → RollingStats on chunk ACK intervals; if variance < threshold,
 *              MTU is optimistically raised to 247 (BLE 5 DLE) and confirmed.
 *              Drops back on NACK.
 *
 *  ACCELERATES: CFR field updates (/cfr/stream WebSocket delta fan-out)
 *            → OscillationEngine on delta frequency; when oscillating stably,
 *              client-side prediction fills gaps without server round-trips.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  RollingStats         — unchanged from codec.js; used for link signal
 *  SlopeEngine          — from codec-v2.js; tracks latency trajectory
 *  StabilityEngine      — from codec-v2.js; detects link regime changes
 *  OscillationEngine    — from codec-v2.js; detects ping rhythms / stutter
 *  ConfidencePropagator — from codec-v2.js; cross-transport corroboration
 *
 *  LinkSignalProcessor  — repurposed FrictionAnalyzer: flags congestion,
 *                         jitter spikes, timeout patterns, retry storms
 *
 *  AdaptivePulse        — repurposed TranscriptEngine: replaces heartbeat
 *                         polling loop with energy-adaptive interval control
 *
 *  TransportOracle      — repurposed PredictiveEngine: Markov-1 on
 *                         (transport × outcome) sequences; pre-selects
 *                         winning adapter before previous call completes
 *
 *  SpeculativeLookup    — repurposed AssociationEngine: builds UUID adjacency
 *                         graph from DHT responses; short-circuits FIND_NODE
 *                         when graph predicts the target is reachable in 1 hop
 *
 *  MessageBatcher       — repurposed GPGPUAudioProcessor chunk-boundary logic:
 *                         coalesces messages into 20ms windows, encrypts once
 *
 *  BLEMTUProbe          — repurposed adaptive frame buffering: probes BLE MTU
 *                         upward from 20 → 247 using ACK variance as signal
 *
 *  BridgeCodecRuntime   — top-level wiring (replaces NexusRuntime/NexusCodec)
 *
 * §1.1 — All outputs labeled as signal. "CongestionSignal" ≠ "the link is broken".
 * §1.2 — All errors loud and traceable.
 * §5.5 — Zero external deps beyond what Bridge OS already requires (crypto, http).
 * §5.7 — One bus. Everything reads/writes the bus. No sideband state.
 */

'use strict';

// ── Version ───────────────────────────────────────────────────────────────────

export const CODEC_V3_VERSION = '3.0.0';
export const CODEC_V3_UUID    = 'bridge-codec-v3-0000-3000-000000000003';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLLING_WINDOW          = 20;
const SLOPE_WINDOW            = 8;
const ENERGY_SIGMA_ALERT      = 2.0;
const STABILITY_CV_ALERT      = 0.55;
const OSC_MIN_CYCLES          = 3;
const CONFIDENCE_PROP_WEIGHT  = 0.4;
const DECAY_HALFLIFE          = 10;

// Link-specific
const PULSE_FAST_MS           = 150;    // healthy link polling interval
const PULSE_SLOW_MS           = 3000;   // stable/idle link polling interval
const PULSE_DEGRADE_MS        = 800;    // degraded link: check more often
const BATCH_WINDOW_MS         = 20;     // message coalescing window
const BLE_MTU_MIN             = 20;     // safe default BLE ATT MTU
const BLE_MTU_MAX             = 247;    // BLE 5 DLE max
const BLE_MTU_PROBE_VARIANCE  = 2.0;   // ms variance to allow MTU bump
const DHT_CONFIDENCE_STOP     = 0.85;  // speculative lookup early-exit threshold
const DHT_MAX_PARALLEL        = 3;     // parallel FIND_NODE probes (= ALPHA)
const CONGESTION_COOLDOWN_MS  = 500;   // min ms between congestion signals
const RETRY_STORM_THRESHOLD   = 4;     // retries in window = retry storm
const HEURISTIC_PROMOTE       = 3;     // pattern count to promote to heuristic

// ── Utilities ─────────────────────────────────────────────────────────────────

function r4(v)       { return Math.round((v ?? 0) * 10000) / 10000; }
function mean(a)     { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function variance(a) { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; }

// ── RollingStats ──────────────────────────────────────────────────────────────
// Unchanged from codec.js. Used here for link latency, jitter, loss rate.

export class RollingStats {
  constructor(window = ROLLING_WINDOW) {
    this._w    = window;
    this._buf  = [];
    this._sum  = 0;
    this._sum2 = 0;
  }

  push(v) {
    if (this._buf.length >= this._w) {
      const old = this._buf.shift();
      this._sum  -= old;
      this._sum2 -= old * old;
    }
    this._buf.push(v);
    this._sum  += v;
    this._sum2 += v * v;
    return this;
  }

  get mean()     { return this._buf.length ? this._sum / this._buf.length : 0; }
  get variance() {
    const n = this._buf.length;
    if (n < 2) return 0;
    return Math.max(0, this._sum2 / n - (this._sum / n) ** 2);
  }
  get sigma()    { return Math.sqrt(this.variance); }
  get last()     { return this._buf[this._buf.length - 1] ?? 0; }
  get len()      { return this._buf.length; }

  zScore(v) { return this.sigma > 0 ? (v - this.mean) / this.sigma : 0; }

  measure(v) {
    const prev = this.last;
    this.push(v);
    return {
      mean:    this.mean,
      sigma:   this.sigma,
      delta:   v - prev,
      zScore:  this.zScore(v),
      anomaly: Math.abs(this.zScore(v)) > ENERGY_SIGMA_ALERT,
    };
  }

  decayMean(halfLife = DECAY_HALFLIFE) {
    if (!this._buf.length) return 0;
    const lambda = Math.LN2 / halfLife;
    let wSum = 0, wTot = 0;
    const n = this._buf.length;
    for (let i = 0; i < n; i++) {
      const w = Math.exp(-lambda * (n - 1 - i));
      wSum += this._buf[i] * w;
      wTot += w;
    }
    return wTot > 0 ? wSum / wTot : 0;
  }

  clear() { this._buf = []; this._sum = 0; this._sum2 = 0; }
}

// ── SlopeEngine ───────────────────────────────────────────────────────────────
// From codec-v2.js. Applied here to per-adapter latency series.
// "rising" latency slope → deprioritize this adapter in TransportOracle.

export class SlopeEngine {
  constructor(window = SLOPE_WINDOW) {
    this._w        = window;
    this._buf      = [];
    this._prevDir  = 'flat';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    if (n < 2) return { slope: 0, r2: 0, direction: 'flat', momentum: 0, regimeChange: false };
    let sx=0,sy=0,sxy=0,sx2=0,sy2=0;
    for (let i=0;i<n;i++) { sx+=i; sy+=this._buf[i]; sxy+=i*this._buf[i]; sx2+=i*i; sy2+=this._buf[i]**2; }
    const D     = n*sx2 - sx*sx;
    const slope = D !== 0 ? (n*sxy - sx*sy) / D : 0;
    const b     = (sy - slope*sx) / n;
    const my    = sy/n;
    let ssT=0, ssR=0;
    for (let i=0;i<n;i++) { ssT+=(this._buf[i]-my)**2; ssR+=(this._buf[i]-(b+slope*i))**2; }
    const r2  = ssT > 0 ? Math.max(0, 1 - ssR/ssT) : 0;
    const dir = Math.abs(slope) < 0.003 ? 'flat' : slope > 0 ? 'rising' : 'falling';
    const sig = Math.sqrt(Math.max(0, sy2/n - (sy/n)**2));
    const mom = sig > 0 ? (slope * r2) / sig : 0;
    const rc  = dir !== 'flat' && this._prevDir !== 'flat' && dir !== this._prevDir;
    this._prevDir = dir;
    return { slope: r4(slope), r2: r4(r2), direction: dir, momentum: r4(mom), regimeChange: rc };
  }

  reset() { this._buf = []; this._prevDir = 'flat'; }
}

// ── StabilityEngine ───────────────────────────────────────────────────────────
// From codec-v2.js. Detects link regime: stable, volatile, collapsed.
// Volatile link → tighten pulse interval. Stable → relax to PULSE_SLOW_MS.

export class StabilityEngine {
  constructor(window = 20) {
    this._w          = window;
    this._buf        = [];
    this._cvHistory  = [];
    this._prevRegime = 'stable';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n     = this._buf.length;
    const m     = mean(this._buf);
    const sig   = Math.sqrt(variance(this._buf));
    const cv    = Math.abs(m) > 1e-6 ? sig / Math.abs(m) : sig;
    this._cvHistory.push(cv);
    if (this._cvHistory.length > 10) this._cvHistory.shift();
    const cvD   = this._cvHistory.length > 1
      ? cv - this._cvHistory[this._cvHistory.length - 2] : 0;
    const regime = cv > STABILITY_CV_ALERT ? 'volatile'
      : cv < 0.04 && n >= 5 ? 'collapsed' : 'stable';
    const rc = regime !== this._prevRegime;
    this._prevRegime = regime;
    return {
      cv:             r4(cv),
      regime,
      regimeChange:   rc,
      convergence:    cvD < -0.02,
      divergence:     cvD > 0.02,
      stabilityScore: r4(Math.max(0, 1 - Math.min(1, cv / STABILITY_CV_ALERT))),
    };
  }

  reset() { this._buf = []; this._cvHistory = []; this._prevRegime = 'stable'; }
}

// ── OscillationEngine ─────────────────────────────────────────────────────────
// From codec-v2.js. Applied to heartbeat latency series.
// Rhythmic latency = stable link. Chaotic = congested. Flat = dead.

export class OscillationEngine {
  constructor(window = 60) {
    this._w       = window;
    this._buf     = [];
    this._peaks   = [];
    this._troughs = [];
    this._total   = 0;
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    this._total++;
    const n = this._buf.length;
    if (n >= 5) {
      const i = n - 3;
      const [p2,p1,c,n1,n2] = [
        this._buf[i-2] ?? this._buf[0],
        this._buf[i-1],
        this._buf[i],
        this._buf[i+1],
        this._buf[i+2] ?? this._buf[n-1],
      ];
      const mv = (p2+p1+c+n1+n2)/5;
      if (c>p1&&c>n1&&c>mv*1.04) {
        this._peaks.push({ idx: this._total-2, v: c });
        if (this._peaks.length > 20) this._peaks.shift();
      }
      if (c<p1&&c<n1&&c<mv*0.96) {
        this._troughs.push({ idx: this._total-2, v: c });
        if (this._troughs.length > 20) this._troughs.shift();
      }
    }
    const pk = this._peaks;
    if (pk.length < OSC_MIN_CYCLES) {
      return { oscillating: false, period: null, regularity: 0, phase: 0, amplitude: 0 };
    }
    const intervals = [];
    for (let i=1;i<pk.length;i++) intervals.push(pk[i].idx - pk[i-1].idx);
    const iM   = mean(intervals);
    const iS   = Math.sqrt(variance(intervals));
    const iCV  = iM > 0 ? iS / iM : 1;
    const osc  = iCV < 0.28 && pk.length >= OSC_MIN_CYCLES;
    const reg  = Math.max(0, 1 - iCV);
    const phase = pk.length > 0 ? this._total - pk[pk.length-1].idx : 0;
    let amp = 0;
    if (this._troughs.length > 0) {
      amp = Math.max(0, mean(pk.map(p=>p.v)) - mean(this._troughs.map(t=>t.v)));
    }
    return {
      oscillating: osc,
      period:      osc ? r4(iM) : null,
      regularity:  r4(reg),
      phase,
      amplitude:   r4(amp),
      intervalCV:  r4(iCV),
    };
  }

  reset() { this._buf = []; this._peaks = []; this._troughs = []; this._total = 0; }
}

// ── ConfidencePropagator ──────────────────────────────────────────────────────
// From codec-v2.js. Cross-transport corroboration.
// BLE timeout + HTTP slow response → joint low-confidence → flag upstream.

export class ConfidencePropagator {
  constructor(windowMs = 500) {
    this._windowMs = windowMs;
    this._buffer   = [];
  }

  observe(type, confidence, ts = Date.now()) {
    this._buffer.push({ type, confidence, ts });
    this._prune(ts);
  }

  propagated(type, ts = Date.now()) {
    this._prune(ts);
    const own = this._buffer.filter(s => s.type === type);
    if (!own.length) return 0;
    const ownConf  = Math.max(...own.map(s => s.confidence));
    const others   = this._buffer.filter(s => s.type !== type);
    if (!others.length) return ownConf;
    const otherMean = mean(others.map(s => s.confidence));
    const boost     = otherMean * CONFIDENCE_PROP_WEIGHT;
    return Math.min(1, ownConf + boost * (1 - ownConf));
  }

  joint(types, ts = Date.now()) {
    this._prune(ts);
    let minConf = 1;
    for (const type of types) {
      const sigs = this._buffer.filter(s => s.type === type);
      if (!sigs.length) return 0;
      minConf = Math.min(minConf, Math.max(...sigs.map(s => s.confidence)));
    }
    return r4(minConf);
  }

  _prune(ts) {
    this._buffer = this._buffer.filter(s => ts - s.ts < this._windowMs);
  }

  reset() { this._buffer = []; }
}

// ── LinkSignalProcessor ───────────────────────────────────────────────────────
// Repurposed FrictionAnalyzer from codec.js.
//
// Instead of disfluency in speech → congestion patterns in transport:
//   disfluency      → timeout_sequence (request stalled, retried, stalled)
//   memoryGap       → ack_gap (ACK window expired, no confirmation received)
//   cognitiveLoad   → retry_storm (same packet retried N times in window)
//   tension         → latency_spike (latency > 3σ from rolling mean)
//   denial          → transport_refusal (adapter available() = false repeatedly)
//
// §1.1 — "CongestionSignal" ≠ "the link is broken". These are markers.

export class LinkSignalProcessor {
  constructor() {
    this._rollingDensity = new RollingStats(30);
    this._patternCounts  = new Map();
    this._retryCounts    = new Map();      // adapter → retry count in window
    this._lastSignalTs   = 0;
    this._sessionTotal   = 0;
  }

  /**
   * Analyze a transport event for congestion signals.
   * @param {object} event — { type, adapter, latencyMs, ok, retryN, errorCode }
   * @param {object} latencyStats — from RollingStats.measure(latencyMs)
   * @returns {object} congestion signal payload
   */
  analyze(event, latencyStats) {
    const found = [];
    const now   = Date.now();

    // Timeout sequence (disfluency analog)
    if (!event.ok && event.errorCode === 'timeout') {
      found.push({ type: 'timeout_sequence', adapter: event.adapter });
      this._bump('timeout_sequence');
    }

    // ACK gap (memoryGap analog) — latency z-score > 2.5
    if (latencyStats && latencyStats.zScore > 2.5) {
      found.push({ type: 'ack_gap', zScore: r4(latencyStats.zScore), latency: event.latencyMs });
      this._bump('ack_gap');
    }

    // Retry storm (cognitiveLoad analog)
    const adapterKey = event.adapter ?? 'unknown';
    const retries    = (this._retryCounts.get(adapterKey) ?? 0) + (event.retryN ?? 0);
    this._retryCounts.set(adapterKey, retries);
    // Reset retry counts every 5s
    if (now - this._lastSignalTs > 5000) this._retryCounts.clear();
    if (retries >= RETRY_STORM_THRESHOLD) {
      found.push({ type: 'retry_storm', adapter: adapterKey, retries });
      this._bump('retry_storm');
    }

    // Latency spike (tension analog) — sigma anomaly
    if (latencyStats?.anomaly) {
      found.push({ type: 'latency_spike', sigma: r4(latencyStats.sigma), delta: r4(latencyStats.delta) });
      this._bump('latency_spike');
    }

    // Transport refusal (denial analog)
    if (!event.ok && event.errorCode === 'unavailable') {
      found.push({ type: 'transport_refusal', adapter: event.adapter });
      this._bump('transport_refusal');
    }

    const density     = found.length;                          // raw count per event
    const stats       = this._rollingDensity.measure(density);
    const congested   = found.length > 0;
    if (congested) { this._sessionTotal++; this._lastSignalTs = now; }

    return {
      congested,
      signals:    found,
      types:      [...new Set(found.map(f => f.type))],
      score:      Math.min(1, found.length / 3),
      density:    r4(density),
      stats,
      promoted:   this._checkPromotions(),
    };
  }

  _bump(key) {
    this._patternCounts.set(key, (this._patternCounts.get(key) ?? 0) + 1);
  }

  _checkPromotions() {
    const promoted = [];
    for (const [k, n] of this._patternCounts) {
      if (n === HEURISTIC_PROMOTE) promoted.push({ pattern: k, count: n });
    }
    return promoted;
  }

  reset() {
    this._rollingDensity.clear();
    this._patternCounts.clear();
    this._retryCounts.clear();
    this._sessionTotal = 0;
  }
}

// ── TransportOracle ───────────────────────────────────────────────────────────
// Repurposed PredictiveEngine from codec.js.
//
// Instead of predicting next utterance tag → predicts next winning transport.
//
// Feeds: (adapter name, outcome: 'ok'|'timeout'|'error') sequences.
// Markov-1 transition table: `prev_outcome:adapter → next_winner`.
// After 5 observations: pre-selects the highest-probability adapter.
// SlopeEngine per adapter gives latency trajectory; rising slope → penalize.
//
// §1.1 — "Predicted winner" is a probability, not a guarantee.

export class TransportOracle {
  constructor() {
    this._history     = [];    // { adapter, outcome, latencyMs, ts }
    this._transitions = new Map(); // `prev→adapter:outcome` → count
    this._latency     = {};    // adapter → { stats: RollingStats, slope: SlopeEngine }
    this._adapters    = new Set();
  }

  /**
   * Record a transport attempt outcome.
   * @param {string} adapter   — 'http' | 'ble' | 'cellular'
   * @param {string} outcome   — 'ok' | 'timeout' | 'error'
   * @param {number} latencyMs
   */
  record(adapter, outcome, latencyMs) {
    this._adapters.add(adapter);
    if (!this._latency[adapter]) {
      this._latency[adapter] = {
        stats: new RollingStats(ROLLING_WINDOW),
        slope: new SlopeEngine(SLOPE_WINDOW),
      };
    }
    this._latency[adapter].stats.push(latencyMs);
    this._latency[adapter].slope.feed(latencyMs);

    const entry = { adapter, outcome, latencyMs, ts: Date.now() };
    this._history.push(entry);

    // Update transition table
    if (this._history.length >= 2) {
      const prev = this._history[this._history.length - 2];
      const key  = `${prev.adapter}:${prev.outcome}→${adapter}:${outcome}`;
      this._transitions.set(key, (this._transitions.get(key) ?? 0) + 1);
    }
  }

  /**
   * Predict the best adapter for the next request.
   * Returns { adapter, confidence, rationale }
   */
  predict() {
    if (this._history.length < 5) return null;

    const prev = this._history[this._history.length - 1];
    const prefix = `${prev.adapter}:${prev.outcome}→`;

    // Collect candidate adapters with Markov score
    const scores = {};
    let total = 0;
    for (const [k, count] of this._transitions) {
      if (!k.startsWith(prefix)) continue;
      const [adapterOutcome] = k.slice(prefix.length).split('→');
      const [adapter, outcome] = adapterOutcome.split(':');
      if (outcome !== 'ok') continue; // only care about winning outcomes
      scores[adapter] = (scores[adapter] ?? 0) + count;
      total += count;
    }

    if (!total) {
      // Fallback: lowest mean latency adapter
      return this._lowestLatencyAdapter();
    }

    // Penalize adapters with rising latency slope
    for (const adapter of Object.keys(scores)) {
      const eng = this._latency[adapter];
      if (!eng) continue;
      const slopeResult = eng.slope.feed(eng.stats.last);
      if (slopeResult.direction === 'rising') {
        scores[adapter] *= (1 - slopeResult.r2 * 0.5); // up to 50% penalty
      }
    }

    const sorted = Object.entries(scores).sort(([,a],[,b]) => b - a);
    const [best, bestScore] = sorted[0];

    return {
      adapter:    best,
      confidence: r4(bestScore / total),
      rationale:  `Markov(${this._history.length}), slope=${this._latency[best]?.slope._prevDir}`,
      alternatives: sorted.slice(1).map(([a, s]) => ({ adapter: a, p: r4(s/total) })),
    };
  }

  _lowestLatencyAdapter() {
    let best = null, bestMs = Infinity;
    for (const [adapter, eng] of Object.entries(this._latency)) {
      if (eng.stats.mean < bestMs) { bestMs = eng.stats.mean; best = adapter; }
    }
    return best ? { adapter: best, confidence: 0.5, rationale: 'lowest_mean_latency' } : null;
  }

  adapterStats() {
    const result = {};
    for (const adapter of this._adapters) {
      const eng = this._latency[adapter];
      if (!eng) continue;
      result[adapter] = {
        meanLatencyMs: r4(eng.stats.mean),
        sigmaMs:       r4(eng.stats.sigma),
        trend:         eng.slope._prevDir,
        samples:       eng.stats.len,
      };
    }
    return result;
  }

  reset() {
    this._history = [];
    this._transitions.clear();
    this._latency  = {};
    this._adapters.clear();
  }
}

// ── SpeculativeLookup ─────────────────────────────────────────────────────────
// Repurposed AssociationEngine from codec.js.
//
// Instead of utterance topic overlap → UUID adjacency from DHT responses.
// When a FIND_NODE response comes back, we record which UUIDs were seen
// "near" which other UUIDs. Jaccard overlap on peer lists = proximity score.
//
// Next lookup: if target UUID has a proximity score > 0.6 with a known peer,
// skip the full FIND_NODE walk and send directly to that peer.
//
// ConfidencePropagator sets early-exit threshold: stop when joint() > 0.85.
//
// §1.1 — "Predicted direct peer" is a routing heuristic, not a guarantee.

export class SpeculativeLookup {
  constructor() {
    this._nodes    = [];  // { uuid, neighbors: Set<uuid>, ts }
    this._edges    = [];  // { a, b, score }
    this._conf     = new ConfidencePropagator(2000); // 2s window for lookup corroboration
    this._ngrams   = new Map();  // not used for text; re-used for UUID sequence patterns
  }

  /**
   * Record a DHT response.
   * @param {string}   forUuid    — the UUID that was looked up
   * @param {string[]} neighbors  — UUIDs returned in the FIND_NODE response
   */
  record(forUuid, neighbors) {
    const neighborSet = new Set(neighbors);
    const node = { uuid: forUuid, neighbors: neighborSet, ts: Date.now() };
    const newEdges = [];

    for (const existing of this._nodes) {
      const score = this._jaccard(neighborSet, existing.neighbors);
      if (score > 0.2) {
        newEdges.push({ a: forUuid, b: existing.uuid, score: r4(score) });
      }
    }

    this._nodes.push(node);
    this._edges.push(...newEdges);
    if (this._nodes.length > 200) this._nodes.shift();
    if (this._edges.length > 500) this._edges = this._edges.slice(-500);

    return newEdges;
  }

  /**
   * Try to resolve a target UUID speculatively.
   * @param {string} targetUuid
   * @returns {object|null} { directPeer, confidence, skip } or null
   */
  speculate(targetUuid) {
    // Check if we've seen the target directly
    const direct = this._nodes.find(n => n.uuid === targetUuid);
    if (direct) {
      this._conf.observe(`direct:${targetUuid}`, 1.0);
      return { directPeer: targetUuid, confidence: 1.0, skip: true, source: 'known' };
    }

    // Find the existing peer whose neighbor list overlaps most with the target's region
    // (approximate: find peers that appeared alongside the target in responses)
    const edgesForTarget = this._edges.filter(e => e.a === targetUuid || e.b === targetUuid);
    if (!edgesForTarget.length) return null;

    const best = edgesForTarget.sort((a,b) => b.score - a.score)[0];
    const peer = best.a === targetUuid ? best.b : best.a;

    this._conf.observe(`speculative:${targetUuid}`, best.score);

    const confidence = this._conf.propagated(`speculative:${targetUuid}`);

    return {
      directPeer: peer,
      confidence: r4(confidence),
      score:      best.score,
      skip:       confidence > DHT_CONFIDENCE_STOP,
      source:     'speculative',
    };
  }

  /**
   * Run N parallel FIND_NODE probes and stop when confidence threshold is met.
   * This replaces the sequential ALPHA=3 hop walk.
   *
   * @param {string}   targetUuid
   * @param {Function} findNode   — async (uuid) => string[] (list of nearby UUIDs)
   * @param {number}   maxParallel
   * @returns {object} { address, hops, confidence, speculated }
   */
  async speculativeFindNode(targetUuid, findNode, maxParallel = DHT_MAX_PARALLEL) {
    const specResult = this.speculate(targetUuid);
    if (specResult?.skip) {
      return {
        address:    specResult.directPeer,
        hops:       0,
        confidence: specResult.confidence,
        speculated: true,
        source:     specResult.source,
      };
    }

    // Parallel probes with early exit
    const probes   = Array.from({ length: maxParallel }, (_, i) => i);
    let   winner   = null;
    const promises = probes.map(async (i) => {
      try {
        const neighbors = await findNode(targetUuid);
        if (!neighbors?.length) return;
        const edges = this.record(targetUuid, neighbors);
        this._conf.observe(`probe:${targetUuid}:${i}`, neighbors.includes(targetUuid) ? 1.0 : 0.4);
        if (neighbors.includes(targetUuid)) {
          winner = { address: targetUuid, hops: 1, confidence: 1.0, speculated: false, probe: i };
        }
      } catch (_) {}
    });

    // Race: resolve first winner or wait for all
    await Promise.race([
      Promise.all(promises),
      new Promise(resolve => {
        const check = setInterval(() => {
          const joint = this._conf.joint(
            probes.map(i => `probe:${targetUuid}:${i}`)
          );
          if (joint >= DHT_CONFIDENCE_STOP || winner) { clearInterval(check); resolve(); }
        }, 20);
      }),
    ]);

    const finalConf = this._conf.propagated(`probe:${targetUuid}:0`);

    return winner ?? {
      address:    null,
      hops:       maxParallel,
      confidence: r4(finalConf),
      speculated: false,
      source:     'exhausted',
    };
  }

  _jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const v of a) if (b.has(v)) inter++;
    return inter / (a.size + b.size - inter);
  }

  get edgeCount() { return this._edges.length; }
  get nodeCount() { return this._nodes.length; }

  reset() { this._nodes = []; this._edges = []; this._conf.reset(); }
}

// ── MessageBatcher ────────────────────────────────────────────────────────────
// Repurposed GPGPUAudioProcessor chunk-boundary logic from codec.js.
//
// Instead of energy-adaptive speech chunk boundaries → time-adaptive
// message coalescing windows.
//
// In the GPGPU processor, "natural boundary" = silence gap (no new frames).
// Here, "natural boundary" = message queue drains (burst is done).
// "Hard boundary" = BATCH_WINDOW_MS elapsed regardless.
//
// This replaces the pattern: for each msg → encrypt → send
// With:                      coalesce msgs → encrypt once → split on wire
//
// §1.1 — Batch size is adaptive to burst rate, not a fixed constant.
// §5.7 — Batched payload keeps the same wire format as individual frames.

export class MessageBatcher {
  constructor({ onBatch, onFlush, windowMs = BATCH_WINDOW_MS } = {}) {
    this._onBatch  = onBatch;   // called with batch of messages to encrypt+send
    this._onFlush  = onFlush;   // called when queue drains (natural boundary)
    this._windowMs = windowMs;
    this._queue    = [];
    this._timer    = null;
    this._lastPush = 0;
    this._batchN   = 0;

    // Stats
    this._burstStats   = new RollingStats(20);  // messages per batch
    this._latencyStats = new RollingStats(20);  // ms from first msg to flush
    this._batchStart   = null;
  }

  /**
   * Enqueue a message. Will be flushed within windowMs.
   * @param {object} message — { to, payload, priority? }
   */
  push(message) {
    if (!this._queue.length) {
      this._batchStart = Date.now();
      // Hard boundary timer
      this._timer = setTimeout(() => this._flush('hard'), this._windowMs);
    }
    this._queue.push({ ...message, enqueuedAt: Date.now() });
    this._lastPush = Date.now();

    // Natural boundary: queue was non-empty and new message came after a short gap
    // Signals burst is winding down — check in 5ms if nothing else arrives
    clearTimeout(this._naturalTimer);
    this._naturalTimer = setTimeout(() => {
      if (this._queue.length > 0) this._flush('natural');
    }, 5);
  }

  _flush(reason) {
    clearTimeout(this._timer);
    clearTimeout(this._naturalTimer);
    const msgs = this._queue.splice(0);
    if (!msgs.length) return;

    this._batchN++;
    const elapsed = Date.now() - (this._batchStart ?? Date.now());
    this._burstStats.push(msgs.length);
    this._latencyStats.push(elapsed);

    const batch = {
      batchId:     `MB${String(this._batchN).padStart(4, '0')}`,
      reason,
      messages:    msgs,
      count:       msgs.length,
      burstMean:   r4(this._burstStats.mean),
      latencyMs:   elapsed,
      // Adaptive window hint: if burst is large, widen next window
      nextWindowMs: this._adaptWindow(),
    };

    if (reason === 'natural') this._onFlush?.(batch);
    this._onBatch?.(batch);
  }

  _adaptWindow() {
    // If batches are consistently large (> 5 msgs), widen window slightly to
    // reduce per-encrypt overhead. If small, stay tight for latency.
    const m = this._burstStats.mean;
    if (m > 8)  return Math.min(50, this._windowMs * 1.5);
    if (m < 2)  return Math.max(5,  this._windowMs * 0.8);
    return this._windowMs;
  }

  flushNow() { this._flush('manual'); }

  get stats() {
    return {
      batchN:        this._batchN,
      burstMean:     r4(this._burstStats.mean),
      latencyMean:   r4(this._latencyStats.mean),
      queueDepth:    this._queue.length,
    };
  }

  reset() {
    clearTimeout(this._timer);
    clearTimeout(this._naturalTimer);
    this._queue = [];
    this._batchN = 0;
    this._burstStats.clear();
    this._latencyStats.clear();
  }
}

// ── BLEMTUProbe ───────────────────────────────────────────────────────────────
// Repurposed adaptive frame buffering from GPGPUAudioProcessor.
//
// In the audio processor: frame size adapts between 128-sample (speech) and
// 1024-sample (silence) based on energy level.
//
// Here: BLE MTU adapts between 20 (safe default ATT) and 247 (BLE 5 DLE)
// based on ACK timing variance.
//
//   Low variance → link is clean → probe MTU upward (+20 bytes)
//   High variance → link is noisy → step MTU down (÷ 2)
//   NACK / error  → retreat to BLE_MTU_MIN
//
// §1.1 — MTU probe is a suggestion to the BLE stack. The peripheral decides.
// §T-03 — BLE messages are always chunked; never truncated silently.

export class BLEMTUProbe {
  constructor({ onMTUChange } = {}) {
    this._onMTUChange = onMTUChange;
    this._mtu         = BLE_MTU_MIN;
    this._ackStats    = new RollingStats(10);
    this._probeN      = 0;
    this._lastProbeTs = 0;
  }

  /**
   * Record an ACK result.
   * @param {boolean} ok       — did the chunk ACK successfully?
   * @param {number}  latencyMs — time from send to ACK
   */
  recordACK(ok, latencyMs) {
    if (!ok) {
      this._retreat();
      return;
    }
    this._ackStats.push(latencyMs);

    // Probe upward every 10 successful ACKs, if variance is low
    const now = Date.now();
    if (
      this._ackStats.len >= 8 &&
      this._ackStats.sigma < BLE_MTU_PROBE_VARIANCE &&
      now - this._lastProbeTs > 2000 &&
      this._mtu < BLE_MTU_MAX
    ) {
      this._probeUp();
      this._lastProbeTs = now;
    } else if (this._ackStats.sigma > BLE_MTU_PROBE_VARIANCE * 3 && this._mtu > BLE_MTU_MIN) {
      // High variance → step down
      this._stepDown();
    }
  }

  _probeUp() {
    const prev   = this._mtu;
    this._mtu    = Math.min(BLE_MTU_MAX, this._mtu + 20);
    this._probeN++;
    if (this._mtu !== prev) this._onMTUChange?.({ mtu: this._mtu, reason: 'probe_up', probeN: this._probeN });
  }

  _stepDown() {
    const prev = this._mtu;
    this._mtu  = Math.max(BLE_MTU_MIN, Math.floor(this._mtu / 2));
    if (this._mtu !== prev) this._onMTUChange?.({ mtu: this._mtu, reason: 'step_down' });
  }

  _retreat() {
    if (this._mtu !== BLE_MTU_MIN) {
      this._mtu = BLE_MTU_MIN;
      this._ackStats.clear();
      this._onMTUChange?.({ mtu: this._mtu, reason: 'nack_retreat' });
    }
  }

  /**
   * Chunk a payload at the current MTU.
   * Wire format: [seqHi][seqLo][chunkIdx][totalChunks] + data (matches bridge-transport)
   */
  chunk(payload) {
    const HEADER = 4;
    const DATA   = this._mtu - HEADER;
    const total  = Math.ceil(payload.length / DATA);
    const chunks = [];
    const seq    = this._probeN & 0xFFFF;
    for (let i = 0; i < total; i++) {
      const data = payload.slice(i * DATA, (i + 1) * DATA);
      const buf  = Buffer.alloc(HEADER + data.length);
      buf[0] = (seq >> 8) & 0xFF;
      buf[1] = seq & 0xFF;
      buf[2] = i;
      buf[3] = total;
      data.copy(buf, HEADER);
      chunks.push(buf);
    }
    return chunks;
  }

  get mtu()      { return this._mtu; }
  get probeN()   { return this._probeN; }
  get ackSigma() { return r4(this._ackStats.sigma); }

  reset() { this._mtu = BLE_MTU_MIN; this._ackStats.clear(); this._probeN = 0; }
}

// ── AdaptivePulse ─────────────────────────────────────────────────────────────
// Repurposed TranscriptEngine from codec.js.
//
// Instead of managing Web Speech API 10s batch windows → manages heartbeat
// polling interval dynamically based on link signal.
//
// Mapping:
//   TranscriptEngine.start()         → AdaptivePulse.start(healthFn)
//   TranscriptEngine._flushBatch()   → AdaptivePulse._evaluate()
//   FrictionAnalyzer in batch        → LinkSignalProcessor on pulse result
//   TopologyEngine in batch          → StabilityEngine + OscillationEngine
//   batch onBatch callback           → onPulse callback with full link assessment
//
// Intervals:
//   PULSE_FAST_MS (150ms)   — volatile link, active monitoring
//   PULSE_DEGRADE_MS (800ms) — degraded link, still tracking closely
//   PULSE_SLOW_MS (3000ms)  — stable oscillating link, coast mode
//
// §1.1 — "Link is stable" = StabilityEngine reports 'stable' AND
//         OscillationEngine reports regular oscillation.

export class AdaptivePulse {
  constructor({ onPulse, onIntervalChange, nodeId = 'self' } = {}) {
    this._onPulse           = onPulse;
    this._onIntervalChange  = onIntervalChange;
    this._nodeId            = nodeId;

    this._latencyStats   = new RollingStats(ROLLING_WINDOW);
    this._stability      = new StabilityEngine(20);
    this._oscillation    = new OscillationEngine(40);
    this._linkSignal     = new LinkSignalProcessor();
    this._oracle         = new TransportOracle();

    this._running        = false;
    this._timer          = null;
    this._currentInterval= PULSE_FAST_MS;
    this._missedBeats    = 0;
    this._beatN          = 0;
    this._sessionTs      = null;
  }

  /**
   * Start adaptive pulse monitoring.
   * @param {Function} healthFn — async () => { ok, latencyMs, adapter?, errorCode? }
   */
  start(healthFn) {
    if (this._running) return;
    this._healthFn  = healthFn;
    this._running   = true;
    this._sessionTs = Date.now();
    this._schedule();
  }

  stop() {
    this._running = false;
    clearTimeout(this._timer);
  }

  _schedule() {
    if (!this._running) return;
    this._timer = setTimeout(async () => {
      await this._beat();
      this._schedule();
    }, this._currentInterval);
  }

  async _beat() {
    const t0 = Date.now();
    let result;
    try {
      result = await this._healthFn();
    } catch (e) {
      result = { ok: false, latencyMs: Date.now() - t0, errorCode: 'exception', error: e.message };
    }
    result.latencyMs ??= Date.now() - t0;
    this._beatN++;

    // Record with oracle
    if (result.adapter) {
      this._oracle.record(result.adapter, result.ok ? 'ok' : 'timeout', result.latencyMs);
    }

    // Analyze link signal
    const latencyM  = this._latencyStats.measure(result.latencyMs);
    const linkSig   = this._linkSignal.analyze({
      type:       'pulse',
      adapter:    result.adapter ?? 'http',
      latencyMs:  result.latencyMs,
      ok:         result.ok,
      retryN:     0,
      errorCode:  result.errorCode,
    }, latencyM);

    // Stability + oscillation on latency
    const stability   = this._stability.feed(result.latencyMs);
    const oscillation = this._oscillation.feed(result.latencyMs);

    // Missed beats
    if (!result.ok) {
      this._missedBeats++;
    } else {
      this._missedBeats = Math.max(0, this._missedBeats - 1);
    }

    // Adaptive interval selection
    const prevInterval = this._currentInterval;
    this._currentInterval = this._selectInterval(stability, oscillation, linkSig);
    if (this._currentInterval !== prevInterval) {
      this._onIntervalChange?.({ from: prevInterval, to: this._currentInterval, reason: stability.regime });
    }

    // latencyGrade (from bridge-heartbeat — kept compatible)
    const grade = latencyGrade(result.latencyMs);

    // Prediction
    const prediction = this._oracle.predict();

    this._onPulse?.({
      nodeId:       this._nodeId,
      beatN:        this._beatN,
      ts:           Date.now(),
      elapsed:      Date.now() - this._sessionTs,
      ok:           result.ok,
      latencyMs:    result.latencyMs,
      latencyGrade: grade,
      latencyStats: latencyM,
      missedBeats:  this._missedBeats,
      linkSignal:   linkSig,
      stability,
      oscillation,
      interval:     this._currentInterval,
      prediction,
      adapterStats: this._oracle.adapterStats(),
    });
  }

  _selectInterval(stability, oscillation, linkSig) {
    // Degraded: pulse fast to detect recovery
    if (this._missedBeats >= 2 || linkSig.congested) return PULSE_DEGRADE_MS;
    // Volatile: keep tight monitoring
    if (stability.regime === 'volatile') return PULSE_FAST_MS;
    // Stable + rhythmic: back off, save bandwidth
    if (stability.regime === 'stable' && oscillation.oscillating && oscillation.regularity > 0.7) {
      return PULSE_SLOW_MS;
    }
    // Default: tight
    return PULSE_FAST_MS;
  }

  get isRunning()   { return this._running; }
  get beatN()       { return this._beatN; }
  get currentMs()   { return this._currentInterval; }

  reset() {
    this.stop();
    this._latencyStats.clear();
    this._stability.reset();
    this._oscillation.reset();
    this._linkSignal.reset();
    this._oracle.reset();
    this._missedBeats = 0;
    this._beatN = 0;
    this._sessionTs = null;
    this._currentInterval = PULSE_FAST_MS;
  }
}

// ── latencyGrade ──────────────────────────────────────────────────────────────
// Kept identical to bridge-heartbeat/index.js for compatibility.
// AdaptivePulse uses this in its onPulse payload.

export function latencyGrade(ms) {
  if (ms <= 50)   return 1.0;
  if (ms <= 150)  return 0.8;
  if (ms <= 500)  return 0.5;
  if (ms <= 1500) return 0.2;
  return 0.0;
}

// ── BridgeCodecRuntime ────────────────────────────────────────────────────────
// Top-level wiring. Repurposed NexusRuntime from codec-v2.js.
//
// Wires all engines to the Bridge OS bus. One object. One event emitter.
// Every engine result is published as a bus event in Bridge OS format.
//
// Bus events emitted:
//   codec:pulse               — every heartbeat result + link assessment
//   codec:interval:change     — when adaptive interval changes
//   codec:transport:oracle    — TransportOracle prediction for upcoming send
//   codec:lookup:speculative  — SpeculativeLookup result for DHT shortcut
//   codec:ble:mtu             — BLE MTU change
//   codec:batch:ready         — MessageBatcher flushed a batch
//   codec:link:congestion     — LinkSignalProcessor fired a congestion signal
//   codec:transport:recorded  — new adapter outcome recorded in oracle
//
// Integration points for existing bridge-transport/index.js:
//   runtime.recordTransport(adapter, outcome, latencyMs)
//   runtime.speculateDHT(targetUuid, findNodeFn) → Promise<result>
//   runtime.batcher.push(message)
//   runtime.bleMtu.recordACK(ok, latencyMs)
//   runtime.startPulse(healthFn, nodeId?)
//   runtime.stopPulse()

export class BridgeCodecRuntime {
  constructor({ bus, onPulse, onBatch, onMTUChange, pulseWindowMs = BATCH_WINDOW_MS } = {}) {
    if (!bus) throw new Error('[BridgeCodecRuntime] bus required');
    this._bus = bus;

    // Core engines
    this.oracle     = new TransportOracle();
    this.lookup     = new SpeculativeLookup();
    this.batcher    = new MessageBatcher({
      windowMs: pulseWindowMs,
      onBatch:  (batch) => {
        this._emit('codec:batch:ready', batch);
        onBatch?.(batch);
      },
    });
    this.bleMtu     = new BLEMTUProbe({
      onMTUChange: (ev) => {
        this._emit('codec:ble:mtu', ev);
        onMTUChange?.(ev);
      },
    });

    this._pulse     = null;  // AdaptivePulse — created on startPulse()
    this._sessionId = null;
    this._frameIdx  = 0;
  }

  // ── Pulse control ────────────────────────────────────────────────────────────

  startPulse(healthFn, nodeId = 'self') {
    this._pulse = new AdaptivePulse({
      nodeId,
      onPulse: (p) => {
        this._frameIdx++;
        this._emit('codec:pulse', { ...p, sessionId: this._sessionId, frameIdx: this._frameIdx });
        if (p.linkSignal?.congested) {
          this._emit('codec:link:congestion', {
            signals:  p.linkSignal.signals,
            score:    p.linkSignal.score,
            nodeId,
            beatN:    p.beatN,
          });
        }
      },
      onIntervalChange: (ev) => {
        this._emit('codec:interval:change', ev);
      },
    });
    this._pulse.start(healthFn);
    return this;
  }

  stopPulse() {
    this._pulse?.stop();
    this._pulse = null;
  }

  // ── Transport oracle ─────────────────────────────────────────────────────────

  recordTransport(adapter, outcome, latencyMs) {
    this.oracle.record(adapter, outcome, latencyMs);
    this._emit('codec:transport:recorded', { adapter, outcome, latencyMs });
    const prediction = this.oracle.predict();
    if (prediction) {
      this._emit('codec:transport:oracle', prediction);
    }
    return prediction;
  }

  // ── DHT speculative lookup ───────────────────────────────────────────────────

  async speculateDHT(targetUuid, findNodeFn) {
    const result = await this.lookup.speculativeFindNode(targetUuid, findNodeFn);
    this._emit('codec:lookup:speculative', { targetUuid, ...result });
    return result;
  }

  recordDHTResponse(forUuid, neighbors) {
    const edges = this.lookup.record(forUuid, neighbors);
    return edges;
  }

  // ── Health ───────────────────────────────────────────────────────────────────

  health() {
    return {
      status:     'OK',
      uuid:       CODEC_V3_UUID,
      version:    CODEC_V3_VERSION,
      sessionId:  this._sessionId,
      frameIdx:   this._frameIdx,
      pulse: this._pulse ? {
        running:    this._pulse.isRunning,
        beatN:      this._pulse.beatN,
        intervalMs: this._pulse.currentMs,
      } : null,
      oracle:     this.oracle.adapterStats(),
      lookup:     { nodes: this.lookup.nodeCount, edges: this.lookup.edgeCount },
      batcher:    this.batcher.stats,
      bleMtu:     { mtu: this.bleMtu.mtu, ackSigma: this.bleMtu.ackSigma },
    };
  }

  // ── Session ──────────────────────────────────────────────────────────────────

  beginSession(sessionId) {
    this._sessionId = sessionId ?? `BC-${Date.now().toString(36).toUpperCase()}`;
    this._frameIdx  = 0;
    return this._sessionId;
  }

  endSession() {
    this.stopPulse();
    this._sessionId = null;
  }

  reset() {
    this.stopPulse();
    this.oracle.reset();
    this.lookup.reset();
    this.batcher.reset();
    this.bleMtu.reset();
    this._frameIdx = 0;
  }

  _emit(type, data) {
    try { this._bus.emit(type, data); } catch (_) {}
  }
}

// ── Integration helper: patch bridge-transport/index.js ──────────────────────
//
// Drop-in wrapper that upgrades an existing TransportManager with codec telemetry.
//
// Usage (in bridge-transport/index.js or boot.js):
//
//   import { patchTransportManager } from './bridge-codec-v3.js';
//   const runtime = new BridgeCodecRuntime({ bus });
//   patchTransportManager(transportManager, runtime);
//
// After patching, every send() call is automatically recorded in the oracle,
// and the oracle's prediction is available as the next call's pre-selection hint.

export function patchTransportManager(manager, runtime) {
  if (!manager || !runtime) throw new Error('[bridge-codec-v3] patchTransportManager: manager + runtime required');

  const origSend = manager.send.bind(manager);

  manager.send = async function patchedSend(peerId, message) {
    // Pre-select adapter from oracle
    const prediction = runtime.oracle.predict();
    if (prediction?.confidence > 0.7) {
      // Hint to manager: try predicted adapter first
      // (Manager still falls back per T-01 invariant)
      manager._hintAdapter = prediction.adapter;
    }

    const t0     = Date.now();
    const result = await origSend(peerId, message);
    const ms     = Date.now() - t0;
    const adapter = result?.transport ?? manager._lastAdapter ?? 'http';
    const outcome = result?.ok ? 'ok' : (result?.reason?.includes('timeout') ? 'timeout' : 'error');

    runtime.recordTransport(adapter, outcome, ms);

    return result;
  };

  // Wire BLE MTU to runtime
  if (manager._bleAdapter) {
    const origChunk = manager._bleAdapter.chunk?.bind(manager._bleAdapter);
    if (origChunk) {
      manager._bleAdapter.chunk = function(payload) {
        return runtime.bleMtu.chunk(Buffer.from(JSON.stringify(payload)));
      };
    }
  }

  return manager;
}

export default BridgeCodecRuntime;
