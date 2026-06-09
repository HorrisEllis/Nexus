// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/index.js   v1.0.0
 *
 * BRIDGE SOVEREIGNTY — Unified sovereignty controls module.
 *
 * Aggregates all sovereignty sub-modules:
 *
 *   deadman       → heartbeat-loss graduated response
 *   key-decay     → cryptographic access expiry policy
 *   lockout       → progressive auth failure escalation
 *   runtime-vault → session isolation + token scoping
 *   emergency     → sovereign seal + key destruction
 *
 * HTTP routes (all under /sovereignty/):
 *   GET  /sovereignty                  → aggregate diagnostics
 *   *    /sovereignty/deadman/*        → deadman module
 *   *    /sovereignty/key-decay/*      → key decay module
 *   *    /sovereignty/lockout/*        → lockout module
 *   *    /sovereignty/vault/*          → runtime vault module
 *   *    /sovereignty/emergency/*      → emergency controls
 *
 * Boot integration (bridge-node/boot.js):
 *   After Phase 1.7 (cobalt seal), Phase 6 (heartbeat up):
 *
 *   const sovereignty = createSovereignty({ identity, busEmit, gate, keyRotation, heartbeat });
 *   sovereignty.connectHeartbeat(heartbeat);
 *   // Mount sovereignty.route() under /sovereignty in HTTP server
 *
 * The sovereignty layer mounts on top of the existing boot sequence.
 * It does NOT replace any existing module — it wraps and extends them.
 */

const { createDeadman }       = require('./deadman');
const { createKeyDecay }      = require('./key-decay');
const { createLockout }       = require('./lockout');
const { createRuntimeVault }  = require('./runtime-vault');
const { createEmergency }     = require('./emergency');

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-v1000-000000000001';

function createSovereignty({ identity, busEmit, gate, keyRotation, heartbeat } = {}) {

  const deadman      = createDeadman({ busEmit, gate, keyRotation });
  const keyDecay     = createKeyDecay({ busEmit, keyRotation });
  const lockout      = createLockout({ busEmit, gate, keyDecay });
  const runtimeVault = createRuntimeVault({ busEmit, identity });
  const emergency    = createEmergency({ busEmit, gate, keyRotation });

  // ── Connect to bridge-heartbeat ───────────────────────────────────────────
  // When the heartbeat manager fires a pulse, reset the deadman timer.
  function connectHeartbeat(hbManager) {
    if (!hbManager?.on && !hbManager?.onHeartbeat) return;

    const fn = () => deadman.heartbeat('bridge-heartbeat');

    // Support both event-emitter style and callback style
    if (typeof hbManager.on === 'function') {
      hbManager.on('heartbeat:pulse', fn);
    }
    if (typeof hbManager.onHeartbeat === 'function') {
      hbManager.onHeartbeat(fn);
    }
  }

  // ── Connect to bridge-key-rotation ───────────────────────────────────────
  // Sovereignty modules are wired at construct time via keyRotation param.
  // This is a no-op if already connected, exposed for post-boot wiring.
  function connectKeyRotation(kr) {
    // Passed through to sub-modules that already hold a reference
    // via closure. This method exists for symmetry / documentation.
  }

  // ── Sovereign seal shortcut (called by deadman escalation) ────────────────
  // Wraps emergency.sovereignSeal with a trusted internal path (no confirm word needed).
  function _internalSeal(reason) {
    busEmit?.('sovereignty:internal:seal', { reason }, 'WARN');
    // Revoke all sessions
    runtimeVault.revokeAll();
    // Rotate session keys
    keyRotation?.forceRotate?.('session');
    // Suspend mesh via gate
    if (gate?.rules?.add) {
      gate.rules.add({
        type:      'sovereignty:seal:internal',
        action:    'deny',
        surface:   'mesh',
        _internal: true,
        _desc:     `Sovereign seal (internal) — reason: ${reason}`,
      });
    }
  }

  // Wire deadman escalation into runtime vault revocation
  if (busEmit) {
    // These are no-ops until bus is wired — safe to set up now
    // (busEmit reference is captured by closure in sub-modules)
  }

  // ── Aggregate HTTP route ──────────────────────────────────────────────────
  function route(method, urlParts, body) {
    // urlParts[0] = 'sovereignty'
    const sub = urlParts[1];

    if (!sub || method === 'GET') {
      if (!sub) return diagnostics();
    }

    switch (sub) {
      case 'deadman':    return deadman.route(method, urlParts, body);
      case 'key-decay':  return keyDecay.route(method, urlParts, body);
      case 'lockout':    return lockout.route(method, urlParts, body);
      case 'vault':      return runtimeVault.route(method, urlParts, body);
      case 'emergency':  return emergency.route(method, urlParts, body);
      default:           return null;
    }
  }

  function diagnostics() {
    return {
      ok:      true,
      version: VERSION,
      uuid:    MODULE_UUID,
      modules: {
        deadman:      deadman.diagnostics(),
        keyDecay:     keyDecay.diagnostics(),
        lockout:      lockout.diagnostics(),
        runtimeVault: runtimeVault.diagnostics(),
        emergency:    emergency.diagnostics(),
      },
    };
  }

  function health() {
    return {
      ok:             true,
      version:        VERSION,
      deadmanArmed:   deadman.diagnostics().armed,
      keyDecayEnabled: keyDecay.diagnostics().enabled,
      lockoutState:   lockout.diagnostics().state,
      activeSessions: runtimeVault.diagnostics().activeSessions,
      sealed:         emergency.diagnostics().sealed,
    };
  }

  return {
    // Sub-modules (direct access for boot wiring)
    deadman,
    keyDecay,
    lockout,
    runtimeVault,
    emergency,
    // Wiring
    connectHeartbeat,
    connectKeyRotation,
    // HTTP
    route,
    // Diagnostics
    diagnostics,
    health,
    // Constants
    VERSION,
    MODULE_UUID,
  };
}

module.exports = {
  createSovereignty,
  VERSION,
  MODULE_UUID,
};
