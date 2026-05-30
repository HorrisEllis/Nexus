// ═══════════════════════════════════════════════════
// NEXUS — Usage Tracker
// core/usage/index.js
//
// Per-service usage state.
// Thresholds: <70% available · 70-90% deprioritize · >90% route away
// Signals come from extension DOM observer — not polling.
// Reset-time awareness: countdown, queue awareness.
// ═══════════════════════════════════════════════════

'use strict';

const { kernel } = require('../../foundation/kernel');

// Threshold constants — spec-defined
const T = {
  WARN:     70,  // deprioritize
  CRITICAL: 90,  // route away
};

class ServiceUsage {
  constructor(agentId) {
    this.agentId     = agentId;
    this.percent     = 0;
    this.raw         = null;      // raw DOM string if available
    this.updatedAt   = null;
    this.resetAt     = null;      // when the limit resets (if known)
    this.history     = [];        // last 50 readings for trend
    this._tier       = 'available'; // available | warn | critical | exhausted
  }

  update(reading) {
    const prev = this.percent;
    this.percent   = Math.max(0, Math.min(100, reading.percent));
    this.raw       = reading.raw       || null;
    this.updatedAt = Date.now();
    if (reading.resetAt) this.resetAt = reading.resetAt;

    this.history.push({ percent: this.percent, ts: this.updatedAt });
    if (this.history.length > 50) this.history.shift();

    const prevTier = this._tier;
    this._tier = this.percent >= 100  ? 'exhausted'
               : this.percent >= T.CRITICAL ? 'critical'
               : this.percent >= T.WARN     ? 'warn'
               : 'available';

    if (this._tier !== prevTier) {
      kernel.emit(`usage.${this._tier}`, {
        agentId:  this.agentId,
        percent:  this.percent,
        tier:     this._tier,
        prevTier,
        resetAt:  this.resetAt,
      });
    }

    if (this.percent >= T.CRITICAL && prev < T.CRITICAL) {
      kernel.emit('usage.warning', {
        agentId: this.agentId,
        percent: this.percent,
        message: `${this.agentId} above ${T.CRITICAL}% — routing away`,
      });
    }
  }

  // Estimated ms until reset
  msUntilReset() {
    if (!this.resetAt) return null;
    return Math.max(0, this.resetAt - Date.now());
  }

  // Trend: is usage rising or falling?
  trend() {
    if (this.history.length < 5) return 'stable';
    const recent = this.history.slice(-5).map(h => h.percent);
    const delta  = recent[recent.length - 1] - recent[0];
    return delta > 3 ? 'rising' : delta < -3 ? 'falling' : 'stable';
  }

  toJSON() {
    return {
      agentId:     this.agentId,
      percent:     this.percent,
      tier:        this._tier,
      trend:       this.trend(),
      updatedAt:   this.updatedAt,
      resetAt:     this.resetAt,
      msUntilReset:this.msUntilReset(),
    };
  }
}

class UsageTracker {
  constructor() {
    this._services = new Map();
    ['ollama','chatgpt','claude','gemini'].forEach(id =>
      this._services.set(id, new ServiceUsage(id))
    );

    // Listen for DOM signals from extension bridge
    kernel.on('extension.usage.signal', e => {
      const { agentId, percent, raw, resetAt } = e.payload;
      this.update(agentId, { percent, raw, resetAt });
    });
  }

  update(agentId, reading) {
    if (!this._services.has(agentId)) {
      this._services.set(agentId, new ServiceUsage(agentId));
    }
    this._services.get(agentId).update(reading);
  }

  get(agentId) {
    return this._services.get(agentId)?.toJSON() || { agentId, percent: 0, tier: 'available' };
  }

  all() {
    return Object.fromEntries(
      [...this._services.entries()].map(([id, s]) => [id, s.toJSON()])
    );
  }

  // Which agents are currently available?
  available() {
    return [...this._services.entries()]
      .filter(([, s]) => s.percent < T.CRITICAL)
      .map(([id]) => id);
  }
}

const usage = new UsageTracker();
module.exports = { UsageTracker, usage, T };
