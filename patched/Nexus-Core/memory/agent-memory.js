// ═══════════════════════════════════════════════════
// NEXUS — Agent Self-model Engine (ASE)
// memory/agent-memory.js
//
// Live behavioral fingerprint per agent.
// Updated via EMA after every agent.response.received
// and agent.*.error bus event.
//
// DESIGN OVER ALTERNATIVES:
//   Storing raw per-call numbers and recomputing stats
//   on every RAID decision would be O(n) per decision.
//   EMA keeps a single float per axis — O(1) update,
//   O(1) read. Alpha=0.15 gives ~6-call memory horizon,
//   matching the spec's hallucinationRate axis.
//
//   Signature axes match spec §8 exactly:
//     gatePassRate, hallucinationRate, constraintEscapeRate
//     tokenCeiling, avgLatencyMs, contextCeiling
//     appliedMitigations (Set — accumulated, never decayed)
//
// Persisted to JaaDB table 'agent_signatures' after
// every update (2s debounce — same pattern as BEP).
//
// ZERO EXTERNAL DEPENDENCIES.
// ═══════════════════════════════════════════════════

'use strict';

const { uid } = require('./jaa-db');

// EMA helper
const ema = (cur, val, a = 0.15) => cur == null ? val : cur * (1 - a) + val * a;

// Spec §8: known agents and their static priors
const AGENT_PRIORS = {
  ollama: {
    gatePassRate:          0.78,
    hallucinationRate:     0.08,
    constraintEscapeRate:  0.14,
    tokenCeiling:          4096,
    avgLatencyMs:          3200,
    contextCeiling:        4096,
    appliedMitigations:    ['hard_stop_enforcement', 'allowed_imports_enumerated'],
  },
  chatgpt: {
    gatePassRate:          0.82,
    hallucinationRate:     0.05,
    constraintEscapeRate:  0.10,
    tokenCeiling:          32768,
    avgLatencyMs:          4500,
    contextCeiling:        32768,
    appliedMitigations:    ['guardian_bridge'],
  },
  claude: {
    gatePassRate:          0.88,
    hallucinationRate:     0.03,
    constraintEscapeRate:  0.06,
    tokenCeiling:          200000,
    avgLatencyMs:          5200,
    contextCeiling:        200000,
    appliedMitigations:    ['guardian_bridge'],
  },
  gemini: {
    gatePassRate:          0.75,
    hallucinationRate:     0.09,
    constraintEscapeRate:  0.12,
    tokenCeiling:          32768,
    avgLatencyMs:          4100,
    contextCeiling:        32768,
    appliedMitigations:    ['guardian_bridge', 'adversarial_only'],
  },
};

class AgentSelfModel {
  constructor(agentId, priors = {}) {
    this.agentId = agentId;
    this._axes = {
      gatePassRate:          priors.gatePassRate         ?? 0.75,
      hallucinationRate:     priors.hallucinationRate    ?? 0.10,
      constraintEscapeRate:  priors.constraintEscapeRate ?? 0.12,
      tokenCeiling:          priors.tokenCeiling         ?? 4096,
      avgLatencyMs:          priors.avgLatencyMs         ?? 4000,
      contextCeiling:        priors.contextCeiling       ?? 4096,
      successRate:           priors.gatePassRate         ?? 0.75, // alias for RAID compat
    };
    this._mitigations = new Set(priors.appliedMitigations ?? []);
    this._callCount   = 0;
    this._updatedAt   = Date.now();
  }

  // ── Update axes after a gate result ──────────────
  onGatePassed(latencyMs = 0) {
    this._axes.gatePassRate         = ema(this._axes.gatePassRate, 1);
    this._axes.successRate          = this._axes.gatePassRate;
    this._axes.avgLatencyMs         = ema(this._axes.avgLatencyMs, latencyMs);
    this._callCount++;
    this._updatedAt = Date.now();
  }

  onGateFailed(failureMode = 'unknown', latencyMs = 0) {
    this._axes.gatePassRate        = ema(this._axes.gatePassRate, 0);
    this._axes.successRate         = this._axes.gatePassRate;
    this._axes.avgLatencyMs        = ema(this._axes.avgLatencyMs, latencyMs);

    if (failureMode === 'hallucinated_import') {
      this._axes.hallucinationRate = ema(this._axes.hallucinationRate, 1);
      this._mitigations.add('allowed_imports_enumerated');
    }
    if (failureMode === 'constraint_violated') {
      this._axes.constraintEscapeRate = ema(this._axes.constraintEscapeRate, 1);
      this._mitigations.add('hard_stop_enforcement');
    }
    this._callCount++;
    this._updatedAt = Date.now();
  }

  // Response received (latency + token ceiling update)
  onResponse(opts = {}) {
    const { latencyMs = 0, tokens = 0, truncated = false } = opts;
    if (latencyMs) this._axes.avgLatencyMs = ema(this._axes.avgLatencyMs, latencyMs);
    // Update tokenCeiling if this response pushed it higher than current ceiling
    if (tokens && tokens > this._axes.tokenCeiling * 0.85) {
      this._axes.tokenCeiling = Math.max(this._axes.tokenCeiling, tokens * 1.2);
    }
    if (truncated) {
      // Truncation → infer we hit the real ceiling
      this._axes.tokenCeiling = Math.min(this._axes.tokenCeiling, tokens);
    }
  }

  // Context success — update contextCeiling upward
  onContextSuccess(tokens) {
    if (tokens > this._axes.contextCeiling * 0.90) {
      this._axes.contextCeiling = Math.max(this._axes.contextCeiling, tokens);
    }
  }

  // ── RAID-compatible signature shape ──────────────
  toSignature() {
    return {
      agentId:    this.agentId,
      core: {
        successRate:          this._axes.successRate,
        gatePassRate:         this._axes.gatePassRate,
        hallucinationRate:    this._axes.hallucinationRate,
        constraintEscapeRate: this._axes.constraintEscapeRate,
        tokenCeiling:         this._axes.tokenCeiling,
        avgLatencyMs:         this._axes.avgLatencyMs,
        contextCeiling:       this._axes.contextCeiling,
      },
      appliedMitigations: [...this._mitigations],
      drift:  { magnitude: this._computeDrift() },
      callCount:   this._callCount,
      updatedAt:   this._updatedAt,
    };
  }

  // ── Drift: deviation from priors ─────────────────
  _computeDrift() {
    const p = AGENT_PRIORS[this.agentId] ?? {};
    let sum = 0, n = 0;
    const axes = ['gatePassRate', 'hallucinationRate', 'constraintEscapeRate'];
    for (const ax of axes) {
      if (p[ax] != null) {
        sum += Math.abs((this._axes[ax] - p[ax]) / (p[ax] || 1));
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  toJSON() {
    return {
      uuid:      `ase-${this.agentId}`,
      agentId:   this.agentId,
      axes:      { ...this._axes },
      mitigations: [...this._mitigations],
      callCount: this._callCount,
      updatedAt: this._updatedAt,
    };
  }
}

// ══════════════════════════════════════════════════
// AgentMemory — manages all per-agent self-models
// ══════════════════════════════════════════════════
class AgentMemory {
  constructor({ jaaDB, nexusKernel }) {
    this._jaa    = jaaDB;
    this._nk     = nexusKernel;
    this._models = new Map(); // agentId → AgentSelfModel
    this._dirty  = new Set();

    // Seed with priors
    for (const [id, priors] of Object.entries(AGENT_PRIORS)) {
      this._models.set(id, new AgentSelfModel(id, priors));
    }
  }

  // ── Wire to kernel bus ────────────────────────────
  attach() {
    this._nk.on('gate.passed', e => {
      const { agentId, latencyMs } = e.payload;
      if (agentId) this._update(agentId, m => m.onGatePassed(latencyMs ?? 0));
    });

    this._nk.on('gate.failed', e => {
      const { agentId, failureMode, latencyMs } = e.payload;
      if (agentId) this._update(agentId, m => m.onGateFailed(failureMode, latencyMs ?? 0));
    });

    this._nk.on('agent.response.received', e => {
      const { agentId, tokens, latency, truncated } = e.payload;
      if (agentId) {
        this._update(agentId, m => m.onResponse({ latencyMs: latency, tokens, truncated }));
        // Log every call to agent_calls table
        this._jaa.insert('agent_calls', {
          uuid:     uid(),
          agentId,
          tokens:   tokens ?? 0,
          latencyMs: latency ?? 0,
          success:  true,
          wall:     Date.now(),
          causedBy: e.id,
        }).catch(e => this._nk.emit('memory.agent.write.error', { op: 'signature.persist', error: e.message }));
      }
    });

    // ASE query from RAID or admin
    this._nk.on('ase.signature.request', e => {
      const { agentId } = e.payload;
      const sig = agentId ? this.signature(agentId) : this.allSignatures();
      this._nk.emit('ase.signature.response', {
        requestId: e.id,
        agentId,
        signature: sig,
      }, { causedBy: e.id });
    });

    this._nk.emit('ase.ready', {
      agents:   [...this._models.keys()],
      seeded:   true,
    });
  }

  _update(agentId, fn) {
    if (!this._models.has(agentId)) {
      this._models.set(agentId, new AgentSelfModel(agentId));
    }
    fn(this._models.get(agentId));
    this._dirty.add(agentId);
    this._scheduledFlush();
  }

  _scheduledFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(async () => {
      this._flushTimer = null;
      for (const id of [...this._dirty]) {
        const m = this._models.get(id);
        if (m) await this._jaa.insert('agent_signatures', m.toJSON()).catch(e => this._nk.emit('memory.agent.write.error', { op: 'signature.flush', agentId: m.agentId, error: e.message }));
      }
      this._dirty.clear();
    }, 2000);
  }

  signature(agentId) {
    return this._models.get(agentId)?.toSignature() ?? null;
  }

  allSignatures() {
    const out = {};
    for (const [id, m] of this._models) out[id] = m.toSignature();
    return out;
  }

  // RAID learner compat: expose same API as existing learner
  record({ agentId, success, latencyMs, failureMode }) {
    if (!agentId) return;
    if (success) this._update(agentId, m => m.onGatePassed(latencyMs ?? 0));
    else this._update(agentId, m => m.onGateFailed(failureMode ?? 'unknown', latencyMs ?? 0));
  }
}

module.exports = { AgentMemory, AgentSelfModel, AGENT_PRIORS };
