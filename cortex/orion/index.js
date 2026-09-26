'use strict';
/**
 * cortex/orion/index.js — Orion Classification Organ
 * UUID: nexus-cortex-orion-v1-0000-2026-0720-001
 * Version: 1.0.0
 *
 * "Sensor + policy. Classifies requests, routes to context" (cortex.spec).
 * Subscribes the same two real inputs gap-finder already consumes
 * (anomaly.detected, sigma.event.halt_risk/warning) — SISO fan-out, same
 * broadcast, different consumer, same pattern already established twice
 * this session (anomaly.detected: liminal-space + escalation).
 *
 * Emits cortex.orion.classified shaped to match RAID's real, existing
 * _decide(call, health, weights) input exactly (cortex/core/raid/index.js) —
 * confirmed by reading that function, not guessed:
 *   call.faultClass, call.prompt/intent, call.context.{cfrRegime,
 *   cfrSigmaFloor, componentId, causedBy, sessionId, jobId}
 * Phase 6 wires RAID to consume this event and construct exactly that shape.
 *
 * §14.2 Gates are pure functions — _classify() takes the raw anomaly/sigma
 *   payload and returns the same classification for the same input every
 *   time. No JAA read, no external state — classification here doesn't
 *   need history, just faithful translation of what already arrived.
 */

const MODULE_ID = 'cortex/orion';
const VERSION = '1.0.0';

let _bus = null;

// Pure — same input, same output, always. No JAA, no clock-dependent branching
// beyond ts pass-through (ts is data, not a decision input).
function _classify(source, payload) {
  const { type, severity, sigma, reason, sessionId, anomalyUuid, uuid: sigmaUuid, ts } = payload || {};
  if (!type) return null;

  const cfrRegime = severity === 'critical' || (typeof sigma === 'number' && sigma >= 0.7)
    ? 'unstable' : 'stable';

  return {
    faultClass: type,
    intent: `remediate ${type}`,
    context: {
      cfrRegime,
      cfrSigmaFloor: typeof sigma === 'number' ? sigma : 0,
      componentId: null, // not derivable from anomaly/sigma payloads alone — honest null, not fabricated
      causedBy: anomalyUuid || sigmaUuid || null,
      sessionId: sessionId || null,
    },
    source,
    reason: reason || null,
    ts: ts || Date.now(),
  };
}

function _emitClassification(classification) {
  if (!classification) return;
  if (_bus) _bus.emit('cortex.orion.classified', classification, { source: MODULE_ID });
}

function _onAnomalyDetected(event) {
  _emitClassification(_classify('anomaly.detected', event?.payload));
}

function _onSigmaHaltRisk(event) {
  _emitClassification(_classify('sigma.event.halt_risk', event?.payload));
}

function _onSigmaWarning(event) {
  // Warnings are classified too (unlike gap-finder, which only escalates
  // halt_risk into a gap) — orion's job is routing context, and a warning
  // still deserves RAID's SNR pre-gate to see it; opening a *gap* on a
  // warning would be noise, but classifying it for routing purposes is not
  // the same decision, so this organ doesn't mirror gap-finder's threshold.
  _emitClassification(_classify('sigma.event.warning', event?.payload));
}

function health() {
  return { ok: true, module: MODULE_ID, version: VERSION, busWired: !!_bus };
}

function init(cfg = {}) {
  _bus = cfg.bus || null;
  if (_bus) {
    _bus.on('anomaly.detected', _onAnomalyDetected);
    _bus.on('sigma.event.halt_risk', _onSigmaHaltRisk);
    _bus.on('sigma.event.warning', _onSigmaWarning);
  }
  console.log(`[${MODULE_ID}] v${VERSION} — active${_bus ? ' (bus-wired)' : ' (no bus — test mode)'}`);
  return { ok: true };
}

function stop() {
  if (_bus) {
    _bus.off('anomaly.detected', _onAnomalyDetected);
    _bus.off('sigma.event.halt_risk', _onSigmaHaltRisk);
    _bus.off('sigma.event.warning', _onSigmaWarning);
  }
  _bus = null;
}

module.exports = { MODULE_ID, VERSION, init, stop, health, _classify };
