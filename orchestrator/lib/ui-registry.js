'use strict';
/**
 * lib/ui-registry.js — NEXUS UI Registry (Phase 2: UI Handshake)
 * UUID: nexus-ui-registry-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Any UI that wants to connect to NEXUS does a three-step handshake:
 *
 *   1. GET  /api/contract           — full system map (already exists)
 *   2. GET  /api/components         — component index (Phase 1)
 *   3. POST /api/ui/register        — declare self, get session token
 *   4. GET  /events                 — SSE stream (already exists)
 *
 * After registration the UI receives all system events via SSE.
 * UI heartbeat is checked every 30s — missing 2 beats = disconnected.
 * Component registry updates flow to all connected UIs as SSE events.
 *
 * UI types:
 *   browser     — nexus-shell.html, explorer pages
 *   terminal    — auth client CLI
 *   userscript  — Tampermonkey in claude.ai / chatgpt.com / etc
 *   external    — any third-party consumer
 *
 * §1.2  Disconnect is detected and emitted — never silently lost
 * §5.1  Every UI session has a UUID
 */

const crypto = require('crypto');

const MODULE_ID   = 'ui-registry';
const VERSION     = '1.0.0';
const HB_INTERVAL = 30_000;  // heartbeat check interval
const HB_TIMEOUT  = 70_000;  // missed 2 beats = disconnected

// ── State ─────────────────────────────────────────────────────────────────────
const _sessions  = new Map();  // Map<sessionId, UISession>
let   _broadcast = null;       // injected: fn(type, payload)
let   _jaa       = null;
let   _hbTimer   = null;

// ── UI Session schema ─────────────────────────────────────────────────────────
function _makeSession(body) {
  const id = crypto.randomUUID();
  return {
    id,
    name:         body.name        || 'unnamed',
    type:         body.type        || 'browser',    // browser|terminal|userscript|external
    capabilities: body.capabilities|| [],           // what the UI can do
    provider:     body.provider    || null,         // for userscripts: claude|chatgpt|gemini
    tabId:        body.tabId       || null,
    registeredAt: Date.now(),
    lastSeen:     Date.now(),
    online:       true,
    meta:         body.meta        || {},
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init(broadcastFn, jaaDB) {
  _broadcast = broadcastFn;
  _jaa       = jaaDB;

  // Start heartbeat checker
  if (_hbTimer) clearInterval(_hbTimer);
  _hbTimer = setInterval(_checkHeartbeats, HB_INTERVAL);
  _hbTimer.unref(); // don't keep process alive

  console.log(`[${MODULE_ID}] v${VERSION} ready`);
  return { ok: true };
}

// ── Register ──────────────────────────────────────────────────────────────────
function register(body) {
  if (!body || typeof body !== 'object') {
    return { ok:false, error:'body required' };
  }

  // Check if this tabId/name combo is already registered — update instead
  if (body.tabId) {
    for (const [id, session] of _sessions) {
      if (session.tabId === body.tabId) {
        session.lastSeen = Date.now();
        session.online   = true;
        session.meta     = { ...session.meta, ...body.meta };
        _emit('ui.reconnected', { sessionId: id, type: session.type, name: session.name });
        return { ok:true, sessionId: id, reconnected: true, session };
      }
    }
  }

  const session = _makeSession(body);
  _sessions.set(session.id, session);

  // Log to JAA
  try {
    if (_jaa) _jaa.insert('event_log', {
      uuid: crypto.randomUUID(), type: 'ui.registered',
      payload: { sessionId: session.id, type: session.type, name: session.name },
      source: MODULE_ID, causedBy: null, ts: Date.now(),
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] JAA log failed: ${e.message}`);
  }

  _emit('ui.registered', {
    sessionId: session.id, type: session.type,
    name: session.name, capabilities: session.capabilities,
  });

  console.log(`[${MODULE_ID}] UI registered: ${session.name} (${session.type}) — ${session.id.slice(0,8)}`);

  return {
    ok:        true,
    sessionId: session.id,
    reconnected: false,
    session,
    // What the UI needs to know to operate
    streams: {
      events:     '/events',           // SSE stream
      components: '/api/components',   // component index
      grammar:    '/api/components/grammar',
      contract:   '/api/contract',
    },
  };
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function heartbeat(sessionId) {
  const session = _sessions.get(sessionId);
  if (!session) return { ok:false, error:`session not found: ${sessionId}` };

  session.lastSeen = Date.now();
  if (!session.online) {
    session.online = true;
    _emit('ui.reconnected', { sessionId, type: session.type, name: session.name });
  }
  return { ok:true, sessionId };
}

function _checkHeartbeats() {
  const now = Date.now();
  for (const [id, session] of _sessions) {
    if (!session.online) continue;
    if (now - session.lastSeen > HB_TIMEOUT) {
      session.online = false;
      _emit('ui.disconnected', { sessionId: id, type: session.type, name: session.name });
      console.log(`[${MODULE_ID}] UI disconnected (heartbeat timeout): ${session.name} — ${id.slice(0,8)}`);
    }
  }
}

// ── Deregister ────────────────────────────────────────────────────────────────
function deregister(sessionId) {
  const session = _sessions.get(sessionId);
  if (!session) return { ok:false, error:`session not found: ${sessionId}` };

  session.online = false;
  _sessions.delete(sessionId);

  _emit('ui.deregistered', { sessionId, type: session.type, name: session.name });
  console.log(`[${MODULE_ID}] UI deregistered: ${session.name} — ${sessionId.slice(0,8)}`);

  return { ok:true };
}

// ── Query ─────────────────────────────────────────────────────────────────────
function list() {
  return [..._sessions.values()];
}

function listOnline() {
  return [..._sessions.values()].filter(s => s.online);
}

function get(sessionId) {
  return _sessions.get(sessionId) || null;
}

function stats() {
  const all    = [..._sessions.values()];
  const online = all.filter(s => s.online);
  const byType = {};
  for (const s of online) byType[s.type] = (byType[s.type]||0) + 1;
  return {
    total:   all.length,
    online:  online.length,
    offline: all.length - online.length,
    byType,
  };
}

// ── Emit to all connected UIs ─────────────────────────────────────────────────
// This is what makes the UI handshake live — registry events, component
// updates, system state changes all flow through here to every connected UI.
function _emit(type, payload) {
  try {
    if (_broadcast) _broadcast(type, { ...payload, source: MODULE_ID, ts: Date.now() });
  } catch(_) {}
}

// Public emit — called by orchestrator when anything interesting happens
// so all connected UIs can update in real time.
function emit(type, payload) {
  _emit(type, payload);
}

// ── API handler ───────────────────────────────────────────────────────────────
// Mounted on orchestrator at /api/ui/*
function handleRequest(method, sub, body, searchParams) {
  // POST /api/ui/register
  if (method === 'POST' && sub === 'register') {
    return register(body || {});
  }

  // POST /api/ui/heartbeat
  if (method === 'POST' && sub === 'heartbeat') {
    const sessionId = body?.sessionId || searchParams?.get?.('sessionId');
    if (!sessionId) return { ok:false, error:'sessionId required' };
    return heartbeat(sessionId);
  }

  // DELETE /api/ui/:sessionId
  if (method === 'DELETE' && sub) {
    return deregister(sub);
  }

  // GET /api/ui/connected
  if (method === 'GET' && sub === 'connected') {
    return { ok:true, sessions: listOnline(), stats: stats() };
  }

  // GET /api/ui/all
  if (method === 'GET' && sub === 'all') {
    return { ok:true, sessions: list(), stats: stats() };
  }

  // GET /api/ui/:sessionId
  if (method === 'GET' && sub) {
    const session = get(sub);
    if (!session) return { ok:false, error:`session not found`, id:sub, _status:404 };
    return { ok:true, session };
  }

  // GET /api/ui — stats
  if (method === 'GET') {
    return { ok:true, stats: stats(), online: listOnline().length };
  }

  return { ok:false, error:'route not found', _status:404 };
}

module.exports = {
  init, register, heartbeat, deregister,
  list, listOnline, get, stats, emit,
  handleRequest,
  MODULE_ID, VERSION,
};
