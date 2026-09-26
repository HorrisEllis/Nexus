'use strict';
/**
 * cortex/core/raid/router.js — RAID as the universal entry point
 * UUID: nexus-raid-router-v1-0000-2026-0721-001
 * Version: 1.0.0
 *
 * "The start point doesn't matter, as long as it goes to RAID." (James)
 *
 * Any surface — Co-pilot, a UI, the CLI, an SSE flow — emits ONE event:
 *   raid.route.request  { envelope }
 * The router resolves which system fulfills it (via the live capability-
 * registry, Phase B — so targets are hot-swappable: swap the provider, the
 * registry re-announces, RAID routes to the new one, no surface changes),
 * stamps the envelope, and emits:
 *   raid.route.decided  { envelope }   ← target system subscribes to this
 * The target fulfills and emits:
 *   raid.route.fulfilled { envelope }  ← surface hears the answer over SSE
 * or raid.route.failed / raid.route.no_route.
 *
 * Nothing holds a hard pointer to a fulfilling system. RAID resolves the
 * target dynamically at route time. Cortex logs every event (wildcard bus
 * subscriber), so the envelope's trail + the event log together are the
 * "input → tagged → output, every hop logged" ledger.
 *
 * This is a NEW decision path — it does not touch _decide()'s existing
 * provider selection (ollama/claude/etc). RAID now decides two things:
 * which AI agent (existing) and which SYSTEM fulfills a request (this).
 *
 * §14.4 — no loop: the router consumes raid.route.request and emits
 * raid.route.decided; it does NOT consume its own emissions. Fulfilled/failed
 * come from the target, not the router.
 */

const envelopeLib = require('./envelope');

const MODULE_ID = 'cortex/core/raid/router';
const VERSION = '1.0.0';
const { STATUS } = envelopeLib;

let _bus = null;
let _capabilityRegistry = null;

/**
 * _resolveTarget(envelope) — which system fulfills this? Pure given the
 * registry state. Explicit capability wins; otherwise match intent against
 * the live registry (grammar/description/id). Returns { system, capability }
 * or null. The namespace of a capability id IS its owning system
 * (e.g. 'idearium.spec.create' → idearium), matching component-registry's
 * own convention — no separate system-mapping table (§10.1).
 */
function _resolveTarget(envelope) {
  if (!_capabilityRegistry) return null;

  if (envelope.capability) {
    const hit = _capabilityRegistry.capabilities().find(c => c.name === envelope.capability);
    if (hit) return { system: hit.namespace, capability: hit.name };
    return null;
  }

  const resolved = _capabilityRegistry.resolve(envelope.intent);
  if (!resolved.found || !resolved.capabilities.length) return null;
  const top = resolved.capabilities[0];
  return { system: top.namespace, capability: top.name };
}

// ── §T4 TRAIL PERSISTENCE 2026-07-24 ────────────────────────────────────────
// Until now the trail existed ONLY on the in-flight envelope object, so the
// tablet's brain view could not animate real routing — the data was gone the
// moment a request finished. This module's own header called the envelope "the
// ledger record"; that was aspirational, nothing wrote it down.
//
// Written at every stamp point, keyed by envelopeId with insert() (a FULL
// REPLACE, deliberately — envelopeLib.stamp() returns a NEW envelope carrying
// the CUMULATIVE trail, so the newest write always holds every prior hop.
// upsert() would merge and is not needed; insert-by-id is both correct and
// cheaper).
//
// Persisting at ROUTED as well as at the terminal states is the point, not an
// accident: an envelope that gets routed and never fulfilled is a STUCK
// REQUEST, and a trail store that only records completions would be blind to
// exactly the failure worth seeing (§1.2).
//
// Never throws into the routing path: a request must not fail because its
// telemetry could not be written. Loud, then continue.
let _jaaCache;
function _jaa() {
  if (_jaaCache === undefined) {
    try { ({ jaaDB: _jaaCache } = require('../../memory/jaa-db')); }
    catch (e) { _jaaCache = null; console.error(`[${MODULE_ID}] trail store unavailable: ${e.message}`); }
  }
  return _jaaCache;
}

function _persistTrail(envelope) {
  const jaa = _jaa();
  if (!jaa) return false;
  try {
    const last = envelope.trail[envelope.trail.length - 1] || {};
    jaa.insert('raid_trails', {
      id: envelope.envelopeId,
      envelopeId: envelope.envelopeId,
      intent: envelope.intent,
      from: envelope.from,
      target: envelope.target || null,
      status: envelope.status,
      terminal: envelope.status === STATUS.FULFILLED
             || envelope.status === STATUS.FAILED
             || envelope.status === STATUS.NO_ROUTE,
      hops: envelope.trail.length,
      trail: envelope.trail,
      firstTs: envelope.trail[0]?.ts ?? null,
      lastTs: last.ts ?? null,
      // Real elapsed time across the whole route — the number a trail
      // animation needs, and impossible to recover after the fact.
      elapsedMs: (last.ts ?? 0) - (envelope.trail[0]?.ts ?? 0),
      ts: Date.now(),
    });
    return true;
  } catch (e) {
    console.error(`[${MODULE_ID}] trail persist failed for ${envelope.envelopeId}: ${e.message}`);
    return false;
  }
}

function _onRouteRequest(event) {
  const envelope = event?.payload?.envelope;
  if (!envelopeLib.isValid(envelope)) {
    console.warn(`[${MODULE_ID}] raid.route.request with invalid envelope — ignored (§1.2: named, not silently dropped)`);
    return;
  }

  const target = _resolveTarget(envelope);
  if (!target) {
    const dead = envelopeLib.stamp(envelope, MODULE_ID, STATUS.NO_ROUTE,
      { note: `no system provides "${envelope.intent}"` });
    _persistTrail(dead);
    if (_bus) _bus.emit('raid.route.no_route', { envelope: dead }, { source: MODULE_ID, causedBy: envelope.envelopeId });
    return;
  }

  const routed = envelopeLib.stamp(envelope, MODULE_ID, STATUS.ROUTED,
    { target: target.system, note: `→ ${target.system} via ${target.capability}` });
  _persistTrail(routed);
  // The target system subscribes to raid.route.decided and checks
  // envelope.target === its own system id. Fully decoupled: RAID names the
  // target, it doesn't call it.
  if (_bus) _bus.emit('raid.route.decided', { envelope: routed, capability: target.capability },
    { source: MODULE_ID, causedBy: envelope.envelopeId });
}

/**
 * fulfill(envelope, result, opts) — helper a target system calls to report
 * completion. Stamps FULFILLED (or FAILED) and emits, so the surface hears
 * the answer. Exported so any system can use it without reimplementing the
 * envelope/emit dance (§5.6 structural self-similarity).
 */
function fulfill(envelope, result, opts = {}) {
  const failed = opts.failed === true;
  const done = envelopeLib.stamp(envelope, opts.system || envelope.target || 'unknown',
    failed ? STATUS.FAILED : STATUS.FULFILLED,
    { result, note: opts.note });
  _persistTrail(done);
  if (_bus) _bus.emit(failed ? 'raid.route.failed' : 'raid.route.fulfilled',
    { envelope: done }, { source: opts.system || 'unknown', causedBy: envelope.envelopeId });
  return done;
}

/**
 * route(intent, opts) — convenience for a surface: build an envelope and
 * fire it at RAID in one call. Returns the envelope (its id lets the surface
 * correlate the eventual raid.route.fulfilled over SSE).
 */
function route(intent, opts = {}) {
  const envelope = envelopeLib.make(intent, opts);
  if (_bus) _bus.emit('raid.route.request', { envelope }, { source: opts.from || 'surface' });
  return envelope;
}

function health() {
  return {
    ok: true, module: MODULE_ID, version: VERSION,
    busWired: !!_bus, registryWired: !!_capabilityRegistry,
  };
}

function init(cfg = {}) {
  _bus = cfg.bus || null;
  _capabilityRegistry = cfg.capabilityRegistry || null;
  if (_bus) _bus.on('raid.route.request', _onRouteRequest);
  console.log(`[${MODULE_ID}] v${VERSION} — universal entry point active${_bus ? ' (bus-wired)' : ' (no bus — test mode)'}`);
  return { ok: true };
}

function stop() {
  if (_bus) _bus.off('raid.route.request', _onRouteRequest);
  _bus = null;
}

// trails(limit) — read persisted trails newest-first. The brain view's real
// animation source, and the only way a completed route is observable at all.
function trails(limit = 100) {
  const jaa = _jaa();
  if (!jaa) return { observed: false, reason: 'no trail store', trails: [] };
  try { return { observed: true, trails: jaa.tail('raid_trails', limit) || [] }; }
  catch (e) { return { observed: false, reason: e.message, trails: [] }; }
}

module.exports = { MODULE_ID, VERSION, init, stop, health, route, fulfill, _resolveTarget, _onRouteRequest, trails, _persistTrail };
