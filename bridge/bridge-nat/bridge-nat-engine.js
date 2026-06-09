// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';

/**
 * bridge-nat-engine  v1.0.0
 * Predictive NAT traversal — pre-computed, not discovered
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PHILOSOPHY                                                            ║
 * ║                                                                        ║
 * ║  WebRTC/ICE discovers NAT state at runtime by probing — reactive.      ║
 * ║  This engine is predictive. It observes prior NAT behavior per peer,   ║
 * ║  builds a statistical model of that peer's NAT device, and produces    ║
 * ║  a ranked candidate list BEFORE any probe packet is sent.              ║
 * ║                                                                        ║
 * ║  The result: the winning path is pre-warmed before the session starts. ║
 * ║  Failed paths are pruned before ICE wastes 4-second timeout windows.   ║
 * ║                                                                        ║
 * ║  KEY INSIGHT — NAT port mapping is not random. Most consumer NAT       ║
 * ║  devices are port-sequential or maintain a consistent port delta       ║
 * ║  between internal and external ports. RollingStats on prior observed   ║
 * ║  (internal_port, external_port) pairs per peer gives a predictive      ║
 * ║  model. If confidence is high enough, we go direct without STUN.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * NAT TYPE TAXONOMY (from RFC 3489 + empirical extensions)
 * ─────────────────────────────────────────────────────────
 *   OPEN          — no NAT; public IP directly reachable
 *   FULL_CONE     — any external host can reach once any packet sent out
 *   RESTRICTED    — only hosts we've sent to can reach back (same IP)
 *   PORT_RESTRICTED — same as RESTRICTED but port must match too
 *   SYMMETRIC     — each outbound connection gets a unique external port
 *                   (delta is random or hash-based; prediction unreliable)
 *   CARRIER_GRADE — double NAT; typically TURN-only
 *   UNKNOWN       — insufficient observations to classify
 *
 * CONFIDENCE MODEL
 * ─────────────────
 *   PredictiveNATEngine.predict(peerId) returns a confidence score 0–1.
 *   Confidence derives from:
 *     • natType certainty (more observations → higher certainty)
 *     • port delta stability (low RollingStats.sigma → high confidence)
 *     • mapping lifetime reliability (did prior mappings stay alive?)
 *     • recency weight (older observations decay via EWMA)
 *
 *   confidence > CONF_GO_DIRECT (0.82) → skip STUN, punch direct
 *   confidence > CONF_TRY_STUN  (0.55) → try STUN-assisted as primary
 *   confidence < CONF_TRY_STUN         → relay-first strategy
 *
 * INTEGRATION WITH bridge-nexus-pipe
 * ────────────────────────────────────
 *   import { createNATEngine } from './bridge-nat-engine.js';
 *   const nat = createNATEngine({ bus });
 *
 *   // Record a completed connection outcome (call after every pipe close):
 *   nat.record(peerId, observation);
 *
 *   // Before opening a new pipe, get a prediction:
 *   const prediction = nat.predict(peerId);
 *   // → { natType, confidence, candidateList, shouldSkipSTUN, mappingLifetimeMs }
 *
 *   // After hole-punch attempt, record the result to update the model:
 *   nat.recordHolePunch(peerId, result);
 *
 * BUS EVENTS EMITTED
 * ───────────────────
 *   nat:observation        — new (internalPort, externalPort, ts) recorded
 *   nat:type:classified    — peer NAT type classification updated
 *   nat:prediction         — prediction produced for a peer
 *   nat:punch:result       — hole-punch attempt outcome recorded
 *   nat:model:pruned       — stale observations removed
 *
 * Author: James Brooks (Erosmancer) / Bridge OS
 */

const crypto = require('crypto');

// ── Version ───────────────────────────────────────────────────────────────────

const MODULE_VERSION = '1.0.0';
const MODULE_UUID    = 'bridge-nat-engine-v100-000000000001';

// ── NAT types ─────────────────────────────────────────────────────────────────

const NAT_TYPE = Object.freeze({
  OPEN:            'OPEN',
  FULL_CONE:       'FULL_CONE',
  RESTRICTED:      'RESTRICTED',
  PORT_RESTRICTED: 'PORT_RESTRICTED',
  SYMMETRIC:       'SYMMETRIC',
  CARRIER_GRADE:   'CARRIER_GRADE',
  UNKNOWN:         'UNKNOWN',
});

// ── Strategy constants ────────────────────────────────────────────────────────

// Confidence thresholds
const CONF_GO_DIRECT     = 0.82;  // skip STUN entirely, punch direct
const CONF_TRY_STUN      = 0.55;  // STUN-assisted as primary
const CONF_USE_RELAY     = 0.30;  // relay as primary, direct as fallback

// Model parameters
const ROLLING_WINDOW     = 24;    // observations to keep per peer per metric
const MIN_CLASSIFY_OBS   = 3;     // minimum observations before classifying
const EWMA_ALPHA         = 0.25;  // recency weight for EWMA (higher = more recent bias)
const SYMMETRIC_DELTA_CV = 0.60;  // CV of port deltas above which we call SYMMETRIC
const MAPPING_TTL_MS     = 45_000; // default assumed mapping lifetime if no data
const STALE_PEER_MS      = 7 * 24 * 60 * 60 * 1000; // 7 days — prune stale peer records
const MAX_PEERS          = 2000;  // max peers to track before LRU eviction
const PORT_DELTA_JITTER  = 3;     // deltas within ±3 of prediction are a "hit"

// Candidate priority weights
const WEIGHT_DIRECT      = 1.0;
const WEIGHT_STUN        = 0.70;
const WEIGHT_RELAY       = 0.40;

// ── Rolling stats (self-contained — no dependency on bridge-codec-v3) ─────────
// Duplicated here intentionally: bridge-nat-engine must be standalone bootable.

class _RS {
  constructor(w = ROLLING_WINDOW) {
    this._w = w; this._b = []; this._s = 0; this._s2 = 0;
  }
  push(v) {
    if (this._b.length >= this._w) {
      const o = this._b.shift(); this._s -= o; this._s2 -= o*o;
    }
    this._b.push(v); this._s += v; this._s2 += v*v;
    return this;
  }
  get mean()  { return this._b.length ? this._s / this._b.length : 0; }
  get sigma() {
    const n = this._b.length;
    if (n < 2) return 0;
    return Math.sqrt(Math.max(0, this._s2/n - (this._s/n)**2));
  }
  get cv()    { return Math.abs(this.mean) > 1e-3 ? this.sigma / Math.abs(this.mean) : this.sigma; }
  get len()   { return this._b.length; }
  get last()  { return this._b[this._b.length - 1] ?? 0; }
  get all()   { return [...this._b]; }
  clear()     { this._b = []; this._s = 0; this._s2 = 0; }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function r4(v)  { return Math.round((v ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// EWMA on an array of (value, ts) pairs — older values decay.
function ewmaValues(pairs, alpha = EWMA_ALPHA, now = Date.now()) {
  if (!pairs.length) return 0;
  // Decay factor per millisecond: alpha^(age_ms / 1000)
  let wSum = 0, wTot = 0;
  for (const { v, ts } of pairs) {
    const ageSec = Math.max(0, (now - ts) / 1000);
    const w      = Math.pow(1 - alpha, ageSec);
    wSum += v * w;
    wTot += w;
  }
  return wTot > 0 ? wSum / wTot : 0;
}

// ── Per-peer NAT model ────────────────────────────────────────────────────────

/**
 * Holds all statistical state for a single peer's observed NAT behavior.
 * Everything here is derived from observations — no configuration.
 */
class PeerNATModel {
  constructor(peerId) {
    this.peerId            = peerId;

    // Port delta observations: externalPort - internalPort per connection
    this._portDeltas       = new _RS(ROLLING_WINDOW);

    // Mapping lifetime observations (ms until mapping expired/failed)
    this._lifetimes        = new _RS(ROLLING_WINDOW);

    // Round-trip latency on direct vs relay paths
    this._directLatency    = new _RS(ROLLING_WINDOW);
    this._relayLatency     = new _RS(ROLLING_WINDOW);

    // Hole-punch success/fail pairs: { success: bool, natType: string, ts: number }
    this._punchHistory     = [];

    // Raw observations: { internalPort, externalPort, externalIp, ts, sourceIp }
    this._observations     = [];

    // Classified state
    this.natType           = NAT_TYPE.UNKNOWN;
    this.natCertainty      = 0;   // 0–1: how confident in the classification
    this.lastSeen          = 0;
    this.observationCount  = 0;
    this.punchSuccessRate  = 0;
    this.lastExternalIp    = null;
    this.ipConsistent      = true; // false if external IP changed across observations
  }

  // Record a new (internalPort, externalPort) observation from a STUN response
  // or a completed peer exchange.
  addObservation({ internalPort, externalPort, externalIp, ts = Date.now(), sourceIp = null }) {
    // Track external IP consistency (IP change → likely CG-NAT or mobile)
    if (this.lastExternalIp && this.lastExternalIp !== externalIp) {
      this.ipConsistent = false;
    }
    this.lastExternalIp  = externalIp;
    this.lastSeen        = ts;
    this.observationCount++;

    // Compute port delta
    const delta = externalPort - internalPort;
    this._portDeltas.push(delta);
    this._observations.push({ internalPort, externalPort, externalIp, delta, ts, sourceIp });

    // Keep observation list bounded
    if (this._observations.length > ROLLING_WINDOW * 2) {
      this._observations = this._observations.slice(-ROLLING_WINDOW);
    }

    this._reclassify();
    return this;
  }

  // Record the outcome of a mapping (how long it lived before failing)
  addMappingLifetime(ms) {
    if (ms > 0) this._lifetimes.push(ms);
    return this;
  }

  // Record a hole-punch attempt result
  addPunchResult({ success, natType, latencyMs, ts = Date.now() }) {
    this._punchHistory.push({ success, natType, latencyMs, ts });
    if (this._punchHistory.length > 40) this._punchHistory.shift();
    if (latencyMs) {
      if (success) this._directLatency.push(latencyMs);
      else         this._relayLatency.push(latencyMs);
    }
    // Update punch success rate (EWMA-weighted)
    const recent = this._punchHistory.slice(-16).map(p => ({ v: p.success ? 1 : 0, ts: p.ts }));
    this.punchSuccessRate = r4(ewmaValues(recent));
    return this;
  }

  // Reclassify NAT type from current observations
  _reclassify() {
    const n = this._portDeltas.len;
    if (n < MIN_CLASSIFY_OBS) {
      this.natType      = NAT_TYPE.UNKNOWN;
      this.natCertainty = r4(n / MIN_CLASSIFY_OBS * 0.5);
      return;
    }

    // IP inconsistency → carrier-grade NAT (double NAT)
    if (!this.ipConsistent && n >= 4) {
      this.natType      = NAT_TYPE.CARRIER_GRADE;
      this.natCertainty = r4(clamp(0.6 + (n - 4) * 0.04, 0.6, 0.95));
      return;
    }

    // High CV on port delta → SYMMETRIC NAT (random external port assignment)
    const cv = this._portDeltas.cv;
    if (cv > SYMMETRIC_DELTA_CV && n >= MIN_CLASSIFY_OBS) {
      this.natType      = NAT_TYPE.SYMMETRIC;
      this.natCertainty = r4(clamp(0.5 + (cv - SYMMETRIC_DELTA_CV) * 1.2, 0.5, 0.95));
      return;
    }

    // Delta is stable (low CV) — determine cone type from punch history
    const meanDelta = this._portDeltas.mean;

    // No NAT — delta near 0 and consistent
    if (Math.abs(meanDelta) < 2 && cv < 0.05) {
      this.natType      = NAT_TYPE.OPEN;
      this.natCertainty = r4(clamp(0.7 + n * 0.03, 0.7, 0.99));
      return;
    }

    // Full cone: high punch success rate with any source
    if (this.punchSuccessRate > 0.80 && cv < 0.30) {
      this.natType      = NAT_TYPE.FULL_CONE;
      this.natCertainty = r4(clamp(0.6 + this.punchSuccessRate * 0.35, 0.6, 0.95));
      return;
    }

    // Restricted vs port-restricted: need punch history from different ports
    // Heuristic: moderate punch success + stable delta = restricted
    if (this.punchSuccessRate > 0.45 && cv < 0.40) {
      this.natType      = NAT_TYPE.RESTRICTED;
      this.natCertainty = r4(clamp(0.5 + (1 - cv) * 0.4, 0.5, 0.88));
      return;
    }

    if (cv < 0.40) {
      this.natType      = NAT_TYPE.PORT_RESTRICTED;
      this.natCertainty = r4(clamp(0.45 + (1 - cv) * 0.35, 0.45, 0.85));
      return;
    }

    // Fallback
    this.natType      = NAT_TYPE.UNKNOWN;
    this.natCertainty = 0.2;
  }

  // Predict the next external port given a proposed internal port
  predictExternalPort(internalPort) {
    if (this._portDeltas.len < MIN_CLASSIFY_OBS) return null;
    if (this.natType === NAT_TYPE.SYMMETRIC) return null;  // unpredictable

    const predictedDelta    = this._portDeltas.mean;
    const predictedPort     = Math.round(internalPort + predictedDelta);
    const portConfidence    = r4(clamp(1 - this._portDeltas.cv, 0, 1));

    // Range: ±(sigma + PORT_DELTA_JITTER) covers expected variance
    const portRangeLow  = Math.max(1024, predictedPort - Math.ceil(this._portDeltas.sigma) - PORT_DELTA_JITTER);
    const portRangeHigh = Math.min(65535, predictedPort + Math.ceil(this._portDeltas.sigma) + PORT_DELTA_JITTER);

    return {
      predicted:    predictedPort,
      rangeLow:     portRangeLow,
      rangeHigh:    portRangeHigh,
      confidence:   portConfidence,
      deltaMean:    r4(predictedDelta),
      deltaSigma:   r4(this._portDeltas.sigma),
    };
  }

  // Predict how long a mapping will stay alive (for keep-alive scheduling)
  predictMappingLifetimeMs() {
    if (this._lifetimes.len === 0) return MAPPING_TTL_MS;
    return r4(this._lifetimes.mean);
  }

  // Compute overall connection confidence (0–1) for this peer
  computeConfidence() {
    let conf = 0;

    // Base from NAT type certainty
    conf += this.natCertainty * 0.35;

    // Port delta stability (only relevant for predictable types)
    if (this.natType !== NAT_TYPE.SYMMETRIC && this.natType !== NAT_TYPE.CARRIER_GRADE) {
      const deltaConf = clamp(1 - this._portDeltas.cv, 0, 1);
      conf += deltaConf * 0.30;
    }

    // Historical punch success
    conf += this.punchSuccessRate * 0.25;

    // Recency: penalize if last seen > 24h ago
    const ageSec = (Date.now() - this.lastSeen) / 1000;
    const recency = clamp(1 - ageSec / (24 * 3600), 0, 1);
    conf += recency * 0.10;

    return r4(clamp(conf, 0, 1));
  }

  summary() {
    return {
      peerId:            this.peerId,
      natType:           this.natType,
      natCertainty:      this.natCertainty,
      observationCount:  this.observationCount,
      portDeltaMean:     r4(this._portDeltas.mean),
      portDeltaSigma:    r4(this._portDeltas.sigma),
      portDeltaCV:       r4(this._portDeltas.cv),
      mappingLifetimeMs: this.predictMappingLifetimeMs(),
      punchSuccessRate:  this.punchSuccessRate,
      directLatencyMs:   r4(this._directLatency.mean),
      relayLatencyMs:    r4(this._relayLatency.mean),
      ipConsistent:      this.ipConsistent,
      lastExternalIp:    this.lastExternalIp,
      lastSeen:          this.lastSeen,
      confidence:        this.computeConfidence(),
    };
  }
}

// ── PredictiveNATEngine ───────────────────────────────────────────────────────

/**
 * The engine that sits above PeerNATModel and handles:
 *   • per-peer model lifecycle (create, update, prune, evict)
 *   • strategy selection (direct / STUN / relay / relay-only)
 *   • candidate list generation and scoring
 *   • bus event emission
 *   • persistence hook (optional — for cross-session memory)
 */
class PredictiveNATEngine {
  constructor({ bus, persist = null, maxPeers = MAX_PEERS } = {}) {
    if (!bus) throw new Error('[bridge-nat-engine] bus required');
    this._bus      = bus;
    this._persist  = persist;  // optional: { save(peerId, data), load(peerId) }
    this._maxPeers = maxPeers;
    this._models   = new Map(); // peerId → PeerNATModel
    this._accessTs = new Map(); // peerId → last access ts (for LRU eviction)
    this._pruneInterval = setInterval(() => this._pruneStale(), 10 * 60 * 1000);
    if (this._pruneInterval.unref) this._pruneInterval.unref();
  }

  // ── Model access ─────────────────────────────────────────────────────────

  _getOrCreate(peerId) {
    this._accessTs.set(peerId, Date.now());
    if (this._models.has(peerId)) return this._models.get(peerId);

    // Evict LRU if over capacity
    if (this._models.size >= this._maxPeers) this._evictLRU();

    // Try to load from persistence
    let model = null;
    if (this._persist) {
      try {
        const saved = this._persist.load(peerId);
        if (saved) model = this._hydrate(peerId, saved);
      } catch (_) {}
    }

    if (!model) model = new PeerNATModel(peerId);
    this._models.set(peerId, model);
    return model;
  }

  _evictLRU() {
    let oldest = Infinity, lruPeer = null;
    for (const [peerId, ts] of this._accessTs) {
      if (ts < oldest) { oldest = ts; lruPeer = peerId; }
    }
    if (lruPeer) {
      this._models.delete(lruPeer);
      this._accessTs.delete(lruPeer);
    }
  }

  // ── Record APIs (called by bridge-nexus-pipe and bridge-path-race) ─────────

  /**
   * Record a NAT observation from a STUN response or peer-exchange.
   * @param {string} peerId
   * @param {object} obs — { internalPort, externalPort, externalIp, ts?, sourceIp? }
   */
  record(peerId, obs) {
    const model = this._getOrCreate(peerId);
    model.addObservation(obs);

    this._emit('nat:observation', {
      peerId,
      delta:    obs.externalPort - obs.internalPort,
      natType:  model.natType,
      certainty: model.natCertainty,
      ts:       obs.ts ?? Date.now(),
    });

    // Emit type-change event if classification updated
    this._emit('nat:type:classified', {
      peerId,
      natType:   model.natType,
      certainty: model.natCertainty,
      observations: model.observationCount,
    });

    this._maybePersist(peerId, model);
    return model.summary();
  }

  /**
   * Record a mapping expiry (for lifetime modeling).
   * @param {string} peerId
   * @param {number} lifetimeMs — how long the mapping lived
   */
  recordMappingLifetime(peerId, lifetimeMs) {
    this._getOrCreate(peerId).addMappingLifetime(lifetimeMs);
    return this;
  }

  /**
   * Record a hole-punch attempt result.
   * @param {string} peerId
   * @param {object} result — { success, natType?, latencyMs?, ts? }
   */
  recordHolePunch(peerId, result) {
    const model = this._getOrCreate(peerId);
    model.addPunchResult(result);
    this._emit('nat:punch:result', { peerId, ...result, ts: result.ts ?? Date.now() });
    this._maybePersist(peerId, model);
    return this;
  }

  // ── Prediction API ────────────────────────────────────────────────────────

  /**
   * Predict the best connection strategy and candidate list for a peer.
   *
   * @param {string} peerId
   * @param {object} opts — { internalPort?, relayAddrs? }
   * @returns {PredictionResult}
   *
   * PredictionResult: {
   *   peerId, natType, natCertainty, confidence,
   *   strategy: 'direct' | 'stun_assisted' | 'relay_first' | 'relay_only',
   *   shouldSkipSTUN,
   *   candidates: [{ type, address, predictedPort?, score, priority }],
   *   portPrediction,
   *   mappingLifetimeMs,
   *   keepAliveIntervalMs,
   *   raceConfig,
   * }
   */
  predict(peerId, opts = {}) {
    const { internalPort = 0, relayAddrs = [] } = opts;
    const model      = this._getOrCreate(peerId);
    const confidence = model.computeConfidence();
    const natType    = model.natType;
    const summary    = model.summary();

    // Port prediction
    const portPrediction = internalPort > 0
      ? model.predictExternalPort(internalPort)
      : null;

    // Mapping lifetime → keep-alive interval (use 80% of predicted lifetime)
    const mappingMs   = model.predictMappingLifetimeMs();
    const keepAliveMs = Math.round(mappingMs * 0.80);

    // Strategy selection
    const strategy = this._selectStrategy(natType, confidence, model.punchSuccessRate);
    const shouldSkipSTUN = confidence >= CONF_GO_DIRECT &&
                           natType !== NAT_TYPE.SYMMETRIC &&
                           natType !== NAT_TYPE.CARRIER_GRADE;

    // Build candidate list
    const candidates = this._buildCandidates({
      natType, confidence, portPrediction, relayAddrs,
      directLatencyMs: summary.directLatencyMs,
      relayLatencyMs:  summary.relayLatencyMs,
    });

    // Race config: how many parallel paths and what timeouts to use
    const raceConfig = this._raceConfig(strategy, confidence, natType);

    const prediction = {
      peerId,
      natType,
      natCertainty:        summary.natCertainty,
      confidence,
      strategy,
      shouldSkipSTUN,
      candidates,
      portPrediction,
      mappingLifetimeMs:   mappingMs,
      keepAliveIntervalMs: keepAliveMs,
      raceConfig,
      model:               summary,
    };

    this._emit('nat:prediction', prediction);
    return prediction;
  }

  _selectStrategy(natType, confidence, punchSuccessRate) {
    if (natType === NAT_TYPE.CARRIER_GRADE)      return 'relay_only';
    if (natType === NAT_TYPE.SYMMETRIC) {
      // Symmetric NAT can still hole-punch with simultaneous open — but only if
      // we have good historical punch success with this specific peer.
      return punchSuccessRate > 0.60 ? 'stun_assisted' : 'relay_first';
    }
    if (confidence >= CONF_GO_DIRECT)  return 'direct';
    if (confidence >= CONF_TRY_STUN)   return 'stun_assisted';
    if (confidence >= CONF_USE_RELAY)  return 'relay_first';
    return 'relay_only';
  }

  _buildCandidates({ natType, confidence, portPrediction, relayAddrs, directLatencyMs, relayLatencyMs }) {
    const candidates = [];

    // Direct candidate
    if (natType !== NAT_TYPE.CARRIER_GRADE) {
      let directScore = confidence * WEIGHT_DIRECT;

      // Boost if we have good punch history
      if (directLatencyMs > 0 && directLatencyMs < 100) directScore = Math.min(1, directScore * 1.15);

      candidates.push({
        type:           'direct',
        score:          r4(directScore),
        confidence,
        predictedPort:  portPrediction?.predicted ?? null,
        portRange:      portPrediction
          ? [portPrediction.rangeLow, portPrediction.rangeHigh]
          : null,
        portConfidence: portPrediction?.confidence ?? 0,
        latencyMsHint:  directLatencyMs || null,
        priority:       1,
      });
    }

    // STUN-assisted candidate
    if (natType !== NAT_TYPE.CARRIER_GRADE) {
      const stunScore = r4(confidence * WEIGHT_STUN * (
        natType === NAT_TYPE.SYMMETRIC ? 0.60 : 1.0
      ));
      candidates.push({
        type:      'stun_assisted',
        score:     stunScore,
        confidence: r4(confidence * 0.75),
        latencyMsHint: directLatencyMs ? directLatencyMs + 15 : null,
        priority:  2,
      });
    }

    // Relay candidates (one per provided address)
    const relayBaseScore = r4(WEIGHT_RELAY * Math.max(0.35, 1 - confidence));
    for (const addr of relayAddrs) {
      candidates.push({
        type:         'relay',
        address:      addr,
        score:        relayBaseScore,
        confidence:   0.95,  // relay almost always works if server is up
        latencyMsHint: relayLatencyMs || null,
        priority:     3 + relayAddrs.indexOf(addr),
      });
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Re-index priority
    candidates.forEach((c, i) => { c.priority = i + 1; });

    return candidates;
  }

  _raceConfig(strategy, confidence, natType) {
    // How long to wait on each path before giving up and committing to next
    const config = {
      maxParallelPaths:     3,
      directTimeoutMs:      0,
      stunTimeoutMs:        0,
      relayTimeoutMs:       0,
      commitThreshold:      0,   // confidence required to commit early
      abandonDirectAfterMs: 0,
    };

    switch (strategy) {
      case 'direct':
        config.maxParallelPaths     = 2;
        config.directTimeoutMs      = 800;   // confident — wait less
        config.stunTimeoutMs        = 1500;
        config.relayTimeoutMs       = 3000;
        config.commitThreshold      = 0.80;
        config.abandonDirectAfterMs = 1200;
        break;

      case 'stun_assisted':
        config.maxParallelPaths     = 3;
        config.directTimeoutMs      = 1500;
        config.stunTimeoutMs        = 2500;
        config.relayTimeoutMs       = 4000;
        config.commitThreshold      = 0.70;
        config.abandonDirectAfterMs = 2000;
        break;

      case 'relay_first':
        config.maxParallelPaths     = 3;
        config.directTimeoutMs      = 3000;
        config.stunTimeoutMs        = 3000;
        config.relayTimeoutMs       = 2000;  // relay launched first
        config.commitThreshold      = 0.60;
        config.abandonDirectAfterMs = 3500;
        break;

      case 'relay_only':
        config.maxParallelPaths     = 1;
        config.directTimeoutMs      = 0;     // don't try
        config.stunTimeoutMs        = 0;
        config.relayTimeoutMs       = 4000;
        config.commitThreshold      = 0.90;
        config.abandonDirectAfterMs = 0;
        break;
    }

    // For SYMMETRIC NAT: simultaneous-open requires tighter timing
    if (natType === NAT_TYPE.SYMMETRIC) {
      config.directTimeoutMs  = Math.min(config.directTimeoutMs, 600);
      config.stunTimeoutMs    = Math.min(config.stunTimeoutMs, 1200);
    }

    return config;
  }

  // ── Stale peer pruning ────────────────────────────────────────────────────

  _pruneStale() {
    const cutoff = Date.now() - STALE_PEER_MS;
    const pruned = [];
    for (const [peerId, model] of this._models) {
      if (model.lastSeen < cutoff) {
        this._models.delete(peerId);
        this._accessTs.delete(peerId);
        pruned.push(peerId);
      }
    }
    if (pruned.length) {
      this._emit('nat:model:pruned', { count: pruned.length, ts: Date.now() });
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _maybePersist(peerId, model) {
    if (!this._persist) return;
    try { this._persist.save(peerId, this._dehydrate(model)); } catch (_) {}
  }

  _dehydrate(model) {
    return {
      peerId:           model.peerId,
      natType:          model.natType,
      natCertainty:     model.natCertainty,
      portDeltas:       model._portDeltas.all,
      lifetimes:        model._lifetimes.all,
      directLatency:    model._directLatency.all,
      relayLatency:     model._relayLatency.all,
      punchHistory:     model._punchHistory.slice(-20),
      observations:     model._observations.slice(-ROLLING_WINDOW),
      lastSeen:         model.lastSeen,
      observationCount: model.observationCount,
      punchSuccessRate: model.punchSuccessRate,
      lastExternalIp:   model.lastExternalIp,
      ipConsistent:     model.ipConsistent,
    };
  }

  _hydrate(peerId, data) {
    const model               = new PeerNATModel(peerId);
    model.natType             = data.natType ?? NAT_TYPE.UNKNOWN;
    model.natCertainty        = data.natCertainty ?? 0;
    model.lastSeen            = data.lastSeen ?? 0;
    model.observationCount    = data.observationCount ?? 0;
    model.punchSuccessRate    = data.punchSuccessRate ?? 0;
    model.lastExternalIp      = data.lastExternalIp ?? null;
    model.ipConsistent        = data.ipConsistent ?? true;
    for (const v of (data.portDeltas ?? []))   model._portDeltas.push(v);
    for (const v of (data.lifetimes ?? []))    model._lifetimes.push(v);
    for (const v of (data.directLatency ?? [])) model._directLatency.push(v);
    for (const v of (data.relayLatency ?? []))  model._relayLatency.push(v);
    model._punchHistory     = data.punchHistory ?? [];
    model._observations     = data.observations ?? [];
    return model;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  summary(peerId) {
    if (peerId) {
      const model = this._models.get(peerId);
      return model ? model.summary() : null;
    }
    const result = {};
    for (const [id, model] of this._models) {
      result[id] = model.summary();
    }
    return result;
  }

  health() {
    return {
      status:   'OK',
      uuid:     MODULE_UUID,
      version:  MODULE_VERSION,
      peers:    this._models.size,
      maxPeers: this._maxPeers,
      natTypes: this._natTypeDistribution(),
    };
  }

  _natTypeDistribution() {
    const dist = {};
    for (const model of this._models.values()) {
      dist[model.natType] = (dist[model.natType] ?? 0) + 1;
    }
    return dist;
  }

  _emit(type, data) {
    try { this._bus.emit(type, data); } catch (_) {}
  }

  destroy() {
    clearInterval(this._pruneInterval);
  }
}

// ── Factory function ──────────────────────────────────────────────────────────

function createNATEngine(opts = {}) {
  return new PredictiveNATEngine(opts);
}

// ── HTTP route handler ────────────────────────────────────────────────────────

/**
 * Attach NAT engine routes to Bridge OS HTTP router.
 *
 * GET  /nat/health
 * GET  /nat/peer/:peerId
 * GET  /nat/peers
 * POST /nat/record           — { peerId, internalPort, externalPort, externalIp }
 * POST /nat/punch            — { peerId, success, latencyMs }
 * POST /nat/predict          — { peerId, internalPort?, relayAddrs? }
 */
async function route(engine, method, urlParts, body) {
  const sub    = urlParts[1] || '';
  const sub2   = urlParts[2] || '';

  if (method === 'GET' && sub === 'health') {
    return { ok: true, ...engine.health() };
  }

  if (method === 'GET' && sub === 'peers') {
    return { ok: true, peers: engine.summary() };
  }

  if (method === 'GET' && sub === 'peer' && sub2) {
    const s = engine.summary(sub2);
    if (!s) return { ok: false, error: 'peer not found in NAT model' };
    return { ok: true, peer: s };
  }

  if (method === 'POST' && sub === 'record') {
    const { peerId, internalPort, externalPort, externalIp } = body || {};
    if (!peerId || !externalPort) return { ok: false, error: 'peerId + externalPort required' };
    const s = engine.record(peerId, { internalPort: internalPort ?? 0, externalPort, externalIp });
    return { ok: true, model: s };
  }

  if (method === 'POST' && sub === 'punch') {
    const { peerId, success, latencyMs } = body || {};
    if (!peerId) return { ok: false, error: 'peerId required' };
    engine.recordHolePunch(peerId, { success: !!success, latencyMs });
    return { ok: true };
  }

  if (method === 'POST' && sub === 'predict') {
    const { peerId, internalPort, relayAddrs } = body || {};
    if (!peerId) return { ok: false, error: 'peerId required' };
    const prediction = engine.predict(peerId, { internalPort, relayAddrs });
    return { ok: true, prediction };
  }

  return null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createNATEngine,
  PredictiveNATEngine,
  PeerNATModel,
  NAT_TYPE,
  CONF_GO_DIRECT,
  CONF_TRY_STUN,
  CONF_USE_RELAY,
  route,
  MODULE_VERSION,
  MODULE_UUID,
};
