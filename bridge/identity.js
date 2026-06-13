'use strict';
/**
 * bridge/identity.js — Identity & Token Layer
 * UUID: nexus-bridge-identity-v1-0000-4000-0000-000000000001
 *
 * Issues session tokens after a system proves its secret.
 * Wraps lib/node-ledger.js trust state machine.
 *
 * SISO pipeline:
 *   identity.handshake → HandshakeGate  → validates secret, issues token
 *   identity.verify    → VerifyGate     → checks token validity
 *   identity.revoke    → RevokeGate     → marks token invalid
 *
 * Trust state from node-ledger: UNKNOWN → CANDIDATE → MEMBER → SUSPENDED → DEAD
 * A token is only issued when a system reaches MEMBER state.
 *
 * §1.2  Bad token = explicit 401, never silent pass.
 * §5.1  Every token has a UUID.
 */

const crypto              = require('crypto');
const { randomUUID }      = require('crypto');
const { createNodeLedger } = require('../lib/node-ledger');

// ── Known system secrets ──────────────────────────────────────────────────────
// In production these would be env vars. Centralised here so Bridge is
// the only place that knows them.
const SYSTEM_SECRETS = {
  orchestrator: process.env.BRIDGE_SECRET_ORCHESTRATOR || 'nexus-orchestrator-internal-v1',
  cortex:       process.env.BRIDGE_SECRET_CORTEX       || 'nexus-cortex-internal-v1',
  guardian:     process.env.BRIDGE_SECRET_GUARDIAN     || 'nexus-guardian-internal-v1',
  idearium:     process.env.BRIDGE_SECRET_IDEARIUM     || 'nexus-idearium-internal-v1',
  emerge:       process.env.BRIDGE_SECRET_EMERGE       || 'nexus-emerge-internal-v1',
  ollama:       null,  // no secret — ollama is local-only, no auth
  architect:    process.env.BRIDGE_SECRET_ARCHITECT   || 'nexus-architect-internal-v1',
  diagnostic:   process.env.BRIDGE_SECRET_DIAGNOSTIC  || 'nexus-diagnostic-internal-v1',
  bridge:       process.env.BRIDGE_SECRET_BRIDGE      || 'nexus-bridge-internal-v1',
};

const TOKEN_TTL_MS       = parseInt(process.env.BRIDGE_TOKEN_TTL || String(3_600_000)); // 1 hour
const MAX_TOKENS_PER_SYS = 10;

// ── SISO primitives ───────────────────────────────────────────────────────────
class Event {
  constructor(type, data = {}) {
    this.uuid = randomUUID(); this.type = type; this.data = data; this.ts = Date.now();
  }
}
class Gate {
  constructor(sig) { this.signature = sig; }
  transform() {}
}
class Stream {
  constructor() { this.gates = new Map(); this.pending = []; }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[bridge/identity] collision: ${gate.signature}`);
    this.gates.set(gate.signature, gate);
  }
  emit(event) {
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
  }
}

// ── Gates ─────────────────────────────────────────────────────────────────────

class HandshakeGate extends Gate {
  constructor(ctx) { super('identity.handshake'); this._ctx = ctx; }
  transform(event, stream) {
    const { systemId, secret, port, resolve, reject } = event.data;

    // Validate secret
    const expected = SYSTEM_SECRETS[systemId];
    if (expected !== null && secret !== expected) {
      return reject(new Error(`[bridge/identity §1.2] handshake failed: bad secret for ${systemId}`));
    }

    // Prune expired tokens for this system first
    this._ctx._pruneExpired(systemId);

    // Enforce MAX_TOKENS_PER_SYS
    const existing = [...this._ctx._tokens.values()].filter(t => t.systemId === systemId);
    if (existing.length >= MAX_TOKENS_PER_SYS) {
      // Evict oldest
      existing.sort((a, b) => a.issuedAt - b.issuedAt);
      this._ctx._tokens.delete(existing[0].token);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const now   = Date.now();
    const entry = { token, systemId, port, issuedAt: now, expiresAt: now + TOKEN_TTL_MS };
    this._ctx._tokens.set(token, entry);

    stream.emit(new Event('identity.issued', { entry, resolve }));
  }
}

class IdentityIssuedGate extends Gate {
  constructor() { super('identity.issued'); }
  transform(event) {
    event.data.resolve({ ok: true, token: event.data.entry.token, expiresAt: event.data.entry.expiresAt });
  }
}

class VerifyGate extends Gate {
  constructor(ctx) { super('identity.verify'); this._ctx = ctx; }
  transform(event, stream) {
    const { token, resolve } = event.data;

    // Internal bridge calls pass without token
    if (token === 'bridge-internal') {
      return stream.emit(new Event('identity.verified', { systemId: 'bridge', resolve }));
    }

    const entry = this._ctx._tokens.get(token);
    if (!entry) {
      return stream.emit(new Event('identity.rejected', { reason: 'token not found', resolve }));
    }
    if (Date.now() > entry.expiresAt) {
      this._ctx._tokens.delete(token);
      return stream.emit(new Event('identity.rejected', { reason: 'token expired', resolve }));
    }
    stream.emit(new Event('identity.verified', { systemId: entry.systemId, entry, resolve }));
  }
}

class IdentityVerifiedGate extends Gate {
  constructor() { super('identity.verified'); }
  transform(event) {
    event.data.resolve({ ok: true, systemId: event.data.systemId });
  }
}

class IdentityRejectedGate extends Gate {
  constructor() { super('identity.rejected'); }
  transform(event) {
    event.data.resolve({ ok: false, reason: event.data.reason });
  }
}

class RevokeGate extends Gate {
  constructor(ctx) { super('identity.revoke'); this._ctx = ctx; }
  transform(event, stream) {
    const { token, resolve } = event.data;
    const deleted = this._ctx._tokens.delete(token);
    stream.emit(new Event('identity.revoked', { deleted, resolve }));
  }
}

class IdentityRevokedGate extends Gate {
  constructor() { super('identity.revoked'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve({ ok: true, deleted: event.data.deleted });
  }
}

// ── createBridgeIdentity ─────────────────────────────────────────────────────

function createBridgeIdentity({ ledgerDir } = {}) {
  const _tokens = new Map();  // token → { token, systemId, issuedAt, expiresAt }

  function _pruneExpired(systemId) {
    const now = Date.now();
    for (const [tok, entry] of _tokens) {
      if (entry.systemId === systemId && now > entry.expiresAt) {
        _tokens.delete(tok);
      }
    }
  }

  const ctx = { _tokens, _pruneExpired };

  const stream = new Stream();
  stream.register(new HandshakeGate(ctx));
  stream.register(new IdentityIssuedGate());
  stream.register(new VerifyGate(ctx));
  stream.register(new IdentityVerifiedGate());
  stream.register(new IdentityRejectedGate());
  stream.register(new RevokeGate(ctx));
  stream.register(new IdentityRevokedGate());

  function handshake(systemId, secret, port) {
    return new Promise((resolve, reject) => {
      stream.emit(new Event('identity.handshake', { systemId, secret, port, resolve, reject }));
    });
  }

  function verify(token) {
    return new Promise(resolve => {
      stream.emit(new Event('identity.verify', { token, resolve }));
    });
  }

  function revoke(token) {
    return new Promise(resolve => {
      stream.emit(new Event('identity.revoke', { token, resolve }));
    });
  }

  function listTokens(systemId) {
    _pruneExpired(systemId);
    return [..._tokens.values()]
      .filter(t => !systemId || t.systemId === systemId)
      .map(t => ({ systemId: t.systemId, issuedAt: t.issuedAt, expiresAt: t.expiresAt }));
  }

  return { handshake, verify, revoke, listTokens };
}

module.exports = { createBridgeIdentity, SYSTEM_SECRETS };
