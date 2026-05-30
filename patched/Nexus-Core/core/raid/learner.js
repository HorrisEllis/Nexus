// ═══════════════════════════════════════════════════
// NEXUS — RAID Learner
// core/raid/learner.js
//
// Resonance pattern: TrajectoryStore + computeOscillation
// adapted for agent capability drift over time.
//
// AuthorshipSignature → AgentSignature:
//   stable axes, drift tracking, high/low variance
//
// Every agent has a signature. The signature updates
// with every observed outcome. RAID reads signatures
// at routing time — not "ChatGPT is good at code" in
// the abstract, but "ChatGPT fails truncated output
// 12% of the time above 10k tokens for this pattern."
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../../foundation/kernel');

// EMA weight — higher = faster drift detection
const EMA_ALPHA = 0.15;

// Stable signature axes (these should not vary much)
const STABLE_AXES = ['code_quality', 'schema_compliance', 'format_consistency'];

// High-variance axes (these shift based on conditions)
const VOLATILE_AXES = ['latency', 'token_count', 'truncation_rate'];

// ── AgentSignature ────────────────────────────────
// Per agent, per task type. Updated by EMA on each observation.
class AgentSignature {
  constructor(agentId) {
    this.agentId     = agentId;
    this.updatedAt   = Date.now();
    this.sampleSize  = 0;

    // Exponentially weighted stable core
    this.core = {
      successRate:    null,  // null until first observation
      avgLatency:     null,
      avgTokens:      null,
      tokenCeiling:   null,  // learned: max tokens before quality drops
    };

    // What makes this agent unique
    this.fingerprint = {
      highVarianceAxes:  [],
      lowVarianceAxes:   [],
      dominantStrength:  null,
      knownWeakness:     null,
    };

    // Drift: is this agent's capability changing?
    this.drift = {
      magnitude:   0,         // 0–1, how much is shifting
      direction:   [],        // e.g. ['latency_increasing']
      lastShiftAt: null,
      isShifting:  false,
    };

    // Failure profile — what fails and under what conditions
    this.failures = [];

    // Raw history for oscillation computation
    this._history = {
      successRates: [],
      latencies:    [],
      tokenCounts:  [],
    };

    // Variance tracking per axis
    this._variance = {};
  }

  // ── EMA update on new observation ─────────────
  update(obs) {
    this.sampleSize++;
    this.updatedAt = Date.now();

    const { success, latency, tokens, taskType, failureMode, tokenCeiling } = obs;

    // EMA update — Law IV: schema-constrained numeric axes
    this.core.successRate = this._ema(this.core.successRate, success ? 1 : 0);
    if (latency != null) this.core.avgLatency = this._ema(this.core.avgLatency, latency);
    if (tokens  != null) this.core.avgTokens  = this._ema(this.core.avgTokens, tokens);

    // Learn token ceiling from failures
    if (!success && failureMode === 'truncated_output' && tokens) {
      this.core.tokenCeiling = this.core.tokenCeiling
        ? Math.min(this.core.tokenCeiling, tokens * 0.95)
        : tokens * 0.95;
    }
    if (tokenCeiling) this.core.tokenCeiling = tokenCeiling;

    // Track raw history for oscillation detection
    this._history.successRates.push(success ? 1 : 0);
    if (latency) this._history.latencies.push(latency);
    if (tokens)  this._history.tokenCounts.push(tokens);
    // Keep last 100 observations
    Object.values(this._history).forEach(arr => { if (arr.length > 100) arr.shift(); });

    // Failure profile
    if (!success && failureMode) {
      const existing = this.failures.find(f => f.mode === failureMode);
      if (existing) {
        existing.count++;
        existing.rate = this._ema(existing.rate, 1);
        if (tokens && !existing.above_tokens) existing.above_tokens = tokens;
        if (taskType) {
          if (!existing.task_types) existing.task_types = [];
          if (!existing.task_types.includes(taskType)) existing.task_types.push(taskType);
        }
      } else {
        this.failures.push({ mode: failureMode, count: 1, rate: 0.15, above_tokens: tokens, task_types: taskType ? [taskType] : [] });
      }
      if (this.failures.length > 20) this.failures.shift();
    }

    // Compute variance per axis and detect drift
    this._computeVariance();
    this._detectDrift();
    this._updateFingerprint();
  }

  // ── EMA (exponential moving average) ──────────
  _ema(current, newVal) {
    if (current == null) return newVal;
    return current * (1 - EMA_ALPHA) + newVal * EMA_ALPHA;
  }

  // ── Variance per axis ─────────────────────────
  // Low variance = reliable axis. High variance = unstable.
  _computeVariance() {
    const axes = {
      successRate:   this._history.successRates,
      latency:       this._history.latencies,
      tokenCount:    this._history.tokenCounts,
    };
    for (const [axis, vals] of Object.entries(axes)) {
      if (vals.length < 5) continue;
      const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
      const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / vals.length;
      const cv = mean !== 0 ? Math.sqrt(variance) / Math.abs(mean) : 0; // coefficient of variation
      this._variance[axis] = cv;
    }
  }

  // ── Oscillation / drift detection (computeOscillation pattern) ──
  _detectDrift() {
    const sr = this._history.successRates;
    if (sr.length < 20) return;

    // Compare recent 10 vs previous 10
    const recent = sr.slice(-10);
    const prior  = sr.slice(-20, -10);
    const recentMean = recent.reduce((a,b) => a+b,0) / 10;
    const priorMean  = prior.reduce((a,b) => a+b,0) / 10;
    const delta      = Math.abs(recentMean - priorMean);

    const lat = this._history.latencies;
    let latDelta = 0;
    if (lat.length >= 20) {
      const rLat = lat.slice(-10).reduce((a,b)=>a+b,0)/10;
      const pLat = lat.slice(-20,-10).reduce((a,b)=>a+b,0)/10;
      latDelta = (rLat - pLat) / Math.max(pLat, 1);
    }

    const magnitude = Math.min(1, delta * 2 + Math.abs(latDelta) * 0.3);
    const wasShifting = this.drift.isShifting;
    const isShifting  = magnitude > 0.08;

    const direction = [];
    if (recentMean < priorMean - 0.05) direction.push('quality_decreasing');
    if (recentMean > priorMean + 0.05) direction.push('quality_improving');
    if (latDelta > 0.15) direction.push('latency_increasing');
    if (latDelta < -0.15) direction.push('latency_decreasing');

    this.drift = {
      magnitude,
      direction,
      lastShiftAt: isShifting && !wasShifting ? Date.now() : this.drift.lastShiftAt,
      isShifting,
    };

    if (isShifting) {
      kernel.emit('raid.drift.detected', {
        agentId: this.agentId,
        magnitude,
        direction,
        recentSuccessRate: recentMean,
        priorSuccessRate:  priorMean,
      });
    }
  }

  // ── Fingerprint: what is this agent uniquely good/bad at ──
  _updateFingerprint() {
    const highV = Object.entries(this._variance)
      .filter(([, cv]) => cv > 0.3)
      .map(([axis]) => axis);
    const lowV  = Object.entries(this._variance)
      .filter(([, cv]) => cv < 0.1)
      .map(([axis]) => axis);

    this.fingerprint.highVarianceAxes = highV;
    this.fingerprint.lowVarianceAxes  = lowV;

    // Dominant strength and weakness from failures
    const sorted = [...this.failures].sort((a,b) => b.rate - a.rate);
    if (sorted.length) this.fingerprint.knownWeakness = sorted[0].mode;
  }

  toJSON() {
    return {
      agentId:    this.agentId,
      sampleSize: this.sampleSize,
      updatedAt:  this.updatedAt,
      core:       this.core,
      fingerprint:this.fingerprint,
      drift:      this.drift,
      failures:   this.failures,
    };
  }
}

// ── Learner (TrajectoryStore pattern) ────────────
class Learner {
  constructor() {
    this._signatures = new Map();

    // Initialize known agents
    ['ollama', 'chatgpt', 'claude', 'gemini'].forEach(id => {
      this._signatures.set(id, new AgentSignature(id));
    });
  }

  // Record an agent response outcome
  record(obs) {
    const { agentId } = obs;
    if (!agentId) return;
    if (!this._signatures.has(agentId)) {
      this._signatures.set(agentId, new AgentSignature(agentId));
    }
    this._signatures.get(agentId).update(obs);
    kernel.emit('raid.learner.updated', {
      agentId,
      sampleSize: this._signatures.get(agentId).sampleSize,
    });
  }

  recordFailure(payload) {
    const { agentId, failureMode, tokens, taskType } = payload;
    if (agentId) this.record({ agentId, success: false, failureMode, tokens, taskType });
  }

  recordRateLimit(payload) {
    const { agentId } = payload;
    if (agentId) this.record({ agentId, success: false, failureMode: 'rate_limited' });
  }

  signature(agentId) {
    if (!this._signatures.has(agentId)) {
      this._signatures.set(agentId, new AgentSignature(agentId));
    }
    return this._signatures.get(agentId).toJSON();
  }

  allSignatures() {
    return Object.fromEntries(
      [...this._signatures.entries()].map(([id, sig]) => [id, sig.toJSON()])
    );
  }
}

module.exports = { Learner, AgentSignature };
