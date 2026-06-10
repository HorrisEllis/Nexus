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
const { jaaDB, uid } = require('../memory/jaa-db');
const { core }       = require('./cobalt-core');
const versionium     = (() => { try { return require('../versionium'); } catch(_) { return null; } })();
const essEngine      = (() => { try { return require('../ess-gap-engine'); } catch(_) { return null; } })();

const DEFAULT_PORT = 3748;
const MAX_BODY     = 25 * 1024 * 1024; // 25MB — uploads are b64-inflated (BUG-06 class)

class AdminServer {
  constructor({ port = DEFAULT_PORT, deps = {} } = {}) {
    this._port       = port;
    this._server     = null;
    this._sseClients = new Set();
    this._lastLogId  = 0; // will be set to current tail on first push
    this._sseTimer   = null;
    this._fileStore  = deps.fileStore || null; // content-addressable SHA-256 store
    this._fileRefs   = deps.fileRefs  || null; // named refs over the store
  }

  async start() {
    this._server = http.createServer((req, res) => this._handle(req, res));

    await new Promise((resolve, reject) => {
    this._server.listen(this._port, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // SSE: poll event_log every 1s (§G-V5-05)
    this._sseTimer = setInterval(() => this._pushSSE(), 1000);
    this._sseTimer.unref();

    // url printed by boot.js
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

    // On first push, start from current tail (don't replay history)
    if (this._lastLogId === 0) {
      const all = jaaDB.tail('event_log', 1);
      this._lastLogId = all.length ? (all[0]._rowId || 0) : 0;
      return;
    }

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

  async _handle(req, res) {
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
        }
        case route === 'GET /api/tags': {
          const entityId = url.searchParams.get('entityId');
          const tag      = url.searchParams.get('tag');
          else { this._json(res, 400, { ok:false, error:'entityId or tag required' }); }
          break;
        }
        case route === 'POST /api/tags': {
          const b = await this._body(req);
          this._json(res, 200, { ok:true }); break;
        }
        }
        }
        case route === 'GET /contract': {
          const { readFileSync, existsSync } = require('fs');
          const cp = require('path').join(__dirname, '../interaction-contract.json');
          if (!existsSync(cp)) { res.writeHead(404,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(JSON.stringify({ok:false,error:'contract not found'})); break; }
          try { res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}); res.end(readFileSync(cp,'utf8')); }
          catch(e) { res.writeHead(500); res.end(JSON.stringify({ok:false,error:e.message})); }
          break;
        }
        // ── POST /api/cli/exec — unified CLI execution (axiom: CLI=UI=API) ──────
        case route === 'POST /api/cli/exec': {
          const body = await this._body(req);
          const raw  = (body.command || '').trim();
          if (!raw) { this._json(res, 400, { ok:false, error:'command required' }); break; }
          const parts = raw.split(/\s+/);
          const cmd   = parts[0].toLowerCase();
          const flags = {};
          for (let i=1;i<parts.length;i++) {
            if (parts[i].startsWith('--') && parts[i+1] && !parts[i+1].startsWith('--')) {
              flags[parts[i].slice(2)] = parts[i+1]; i++;
            } else if (parts[i].startsWith('--')) { flags[parts[i].slice(2)] = true; }
          }
          const positional = parts.slice(1).filter(p => !p.startsWith('--'));

          // §LAW II — write to ledger before executing
          try { jaaDB.insert('event_log', { uuid: require('crypto').randomUUID(),
            type:'cortex.cli.exec', payload:JSON.stringify({command:raw,source:body.source||'cli'}),
            ts:Date.now() }); } catch(_) {}

          let result = null, error = null;
          try {
            switch(cmd) {
              case 'status': {
                result = { ok:true, uptime:process.uptime(), stats: jaaDB.stats, ts:Date.now() }; break;
              }
              case 'gaps': {
                const rows = jaaDB.query('gaps',
                  flags.status ? r=>r.status===flags.status : ()=>true,
                  parseInt(flags.limit||'50'));
                result = { gaps:rows, total:rows.length }; break;
              }
              case 'memory': case 'events': {
                const sub = positional[0] || 'tail';
                const n   = parseInt(flags.n||positional[1]||'20');
                if (sub==='search'||sub==='query') {
                  const q = positional.slice(1).join(' ');
                  const rows = jaaDB.query('event_log', r =>
                    JSON.stringify(r).toLowerCase().includes(q.toLowerCase()), parseInt(flags.limit||'20'));
                  result = { results:rows }; break;
                }
                const tbl = flags.table || 'event_log';
                const rows = jaaDB.tail(tbl, n);
                result = { table:tbl, rows }; break;
              }
              case 'crystals': {
                const rows = jaaDB.query('crystals', ()=>true, parseInt(flags.limit||'20'));
                result = { crystals:rows }; break;
              }
              case 'tables': {
                result = { stats: jaaDB.stats }; break;
              }
              default:
                error = 'Unknown: '+cmd+'. Try: status, gaps, memory, crystals, tables';
            }
          } catch(e) { error = e.message; }

          // Broadcast to SSE clients so UI + terminal see output
          this._broadcast({ type:'CLI_RESULT', command:raw, result, error, ts:Date.now() });
          this._json(res, 200, { ok:!error, command:raw, result, error });
          break;
        }

        case req.url?.startsWith('/cfr'): {
          const ledger = global._cortexCFRLedger;
          if (ledger) {
            const { URL } = require('url');
            const u = new URL(req.url, 'http://localhost');
            if (ledger.handleCFRRoute(req, res, u)) break;
          }
          this._json(res, 404, { ok: false, error: 'CFR ledger not initialized' });
          break;
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
          res.end(JSON.stringify({ok:true,rows}));
          break;
        }

        // ── GET /api/failures ─────────────────────────────────────────────
        case route === 'GET /api/failures': {
          const rows = jaaDB.tail('failures', 100);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ok:true,rows}));
          break;
        }

        // ── GET /api/events ───────────────────────────────────────────────
        case route === 'GET /api/events': {
          const n    = parseInt(url.searchParams.get('n') || '50');
          const rows = jaaDB.tail('event_log', n);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ok:true,rows}));
          break;
        }

        // ── GET /api/memory ───────────────────────────────────────────────
        case route === 'GET /api/memory': {
          const table = url.searchParams.get('table') || 'cortex_memory';
          const n     = parseInt(url.searchParams.get('n') || '40');
          const rows  = jaaDB.tail(table, n);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ok:true,rows}));
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
            res.end(JSON.stringify({ok:true,rows}));
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
          // Normal event handling (guardian.job.created intercepted below)
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
          res.end(JSON.stringify({ok:true,rows}));
          break;
        }

        // ── GET /api/modules ──────────────────────────────────────────────
        case route === 'GET /api/modules': {
          const rows = jaaDB.query('project_registry', () => true, 50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ok:true,rows}));
          break;
        }

        // ── VERSIONIUM ────────────────────────────────────────────────────
        // GET /api/versionium/log?n=N&branch=main — commits newest-first + branches
        case route === 'GET /api/versionium/log': {
          const n      = Math.min(parseInt(url.searchParams.get('n') || '50', 10) || 50, 500);
          const branch = url.searchParams.get('branch');
          let commits  = jaaDB.tail('versionium_commits', n);
          if (branch) commits = commits.filter(c => c.branch === branch);
          commits = commits.slice().reverse(); // newest first
          const branches = jaaDB.query('versionium_branches', () => true, 50);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, commits, branches,
            head: branches.find(b => b.branch === (branch || 'main'))?.headCommitId || null }));
          break;
        }

        // POST /api/versionium/commit { message, branch?, causedBy? } — manual commit
        case route === 'POST /api/versionium/commit': {
          this._readBody(req, (body) => {
            if (body === null) { res.writeHead(413, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'body too large'})); return; }
            try {
              const { message, branch = 'main', causedBy = null } = JSON.parse(body || '{}');
              if (!versionium || typeof versionium.commit !== 'function') {
                res.writeHead(503, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ ok:false, error:'versionium module unavailable' }));
                return;
              }
              const commit = versionium.commit({ message, branch, causedBy });
              res.writeHead(200, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:true, commit }));
            } catch (err) {
              res.writeHead(400, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:false, error: err.message }));
            }
          });
          break;
        }

        // ── FILES — content-addressed store ───────────────────────────────
        // GET /api/files — versionium_file_index, newest first
        case route === 'GET /api/files': {
          const n    = Math.min(parseInt(url.searchParams.get('n') || '200', 10) || 200, 1000);
          const rows = jaaDB.tail('versionium_file_index', n).slice().reverse();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, rows,
            store: this._fileStore ? this._fileStore.stats : null }));
          break;
        }

        // POST /api/files/upload { name, content, encoding?, mime?, project?, causedBy? }
        // content: utf8 text by default, or base64 when encoding === 'base64'.
        // Writes object to SHA-256 FileStore, indexes in versionium_file_index,
        // sets named ref, emits event_log row. Idempotent on identical content.
        case route === 'POST /api/files/upload': {
          this._readBody(req, (body) => {
            if (body === null) { res.writeHead(413, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'body too large (25MB cap)'})); return; }
            try {
              const { name, content, encoding = 'utf8', mime = 'text/plain',
                      project = null, causedBy = null } = JSON.parse(body || '{}');
              if (!name || typeof content !== 'string') {
                res.writeHead(400, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ ok:false, error:'name and content required' }));
                return;
              }
              if (!this._fileStore) {
                res.writeHead(503, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ ok:false, error:'file store not wired (boot deps missing)' }));
                return;
              }
              const obj  = { name, mime, encoding, content, ts: Date.now() };
              const hash = this._fileStore.put(obj);
              if (this._fileRefs) { try { this._fileRefs.set('file/' + name, hash); } catch {} }
              const size = Buffer.byteLength(content, encoding === 'base64' ? 'base64' : 'utf8');
              const row  = jaaDB.insert('versionium_file_index', {
                uuid: uid(), name, hash, mime, encoding, size,
                project, source: 'admin-server.upload', causedBy, ts: Date.now(),
              });
              jaaDB.insert('event_log', {
                uuid: uid(), type: 'file.uploaded',
                payload: { name, hash, size, mime, project },
                source: 'admin-server', causedBy, ts: Date.now(),
              });
              res.writeHead(200, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:true, hash, row }));
            } catch (err) {
              res.writeHead(400, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:false, error: err.message }));
            }
          });
          break;
        }

        // GET /api/files/get?hash=H — retrieve stored object by content hash
        case route === 'GET /api/files/get': {
          const hash = url.searchParams.get('hash');
          if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
            res.writeHead(400, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ok:false, error:'valid sha-256 hash required' }));
            break;
          }
          const obj = this._fileStore ? this._fileStore.get(hash) : null;
          res.writeHead(obj ? 200 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj ? { ok:true, object: obj } : { ok:false, error:'not found' }));
          break;
        }

        // ── PROJECTS — repo suite read layer ──────────────────────────────
        // GET /api/projects — project_registry joined with file + commit counts
        case route === 'GET /api/projects': {
          const projects = jaaDB.query('project_registry', () => true, 200);
          const files    = jaaDB.query('versionium_file_index', () => true, 2000);
          const commits  = jaaDB.query('versionium_commits',   () => true, 2000);
          const enriched = projects.map(p => ({
            ...p,
            fileCount:   files.filter(f => f.project === (p.name || p.uuid)).length,
            commitCount: commits.filter(c => c.project === (p.name || p.uuid) || c.branch === p.name).length,
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok:true, rows: enriched,
            totals: { files: files.length, commits: commits.length } }));
          break;
        }

        // ── ESS — omission analysis (ess-gap-engine) ──────────────────────
        // POST /api/ess/analyse { text } → expressed/inferred/omitted + score
        case route === 'POST /api/ess/analyse': {
          this._readBody(req, (body) => {
            if (body === null) { res.writeHead(413, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'body too large'})); return; }
            try {
              const { text } = JSON.parse(body || '{}');
              if (!essEngine) {
                res.writeHead(503, {'Content-Type':'application/json'});
                res.end(JSON.stringify({ ok:false, error:'ess-gap-engine unavailable' }));
                return;
              }
              const result = essEngine.analyzeESS(String(text || ''));
              jaaDB.insert('event_log', {
                uuid: uid(), type: 'ess.analysed',
                payload: { omitted: (result.omitted || []).length, score: result.score },
                source: 'admin-server', ts: Date.now(),
              });
              res.writeHead(200, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:true, result }));
            } catch (err) {
              res.writeHead(400, {'Content-Type':'application/json'});
              res.end(JSON.stringify({ ok:false, error: err.message }));
            }
          });
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
        // ── Snapshot routes ───────────────────────────────────────────────────
        case route === 'GET /api/snapshots': {
          try {
            const snap = require('../snapshot');
            const n = parseInt(url.searchParams.get('n') || '20');
            this._json(res, 200, { ok: true, snapshots: snap.list(n) });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/snapshots/create': {
          try {
            const snap = require('../snapshot');
            const body = await this._body(req);
            const result = snap.create({ type: 'api', message: body.message || 'api snapshot' });
            this._json(res, 200, { ok: true, ...result });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/snapshots/rollback': {
          try {
            const snap = require('../snapshot');
            const body = await this._body(req);
            if (!body.snapId) { this._json(res, 400, { ok: false, error: 'snapId required' }); break; }
            const result = snap.rollback(body.snapId, { apply: body.apply === true });
            this._json(res, 200, { ok: true, ...result });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'GET /api/snapshots/diff': {
          try {
            const snap = require('../snapshot');
            const a = url.searchParams.get('a');
            const b = url.searchParams.get('b');
            if (!a || !b) { this._json(res, 400, { ok: false, error: 'a and b required' }); break; }
            this._json(res, 200, { ok: true, ...snap.diff(a, b) });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

        // ── Replay routes ─────────────────────────────────────────────────────
        case route === 'POST /api/replay/inspect': {
          try {
            const replay = require('../replay');
            const body = await this._body(req);
            this._json(res, 200, replay.inspect(body));
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/replay/verify': {
          try {
            const replay = require('../replay');
            const body = await this._body(req);
            this._json(res, 200, replay.verify(body));
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/replay/simulate': {
          try {
            const replay = require('../replay');
            const body = await this._body(req);
            this._json(res, 200, replay.simulate(body.events || [], body));
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

        // ── Agent-tools routes ────────────────────────────────────────────────
        case route === 'GET /api/tools': {
          try {
            const tools = require('../agent-tools');
            this._json(res, 200, { ok: true, tools: tools.manifest() });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/tools/exec': {
          try {
            const tools = require('../agent-tools');
            const body = await this._body(req);
            if (!body.tool) { this._json(res, 400, { ok: false, error: 'tool required' }); break; }
            const result = await tools.execute(body.tool, body.input || {});
            this._json(res, 200, result);
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

        // ── Contract routes ───────────────────────────────────────────────────
        case route === 'GET /api/contract/agents': {
          try {
            const contract = require('../contract');
            this._json(res, 200, { ok: true, agents: contract.listContracts() });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'GET /api/contract/violations': {
          try {
            const contract = require('../contract');
            const n = parseInt(url.searchParams.get('n') || '50');
            this._json(res, 200, { ok: true, violations: contract.getViolations(n) });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'GET /api/contract/audit': {
          try {
            const contract = require('../contract');
            const n = parseInt(url.searchParams.get('n') || '50');
            this._json(res, 200, { ok: true, audit: contract.getAudit(n) });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'POST /api/contract/check': {
          try {
            const contract = require('../contract');
            const body = await this._body(req);
            this._json(res, 200, { ok: true, result: contract.checkContract(body) });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

        // ── Self-heal status ──────────────────────────────────────────────────
        case route === 'GET /api/self-heal/status': {
          try {
            const pending  = jaaDB.query('gaps', r => r.status === 'needs_manual', 50);
            const patched  = jaaDB.query('gaps', r => r.status === 'forge_applied', 50);
            const ready    = jaaDB.query('gaps', r => r.status === 'forge_patch_ready', 50);
            const human    = jaaDB.query('gaps', r => r.status === 'human_required', 50);
            const patches  = jaaDB.tail('forge_patches', 20);
            this._json(res, 200, { ok: true,
              pending: pending.length, patched: patched.length,
              ready: ready.length, human_required: human.length,
              recentPatches: patches,
            });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

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

  // BUG-01/BUG-06 class (cross-applied from ncp.js forensics): accumulate Buffer[]
  // to avoid multi-byte mojibake at chunk boundaries; cap body size to bound memory.
  _readBody(req, cb) {
    const bufs = [];
    let size = 0, killed = false;
    req.on('data', d => {
      if (killed) return;
      size += d.length;
      if (size > MAX_BODY) {
        killed = true;
        try { req.destroy(); } catch {}
        cb(null); // signal overflow
        return;
      }
      bufs.push(d);
    });
    req.on('end', () => { if (!killed) cb(Buffer.concat(bufs).toString('utf8')); });
  }
}

module.exports = { AdminServer };
