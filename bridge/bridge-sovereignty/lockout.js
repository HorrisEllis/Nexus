// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/lockout.js   v1.0.0
 *
 * LOCKOUT POLICY — Progressive authentication failure response.
 *
 * Three-tier escalation on repeated auth failures:
 *
 *   Tier 1 (1–N fails)   → brief cooldown before retry
 *   Tier 2 (N+1–M fails) → sealed recovery required (longer cooldown)
 *   Tier 3 (M+1–K fails) → key destruction threshold (irreversible option)
 *
 * Thresholds and cooldown durations are configurable. Integrates with
 * bridge-sngate to add deny rules during lockout, and optionally
 * triggers key decay on Tier 3.
 *
 * Integration:
 *   const lo = createLockout({ busEmit, gate, keyDecay });
 *   lo.configure({ tier1: 5, tier2: 10, tier3: 15, cooldown: 30 });
 *   lo.recordFailure();         // call on each auth failure
 *   lo.recordSuccess();         // call on each auth success (resets count)
 *   // Mount lo.route() under /sovereignty/lockout in HTTP server
 */

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-lockout-v1000-000001';

function createLockout({ busEmit, gate, keyDecay } = {}) {
  let _count      = 0;
  let _state      = 'clear';   // clear | cooldown | sealed | destroy
  let _cooldownUntil = 0;
  let _config     = {
    tier1:    5,    // failures before cooldown
    tier2:    10,   // failures before sealed recovery
    tier3:    15,   // failures before key destruction threshold
    cooldown: 30,   // seconds of cooldown in Tier 1
    autoDestroyOnTier3: false,
  };
  const _log      = [];
  let _gateRuleId = null;

  function _addLog(msg, level = 'info') {
    const entry = { ts: Date.now(), msg, level };
    _log.push(entry);
    if (_log.length > 200) _log.shift();
    busEmit?.('sovereignty:lockout:log', entry, 'INFO');
  }

  function configure(config = {}) {
    _config = { ..._config, ...config };
    busEmit?.('sovereignty:lockout:configured', { config: _config }, 'INFO');
    return { ok: true };
  }

  function recordFailure() {
    _count++;
    _updateState();
    _addLog(`Auth failure #${_count} — state: ${_state}`, _state === 'clear' ? 'info' : 'warn');
    busEmit?.('sovereignty:lockout:failure', { count: _count, state: _state }, 'WARN');
    return { ok: true, count: _count, state: _state, lockedOut: _state !== 'clear' };
  }

  function recordSuccess() {
    const wasLocked = _state !== 'clear';
    _count = 0;
    _state = 'clear';
    _cooldownUntil = 0;
    _removeGateRule();
    if (wasLocked) {
      _addLog('Auth success — lockout cleared');
      busEmit?.('sovereignty:lockout:cleared', {}, 'INFO');
    }
    return { ok: true };
  }

  function _updateState() {
    const { tier1, tier2, tier3, cooldown, autoDestroyOnTier3 } = _config;

    if (_count <= tier1) {
      _state = 'clear';
      return;
    }

    if (_count <= tier2) {
      _state = 'cooldown';
      _cooldownUntil = Date.now() + cooldown * 1000;
      _addLog(`Tier 1 lockout: cooldown ${cooldown}s`, 'warn');
      busEmit?.('sovereignty:lockout:tier1', { count: _count, cooldown }, 'WARN');
      return;
    }

    if (_count <= tier3) {
      _state = 'sealed';
      _installGateRule();
      _addLog('Tier 2 lockout: sealed recovery required', 'err');
      busEmit?.('sovereignty:lockout:tier2', { count: _count }, 'WARN');
      return;
    }

    // Tier 3
    _state = 'destroy';
    _addLog('Tier 3 lockout: KEY DESTRUCTION THRESHOLD REACHED', 'err');
    busEmit?.('sovereignty:lockout:tier3', { count: _count }, 'WARN');

    if (autoDestroyOnTier3 && keyDecay) {
      keyDecay.enable({ days: 0, targets: ['session', 'signing'] });
      keyDecay.renew('passphrase'); // immediately expire
    }
  }

  function _installGateRule() {
    if (!gate?.rules?.add || _gateRuleId) return;
    _gateRuleId = gate.rules.add({
      type:     'lockout:sealed',
      action:   'deny',
      surface:  'all',
      _lockout: true,
      _desc:    'Lockout Tier 2: sealed recovery required',
    });
  }

  function _removeGateRule() {
    if (!gate?.rules?.remove || !_gateRuleId) return;
    gate.rules.remove?.(_gateRuleId);
    _gateRuleId = null;
  }

  function isLockedOut() {
    if (_state === 'clear') return false;
    if (_state === 'cooldown' && Date.now() > _cooldownUntil) {
      // Cooldown expired — downgrade to clear
      _state = 'clear';
      return false;
    }
    return true;
  }

  function reset() {
    const prev = { count: _count, state: _state };
    _count = 0;
    _state = 'clear';
    _cooldownUntil = 0;
    _removeGateRule();
    _addLog('Lockout manually reset');
    busEmit?.('sovereignty:lockout:reset', { previous: prev }, 'INFO');
    return { ok: true };
  }

  function simulate() {
    const result = recordFailure();
    _addLog(`SIMULATE: failure recorded — count ${_count}`);
    return result;
  }

  function route(method, urlParts, body) {
    const sub = urlParts[2];

    if (method === 'GET'  && !sub)                  return diagnostics();
    if (method === 'POST' && sub === 'configure')    return configure(body || {});
    if (method === 'POST' && sub === 'failure')      return recordFailure();
    if (method === 'POST' && sub === 'success')      return recordSuccess();
    if (method === 'POST' && sub === 'reset')        return reset();
    if (method === 'POST' && sub === 'simulate')     return simulate();
    if (method === 'GET'  && sub === 'log')          return { ok: true, log: _log.slice(-50) };
    return null;
  }

  function diagnostics() {
    return {
      ok:          true,
      version:     VERSION,
      uuid:        MODULE_UUID,
      count:       _count,
      state:       _state,
      lockedOut:   isLockedOut(),
      cooldownUntil: _cooldownUntil || null,
      config:      _config,
    };
  }

  return {
    configure,
    recordFailure,
    recordSuccess,
    isLockedOut,
    reset,
    simulate,
    route,
    diagnostics,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createLockout, VERSION, MODULE_UUID };
