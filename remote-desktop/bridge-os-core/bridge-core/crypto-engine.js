/**
 * NEXUS Crypto Engine — v1.0.0
 * UUID: crypto-engine-module-v1000-0000-000000000001
 *
 * Standalone cryptographic primitives. Zero external dependencies.
 * Pure Node.js crypto. No opinions about persistence or routing.
 *
 * Consumed by: key-manager.js, snr-filter.js, vault, anything needing real crypto.
 *
 * Primitives:
 *   ECDH P-256          — keypair generation + shared secret derivation
 *   AES-256-GCM         — authenticated encryption / decryption
 *   HKDF-SHA256         — key derivation from shared secret
 *   scrypt              — password-based key derivation
 *   HMAC-SHA256         — message authentication
 *   SHA-256 / SHA-512   — hashing
 *   Random              — cryptographically secure random bytes / UUIDs / tokens
 *   Key wrapping        — encrypt a key with another key (AES-256-GCM)
 *
 * Design axioms:
 *   - Every operation returns a typed result object, never throws silently
 *   - All errors are explicit — { ok: false, error: '...' }
 *   - Keys are never logged or emitted to bus
 *   - Input validation before every operation
 *   - Constant-time comparison for secrets (timingSafeEqual)
 */

'use strict';

const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────
const VERSION     = '1.0.0';
const MODULE_UUID = 'crypto-engine-module-v1000-0000-000000000001';

const ALG = {
  ECDH:    'prime256v1',   // P-256
  AES_GCM: 'aes-256-gcm',
  HMAC:    'sha256',
  HASH256: 'sha256',
  HASH512: 'sha512',
};

const SIZES = {
  IV:       12,   // AES-GCM IV bytes (96-bit, NIST SP 800-38D recommended)
  TAG:      16,   // GCM auth tag bytes
  SALT:     32,   // scrypt salt bytes
  KEY:      32,   // AES-256 key bytes
  HKDF_OUT: 32,   // HKDF output bytes
  TOKEN:    32,   // random token bytes
};

// ─── Result helpers ───────────────────────────────────────────────────────────
const ok  = (data)  => ({ ok: true,  ...data });
const err = (msg, detail = null) => ({ ok: false, error: msg, detail });

// ─── Input guards ─────────────────────────────────────────────────────────────
function requireBuffer(val, name) {
  if (Buffer.isBuffer(val)) return null;
  if (typeof val === 'string') return null;
  return `${name} must be Buffer or hex string`;
}

function toBuffer(val, name) {
  if (Buffer.isBuffer(val)) return { buf: val, err: null };
  if (typeof val === 'string') {
    try { const b = Buffer.from(val, 'hex'); return { buf: b, err: null }; }
    catch { return { buf: null, err: `${name}: invalid hex string` }; }
  }
  return { buf: null, err: `${name}: expected Buffer or hex string, got ${typeof val}` };
}

// ─── CryptoEngine class ───────────────────────────────────────────────────────
class CryptoEngine {
  constructor() {
    this.version    = VERSION;
    this.uuid       = MODULE_UUID;
    this._keyCache  = new Map();
  }

  // ═══════════════════════════════════════════════════════
  // RANDOM
  // ═══════════════════════════════════════════════════════

  randomBytes(bytes = SIZES.TOKEN) {
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > 65536)
      return err('randomBytes: bytes must be integer 1–65536');
    try {
      const buf = crypto.randomBytes(bytes);
      return ok({ hex: buf.toString('hex'), buffer: buf, bytes });
    } catch (e) { return err('randomBytes failed', e.message); }
  }

  randomUUID() {
    try { return ok({ uuid: crypto.randomUUID() }); }
    catch (e) { return err('randomUUID failed', e.message); }
  }

  randomToken(bytes = SIZES.TOKEN) {
    const r = this.randomBytes(bytes);
    if (!r.ok) return r;
    return ok({ token: r.buffer.toString('base64url'), bytes });
  }

  // ═══════════════════════════════════════════════════════
  // HASHING
  // ═══════════════════════════════════════════════════════

  sha256(data) {
    if (data === undefined || data === null) return err('sha256: data required');
    try {
      const hash = crypto.createHash(ALG.HASH256).update(data).digest();
      return ok({ hex: hash.toString('hex'), buffer: hash });
    } catch (e) { return err('sha256 failed', e.message); }
  }

  sha512(data) {
    if (data === undefined || data === null) return err('sha512: data required');
    try {
      const hash = crypto.createHash(ALG.HASH512).update(data).digest();
      return ok({ hex: hash.toString('hex'), buffer: hash });
    } catch (e) { return err('sha512 failed', e.message); }
  }

  safeEqual(a, b) {
    try {
      const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a), 'utf8');
      const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
      if (ba.length !== bb.length) return ok({ equal: false });
      return ok({ equal: crypto.timingSafeEqual(ba, bb) });
    } catch (e) { return err('safeEqual failed', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // HMAC
  // ═══════════════════════════════════════════════════════

  hmac(key, data) {
    if (!key) return err('hmac: key required');
    if (data === undefined || data === null) return err('hmac: data required');
    try {
      const mac = crypto.createHmac(ALG.HMAC, key).update(data).digest();
      return ok({ hex: mac.toString('hex'), buffer: mac });
    } catch (e) { return err('hmac failed', e.message); }
  }

  hmacVerify(key, data, expectedHex) {
    const computed = this.hmac(key, data);
    if (!computed.ok) return computed;
    const expected = Buffer.from(expectedHex, 'hex');
    const equal    = this.safeEqual(computed.buffer, expected);
    if (!equal.ok) return equal;
    return ok({ valid: equal.equal });
  }

  // ═══════════════════════════════════════════════════════
  // AES-256-GCM
  // ═══════════════════════════════════════════════════════

  encrypt(key, plaintext, aad = null) {
    const { buf: keyBuf, err: keyErr } = toBuffer(key, 'key');
    if (keyErr) return err(keyErr);
    if (keyBuf.length !== SIZES.KEY) return err(`encrypt: key must be ${SIZES.KEY} bytes, got ${keyBuf.length}`);
    if (plaintext === undefined || plaintext === null) return err('encrypt: plaintext required');

    try {
      const iv      = crypto.randomBytes(SIZES.IV);
      const cipher  = crypto.createCipheriv(ALG.AES_GCM, keyBuf, iv, { authTagLength: SIZES.TAG });
      if (aad) {
        const { buf: aadBuf } = toBuffer(aad, 'aad');
        if (aadBuf) cipher.setAAD(aadBuf);
      }
      const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
      const enc   = Buffer.concat([cipher.update(input), cipher.final()]);
      const tag   = cipher.getAuthTag();
      return ok({
        iv:         iv.toString('hex'),
        ciphertext: enc.toString('hex'),
        tag:        tag.toString('hex'),
        algorithm:  ALG.AES_GCM,
      });
    } catch (e) { return err('encrypt failed', e.message); }
  }

  decrypt(key, payload, aad = null) {
    const { buf: keyBuf, err: keyErr } = toBuffer(key, 'key');
    if (keyErr) return err(keyErr);
    if (keyBuf.length !== SIZES.KEY) return err(`decrypt: key must be ${SIZES.KEY} bytes`);
    if (!payload || !payload.iv || !payload.ciphertext || !payload.tag)
      return err('decrypt: payload must have { iv, ciphertext, tag }');

    try {
      const iv         = Buffer.from(payload.iv, 'hex');
      const ciphertext = Buffer.from(payload.ciphertext, 'hex');
      const tag        = Buffer.from(payload.tag, 'hex');
      const decipher   = crypto.createDecipheriv(ALG.AES_GCM, keyBuf, iv, { authTagLength: SIZES.TAG });
      decipher.setAuthTag(tag);
      if (aad) {
        const { buf: aadBuf } = toBuffer(aad, 'aad');
        if (aadBuf) decipher.setAAD(aadBuf);
      }
      const plainBuf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return ok({ plaintext: plainBuf.toString('utf8'), buffer: plainBuf });
    } catch (e) {
      const isAuthFail = e.message.includes('auth') || e.message.includes('Unsupported state');
      return err(isAuthFail ? 'decrypt: authentication failed (wrong key or tampered data)' : 'decrypt failed', e.message);
    }
  }

  encryptJSON(key, obj, aad = null) {
    try { return this.encrypt(key, JSON.stringify(obj), aad); }
    catch (e) { return err('encryptJSON: serialisation failed', e.message); }
  }

  decryptJSON(key, payload, aad = null) {
    const r = this.decrypt(key, payload, aad);
    if (!r.ok) return r;
    try { return ok({ value: JSON.parse(r.plaintext) }); }
    catch (e) { return err('decryptJSON: parse failed', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // KEY WRAPPING
  // ═══════════════════════════════════════════════════════

  wrapKey(wrappingKey, keyToWrap) {
    return this.encrypt(wrappingKey, keyToWrap);
  }

  unwrapKey(wrappingKey, wrappedPayload) {
    const r = this.decrypt(wrappingKey, wrappedPayload);
    if (!r.ok) return r;
    const pt = r.plaintext;
    if (/^[0-9a-f]+$/i.test(pt) && pt.length % 2 === 0) {
      const keyBuf = Buffer.from(pt, 'hex');
      return ok({ key: keyBuf, hex: pt });
    }
    return ok({ key: r.buffer, hex: r.buffer.toString('hex') });
  }

  // ═══════════════════════════════════════════════════════
  // ECDH P-256
  // ═══════════════════════════════════════════════════════

  generateECDH() {
    try {
      const ecdh = crypto.createECDH(ALG.ECDH);
      ecdh.generateKeys();
      const privateKey = ecdh.getPrivateKey();
      const publicKey  = ecdh.getPublicKey();
      return ok({
        privateKey: privateKey.toString('hex'),
        publicKey:  publicKey.toString('hex'),
        curve:      ALG.ECDH,
        created:    Date.now(),
      });
    } catch (e) { return err('generateECDH failed', e.message); }
  }

  computeSharedSecret(privateKey, peerPublicKey) {
    const { buf: privBuf, err: privErr } = toBuffer(privateKey, 'privateKey');
    if (privErr) return err(privErr);
    const { buf: pubBuf, err: pubErr }   = toBuffer(peerPublicKey, 'peerPublicKey');
    if (pubErr) return err(pubErr);
    try {
      const ecdh = crypto.createECDH(ALG.ECDH);
      ecdh.setPrivateKey(privBuf);
      const secret = ecdh.computeSecret(pubBuf);
      return ok({ sharedSecret: secret.toString('hex'), bytes: secret.length });
    } catch (e) { return err('computeSharedSecret failed', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // HKDF
  // ═══════════════════════════════════════════════════════

  hkdf(ikm, info = 'nexus-bridge', salt = null, length = SIZES.HKDF_OUT) {
    const { buf: ikmBuf, err: ikmErr } = toBuffer(ikm, 'ikm');
    if (ikmErr) return err(ikmErr);
    if (!Number.isInteger(length) || length < 1 || length > 255 * 32)
      return err('hkdf: length must be integer 1–8160');

    try {
      const saltBuf = salt
        ? (Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex'))
        : Buffer.alloc(32, 0);
      const infoBuf = typeof info === 'string' ? Buffer.from(info, 'utf8') : info;

      const prk = crypto.createHmac('sha256', saltBuf).update(ikmBuf).digest();
      const n   = Math.ceil(length / 32);
      const okm = Buffer.alloc(n * 32);
      let t     = Buffer.alloc(0);
      for (let i = 0; i < n; i++) {
        t = crypto.createHmac('sha256', prk).update(Buffer.concat([t, infoBuf, Buffer.from([i + 1])])).digest();
        t.copy(okm, i * 32);
      }
      const key = okm.slice(0, length);
      return ok({ key: key.toString('hex'), buffer: key, bytes: length });
    } catch (e) { return err('hkdf failed', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // scrypt
  // ═══════════════════════════════════════════════════════

  scrypt(password, salt = null, params = {}) {
    if (typeof password !== 'string' || !password)
      return err('scrypt: password must be non-empty string');
    try {
      const saltBuf = salt
        ? (Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'hex'))
        : crypto.randomBytes(SIZES.SALT);

      const N      = params.N      || 16384;
      const r      = params.r      || 8;
      const p      = params.p      || 1;
      const keyLen = params.keyLen || SIZES.KEY;
      const maxmem = params.maxmem || 64 * 1024 * 1024;

      const key = crypto.scryptSync(password, saltBuf, keyLen, { N, r, p, maxmem });
      return ok({
        key:    key.toString('hex'),
        buffer: key,
        salt:   saltBuf.toString('hex'),
        params: { N, r, p, keyLen },
      });
    } catch (e) { return err('scrypt failed', e.message); }
  }

  // ═══════════════════════════════════════════════════════
  // SESSION KEY DERIVATION
  // ═══════════════════════════════════════════════════════

  deriveSessionKey(privateKey, peerPublicKey, context = 'nexus-bridge-session') {
    const secret = this.computeSharedSecret(privateKey, peerPublicKey);
    if (!secret.ok) return secret;
    const derived = this.hkdf(secret.sharedSecret, context);
    if (!derived.ok) return derived;
    return ok({
      sessionKey: derived.key,
      context,
      algorithm:  'ECDH-P256-HKDF-SHA256-AES-256-GCM',
    });
  }

  // ═══════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════

  generateKey() {
    return this.randomBytes(SIZES.KEY);
  }

  generateTURNCredential(secret, ttlSeconds = 86400) {
    if (!secret) return err('generateTURNCredential: secret required');
    try {
      const expiry   = Math.floor(Date.now() / 1000) + ttlSeconds;
      const username = `${expiry}:nexus-bridge`;
      const mac      = this.hmac(secret, username);
      if (!mac.ok) return mac;
      const password = mac.buffer.toString('base64');
      return ok({ username, password, expiry, ttlSeconds });
    } catch (e) { return err('generateTURNCredential failed', e.message); }
  }

  verifyTURNCredential(username) {
    try {
      const expiry = parseInt(username.split(':')[0], 10);
      const now    = Math.floor(Date.now() / 1000);
      return ok({ valid: expiry > now, expiry, remaining: Math.max(0, expiry - now) });
    } catch (e) { return err('verifyTURNCredential failed', e.message); }
  }

  health() {
    const checks = {};
    try { const r = this.randomBytes(32); checks.random = r.ok; } catch { checks.random = false; }
    try {
      const k = this.generateKey();
      const e = this.encrypt(k.buffer, 'test');
      const d = this.decrypt(k.buffer, e);
      checks.aes_gcm = d.ok && d.plaintext === 'test';
    } catch { checks.aes_gcm = false; }
    try { const kp = this.generateECDH(); checks.ecdh = kp.ok && kp.privateKey.length === 64; } catch { checks.ecdh = false; }
    try { const h = this.hmac('key', 'data'); checks.hmac = h.ok && h.hex.length === 64; } catch { checks.hmac = false; }
    try { const s = this.sha256('test'); checks.sha256 = s.ok && s.hex.length === 64; } catch { checks.sha256 = false; }
    try { const sc = this.scrypt('password', null, { N: 1024, r: 1, p: 1, keyLen: 32 }); checks.scrypt = sc.ok && sc.key.length === 64; } catch { checks.scrypt = false; }
    const allOk = Object.values(checks).every(Boolean);
    return ok({ allOk, checks, version: VERSION, uuid: MODULE_UUID });
  }
}

CryptoEngine.VERSION     = VERSION;
CryptoEngine.MODULE_UUID = MODULE_UUID;
CryptoEngine.ALG         = ALG;
CryptoEngine.SIZES       = SIZES;

const _instance = new CryptoEngine();
module.exports              = _instance;
module.exports.CryptoEngine = CryptoEngine;
module.exports.VERSION      = VERSION;
module.exports.MODULE_UUID  = MODULE_UUID;
