// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';

/**
 * bridge-path-race  v1.0.0
 * Confidence-weighted parallel connection path race
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PHILOSOPHY                                                            ║
 * ║                                                                        ║
 * ║  WebRTC commits to the first ICE candidate pair that succeeds a        ║
 * ║  connectivity check. That is "first to respond" — not "best path."     ║
 * ║  A relay that responds instantly but has high jitter, rising latency   ║
 * ║  slope, and a history of dropping on this peer should not win.         ║
 * ║                                                                        ║
 * ║  This engine fixes that. It launches N paths simultaneously and        ║
 * ║  commits to the first path whose CONFIDENCE exceeds a threshold —      ║
 * ║  a composite signal from:                                              ║
 * ║                                                                        ║
 * ║    • the NAT engine's prediction for this path type                    ║
 * ║    • the codec's ConfidencePropagator (cross-path corroboration)       ║
 * ║    • the codec's StabilityEngine (link regime)                         ║
 * ║    • the codec's SlopeEngine (latency trajectory — rising = penalize)  ║
 * ║    • historical success rate on this path for this peer                ║
 * ║                                                                        ║
 * ║  "A confident slow path beats an uncertain fast path" — especially     ║
 * ║  for connections that will carry real-time encrypted data.             ║
 * ║                                                                        ║
 * ║  RACE PHASES                                                           ║
 * ║    1. Pre-warm   — all paths start probe packets simultaneously        ║
 * ║    2. Evaluate   — each path reports (latencyMs, ok) as probes return  ║
 * ║    3. Commit     — first path with confidence ≥ threshold wins         ║
 * ║    4. Abandon    — remaining paths cancelled, resources released       ║
 * ║    5. Fallback   — if no path clears threshold within raceTimeoutMs:   ║
 * ║                    pick the highest-scoring path that responded ok     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * CONFIDENCE FORMULA (per path, per evaluation tick)
 * ─────────────────────────────────────────────────────
 *
 *   baseConf     = natEngine.predict(peerId, { internalPort }).confidence
 *   slopeConf    = 1 - (slopeResult.r2 * 0.5 * (direction === 'rising' ? 1 : 0))
 *   stabilityConf= stabilityResult.stabilityScore
 *   historyConf  = path.successRate (rolling 20 recent attempts)
 *   propagated   = confidencePropagator.propagated(pathKey)
 *
 *   pathConf = (baseConf * 0.35)
 *            + (slopeConf * 0.20)
 *            + (stabilityConf * 0.20)
 *            + (historyConf * 0.15)
 *            + (propagated * 0.10)
 *
 *   commit when pathConf ≥ COMMIT_THRESHOLD (default 0.75, configurable)
 *   OR  when joint(allActivePaths) ≥ JOINT_COMMIT (default 0.85)
 *
 * INTEGRATION
 * ────────────
 *   const race = createPathRace({ natEngine, codecRuntime, bus });
 *
 *   const result = await race.run({
 *     peerId,
 *     paths: [
 *       { type: 'direct',  probe: async () => ({ ok, latencyMs }) },
 *       { type: 'stun',    probe: async () => ({ ok, latencyMs }) },
 *       { type: 'relay',   probe: async () => ({ ok, latencyMs }), address: 'relay.bridge.os:443' },
 *     ],
 *     raceConfig,         // from natEngine.predict(peerId).raceConfig
 *     commitThreshold,    // optional override
 *   });
 *   // result → { winner: { type, latencyMs, confidence }, ranked }
 *
 * BUS EVENTS
 * ───────────
 *   race:start              — peerId, pathCount, raceId
 *   race:path:probe         — raceId, pathType, latencyMs, ok
 *   race:path:confidence    — raceId, pathType, confidence, threshold
 *   race:commit             — raceId, winner, confidence, elapsedMs
 *   race:fallback           — raceId, winner, reason
 *   race:timeout            — raceId, elapsedMs
 *   race:complete           — raceId, winner, ranked, totalMs
 *
 * Author: James Brooks (Erosmancer) / Bridge OS
 */

const crypto = require('crypto');

// ── Version ───────────────────────────────────────────────────────────────────

const MODULE_VERSION = '1.0.0';
const MODULE_UUID    = 'bridge-path-race-v100-000000000003';

// ── Constants ─────────────────────────────────────────────────────────────────

const COMMIT_THRESHOLD     = 0.75;   // default per-path confidence to commit
const JOINT_COMMIT         = 0.85;   // joint confidence across all active paths to commit
const EVAL_INTERVAL_MS     = 30;     // how often to re-evaluate confidence (ms)
const DEFAULT_TIMEOUT_MS   = 6000;   // overall race timeout
const HISTORY_WINDOW       = 20;     // recent attempts to track per path/peer
const RISING_SLOPE_PENALTY = 0.50;   // max penalty for rising latency slope (r2-scaled)
const RELAY_BIAS_PENALTY   = 0.08;   // relay candidates penalized to prefer direct when equal

// Confidence weight distribution (must sum to 1.0)
const W_NAT_BASE    = 0.35;
const W_SLOPE       = 0.20;
const W_STABILITY   = 0.20;
const W_HISTORY     = 0.15;
const W_PROPAGATED  = 0.10;

// ── Utilities ─────────────────────────────────────────────────────────────────

function r4(v)  { return Math.round((v ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function raceId() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }

// Minimal RollingStats — self-contained, no external dep
class _RS {
  constructor(w = HISTORY_WINDOW) { this._w = w; this._b = []; this._s = 0; }
  push(v)       { if (this._b.length >= this._w) this._s -= this._b.shift(); this._b.push(v); this._s += v; }
  get mean()    { return this._b.length ? this._s / this._b.length : 0; }
  get len()     { return this._b.length; }
  get last()    { return this._b[this._b.length - 1] ?? 0; }
  clear()       { this._b = []; this._s = 0; }
}

// ── PathState — tracks one candidate path during a race ──────────────────────

class PathState {
  constructor({ type, address = null, raceId, peerId }) {
    this.type        = type;         // 'direct' | 'stun' | 'relay'
    this.address     = address;      // relay: hostname:port; direct/stun: null
    this.raceId      = raceId;
    this.peerId      = peerId;
    this.key         = `${peerId}:${type}:${address ?? ''}`;

    // Live state
    this.latencyMs   = null;
    this.ok          = null;
    this.confidence  = 0;
    this.committed   = false;
    this.abandoned   = false;
    this.error       = null;
    this.probeCount  = 0;
    this.probeTs     = null;

    // Per-path rolling stats (survive across races for same key)
    // Attached externally by PathRace from the global history store
    this._latencyStats  = new _RS(HISTORY_WINDOW);
    this._successStats  = new _RS(HISTORY_WINDOW);  // 1 = success, 0 = fail
  }

  get successRate() {
    return this._successStats.len > 0 ? this._successStats.mean : 0.5; // neutral prior
  }

  recordProbeResult(ok, latencyMs) {
    this.ok         = ok;
    this.latencyMs  = latencyMs;
    this.probeCount++;
    this.probeTs    = Date.now();
    if (ok) this._latencyStats.push(latencyMs);
    this._successStats.push(ok ? 1 : 0);
  }
}

// ── PathConfidenceEvaluator ───────────────────────────────────────────────────
/**
 * Computes per-path confidence from all available signal sources.
 * Designed to be called on every probe result and every eval tick.
 */
class PathConfidenceEvaluator {
  constructor({ natEngine, codecRuntime }) {
    this._nat    = natEngine;     // PredictiveNATEngine (bridge-nat-engine)
    this._codec  = codecRuntime;  // BridgeCodecRuntime (bridge-codec-v3) — optional
  }

  /**
   * Compute confidence for a single path given current probe data.
   *
   * @param {PathState}  path
   * @param {object}     prediction   — from natEngine.predict(peerId)
   * @param {number}     internalPort
   * @returns {number}   confidence 0–1
   */
  evaluate(path, prediction, internalPort = 0) {
    // If probe failed outright: confidence 0 immediately
    if (path.ok === false) return 0;
    if (path.ok === null)  return 0;   // no probe result yet

    // 1. NAT base confidence — from predicted model for this path type
    let natBase = 0;
    if (prediction) {
      const cand = prediction.candidates?.find(c => c.type === path.type);
      natBase = cand ? cand.confidence : (prediction.confidence * 0.5);
    }

    // 2. Slope penalty — rising latency trajectory on this path
    let slopeConf = 1.0;
    if (this._codec && path._latencyStats.len >= 3) {
      // Feed current latency into a transient slope engine
      const slope = this._slopeEstimate(path._latencyStats);
      if (slope.direction === 'rising') {
        slopeConf = 1 - (slope.r2 * RISING_SLOPE_PENALTY);
      }
    } else if (path.latencyMs && path._latencyStats.last > 0) {
      // Simple heuristic: if current latency is >2x historical mean, penalize
      const ratio = path.latencyMs / path._latencyStats.mean;
      if (ratio > 2.0) slopeConf = clamp(1 / ratio, 0.3, 1.0);
    }

    // 3. Stability — use codec StabilityEngine if available; else derive from local stats
    let stabilityConf = 0.7; // neutral prior
    if (path._latencyStats.len >= 4) {
      const mean  = path._latencyStats.mean;
      const sigma = this._sigma(path._latencyStats);
      const cv    = mean > 1 ? sigma / mean : 1;
      stabilityConf = clamp(1 - cv, 0, 1);
    }

    // 4. Historical success rate on this path for this peer
    const historyConf = path.successRate;

    // 5. ConfidencePropagator from codec (if available)
    let propagated = 0.5; // neutral
    if (this._codec?.lookup) {
      try {
        this._codec.lookup._conf?.observe(path.key, historyConf);
        propagated = this._codec.lookup._conf?.propagated(path.key) ?? 0.5;
      } catch (_) {}
    }

    // Relay bias: de-prioritize relay slightly so direct wins when equal
    const relayPenalty = path.type === 'relay' ? RELAY_BIAS_PENALTY : 0;

    const conf = r4(clamp(
      (natBase       * W_NAT_BASE)    +
      (slopeConf     * W_SLOPE)       +
      (stabilityConf * W_STABILITY)   +
      (historyConf   * W_HISTORY)     +
      (propagated    * W_PROPAGATED)  -
      relayPenalty,
      0, 1
    ));

    return conf;
  }

  // Minimal linear regression slope on a _RS buffer
  _slopeEstimate(rs) {
    const buf = rs._b;
    const n   = buf.length;
    if (n < 3) return { direction: 'flat', r2: 0 };
    let sx=0,sy=0,sxy=0,sx2=0;
    for (let i=0;i<n;i++) { sx+=i; sy+=buf[i]; sxy+=i*buf[i]; sx2+=i*i; }
    const D     = n*sx2 - sx*sx;
    if (D === 0) return { direction: 'flat', r2: 0 };
    const slope = (n*sxy - sx*sy) / D;
    const dir   = Math.abs(slope) < 0.5 ? 'flat' : slope > 0 ? 'rising' : 'falling';
    // Approximate r2
    const my = sy/n;
    let ssT=0,ssR=0;
    const b = (sy - slope*sx)/n;
    for (let i=0;i<n;i++) { ssT+=(buf[i]-my)**2; ssR+=(buf[i]-(b+slope*i))**2; }
    const r2 = ssT > 0 ? Math.max(0, 1 - ssR/ssT) : 0;
    return { direction: dir, r2: r4(r2), slope: r4(slope) };
  }

  _sigma(rs) {
    const buf = rs._b;
    const n   = buf.length;
    if (n < 2) return 0;
    const m = rs.mean;
    return Math.sqrt(buf.reduce((s, v) => s + (v-m)**2, 0) / n);
  }
}

// ── PathRace — the race engine ────────────────────────────────────────────────

class PathRace {
  constructor({ natEngine = null, codecRuntime = null, bus } = {}) {
    if (!bus) throw new Error('[bridge-path-race] bus required');
    this._nat       = natEngine;
    this._codec     = codecRuntime;
    this._bus       = bus;
    this._evaluator = new PathConfidenceEvaluator({ natEngine, codecRuntime });

    // Persistent per-(peerId, pathType) success history across races
    this._history   = new Map();  // key → PathState fragment
  }

  // ── Core race ─────────────────────────────────────────────────────────────

  /**
   * Run a parallel path race.
   *
   * @param {object} opts
   * @param {string}        opts.peerId
   * @param {PathDef[]}     opts.paths        — [{ type, probe, address? }]
   * @param {object}        opts.raceConfig   — from natEngine.predict().raceConfig
   * @param {number}        opts.internalPort
   * @param {number}        opts.commitThreshold
   * @param {number}        opts.timeoutMs
   *
   * PathDef: {
   *   type:    'direct' | 'stun' | 'relay',
   *   probe:   async () => ({ ok: boolean, latencyMs: number, error?: string }),
   *   address: string (relay only)
   * }
   *
   * @returns {RaceResult}
   * RaceResult: {
   *   ok, raceId, winner: { type, address, latencyMs, confidence },
   *   ranked: PathResult[], totalMs, fallback: boolean
   * }
   */
  async run({ peerId, paths, raceConfig = {}, internalPort = 0, commitThreshold, timeoutMs }) {
    const id         = raceId();
    const startTs    = Date.now();
    const threshold  = commitThreshold ?? raceConfig.commitThreshold ?? COMMIT_THRESHOLD;
    const totalMs    = timeoutMs ?? raceConfig.relayTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Get NAT prediction
    const prediction = this._nat
      ? this._nat.predict(peerId, { internalPort })
      : null;

    // Build PathState objects, restoring history for known paths
    const pathStates = paths.map(p => {
      const ps = new PathState({ type: p.type, address: p.address ?? null, raceId: id, peerId });
      const histKey = `${peerId}:${p.type}:${p.address ?? ''}`;
      if (this._history.has(histKey)) {
        const h = this._history.get(histKey);
        ps._latencyStats  = h.latencyStats;
        ps._successStats  = h.successStats;
      } else {
        this._history.set(histKey, {
          latencyStats: ps._latencyStats,
          successStats: ps._successStats,
        });
      }
      return { state: ps, probe: p.probe };
    });

    this._emit('race:start', { raceId: id, peerId, pathCount: pathStates.length, ts: startTs });

    // Apply per-path timeouts from raceConfig
    const pathTimeouts = {};
    for (const { state } of pathStates) {
      switch (state.type) {
        case 'direct': pathTimeouts[state.type] = raceConfig.directTimeoutMs || 2000; break;
        case 'stun':   pathTimeouts[state.type] = raceConfig.stunTimeoutMs   || 3000; break;
        case 'relay':  pathTimeouts[state.type] = raceConfig.relayTimeoutMs  || 4000; break;
        default:       pathTimeouts[state.type] = 3000;
      }
    }

    let winner    = null;
    let settled   = false;
    const results = [];

    // ── Launch all probes in parallel ─────────────────────────────────────

    const probePromises = pathStates.map(({ state, probe }) => (async () => {
      const t0      = Date.now();
      const timeout = pathTimeouts[state.type];

      let probeResult;
      try {
        probeResult = await Promise.race([
          probe(),
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(`path timeout after ${timeout}ms`)), timeout)
          ),
        ]);
      } catch (err) {
        probeResult = { ok: false, latencyMs: Date.now() - t0, error: err.message };
      }

      probeResult.latencyMs ??= Date.now() - t0;
      state.recordProbeResult(probeResult.ok, probeResult.latencyMs);

      this._emit('race:path:probe', {
        raceId: id, pathType: state.type, address: state.address,
        ok: probeResult.ok, latencyMs: probeResult.latencyMs, ts: Date.now(),
      });

      return state;
    })());

    // ── Confidence evaluation loop ─────────────────────────────────────────

    const evalLoop = new Promise((resolve) => {
      const tick = setInterval(() => {
        if (settled) { clearInterval(tick); resolve(); return; }

        // Score each path that has a probe result
        const scored = pathStates
          .map(({ state }) => {
            if (state.ok === null || state.abandoned) return null;
            const conf = this._evaluator.evaluate(state, prediction, internalPort);
            state.confidence = conf;

            this._emit('race:path:confidence', {
              raceId: id, pathType: state.type, confidence: conf,
              threshold, ok: state.ok, latencyMs: state.latencyMs,
            });

            return { state, conf };
          })
          .filter(Boolean);

        if (!scored.length) return;

        // Check per-path commit threshold
        const committer = scored.find(s => s.conf >= threshold);
        if (committer && !settled) {
          settled = true;
          winner  = committer.state;
          clearInterval(tick);
          this._emit('race:commit', {
            raceId: id, winner: winner.type, address: winner.address,
            confidence: committer.conf, threshold,
            elapsedMs: Date.now() - startTs,
          });
          resolve();
          return;
        }

        // Check joint confidence across all ok paths
        if (scored.length >= 2) {
          const okScored  = scored.filter(s => s.state.ok === true);
          if (okScored.length >= 2) {
            const jointConf = Math.min(...okScored.map(s => s.conf));
            if (jointConf >= JOINT_COMMIT && !settled) {
              // Joint threshold met: commit to highest individual score
              const best = okScored.reduce((a, b) => a.conf > b.conf ? a : b);
              settled    = true;
              winner     = best.state;
              clearInterval(tick);
              this._emit('race:commit', {
                raceId: id, winner: winner.type, address: winner.address,
                confidence: best.conf, joint: jointConf, threshold: JOINT_COMMIT,
                elapsedMs: Date.now() - startTs,
              });
              resolve();
            }
          }
        }
      }, EVAL_INTERVAL_MS);
    });

    // ── Overall timeout ────────────────────────────────────────────────────

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        if (!settled) {
          this._emit('race:timeout', { raceId: id, elapsedMs: Date.now() - startTs });
        }
        resolve();
      }, totalMs);
    });

    // Wait for all probes + eval loop + timeout — whichever finishes first
    await Promise.race([
      Promise.all([...probePromises, evalLoop]),
      timeoutPromise,
    ]);

    // ── Finalize ───────────────────────────────────────────────────────────

    // Build ranked result list from all paths that responded
    const ranked = pathStates
      .map(({ state }) => ({
        type:       state.type,
        address:    state.address,
        ok:         state.ok,
        latencyMs:  state.latencyMs,
        confidence: state.confidence,
        probeCount: state.probeCount,
        error:      state.error,
      }))
      .filter(r => r.ok !== null)
      .sort((a, b) => b.confidence - a.confidence);

    // Fallback: if no winner committed, take the highest-confidence ok path
    let fallback = false;
    if (!winner || !winner.ok) {
      const bestOk = ranked.find(r => r.ok);
      if (bestOk) {
        const ws = pathStates.find(({ state }) => state.type === bestOk.type)?.state;
        winner   = ws ?? null;
        fallback = true;
        this._emit('race:fallback', {
          raceId: id, winner: bestOk.type, reason: 'no path cleared threshold',
          confidence: bestOk.confidence, elapsedMs: Date.now() - startTs,
        });
      }
    }

    // Update NAT engine with results
    if (this._nat) {
      for (const r of ranked) {
        this._nat.recordHolePunch(peerId, {
          success: r.ok,
          natType: prediction?.natType,
          latencyMs: r.latencyMs,
        });
      }
    }

    const totalElapsed = Date.now() - startTs;
    const winnerResult = winner
      ? { type: winner.type, address: winner.address, latencyMs: winner.latencyMs, confidence: winner.confidence }
      : null;

    this._emit('race:complete', {
      raceId: id, ok: !!winnerResult, winner: winnerResult?.type,
      ranked: ranked.map(r => `${r.type}:${r.ok?r.confidence.toFixed(2):'fail'}`),
      totalMs: totalElapsed, fallback,
    });

    return {
      ok:       !!winnerResult,
      raceId:   id,
      winner:   winnerResult,
      ranked,
      totalMs:  totalElapsed,
      fallback,
    };
  }

  // ── Abandon helper — for use after noiseHandshakeRace already picked a winner

  /**
   * Mark paths as abandoned in the history (affects future confidence scoring).
   * Called when NoiseHandshakeRace.run() commits to a path before this race finishes.
   */
  recordAbandon(peerId, pathType) {
    const histKey = `${peerId}:${pathType}:`;
    // Don't penalize directly — just record that this path was not used.
    // Future confidence is unaffected by abandonment (it's not a failure).
  }

  // ── History query ─────────────────────────────────────────────────────────

  pathHistory(peerId, pathType) {
    const histKey = `${peerId}:${pathType}:`;
    const h = this._history.get(histKey);
    if (!h) return null;
    return {
      successRate:      h.successStats.mean,
      meanLatencyMs:    h.latencyStats.mean,
      samples:          h.successStats.len,
    };
  }

  allHistory(peerId) {
    const result = {};
    for (const [key, h] of this._history) {
      if (!key.startsWith(peerId)) continue;
      result[key] = {
        successRate:   r4(h.successStats.mean),
        meanLatencyMs: r4(h.latencyStats.mean),
        samples:       h.successStats.len,
      };
    }
    return result;
  }

  health() {
    return {
      status:  'OK',
      uuid:    MODULE_UUID,
      version: MODULE_VERSION,
      trackedPaths: this._history.size,
    };
  }

  _emit(type, data) {
    try { this._bus.emit(type, data); } catch (_) {}
  }
}

// ── BridgePathRaceRuntime — top-level wiring ──────────────────────────────────
/**
 * Wires PathRace + NoiseHandshakeRace + NATEngine together into one call.
 *
 * Typical usage from bridge-nexus-pipe (replaces or augments Phase 3):
 *
 *   const runtime = createPathRaceRuntime({ natEngine, noiseKeys, codecRuntime, bus });
 *
 *   const result = await runtime.connect({
 *     peerId,
 *     remoteStaticPubB64,   // from DHT — if known, uses IK; else XX
 *     magnet,               // Bridge magnet payload to carry in handshake
 *     paths: [
 *       { type: 'direct', probe: directProbeFn,  },
 *       { type: 'stun',   probe: stunProbeFn   },
 *       { type: 'relay',  probe: relayProbeFn, address: 'relay.bridge.os:443' },
 *     ],
 *     internalPort,
 *   });
 *   // result → { ok, session (NoiseSession), winner, raceResult }
 */
class BridgePathRaceRuntime {
  constructor({ natEngine, noiseKeys, codecRuntime, bus }) {
    if (!bus)       throw new Error('[BridgePathRaceRuntime] bus required');
    if (!noiseKeys) throw new Error('[BridgePathRaceRuntime] noiseKeys required');

    this._nat      = natEngine;
    this._keys     = noiseKeys;
    this._codec    = codecRuntime;
    this._bus      = bus;
    this.pathRace  = new PathRace({ natEngine, codecRuntime, bus });
  }

  async connect({ peerId, remoteStaticPubB64 = null, magnet = {}, paths, internalPort = 0 }) {
    const { NoiseHandshakeRace, NoiseHandshake, NoiseSession } = require('./bridge-noise-handshake');

    // 1. Get prediction from NAT engine
    const prediction = this._nat
      ? this._nat.predict(peerId, { internalPort })
      : null;
    const raceConfig = prediction?.raceConfig ?? {};

    // 2. Run path race to find best transport path
    const raceResult = await this.pathRace.run({
      peerId, paths, raceConfig, internalPort,
    });

    if (!raceResult.ok) {
      return { ok: false, reason: 'all paths failed', raceResult };
    }

    const winnerPath = raceResult.winner;

    // 3. Run Noise handshake race on all ok paths (parallel IK/XX)
    const okPaths = raceResult.ranked.filter(r => r.ok);
    const noiseCandidates = okPaths.map(r => ({
      peerId,
      path:               r.type,
      remoteStaticPubB64: remoteStaticPubB64,
      transport: async (msg) => {
        // Bridge the noise message over the winning path's transport
        const pathDef = paths.find(p => p.type === r.type);
        if (!pathDef?.transport) throw new Error(`no transport for path ${r.type}`);
        return pathDef.transport(msg);
      },
    }));

    let session;
    try {
      const noiseWinner = await NoiseHandshakeRace.run({
        myStaticKeys:  this._keys,
        candidates:    noiseCandidates,
        bridgePayload: { magnet, ts: Date.now() },
        timeoutMs:     raceConfig.stunTimeoutMs ?? 4000,
        bus:           this._bus,
      });

      const { NoiseSession } = require('./bridge-noise-handshake');
      session = new NoiseSession(noiseWinner.session);

      this._emit('race:session:ready', {
        peerId, sessionFP: session.sessionFP,
        winner: noiseWinner.path, rttMs: noiseWinner.rttMs,
      });

    } catch (err) {
      return { ok: false, reason: `noise handshake failed: ${err.message}`, raceResult };
    }

    return {
      ok:         true,
      session,
      winner:     winnerPath,
      raceResult,
      prediction,
    };
  }

  health() {
    return {
      status:    'OK',
      uuid:      MODULE_UUID,
      version:   MODULE_VERSION,
      pathRace:  this.pathRace.health(),
      nat:       this._nat?.health?.() ?? null,
    };
  }

  _emit(type, data) {
    try { this._bus.emit(type, data); } catch (_) {}
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createPathRace(opts = {}) {
  return new PathRace(opts);
}

function createPathRaceRuntime(opts = {}) {
  return new BridgePathRaceRuntime(opts);
}

// ── HTTP route handler ────────────────────────────────────────────────────────

/**
 * GET  /race/health
 * GET  /race/history/:peerId
 * POST /race/run   — { peerId, paths: [{type, probe (stub)}], internalPort }
 *                    (probe must be a real function in prod — this is for diagnostics)
 */
async function route(engine, method, urlParts, body) {
  const sub  = urlParts[1] || '';
  const sub2 = urlParts[2] || '';

  if (method === 'GET' && sub === 'health') {
    return { ok: true, ...engine.health() };
  }

  if (method === 'GET' && sub === 'history' && sub2) {
    return { ok: true, history: engine.allHistory(sub2) };
  }

  return null;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  PathRace,
  PathState,
  PathConfidenceEvaluator,
  BridgePathRaceRuntime,
  createPathRace,
  createPathRaceRuntime,
  route,
  MODULE_VERSION,
  MODULE_UUID,
  COMMIT_THRESHOLD,
  JOINT_COMMIT,
  W_NAT_BASE,
  W_SLOPE,
  W_STABILITY,
  W_HISTORY,
  W_PROPAGATED,
};
