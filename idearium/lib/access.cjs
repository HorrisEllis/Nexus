'use strict';
/**
 * idearium/lib/access.cjs — who may act on Idearium (IA0, docs/2026-10-10-idearium-access-phasemap.spec).
 * comp_id: idearium.access
 *
 * James, 2026-10-10: "what about a app password style login in idearium from clearglass panel, then we could accounts
 * per hat/repo?"
 *
 * App passwords: `nxa_<id>_<secret>`, shown once, kept only as a sha256 hash (the secret is 32 random bytes, so a fast
 * hash is enough — nothing to brute-force). Each has a label, an optional hat, the repos it may touch ('*' or a list)
 * and capabilities from the API's own CAPS (read_ideas · write_ideas · search_ideas · admin). Sign-in turns one into a
 * session cookie with the same scope.
 *
 * decide() is the one gate (pure — no I/O but the key store): which callers need a password depends on access.mode —
 *   open      nobody (the old behaviour)
 *   origin    the default: a website (an Origin that is not loopback or listed) or another device
 *   password  everyone but health and sign-in
 * A caller that presents a password is held to its scope in every mode; a wrong or revoked one is refused in every mode.
 * Files (idearium's data dir, never committed): access/keys.json · access/sessions.json · access/ledger.jsonl
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ideariumDataDir } = require('./data-dir.cjs');

const MODULE_ID = 'idearium.access';
const VERSION = '1.0.0';
const COOKIE = 'nx_idearium';
const CAPS = ['search_ideas', 'read_ideas', 'write_ideas', 'admin'];   // each holds the ones before it
const PUBLIC = new Set(['health', 'access.me', 'access.login', 'access.logout']);

const _dir = () => path.join(process.env.IDEARIUM_ACCESS_DIR || path.join(ideariumDataDir(), 'access'));
const _file = (n) => path.join(_dir(), n);
const _sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
function _read(name, empty) { try { return JSON.parse(fs.readFileSync(_file(name), 'utf8')); } catch (_) { return empty; } }
function _write(name, v) {
  fs.mkdirSync(_dir(), { recursive: true });
  const f = _file(name), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, f);
}
function _ledger(row) { try { fs.mkdirSync(_dir(), { recursive: true }); fs.appendFileSync(_file('ledger.jsonl'), JSON.stringify({ at: Date.now(), ...row }) + '\n'); } catch (_) { /* the act stands */ } }
const _keys = () => _read('keys.json', { keys: [] }).keys || [];
const _public = (k) => ({ id: k.id, label: k.label, hat: k.hat || null, repos: k.repos, caps: k.caps, createdAt: k.createdAt, createdBy: k.createdBy || null, lastUsedAt: k.lastUsedAt || null, revokedAt: k.revokedAt || null });

function _caps(list) {
  const want = (Array.isArray(list) ? list : String(list || '').split(',')).map(s => String(s).trim()).filter(Boolean);
  const bad = want.filter(c => !CAPS.includes(c));
  if (bad.length) return { error: `unknown capability ${bad.join(', ')} — one of ${CAPS.join(', ')}` };
  return { caps: want.length ? [...new Set(want)] : ['read_ideas', 'write_ideas'] };
}
function _repos(r) {
  if (r == null || r === '' || r === '*') return '*';
  const list = (Array.isArray(r) ? r : String(r).split(',')).map(s => String(s).trim()).filter(Boolean);
  return list.length ? list : '*';
}

/** createKey({label, hat, repos, caps}, {actor}) → { ok, key (public shape), password } — the password is never stored or shown again */
function createKey({ label, hat = null, repos = '*', caps } = {}, { actor = 'user' } = {}) {
  if (!label || !String(label).trim()) return { ok: false, error: 'a label is required (who or what this password is for)' };
  const c = _caps(caps); if (c.error) return { ok: false, error: c.error };
  const id = crypto.randomBytes(4).toString('hex');
  const password = `nxa_${id}_${crypto.randomBytes(32).toString('base64url')}`;
  const key = { id, label: String(label).trim().slice(0, 80), hat: hat ? String(hat).trim().slice(0, 80) : null, repos: _repos(repos), caps: c.caps,
    hash: _sha(password), createdAt: Date.now(), createdBy: actor, lastUsedAt: null, revokedAt: null };
  const all = _keys(); all.push(key); _write('keys.json', { keys: all });
  _ledger({ act: 'key.created', id, label: key.label, hat: key.hat, repos: key.repos, caps: key.caps, actor });
  return { ok: true, key: _public(key), password };
}

function listKeys() { return _keys().map(_public); }

function revokeKey(id, { actor = 'user' } = {}) {
  const all = _keys(); const k = all.find(x => x.id === id);
  if (!k) return { ok: false, error: `no app password ${id}` };
  if (k.revokedAt) return { ok: true, key: _public(k), note: 'already revoked' };
  k.revokedAt = Date.now(); _write('keys.json', { keys: all });
  const s = _read('sessions.json', { sessions: [] }); _write('sessions.json', { sessions: (s.sessions || []).filter(x => x.keyId !== id) });
  _ledger({ act: 'key.revoked', id, actor });
  return { ok: true, key: _public(k) };
}

/** verify(password) → the live key | { error } */
function verify(password) {
  const m = /^nxa_([0-9a-f]{8})_[A-Za-z0-9_-]{20,}$/.exec(String(password || '').trim());
  if (!m) return { error: 'that is not an Idearium app password (they start nxa_)' };
  const all = _keys(); const k = all.find(x => x.id === m[1]);
  const h = Buffer.from(_sha(String(password).trim()), 'hex');
  if (!k || !crypto.timingSafeEqual(h, Buffer.from(k.hash, 'hex'))) return { error: 'wrong app password' };
  if (k.revokedAt) return { error: `app password "${k.label}" was revoked` };
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt > 60000) { k.lastUsedAt = Date.now(); try { _write('keys.json', { keys: all }); } catch (_) {} }
  return k;
}

/** login(password, {days}) → { ok, session, key, maxAge } — the session token goes only into the cookie */
function login(password, { days = 30 } = {}) {
  const k = verify(password);
  if (k.error) { _ledger({ act: 'login.refused', reason: k.error }); return { ok: false, error: k.error }; }
  const session = crypto.randomBytes(32).toString('base64url');
  const maxAge = Math.round(days * 86400);
  const s = _read('sessions.json', { sessions: [] });
  const live = (s.sessions || []).filter(x => x.expires > Date.now());
  live.push({ hash: _sha(session), keyId: k.id, expires: Date.now() + maxAge * 1000, createdAt: Date.now() });
  _write('sessions.json', { sessions: live });
  _ledger({ act: 'login', id: k.id, label: k.label });
  return { ok: true, session, key: _public(k), maxAge };
}

function logout(session) {
  if (!session) return { ok: true };
  const s = _read('sessions.json', { sessions: [] }), h = _sha(session);
  _write('sessions.json', { sessions: (s.sessions || []).filter(x => x.hash !== h) });
  return { ok: true };
}

function _cookie(headers) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`).exec(String((headers && headers.cookie) || ''));
  return m ? m[1] : null;
}
function _bySession(session) {
  const h = _sha(session);
  const row = (_read('sessions.json', { sessions: [] }).sessions || []).find(x => x.hash === h && x.expires > Date.now());
  if (!row) return { error: 'your sign-in has ended — sign in again' };
  const k = _keys().find(x => x.id === row.keyId);
  if (!k || k.revokedAt) return { error: 'the app password this sign-in used was revoked' };
  return k;
}

/** credential(headers) → null (none offered) | { key, via } | { error } */
function credential(headers = {}) {
  const auth = String(headers.authorization || '');
  if (/^Bearer\s+/i.test(auth)) { const k = verify(auth.replace(/^Bearer\s+/i, '')); return k.error ? { error: k.error } : { key: k, via: 'password' }; }
  const s = _cookie(headers);
  if (s) { const k = _bySession(s); return k.error ? { error: k.error, staleCookie: true } : { key: k, via: 'session' }; }
  return null;
}

const _loopHost = /^(?:127(?:\.\d{1,3}){3}|localhost|\[::1\])$/i;
function isLoopbackAddress(a) { return !a || a === '::1' || /^(?:::ffff:)?127\./.test(a); }
function originTrusted(origin, extra = '') {
  if (!origin) return false;
  try { const u = new URL(origin); if ((u.protocol === 'http:' || u.protocol === 'https:') && _loopHost.test(u.hostname)) return true; } catch (_) { /* 'null' and the like */ }
  return String(extra || '').split(',').map(s => s.trim()).filter(Boolean).includes(origin);
}
function holds(caps, need) {
  if (!need) return true;
  const have = Math.max(-1, ...(caps || []).map(c => CAPS.indexOf(c)));
  return have >= CAPS.indexOf(need);
}

/**
 * decide({ action, cap, method, repo, headers, remoteAddress, mode, trustedOrigins, corsSetting })
 *   → { allow, status?, error?, how?, who, cors } — cors: the Access-Control-Allow-Origin to send, or null for none
 */
function decide({ action = null, cap, method = 'GET', repo = null, headers = {}, remoteAddress = null, mode = 'origin', trustedOrigins = '', corsSetting = 'trusted' } = {}) {
  const origin = headers.origin || null;
  const trusted = originTrusted(origin, trustedOrigins);
  const local = isLoopbackAddress(remoteAddress);
  const cred = credential(headers);
  const corsFor = (signedIn) => corsSetting && corsSetting !== 'trusted' ? corsSetting : (origin && (trusted || signedIn) ? origin : null);
  const need = cap === undefined ? (method === 'GET' ? 'read_ideas' : 'write_ideas') : cap;
  const how = 'sign in with an Idearium app password (Settings → Access makes one; Clear Glass signs in for you once it is saved there)';

  if (cred && cred.error && !PUBLIC.has(action)) return { allow: false, status: 401, error: cred.error, how, who: null, cors: corsFor(false), clearCookie: !!cred.staleCookie };
  if (cred && cred.key) {
    const k = cred.key, who = { keyId: k.id, label: k.label, hat: k.hat || null, via: cred.via, caps: k.caps, repos: k.repos };
    if (!PUBLIC.has(action)) {
      if (!holds(k.caps, need)) return { allow: false, status: 403, error: `app password "${k.label}" does not hold ${need} (it holds ${k.caps.join(', ')})`, who, cors: corsFor(true) };
      if (repo && k.repos !== '*' && !k.repos.includes(repo)) return { allow: false, status: 403, error: `app password "${k.label}" is not for repo ${repo} (it may touch ${k.repos.join(', ')})`, who, cors: corsFor(true) };
    }
    return { allow: true, who, cors: corsFor(true) };
  }
  if (PUBLIC.has(action) || mode === 'open') return { allow: true, who: null, cors: mode === 'open' && corsSetting === 'trusted' ? (origin || '*') : corsFor(false) };
  if (mode === 'password') return { allow: false, status: 401, error: 'Idearium asks everyone to sign in (access.mode is password)', how, who: null, cors: corsFor(false) };
  if (!local) return { allow: false, status: 401, error: `a request from another device (${remoteAddress}) needs an app password`, how, who: null, cors: corsFor(false) };
  if (origin && !trusted) return { allow: false, status: 403, error: `a page on ${origin} cannot drive Idearium`, how: `${how}, or add ${origin} to access.trusted_origins`, who: null, cors: null };
  return { allow: true, who: null, cors: corsFor(false) };
}

/** the repo a URL is about: /api/repos/<uuid>/… */
function repoOf(url) { const m = /^\/api\/repos\/([^/?#]+)/.exec(String(url || '')); return m ? decodeURIComponent(m[1]) : null; }

const sessionCookie = (session, maxAge) => `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;

module.exports = { MODULE_ID, VERSION, COOKIE, CAPS, createKey, listKeys, revokeKey, verify, login, logout, credential, decide, originTrusted, isLoopbackAddress, holds, repoOf, sessionCookie, clearCookie, sessionOf: _cookie };
