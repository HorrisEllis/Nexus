'use strict';
/**
 * lib/ncp.js — NEXUS Channel Protocol  v1.2.0
 * UUID: nexus-ncp-v1-0000-4000-0000-000000000001
 *
 * Architecture:
 *   Server → Client  :  SSE (EventSource in browser)
 *   Client → Server  :  fetch() POST
 *
 * v1.2.0 forensic fixes:
 *   BUG-01  readBody: Buffer[] accumulation — no implicit toString corruption
 *   BUG-02  handleChannel: flushHeaders in try/catch; closing flag prevents
 *           double-response on stale-client cleanup during in-flight readBody
 *   BUG-04  handleChannel: flushHeaders failure cleans up _clients entry
 *   BUG-05  getProviders: multi-tab aware — returns array per provider
 *   BUG-06  readBody: MAX_BODY guard (10 MB)
 *   BUG-07  handleChannel: rejects missing provider with 400
 */

const { randomUUID } = require('crypto');

const MAX_BODY = 10 * 1024 * 1024; // 10 MB

// ── Standalone helpers ────────────────────────────────────────────────────────

/**
 * jsonResponse — fixes "this._json is not a function" in AdminServer handlers.
 */
function jsonResponse(res, data, status = 200) {
  if (res.headersSent) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length':              Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * readBody — BUG-01: accumulate Buffer chunks, concat at end, then decode.
 * BUG-06: reject bodies over MAX_BODY.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY) {
        req.destroy();
        reject(new Error(`Request body too large (max ${MAX_BODY} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); }
      catch (_) { resolve(raw); }
    });
    req.on('error', reject);
  });
}

/**
 * handleOptions — CORS pre-flight.
 */
function handleOptions(res) {
  if (res.headersSent) return;
  res.writeHead(204, {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end();
}

// ── Server-side NCP handler ───────────────────────────────────────────────────

function createNCPServer({ onMessage, onConnect, onDisconnect, busEmit } = {}) {
  // key (provider:tabId) → { res, tabId, provider, connectedAt, lastHeartbeat, closing, domSystems }
  const _clients = new Map();

  function _write(res, data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  }

  /**
   * Handle GET /channel
   * BUG-04: flushHeaders in try/catch; cleanup on failure.
   * BUG-07: reject missing provider with 400.
   */
  function handleChannel(req, res, url) {
    // BUG-07: reject missing provider
    const provider = url.searchParams.get('provider');
    if (!provider) {
      if (!res.headersSent) {
        jsonResponse(res, { ok: false, error: 'Missing required query param: provider' }, 400);
      }
      return null;
    }

    const tabId = url.searchParams.get('tabId') || randomUUID();
    const key   = `${provider}:${tabId}`;

    if (res.headersSent) return { provider, tabId, key };

    // Close stale connection before writing new headers
    const stale = _clients.get(key);
    if (stale && stale.res !== res) {
      // BUG-02: mark stale as closing before ending so any pending readBody
      // on the old res doesn't attempt a second response write after end()
      stale.closing = true;
      try { stale.res.end(); } catch (_) {}
      _clients.delete(key);
    }

    // BUG-04: flushHeaders in try/catch
    try {
      res.writeHead(200, {
        'Content-Type':                'text/event-stream',
        'Cache-Control':               'no-cache',
        'Connection':                  'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Accel-Buffering':           'no',
      });
      res.flushHeaders();
    } catch (e) {
      // Socket died between request and headers — don't register this client
      busEmit?.('ncp.client.connect.failed', { provider, tabId, key, error: e.message }, 'WARN');
      return null;
    }

    const client = {
      res,
      tabId,
      provider,
      connectedAt:   Date.now(),
      lastHeartbeat: Date.now(),
      closing:       false,
      domSystems:    {},
    };
    _clients.set(key, client);

    _write(res, { type: 'NCP_READY', provider, tabId, ts: Date.now() });

    busEmit?.('ncp.client.connected', { provider, tabId, key }, 'INFO');
    onConnect?.({ provider, tabId, key });

    req.on('close', () => {
      _clients.delete(key);
      busEmit?.('ncp.client.disconnected', { provider, tabId, key }, 'INFO');
      onDisconnect?.({ provider, tabId, key });
    });

    return { provider, tabId, key };
  }

  /**
   * Handle POST /result
   * BUG-02: check client.closing before responding (stale cleanup guard).
   * Handles GUARDIAN_DOM_SYSTEMS → NCP_DOM_SYSTEMS.
   */
  function handleResult(req, res) {
    if (res.headersSent) return true;
    readBody(req).then(body => {
      // BUG-02: if this res belongs to a client that was just closed during
      // stale cleanup, don't try to write a response on an ended socket
      if (res.headersSent || res.destroyed) return;
      jsonResponse(res, { ok: true });

      if (!body || !body.type) return;

      busEmit?.('ncp.message.received', { type: body.type, provider: body.provider }, 'DEBUG');

      if (body.type === 'GUARDIAN_DOM_SYSTEMS' || body.type === 'NCP_DOM_SYSTEMS') {
        busEmit?.('ncp.dom.systems', {
          provider: body.provider,
          tabId:    body.tabId,
          systems:  body.systems || body.data || {},
          ts:       body.ts || Date.now(),
        }, 'DEBUG');
        const key    = `${body.provider}:${body.tabId}`;
        const client = _clients.get(key);
        if (client) client.domSystems = body.systems || body.data || {};
        onMessage?.({ ...body, type: 'NCP_DOM_SYSTEMS' });
        return;
      }

      onMessage?.(body);
    }).catch(e => {
      if (res.headersSent || res.destroyed) return;
      jsonResponse(res, { ok: false, error: e.message }, 400);
    });
    return true;
  }

  /**
   * Handle POST /heartbeat
   * BUG-03: single Date.now() call for consistency.
   */
  function handleHeartbeat(req, res) {
    if (res.headersSent) return true;
    readBody(req).then(body => {
      if (res.headersSent || res.destroyed) return;
      const { provider, tabId, ts } = body;
      const key    = `${provider}:${tabId}`;
      const client = _clients.get(key);
      const now    = Date.now(); // BUG-03: single call
      if (client) client.lastHeartbeat = now;

      jsonResponse(res, {
        type:      'NCP_HEARTBEAT_ACK',
        ts:        now,
        serverTs:  now,
        latency:   ts ? now - ts : null,
      });
    }).catch(() => {
      if (!res.headersSent && !res.destroyed) jsonResponse(res, {});
    });
    return true;
  }

  // ── Push API ─────────────────────────────────────────────────────────────────

  function push(provider, data) {
    let sent = 0;
    for (const client of _clients.values()) {
      if (client.provider === provider && !client.closing) {
        _write(client.res, data);
        sent++;
      }
    }
    return sent;
  }

  function pushTab(provider, tabId, data) {
    const key    = `${provider}:${tabId}`;
    const client = _clients.get(key);
    if (!client || client.closing) return false;
    _write(client.res, data);
    return true;
  }

  function broadcast(data) {
    let sent = 0;
    for (const client of _clients.values()) {
      if (!client.closing) { _write(client.res, data); sent++; }
    }
    return sent;
  }

  function isConnected(provider) {
    for (const client of _clients.values()) {
      if (client.provider === provider && !client.closing) return true;
    }
    return false;
  }

  /**
   * getProviders — BUG-05: returns array per provider so multi-tab is visible.
   * Shape: { claude: [{ tabId, connectedAt, lastHeartbeat, domSystems, age }], ... }
   */
  function getProviders() {
    const providers = {};
    for (const client of _clients.values()) {
      if (client.closing) continue;
      if (!providers[client.provider]) providers[client.provider] = [];
      providers[client.provider].push({
        tabId:         client.tabId,
        connectedAt:   client.connectedAt,
        lastHeartbeat: client.lastHeartbeat,
        domSystems:    client.domSystems || {},
        age:           Date.now() - client.connectedAt,
      });
    }
    return providers;
  }

  function clientCount() {
    let n = 0;
    for (const c of _clients.values()) if (!c.closing) n++;
    return n;
  }

  function ncpWrite(res, data) { _write(res, data); }

  // ── Stale eviction ───────────────────────────────────────────────────────────
  /**
   * evictStale — remove clients whose lastHeartbeat is older than maxAgeMs.
   * Called by the pulse system on each beat so stale provider tabs don't
   * silently accumulate in _clients after a browser crash or tab close.
   *
   * @param {number} maxAgeMs  — default 30000 (30s = 6 missed NCP heartbeats at 5s)
   * @returns {{ evicted: string[], remaining: number }}
   */
  function evictStale(maxAgeMs = 30000) {
    const cutoff  = Date.now() - maxAgeMs;
    const evicted = [];
    for (const [key, client] of _clients) {
      if (client.closing) continue;
      if (client.lastHeartbeat < cutoff) {
        client.closing = true;
        try { client.res.end(); } catch (_) {}
        _clients.delete(key);
        evicted.push(key);
        busEmit?.('ncp.client.evicted', {
          provider: client.provider,
          tabId:    client.tabId,
          key,
          age:      Date.now() - client.connectedAt,
          staleSince: Date.now() - client.lastHeartbeat,
        }, 'WARN');
        onDisconnect?.({ provider: client.provider, tabId: client.tabId, key });
      }
    }
    return { evicted, remaining: clientCount() };
  }

  /**
   * pulse — push NCP_PULSE to all connected clients.
   * Carries the current server timestamp and optional payload.
   * Clients use this to confirm the channel is alive end-to-end
   * (beyond just TCP keepalive — this proves the server is processing).
   *
   * @param {object} [payload]  — optional extra data (e.g. health snapshot)
   * @returns {number} clients reached
   */
  function pulse(payload = {}) {
    return broadcast({ type: 'NCP_PULSE', ts: Date.now(), ...payload });
  }

  /**
   * startStaleCheck — convenience: run evictStale on an interval.
   * Returns a stop function.
   *
   * @param {number} [intervalMs]  — default 15000
   * @param {number} [maxAgeMs]    — default 30000
   */
  function startStaleCheck(intervalMs = 15000, maxAgeMs = 30000) {
    const t = setInterval(() => evictStale(maxAgeMs), intervalMs);
    if (t.unref) t.unref();
    return () => clearInterval(t);
  }

  return {
    handleChannel,
    handleResult,
    handleHeartbeat,
    push,
    pushTab,
    broadcast,
    isConnected,
    getProviders,
    clientCount,
    ncpWrite,
    // Pulse additions
    evictStale,
    pulse,
    startStaleCheck,
  };
}

module.exports = {
  createNCPServer,
  jsonResponse,
  readBody,
  handleOptions,
};
