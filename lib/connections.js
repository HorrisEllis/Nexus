'use strict';
/**
 * lib/connections.js — scoped http/sse connection tool for automation (§CA4)
 * UUID: nexus-connections-v1-0000-2026-0808-001
 *
 * James: "http/api/sse connections for automation... connect to remote
 * services." Scoped + RAID-gated — CA5's system-control note calls this out
 * explicitly ("every change logged + revertible"); a remote call is the one
 * class of automation action that leaves NEXUS, so it gets its own gate
 * beyond governAction: a domain allowlist. Nothing in the repo had one for
 * this call class (checked — lib/contract-queue.js's "allowlist" hit is an
 * unrelated field name, not a reusable mechanism), so this is a real new
 * piece, not a composition of an existing one.
 *
 * Two call shapes:
 *   call(spec)  — one-shot http/https request. Same wire format as
 *                 lib/chains.js's 'http' step (method/url/headers/body/
 *                 timeoutMs) so a chain step can be upgraded from chains.js's
 *                 minimal built-in to this scoped version by changing
 *                 nothing but which function runs it — see chains.js's own
 *                 docblock, which names this file as its successor.
 *   openSSE(spec) — a persistent EventSource-style stream. Returns a handle
 *                 { on(event,cb), close() }; the caller owns the handle's
 *                 lifetime (§1.2 — connections.js does not leak a stream the
 *                 caller forgot to close: closeAll() exists for that case).
 *
 * §RAID — governAction gates every call/openSSE, same shape as CA1-CA3.
 * §scope — a scope is { allowedDomains:[hostnames], allowedMethods?:[...] }.
 * No scope registered for a call → default-deny (an explicit allowlist must
 * exist; there is no "allow everything" default, unlike chains.js's minimal
 * http step, which is intentionally permissive because it has no scope
 * concept at all — that gap is exactly why this file exists).
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const _scopes = new Map();      // scopeId → { allowedDomains, allowedMethods }
const _openStreams = new Map(); // id → { req, handle }

function _fanin() { try { return require('./ledger-fanin'); } catch (_) { return null; } }
function _uid() { try { return require('crypto').randomUUID(); } catch (_) { return 'conn-' + Date.now() + '-' + Math.random().toString(16).slice(2); } }

/** registerScope(scopeId, {allowedDomains, allowedMethods}) — define what a scope may reach. */
function registerScope(scopeId, def = {}) {
  if (!scopeId) return { ok: false, reason: 'scopeId required' };
  if (!Array.isArray(def.allowedDomains) || !def.allowedDomains.length) return { ok: false, reason: 'allowedDomains required (default-deny — no wildcard scope)' };
  _scopes.set(scopeId, { allowedDomains: def.allowedDomains, allowedMethods: def.allowedMethods || null });
  return { ok: true, scopeId };
}

function _checkScope(scopeId, hostname, method) {
  const scope = _scopes.get(scopeId);
  if (!scope) return { ok: false, reason: `unknown scope "${scopeId}" (default-deny — call registerScope first)` };
  const domainOk = scope.allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
  if (!domainOk) return { ok: false, reason: `${hostname} not in scope "${scopeId}"'s allowedDomains` };
  if (scope.allowedMethods && !scope.allowedMethods.includes((method || 'GET').toUpperCase())) return { ok: false, reason: `${method} not allowed in scope "${scopeId}"` };
  return { ok: true };
}

async function _govern(intent, target) {
  let allowed = true, reason = null;
  try {
    const sm = require('../copilot/lib/self-model');
    if (sm.governAction) { const g = sm.governAction({ action: intent, target }, {}); if (g && g.allowed === false) { allowed = false; reason = g.reason; } }
  } catch (_) {}
  return { allowed, reason };
}

function _log(type, fields) {
  try { const f = _fanin(); f && f.emit && f.emit({ type, source: 'connections', ts: Date.now(), ...fields }); } catch (_) {}
}

/**
 * call(spec) — one-shot scoped http/https call.
 * spec: { scope, url, method?, headers?, body?, timeoutMs? }
 */
async function call(spec = {}) {
  let u;
  try { u = new URL(spec.url); } catch (e) { return { ok: false, reason: `invalid url "${spec.url}"` }; }

  const scopeCheck = _checkScope(spec.scope, u.hostname, spec.method);
  if (!scopeCheck.ok) { _log('connection.scope_denied', { scope: spec.scope, host: u.hostname, reason: scopeCheck.reason }); return { ok: false, reason: scopeCheck.reason }; }

  const { allowed, reason } = await _govern(spec.intent || 'connections.call', { url: spec.url, method: spec.method });
  _log(allowed ? 'connection.call' : 'connection.denied', { url: spec.url, method: spec.method || 'GET', allowed, reason });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  return new Promise((resolve) => {
    const lib = u.protocol === 'https:' ? https : http;
    const body = spec.body != null ? (typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body)) : null;
    const req = lib.request(u, {
      method: spec.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(spec.headers || {}) },
      timeout: spec.timeoutMs || 8000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ ok: true, status: res.statusCode, body: parsed });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, reason: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

/**
 * openSSE(spec) — a persistent server-sent-events stream.
 * spec: { scope, url, headers?, id? }
 * @returns { ok, id, on(event,cb), close() } or { ok:false, reason }
 */
async function openSSE(spec = {}) {
  let u;
  try { u = new URL(spec.url); } catch (e) { return { ok: false, reason: `invalid url "${spec.url}"` }; }

  const scopeCheck = _checkScope(spec.scope, u.hostname, 'GET');
  if (!scopeCheck.ok) { _log('connection.scope_denied', { scope: spec.scope, host: u.hostname, reason: scopeCheck.reason }); return { ok: false, reason: scopeCheck.reason }; }

  const { allowed, reason } = await _govern(spec.intent || 'connections.sse', { url: spec.url });
  _log(allowed ? 'connection.sse.open' : 'connection.denied', { url: spec.url, allowed, reason });
  if (!allowed) return { ok: false, reason: reason || 'denied' };

  const id = spec.id || _uid();
  const lib = u.protocol === 'https:' ? https : http;
  const listeners = { message: [], error: [], close: [] };

  const req = lib.request(u, { method: 'GET', headers: { Accept: 'text/event-stream', ...(spec.headers || {}) } }, (res) => {
    res.setEncoding('utf8');
    let buf = '';
    res.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const dataLine = raw.split('\n').find(l => l.startsWith('data:'));
        if (dataLine) {
          const payload = dataLine.slice(5).trim();
          let parsed = payload;
          try { parsed = JSON.parse(payload); } catch (_) {}
          for (const cb of listeners.message) { try { cb(parsed); } catch (_) {} }
        }
      }
    });
    res.on('end', () => { for (const cb of listeners.close) { try { cb(); } catch (_) {} } _openStreams.delete(id); });
  });
  req.on('error', (e) => { for (const cb of listeners.error) { try { cb(e); } catch (_) {} } });
  req.end();

  const handle = {
    id,
    on(event, cb) { if (listeners[event]) listeners[event].push(cb); return handle; },
    close() { try { req.destroy(); } catch (_) {} _openStreams.delete(id); _log('connection.sse.close', { url: spec.url, id }); },
  };
  _openStreams.set(id, { req, handle });
  return { ok: true, id, ...handle };
}

function listOpenStreams() { return [..._openStreams.keys()]; }
function closeAll() { for (const { handle } of _openStreams.values()) { try { handle.close(); } catch (_) {} } }
function _resetForTest() { closeAll(); _scopes.clear(); }

module.exports = { registerScope, call, openSSE, listOpenStreams, closeAll, _resetForTest, MODULE_ID: 'connections', VERSION: '1.0.0' };
