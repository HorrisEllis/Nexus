/**
 * bridge-nexus-pipe/index.js  — STUB
 *
 * Full implementation pending. This stub exports the symbols required by
 * bridge-adversarial.js so the adversarial harness can load and run the
 * offline sections (1–13) and the live HTTP sections (14–17) without error.
 *
 * When bridge-nexus-pipe is implemented, this file is replaced in its entirety.
 */

const crypto = require('crypto');

// ── State machine ─────────────────────────────────────────────────────────────

const STATE = Object.freeze({
  BOOT_WAIT:   'BOOT_WAIT',
  SEALED:      'SEALED',
  MAGNET_LIVE: 'MAGNET_LIVE',
  HANDSHAKING: 'HANDSHAKING',
  ACTIVE:      'ACTIVE',
  FAILED:      'FAILED',
  CLOSED:      'CLOSED',
});

const FRAME_TYPE = Object.freeze({
  DATA:    'DATA',
  CTRL:    'CTRL',
  PING:    'PING',
  PONG:    'PONG',
});

const MAGNET_TTL_MS = 30_000;

// ── Legal transition map ──────────────────────────────────────────────────────

const TRANSITIONS = {
  [STATE.BOOT_WAIT]:   new Set([STATE.SEALED, STATE.FAILED]),
  [STATE.SEALED]:      new Set([STATE.MAGNET_LIVE, STATE.FAILED]),
  [STATE.MAGNET_LIVE]: new Set([STATE.HANDSHAKING, STATE.FAILED]),
  [STATE.HANDSHAKING]: new Set([STATE.ACTIVE, STATE.FAILED]),
  [STATE.ACTIVE]:      new Set([STATE.CLOSED, STATE.FAILED]),
  [STATE.FAILED]:      new Set(),
  [STATE.CLOSED]:      new Set(),
};

// ── Crypto helpers (thin wrappers — real impl in bridge-nexus-pipe proper) ────

function generateEphemeralKeypair() {
  const kp = crypto.generateKeyPairSync('x25519');
  const publicKeyB64 = kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return { privateKey: kp.privateKey, publicKeyB64 };
}

function deriveSharedSecret(privateKey, remotePubKeyB64) {
  const pub = crypto.createPublicKey({
    key: Buffer.from(remotePubKeyB64, 'base64'),
    type: 'spki', format: 'der',
  });
  return crypto.diffieHellman({ privateKey, publicKey: pub });
}

function deriveSessionKeys(sharedSecret, uuidA, uuidB) {
  const [u1, u2] = [uuidA, uuidB].sort();
  const info  = Buffer.from(`bridge-nexus-pipe-v1:${u1}:${u2}`);
  const salt  = crypto.createHash('sha256').update(u1 + u2).digest();
  const raw   = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, info, 96));
  // edc52219 mask application
  const mask  = computeEdcMask(u1, u2);
  const kData = applyEdcMask(raw.slice(0, 32), mask);
  const kCtrl = applyEdcMask(raw.slice(32, 64), mask);
  const kMac  = applyEdcMask(raw.slice(64, 96), mask);
  return { kData, kCtrl, kMac };
}

function computeEdcMask(u1, u2) {
  return crypto.createHash('sha256').update(`edc52219:${u1}:${u2}`).digest().slice(0, 32);
}

function applyEdcMask(key, mask) {
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = key[i] ^ mask[i];
  return out;
}

function encryptData(key, plaintext) {
  const iv  = crypto.randomBytes(12);
  const c   = crypto.createCipheriv('chacha20-poly1305', key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(plaintext))), c.final()]);
  const tag = c.getAuthTag();
  return { iv: iv.toString('base64'), enc: enc.toString('base64'), tag: tag.toString('base64') };
}

function decryptData(key, payload) {
  const iv  = Buffer.from(payload.iv, 'base64');
  const enc = Buffer.from(payload.enc, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const d   = crypto.createDecipheriv('chacha20-poly1305', key, iv, { authTagLength: 16 });
  d.setAuthTag(tag);
  const pt  = Buffer.concat([d.update(enc), d.final()]);
  return JSON.parse(pt.toString());
}

function encryptCtrl(key, plaintext) { return encryptData(key, plaintext); }
function decryptCtrl(key, payload)   { return decryptData(key, payload); }

function signHmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

function verifyHmac(key, data, sig) {
  const expected = crypto.createHmac('sha256', key).update(data).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'base64'), Buffer.from(sig, 'base64'));
  } catch { return false; }
}

function generateMagnetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function buildMagnetUri({ pipeId, token, host, port }) {
  return `nexus://${pipeId}?t=${token}&h=${host}&p=${port}`;
}

// ── NexusPipeSession ──────────────────────────────────────────────────────────

class NexusPipeSession {
  constructor({ pipeId, identity, cobalt, gate, ime, busEmit, causal, snRouter, direction, threatGetRegime }) {
    this._pipeId    = pipeId;
    this._identity  = identity;
    this._state     = STATE.BOOT_WAIT;
    this._direction = direction;
    this._busEmit   = busEmit ?? (() => {});
    this._threatGetRegime = threatGetRegime ?? (() => 'CLEAR');
    this._ephemeral = null;
    this._keys      = null;
    this._magnet    = null;
    this._openedAt  = null;
    this._seenNonces = new Set();
  }

  _transition(to, reason) {
    const allowed = TRANSITIONS[this._state];
    if (!allowed || !allowed.has(to)) {
      throw new Error(`Illegal transition: ${this._state} → ${to} (reason: ${reason})`);
    }
    this._state = to;
  }

  _fail(reason) {
    this._state = STATE.FAILED;
  }

  async seal() {
    if (this._state !== STATE.BOOT_WAIT) {
      throw new Error(`seal() out of sequence — state is ${this._state}`);
    }
    this._ephemeral = generateEphemeralKeypair();
    this._transition(STATE.SEALED, 'seal');
  }

  generateMagnet({ host, port }) {
    if (this._state !== STATE.SEALED) {
      throw new Error(`generateMagnet() out of sequence — state is ${this._state}`);
    }
    const token = generateMagnetToken();
    const expiresAt = Date.now() + MAGNET_TTL_MS;
    this._magnet = { token, host, port, expiresAt, used: false };
    this._transition(STATE.MAGNET_LIVE, 'generateMagnet');
    return { token, uri: buildMagnetUri({ pipeId: this._pipeId, token, host, port }) };
  }

  validateMagnetToken(token) {
    if (!this._magnet) return { ok: false, reason: 'no magnet' };
    if (typeof token !== 'string' || token.length !== this._magnet.token.length) {
      return { ok: false, reason: 'invalid token (length mismatch)' };
    }
    try {
      if (!crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(this._magnet.token, 'hex'))) {
        return { ok: false, reason: 'invalid token' };
      }
    } catch { return { ok: false, reason: 'invalid token' }; }
    if (this._magnet.used) return { ok: false, reason: 'token already used' };
    if (Date.now() > this._magnet.expiresAt) return { ok: false, reason: 'token expired' };
    this._magnet.used = true;
    return { ok: true };
  }

  async receiveHandshake({ token, identity, ecdhPubKey, cobaltSeal, cobaltHead }) {
    if (this._state !== STATE.MAGNET_LIVE) {
      return { ok: false, reason: `not in MAGNET_LIVE state (current: ${this._state})` };
    }
    const tv = this.validateMagnetToken(token);
    if (!tv.ok) return { ok: false, reason: `token: ${tv.reason}` };

    // Minimal handshake — derive session keys from ECDH
    try {
      if (!ecdhPubKey || !identity?.uuid) {
        this._transition(STATE.FAILED, 'bad handshake');
        return { ok: false, reason: 'handshake missing required fields' };
      }
      const ss = deriveSharedSecret(this._ephemeral.privateKey, ecdhPubKey);
      this._keys = deriveSessionKeys(ss, this._identity.uuid, identity.uuid);
      this._openedAt = Date.now();
      this._transition(STATE.HANDSHAKING, 'receiveHandshake');
      this._transition(STATE.ACTIVE, 'handshakeComplete');
      return { ok: true };
    } catch (e) {
      this._fail(e.message);
      return { ok: false, reason: e.message };
    }
  }

  send(payload, frameType) {
    if (this._state !== STATE.ACTIVE) throw new Error(`send() requires ACTIVE state (current: ${this._state})`);
    const nonce = crypto.randomBytes(8).toString('hex');
    const ts    = Date.now();
    return {
      type:    frameType,
      nonce,
      ts,
      payload: encryptData(this._keys.kData, { ...payload, ts }),
    };
  }

  recv(frame) {
    if (this._state !== STATE.ACTIVE) return { ok: false, reason: 'pipe not ACTIVE' };
    const { nonce, ts, payload } = frame;
    const now = Date.now();
    if (Math.abs(now - ts) > 60_000) return { ok: false, reason: 'timestamp outside ±60s window' };
    if (this._seenNonces.has(nonce)) return { ok: false, reason: 'replay attack: nonce already seen' };
    this._seenNonces.add(nonce);
    try {
      const pt = decryptData(this._keys.kData, payload);
      return { ok: true, payload: pt };
    } catch (e) {
      return { ok: false, reason: `decryption failed: ${e.message}` };
    }
  }
}

// ── NexusPipeManager ──────────────────────────────────────────────────────────

function createNexusPipeManager({ busEmit, identity }) {
  const pipes = new Map();

  async function route(method, urlParts, body) {
    if (method === 'POST' && urlParts[1] === 'handshake') {
      const { token, identity: peerIdentity, ecdhPubKey, cobaltSeal, cobaltHead } = body ?? {};
      if (!token || !peerIdentity || !ecdhPubKey) {
        return { ok: false, error: 'required fields: token, identity, ecdhPubKey' };
      }
      return { ok: false, error: 'no active pipe for handshake' };
    }
    return { ok: false, error: 'unknown route' };
  }

  return { route, pipes };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  NexusPipeSession,
  createNexusPipeManager,
  STATE,
  FRAME_TYPE,
  MAGNET_TTL_MS,
  generateEphemeralKeypair,
  deriveSharedSecret,
  deriveSessionKeys,
  computeEdcMask,
  applyEdcMask,
  encryptData,
  decryptData,
  encryptCtrl,
  decryptCtrl,
  signHmac,
  verifyHmac,
  generateMagnetToken,
  buildMagnetUri,
};