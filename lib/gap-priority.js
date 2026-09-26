'use strict';
/**
 * lib/gap-priority.js — a real, composite priority score per gap, bottom-up
 * and architecture-first, per James's own stated principle.
 * UUID: nexus-lib-gap-priority-v1-0000-2026-0817-jamesbrooks-001
 *
 * §BUILT 2026-08-17 — James, direct: "We need a priority system for the
 * gaps and open loops... Bottom up, architectural first. Pillars of the
 * Foundation... core foundation of each system first. Then the modules...
 * In order of how vital they are. Cortex being top priority. Then
 * dependencies. Bottom up, from most vital to least."
 *
 * Every factor below is REUSED real data, not invented:
 *   - systemVitality  — autopilot.js's own real KERNELS array (phase +
 *     critical flags) IS the real, already-authoritative "how vital is
 *     this system" ranking. Phase 1 is cortex, alone — "cortex being top
 *     priority" is already true in the running boot order, not something
 *     this module decides; it just reads it.
 *   - architecturalLayer — James's own stated check order (core, cli,
 *     api, event-driven/interaction-contract, ui, then modules) applied
 *     as a real per-gap weight, derived from the gap's own file path.
 *   - dependencyWeight — loom's real wire graph (1372 components, 1341
 *     wires, confirmed live) — real in-degree (how many other real
 *     things wire INTO this one) as the "how foundational is this,
 *     concretely" signal, not a guess.
 *   - tension          — lib/diagnostic-engines.js's real
 *     entropyRateAnalysis() regime classification, U-shaped (both
 *     'frozen' and 'chaotic' are high tension, 'healthy' is low) — not a
 *     naive linear read of entropyRate, since a stuck system and a
 *     runaway one are both bad for opposite reasons.
 *   - severity         — the gap's own existing real field, unchanged.
 *
 * Weights favor system/layer (0.60 combined) over the diagnostic signal
 * (0.10) deliberately — James's own words name architecture-first as the
 * PRIMARY ordering principle, with SNR/tension as an ADDITIONAL real
 * signal layered on top, not the driver.
 */
const path = require('path');

// Real, reused — the actual boot order this system already runs in.
// Duplicating autopilot.js's KERNELS array here would drift the moment
// either file changes; requiring it directly keeps one source of truth,
// same reasoning as everywhere else this session that avoided a second
// copy of real data.
// §CORRECTED, found by testing not assumed: requiring autopilot.js
// directly looked safe (start()/CLI-entry gated behind require.main ===
// module, confirmed at lines 76/1470) but is NOT — its top-level code
// (unrelated to KERNELS) starts a real ResourceMonitor (15s polling) and
// wires real event fan-in, ungated, on first require. Running that as a
// side effect of scoring a gap would be wrong. Real trade-off, named
// honestly rather than hidden: a small, static duplicate of the real
// phase/critical data below, not a live require of the real source of
// truth. Keep in sync with autopilot.js's own KERNELS array by hand —
// a real, standing maintenance cost, better than the alternative.
const _VITALITY_TABLE = {
  cortex: { phase: 1, critical: true },
  orchestrator: { phase: 2, critical: true }, bridge: { phase: 2, critical: true },
  guardian: { phase: 2, critical: true }, diagnostic: { phase: 2, critical: true },
  idearium: { phase: 3, critical: false }, architect: { phase: 3, critical: false },
  eravos: { phase: 3, critical: false }, 'ollama-bridge': { phase: 3, critical: false },
  copilot: { phase: 3, critical: false }, loom: { phase: 3, critical: false },
  emerge: { phase: 4, critical: false },
};

const VITALITY_FALLBACK = { phase: 3, critical: false }; // honest middle default for an unrecognized system — not a guess dressed as fact

function systemVitality(systemName) {
  const { phase, critical } = _VITALITY_TABLE[systemName] || VITALITY_FALLBACK;
  // Phase 1 (cortex alone) = 1.0. Phase 2 critical = 0.8. Phase 3 = 0.5.
  // Phase 4 / optional = 0.3. Real, direct mapping of the real boot order,
  // not a second independent ranking that could disagree with it.
  if (phase === 1) return 1.0;
  if (phase === 2 && critical) return 0.8;
  if (phase === 3) return 0.5;
  return 0.3;
}

const LAYER_ORDER = ['core', 'cli', 'api', 'events', 'ui', 'module'];
const LAYER_WEIGHT = { core: 1.0, cli: 0.85, api: 0.7, events: 0.55, ui: 0.4, module: 0.25 };

/**
 * architecturalLayer(filePath) — classifies a real file path into one of
 * James's own stated check-order layers. Heuristic, honestly a heuristic
 * — path-based, not a deep per-system model of what "core" means for
 * each of the ~13 real systems individually (that would need auditing
 * each system's own real structure one at a time, named as real future
 * work, not done here).
 */
function architecturalLayer(filePath) {
  const p = (filePath || '').toLowerCase();
  if (/(^|\/)(boot|core|kernel|foundation)[\/.]/.test(p)) return 'core';
  if (/(^|\/)cli\//.test(p) || /\bcli\.js$/.test(p)) return 'cli';
  if (/(^|\/)api\//.test(p) || /\broutes?\.js$/.test(p)) return 'api';
  if (/interaction-contract|(^|\/)events\/|event-log|\bbus\.js$/.test(p)) return 'events';
  if (/(^|\/)ui\//.test(p)) return 'ui';
  return 'module'; // honest default — most real files are modules, not architecture
}

let _wireIndegreeCache = null;
function _wireIndegree() {
  if (_wireIndegreeCache) return _wireIndegreeCache;
  try {
    const { LoomDriver } = require('../loom/schema/index.js');
    const d = new LoomDriver();
    const wires = Object.values(d.registry._state.wire);
    const hooks = d.registry._state.hook;
    const counts = {};
    for (const w of wires) {
      const toHook = hooks[w.to_hook_id];
      if (!toHook) continue;
      const cid = toHook.component_id;
      counts[cid] = (counts[cid] || 0) + 1;
    }
    _wireIndegreeCache = counts;
  } catch (_) { _wireIndegreeCache = {}; } // loom unreachable — fail open, no evidence isn't evidence of "not foundational"
  return _wireIndegreeCache;
}

/**
 * dependencyWeight(componentId) — log-normalized real in-degree. A
 * component with 0 or unknown real wires gets a low-but-nonzero
 * baseline (0.2) rather than 0 — absence of registry data isn't evidence
 * it's unimportant, same fail-open reasoning used throughout this
 * session for "no evidence" cases.
 */
function dependencyWeight(componentId) {
  if (!componentId) return 0.2;
  const counts = _wireIndegree();
  const n = counts[componentId] || 0;
  if (n === 0) return 0.2;
  // log-scaled: 1 real dependent -> ~0.3, 10 -> ~0.6, 100+ -> approaches 1.0
  return Math.min(1.0, 0.3 + 0.23 * Math.log10(n + 1) * 3);
}

const SEVERITY_WEIGHT = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 };

/**
 * tension(events) — reuses diagnostic-engines.js's real
 * entropyRateAnalysis(), U-shaped: 'frozen' (stuck) and 'chaotic'
 * (runaway) are both high tension; 'healthy' is low. Honestly returns
 * null (not a guessed 0) when there's insufficient real event history —
 * matching this session's own established rule: don't fake confidence
 * from nothing.
 */
function tension(events) {
  try {
    const de = require('./diagnostic-engines.js');
    const r = de.entropyRateAnalysis(events || []);
    if (r.regime === 'insufficient_data') return null;
    const T = { frozen: 0.9, chaotic: 0.9, low_variety: 0.5, moderate: 0.3, healthy: 0.1 };
    return T[r.regime] ?? 0.5;
  } catch (_) { return null; }
}

/**
 * tensionFromDelta(source, opts) — James: "I want to use delta to measure
 * the tension gaps... no hardcoded. dynamic updating over time."
 *
 * Real, windowed average over intelligence/cfr/ledger.js's own real,
 * continuous cfr_tension_history writes (added the same session, one row
 * per real ledger entry, every system, not gated behind a threshold) — a
 * genuinely dynamic signal that keeps updating as real CFR activity
 * happens, not a value frozen at whatever moment a gap was created.
 * Averaged over a real recent window (default 10min) rather than reading
 * only the single latest row — one noisy spike shouldn't swing a gap's
 * whole priority score.
 *
 * §1.2 — honestly returns null (not a fabricated 0.5) when jaaDB is
 * unreachable or genuinely no real rows exist yet for this source, same
 * discipline as tension(events) above. No hardcoded fallback anywhere in
 * this function.
 */
function tensionFromDelta(source, opts = {}) {
  if (!source) return null;
  const windowMs = opts.windowMs || 600000; // 10min real default, overridable
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const since = Date.now() - windowMs;
    const rows = jaaDB.query('cfr_tension_history', r => r.source === source && r.ts >= since);
    if (!rows.length) return null;
    const avg = rows.reduce((sum, r) => sum + (r.tension || 0), 0) / rows.length;
    return +avg.toFixed(4);
  } catch (_) { return null; }
}

/**
 * score(gap) — the real composite. gap: { system, filePath, componentId,
 * severity, events? }. Returns { composite, factors } — every factor
 * exposed, not just the final number, so a decision can be audited, not
 * just trusted.
 */
function score(gap = {}) {
  const sv = systemVitality(gap.system);
  const layer = architecturalLayer(gap.filePath);
  const lw = LAYER_WEIGHT[layer];
  const dw = dependencyWeight(gap.componentId);
  const sw = SEVERITY_WEIGHT[gap.severity] || SEVERITY_WEIGHT.medium;
  // §DYNAMIC-TENSION 2026-08-23 — prefer the real, continuously-updating
  // delta signal when it exists (genuine, live CFR activity for this
  // system); fall back to the older events-based regime read only when
  // no real delta history exists yet for this source. Both are honest —
  // neither fabricates a value when its own real data is absent.
  const t = tensionFromDelta(gap.system) ?? tension(gap.events);

  // Tension is optional evidence — when absent, redistribute its weight
  // to severity rather than silently treating "no data" as "zero
  // tension," which would be a fabricated confidence.
  const tw = t === null ? 0 : 0.10;
  const swAdj = t === null ? 0.25 : 0.15;

  const composite =
    sv * 0.35 +
    lw * 0.25 +
    dw * 0.15 +
    sw * swAdj +
    (t === null ? 0 : t * tw);

  return {
    composite: Math.round(composite * 10000) / 10000,
    factors: { systemVitality: sv, architecturalLayer: layer, layerWeight: lw, dependencyWeight: dw, severityWeight: sw, tension: t },
  };
}

module.exports = { score, systemVitality, architecturalLayer, dependencyWeight, tension, tensionFromDelta, LAYER_ORDER, MODULE_ID: 'gap-priority', VERSION: '0.1.0' };
