// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/key-decay.js   v1.0.0
 *
 * KEY DECAY — Cryptographic access expiry policy.
 *
 * If no vault access (recovery action) is performed within the configured
 * window, targeted session keys are destroyed. Encrypted data survives on
 * disk — without the key it is effectively inaccessible. More elegant and
 * more reversible than filesystem deletion.
 *
 * Key categories:
 *   SESSION  — AES session keys (active channels)
 *   SIGNING  — Ed25519 signing subkeys (AppID operations)
 *   ROOT     — Root identity key (IRREVERSIBLE — opt-in only)
 *
 * Recovery methods (any one resets the decay clock):
 *   passphrase  — vault passphrase provided
 *   tpm         — TPM-bound key unsealed
 *   peer        — trusted peer recovery (m-of-n)
 *   shamir      — Shamir secret sharing (2-of-3)
 *
 * Integration:
 *   const kd = createKeyDecay({ busEmit, keyRotation });
 *   kd.enable({ days: 30, targets: ['session'], recovery: ['passphrase', 'tpm'] });
 *   kd.renew('passphrase');   // on any authenticated vault access
 *   // Mount kd.route() under /sovereignty/key-decay in HTTP server
 */

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-keydecay-v1000-0001';

const VALID_TARGETS   = ['session', 'signing', 'root'];
const VALID_RECOVERY  = ['passphrase', 'tpm', 'peer', 'shamir'];

function createKeyDecay({ busEmit, keyRotation } = {}) {
  let _enabled   = false;
  let _lastAccess = Date.now();
  let _config    = {
    days:      30,
    targets:   ['session'],
    recovery:  ['passphrase', 'tpm'],
  };
  let _timer     = null;
  const _log     = [];

  function _addLog(msg, level = 'info') {
    const entry = { ts: Date.now(), msg, level };
    _log.push(entry);
    if (_log.length > 200) _log.shift();
    busEmit?.('sovereignty:keydecay:log', entry, 'INFO');
  }

  function _clearTimer() {
    clearTimeout(_timer);
    _timer = null;
  }

  function _scheduleDecay() {
    _clearTimer();
    _timer = setTimeout(_executeDecay, _config.days * 24 * 60 * 60 * 1000);
  }

  function enable(config = {}) {
    if (config.targets) {
      config.targets = config.targets.filter(t => VALID_TARGETS.includes(t));
    }
    if (config.recovery) {
      config.recovery = config.recovery.filter(r => VALID_RECOVERY.includes(r));
    }
    _config   = { ..._config, ...config };
    _enabled  = true;
    _lastAccess = Date.now();
    _scheduleDecay();
    _addLog(`Key decay enabled — ${_config.days}d window · targets: ${_config.targets.join(', ')}`);
    busEmit?.('sovereignty:keydecay:enabled', { config: _config }, 'INFO');
  }

  function disable() {
    _enabled = false;
    _clearTimer();
    _addLog('Key decay disabled');
    busEmit?.('sovereignty:keydecay:disabled', {}, 'INFO');
  }

  function renew(method = 'passphrase') {
    if (!VALID_RECOVERY.includes(method)) {
      return { ok: false, error: `Unknown recovery method: ${method}` };
    }
    if (!_config.recovery.includes(method)) {
      return { ok: false, error: `Recovery method '${method}' not configured` };
    }
    _lastAccess = Date.now();
    if (_enabled) _scheduleDecay();
    _addLog(`Decay clock renewed via ${method}`);
    busEmit?.('sovereignty:keydecay:renewed', { method, ts: _lastAccess }, 'INFO');
    return {
      ok:          true,
      method,
      nextDeadline: new Date(_lastAccess + _config.days * 86400_000).toISOString(),
    };
  }

  function _executeDecay() {
    if (!_enabled) return;

    _addLog(`KEY DECAY TRIGGERED — destroying targets: ${_config.targets.join(', ')}`, 'err');
    busEmit?.('sovereignty:keydecay:triggered', {
      targets: _config.targets,
      lastAccess: new Date(_lastAccess).toISOString(),
    }, 'WARN');

    if (_config.targets.includes('session') && keyRotation?.forceRotate) {
      keyRotation.forceRotate('session');
      _addLog('Session keys destroyed via key-rotation zero');
    }
    if (_config.targets.includes('signing') && keyRotation?.forceRotate) {
      keyRotation.forceRotate('subkey');
      _addLog('Signing subkeys destroyed via key-rotation zero');
    }
    if (_config.targets.includes('root')) {
      // Root key destruction is irreversible — emit event only,
      // bridge-identity owns the actual key material
      busEmit?.('sovereignty:keydecay:root:destroy', {
        warning: 'ROOT KEY DESTRUCTION — bridge-identity must execute this',
      }, 'WARN');
      _addLog('ROOT KEY DESTRUCTION signalled — bridge-identity must action', 'err');
    }

    _enabled = false;
  }

  function generateRecoveryKey() {
    const { randomBytes } = require('crypto');
    const key = randomBytes(32).toString('hex');
    _addLog('Recovery key generated — store securely offline');
    busEmit?.('sovereignty:keydecay:recovery:generated', { hint: key.slice(0, 8) + '…' }, 'INFO');
    // In production this would be split via Shamir or TPM-sealed
    return { ok: true, key, hint: 'Store offline. Needed to renew after decay.' };
  }

  function route(method, urlParts, body) {
    const sub = urlParts[2]; // /sovereignty/key-decay/<sub>

    if (method === 'GET' && !sub)           return diagnostics();
    if (method === 'POST' && sub === 'enable')  { enable(body || {}); return { ok: true }; }
    if (method === 'POST' && sub === 'disable') { disable(); return { ok: true }; }
    if (method === 'POST' && sub === 'renew')   return renew(body?.method || 'passphrase');
    if (method === 'POST' && sub === 'recovery-key') return generateRecoveryKey();
    if (method === 'GET'  && sub === 'log') return { ok: true, log: _log.slice(-50) };
    return null;
  }

  function diagnostics() {
    const msUntilDecay = _enabled
      ? Math.max(0, _lastAccess + _config.days * 86400_000 - Date.now())
      : null;
    return {
      ok:        true,
      version:   VERSION,
      uuid:      MODULE_UUID,
      enabled:   _enabled,
      lastAccess: new Date(_lastAccess).toISOString(),
      msUntilDecay,
      daysUntilDecay: msUntilDecay !== null
        ? (msUntilDecay / 86400_000).toFixed(2)
        : null,
      config:    _config,
    };
  }

  return {
    enable,
    disable,
    renew,
    generateRecoveryKey,
    route,
    diagnostics,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createKeyDecay, VERSION, MODULE_UUID };
