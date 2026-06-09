// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sngate/router.js  v1.0.0
 * SNR-as-DNS — traffic routing via fidelity score + intent rules.
 *
 * SNGate produces a continuous fidelity score (0–10) for every event context.
 * This module uses that score as a transport-tier selector:
 *
 *   [8–10]  TIER_0  HIGH SIGNAL  → BLE / LAN pulse cache
 *   [5–7.9] TIER_1  GOOD SIGNAL  → HTTP direct
 *   [3–4.9] TIER_2  OBSERVE      → HTTP throttled + queued (MessageBatcher)
 *   [0–2.9] TIER_3  LOW SIGNAL   → Relay only / drop non-critical
 *
 * Intent rules (stored in gate.rules) can pin an adapter regardless of band:
 *   { type:'intent', value:'mesh.handshake', action:'route:ble'   }
 *   { type:'intent', value:'data.push',      action:'route:http'  }
 *   { type:'intent', value:'agent.',         action:'route:queue' }
 *   { type:'intent', value:'heartbeat',      action:'route:ble'   }
 *
 * Composes with bridge-magnet-v2:
 *   Magnet resolves WHERE (addr).  Router decides HOW (adapter + priority).
 *
 * Composes with bridge-codec-v3 TransportOracle:
 *   Gate score seeds the oracle as a prior (TIER_0 → BLE observation),
 *   so the oracle starts predicting correctly before accumulating 5 real
 *   samples. Real outcomes still override over time.
 *
 * Integration (boot.js — see updated Phase 7d):
 *
 *   const { createSNRouter, installDefaultRules } = require('../bridge-sngate/router');
 *   const router = createSNRouter({ gate, bus: busShim, runtime: codecRuntime });
 *   installDefaultRules(gate);
 *
 * Bus events emitted:
 *   snrouter:decision  — every routing decision (adapter, tier, priority, …)
 *   snrouter:drop      — message discarded at TIER_3 (non-critical type)
 *   snrouter:tier:override — burst alert forces TIER_2 minimum for a UUID
 *
 * §1.1  "TIER_0" is a routing signal, not a trust certificate.
 * §1.2  All routing decisions published on bus as 'snrouter:decision'.
 * §5.7  Router never calls TransportManager directly — bus only.
 */

// ── Tier definitions ──────────────────────────────────────────────────────────

const TIERS = {
  TIER_0: { name: 'TIER_0', label: 'high_signal',  adapters: ['ble', 'lan'], minScore: 8,   throttleMs: 0,    dropNonCritical: false },
  TIER_1: { name: 'TIER_1', label: 'good_signal',  adapters: ['http'],       minScore: 5,   throttleMs: 0,    dropNonCritical: false },
  TIER_2: { name: 'TIER_2', label: 'observe',       adapters: ['http'],       minScore: 3,   throttleMs: 200,  dropNonCritical: false },
  TIER_3: { name: 'TIER_3', label: 'low_signal',    adapters: ['relay'],      minScore: 0,   throttleMs: 1000, dropNonCritical: true  },
};

// Never dropped at TIER_3
const CRITICAL_TYPES = new Set([
  'mesh.handshake', 'mesh.disconnect', 'heartbeat',
  'sngate:decision', 'node:dead', 'node:degraded',
]);

// Intent rule action → adapter family
const ROUTE_ACTION_MAP = {
  'route:ble':   ['ble', 'lan'],
  'route:http':  ['http'],
  'route:queue': ['http'],    // HTTP, but MessageBatcher widens the window
  'route:relay': ['relay'],
  'route:drop':  [],
};

// Synthetic latency injected into oracle as a score-band prior
const TIER_SYNTHETIC_LATENCY = { TIER_0: 20, TIER_1: 80, TIER_2: 300, TIER_3: 2000 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function r4(v)           { return Math.round((v ?? 0) * 10000) / 10000; }
function scoreToTier(s)  { return s >= 8 ? TIERS.TIER_0 : s >= 5 ? TIERS.TIER_1 : s >= 3 ? TIERS.TIER_2 : TIERS.TIER_3; }
function scoreToPriority(s) { return Math.round(Math.max(0, Math.min(100, s * 10))); }

// ── createSNRouter ────────────────────────────────────────────────────────────

function createSNRouter({ gate, bus, runtime = null, config = {} } = {}) {
  if (!gate) throw new Error('[snrouter] gate required — pass createSNGate() instance');
  if (!bus)  throw new Error('[snrouter] bus required');

  const cfg = {
    tier0Min:      config.tier0Min      ?? 8,
    tier1Min:      config.tier1Min      ?? 5,
    tier2Min:      config.tier2Min      ?? 3,
    tier2BatchMs:  config.tier2BatchMs  ?? 200,
    emitDecisions: config.emitDecisions ?? true,
    feedOracle:    config.feedOracle    ?? true,
  };

  // Apply threshold overrides
  TIERS.TIER_0.minScore = cfg.tier0Min;
  TIERS.TIER_1.minScore = cfg.tier1Min;
  TIERS.TIER_2.minScore = cfg.tier2Min;

  const _tierCounts   = { TIER_0: 0, TIER_1: 0, TIER_2: 0, TIER_3: 0 };
  const _totalRouted  = { count: 0, dropped: 0, throttled: 0 };
  const _routeHistory = [];  // last 200 decisions

  // ── resolve() — pure routing, no side effects ─────────────────────────────

  function resolve(ctx) {
    const { type = 'unknown', identity, payload, surface = 'mesh', peerId } = ctx;

    // 1. Score via SNGate
    const gateResult = gate.evaluate({ type, identity, payload, surface });
    const { score, decision: gateDecision, reason, gateId } = gateResult;

    // 2. Check for intent route-override in matched rule
    const matchedRule   = gate.rules.match({ type, identity, payload, surface });
    let pinnedAdapters  = null;
    let pinReason       = null;
    if (matchedRule?.action?.startsWith('route:')) {
      pinnedAdapters = ROUTE_ACTION_MAP[matchedRule.action] ?? null;
      pinReason      = `rule:${matchedRule.id} pin=${matchedRule.action}`;
    }

    // 3. Hard deny → TIER_3 regardless
    const hardDeny = gateDecision === 'deny';

    // 4. Select tier
    const tier     = hardDeny ? TIERS.TIER_3 : scoreToTier(score);
    const adapters = pinnedAdapters ?? tier.adapters;
    const priority = scoreToPriority(score);

    // 5. Critical-type guard at TIER_3
    const isCritical = CRITICAL_TYPES.has(type);
    const drop       = tier.dropNonCritical && !isCritical && !pinnedAdapters;

    // 6. Throttle
    const throttleMs = tier === TIERS.TIER_2 ? cfg.tier2BatchMs : tier.throttleMs;

    return {
      adapters, tier: tier.name, tierLabel: tier.label,
      priority, throttleMs, drop,
      score, gateDecision, reason, gateId,
      type, peerId, surface, pinReason, isCritical,
      ts: Date.now(),
    };
  }

  // ── route() — resolve + emit + feed oracle ────────────────────────────────

  function route(ctx) {
    const decision = resolve(ctx);

    _tierCounts[decision.tier]++;
    _totalRouted.count++;
    if (decision.drop)       _totalRouted.dropped++;
    if (decision.throttleMs) _totalRouted.throttled++;

    _routeHistory.push(decision);
    if (_routeHistory.length > 200) _routeHistory.shift();

    if (cfg.emitDecisions) {
      bus.emit('snrouter:decision', {
        adapters:     decision.adapters,
        tier:         decision.tier,
        priority:     decision.priority,
        throttleMs:   decision.throttleMs,
        drop:         decision.drop,
        score:        decision.score,
        gateDecision: decision.gateDecision,
        peerId:       decision.peerId,
        type:         decision.type,
        pinReason:    decision.pinReason,
        ts:           decision.ts,
      });
    }

    // Feed synthetic prior into TransportOracle so it has useful signal from
    // the first request rather than cold-starting at 5 observations.
    if (cfg.feedOracle && runtime?.oracle) {
      const syntheticMs = TIER_SYNTHETIC_LATENCY[decision.tier] ?? 100;
      const adapter     = decision.adapters[0] ?? 'http';
      const outcome     = decision.tier === 'TIER_3' ? 'timeout' : 'ok';
      runtime.recordTransport(adapter, outcome, syntheticMs);
    }

    return decision;
  }

  // ── Bus: passive mode ─────────────────────────────────────────────────────
  // TransportManager (patched) emits transport:send:request; router emits
  // snrouter:decision back; patchTransportManager picks it up as _hintAdapter.

  bus.on('transport:send:request', (ctx) => {
    if (!ctx?.type) return;
    route(ctx);
  });

  // SNGate burst alert → force TIER_2 minimum for that UUID
  bus.on('alert:sngate:burst', ({ uuid }) => {
    bus.emit('snrouter:tier:override', {
      uuid,
      minTier:   'TIER_2',
      reason:    'sngate:burst',
      expiresMs: 30_000,
    });
  });

  // ── patchTransportManager() ───────────────────────────────────────────────
  // Wraps manager.send() with routing decision + oracle feedback.
  // Call instead of (or alongside) patchTransportManager() from bridge-codec-v3.
  // Combines both: SNRouter decision then codec oracle refinement.

  function patchTransportManager(manager) {
    if (!manager) throw new Error('[snrouter] manager required');

    const origSend = manager.send.bind(manager);

    manager.send = async function routedSend(peerId, message, ctx = {}) {
      const decision = route({
        peerId,
        message,
        type:     ctx.type     ?? message?.type ?? 'mesh.data',
        identity: ctx.identity ?? null,
        payload:  ctx.payload  ?? { peerId },
        surface:  ctx.surface  ?? 'mesh',
      });

      if (decision.drop) {
        bus.emit('snrouter:drop', {
          peerId, type: decision.type,
          tier: decision.tier, score: decision.score,
        });
        return { ok: false, reason: 'snrouter:drop', tier: decision.tier, score: decision.score };
      }

      if (decision.adapters.length) {
        manager._hintAdapter = decision.adapters[0];
      }

      // Also apply codec oracle pre-selection on top of gate score
      if (runtime?.oracle) {
        const prediction = runtime.oracle.predict();
        if (prediction?.confidence > 0.7 && decision.tier !== 'TIER_3') {
          manager._hintAdapter = prediction.adapter;
        }
      }

      if (decision.throttleMs > 0) {
        await new Promise(r => setTimeout(r, decision.throttleMs));
      }

      const t0     = Date.now();
      const result = await origSend(peerId, message);
      const ms     = Date.now() - t0;

      // Record real outcome back into oracle (overrides the synthetic prior)
      if (runtime?.oracle) {
        const adapter = result?.transport ?? decision.adapters[0] ?? 'http';
        runtime.recordTransport(adapter, result?.ok ? 'ok' : 'timeout', ms);
      }

      return { ...result, tier: decision.tier, score: decision.score, adapters: decision.adapters };
    };

    return manager;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  function stats() {
    const total = _totalRouted.count || 1;
    return {
      total:      _totalRouted.count,
      dropped:    _totalRouted.dropped,
      throttled:  _totalRouted.throttled,
      tierCounts: { ..._tierCounts },
      tierRatios: {
        TIER_0: r4(_tierCounts.TIER_0 / total),
        TIER_1: r4(_tierCounts.TIER_1 / total),
        TIER_2: r4(_tierCounts.TIER_2 / total),
        TIER_3: r4(_tierCounts.TIER_3 / total),
      },
      // SNR: ratio of high-fidelity traffic to low-fidelity
      snr: r4((_tierCounts.TIER_0 + _tierCounts.TIER_1) /
              Math.max(1, _tierCounts.TIER_2 + _tierCounts.TIER_3)),
    };
  }

  function recentDecisions(n = 20) {
    return _routeHistory.slice(-n);
  }

  // CFR field contribution — plug into deriveFieldParams() in bridge-cfr/index.js
  function cfrFieldContribution() {
    const s = stats();
    return {
      entropy:   r4(1 - s.tierRatios.TIER_0 - s.tierRatios.TIER_1),
      structure: r4(Math.min(1, s.snr / 10)),
    };
  }

  return { resolve, route, patchTransportManager, stats, recentDecisions, cfrFieldContribution, tiers: TIERS };
}

// ── Default intent rules ──────────────────────────────────────────────────────
// Install via installDefaultRules(gate) after createSNGate() in boot.js.

const DEFAULT_ROUTING_RULES = [
  { type: 'intent', value: 'mesh.handshake', action: 'route:ble',   surface: 'mesh'  },
  { type: 'intent', value: 'data.push',      action: 'route:http',  surface: 'data'  },
  { type: 'intent', value: 'agent.',         action: 'route:queue', surface: 'agent' },
  { type: 'intent', value: 'dht.',           action: 'route:http',  surface: 'mesh'  },
  { type: 'intent', value: 'heartbeat',      action: 'route:ble',   surface: 'mesh'  },
];

function installDefaultRules(gate) {
  for (const rule of DEFAULT_ROUTING_RULES) {
    try { gate.rules.add(rule); } catch (_) {}
  }
}

module.exports = { createSNRouter, installDefaultRules, DEFAULT_ROUTING_RULES, TIERS, scoreToTier, scoreToPriority };
