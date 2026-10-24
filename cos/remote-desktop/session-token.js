'use strict';
/**
 * session-token.js — closes remote-desktop.spec phase 2 gap:
 * `session_token_issuance` (uses `secrets_keystore_module` — see notes).
 *
 * This is the first real module of remote-desktop, not a demo. It's the
 * gate signal.js sits behind: no viewer joins a session without a token
 * this module issued and still considers valid.
 *
 * Boundary rules:
 *   - Only requires bridge-os-core's two public entrypoints
 *     (bridge-identity, bridge-contracts). Never reaches past them.
 *   - Every state change (issued / verified / rejected / revoked /
 *     expired) is an event on `bus`, not a return value read once and
 *     discarded. signal.js subscribes; it doesn't poll this module's
 *     internal Map.
 *   - Every object this module either receives from core or hands back
 *     to a caller is shape-checked through contracts.js first.
 */

const crypto = require('crypto');
const path = require('path');
const { EventEmitter } = require('events');

const { loadOrInit } = require('./bridge-os-core/bridge-identity/index');
const { validate: coreValidate } = require('./bridge-os-core/bridge-contracts/index');
const { validate } = require('./contracts');

const TOKEN_TTL_MS = 5 * 60 * 1000; // spec doesn't fix a TTL — 5min matches session_token_issuance's implied short-lived intent

function createSessionAuthority({ dataDir = path.join(process.cwd(), 'data') } = {}) {
  const bus = new EventEmitter();
  const tokens = new Map(); // token -> { sessionId, issuedTo, expiresAt }
  let hostIdentity = null;

  function emit(type, sessionId, extra = {}) {
    const evt = { type, sessionId, ts: Date.now(), ...extra };
    validate('token-event', evt);
    bus.emit(type, evt);
    bus.emit('*', evt); // single subscription point for anyone that wants everything
  }

  async function init() {
    hostIdentity = await loadOrInit({ dataDir });
    validate('core-identity', hostIdentity);
    // Reuse core's own contract gate rather than re-deriving the check —
    // this is the literal seam described as "fed through interaction
    // contract": core's validator is called, core's internals are not.
    coreValidate('identity-to-IME', require('./bridge-os-core/bridge-identity/index'));
    emit('authority:ready', null, { uuid: hostIdentity.uuid });
    return hostIdentity;
  }

  function issueToken(sessionId) {
    if (!hostIdentity) throw new Error('session-token: init() must complete before issueToken()');
    const record = {
      token: crypto.randomBytes(24).toString('hex'),
      sessionId,
      issuedTo: hostIdentity.uuid,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
    validate('session-token', record);
    tokens.set(record.token, record);
    emit('token:issued', sessionId);
    return record;
  }

  function verifyToken(token, sessionId) {
    const record = tokens.get(token);
    if (!record) { emit('token:rejected', sessionId, { reason: 'unknown' }); return false; }
    if (record.sessionId !== sessionId) { emit('token:rejected', sessionId, { reason: 'session_mismatch' }); return false; }
    if (Date.now() > record.expiresAt) {
      tokens.delete(token);
      emit('token:rejected', sessionId, { reason: 'expired' });
      return false;
    }
    emit('token:verified', sessionId);
    return true;
  }

  function revoke(token) {
    const record = tokens.get(token);
    if (!record) return false;
    tokens.delete(token);
    emit('token:revoked', record.sessionId);
    return true;
  }

  // Passive expiry sweep — keeps the token map from growing unbounded
  // across a long-lived signaling server. Emits the same event a lookup
  // would, so subscribers see one consistent 'expired' signal either way.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [token, record] of tokens) {
      if (now > record.expiresAt) {
        tokens.delete(token);
        emit('token:expired', record.sessionId);
      }
    }
  }, 30_000);
  sweep.unref?.();

  return {
    init,
    issueToken,
    verifyToken,
    revoke,
    on: bus.on.bind(bus),
    identity: () => hostIdentity,
    _stop: () => clearInterval(sweep), // test/shutdown hook only
  };
}

module.exports = { createSessionAuthority };
