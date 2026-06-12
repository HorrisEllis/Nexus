'use strict';
/**
 * lib/ncp.js — NEXUS Channel Protocol
 * UUID: nexus-ncp-v1-0000-4000-0000-000000000001
 *
 * Replaces WebSocket (ws package) entirely.
 * Zero external dependencies. Built on Node's http module only.
 *
 * Architecture:
 *   Server → Client  :  SSE (EventSource in browser, long-held GET)
 *   Client → Server  :  fetch() POST (already works from https:// pages to localhost)
 *
 * Why this works from https:// pages:
 *   Browsers allow fetch() to localhost from any origin under the
 *   Private Network Access spec. No TLS needed for localhost.
 *   EventSource follows the same rule.
 *   WebSocket was the only thing that required TLS because it upgraded
 *   from HTTPS to WSS — that upgrade required matching TLS.
 *   SSE is a plain HTTP GET that stays open. No upgrade. No TLS required.
 *
 * Channel lifecycle:
 *   1. Client opens GET /channel?provider=claude&tabId=XYZ
 *   2. Server registers client in NCP_CLIENTS map
 *   3. Server sends: data: {"type":"NCP_READY","provider":"claude"}\n\n
 *   4. Client posts results to POST /result
 *   5. Server closes SSE on client disconnect or explicit close
 *
 * Equivalent to the old WSS protocol:
 *   GUARDIAN_JOB        → NCP writes to SSE channel
 *   GUARDIAN_READY      → NCP_READY event on open
 *   GUARDIAN_CLAIM      → NCP_CLAIM event on SSE
 *   GUARDIAN_HEARTBEAT_ACK → response body of POST /heartbeat
 *   GUARDIAN_REGISTER   → GET /channel query params
 *   GUARDIAN_DELIVERED  → POST /result { type:'NCP_DELIVERED', ... }
 *   GUARDIAN_COMPLETE   → POST /result { type:'NCP_COMPLETE', ... }
 *   GUARDIAN_CHUNK      → POST /result { type:'NCP_CHUNK', ... }
 *   GUARDIAN_ARTIFACT   → POST /result { type:'NCP_ARTIFACT', ... }
 *   GUARDIAN_ERROR      → POST /result { type:'NCP_ERROR', ... }
 */

const { randomUUID } = require('crypto');

// ── Server-side NCP handler ───────────────────────────────────────────────────

function createNCPServer({ onMessage, onConnect, onDisconnect, busEmit } = {}) {
  // provider → { res, tabId, provider, connectedAt, lastHeartbeat }
  const _clients = new Map();

  // §1.2 — SSE write helper. try/catch: never crash on broken pipe.
  function _write(res, data) {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch(_) {}
  }

  /**
   * Handle GET /channel — opens SSE channel for this provider tab.
   * Call from your HTTP request handler when url.pathname === '/channel'.
   */
  function handleChannel(req, res, url) {
    const provider = url.searchParams.get('provider') || 'unknown';
    const tabId    = url.searchParams.get('tabId')    || randomUUID();
    const key      = `${provider}:${tabId}`;

    // SSE headers — no TLS, no ws package, just HTTP
    if (res.headersSent) return { provider, tabId, key };
    res.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering':           'no',
    });
    res.flushHeaders();

    // Close stale connection if same key reconnects
    const stale = _clients.get(key);
    if (stale && stale.res !== res) {
      try { stale.res.end(); } catch(_) {}
      _clients.delete(key);
    }
    const client = { res, tabId, provider, connectedAt: Date.now(), lastHeartbeat: Date.now() };
    _clients.set(key, client);

    // Send ready event
    res.write(`data: ${JSON.stringify({ type: 'NCP_READY', provider, tabId, ts: Date.now() })}\n\n`);

    busEmit?.('ncp.client.connected', { provider, tabId, key }, 'INFO');
    onConnect?.({ provider, tabId, key });

    // Handle client disconnect
    req.on('close', () => {
      _clients.delete(key);
      busEmit?.('ncp.client.disconnected', { provider, tabId, key }, 'INFO');
      onDisconnect?.({ provider, tabId, key });
    });

    return { provider, tabId, key };
  }

  /**
   * Handle POST /result — receives messages from the browser.
   * Call from your HTTP request handler when url.pathname === '/result'.
   */
  function handleResult(req, res, readBody) {
    // §1.2 — guard against double-response (ERR_HTTP_HEADERS_SENT)
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent) return;  // race: already answered
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ ok: true }));
      if (body.type) {
        busEmit?.('ncp.message.received', { type: body.type, provider: body.provider }, 'DEBUG');
        onMessage?.(body);
      }
    }).catch(e => {
      if (res.headersSent) return;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    });
    return true;
  }

  /**
   * Handle POST /heartbeat — provider heartbeat.
   * Returns ACK with server timestamp. Replaces GUARDIAN_HEARTBEAT over WSS.
   */
  function handleHeartbeat(req, res, readBody) {
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent) return;
      const { provider, tabId, ts } = body;
      const key = `${provider}:${tabId}`;
      const client = _clients.get(key);
      if (client) client.lastHeartbeat = Date.now();

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        type: 'NCP_HEARTBEAT_ACK',
        ts: Date.now(),
        serverTs: Date.now(),
        latency: ts ? Date.now() - ts : null,
      }));
    }).catch(() => {
      res.writeHead(200); res.end('{}');
    });
    return true;
  }

  // ── Push to clients ─────────────────────────────────────────────────────────

  /**
   * Push a message to a specific provider.
   * Equivalent to send(ws, { type, ...data }) in the old WSS system.
   */
  function push(provider, data) {
    let sent = 0;
    for (const [key, client] of _clients) {
      if (client.provider === provider) {
        _write(client.res, data);
        sent++;
      }
    }
    return sent;
  }

  /**
   * Push to a specific tab.
   */
  function pushTab(provider, tabId, data) {
    const key = `${provider}:${tabId}`;
    const client = _clients.get(key);
    if (!client) return false;
    _write(client.res, data);
    return true;
  }

  /**
   * Broadcast to all connected clients.
   * Equivalent to broadcast() in the old WSS system.
   */
  function broadcast(data) {
    for (const client of _clients.values()) {
      _write(client.res, data);
    }
    return _clients.size;
  }

  /**
   * Check if a provider is connected.
   * Equivalent to PROVIDERS[provider] !== null in the old WSS system.
   */
  function isConnected(provider) {
    for (const client of _clients.values()) {
      if (client.provider === provider) return true;
    }
    return false;
  }

  /**
   * Get all connected providers.
   */
  function getProviders() {
    const providers = {};
    for (const client of _clients.values()) {
      providers[client.provider] = {
        tabId:        client.tabId,
        connectedAt:  client.connectedAt,
        lastHeartbeat:client.lastHeartbeat,
        age:          Date.now() - client.connectedAt,
      };
    }
    return providers;
  }

  function clientCount() { return _clients.size; }

  return {
    // Route handlers — call these from your HTTP server
    handleChannel,
    handleResult,
    handleHeartbeat,
    // Push API
    push,
    pushTab,
    broadcast,
    // State
    isConnected,
    getProviders,
    clientCount,
  };
}

module.exports = { createNCPServer };
