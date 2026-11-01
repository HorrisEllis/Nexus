'use strict';
/**
 * intelligence/friction.js — tension, computed where friction and tension mean one thing (CI7, 0.60.350).
 * comp_id: nexus.intelligence.friction
 * Spec: intelligence/spec/causal-interconnect.spec MOD-CI-TENSION · Map: docs/2026-10-31-causal-interconnect-phasemap.spec CI7
 *
 * James, 2026-11-01: "migrating looms friction and tension system to the intelligence system". (CI6 moved what the words mean; this moves the
 * formula.) The formula is Diagnostic's §TENSION-05, moved unchanged so the numbers do not jump:
 *   monitor tension = friction × (1 + monitorGaps × 0.2) × (1 + max(0, slope) × 2)
 *   loop tension    = the system's open gaps, each scored by Cortex's fault taxonomy, summed
 *   tension         = monitor tension + 0.3 × loop tension
 *   regime          = critical > 2.0 · turbulent > 1.0 · elevated > 0.4 · else stable
 * Inputs only through routes (asked in routes.js): Diagnostic GET /friction (it measures), Cortex GET /api/gaps/tension (it owns the gaps and
 * the taxonomy). Pure here. A missing source is said: loops null when Cortex did not answer, never 0.
 */
const MODULE_ID = 'nexus.intelligence.friction';
const VERSION = '1.0.0';
const REGIMES = Object.freeze([['critical', 2.0], ['turbulent', 1.0], ['elevated', 0.4]]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const regimeOf = (t) => (REGIMES.find(([, at]) => t > at) || ['stable'])[0];

/** tensionOf(frictionBySystem, loopsBySystem|null) → { bySystem, max, regime, loopsKnown } */
function tensionOf(frictionBySystem = {}, loopsBySystem = null) {
  const out = {};
  const names = new Set([...Object.keys(frictionBySystem || {}), ...Object.keys(loopsBySystem || {})]);
  for (const name of names) {
    const f = frictionBySystem[name] || null;
    const loops = loopsBySystem ? (loopsBySystem[name] || { total: 0, count: 0, top: [] }) : null;
    const fric = f ? Number(f.friction) || 0 : 0, gaps = f ? Number(f.monitorGaps) || 0 : 0, slope = f ? Math.max(0, Number(f.slope) || 0) : 0;
    const monitorTension = f ? fric * (1 + gaps * 0.2) * (1 + slope * 2) : null;
    const loopTension = loops ? loops.total : null;
    const tension = (monitorTension || 0) + (loopTension || 0) * 0.3;
    out[name] = { tension: r3(tension), monitorTension: monitorTension == null ? null : r3(monitorTension), loopTension: loopTension == null ? null : r3(loopTension),
      friction: f ? fric : null, monitorGaps: f ? gaps : null, openLoops: loops ? loops.count : null, topLoops: loops ? loops.top : null,
      slope: f ? Number(f.slope) || 0 : null, sigma: f ? Number(f.sigma) || 0 : null, regime: regimeOf(tension),
      ...(f ? {} : { why: 'Diagnostic does not measure this system' }), ...(loops ? {} : { loopsWhy: 'Cortex did not answer: loop tension unknown' }) };
  }
  const max = Object.values(out).reduce((m, x) => Math.max(m, x.tension), 0);
  return { bySystem: out, max: r3(max), regime: regimeOf(max), loopsKnown: !!loopsBySystem };
}

module.exports = { tensionOf, regimeOf, REGIMES, MODULE_ID, VERSION };
