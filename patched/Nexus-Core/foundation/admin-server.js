// ═══════════════════════════════════════════════════
// NEXUS — Admin Server
// foundation/admin-server.js
// UUID: nexus-admin-server-4000-000000000001
//
// Zero-dependency HTTP server for the NEXUS admin panel.
// Uses Node built-in 'http', 'fs', 'path' only.
//
// DESIGN:
//   No WebSocket. No ws package. No NanoWS.
//   Admin panel gets live kernel events via SSE
//   (Server-Sent Events — built into every browser).
//   Bridge heartbeat monitors NEXUS via GET /health.
//
// ROUTES:
//   GET  /health          ← Bridge heartbeat polls here
//   GET  /api/stream      ← SSE — live kernel events + heartbeat ping
//   GET  /api/status      ← one-shot snapshot
//   GET  /api/events?n=N  ← last N ring buffer events
//   GET  /api/crystals    ← MCL crystal state
//   GET  /api/bep         ← BEP pattern count + top patterns
//   POST /api/emit        ← { type, payload } → kernel.emit()
//   GET  /admin           ← serves admin/index.html
//   GET  /admin/*         ← static files from admin/
//   GET  /                ← redirect → /admin
//
// HEARTBEAT PROTOCOL:
//   Every 15s: SSE event: ping  (keeps connection alive through proxies)
//   Every kernel.emit(): SSE event: nexus  data: { type, payload, tick, id }
//
// BRIDGE REGISTRATION:
//   On boot, optionally registers with Bridge heartbeat at :3747
//   Bridge then monitors NEXUS health score (BPM, latency, missed beats).
//
// §1.2  Nothing silently fails — every error logged to kernel bus
// §5.1  UUID on the server instance
// §5.7  Zero direct module calls — admin panel uses /api/emit only
// ═══════════════════════════════════════════════════

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── Guardian API connector (v8) ────────────────────────────────────────────────
// admin-server.js /api/complete relays prompts to Guardian extension via kernel events.
// If the extension is not connected, we now fall back directly to Guardian v8 HTTP API
// on :7820 using GuardianAPI.dispatch() — POST /command → poll /status → GET /response.
const { GuardianAPI } = require('./guardian-api');
const _guardian = new GuardianAPI({
  port:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  ipcToken: process.env.GUARDIAN_IPC_TOKEN || '',
});

const DEFAULT_PORT    = 3748;
const SSE_PING_MS     = 15_000;   // keepalive ping interval
const MAX_SSE_CLIENTS = 32;
const CORS_ORIGIN     = '*';      // admin panel is local-only

// ── MIME types for static serving ─────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
};

// ── AdminServer ────────────────────────────────────

class AdminServer {
  /**
   * @param {object} opts
   * @param {object} opts.kernel      — ALKKernel singleton
   * @param {number} [opts.port]      — HTTP port (default 3748)
   * @param {string} [opts.adminDir]  — path to admin/ directory
   * @param {object} [opts.jaaDB]     — JaaDB instance (optional, for /api/crystals)
   * @param {object} [opts.mcl]       — MCL instance (optional)
   * @param {object} [opts.bep]       — BEP instance (optional)
   * @param {object} [opts.usage]     — usage module (optional)
   * @param {object} [opts.raid]      — RAID engine (optional)
   */
  constructor({ kernel, port, adminDir, jaaDB = null, mcl = null, bep = null, usage = null, raid = null }) {
    this._kernel   = kernel;
    this._port     = port || DEFAULT_PORT;
    this._adminDir = adminDir || path.join(__dirname, '..', 'admin');
    this._jaaDB    = jaaDB;
    this._mcl      = mcl;
    this._bep      = bep;
    this._usage    = usage;
    this._raid     = raid;

    this._sseClients = new Set();   // Set<{ res, id }>
    this._pingTimer       = null;
    this._pendingGuardian = new Map(); // calltoId → { res, timeout, service, ts }
    this._guardianConnected = false;  // true when Guardian extension has handshaked
    this._server     = null;
    this._startedAt  = Date.now();
    this._clientSeq  = 0;
  }

  // ── Boot ──────────────────────────────────────────

  start() {
    this._server = http.createServer((req, res) => this._handle(req, res));

    this._server.on('error', (e) => {
      this._kernel.emit('admin.server.error', { message: e.message, code: e.code });
      console.error(`[AdminServer] HTTP error: ${e.message}`);
      if (this._readyReject) this._readyReject(e);
    });

    // Returns a Promise that resolves once the HTTP server is bound
    // and the SSE kernel wildcard is wired. Boot awaits this before
    // emitting nexus.cli.pulse so the first pulse is guaranteed to
    // reach any SSE client that connects after this point.
    this._ready = new Promise((resolve, reject) => {
      this._readyReject = reject;
      this._server.listen(this._port, '127.0.0.1', () => {
        // Wire kernel wildcard → SSE broadcast (must happen before first pulse)
        this._kernel.on('**', (ev) => this._broadcast('nexus', ev));

        // Start SSE keepalive ping
        this._pingTimer = setInterval(() => this._broadcastRaw('ping', '{}'), SSE_PING_MS);

        this._kernel.emit('admin.server.ready', {
          port:     this._port,
          adminDir: this._adminDir,
          url:      `http://localhost:${this._port}/admin`,
        });

        console.log(`[NEXUS] Admin panel → http://localhost:${this._port}/admin`);
        resolve(this);
      });
    });

    return this._ready;
  }

  stop() {
    clearInterval(this._pingTimer);
    for (const client of this._sseClients) {
      try { client.res.end(); } catch {}
    }
    this._sseClients.clear();
    this._server?.close();
  }

  // ── Request router ────────────────────────────────

  async _handle(req, res) {
    const url    = new URL(req.url, `http://localhost:${this._port}`);
    const method = req.method.toUpperCase();
    const p      = url.pathname;

    // CORS — admin panel is served from same origin but allow all for dev
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    try {
      // ── Guardian handshake + heartbeat ───────────────
      // Guardian connects to :3748 (same port as admin).
      // These routes complete the handshake so status shows CONNECTED.
      if (method === 'POST' && p === '/guardian/handshake') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const token = payload.instanceId || ('nexus-' + Date.now().toString(36));
            this._guardianConnected = true; // extension is live
            this._kernel.emit('guardian.handshake', { instanceId: payload.instanceId, capabilities: payload.capabilities });
            return this._json(res, 200, {
              ok: true, ack: true, token, version: '2.0.0',
              capabilities: ['callto','listener','link','snapshot','route','pulse'],
              ts: Date.now(),
            });
          } catch { return this._json(res, 400, { ok: false, reason: 'bad json' }); }
        });
        return;
      }

      if (method === 'POST' && p === '/guardian/heartbeat') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            this._guardianConnected = true; // heartbeat = still live
            this._kernel.emit('guardian.heartbeat', { instanceId: payload.instanceId, listenerCount: payload.listenerCount, sessionCount: payload.sessionCount });
            return this._json(res, 200, { ok: true, ts: Date.now() });
          } catch { return this._json(res, 400, { ok: false }); }
        });
        return;
      }

      if (method === 'GET' && p === '/guardian/health') {
        return this._json(res, 200, { ok: true, service: 'nexus-admin', ts: Date.now() });
      }

      if (method === 'GET' && p === '/guardian/status') {
        return this._json(res, 200, { ok: true, version: '2.0.0', sessions: [], count: 0, ts: Date.now() });
      }

      // ── Guardian execution bridge ─────────────────────────────────────────
      // Primary path: relay through kernel event → BroadcastChannel → Guardian extension.
      // Fallback path: Guardian v8 HTTP API (:7820) when extension is not connected.
      // Guardian server.js does NOT have /api/complete — use POST /command → poll /status → GET /response.
      if (method === 'POST' && p === '/api/complete') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', async () => {
          try {
            const { service, prompt, maxTokens = 4096 } = JSON.parse(body || '{}');
            if (!service || !prompt) return this._json(res, 400, { ok: false, reason: 'service and prompt required' });

            const calltoId = 'nexus-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

            // Check if Guardian extension is connected (has a live WSS client)
            const extensionConnected = this._guardianConnected ?? false;

            if (extensionConnected) {
              // Primary: relay via kernel event → BroadcastChannel → extension
              const pending = { res, calltoId, service, ts: Date.now() };
              this._pendingGuardian.set(calltoId, pending);
              this._kernel.emit('nexus.guardian.execute', { calltoId, service, prompt, maxTokens });
              pending.timeout = setTimeout(() => {
                if (!this._pendingGuardian.has(calltoId)) return;
                this._pendingGuardian.delete(calltoId);
                this._json(res, 504, { ok: false, reason: 'Guardian extension timeout — falling back to HTTP API' });
              }, 90_000);
            } else {
              // Fallback: Guardian v8 HTTP API (:7820)
              try {
                const text = await _guardian.dispatch(service, prompt, { command: 'code', timeout: 90_000 });
                this._kernel.emit('agent.response.received', { calltoId, service, text, ok: true, source: 'guardian-http' });
                return this._json(res, 200, { ok: true, content: text, calltoId });
              } catch (e) {
                return this._json(res, 503, { ok: false, reason: `Guardian HTTP fallback failed: ${e.message}` });
              }
            }
          } catch { return this._json(res, 400, { ok: false, reason: 'bad json' }); }
        });
        return;
      }

      // ── CLI command runner ───────────────────────────────────────────────────
      // POST /api/run { command: "manifest.generate build a JWT API" }
      // Calls dispatch() directly — same as typing in CLI REPL.
      // Output streams back as SSE events (nexus.cli.run.output).
      // §1.2: errors are loud — failures emit nexus.cli.run.error.
      if (method === 'POST' && p === '/api/run') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', async () => {
          try {
            const { command } = JSON.parse(body || '{}');
            if (!command?.trim()) return this._json(res, 400, { ok: false, reason: 'command required' });

            const runId = 'run-' + Date.now().toString(36);
            this._json(res, 200, { ok: true, runId, command });

            // Emit start event
            this._kernel.emit('nexus.cli.run.start', { runId, command });

            // Intercept print output — redirect to SSE
            const { dispatch } = require('../cli');
            const argv = command.trim().split(/\s+/);

            // Capture console.log during dispatch
            const origLog  = console.log;
            const origWarn = console.warn;
            const origErr  = console.error;
            const lines    = [];

            const capture = (level) => (...args) => {
              const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
              lines.push({ level, text });
              this._kernel.emit('nexus.cli.run.output', { runId, level, text, ts: Date.now() });
              origLog(text); // still print to Node stdout
            };

            console.log  = capture('info');
            console.warn = capture('warn');
            console.error = capture('err');

            try {
              await dispatch(argv);
              this._kernel.emit('nexus.cli.run.done', { runId, command, lines: lines.length, ok: true });
            } catch (e) {
              this._kernel.emit('nexus.cli.run.error', { runId, command, error: e.message, ok: false });
            } finally {
              console.log  = origLog;
              console.warn = origWarn;
              console.error = origErr;
            }
          } catch (e) {
            return this._json(res, 400, { ok: false, reason: e.message });
          }
        });
        return;
      }

      // GET /api/grammar — list all registered CLI commands
      if (method === 'GET' && p === '/api/grammar') {
        try {
          const { grammar } = require('../cli');
          const commands = [...grammar.entries()].map(([path, cmd]) => ({
            path,
            args:    cmd.args    || [],
            flags:   cmd.flags   || [],
            emits:   cmd.emits   || [],
            help:    cmd.help    || '',
            example: cmd.example || '',
          }));
          return this._json(res, 200, { ok: true, commands });
        } catch (e) {
          return this._json(res, 500, { ok: false, reason: e.message });
        }
      }

      // Guardian posts response back when execution complete
      if (method === 'POST' && p === '/api/complete/result') {
        let body = '';
        req.on('data', d => body += d);
        req.on('end', () => {
          try {
            const { calltoId, text, complete, ok } = JSON.parse(body || '{}');
            const pending = this._pendingGuardian.get(calltoId);
            if (!pending) return this._json(res, 200, { ok: true, ack: true });
            if (!complete) return this._json(res, 200, { ok: true, ack: 'streaming' });

            clearTimeout(pending.timeout);
            this._pendingGuardian.delete(calltoId);
            this._kernel.emit('agent.response.received', { calltoId, service: pending.service, text, ok: ok !== false });
            return this._json(pending.res, 200, { ok: true, content: text, calltoId });
          } catch { return this._json(res, 400, { ok: false }); }
        });
        return;
      }

      // ── Health (Bridge heartbeat polls this) ───────
      if (method === 'GET' && p === '/health') {
        return this._json(res, 200, {
          ok:        true,
          service:   'nexus-core',
          version:   '2.0.0',
          uptime:    Date.now() - this._startedAt,
          tick:      this._kernel.ring.at(-1)?.tick ?? 0,
          ringSize:  this._kernel.ring.length,
          sseClients:this._sseClients.size,
          ts:        Date.now(),
        });
      }

      // ── SSE stream ────────────────────────────────
      if (method === 'GET' && p === '/api/stream') {
        return this._handleSSE(req, res);
      }

      // ── Status snapshot ───────────────────────────
      if (method === 'GET' && p === '/api/status') {
        return this._json(res, 200, await this._buildStatus());
      }

      // ── Ring buffer events ─────────────────────────
      if (method === 'GET' && p === '/api/events') {
        const n = Math.min(parseInt(url.searchParams.get('n') || '50'), 500);
        const filter = url.searchParams.get('filter');
        let events = this._kernel.snapshot(n);
        if (filter) events = events.filter(e => e.type.includes(filter));
        return this._json(res, 200, { ok: true, count: events.length, events });
      }

      // ── MCL crystals ──────────────────────────────
      if (method === 'GET' && p === '/api/crystals') {
        const stable    = this._mcl?.stableCrystals    ?? [];
        const candidate = this._mcl?.candidateCrystals ?? [];
        return this._json(res, 200, {
          ok: true,
          stable:    stable.length,
          candidate: candidate.length,
          crystals:  [...stable, ...candidate].slice(0, 50),
        });
      }

      // ── BEP patterns ──────────────────────────────
      if (method === 'GET' && p === '/api/bep') {
        return this._json(res, 200, {
          ok:    true,
          count: this._bep?.patternCount ?? 0,
        });
      }

      // ── Emit command from admin UI ─────────────────
      if (method === 'POST' && p === '/api/emit') {
        const body = await this._readBody(req);
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          return this._json(res, 400, { ok: false, error: 'Invalid JSON' });
        }
        const { type, payload = {} } = parsed;
        if (!type || typeof type !== 'string') {
          return this._json(res, 400, { ok: false, error: 'type required' });
        }
        const ev = this._kernel.emit(type, payload, { causedBy: 'admin.ui' });
        return this._json(res, 200, { ok: true, id: ev.id, tick: ev.tick });
      }

      // ── Admin static files ─────────────────────────
      if (method === 'GET' && (p === '/' || p === '/admin' || p.startsWith('/admin/'))) {
        return this._serveStatic(req, res, p);
      }

      // ── 404 ───────────────────────────────────────
      this._json(res, 404, { ok: false, error: `Not found: ${p}` });

    } catch (e) {
      this._kernel.emit('admin.server.request_error', { path: p, error: e.message });
      if (!res.headersSent) this._json(res, 500, { ok: false, error: e.message });
    }
  }

  // ── SSE handler ───────────────────────────────────

  _handleSSE(req, res) {
    if (this._sseClients.size >= MAX_SSE_CLIENTS) {
      this._json(res, 503, { ok: false, error: 'SSE client limit reached' });
      return;
    }

    const id = `sse-${++this._clientSeq}`;

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',   // disable nginx buffering if present
    });

    // Send initial snapshot immediately so the panel has state on connect
    const snapshot = this._buildStatusSync();
    this._sseWrite(res, 'snapshot', snapshot);

    const client = { res, id };
    this._sseClients.add(client);

    this._kernel.emit('admin.sse.connected', { clientId: id, total: this._sseClients.size });

    req.on('close', () => {
      this._sseClients.delete(client);
      this._kernel.emit('admin.sse.disconnected', { clientId: id, total: this._sseClients.size });
    });
  }

  // ── SSE broadcast ─────────────────────────────────

  _broadcast(event, data) {
    if (this._sseClients.size === 0) return;
    const payload = {
      type:    data.type,
      payload: data.payload,
      tick:    data.tick,
      id:      data.id,
      wall:    data.wall,
    };
    for (const client of this._sseClients) {
      try { this._sseWrite(client.res, event, payload); } catch {
        this._sseClients.delete(client);
      }
    }
  }

  _broadcastRaw(event, dataStr) {
    for (const client of this._sseClients) {
      try {
        client.res.write(`event: ${event}\ndata: ${dataStr}\n\n`);
      } catch {
        this._sseClients.delete(client);
      }
    }
  }

  _sseWrite(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // ── Static file server ────────────────────────────

  _serveStatic(req, res, urlPath) {
    // / and /admin both → admin/index.html
    let filePath;
    if (urlPath === '/' || urlPath === '/admin' || urlPath === '/admin/') {
      filePath = path.join(this._adminDir, 'index.html');
    } else {
      // /admin/pages/guardian.html → admin/pages/guardian.html
      const relative = urlPath.replace(/^\/admin\/?/, '');
      filePath = path.join(this._adminDir, relative);
    }

    // Security: prevent path traversal
    const resolved = path.resolve(filePath);
    const adminRoot = path.resolve(this._adminDir);
    if (!resolved.startsWith(adminRoot)) {
      this._json(res, 403, { ok: false, error: 'Forbidden' });
      return;
    }

    fs.stat(resolved, (err, stat) => {
      if (err || !stat.isFile()) {
        // Fall back to index.html for SPA-style routing
        const idx = path.join(this._adminDir, 'index.html');
        fs.readFile(idx, (e2, data) => {
          if (e2) { this._json(res, 404, { ok: false, error: 'Not found' }); return; }
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data);
        });
        return;
      }

      const ext  = path.extname(resolved).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';

      // ETag from mtime for basic caching
      const etag = `"${stat.mtimeMs.toString(36)}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304); res.end(); return;
      }

      res.writeHead(200, {
        'Content-Type':  mime,
        'ETag':          etag,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=300',
      });

      fs.createReadStream(resolved).pipe(res);
    });
  }

  // ── Status builders ───────────────────────────────

  async _buildStatus() {
    return this._buildStatusSync();
  }

  _buildStatusSync() {
    const ring   = this._kernel.ring;
    const last   = ring.at(-1);
    const usageAll = this._usage?.all?.() ?? {};

    return {
      ok:        true,
      ts:        Date.now(),
      uptime:    Date.now() - this._startedAt,
      bus: {
        tick:    last?.tick   ?? 0,
        events:  ring.length,
        ringMax: 10000,
      },
      agents:    usageAll,
      crystals: {
        stable:    this._mcl?.stableCrystals?.length    ?? 0,
        candidate: this._mcl?.candidateCrystals?.length ?? 0,
      },
      bep: {
        count: this._bep?.patternCount ?? 0,
      },
      sse: {
        clients: this._sseClients.size,
      },
      laws: ['I', 'II', 'III', 'IV'],
    };
  }

  // ── Helpers ───────────────────────────────────────

  _json(res, status, obj) {
    if (res.headersSent) return;
    const body = JSON.stringify(obj);
    res.writeHead(status, {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
      req.on('end',  () => resolve(body));
      req.on('error', reject);
    });
  }

  get port() { return this._port; }
  get sseClientCount() { return this._sseClients.size; }
}

module.exports = { AdminServer };
