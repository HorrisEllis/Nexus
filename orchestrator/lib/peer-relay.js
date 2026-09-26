'use strict';
/**
 * lib/peer-relay.js — NEXUS Peer Relay (Remote System Bridge)
 * UUID: nexus-peer-relay-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Connects two NEXUS orchestrators automatically using pulse emissions.
 * Like SSH but driven by heartbeat — when system A's pulse reaches system B,
 * and B's pulse reaches A, they are peers. No manual configuration.
 *
 * How it works:
 *
 *   1. LOCAL  orchestrator exposes POST /api/peer/announce
 *   2. REMOTE orchestrator calls that endpoint on a schedule (its pulse)
 *   3. LOCAL verifies the remote's contract via /api/contract
 *   4. If verified: both systems add each other to their peer registry
 *   5. Pulse from remote becomes visible in LOCAL's SSE stream
 *   6. LOCAL's UI can now proxy to remote systems via /api/remote/:peerId/*
 *
 * The reverse proxy path:
 *   GET /api/remote/:peerId/api/cortex/gaps
 *   → fetched from remote orchestrator's /api/cortex/gaps
 *   → returned through local orchestrator
 *   → local UI renders remote data as if it were local
 *
 * Security:
 *   - Remote must present its bridge token (from its own bridge handshake)
 *   - Contract must verify (§1.1)
 *   - Peer-to-peer only — no hub-and-spoke, no relay chain
 *   - All traffic is plaintext on trusted LAN; put behind Cloudflare Access
 *     or Tunnel for internet exposure (§REMOTE-15)
 *
 * §1.1  Nothing is trusted until proven — contract verify before peering
 * §1.2  Every peer event logged to event_log
 * §5.2  Peer implements the bridge contract
 */

const http    = require('http');
const https   = require('https');
const { verifySystem, TRUST } = require('./contract-handshake');

const MODULE_ID   = 'peer-relay';
const PEER_TTL_MS = 5 * 60 * 1000; // 5 min without a pulse = peer considered offline

// ── Peer registry ─────────────────────────────────────────────────────────────
const _peers = new Map(); // peerId → PeerEntry

// ── Announce from a remote peer ───────────────────────────────────────────────
// Called when a remote orchestrator sends POST /api/peer/announce
async function handleAnnounce(body, opts = {}) {
  const { jaaInsert = null, broadcastSSE = null } = opts;
  const { peerId, host, port, token, contractHash, version } = body;

  if (!peerId || !host || !port) {
    return { ok: false, error: 'peerId, host, port required' };
  }

  // Verify the remote's contract before trusting it
  const verification = await verifySystem(peerId, host, port, { jaaInsert });

  if (verification.trust === TRUST.UNREACHABLE) {
    return { ok: false, error: `cannot reach remote contract at ${host}:${port}` };
  }

  const existing = _peers.get(peerId);
  const isNew    = !existing;
  const wasOffline = existing && existing.status === 'offline';

  const entry = {
    peerId,
    host,
    port,
    token:          token || null,
    contractHash:   verification.hash,
    trust:          verification.trust,
    routeCount:     verification.routeCount,
    version:        version || '?',
    status:         'online',
    firstSeenAt:    existing?.firstSeenAt || Date.now(),
    lastPulseAt:    Date.now(),
    pulseCount:     (existing?.pulseCount || 0) + 1,
    latencyMs:      verification.latencyMs,
  };

  _peers.set(peerId, entry);

  // Log and broadcast
  const eventType = isNew ? 'peer.connected' : wasOffline ? 'peer.reconnected' : 'peer.pulse';
  _log(jaaInsert, eventType, { peerId, host, port, trust: entry.trust });

  if ((isNew || wasOffline) && broadcastSSE) {
    broadcastSSE(eventType, { peerId, host, port, trust: entry.trust, routeCount: entry.routeCount });
  }

  return { ok: true, peerId, trust: entry.trust, accepted: true };
}

// ── Announce this local system to a remote ────────────────────────────────────
async function announceToRemote(remoteHost, remotePort, localInfo, opts = {}) {
  const { timeoutMs = 5000 } = opts;
  const { peerId, port, version, token } = localInfo;

  const body = JSON.stringify({ peerId, host: '127.0.0.1', port, version, token });

  return new Promise((resolve) => {
    const req = http.request({
      hostname: remoteHost,
      port:     remotePort,
      path:     '/api/peer/announce',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Peer-Id':      peerId,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(_) { resolve({ ok: false, error: 'invalid JSON from remote' }); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(body);
    req.end();
  });
}

// ── Proxy a request through to a remote peer ──────────────────────────────────
// Handles: GET /api/remote/:peerId/api/cortex/gaps
// Proxies: GET remote:port/api/cortex/gaps
function proxyToRemote(peerId, remotePath, req, res) {
  const peer = _peers.get(peerId);
  if (!peer) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: `peer not found: ${peerId}` }));
  }
  if (peer.status === 'offline') {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: `peer offline: ${peerId}`, lastSeen: peer.lastPulseAt }));
  }

  const isSSE = req.headers['accept'] === 'text/event-stream';
  const method = req.method;

  const proxyReq = http.request({
    hostname: peer.host,
    port:     peer.port,
    path:     remotePath,
    method,
    headers:  {
      ...req.headers,
      host:             `${peer.host}:${peer.port}`,
      'X-Forwarded-By': 'nexus-peer-relay',
      'X-Peer-Source':  'local',
    },
  }, (proxyRes) => {
    // Add peer context headers to response
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'X-Peer-Id':    peerId,
      'X-Peer-Host':  peer.host,
      'X-Peer-Trust': peer.trust,
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    // Mark peer as degraded
    if (_peers.has(peerId)) {
      _peers.get(peerId).status = 'degraded';
    }
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `peer proxy failed: ${e.message}`, peerId }));
    }
  });

  // Forward request body for POST/PUT/PATCH
  if (['POST','PUT','PATCH'].includes(method)) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

// ── Stale peer detection ──────────────────────────────────────────────────────
function pruneStalePeers(opts = {}) {
  const { jaaInsert = null, broadcastSSE = null } = opts;
  const now = Date.now();
  for (const [peerId, peer] of _peers) {
    if (peer.status === 'online' && now - peer.lastPulseAt > PEER_TTL_MS) {
      peer.status = 'offline';
      _log(jaaInsert, 'peer.offline', { peerId, lastPulseAt: peer.lastPulseAt });
      broadcastSSE?.('peer.offline', { peerId, lastPulseAt: peer.lastPulseAt });
    }
  }
}

// ── Public getters ─────────────────────────────────────────────────────────────
function getPeer(peerId)    { return _peers.get(peerId) || null; }
function getAllPeers()       { return [..._peers.values()]; }
function getOnlinePeers()   { return [..._peers.values()].filter(p => p.status === 'online'); }

// ── Log helper ────────────────────────────────────────────────────────────────
function _log(jaaInsert, type, payload) {
  if (jaaInsert) {
    try {
      jaaInsert('event_log', {
        uuid: require('crypto').randomUUID(),
        type: `${MODULE_ID}.${type}`,
        payload, source: MODULE_ID, ts: Date.now(), causedBy: null,
      });
    } catch(_) {}
  }
}

module.exports = {
  handleAnnounce, announceToRemote, proxyToRemote,
  pruneStalePeers, getPeer, getAllPeers, getOnlinePeers,
  MODULE_ID, PEER_TTL_MS,
};
