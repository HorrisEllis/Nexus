'use strict';
/**
 * lib/sigma-roles.js — OB10 of the observability/tablet phasemap
 * UUID: nexus-sigma-roles-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB10 (docs/nexus-observability-tablet-phasemap.spec). James's insight:
 * computeSigma produces ONE score (from three input axes — structural/temporal/
 * contextual), but that score serves FIVE ROLES depending on the consuming
 * component's declared intent:
 *   deviation    — how far from expected shape (structural-led)
 *   performance  — how far from expected timing/throughput (temporal-led)
 *   expectations — contract/spec conformance (structural + a contract signal)
 *   drift        — shift over time (§13.4)
 *   leverage     — impact weighting for pattern importance (feeds OB8)
 *
 * Each loom component declares a `sigma_intent`; interpret(sigmaResult, intent)
 * reports the SAME score AS that role, so a spike reads as what it means to that
 * component (a pipeline's spike = "performance deviation", a gap-engine's =
 * "drift", a contract's = "expectation violation"). §8.6 — composes the existing
 * computeSigma output; adds no new sigma computation. §17.5 — the role + the
 * axis that drove it are provenance. §13.4 — a component whose real sigma
 * behaviour stops matching its declared intent is itself a drift signal.
 */

const ROLES = ['deviation', 'performance', 'expectations', 'drift', 'leverage'];

// Which sigma axis dominates each role's meaning (for the "why this reads as X").
const ROLE_AXIS = {
  deviation:    'structural',
  performance:  'temporal',
  expectations: 'structural',
  drift:        'temporal',      // shift-over-time is temporal-led
  leverage:     'contextual',    // field-state weighted
};

// A component declares its sigma_intent; the interpreter reads the score AS that.
const DEFAULT_INTENTS = {
  'execution-pipeline': 'performance',
  'gap-engine':         'drift',
  'contract':           'expectations',
  'constitution':       'expectations',
  'raid':               'deviation',
  'bda':                'leverage',
  'schema-registry':    'expectations',
  'user-model':         'drift',
};

/**
 * interpret(sigmaResult, intent) — read a computeSigma result AS the component's
 * declared role. Returns { role, reading, score, drivingAxis, severity, why }.
 * @param sigmaResult { score, axes:{structural,temporal,contextual}, reason }
 * @param intent one of ROLES (or a component id that maps to one)
 */
function interpret(sigmaResult, intent) {
  const role = ROLES.includes(intent) ? intent : (DEFAULT_INTENTS[intent] || 'deviation');
  const score = (sigmaResult && sigmaResult.score) || 0;
  const axes = (sigmaResult && sigmaResult.axes) || {};
  const drivingAxis = ROLE_AXIS[role];
  const axisVal = axes[drivingAxis] || 0;

  const severity = score >= 0.75 ? 'critical' : score >= 0.5 ? 'elevated' : score >= 0.25 ? 'watch' : 'nominal';
  const reading = _phrase(role, score, severity);
  const why = `${role} reading led by the ${drivingAxis} axis (${axisVal.toFixed(2)}); sigma ${score.toFixed(2)}`;

  return { role, reading, score, drivingAxis, axisValue: axisVal, severity, why };
}

function _phrase(role, score, severity) {
  const pct = Math.round(score * 100);
  switch (role) {
    case 'performance':  return severity === 'nominal' ? `performance nominal` : `performance deviation (${pct}%)`;
    case 'drift':        return severity === 'nominal' ? `no drift` : `drift detected (${pct}%)`;
    case 'expectations': return severity === 'nominal' ? `expectations met` : `expectation violation (${pct}%)`;
    case 'leverage':     return `leverage weight ${pct}%`;
    case 'deviation':
    default:             return severity === 'nominal' ? `within expected shape` : `deviation (${pct}%)`;
  }
}

/**
 * declareIntent(componentId, role) — record a component's sigma_intent (used when
 * a loom component wants its sigma read as a specific role). Returns the mapping.
 * Persisted as a cortex row so it's editable (schema-registry pattern).
 */
function declareIntent(componentId, role) {
  if (!ROLES.includes(role)) return { error: `unknown sigma role "${role}" — one of: ${ROLES.join(', ')}` };
  try {
    const { jaaDB, uid } = require('../cortex/memory/jaa-db');
    const row = { uuid: uid ? uid() : `sigma-intent-${Date.now()}`, kind: 'sigma_intent', componentId, role, ts: Date.now() };
    jaaDB.insert('sigma_intents', row);
    return row;
  } catch (e) { return { error: e.message }; }
}

/**
 * intentFor(componentId) — the declared (or default) sigma role for a component.
 */
function intentFor(componentId) {
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const rows = (jaaDB.query('sigma_intents', r => r.componentId === componentId, 10) || []);
    if (rows.length) return rows[rows.length - 1].role;
  } catch { /* fall through to default */ }
  return DEFAULT_INTENTS[componentId] || 'deviation';
}

module.exports = { interpret, declareIntent, intentFor, ROLES, ROLE_AXIS, DEFAULT_INTENTS, MODULE_ID: 'sigma-roles', VERSION: '1.0.0' };
