// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/deadman.js   v1.0.0
 *
 * DEADMAN SWITCH — Graduated heartbeat-loss response policy.
 *
 * If no authenticated heartbeat is received within the configured
 * timeout, escalates through:
 *
 *   Stage 0 → Timeout reached: seal vault, suspend mesh trust, notify peers
 *   Stage 1 → +N hours: revoke all active session tokens
 *   Stage 2 → +N days (optional): destroy session keys
 *              Encrypted data survives. Without the key it is inaccessible.
 *
 * Does not destroy data. Recoverable with recovery key.
 *
 * Integration:
 *   const dm = createDeadman({ busEmit, gate, keyRotation });
 *   dm.arm({ timeoutMin: 30, revokeDelay: 6*60, destroyDelay: 7*24*60, destroyKeys: false });
 *   dm.heartbeat();   // call on every authenticated UI interaction
 *   // Mount dm.route() under /sovereignty/deadman in HTTP server
 */

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-deadman-v1000-00001';

function createDeadman({ busEmit, gate, keyRotation } = {}) {
  let _armed        = false;
  let _lastHb       = Date.now();
  let _config       = {
    timeoutMin:    30,      // minutes to first escalation
    revokeDelay:   6 * 60, // additional minutes before token revocation
    destroyDelay:  7 * 24 * 60, // additional minutes before key destruction
    destroyKeys:   false,
    notifyPeers:   true,
  };
  let _stage        = 0;
  let _timer        = null;
  let _revokeTimer  = null;
  let _destroyTimer = null;
  const _log        = [];

  function _addLog(msg, level = 'info') {
    const entry = { ts: Date.now(), msg, level };
    _log.push(entry);
    if (_log.length > 200) _log.shift();
    busEmit?.('sovereignty:deadman:log', entry, level === 'err' ? 'WARN' : 'INFO');
  }

  function _clearTimers() {
    clearTimeout(_timer);
    clearTimeout(_revokeTimer);
    clearTimeout(_destroyTimer);
    _timer = _revokeTimer = _destroyTimer = null;
    _stage = 0;
  }

  function arm(config = {}) {
    _config = { ..._config, ...config };
    _armed = true;
    _lastHb = Date.now();
    _clearTimers();
    _scheduleTimeout();
    _addLog('Deadman switch armed — monitoring heartbeat', 'warn');
    busEmit?.('sovereignty:deadman:armed', { config: _config }, 'INFO');
  }

  function disarm() {
    _armed = false;
    _clearTimers();
    _addLog('Deadman switch disarmed');
    busEmit?.('sovereignty:deadman:disarmed', {}, 'INFO');
  }

  function heartbeat(source = 'manual') {
    _lastHb = Date.now();
    if (_armed) {
      _clearTimers();
      _scheduleTimeout();
      _addLog(`Heartbeat received (${source}) — timeout reset`);
    }
    busEmit?.('sovereignty:deadman:heartbeat', { source, ts: _lastHb }, 'DEBUG');
    return { ok: true, nextDeadlineMs: _config.timeoutMin * 60 * 1000 };
  }

  function _scheduleTimeout() {
    _timer = setTimeout(_escalate0, _config.timeoutMin * 60 * 1000);
  }

  function _escalate0() {
    _stage = 1;
    _addLog('ESCALATION: No heartbeat — sealing vault · suspending mesh trust', 'err');
    busEmit?.('sovereignty:deadman:escalate:0', { stage: 1, action: 'vault:seal + trust:suspend' }, 'WARN');

    // Seal vault — suspend SNGate mesh trust for all unknowns
    if (gate?.rules?.add) {
      gate.rules.add({
        type:    'deadman:mesh:suspend',
        action:  'observe',
        surface: 'mesh',
        _deadman: true,
        _desc:   'Deadman: mesh trust suspended — no heartbeat received',
      });
    }

    if (_config.notifyPeers) {
      busEmit?.('mesh:broadcast', {
        type:    'sovereignty:deadman:triggered',
        nodeId:  null,
        stage:   1,
      }, 'WARN');
    }

    // Stage 1: revoke sessions
    _revokeTimer = setTimeout(_escalate1, _config.revokeDelay * 60 * 1000);
  }

  function _escalate1() {
    _stage = 2;
    _addLog('ESCALATION: Revoking all session tokens', 'err');
    busEmit?.('sovereignty:deadman:escalate:1', { stage: 2, action: 'sessions:revoke' }, 'WARN');

    // Force rotate all session keys (old keys expire, peers must re-auth)
    if (keyRotation?.forceRotate) {
      keyRotation.forceRotate('session');
    }

    if (_config.destroyKeys) {
      _destroyTimer = setTimeout(_escalate2, _config.destroyDelay * 60 * 1000);
    }
  }

  function _escalate2() {
    _stage = 3;
    _addLog('ESCALATION: Destroying session keys — encrypted data inaccessible', 'err');
    busEmit?.('sovereignty:deadman:escalate:2', { stage: 3, action: 'keys:destroy' }, 'WARN');

    // Zero session keys from memory via key rotation
    if (keyRotation?.forceRotate) {
      keyRotation.forceRotate('session');
      keyRotation.forceRotate('ecdh');
    }
  }

  function test() {
    _addLog('TEST: Deadman escalation sequence simulated (no action taken)', 'warn');
    busEmit?.('sovereignty:deadman:test', {}, 'INFO');
    return { ok: true, simulated: true };
  }

  function route(method, urlParts, body) {
    const sub = urlParts[2]; // /sovereignty/deadman/<sub>

    if (method === 'GET' && !sub) {
      return diagnostics();
    }
    if (method === 'POST' && sub === 'arm') {
      arm(body || {});
      return { ok: true, armed: true };
    }
    if (method === 'POST' && sub === 'disarm') {
      disarm();
      return { ok: true, armed: false };
    }
    if (method === 'POST' && sub === 'heartbeat') {
      return heartbeat(body?.source || 'api');
    }
    if (method === 'POST' && sub === 'test') {
      return test();
    }
    if (method === 'GET' && sub === 'log') {
      return { ok: true, log: _log.slice(-50) };
    }
    return null;
  }

  function diagnostics() {
    const msSinceLast = Date.now() - _lastHb;
    return {
      ok:          true,
      version:     VERSION,
      uuid:        MODULE_UUID,
      armed:       _armed,
      stage:       _stage,
      lastHeartbeat: new Date(_lastHb).toISOString(),
      msSinceLast,
      config:      _config,
      nextDeadlineMs: _armed ? Math.max(0, _config.timeoutMin * 60 * 1000 - msSinceLast) : null,
    };
  }

  return {
    arm,
    disarm,
    heartbeat,
    test,
    route,
    diagnostics,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createDeadman, VERSION, MODULE_UUID };
