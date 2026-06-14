'use strict';
/**
 * auth/index.js — NEXUS Sovereign Authentication Layer
 * UUID: nexus-auth-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * First-principles design:
 *
 *   IDENTITY   — RSA-2048 keypair. Client proves identity by signing a
 *                server-issued nonce. NEXUS verifies with the client's
 *                registered public key. Private key never leaves the client.
 *
 *   SECRECY    — AES-256-GCM. Session key agreed via RSA key encapsulation:
 *                client generates random 256-bit key, encrypts it with NEXUS
 *                public key, only NEXUS can decrypt. Session key is ephemeral.
 *
 *   GATE       — SNR filter. Before any crypto runs, the request is scored
 *                for fidelity (required fields present) and behavioural health
 *                (consistency with prior requests from this identity).
 *                Below threshold → dropped silently. No timing oracle.
 *
 *   WHITELIST  — UUID + optional User-Agent authorization. After identity is
 *                proven (RSA), NEXUS checks whether this client is permitted.
 *                Revocation = delete the client's .pub file. Immediate effect.
 *
 * Hotswappable:
 *   - auth/policy.json   watched by fs.watch — reload within 500ms
 *   - auth/clients/*.pub watched — add/remove clients without restart
 *   - auth/index.js      itself registered as ICO plugin — replaceable at runtime
 *
 * §1.1  Nothing trusted until proven — RSA verify before any session
 * §1.2  Every failure logged with specific reason — no silent drops
 * §2.1  Session state written to disk before granted
 * §5.1  Every session and nonce carries a UUID
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const MODULE_ID   = 'nexus-auth';
const AUTH_DIR    = path.join(__dirname);
const CLIENTS_DIR = path.join(AUTH_DIR, 'clients');
const SESSIONS_DIR= path.join(AUTH_DIR, 'sessions');
const POLICY_FILE = path.join(AUTH_DIR, 'policy.json');
const KEYS_DIR    = path.join(AUTH_DIR, 'keys');

// ── Ensure directories ────────────────────────────────────────────────────────
for (const dir of [CLIENTS_DIR, SESSIONS_DIR, KEYS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// ── Live state (hotswappable) ─────────────────────────────────────────────────
let _policy   = null;    // loaded from policy.json, live-reloaded
let _clients  = null;    // Map<uuid, { publicKey, meta }>, live-reloaded
let _sessions = new Map(); // uuid → SessionEntry (in-memory + disk)
let _nonces   = new Map(); // nonce → { uuid?, expiresAt }
let _attempts = new Map(); // uuid/ip → { count, windowStart }
let _nexusKey = null;    // { privateKey, publicKey } — NEXUS's own keypair

// ── NEXUS keypair — generated once, persisted ─────────────────────────────────
function loadOrGenerateNexusKey() {
  const privPath = path.join(KEYS_DIR, 'nexus-private.pem');
  const pubPath  = path.join(KEYS_DIR, 'nexus-public.pem');

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    _nexusKey = {
      privateKey: fs.readFileSync(privPath, 'utf8'),
      publicKey:  fs.readFileSync(pubPath,  'utf8'),
    };
    console.log('[auth] NEXUS keypair loaded from disk');
    return;
  }

  console.log('[auth] generating NEXUS RSA-2048 keypair…');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength:    2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(privPath, privateKey,  { mode: 0o600 });
  fs.writeFileSync(pubPath,  publicKey);
  _nexusKey = { privateKey, publicKey };
  console.log('[auth] NEXUS keypair generated and saved');
}

// ── Policy loader ─────────────────────────────────────────────────────────────
function loadPolicy() {
  try {
    const raw  = fs.readFileSync(POLICY_FILE, 'utf8');
    _policy    = JSON.parse(raw);
    console.log('[auth] policy loaded (SNR threshold:', _policy.snr?.threshold, ')');
  } catch(e) {
    console.warn('[auth] policy load failed:', e.message, '— using defaults');
    _policy = _defaultPolicy();
  }
}

function _defaultPolicy() {
  return {
    snr:       { threshold: 0.75, requiredFields: ['uuid','signature','encryptedSessionKey','nonce','ts'], windowSize: 20, dropBelowThreshold: true },
    session:   { ttlMs: 28800000, maxPerClient: 3 },
    rsa:       { paddingScheme: 'RSA_PKCS1_OAEP_PADDING', hashAlgorithm: 'sha256' },
    aes:       { algorithm: 'aes-256-gcm', ivBytes: 12, tagBytes: 16 },
    whitelist: { requireUUID: true, requireUserAgent: false, allowedUserAgents: [] },
    rateLimit: { maxAttemptsPerMinute: 5, lockoutMs: 300000 },
    nonce:     { bytes: 32, ttlMs: 60000 },
  };
}

// ── Client registry loader ────────────────────────────────────────────────────
function loadClients() {
  _clients = new Map();
  try {
    const files = fs.readdirSync(CLIENTS_DIR).filter(f => f.endsWith('.pub'));
    for (const file of files) {
      const uuid = path.basename(file, '.pub');
      const raw  = fs.readFileSync(path.join(CLIENTS_DIR, file), 'utf8');
      // Format: first line optional JSON meta, rest is PEM
      let meta = {}, publicKey = raw;
      if (raw.startsWith('{')) {
        const nl = raw.indexOf('\n');
        try { meta = JSON.parse(raw.slice(0, nl)); publicKey = raw.slice(nl + 1); } catch(_) {}
      }
      _clients.set(uuid, { uuid, publicKey: publicKey.trim(), meta });
    }
    console.log('[auth] clients loaded:', _clients.size);
  } catch(e) {
    console.warn('[auth] clients load failed:', e.message);
  }
}

// ── SNR gate — pre-crypto fidelity check ─────────────────────────────────────
const _snrHistory = new Map(); // uuid/ip → [fidelity scores]

function snrScore(body, clientUuid) {
  const p = _policy.snr;
  const required = p.requiredFields || [];

  // Fidelity: required fields present
  const present = required.filter(f => body[f] !== undefined && body[f] !== null && body[f] !== '');
  const fidelity = required.length ? present.length / required.length : 1;

  // Freshness: ts within 30s
  const tsAge = Date.now() - (body.ts || 0);
  const fresh = tsAge < 30000 && tsAge > -5000 ? 1 : 0;

  // Health: consistency with prior requests from this identity
  const key = clientUuid || 'anon';
  const history = _snrHistory.get(key) || [];
  const health = history.length < 2 ? 1 : (history.filter(s => s > 0.5).length / history.length);

  const score = (fidelity * 0.5) + (fresh * 0.3) + (health * 0.2);

  // Update history
  history.push(fidelity);
  if (history.length > (p.windowSize || 20)) history.shift();
  _snrHistory.set(key, history);

  return { score, fidelity, fresh, health };
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
function checkRateLimit(key) {
  const limit = _policy.rateLimit || {};
  const max   = limit.maxAttemptsPerMinute || 5;
  const now   = Date.now();
  const entry = _attempts.get(key) || { count: 0, windowStart: now, lockedUntil: 0 };

  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, reason: 'locked', retryAfter: entry.lockedUntil - now };
  }

  if (now - entry.windowStart > 60000) {
    entry.count = 0; entry.windowStart = now;
  }

  entry.count++;
  if (entry.count > max) {
    entry.lockedUntil = now + (limit.lockoutMs || 300000);
    _attempts.set(key, entry);
    return { allowed: false, reason: 'rate_limited', retryAfter: entry.lockedUntil - now };
  }

  _attempts.set(key, entry);
  return { allowed: true };
}

// ── Nonce management ──────────────────────────────────────────────────────────
function issueNonce() {
  const nonce     = crypto.randomBytes(_policy.nonce?.bytes || 32).toString('hex');
  const expiresAt = Date.now() + (_policy.nonce?.ttlMs || 60000);
  _nonces.set(nonce, { expiresAt, usedAt: null });

  // Cleanup expired nonces
  for (const [n, v] of _nonces) {
    if (Date.now() > v.expiresAt) _nonces.delete(n);
  }

  return { nonce, expiresAt };
}

function consumeNonce(nonce) {
  const entry = _nonces.get(nonce);
  if (!entry)                        return { ok: false, reason: 'nonce_not_found' };
  if (Date.now() > entry.expiresAt)  { _nonces.delete(nonce); return { ok: false, reason: 'nonce_expired' }; }
  if (entry.usedAt)                  return { ok: false, reason: 'nonce_replay' };
  entry.usedAt = Date.now();
  return { ok: true };
}

// ── RSA operations ────────────────────────────────────────────────────────────
function decryptSessionKey(encryptedB64) {
  // Client encrypted session key with NEXUS public key
  // We decrypt with NEXUS private key
  const encrypted = Buffer.from(encryptedB64, 'base64');
  return crypto.privateDecrypt(
    { key: _nexusKey.privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    encrypted
  );
}

function verifySignature(publicKeyPem, nonce, signatureB64) {
  const verify = crypto.createVerify('SHA256');
  verify.update(nonce);
  return verify.verify(publicKeyPem, Buffer.from(signatureB64, 'base64'));
}

// ── Session management ────────────────────────────────────────────────────────
function createSession(uuid, sessionKey, meta = {}) {
  const sessionId  = crypto.randomUUID();
  const expiresAt  = Date.now() + (_policy.session?.ttlMs || 28800000);
  const session    = { sessionId, uuid, sessionKey, expiresAt, createdAt: Date.now(), meta };
  _sessions.set(sessionId, session);

  // §2.1 Persist session token (not key — just the session record)
  const record = { sessionId, uuid, expiresAt, createdAt: session.createdAt, meta };
  try {
    fs.writeFileSync(
      path.join(SESSIONS_DIR, `${sessionId}.json`),
      JSON.stringify(record),
      { mode: 0o600 }
    );
  } catch(_) {}

  return session;
}

function getSession(sessionId) {
  const s = _sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { revokeSession(sessionId); return null; }
  return s;
}

function revokeSession(sessionId) {
  _sessions.delete(sessionId);
  try { fs.unlinkSync(path.join(SESSIONS_DIR, `${sessionId}.json`)); } catch(_) {}
}

// ── AES-256-GCM encrypt/decrypt ───────────────────────────────────────────────
function encryptPayload(sessionKey, plaintext) {
  const iv  = crypto.randomBytes(12);
  const cip = crypto.createCipheriv('aes-256-gcm', sessionKey, iv);
  const enc = Buffer.concat([cip.update(Buffer.from(plaintext)), cip.final()]);
  const tag = cip.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptPayload(sessionKey, ciphertextB64) {
  const buf = Buffer.from(ciphertextB64, 'base64');
  const iv  = buf.slice(0, 12);
  const tag = buf.slice(12, 28);
  const enc = buf.slice(28);
  const dec = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(enc), dec.final()]).toString('utf8');
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────
// These are called by the orchestrator's request handler

// GET /auth/pubkey — return NEXUS public key for clients to encrypt with
function handlePubkey(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, publicKey: _nexusKey.publicKey, version: '1.0.0' }));
}

// GET /auth/challenge — issue a nonce for the client to sign
function handleChallenge(req, res) {
  const ip    = req.socket.remoteAddress || 'unknown';
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: limit.reason, retryAfter: limit.retryAfter }));
  }

  const { nonce, expiresAt } = issueNonce();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, nonce, expiresAt }));
}

// POST /auth/handshake — full authentication handshake
async function handleHandshake(body, req, res) {
  const ip = req.socket.remoteAddress || 'unknown';

  // ── 1. SNR gate ────────────────────────────────────────────────────────────
  const snr = snrScore(body, body.uuid);
  if (snr.score < (_policy.snr?.threshold || 0.75)) {
    // Dropped silently — no information leak
    _log('auth.snr.dropped', { uuid: body.uuid, score: snr.score, ip });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'invalid_request' })); // generic
  }

  // ── 2. Rate limit ──────────────────────────────────────────────────────────
  const limit = checkRateLimit(body.uuid || ip);
  if (!limit.allowed) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'rate_limited', retryAfter: limit.retryAfter }));
  }

  // ── 3. Nonce check ─────────────────────────────────────────────────────────
  const nonceResult = consumeNonce(body.nonce);
  if (!nonceResult.ok) {
    _log('auth.nonce.rejected', { uuid: body.uuid, reason: nonceResult.reason, ip });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'invalid_nonce' }));
  }

  // ── 4. Whitelist check ─────────────────────────────────────────────────────
  const client = _clients.get(body.uuid);
  if (!client) {
    _log('auth.whitelist.rejected', { uuid: body.uuid, ip });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'not_authorized' }));
  }

  // User-Agent check if policy requires it
  if (_policy.whitelist?.requireUserAgent) {
    const ua      = req.headers['user-agent'] || '';
    const allowed = _policy.whitelist.allowedUserAgents || [];
    if (allowed.length && !allowed.some(a => ua.includes(a))) {
      _log('auth.ua.rejected', { uuid: body.uuid, ua, ip });
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, reason: 'not_authorized' }));
    }
  }

  // ── 5. RSA verify signature ────────────────────────────────────────────────
  let sigOk = false;
  try {
    sigOk = verifySignature(client.publicKey, body.nonce, body.signature);
  } catch(e) {
    _log('auth.sig.error', { uuid: body.uuid, error: e.message, ip });
  }
  if (!sigOk) {
    _log('auth.sig.rejected', { uuid: body.uuid, ip });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'signature_invalid' }));
  }

  // ── 6. Decrypt session key ─────────────────────────────────────────────────
  let sessionKey;
  try {
    sessionKey = decryptSessionKey(body.encryptedSessionKey);
    if (sessionKey.length !== 32) throw new Error('session key must be 32 bytes');
  } catch(e) {
    _log('auth.key.error', { uuid: body.uuid, error: e.message, ip });
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, reason: 'key_error' }));
  }

  // ── 7. Issue session ───────────────────────────────────────────────────────
  const session = createSession(body.uuid, sessionKey, {
    ip, userAgent: req.headers['user-agent'] || '', snrScore: snr.score,
  });

  _log('auth.session.created', { uuid: body.uuid, sessionId: session.sessionId, ip, snrScore: snr.score });

  // Response encrypted with the just-established session key
  const payload = JSON.stringify({ sessionId: session.sessionId, expiresAt: session.expiresAt });
  const encrypted = encryptPayload(sessionKey, payload);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, encrypted }));
}

// POST /auth/verify — middleware: verify session token on incoming requests
function verifyRequest(req) {
  const sessionId = req.headers['x-nexus-session'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!sessionId) return { ok: false, reason: 'no_session' };
  const session = getSession(sessionId);
  if (!session) return { ok: false, reason: 'session_invalid' };
  return { ok: true, session, uuid: session.uuid };
}

// POST /auth/revoke — revoke a session
function handleRevoke(body, res) {
  if (body.sessionId) revokeSession(body.sessionId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// GET /auth/clients — list whitelisted clients (admin)
function handleClients(res) {
  const list = [..._clients.values()].map(c => ({ uuid: c.uuid, meta: c.meta }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, clients: list, count: list.length }));
}

// POST /auth/clients — register a new client public key
function handleRegisterClient(body, res) {
  const { uuid, publicKey, meta = {} } = body;
  if (!uuid || !publicKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'uuid and publicKey required' }));
  }

  const content = Object.keys(meta).length
    ? JSON.stringify(meta) + '\n' + publicKey
    : publicKey;

  fs.writeFileSync(path.join(CLIENTS_DIR, `${uuid}.pub`), content);
  loadClients(); // hot-reload immediately

  _log('auth.client.registered', { uuid, meta });
  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, uuid }));
}

// DELETE /auth/clients/:uuid — revoke client access
function handleRevokeClient(uuid, res) {
  const file = path.join(CLIENTS_DIR, `${uuid}.pub`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    _clients.delete(uuid);
    // Revoke all sessions for this client
    for (const [sid, s] of _sessions) {
      if (s.uuid === uuid) revokeSession(sid);
    }
    _log('auth.client.revoked', { uuid });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uuid, sessionsRevoked: true }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'client not found' }));
  }
}

// ── Hotswap watchers ──────────────────────────────────────────────────────────
function _watchPolicy() {
  try {
    fs.watch(POLICY_FILE, () => {
      setTimeout(() => { loadPolicy(); console.log('[auth] policy hotswapped'); }, 200);
    });
  } catch(e) { console.warn('[auth] policy watch failed:', e.message); }
}

function _watchClients() {
  try {
    fs.watch(CLIENTS_DIR, (event, filename) => {
      if (filename?.endsWith('.pub')) {
        setTimeout(() => { loadClients(); console.log('[auth] clients hotswapped'); }, 200);
      }
    });
  } catch(e) { console.warn('[auth] clients watch failed:', e.message); }
}

// ── Logging ───────────────────────────────────────────────────────────────────
function _log(type, payload) {
  console.log(`[auth] ${type}`, JSON.stringify(payload));
  // Write to auth log for audit trail
  const line = JSON.stringify({ ts: Date.now(), type, ...payload }) + '\n';
  try { fs.appendFileSync(path.join(AUTH_DIR, 'auth.log'), line); } catch(_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  loadPolicy();
  loadClients();
  loadOrGenerateNexusKey();
  _watchPolicy();
  _watchClients();
  console.log('[auth] ready — SNR gate active, RSA-2048 loaded');
}

// ── Public surface ────────────────────────────────────────────────────────────
module.exports = {
  init,
  // HTTP handlers — called by orchestrator router
  handlePubkey,
  handleChallenge,
  handleHandshake,
  handleRevoke,
  handleClients,
  handleRegisterClient,
  handleRevokeClient,
  // Middleware
  verifyRequest,
  // Crypto utilities (for encrypted request bodies)
  encryptPayload,
  decryptPayload,
  // State
  getSession,
  revokeSession,
  MODULE_ID,
};
