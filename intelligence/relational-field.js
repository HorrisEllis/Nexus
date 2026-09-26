'use strict';
/**
 * cortex/intelligence/relational-field.js — RFR2 wired into the intelligence system
 * UUID: nexus-intelligence-relational-field-v1-0000-2026-0730-001
 *
 * James: "RFR2 should be wired into the intelligence." Today intelligence touches
 * only ONE of RFR2's 14 modules (mastermind → delta.detectFractals, recurring
 * shapes). This wires the Relational Field Reader's CAUSAL core into intelligence:
 * when there's friction or tension, use RFR2 to track the CONDITIONS that caused
 * it — not a raw sigma threshold.
 *
 *   RFR2 causality (traceToRoot)  → the conditions/events that led to the friction
 *   RFR2 sigma (classify)         → characterize the deviation from baseline
 *
 * §8.6 — composes the EXISTING rfr2-bridge (lib/rfr2-bridge.js, the proven loader)
 * + RFR2's own causality/sigma modules; builds no new physics. §1.2 honest
 * degrade — any RFR2 failure (bridge missing, ESM import error, empty graph)
 * returns a null-shaped result with a stated reason; intelligence's existing
 * output is never broken. §17.5 — the traced root + deviation ARE the provenance
 * of a friction condition. Async because RFR2's bridge import is.
 */

/**
 * readFieldForFriction(frictionEvent, opts) — the core wire. Given a friction/
 * tension signal (an event with an id + a kinematic window of recent measures),
 * ask RFR2: what conditions caused this, and how far from baseline is it?
 *
 * @param frictionEvent { id, kinematicWindow?, causalStore? }
 *   id             — the event to trace back from (the observed friction point)
 *   kinematicWindow— recent numeric measures for sigma.classify (deviation)
 *   causalStore    — an RFR2 causal store with the edges (or we build an empty one)
 * @returns { root, conditions, deviation, available, reason }
 *   root       — the traced root cause event id (traceToRoot)
 *   conditions — the causal path from root → friction (the conditions that caused it)
 *   deviation  — RFR2 sigma classification of the kinematic window
 *   available  — false + reason if RFR2 couldn't be reached (honest degrade)
 */
async function readFieldForFriction(frictionEvent = {}, opts = {}) {
  const out = { root: null, conditions: [], deviation: null, available: false, reason: null };
  if (!frictionEvent || !frictionEvent.id) { out.reason = 'no friction event id to trace'; return out; }

  let causality, sigma;
  try {
    const { loadRFR2Module } = require('../lib/rfr2-bridge.js');
    causality = await loadRFR2Module('causality');
    sigma = await loadRFR2Module('sigma');
  } catch (e) { out.reason = `RFR2 bridge unavailable: ${e.message}`; return out; }

  // 1. Trace the CONDITIONS that caused the friction (RFR2 causality).
  try {
    const store = frictionEvent.causalStore
      || (opts.causalStore)
      || (causality.createCausalStore && causality.createCausalStore());
    if (store && typeof store.traceToRoot === 'function') {
      const traced = store.traceToRoot(frictionEvent.id);
      out.root = traced.path && traced.path.length ? traced.path[0] : null;
      out.conditions = traced.path || [];
      out.truncated = !!traced.truncated;
      out.available = true;
    } else {
      out.reason = 'RFR2 causality store has no traceToRoot';
    }
  } catch (e) { out.reason = `causality trace failed: ${e.message}`; }

  // 2. Characterize the DEVIATION from baseline (RFR2 sigma), if a window is given.
  try {
    if (frictionEvent.kinematicWindow && sigma && typeof sigma.classify === 'function') {
      out.deviation = sigma.classify(frictionEvent.kinematicWindow);
    }
  } catch (e) { /* sigma is optional enrichment — a trace without it is still useful */ }

  return out;
}

/**
 * trackFrictionConditions(events, opts) — batch: over a set of friction/tension
 * events, read the field for each and return the conditions, so the intelligence
 * system can see WHICH conditions recur behind friction (feeds mastermind's
 * pattern detection + the snapshot trigger James described).
 */
async function trackFrictionConditions(events = [], opts = {}) {
  const results = [];
  for (const ev of events) {
    if (!ev || !ev.id) continue;
    results.push({ event: ev.id, ...(await readFieldForFriction(ev, opts)) });
  }
  const traced = results.filter(r => r.available);
  return { results, traced: traced.length, total: results.length, ts: Date.now() };
}

module.exports = { readFieldForFriction, trackFrictionConditions, MODULE_ID: 'intelligence-relational-field', VERSION: '1.0.0' };
