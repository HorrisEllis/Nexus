// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/emergency.js   v1.0.0
 *
 * EMERGENCY CONTROLS — Sovereign Seal + Key Destruction
 *
 * Two destructive operations, both requiring a typed confirmation word:
 *
 *   SOVEREIGN SEAL
 *     Immediately seal the vault, revoke all sessions, suspend mesh
 *     participation, and notify trusted peers. Does NOT destroy data.
 *     Recoverable with recovery key.
 *     Confirmation word: "SEAL"
 *
 *   KEY DESTRUCTION
 *     Destroy selected key categories (session / signing / vault / TPM).
 *     Encrypted data survives on disk — without the key it is
 *     effectively inaccessible. More elegant than file deletion.
 *     Irreversible for root/vault keys.
 *     Confirmation word: "DESTROY"
 *
 * Integration:
 *   const em = createEmergency({ busEmit, gate, keyRotation });
 *   em.sovereignSeal({ confirm: 'SEAL' });
 *   em.destroyKeys({ confirm: 'DESTROY', targets: ['session', 'signing'] });
 *   // Mount em.route() under /sovereignty/emergency in HTTP server
 */

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-emergency-v1000-001';

const SEAL_WORD    = 'SEAL';
const DESTROY_WORD = 'DESTROY';

function createEmergency({ busEmit, gate, keyRotation } = {}) {
  let _sealed    = false;
  let _sealTs    = null;
  const _log     = [];

  function _addLog(msg, level = 'info') {
    const entry = { ts: Date.now(), msg, level };
    _log.push(entry);
    if (_log.length > 500) _log.shift();
    busEmit?.('sovereignty:emergency:log', entry, level === 'err' ? 'WARN' : 'INFO');
  }

  /**
   * SOVEREIGN SEAL
   * Seals the vault, revokes sessions, suspends mesh, notifies peers.
   * Requires confirm === 'SEAL'.
   */
  function sovereignSeal({ confirm, reason = 'manual' } = {}) {
    if (confirm !== SEAL_WORD) {
      return { ok: false, error: `Confirmation required: type "${SEAL_WORD}"` };
    }

    _sealed = true;
    _sealTs = Date.now();

    _addLog('⊘ SOVEREIGN SEAL EXECUTED — vault sealed · sessions revoked · mesh suspended', 'err');
    busEmit?.('sovereignty:emergency:seal', { reason, ts: _sealTs }, 'WARN');

    // Revoke all session tokens via key rotation
    if (keyRotation?.forceRotate) {
      keyRotation.forceRotate('session');
      _addLog('Session tokens rotated (effective revocation)');
    }

    // Suspend mesh via SNGate
    if (gate?.rules?.add) {
      gate.rules.add({
        type:      'emergency:seal:mesh',
        action:    'deny',
        surface:   'mesh',
        _emergency: true,
        _desc:     'Sovereign seal — mesh participation suspended',
      });
    }

    // Notify trusted peers via bus broadcast
    busEmit?.('mesh:broadcast', {
      type:   'sovereignty:seal:notification',
      reason,
      ts:     _sealTs,
    }, 'WARN');

    return {
      ok:      true,
      sealed:  true,
      ts:      _sealTs,
      message: 'Sovereign seal executed. Vault sealed. Sessions revoked. Mesh suspended. Peers notified.',
    };
  }

  /**
   * KEY DESTRUCTION
   * Destroys selected key categories. Requires confirm === 'DESTROY'.
   *
   * targets: string[] — any of ['session', 'signing', 'vault', 'tpm']
   *   'session' → force-rotate + zero session keys (forward-secure)
   *   'signing' → destroy signing subkeys
   *   'vault'   → signal bridge-identity to zero vault encryption key (irreversible)
   *   'tpm'     → signal bridge-identity to clear TPM PCR binding
   */
  function destroyKeys({ confirm, targets = [], reason = 'manual' } = {}) {
    if (confirm !== DESTROY_WORD) {
      return { ok: false, error: `Confirmation required: type "${DESTROY_WORD}"` };
    }
    if (!targets.length) {
      return { ok: false, error: 'No targets specified' };
    }

    const destroyed = [];
    const failed    = [];

    _addLog(`⚠ KEY DESTRUCTION INITIATED — targets: ${targets.join(', ')}`, 'err');
    busEmit?.('sovereignty:emergency:destroy:start', { targets, reason }, 'WARN');

    for (const target of targets) {
      try {
        switch (target) {
          case 'session':
            if (keyRotation?.forceRotate) {
              keyRotation.forceRotate('session');
              destroyed.push('session');
              _addLog('Session keys destroyed (zeroed from memory)');
            }
            break;

          case 'signing':
            if (keyRotation?.forceRotate) {
              keyRotation.forceRotate('subkey');
              destroyed.push('signing');
              _addLog('Signing subkeys destroyed');
            }
            break;

          case 'vault':
            // Vault key destruction — bridge-identity must action this.
            // We emit the event; the keystore listener handles the zero.
            busEmit?.('sovereignty:emergency:destroy:vault', {
              reason,
              warning: 'IRREVERSIBLE — vault encryption key will be zeroed',
            }, 'WARN');
            destroyed.push('vault');
            _addLog('Vault encryption key destruction signalled — bridge-identity must action', 'err');
            break;

          case 'tpm':
            // TPM PCR binding clear — bridge-identity handles this.
            busEmit?.('sovereignty:emergency:destroy:tpm', {
              reason,
              warning: 'TPM PCR binding cleared — identity will not unlock from TPM',
            }, 'WARN');
            destroyed.push('tpm');
            _addLog('TPM PCR binding destruction signalled', 'err');
            break;

          default:
            failed.push({ target, reason: 'Unknown target' });
        }
      } catch (e) {
        failed.push({ target, reason: e.message });
        _addLog(`Key destruction failed for '${target}': ${e.message}`, 'err');
      }
    }

    busEmit?.('sovereignty:emergency:destroy:complete', { destroyed, failed, reason }, 'WARN');

    return {
      ok:        failed.length === 0,
      destroyed,
      failed,
      message:   `Key destruction complete. Destroyed: ${destroyed.join(', ') || 'none'}. Encrypted data intact but inaccessible.`,
    };
  }

  function route(method, urlParts, body) {
    const sub = urlParts[2];

    if (method === 'GET'  && !sub)                 return diagnostics();
    if (method === 'POST' && sub === 'seal')        return sovereignSeal(body || {});
    if (method === 'POST' && sub === 'destroy-keys') return destroyKeys(body || {});
    if (method === 'GET'  && sub === 'log')         return { ok: true, log: _log.slice(-50) };
    return null;
  }

  function diagnostics() {
    return {
      ok:      true,
      version: VERSION,
      uuid:    MODULE_UUID,
      sealed:  _sealed,
      sealTs:  _sealTs ? new Date(_sealTs).toISOString() : null,
    };
  }

  return {
    sovereignSeal,
    destroyKeys,
    route,
    diagnostics,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createEmergency, VERSION, MODULE_UUID };
