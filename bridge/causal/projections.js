'use strict';
/**
 * bridge/causal/projections.js — Causal Event Projections
 * UUID: nexus-bridge-causal-projections-v1-0000-4000-000000000001
 * Status: pre-release
 *
 * Four projections. Each is a pure function: events[] → view.
 * No side effects. No mutation. Project from the ledger on demand.
 *
 * Projections:
 *   RAID      — per-provider × per-intent stats. Replaces RAID's _health direct writes.
 *   Health    — current system map, reconstructed from events. No more "all unknown" on restart.
 *   Economy   — rolling token window per provider. Proactive rate-limit gating.
 *   Session   — complete session timeline with stateDiff applied → reconstructed state.
 *
 * §3.2  ts is wall clock. Projections order by ts for display only.
 * §2.3  All state observable — every projection can be queried at any time.
 * §1.2  Nothing silently fails — stale projections declared, not hidden.
 */

'use strict';

const { createCompoundEngine } = require('../../lib/causal/compound');

// ── Token economy windows ─────────────────────────────────────────────────────
const TOKEN_WINDOW_MS = 5 * 60 * 60 * 1000; // 5-hour rolling window
const PROVIDER_CAPS = {
  claude:  100,
  chatgpt: 80,
  gemini:  120,
};

// ── Intent cluster extraction ─────────────────────────────────────────────────
// Very lightweight intent clustering from action strings.
// 'job.dispatched' with input.intent → cluster by intent prefix.
function _extractCluster(event) {
  const intent = event.input?.intent || event.output?.intent || '';
  if (!intent) return _actionToCluster(event.action);
  // Truncate to first two words for clustering
  return intent.split(/\s+/).slice(0, 2).join(' ').toLowerCase();
}

function _actionToCluster(action) {
  if (!action) return 'unknown';
  const parts = action.split('.');
  return parts.slice(0, 2).join('.');
}

// ── RAID Projection ───────────────────────────────────────────────────────────

/**
 * raidProjection — per-provider × per-intent-cluster success/latency stats.
 * Input events: job.dispatched, job.completed, provider.failed, provider.disconnected
 *
 * @param {CausalEvent[]} events
 * @returns {object} RAID projection view
 */
function raidProjection(events) {
  const providers = {};
  const dispatches = new Map(); // uuid → dispatch event (to match completions)

  // Index dispatches for latency calculation
  for (const ev of events) {
    if (ev.action === 'job.dispatched') {
      const provider = ev.output?.provider || ev.input?.provider || 'unknown';
      dispatches.set(ev.uuid, { provider, ts: ev.ts, cluster: _extractCluster(ev) });
    }
  }

  for (const ev of events) {
    const provider = ev.output?.provider || ev.input?.provider ||
                     ev.stateDiff?.provider || 'unknown';

    if (!providers[provider]) {
      providers[provider] = {
        successRate:    null,
        avgLatencyMs:   null,
        p95LatencyMs:   null,
        failureModes:   {},
        intentClusters: {},
        windowPressure: 0,
        trend:          'stable',
        calls:          0,
        successes:      0,
        latencies:      [],
      };
    }

    const p = providers[provider];

    if (ev.action === 'job.completed') {
      p.calls++;
      p.successes++;
      // Compute latency from matched dispatch
      const causedBy = ev.causalEdges?.find(e => e.type === 'triggered_by')?.eventId;
      const dispatch  = causedBy ? dispatches.get(causedBy) : null;
      if (dispatch) {
        p.latencies.push(ev.ts - dispatch.ts);
        // Intent cluster tracking
        const cluster = dispatch.cluster;
        if (!p.intentClusters[cluster]) p.intentClusters[cluster] = { calls: 0, successes: 0 };
        p.intentClusters[cluster].calls++;
        p.intentClusters[cluster].successes++;
      }
    }

    if (ev.action === 'provider.failed' || ev.action === 'job.failed') {
      p.calls++;
      const mode = ev.output?.reason || ev.output?.error || 'unknown';
      p.failureModes[mode] = (p.failureModes[mode] || 0) + 1;
      // Mark intent cluster failure
      const causedBy = ev.causalEdges?.find(e => e.type === 'triggered_by')?.eventId;
      const dispatch  = causedBy ? dispatches.get(causedBy) : null;
      if (dispatch) {
        const cluster = dispatch.cluster;
        if (!p.intentClusters[cluster]) p.intentClusters[cluster] = { calls: 0, successes: 0 };
        p.intentClusters[cluster].calls++;
      }
    }

    if (ev.action === 'provider.disconnected') {
      p.failureModes['disconnected'] = (p.failureModes['disconnected'] || 0) + 1;
    }
  }

  // Derive rate stats from raw counts
  const now = Date.now();
  for (const [providerName, p] of Object.entries(providers)) {
    p.successRate  = p.calls > 0 ? +(p.successes / p.calls).toFixed(3) : null;

    if (p.latencies.length > 0) {
      const sorted = [...p.latencies].sort((a, b) => a - b);
      p.avgLatencyMs = Math.round(p.latencies.reduce((a, b) => a + b, 0) / p.latencies.length);
      p.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1];
    }

    // Window pressure — calls in rolling 5hr window / cap
    const windowEvents = events.filter(ev =>
      (ev.output?.provider === providerName || ev.input?.provider === providerName) &&
      (ev.action === 'job.dispatched') &&
      ev.ts >= now - TOKEN_WINDOW_MS
    );
    const cap = PROVIDER_CAPS[providerName] || 100;
    p.windowPressure = +(windowEvents.length / cap).toFixed(3);

    // Trend — compare first half success rate to second half
    const halfIdx = Math.floor(p.latencies.length / 2);
    if (halfIdx >= 3) {
      const firstHalf  = p.latencies.slice(0, halfIdx);
      const secondHalf = p.latencies.slice(halfIdx);
      const firstAvg   = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg  = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      if (secondAvg > firstAvg * 1.3)      p.trend = 'degrading';
      else if (secondAvg < firstAvg * 0.8) p.trend = 'recovering';
      else                                  p.trend = 'stable';
    }

    // Derive intent cluster rates
    for (const [cluster, stats] of Object.entries(p.intentClusters)) {
      stats.successRate = stats.calls > 0 ? +(stats.successes / stats.calls).toFixed(3) : null;
    }

    // Clean internals before returning
    delete p.latencies;
    delete p.calls;
    delete p.successes;
  }

  return {
    providers,
    updatedAt:  now,
    eventCount: events.length,
    stale:      false,
  };
}

// ── Health Projection ─────────────────────────────────────────────────────────

/**
 * healthProjection — current system map, reconstructed from events.
 * Input events: *.booted, *.failed, *.offline, heartbeat.*, system.register, health.probe.returned
 *
 * @param {CausalEvent[]} events
 * @returns {object} Health projection view
 */
function healthProjection(events) {
  const systems  = {};
  const bySystem = new Map(); // systemName → events[]

  for (const ev of events) {
    const sys = ev.source;
    if (!sys || sys === 'bridge') continue;
    if (!bySystem.has(sys)) bySystem.set(sys, []);
    bySystem.get(sys).push(ev);
  }

  for (const [sysName, evts] of bySystem) {
    const sorted = evts.sort((a, b) => a.ts - b.ts);
    let status   = 'unknown';
    let lastSeen  = null;
    let latencies = [];
    let uptimePct  = null;

    let bootCount   = 0;
    let offlineCount = 0;

    for (const ev of sorted) {
      lastSeen = ev.ts;

      if (ev.action?.endsWith('.booted') || ev.action === 'system.booted' ||
          ev.action?.includes('boot.complete')) {
        status = 'online';
        bootCount++;
      }
      if (ev.action?.endsWith('.offline') || ev.action?.includes('system.died') ||
          ev.action?.includes('provider.disconnected')) {
        status = 'offline';
        offlineCount++;
      }
      if (ev.action === 'health.probe.returned' && ev.output?.latencyMs) {
        latencies.push(ev.output.latencyMs);
        status = ev.output?.ok ? 'online' : 'degraded';
      }
      if (ev.action?.includes('heartbeat')) {
        status = 'online';
      }
    }

    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    // Uptime estimate: online boots / total transitions
    const transitions = bootCount + offlineCount;
    uptimePct = transitions > 0
      ? +((bootCount / transitions) * 100).toFixed(1)
      : (status === 'online' ? 100 : null);

    systems[sysName] = {
      status,
      uptime:    uptimePct,
      lastSeen,
      latencyMs: avgLatency,
    };
  }

  return {
    systems,
    updatedAt: Date.now(),
    eventCount: events.length,
    stale:     false,
  };
}

// ── Economy Projection ────────────────────────────────────────────────────────

/**
 * economyProjection — rolling token window per provider.
 * Input events: job.dispatched, job.completed with provider tags
 *
 * @param {CausalEvent[]} events
 * @returns {object} Economy projection view
 */
function economyProjection(events) {
  const now     = Date.now();
  const window  = TOKEN_WINDOW_MS;
  const economy = {};

  for (const ev of events) {
    if (ev.action !== 'job.dispatched') continue;
    const provider = ev.output?.provider || ev.input?.provider || 'unknown';
    if (!economy[provider]) {
      economy[provider] = {
        callsInWindow:    0,
        windowCapacity:   PROVIDER_CAPS[provider] || 100,
        pressure:         0,
        estimatedCostUSD: 0,
        windowResetAt:    now + window,
        oldest:           Infinity,
      };
    }
    if (ev.ts >= now - window) {
      economy[provider].callsInWindow++;
      if (ev.ts < economy[provider].oldest) economy[provider].oldest = ev.ts;
      // Rough cost estimate: ~$0.02 per call average
      economy[provider].estimatedCostUSD += 0.02;
    }
  }

  for (const [, p] of Object.entries(economy)) {
    p.pressure = +(p.callsInWindow / p.windowCapacity).toFixed(3);
    p.estimatedCostUSD = +p.estimatedCostUSD.toFixed(4);
    if (p.oldest !== Infinity) {
      p.windowResetAt = p.oldest + window;
    }
    delete p.oldest;
  }

  return {
    providers: economy,
    updatedAt:  now,
    eventCount: events.length,
    stale:      false,
  };
}

// ── Session Projection ────────────────────────────────────────────────────────

/**
 * sessionProjection — complete timeline for a session, stateDiff applied.
 * @param {string}        sessionId
 * @param {CausalEvent[]} events     — pre-filtered to this session
 * @param {object}        [graph]    — CausalSpineGraph for gap detection
 * @returns {object} Session projection
 */
function sessionProjection(sessionId, events, graph = null) {
  const sorted             = [...events].sort((a, b) => a.ts - b.ts);
  const reconstructedState = {};
  const artifacts          = [];

  for (const ev of sorted) {
    if (ev.stateDiff && typeof ev.stateDiff === 'object') {
      for (const [k, v] of Object.entries(ev.stateDiff)) {
        if (typeof v === 'number' && typeof reconstructedState[k] === 'number') {
          reconstructedState[k] += v;
        } else {
          reconstructedState[k] = v;
        }
      }
    }
    if (ev.action?.includes('artifact')) artifacts.push(ev);
  }

  const gaps = graph ? graph.missingLinks(sessionId, sorted) : [];
  const duration = sorted.length >= 2
    ? sorted[sorted.length - 1].ts - sorted[0].ts
    : 0;

  return {
    sessionId,
    timeline: sorted,
    reconstructedState,
    artifacts,
    gaps,
    duration,
    systemsInvolved: [...new Set(sorted.map(e => e.source).filter(Boolean))],
    eventCount:      sorted.length,
    stale:           false,
  };
}

// ── Forensics mode ────────────────────────────────────────────────────────────

/**
 * sessionForensics — run CompoundEngine over a session timeline.
 * Returns RIPPLE/WAVE/TIDAL classification for every event cluster.
 *
 * @param {string}          sessionId
 * @param {CausalEvent[]}   events
 * @param {CausalGraph}     rawGraph   — lib/cfr/graph.js CausalGraph instance
 * @returns {Promise<object>} Forensics report
 */
async function sessionForensics(sessionId, events, rawGraph) {
  const engine  = createCompoundEngine({ graph: rawGraph });
  const records = [];

  // Analyze every event with sigma or failure markers as potential roots
  for (const ev of events) {
    const isFailure = ev.action?.includes('fail') || ev.action?.includes('error') ||
                      ev.action?.includes('disconnect') || ev.action?.includes('violation');
    if (!isFailure) continue;

    try {
      const result = await engine.analyze({
        uuid:    ev.uuid,
        type:    ev.action,
        ts:      ev.ts,
        source:  ev.source,
        sigma:   ev.sigma   || null,
        cfr:     ev.cfr     || null,
        delta:   ev.delta   || null,
      });
      if (result.ok && result.record) records.push(result.record);
    } catch (_) { /* skip unanalyzable events */ }
  }

  records.sort((a, b) => b.peakSigma - a.peakSigma);

  return {
    sessionId,
    eventCount: events.length,
    tidalCount: records.filter(r => r.class === 'tidal').length,
    waveCount:  records.filter(r => r.class === 'wave').length,
    records,
    ts:         Date.now(),
  };
}

// ── Projection cache ──────────────────────────────────────────────────────────

/**
 * ProjectionCache — thin wrapper that caches projections and marks them stale
 * when Bridge is unreachable. §B-7: stale projections declared, not hidden.
 */
class ProjectionCache {
  constructor() {
    this._cache = {};
    this._staleMs = 30_000; // 30s staleness threshold
  }

  set(key, value) {
    this._cache[key] = { value, ts: Date.now() };
  }

  get(key, { allowStale = false } = {}) {
    const entry = this._cache[key];
    if (!entry) return null;
    const age = Date.now() - entry.ts;
    if (age > this._staleMs && !allowStale) {
      return { ...entry.value, stale: true };
    }
    return entry.value;
  }

  markStale(key) {
    if (this._cache[key]) {
      this._cache[key].value = { ...this._cache[key].value, stale: true };
    }
  }

  markAllStale() {
    for (const key of Object.keys(this._cache)) this.markStale(key);
  }
}

module.exports = {
  raidProjection,
  healthProjection,
  economyProjection,
  sessionProjection,
  sessionForensics,
  ProjectionCache,
};
