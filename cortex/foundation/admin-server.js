'use strict';
// ── cortex/foundation/admin-server.js ────────────────────────────────────────
// UUID: admin-server-v6-0000-4000-0000-000000000001
// Version: 6.0.0
//
// HTTP admin layer over JAA + working memory + mind-bridge.
//
// v6.0.0 changes (additive only — no existing routes altered):
//   - mind-bridge dispatch wired into the default case before 404
//   - urlParams object passed to dispatch() for ?query= access
//   - /api/wm/* routes served via mind-bridge (§WM.2)
//   - /api/guardian/* routes served via mind-bridge (§LAW_III)
//   - /health now includes wm.stats() and guardian.health snapshot
//
// §WM.2  all state is queryable — no system needs direct JAA access.
// §LAW_III mind-bridge is the only surface between cortex and guardian.

const http       = require('http');
const bridge     = (() => { try { return require('../../bridge/nexus-bridge'); } catch(_) { return null; } })();
const { jaaDB, uid } = require('../memory/jaa-db');
const { TABLES }     = require('../memory/jaa-tables');
const { core }       = require('./cobalt-core');
const mindBridge     = require('../guardian/mind-bridge');
const siphon         = (() => { try { return require('../guardian/siphon');   } catch(_) { return null; } })();
const pulse          = (() => { try { return require('../guardian/pulse');    } catch(_) { return null; } })();
const watchman       = (() => { try { return require('../guardian/watchman'); } catch(_) { return null; } })();

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
        if (err) reject(err); else resolve();
      });
    });

    this._sseTimer = setInterval(() => this._pushSSE(), 1000);
    this._sseTimer.unref();
  }

  async stop() {
    clearInterval(this._sseTimer);
    for (const c of this._sseClients) { try { c.end(); } catch {} }
    this._sseClients.clear();
    await new Promise(r => this._server?.close(r));
  }

  // ── SSE push ───────────────────────────────────────────────────────────────
  _pushSSE() {
    if (!this._sseClients.size) return;
    if (this._lastLogId === 0) {
      const all = jaaDB.tail(TABLES.EVENT_LOG, 1);
      this._lastLogId = all.length ? (all[0]._rowId || 0) : 0;
      return;
    }
    const newRows = jaaDB.query(TABLES.EVENT_LOG, r => r._rowId > this._lastLogId, 100);
    if (!newRows.length) return;
    this._lastLogId = newRows[newRows.length - 1]._rowId;
    const dead = [];
    for (const c of this._sseClients) {
      try { for (const row of newRows) c.write(`data: ${JSON.stringify(row)}\n\n`); }
      catch { dead.push(c); }
    }
    for (const c of dead) this._sseClients.delete(c);
  }

  // ── Request handler ────────────────────────────────────────────────────────
  async _handle(req, res) {
    const url    = new URL(req.url, `http://127.0.0.1:${this._port}`);
    const route  = `${req.method} ${url.pathname}`;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Build urlParams from query string
    const urlParams = {};
    for (const [k, v] of url.searchParams.entries()) urlParams[k] = v;

    try {
      switch (true) {

        // ── UI ───────────────────────────────────────────────────────────────
        case route === 'GET /' || route === 'GET /cortex' || route === 'GET /cortex/': {
          const fs2    = require('fs');
          const uiPath = require('path').join(__dirname, '..', '..', 'ui', 'cortex.html');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(fs2.existsSync(uiPath)
            ? fs2.readFileSync(uiPath, 'utf8')
            : '<html><body style="background:#0d0d0f;color:#e4e4ea;font-family:monospace;padding:40px"><h2>⬡ CORTEX v6</h2></body></html>');
          break;
        }

        // ── Health (extended with wm.stats + guardian) ────────────────────────
        case route === 'GET /health': {
          const { getWM } = require('../working-memory');
          const wm = getWM();
          const guardianHealth = jaaDB.tail(TABLES.GUARDIAN_HEALTH, 1)[0] || null;
          this._json(res, 200, {
            status:   'ok',
            version:  '6.0.0',
            uptime:   process.uptime(),
            jaa:      jaaDB.stats,
            wm:       wm.stats(),
            guardian: {
              connected:   guardianHealth?.connected || false,
              lastBeat:    guardianHealth?.ts         || null,
              version:     guardianHealth?.version    || null,
            },
            cobalt:   core.status?.(),
            ts:       Date.now(),
          });
          break;
        }

        // ── Bridge proxy ──────────────────────────────────────────────────────
        case route === 'GET /api/bridge/health': {
          this._json(res, 200, bridge ? { ok: true, bridge: 'mounted' } : { ok: false, bridge: 'not loaded' });
          break;
        }
        case route === 'GET /api/tags': {
          const entityId = url.searchParams.get('entityId');
          const tag      = url.searchParams.get('tag');
          if (entityId && bridge) this._json(res, 200, { ok: true, tags: bridge.getTags(entityId) });
          else if (tag && bridge) this._json(res, 200, { ok: true, entities: bridge.findByTag(tag) });
          else this._json(res, 400, { ok: false, error: 'entityId or tag required' });
          break;
        }
        case route === 'POST /api/tags': {
          this._body(req, body => {
            if (bridge) bridge.tag(body.entityId, body.tag, body.meta);
            this._json(res, 200, { ok: true });
          });
          return;
        }
        case route === 'GET /api/bridge/requests': {
          this._json(res, 200, bridge ? bridge.getRequests?.() || [] : []);
          break;
        }
        case route === 'POST /api/bridge/broadcast': {
          this._body(req, body => {
            if (bridge) bridge.broadcast?.(body.type, body.payload);
            this._json(res, 200, { ok: true });
          });
          return;
        }

        // ── Contract ──────────────────────────────────────────────────────────
        case route === 'GET /contract': {
          const fs2 = require('fs');
          const p   = require('path').join(__dirname, '..', 'interaction-contract.json');
          this._json(res, 200, fs2.existsSync(p) ? JSON.parse(fs2.readFileSync(p, 'utf8')) : {});
          break;
        }

        // ── CLI exec ──────────────────────────────────────────────────────────
        case route === 'POST /api/cli/exec': {
          this._body(req, body => {
            const { command, args = [] } = body;
            jaaDB.insert(TABLES.CLI_HISTORY, { uuid: uid(), command, args, ts: Date.now(), source: 'cli' });
            // Commands are handled by cortex-v2 REPL — this is the intake gate
            switch (command) {
              case 'tail': {
                const table = args[0] || TABLES.EVENT_LOG;
                const n     = parseInt(args[1]) || 20;
                this._json(res, 200, { ok: true, rows: jaaDB.tail(table, n) });
                break;
              }
              case 'status':
                this._json(res, 200, { ok: true, jaa: jaaDB.stats, uptime: process.uptime() });
                break;
              default:
                this._json(res, 400, { ok: false, error: `unknown command: ${command}` });
            }
          });
          return;
        }

        // ── JAA read surface ──────────────────────────────────────────────────
        case route === 'GET /api/ring': {
          const table = url.searchParams.get('table') || TABLES.EVENT_LOG;
          const n     = parseInt(url.searchParams.get('n')) || 50;
          this._json(res, 200, jaaDB.tail(table, n));
          break;
        }
        case route === 'GET /api/gaps': {
          const sev  = url.searchParams.get('severity');
          const rows = jaaDB.query(TABLES.GAPS, r => r.status === 'open' && (!sev || r.severity === sev), 100);
          this._json(res, 200, rows);
          break;
        }
        case route === 'GET /api/failures': {
          const n = parseInt(url.searchParams.get('n')) || 50;
          this._json(res, 200, jaaDB.tail(TABLES.FAILURES, n));
          break;
        }
        case route === 'GET /api/events': {
          const n = parseInt(url.searchParams.get('n')) || 50;
          this._json(res, 200, jaaDB.tail(TABLES.EVENT_LOG, n));
          break;
        }
        case route === 'GET /api/memory': {
          const n = parseInt(url.searchParams.get('n')) || 20;
          this._json(res, 200, jaaDB.tail(TABLES.CORTEX_MEMORY, n));
          break;
        }
        case route === 'POST /api/memory/search': {
          this._body(req, body => {
            const term = body.query || body.term || '';
            const rows = jaaDB.query(TABLES.CORTEX_MEMORY, r => {
              if (!term) return true;
              const t = term.toLowerCase();
              return (r.content || '').toLowerCase().includes(t);
            }, 50);
            jaaDB.insert(TABLES.MEMORY_QUERIES, { uuid: uid(), query: term, results: rows.length, ts: Date.now(), source: 'admin' });
            this._json(res, 200, rows);
          });
          return;
        }
        case route === 'POST /api/memory/forget': {
          this._body(req, body => {
            const { uuid } = body;
            if (uuid) jaaDB.update(TABLES.CORTEX_MEMORY, uuid, { tier: 'forgotten', forgottenAt: Date.now() });
            this._json(res, 200, { ok: true });
          });
          return;
        }
        case route === 'POST /api/event': {
          this._body(req, body => {
            const { type, payload, source, causedBy } = body;
            if (!type) { this._json(res, 400, { error: 'type required' }); return; }
            const ev = jaaDB.insert(TABLES.EVENT_LOG, {
              uuid: uid(), type, payload: payload || {},
              source: source || 'external', causedBy: causedBy || null, ts: Date.now(),
            });
            this._json(res, 200, ev);
          });
          return;
        }
        case route === 'GET /api/requests': {
          this._json(res, 200, jaaDB.tail(TABLES.REQUESTS, 50));
          break;
        }
        case route === 'GET /api/modules': {
          const pollRegistry = (() => { try { return require('./poll-registry'); } catch { return null; } })();
          this._json(res, 200, pollRegistry?.modules || []);
          break;
        }

        // ── SSE ───────────────────────────────────────────────────────────────
        case route === 'GET /sse': {
          res.writeHead(200, {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
          });
          res.write('data: {"type":"connected"}\n\n');
          this._sseClients.add(res);
          req.on('close', () => this._sseClients.delete(res));
          return;
        }

        // ── Guardian layer module stats (LAW V — every state accessible) ──────
        case route === 'GET /api/guardian/siphon/stats': {
          this._json(res, 200, siphon?.stats() || { error: 'siphon not loaded' }); break;
        }
        case route === 'GET /api/guardian/pulse/stats': {
          this._json(res, 200, pulse?.stats() || { error: 'pulse not loaded' }); break;
        }
        case route === 'GET /api/guardian/watchman/status': {
          this._json(res, 200, watchman?.latestHealth() || { error: 'watchman not loaded' }); break;
        }
        case route === 'GET /api/guardian/watchman/history': {
          const n = parseInt(url.searchParams.get('n')) || 20;
          this._json(res, 200, watchman?.healthHistory(n) || []); break;
        }

        // ── Guardian + Working Memory + Relay (§WM.2, §LAW_III) ──────────────
        // All /api/guardian/* and /api/wm/* routes are handled by mind-bridge.
        // This is the only place mind-bridge.dispatch() is called.
        default: {
          if (req.method === 'GET' || req.method === 'DELETE') {
            const { handled, result } = mindBridge.dispatch(req.method, url.pathname, {}, urlParams);
            if (handled) { this._json(res, 200, result); return; }
          } else {
            // POST / PUT / PATCH — need body first
            this._body(req, body => {
              const { handled, result } = mindBridge.dispatch(req.method, url.pathname, body, urlParams);
              if (handled) { this._json(res, 200, result); return; }
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'not found', route }));
            });
            return;
          }
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found', route }));
        }
      }
    } catch (err) {
      console.error('[AdminServer §1.2] handler error:', err.message);
      try {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } catch {}
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  // FIX-6: handle stream errors + malformed body explicitly.
  // req.on('error') is required — without it, stream errors become uncaught exceptions.
  // JSON parse failure logs the route so callers can diagnose bad clients.
  _body(req, cb) {
    let raw = '';
    req.on('data', d => { raw += d; });
    req.on('error', err => {
      console.error('[AdminServer §1.2] request stream error:', err.message);
      try { cb({}); } catch (_) {}
    });
    req.on('end', () => {
      if (!raw) { cb({}); return; }
      try {
        cb(JSON.parse(raw));
      } catch (e) {
        console.error('[AdminServer §1.2] JSON parse failed — body was:', raw.slice(0, 120));
        cb({});
      }
    });
  }
}

module.exports = { AdminServer };
