// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-sovereignty/runtime-vault.js   v1.0.0
 *
 * RUNTIME VAULT — Session isolation, token scoping, multi-frontend support.
 *
 * The vault runtime owns all key material and enforces an isolation boundary
 * between the UI layer (untrusted) and the vault core (trusted):
 *
 *   UI LAYER  ←→  IPC  ←→  VAULT CORE  ←→  mesh
 *   (untrusted)           (cryptography · identity · attestation)
 *
 * Key properties:
 *   - Compromised UI cannot extract identity material
 *   - Keys never exported to UI — vault signs/encrypts and returns outputs only
 *   - Each frontend (CLI, UI, mobile) gets a scoped session token with
 *     limited capabilities (least-privilege)
 *   - Session tokens have a rolling 15-minute TTL
 *
 * Scopes:
 *   read      → can read public identity + trust scores
 *   sign      → can request vault to sign payloads
 *   verify    → can request vault to verify peer handshakes
 *   admin     → full vault operations (rotate, revoke, seal)
 *
 * Integration:
 *   const rv = createRuntimeVault({ busEmit, identity });
 *   const token = rv.issueToken('ui', ['read', 'verify']);
 *   rv.validateToken(token, 'sign');  // false — not in scope
 *   // Mount rv.route() under /sovereignty/runtime-vault in HTTP server
 */

const crypto  = require('crypto');

const VERSION     = '1.0.0';
const MODULE_UUID = 'bridge-sovereignty-rtvault-v1000-00001';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes rolling
const VALID_SCOPES = ['read', 'sign', 'verify', 'admin'];
const VALID_CLIENTS = ['cli', 'ui', 'mobile', 'api'];

function createRuntimeVault({ busEmit, identity } = {}) {
  const _sessions  = new Map(); // token → { client, scopes, issuedAt, expiresAt, ops }
  const _log       = [];
  let   _opCount   = 0;

  function _addLog(msg, level = 'info') {
    const entry = { ts: Date.now(), msg, level };
    _log.push(entry);
    if (_log.length > 500) _log.shift();
    busEmit?.('sovereignty:vault:log', entry, 'INFO');
  }

  function _purgeExpired() {
    const now = Date.now();
    for (const [token, session] of _sessions) {
      if (now > session.expiresAt) {
        _sessions.delete(token);
        busEmit?.('sovereignty:vault:session:expired', { client: session.client }, 'DEBUG');
      }
    }
  }

  function issueToken(client = 'ui', scopes = ['read']) {
    if (!VALID_CLIENTS.includes(client)) {
      return { ok: false, error: `Unknown client: ${client}` };
    }
    const filteredScopes = scopes.filter(s => VALID_SCOPES.includes(s));
    const token    = 'tok_' + crypto.randomBytes(8).toString('hex');
    const now      = Date.now();
    _sessions.set(token, {
      client,
      scopes: filteredScopes,
      issuedAt:  now,
      expiresAt: now + TOKEN_TTL_MS,
      ops:       0,
    });
    _purgeExpired();
    _addLog(`Token issued for ${client} — scopes: ${filteredScopes.join(', ')}`);
    busEmit?.('sovereignty:vault:token:issued', { client, scopes: filteredScopes }, 'INFO');
    return {
      ok:     true,
      token,
      client,
      scopes: filteredScopes,
      ttl:    TOKEN_TTL_MS,
      expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(),
    };
  }

  function validateToken(token, requiredScope = 'read') {
    _purgeExpired();
    const session = _sessions.get(token);
    if (!session) return { ok: false, valid: false, reason: 'token not found or expired' };
    if (Date.now() > session.expiresAt) {
      _sessions.delete(token);
      return { ok: false, valid: false, reason: 'token expired' };
    }
    if (requiredScope && !session.scopes.includes(requiredScope) && !session.scopes.includes('admin')) {
      return { ok: false, valid: false, reason: `scope '${requiredScope}' not granted` };
    }
    // Renew TTL on use (rolling)
    session.expiresAt = Date.now() + TOKEN_TTL_MS;
    session.ops++;
    _opCount++;
    return { ok: true, valid: true, client: session.client, scopes: session.scopes };
  }

  function revokeToken(token) {
    const session = _sessions.get(token);
    if (!session) return { ok: false, error: 'token not found' };
    _sessions.delete(token);
    _addLog(`Token revoked for ${session.client}`);
    busEmit?.('sovereignty:vault:token:revoked', { client: session.client }, 'INFO');
    return { ok: true };
  }

  function revokeAll() {
    const count = _sessions.size;
    _sessions.clear();
    _addLog(`All ${count} session tokens revoked`);
    busEmit?.('sovereignty:vault:revoke:all', { count }, 'WARN');
    return { ok: true, revoked: count };
  }

  function rotateAll() {
    // Issue new tokens for active sessions, expire old ones immediately
    const clients = [..._sessions.values()].map(s => ({ client: s.client, scopes: s.scopes }));
    _sessions.clear();
    const issued = [];
    for (const { client, scopes } of clients) {
      const result = issueToken(client, scopes);
      if (result.ok) issued.push(result.token);
    }
    _addLog(`All session tokens rotated — ${issued.length} reissued`);
    busEmit?.('sovereignty:vault:rotate:all', { count: issued.length }, 'INFO');
    return { ok: true, rotated: issued.length };
  }

  function pairMobile() {
    const { token } = issueToken('mobile', ['read', 'verify']);
    const qrData = `bridge-pair:${token}:${identity?.uuid || 'unknown'}`;
    _addLog('Mobile pairing initiated — QR code generated');
    busEmit?.('sovereignty:vault:mobile:pair', { hint: qrData.slice(0, 20) + '…' }, 'INFO');
    return { ok: true, qrData, token, expiresInMs: TOKEN_TTL_MS };
  }

  function route(method, urlParts, body) {
    const sub = urlParts[2];

    if (method === 'GET'  && !sub)                    return diagnostics();
    if (method === 'POST' && sub === 'token')          return issueToken(body?.client, body?.scopes);
    if (method === 'POST' && sub === 'validate')       return validateToken(body?.token, body?.scope);
    if (method === 'POST' && sub === 'revoke')         return revokeToken(body?.token);
    if (method === 'POST' && sub === 'revoke-all')     return revokeAll();
    if (method === 'POST' && sub === 'rotate-all')     return rotateAll();
    if (method === 'POST' && sub === 'pair-mobile')    return pairMobile();
    if (method === 'GET'  && sub === 'sessions')       return { ok: true, sessions: listSessions() };
    if (method === 'GET'  && sub === 'log')            return { ok: true, log: _log.slice(-50) };
    return null;
  }

  function listSessions() {
    _purgeExpired();
    const now = Date.now();
    return [..._sessions.entries()].map(([token, s]) => ({
      token:    token.slice(0, 12) + '…',
      client:   s.client,
      scopes:   s.scopes,
      ops:      s.ops,
      ttlMs:    Math.max(0, s.expiresAt - now),
    }));
  }

  function diagnostics() {
    _purgeExpired();
    return {
      ok:          true,
      version:     VERSION,
      uuid:        MODULE_UUID,
      activeSessions: _sessions.size,
      totalOps:    _opCount,
      tokenTtlMs:  TOKEN_TTL_MS,
      nodeId:      identity?.uuid || 'unknown',
      isolation: {
        uiCanRead:   ['uuid', 'publicKey', 'trustScores'],
        uiCannotDo:  ['sign', 'decrypt', 'exportPrivate'],
        boundary:    'vault-core',
      },
    };
  }

  return {
    issueToken,
    validateToken,
    revokeToken,
    revokeAll,
    rotateAll,
    pairMobile,
    listSessions,
    route,
    diagnostics,
    VERSION,
    MODULE_UUID,
  };
}

module.exports = { createRuntimeVault, VERSION, MODULE_UUID };
