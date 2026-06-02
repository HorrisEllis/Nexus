'use strict';
// ── foundation/admin-server.js ────────────────────────────────────────────────
// UUID: admin-server-v5-0000-4000-0000-000000000001
//
// HTTP read-layer over JAA + write gateway for external inputs.
// SSE: polls event_log every 1s, pushes diffs (§G-V5-05 resolved).
// Port: §P1 — 3748.
//
// No kernel bus bridging in v5.0. JAA is the source of truth.

const http   = require('http');
const bridge = (() => { try { return require('../../bridge/nexus-bridge'); } catch(_) { return null; } })();
const { jaaDB, uid } = require('../memory/jaa-db');
const { core }       = require('./cobalt-core');

const DEFAULT_PORT = 3748;

class AdminServer {
  constructor({ port = DEFAULT_PORT } = {}) {
    this._port       = port;
    this._server     = null;
    this._sseClients = new Set();
    this._lastLogId  = 0;
    this._sseTimer   = null;
  }

  async start() {
    this._server = http.createServer((req, res) => this._handle(req, res));

    await new Promise((resolve, reject) => {
      if (bridge) bridge.mount(this._server, 'cortex');
    this._server.listen(this._port, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // SSE: poll event_log every 1s (§G-V5-05)
    this._sseTimer = setInterval(() => this._pushSSE(), 1000);
    this._sseTimer.unref();

    console.log(`[AdminServer] listening on http://127.0.0.1:${this._port}`);
  }

  async stop() {
    clearInterval(this._sseTimer);
    for (const client of this._sseClients) {
      try { client.end(); } catch {}
    }
    this._sseClients.clear();
    await new Promise(resolve => this._server?.close(resolve));
  }

  _pushSSE() {
    if (!this._sseClients.size) return;

    const newRows = jaaDB.query('event_log', r => r._rowId > this._lastLogId, 100);
    if (!newRows.length) return;

    this._lastLogId = newRows[newRows.length - 1]._rowId;

    const dead = [];
    for (const client of this._sseClients) {
      try {
        for (const row of newRows) {
          client.write(`data: ${JSON.stringify(row)}\n\n`);
        }
      } catch {
        dead.push(client);
      }
    }
    for (const c of dead) this._sseClients.delete(c);
  }

  _handle(req, res) {
    const url    = new URL(req.url, `http://127.0.0.1:${this._port}`);
    const route  = `${req.method} ${url.pathname}`;

    // ── CORS ──────────────────────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    try {
      switch (true) {
        // ── GET /health ──────────────────────────────────────────────────────
        case route === 'GET /' || route === 'GET /cortex' || route === 'GET /cortex/': {
          const uiPath = require('path').join(__dirname, '..', '..', 'ui', 'cortex.html');
          const fs2 = require('fs');
          if (fs2.existsSync(uiPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fs2.readFileSync(uiPath, 'utf8'));
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html><body style="background:#0d0d0f;color:#e4e4ea;font-family:monospace;padding:40px"><h2>⬡ CORTEX</h2><p>UI not found at ' + uiPath + '</p></body></html>');
          }
          break;
        }
        // ── Bridge proxy routes ────────────────────────────────────────────
        case route === 'GET /api/bridge/health': {
          const b = bridge ? { ok:true, bridge:'mounted' } : { ok:false, bridge:'not loaded' };
          this._json(res, 200, b); break;
        }
        case route === 'GET /api/tags': {
          const entityId = url.searchParams.get('entityId');
          const tag      = url.searchParams.get('tag');
          if (entityId && bridge) { this._json(res, 200, { ok:true, tags: bridge.getTags(entityId) }); }
          else if (tag && bridge) { this._json(res, 200, { ok:true, entities: bridge.findByTag(tag) }); }
          else { this._json(res, 400, { ok:false, error:'entityId or tag required' }); }
          break;
        }
        case route === 'POST /api/tags': {
          const b = await this._body(req);
          if (bridge) bridge.tag(b.entityId, b.entityType, b.system, b.tags, b.addedBy);
          this._json(res, 200, { ok:true }); break;
        }
        case route === 'GET /api/bridge/requests': {
          const filter = Object.fromEntries(url.searchParams);
          this._json(res, 200, { ok:true, requests: bridge ? bridge.listRequests(filter) : [] }); break;
        }
        case route === 'POST /api/bridge/broadcast': {
          const b = await this._body(req);
          if (bridge) bridge.broadcast(b);
          this._json(res, 200, { ok:true }); break;
        }
        case route === 'GET /health': {
          const last = jaaDB.tail('event_log', 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status:  'ok',
            uptime:  process.uptime(),
            cobalt:  core.stats,
            jaa:     jaaDB.stats,
            lastEvent: last[0] || null,
          }));
          break;
        }

        // ── GET /api/ring — debug ring buffer ─────────────────────────────
        case route === 'GET /api/ring': {
          const n = parseInt(url.searchParams.get('n') || '100');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(core.bus.ring(n)));
          break;
        }

        // ── GET /api/gaps ─────────────────────────────────────────────────
        case route === 'GET /api/gaps': {
          const status = url.searchParams.get('status');
          const rows   = jaaDB.query('gaps',
            status ? r => r.status === status : () => true,
            200
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── GET /api/failures ─────────────────────────────────────────────
        case route === 'GET /api/failures': {
          const rows = jaaDB.tail('failures', 100);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── GET /api/events ───────────────────────────────────────────────
        case route === 'GET /api/events': {
          const n    = parseInt(url.searchParams.get('n') || '50');
          const rows = jaaDB.tail('event_log', n);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── GET /api/memory ───────────────────────────────────────────────
        case route === 'GET /api/memory': {
          const table = url.searchParams.get('table') || 'cortex_memory';
          const n     = parseInt(url.searchParams.get('n') || '40');
          const rows  = jaaDB.tail(table, n);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── POST /api/memory/search ───────────────────────────────────────
        case route === 'POST /api/memory/search': {
          this._readBody(req, (body) => {
            const { tags = [] } = JSON.parse(body || '{}');
            const rows = jaaDB.query('cortex_memory',
              r => r.tags && tags.some(t => r.tags.some(rt => rt.includes(t))),
              100
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(rows));
          });
          return;
        }

        // ── POST /api/memory/forget ───────────────────────────────────────
        case route === 'POST /api/memory/forget': {
          this._readBody(req, (body) => {
            const { id } = JSON.parse(body || '{}');
            if (!id) { res.writeHead(400); res.end(JSON.stringify({ error: 'id required' })); return; }
            const updated = jaaDB.update('cortex_memory', id, { status: 'forgotten', _forgotAt: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: !!updated }));
          });
          return;
        }

        // ── POST /api/event — inject event ────────────────────────────────
        case route === 'POST /api/event': {
          this._readBody(req, (body) => {
            const { type, payload, source } = JSON.parse(body || '{}');
            if (!type) { res.writeHead(400); res.end(JSON.stringify({ error: 'type required' })); return; }
            const row = jaaDB.insert('event_log', { uuid: uid(), type, payload: payload || {}, source: source || 'admin', causedBy: null, ts: Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
          });
          return;
        }

        // ── GET /api/requests ─────────────────────────────────────────────
        case route === 'GET /api/requests': {
          const rows = jaaDB.tail('requests', 100);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── GET /api/modules ──────────────────────────────────────────────
        case route === 'GET /api/modules': {
          const rows = jaaDB.query('project_registry', () => true, 50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(rows));
          break;
        }

        // ── GET /sse — Server-Sent Events ────────────────────────────────
        case route === 'GET /sse': {
          res.writeHead(200, {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
          });
          res.write(`data: ${JSON.stringify({ type: 'sse.connected', ts: Date.now() })}\n\n`);
          this._sseClients.add(res);
          req.on('close', () => this._sseClients.delete(res));
          return; // keep open
        }

        // ── 404 ───────────────────────────────────────────────────────────
        default: {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found', route }));
        }
      }
    } catch (err) {
      console.error('[AdminServer] handler error:', err.message);
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } catch {}
    }
  }

  _readBody(req, cb) {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => cb(body));
  }
}

module.exports = { AdminServer };
