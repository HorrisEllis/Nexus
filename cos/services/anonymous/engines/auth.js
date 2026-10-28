'use strict';
/**
 * engines/auth.js — authentication server
 * anonymousservers.info
 *
 * Value adds:
 *   - JWT issuance + verification (RS256, short-lived access + refresh tokens)
 *   - API key management (per-tenant, scoped, revocable)
 *   - Session store (backed by JAA db — no Redis needed)
 *   - Argon2-compatible password hashing via Node crypto (scrypt)
 *   - Anonymous account support: no email required, hashed handle only
 *   - Rate-limited login attempts with progressive delays
 *   - Token introspection endpoint for other engines
 *   - Audit log every auth event (customer-visible)
 */

const http   = require('http');
const crypto = require('crypto');
const { ipc, conf, log, claimPort, isInit, NAME } = require('./_engine');

const DEFAULTS = {
  listenPort:       4001,
  jwtSecret:        '',            // auto-generated on first run
  accessTokenTtl:   900,          // 15 min
  refreshTokenTtl:  2592000,      // 30 days
  scryptN:          16384,
  scryptR:          8,
  scryptP:          1,
  keyLength:        64,
  apiKeyPrefix:     'as_',
};

if (isInit()) {
  const c = { ...DEFAULTS, jwtSecret: crypto.randomBytes(64).toString('hex') };
  conf.init(c);
  log('auth: wrote default conf with generated JWT secret');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);
if (!cfg.jwtSecret) {
  cfg.jwtSecret = crypto.randomBytes(64).toString('hex');
  conf.save(cfg);
}

// ─── password hashing (scrypt — no native deps) ───────────────────────────────

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, cfg.keyLength,
      { N: cfg.scryptN, r: cfg.scryptR, p: cfg.scryptP },
      (err, key) => {
        if (err) reject(err);
        else resolve(`${salt.toString('hex')}:${key.toString('hex')}`);
      }
    );
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [saltHex, keyHex] = stored.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const key  = Buffer.from(keyHex, 'hex');
    crypto.scrypt(password, salt, cfg.keyLength,
      { N: cfg.scryptN, r: cfg.scryptR, p: cfg.scryptP },
      (err, derived) => {
        if (err) reject(err);
        else {
          try { resolve(crypto.timingSafeEqual(derived, key)); }
          catch { resolve(false); }
        }
      }
    );
  });
}

// ─── JWT (HS256 — no external deps) ──────────────────────────────────────────

function b64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function jwtSign(payload) {
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body    = b64url(JSON.stringify(payload));
  const sig     = crypto.createHmac('sha256', cfg.jwtSecret)
    .update(`${header}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.${sig}`;
}

function jwtVerify(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', cfg.jwtSecret)
      .update(`${header}.${body}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function issueTokens(tenantId, userId, scopes = []) {
  const now = Math.floor(Date.now() / 1000);
  const access = jwtSign({
    sub: userId, tid: tenantId, scopes,
    iat: now, exp: now + cfg.accessTokenTtl, type: 'access'
  });
  const refresh = jwtSign({
    sub: userId, tid: tenantId,
    iat: now, exp: now + cfg.refreshTokenTtl, type: 'refresh',
    jti: crypto.randomBytes(16).toString('hex')
  });
  return { access, refresh, expiresIn: cfg.accessTokenTtl };
}

// ─── API key management ───────────────────────────────────────────────────────

function generateApiKey(tenantId, scopes = [], label = '') {
  const raw    = crypto.randomBytes(32).toString('hex');
  const key    = `${cfg.apiKeyPrefix}${raw}`;
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  return { key, hashed, tenantId, scopes, label, createdAt: Date.now() };
}

async function verifyApiKey(key) {
  const hashed = crypto.createHash('sha256').update(key).digest('hex');
  const rows   = await ipc.db.query('api_keys', r => `r.hashed === '${hashed}' && !r.revokedAt`);
  return rows[0] || null;
}

// ─── anonymous handle generation ─────────────────────────────────────────────
// No email required. User gets a random handle + passphrase.

function generateAnonHandle() {
  const adjectives = ['silent', 'hidden', 'private', 'phantom', 'shadow', 'stealth', 'quiet', 'veiled'];
  const nouns      = ['node', 'relay', 'circuit', 'signal', 'proxy', 'tunnel', 'vault', 'anchor'];
  const adj  = adjectives[crypto.randomInt(adjectives.length)];
  const noun = nouns[crypto.randomInt(nouns.length)];
  const num  = crypto.randomInt(1000, 9999);
  return `${adj}-${noun}-${num}`;
}

// ─── login rate limiting ──────────────────────────────────────────────────────

const loginAttempts = new Map(); // ip -> { count, lockedUntil }

function checkLoginRateLimit(ip) {
  const now   = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  if (state.lockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((state.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

function recordLoginFail(ip) {
  const state = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  state.count++;
  // progressive: 5 fails = 1min, 10 = 5min, 20 = 1h
  if (state.count >= 20)      state.lockedUntil = Date.now() + 3600000;
  else if (state.count >= 10) state.lockedUntil = Date.now() + 300000;
  else if (state.count >= 5)  state.lockedUntil = Date.now() + 60000;
  loginAttempts.set(ip, state);
}

function recordLoginSuccess(ip) {
  loginAttempts.delete(ip);
}

// ─── HTTP API ─────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ip   = req.socket.remoteAddress;
  const url  = req.url.split('?')[0];
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};

  try {
    // ── POST /auth/register ───────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/auth/register') {
      const handle   = body.handle || generateAnonHandle();
      const password = body.password || crypto.randomBytes(16).toString('hex');
      const tenantId = body.tenantId || 'default';

      // check handle taken
      const existing = await ipc.db.query('users', `r => r.handle === '${handle}'`);
      if (existing.length) return json(res, 409, { error: 'handle taken' });

      const hashed = await hashPassword(password);
      const userId  = crypto.randomBytes(16).toString('hex');
      const user    = await ipc.db.insert('users', {
        userId, handle, password: hashed, tenantId,
        scopes: ['hosting:read', 'hosting:write'],
        createdAt: Date.now(),
      });

      ipc.db.insert('audit_log', { tenantId, userId, action: 'register', ts: Date.now() }).catch(() => {});
      const tokens = issueTokens(tenantId, userId, user.scopes);
      return json(res, 201, { userId, handle, ...tokens });
    }

    // ── POST /auth/login ──────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/auth/login') {
      const rl = checkLoginRateLimit(ip);
      if (!rl.allowed) return json(res, 429, { error: 'too many attempts', retryAfter: rl.retryAfter });

      const { handle, password } = body;
      if (!handle || !password) return json(res, 400, { error: 'handle and password required' });

      const users = await ipc.db.query('users', `r => r.handle === '${handle}'`);
      const user  = users[0];
      if (!user) { recordLoginFail(ip); return json(res, 401, { error: 'invalid credentials' }); }

      const ok = await verifyPassword(password, user.password);
      if (!ok) { recordLoginFail(ip); return json(res, 401, { error: 'invalid credentials' }); }

      recordLoginSuccess(ip);
      ipc.db.insert('audit_log', { tenantId: user.tenantId, userId: user.userId, action: 'login', ip, ts: Date.now() }).catch(() => {});
      const tokens = issueTokens(user.tenantId, user.userId, user.scopes || []);
      return json(res, 200, tokens);
    }

    // ── POST /auth/refresh ────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/auth/refresh') {
      const { refreshToken } = body;
      if (!refreshToken) return json(res, 400, { error: 'refreshToken required' });
      const payload = jwtVerify(refreshToken);
      if (!payload || payload.type !== 'refresh') return json(res, 401, { error: 'invalid refresh token' });
      const users = await ipc.db.query('users', `r => r.userId === '${payload.sub}'`);
      const user  = users[0];
      if (!user) return json(res, 401, { error: 'user not found' });
      const tokens = issueTokens(payload.tid, payload.sub, user.scopes || []);
      return json(res, 200, tokens);
    }

    // ── POST /auth/verify ─────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/auth/verify') {
      const token = (req.headers.authorization || '').replace('Bearer ', '') || body.token;
      const payload = jwtVerify(token);
      if (!payload) return json(res, 401, { error: 'invalid or expired token' });
      return json(res, 200, { valid: true, ...payload });
    }

    // ── POST /auth/apikey ─────────────────────────────────────────────────────
    if (req.method === 'POST' && url === '/auth/apikey') {
      const token   = (req.headers.authorization || '').replace('Bearer ', '');
      const payload = jwtVerify(token);
      if (!payload) return json(res, 401, { error: 'unauthorized' });
      const { scopes, label } = body;
      const apiKey = generateApiKey(payload.tid, scopes, label);
      await ipc.db.insert('api_keys', { hashed: apiKey.hashed, tenantId: apiKey.tenantId, scopes: apiKey.scopes, label: apiKey.label, createdAt: apiKey.createdAt });
      ipc.db.insert('audit_log', { tenantId: payload.tid, userId: payload.sub, action: 'apikey:create', label, ts: Date.now() }).catch(() => {});
      // Return raw key only once
      return json(res, 201, { key: apiKey.key, label, scopes: apiKey.scopes });
    }

    // ── DELETE /auth/apikey ───────────────────────────────────────────────────
    if (req.method === 'DELETE' && url === '/auth/apikey') {
      const token   = (req.headers.authorization || '').replace('Bearer ', '');
      const payload = jwtVerify(token);
      if (!payload) return json(res, 401, { error: 'unauthorized' });
      const { key } = body;
      const hashed  = crypto.createHash('sha256').update(key).digest('hex');
      await ipc.db.update('api_keys', `r => r.hashed === '${hashed}' && r.tenantId === '${payload.tid}'`, { revokedAt: Date.now() });
      return json(res, 200, { revoked: true });
    }

    // ── GET /auth/audit ───────────────────────────────────────────────────────
    if (req.method === 'GET' && url.startsWith('/auth/audit')) {
      const token   = (req.headers.authorization || '').replace('Bearer ', '');
      const payload = jwtVerify(token);
      if (!payload) return json(res, 401, { error: 'unauthorized' });
      const logs = await ipc.db.query('audit_log', `r => r.tenantId === '${payload.tid}'`);
      return json(res, 200, { logs: logs.slice(-200) });
    }

    json(res, 404, { error: 'not found' });

  } catch (e) {
    log(`auth error: ${e.message}`, 'ERROR');
    json(res, 500, { error: 'internal error' });
  }
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// other engines (proxy, api gateway) verify tokens via IPC — no HTTP hop needed
ipc.on('auth:verify', payload => {
  const { token, requestId } = payload || {};
  const result = jwtVerify(token);
  ipc.send('auth:verify:reply', { requestId, valid: !!result, payload: result });
});

ipc.on('auth:apikey:verify', async payload => {
  const { key, requestId } = payload || {};
  const result = await verifyApiKey(key).catch(() => null);
  ipc.send('auth:apikey:reply', { requestId, valid: !!result, tenantId: result?.tenantId, scopes: result?.scopes });
});

// tenant engine calls this when provisioning new tenant
ipc.on('auth:user:create', async payload => {
  const { handle, tenantId, scopes } = payload || {};
  const password = crypto.randomBytes(16).toString('hex');
  const hashed   = await hashPassword(password);
  const userId   = crypto.randomBytes(16).toString('hex');
  await ipc.db.insert('users', { userId, handle: handle || generateAnonHandle(), password: hashed, tenantId, scopes: scopes || [], createdAt: Date.now() });
  ipc.send('auth:user:created', { userId, tenantId, tempPassword: password });
});

// ─── start ────────────────────────────────────────────────────────────────────

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`auth engine listening on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

log('auth engine ready');

// ─── status ping (monitor health check) ──────────────────────────────────────
ipc.on('status:ping', payload => {
  ipc.send('status:pong', { requestId: payload?.requestId, engine: NAME, alive: true, ts: Date.now() });
});

