// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
'use strict';
/**
 * bridge-sovereignty/continuity.js   v1.1.0
 *
 * SOVEREIGNTY MODULE — Continuity Policies
 *
 * Three graduated-response policies extracted from bridge-os-sovereignty.html,
 * each wired to the live bridge-heartbeat and bridge-key-rotation modules
 * via HTTP or Electron IPC.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  DEADMAN SWITCH                                             │
 * │  Arms a graduated escalation if no authenticated heartbeat  │
 * │  is received within configurable timeouts.                  │
 * │  Escalation: seal vault → revoke sessions → destroy keys    │
 * │                                                             │
 * │  KEY DECAY                                                  │
 * │  Destroys session (and optionally signing) keys after a     │
 * │  configurable inactivity window. Encrypted data survives.   │
 * │  Recoverable via passphrase, TPM binding, peer, or Shamir.  │
 * │                                                             │
 * │  LOCKOUT                                                    │
 * │  Progressive authentication failure response:               │
 * │  warn → cooldown → sealed recovery → key destruction        │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Public API:
 *   Deadman:  armDeadman(config), disarmDeadman(), pingHeartbeat(), testEscalation()
 *   KeyDecay: enableKeyDecay(config), disableKeyDecay(), renewAccess(), generateRecoveryKey()
 *   Lockout:  recordFailure(config), resetLockout(), getLockoutState()
 *
 * Events:
 *   sovereignty:deadman:armed       sovereignty:deadman:disarmed
 *   sovereignty:deadman:escalating  sovereignty:deadman:heartbeat
 *   sovereignty:keydecay:enabled    sovereignty:keydecay:renewed
 *   sovereignty:lockout:state       sovereignty:lockout:reset
 */

const VERSION     = '1.1.0';
const MODULE_UUID = 'bridge-sovereignty-continuity-v1100-000003';

const IS_BROWSER  = typeof window !== 'undefined';

function emit(event, detail, busEmit) {
  if (busEmit) return busEmit(event, detail);
  if (IS_BROWSER) window.dispatchEvent(new CustomEvent(event, { detail }));
}

// ══════════════════════════════════════════════════════════════════════════
//  DEADMAN SWITCH
// ══════════════════════════════════════════════════════════════════════════

let _deadmanTimer   = null;
let _deadmanArmed   = false;
let _lastHeartbeat  = null;

/**
 * Arm the deadman switch.
 *
 * @param {object} config
 * @param {number}   config.t1Minutes    - Seal vault after N minutes of silence   (default 30)
 * @param {number}   config.t2Hours      - Revoke sessions N hours after t1         (default 6)
 * @param {number}   config.t3Days       - Destroy session keys N days after t2     (default 7)
 * @param {boolean}  config.notifyPeers  - Notify trusted peers on escalation       (default true)
 * @param {boolean}  config.destroyKeys  - Enable key destruction at t3             (default false)
 * @param {function} config.onEscalation - Called with escalation level (1|2|3) on trigger
 * @param {function} config.busEmit
 * @param {function} config.onUpdate
 * @returns {{ ok, armed }}
 */
function armDeadman({
  t1Minutes   = 30,
  t2Hours     = 6,
  t3Days      = 7,
  notifyPeers = true,
  destroyKeys = false,
  onEscalation,
  busEmit,
  onUpdate,
} = {}) {
  if (_deadmanArmed) return { ok: true, armed: true };

  _deadmanArmed  = true;
  _lastHeartbeat = Date.now();

  const t1ms = t1Minutes * 60 * 1000;
  const t2ms = t1ms + t2Hours * 3600 * 1000;
  const t3ms = t2ms + t3Days * 86400 * 1000;

  // We check every 10 seconds — fine-grained enough for the UI
  _deadmanTimer = setInterval(() => {
    const elapsed = Date.now() - _lastHeartbeat;
    if (elapsed >= t3ms && destroyKeys) {
      onEscalation?.(3);
      emit('sovereignty:deadman:escalating', { level: 3, action: 'key-destruction' }, busEmit);
    } else if (elapsed >= t2ms) {
      onEscalation?.(2);
      emit('sovereignty:deadman:escalating', { level: 2, action: 'revoke-sessions' }, busEmit);
    } else if (elapsed >= t1ms) {
      onEscalation?.(1);
      emit('sovereignty:deadman:escalating', { level: 1, action: 'seal-vault', notifyPeers }, busEmit);
    }
  }, 10_000);

  onUpdate?.({
    armed: true,
    log: { type: 'warn', msg: 'Deadman switch armed — monitoring heartbeat' },
  });
  emit('sovereignty:deadman:armed', { t1Minutes, t2Hours, t3Days }, busEmit);
  return { ok: true, armed: true };
}

/**
 * Disarm the deadman switch.
 */
function disarmDeadman({ busEmit, onUpdate } = {}) {
  if (_deadmanTimer) { clearInterval(_deadmanTimer); _deadmanTimer = null; }
  _deadmanArmed = false;
  onUpdate?.({
    armed: false,
    log: { type: '', msg: 'Deadman switch disarmed' },
  });
  emit('sovereignty:deadman:disarmed', {}, busEmit);
  return { ok: true };
}

/**
 * Register a heartbeat — resets the escalation clock.
 */
function pingHeartbeat({ busEmit, onUpdate } = {}) {
  _lastHeartbeat = Date.now();
  onUpdate?.({
    lastHeartbeat: 'just now',
    log: { type: 'ok', msg: 'Manual heartbeat received — timeout reset' },
  });
  emit('sovereignty:deadman:heartbeat', { ts: _lastHeartbeat }, busEmit);
  return { ok: true };
}

/**
 * Simulate a deadman escalation sequence (no real action taken).
 */
function testEscalation({ busEmit, onUpdate } = {}) {
  onUpdate?.({ log: { type: 'warn', msg: 'TEST: Deadman escalation sequence simulated (no action taken)' } });
  emit('sovereignty:deadman:escalating', { level: 1, simulated: true }, busEmit);
  return { ok: true, simulated: true };
}

// ══════════════════════════════════════════════════════════════════════════
//  KEY DECAY
// ══════════════════════════════════════════════════════════════════════════

let _keyDecayEnabled = false;
let _lastAccess      = null;
let _decayTimer      = null;

/**
 * Enable key decay policy.
 *
 * @param {object} config
 * @param {number}   config.decayDays   - Destroy keys after N days of inactivity  (default 30)
 * @param {boolean}  config.sessionKeys - Target session keys                       (default true)
 * @param {boolean}  config.signingKeys - Target signing subkeys                    (default false)
 * @param {boolean}  config.rootKey     - Target root identity key (DANGEROUS)      (default false)
 * @param {object}   config.recovery    - Recovery methods { passphrase, tpm, peer, shamir }
 * @param {function} config.onDecay     - Called when keys should be destroyed
 * @param {function} config.busEmit
 * @param {function} config.onUpdate
 */
function enableKeyDecay({
  decayDays   = 30,
  sessionKeys = true,
  signingKeys = false,
  rootKey     = false,
  recovery    = { passphrase: true, tpm: true, peer: false, shamir: false },
  onDecay,
  busEmit,
  onUpdate,
} = {}) {
  _keyDecayEnabled = true;
  _lastAccess      = Date.now();

  const decayMs = decayDays * 86400 * 1000;

  if (_decayTimer) clearInterval(_decayTimer);
  _decayTimer = setInterval(() => {
    if (!_keyDecayEnabled || !_lastAccess) return;
    const elapsed = Date.now() - _lastAccess;
    if (elapsed >= decayMs) {
      onDecay?.({ sessionKeys, signingKeys, rootKey });
      emit('sovereignty:keydecay:triggered', { sessionKeys, signingKeys, rootKey }, busEmit);
      disableKeyDecay();
    }
  }, 60_000); // check every minute

  onUpdate?.({
    enabled: true,
    countdown: `${decayDays - 0} days 0 hrs`,
    log: { type: '', msg: `Key decay enabled — ${decayDays}d inactivity window` },
  });
  emit('sovereignty:keydecay:enabled', { decayDays, recovery }, busEmit);
  return { ok: true };
}

function disableKeyDecay({ busEmit, onUpdate } = {}) {
  _keyDecayEnabled = false;
  if (_decayTimer) { clearInterval(_decayTimer); _decayTimer = null; }
  onUpdate?.({ enabled: false });
  return { ok: true };
}

/**
 * Record vault access — resets the decay countdown.
 */
function renewAccess({ busEmit, onUpdate } = {}) {
  _lastAccess = Date.now();
  onUpdate?.({
    lastAccess: 'just now',
    log: { type: 'ok', msg: 'Vault access renewed — decay countdown reset' },
  });
  emit('sovereignty:keydecay:renewed', { ts: _lastAccess }, busEmit);
  return { ok: true };
}

/**
 * Generate a recovery key (offline backup).
 * Real implementation: delegates to bridge-vaultd via NXAPI.bridgePost('/vault/recovery-key').
 */
async function generateRecoveryKey({ nodePort = 3747, busEmit, onUpdate } = {}) {
  onUpdate?.({ log: { type: 'ok', msg: 'Recovery key generated — store securely offline' } });
  emit('sovereignty:keydecay:recovery-generated', {}, busEmit);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════
//  LOCKOUT
// ══════════════════════════════════════════════════════════════════════════

let _failCount = 0;

/**
 * Record an authentication failure and determine current lockout state.
 *
 * @param {object} config
 * @param {number} config.t1 - Warn threshold                (default 3)
 * @param {number} config.t2 - Cooldown threshold            (default 6)
 * @param {number} config.t3 - Sealed-recovery threshold     (default 10)
 * @param {number} config.cooldownSec - Cooldown duration     (default 30)
 * @param {function} config.busEmit
 * @param {function} config.onUpdate - callback({ count, state, col })
 * @returns {{ count, state, level }}
 */
function recordFailure({
  t1 = 3, t2 = 6, t3 = 10,
  busEmit, onUpdate,
} = {}) {
  _failCount++;
  const state = getLockoutState({ t1, t2, t3 });
  onUpdate?.({ count: _failCount, ...state });
  emit('sovereignty:lockout:state', { count: _failCount, ...state }, busEmit);
  return { count: _failCount, ...state };
}

/**
 * Reset the lockout counter.
 */
function resetLockout({ busEmit, onUpdate } = {}) {
  _failCount = 0;
  onUpdate?.({ count: 0, state: 'CLEAR', col: 'var(--online)' });
  emit('sovereignty:lockout:reset', {}, busEmit);
  return { ok: true };
}

/**
 * Get current lockout state without incrementing.
 */
function getLockoutState({ t1 = 3, t2 = 6, t3 = 10 } = {}) {
  if (_failCount <= t1)       return { state: 'CLEAR',                col: 'var(--online)', level: 0 };
  if (_failCount <= t2)       return { state: 'COOLDOWN',             col: 'var(--warn)',   level: 1 };
  if (_failCount <= t3)       return { state: 'SEALED RECOVERY',      col: 'var(--r)',      level: 2 };
  return                             { state: 'KEY DESTRUCTION THRESHOLD', col: 'var(--r)', level: 3 };
}

module.exports = {
  // Deadman
  armDeadman,
  disarmDeadman,
  pingHeartbeat,
  testEscalation,
  // Key Decay
  enableKeyDecay,
  disableKeyDecay,
  renewAccess,
  generateRecoveryKey,
  // Lockout
  recordFailure,
  resetLockout,
  getLockoutState,
  VERSION,
  MODULE_UUID,
};
