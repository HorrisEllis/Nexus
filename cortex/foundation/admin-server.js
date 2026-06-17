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
    this._port         = port;
    this._server       = null;
    this._sseClients   = new Set();
    this._lastLogId    = 0; // will be set to current tail on first push
    this._sseTimer     = null;
    this._fileStore    = deps.fileStore || null; // content-addressable SHA-256 store
    this._fileRefs     = deps.fileRefs  || null; // named refs over the store
    this._intelligence = null; // registered via registerIntelligence()
  }

  // Wire the intelligence module into this server so its HTTP routes are served
  // under /api/intelligence/*. Called from boot.js phase 8.
  registerIntelligence(intelligence) {
    if (typeof intelligence?.handleRequest !== 'function') {
      throw new TypeError('[AdminServer] registerIntelligence: module must export handleRequest()');
    }
    this._intelligence = intelligence;
  }

  // Wire the running RAID module so guardian can consult routing over HTTP
  // (LAW III: seam, not cross-process require). Called from boot.js.
  registerRaid(raid) {
    if (typeof raid?._decide !== 'function') {
      throw new TypeError('[AdminServer] registerRaid: module must export _decide()');
    }
    this._raid = raid;
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

  // §1.2 — JSON response helper. Was missing from class — caused every request to throw.
  _json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':'*',
    });
    res.end(body);
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
        case route === 'GET /api/tags': {
          const entityId = url.searchParams.get('entityId');
          const tag      = url.searchParams.get('tag');
          if (!entityId && !tag) { this._json(res, 400, { ok:false, error:'entityId or tag required' }); break; }
          break;
        }
        case route === 'POST /api/tags': {
          const b = await this._body(req);
          this._json(res, 200, { ok:true }); break;
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

        // ── GET /api/failure-modes — active failure modes ────────────────────
        case route === 'GET /api/failure-modes': {
          const rows = jaaDB.query('failure_modes', r => r.status === 'active', 50);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok:true, failureModes: rows, count: rows.length }));
          break;
        }

        // ── GET /api/friction — fault class friction scores ───────────────────
        case route === 'GET /api/friction': {
          const rows = jaaDB.query('fault_taxonomy', () => true, 100);
          const sorted = rows.sort((a,b) => (b.friction||0) - (a.friction||0));
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok:true, faultClasses: sorted, count: sorted.length }));
          break;
        }

        // ── GET /api/chat-log — recent AI exchanges ───────────────────────────
        case route === 'GET /api/chat-log': {
          const n    = parseInt(url.searchParams.get('n') || '20');
          const sid  = url.searchParams.get('sessionId');
          const rows = sid
            ? jaaDB.query('chat_log', r => r.sessionId === sid, n)
            : jaaDB.tail('chat_log', n);
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ ok:true, rows, count: rows.length }));
          break;
        }

        // ── GET /api/search — SNR-gated semantic search ──────────────────────
        // GET /api/search?q=rate+limiting&k=5&threshold=0.72&table=gaps
        case route === 'GET /api/search': {
          const q         = url.searchParams.get('q') || '';
          const k         = parseInt(url.searchParams.get('k') || '8');
          const threshold = parseFloat(url.searchParams.get('threshold') || '0.72');
          const table     = url.searchParams.get('table');
          const explain   = url.searchParams.get('explain') === 'true';
          if (!q) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'q required'})); break; }
          try {
            const vm = require('../../lib/vector-memory');
            const filter = table ? { table: { '$eq': table } } : null;
            const result = await vm.search(q, { k, threshold, filter, explain });
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ok:true, ...result }));
          } catch(e) {
            res.writeHead(503, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ok:false, error:e.message}));
          }
          break;
        }

        // ── POST /api/search/context — assemble semantic context for a prompt ─
        case route === 'POST /api/search/context': {
          const body = await _readBody(req);
          const { prompt, k=8, threshold=0.70, tables=null, maxTokens=2000 } = body;
          if (!prompt) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'prompt required'})); break; }
          try {
            const vm = require('../../lib/vector-memory');
            const ctx = await vm.assembleContext(prompt, { k, threshold, tables, maxTokens });
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ok:true, ...ctx }));
          } catch(e) {
            res.writeHead(503, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ok:false, error:e.message}));
          }
          break;
        }

        // ── GET /api/search/status — vector memory health ─────────────────────
        case route === 'GET /api/search/status': {
          try {
            const vm = require('../../lib/vector-memory');
            const st = await vm.status();
            res.writeHead(200, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ ok:true, ...st }));
          } catch(e) {
            res.writeHead(503, {'Content-Type':'application/json'});
            res.end(JSON.stringify({ok:false, error:'vector memory not initialized'}));
          }
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
        // Accepts ?limit= (or legacy ?n=) and optional ?type= filter.
        // Prior bug (found by adversarial harness): only ?n= read, ?limit=
        // silently ignored -> always 50 rows; ?type= dropped. (1.2/2.3)
        case route === 'GET /api/events': {
          const raw  = url.searchParams.get('limit') || url.searchParams.get('n') || '50';
          let   n    = parseInt(raw, 10);
          if (!Number.isFinite(n) || n < 0) n = 50;
          n = Math.min(n, 5000);
          const type = url.searchParams.get('type');
          const rows = type
            ? jaaDB.query('event_log', r => r.type === type, n)
            : jaaDB.tail('event_log', n);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, rows, count: rows.length, capped: n >= 5000 }));
          break;
        }

        // ── GET /api/memory/working — working memory recall ──────────────
        case route === 'GET /api/memory/working': {
          const sessionId = url.searchParams.get('session');
          const limit     = parseInt(url.searchParams.get('n') || '20');
          let rows;
          try {
            const wm = require('../memory/working-memory');
            rows = sessionId
              ? wm.recallForSession(sessionId, { limit })
              : wm.recallSignals({ limit });
          } catch {
            rows = jaaDB.tail('working_memory', limit);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, rows, tier: 'working' }));
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
          this._readBody(req, (body) => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch(e) {
              res.writeHead(400); res.end(JSON.stringify({ error: 'invalid JSON' })); return;
            }
            const { type, payload, source, causedBy } = parsed;
            if (!type) { res.writeHead(400); res.end(JSON.stringify({ error: 'type required' })); return; }

            const p = payload || {};

            // ── WELL_KNOWN router — writes to the correct JAA table per event type ──
            // Always runs before event_log write. Non-fatal — event_log is always written.
            const _ROUTE = {
              // Full response → cortex_memory + agent_messages
              'guardian.job.complete': () => {
                const text = p.response || p.text || '';
                if (text) {
                  jaaDB.insert('cortex_memory', {
                    uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                    content: text.slice(0, 10000), chars: p.chars || text.length,
                    gaps: p.gaps || 0, chatUrl: p.chatUrl || '', account: p.account || '',
                    source: source || 'guardian', causedBy: p.jobId || causedBy || null,
                    ts: p.completedAt || Date.now(),
                  });
                }
                if (p.jobId) {
                  jaaDB.insert('agent_messages', {
                    uuid: uid(), jobId: p.jobId, provider: p.provider || 'unknown',
                    role: 'assistant', content: text.slice(0, 10000),
                    chars: p.chars || 0, complete: true, type: 'completion',
                    chatUrl: p.chatUrl || '', account: p.account || '',
                    source: source || 'guardian', causedBy: p.jobId || null,
                    ts: p.completedAt || Date.now(),
                  });
                }
              },
              // Streaming batch → agent_messages (partial, for orion/sensor)
              'guardian.job.stream': () => {
                if (!p.jobId) return;
                jaaDB.insert('agent_messages', {
                  uuid: uid(), jobId: p.jobId, provider: p.provider || 'unknown',
                  role: 'assistant', content: (p.text || '').slice(0, 2000),
                  chars: p.chars || 0, complete: false, type: 'stream_chunk',
                  chunkIndex: p.chunkIndex || 0, fullLen: p.fullLen || 0,
                  source: source || 'guardian-stream', causedBy: p.jobId || null,
                  ts: Date.now(),
                });
              },
              // Agent message complete → agent_messages
              'agent.message.complete': () => {
                if (!p.jobId) return;
                jaaDB.insert('agent_messages', {
                  uuid: uid(), jobId: p.jobId, provider: p.provider || 'unknown',
                  role: p.role || 'assistant', content: (p.content || '').slice(0, 10000),
                  chars: p.chars || 0, complete: true, type: 'completion',
                  chatUrl: p.chatUrl || '', account: p.account || '',
                  source: source || 'guardian', causedBy: p.jobId || null,
                  ts: Date.now(),
                });
              },
              // Job start → agent_calls
              'agent.call.start': () => {
                if (!p.jobId) return;
                jaaDB.insert('agent_calls', {
                  uuid: uid(), jobId: p.jobId, provider: p.provider || 'unknown',
                  command: p.command || '', promptLen: p.promptLen || 0,
                  chatUrl: p.chatUrl || '', account: p.account || '',
                  source: source || 'guardian', causedBy: null,
                  ts: p.startedAt || Date.now(),
                });
              },
              // Artifact extracted from response → artifacts
              'guardian.artifact.extracted': () => {
                jaaDB.insert('artifacts', {
                  uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                  filename: p.filename || 'artifact', lang: p.lang || 'text',
                  chars: p.chars || 0, content: (p.content || '').slice(0, 4000),
                  chatUrl: p.chatUrl || '', source: source || 'guardian',
                  causedBy: p.jobId || causedBy || null, ts: Date.now(),
                });
              },
              // Artifact from userscript scan → artifacts
              'guardian.artifact': () => {
                jaaDB.insert('artifacts', {
                  uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                  lang: p.lang || 'text', hash: p.hash || null,
                  chars: p.chars || 0, content: (p.content || '').slice(0, 4000),
                  chatUrl: p.chatUrl || '', source: source || 'userscript',
                  causedBy: p.jobId || causedBy || null, ts: Date.now(),
                });
              },
              // Gap found → gaps table
              'cortex.gap.found': () => {
                jaaDB.insert('gaps', {
                  uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                  type: p.type || 'unknown', domain: p.domain || null,
                  reason: p.reason || null, description: p.description || '',
                  score: p.score || 0, evidence: p.evidence || null, status: 'open',
                  severity: (p.score || 0) > 0.7 ? 'high' : (p.score || 0) > 0.4 ? 'medium' : 'low',
                  source: p.source || source || 'guardian',
                  causedBy: p.jobId || causedBy || null, ts: Date.now(),
                });
              },
              // Session named → cortex_memory marker
              'guardian.session.named': () => {
                jaaDB.insert('cortex_memory', {
                  uuid: uid(), jobId: null, provider: p.provider || 'unknown',
                  type: 'session_named', content: p.sessionName || '',
                  chatId: p.chatId || '', sessionName: p.sessionName || '',
                  source: source || 'guardian', causedBy: causedBy || null, ts: Date.now(),
                });
              },
              // SEAM chunk verified → seam_records
              'guardian.seam.verified': () => {
                jaaDB.insert('seam_records', {
                  uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                  chunkIdx: p.chunkIdx || 0, chunkTitle: p.chunkTitle || '',
                  status: 'verified', verifiedAt: Date.now(),
                  source: source || 'guardian', causedBy: causedBy || null, ts: Date.now(),
                });
              },
              // SEAM chunk failed → seam_records
              'guardian.seam.failed': () => {
                jaaDB.insert('seam_records', {
                  uuid: uid(), jobId: p.jobId || null, provider: p.provider || 'unknown',
                  chunkIdx: p.chunkIdx || 0, chunkTitle: p.chunkTitle || '',
                  status: 'failed', failedAt: Date.now(),
                  source: source || 'guardian', causedBy: causedBy || null, ts: Date.now(),
                });
              },
              // Conversation turns -> working_memory (tier: working, decays in 2h)
              'working.memory.turn': () => {
                const wm = (() => { try { return require('../memory/working-memory'); } catch { return null; } })();
                if (wm) wm.writeTurn({
                  sessionId: p.sessionId || p.chatId || p.jobId || 'unknown',
                  role:      p.role || 'unknown',
                  content:   p.content || p.text || '',
                  provider:  p.provider || source || 'unknown',
                  chatUrl:   p.chatUrl || '',
                  jobId:     p.jobId || causedBy || null,
                  turnIndex: p.turnIndex || 0,
                });
              },
              // Crystal candidate from ?REMEMBER: protocol -> intent_nodes
              // Requires human/self-module promotion to crystals table.
              'cortex.crystal.candidate': () => {
                jaaDB.insert('intent_nodes', {
                  uuid:        uid(),
                  content:     (p.content || '').slice(0, 2000),
                  sessionId:   p.sessionId || null,
                  provider:    p.provider || 'unknown',
                  source:      p.source || source || 'userscript',
                  state:       'candidate',   // candidate -> stable requires manual or self-module promotion
                  callCount:   1,
                  successRate: null,
                  causedBy:    causedBy || null,
                  ts:          Date.now(),
                });
              },
              // Signal extracted from response -> working_memory signals
              'working.memory.signal': () => {
                const wm = (() => { try { return require('../memory/working-memory'); } catch { return null; } })();
                if (wm) wm.writeSignal({
                  sessionId: p.sessionId || p.chatId || 'unknown',
                  kind:      p.kind || 'unknown',
                  content:   p.content || '',
                  jobId:     p.jobId || causedBy || null,
                  source:    source || 'userscript',
                });
              },
            };

            try { _ROUTE[type]?.(); } catch(e) { /* non-fatal — event_log still written */ }

            // Always write to event_log (universal append-only record)
            const row = jaaDB.insert('event_log', {
              uuid: uid(), type, payload: p, source: source || 'admin',
              causedBy: causedBy || null, ts: Date.now(),
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(row));
          });
          return;
        }

        // ── POST /api/table/insert — direct table write from trusted sources ──
        // Used by guardian server's _toCortex helper for targeted table writes.
        case route === 'POST /api/table/insert': {
          this._readBody(req, (body) => {
            let parsed;
            try { parsed = JSON.parse(body || '{}'); } catch(e) {
              res.writeHead(400); res.end(JSON.stringify({ error: 'invalid JSON' })); return;
            }
            const { table, row } = parsed;
            const ALLOWED = new Set([
              'agent_messages', 'cortex_memory', 'artifacts', 'gaps',
              'seam_records', 'agent_calls', 'sigma_records', 'delta_records',
              'orion_sessions', 'active_traces', 'working_memory', 'event_log',
            ]);
            if (!table || !ALLOWED.has(table)) {
              res.writeHead(400); res.end(JSON.stringify({ error: `table not allowed: ${table}` })); return;
            }
            if (!row || typeof row !== 'object') {
              res.writeHead(400); res.end(JSON.stringify({ error: 'row required' })); return;
            }
            const inserted = jaaDB.insert(table, { uuid: uid(), ...row, ts: row.ts || Date.now() });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, row: inserted }));
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
        case route === 'GET /api/snapshots/divergence-watcher': {
          try {
            const dw = require('../snapshot/divergence-watcher');
            this._json(res, 200, { ok: true, ...dw.status() });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'GET /api/snapshots/blackbox': {
          // Decompress blackbox from a .nex snapshot
          // ?snapId=nex-xxxx&section=pre|post
          try {
            const snapId  = url.searchParams.get('snapId');
            const section = url.searchParams.get('section') || 'pre';
            if (!snapId) { this._json(res, 400, { ok: false, error: 'snapId required' }); break; }
            const snap = require('../snapshot');
            const dw   = require('../snapshot/divergence-watcher');
            const nex  = snap.load(snapId);
            const field = section === 'post' ? nex.blackbox_post : nex.blackbox_pre;
            if (!field) { this._json(res, 404, { ok: false, error: `no blackbox_${section} on ${snapId}` }); break; }
            const decoded = dw.decompressBlackbox(field);
            this._json(res, 200, { ok: true, snapId, section, ...decoded });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }
        case route === 'GET /api/snapshots/macro': {
          // Get the compiled macro for a divergence snapshot
          try {
            const snapId = url.searchParams.get('snapId');
            if (!snapId) { this._json(res, 400, { ok: false, error: 'snapId required' }); break; }
            const snap = require('../snapshot');
            const nex  = snap.load(snapId);
            if (!nex.macro) { this._json(res, 404, { ok: false, error: 'macro not yet compiled or not a divergence snapshot' }); break; }
            this._json(res, 200, { ok: true, snapId, macro: nex.macro });
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

        // ── Self-heal status — enhanced with tension scoring ─────────────────
        case route === 'GET /api/self-heal/status': {
          try {
            const allGaps  = jaaDB.query('gaps', () => true, 500);
            const byStatus = {};
            let totalTension = 0;
            for (const g of allGaps) {
              byStatus[g.status] = (byStatus[g.status] || 0) + 1;
            }

            // Tension scoring — open loops accumulate tension over time
            const openStatuses = new Set(['pending','processing','needs_manual','forge_processing','forge_failed']);
            const openGaps = allGaps.filter(g => openStatuses.has(g.status));
            for (const g of openGaps) {
              const WEIGHT = { critical:4, high:2, medium:1, low:0.4 };
              const w = WEIGHT[g.severity] || 1;
              const ageH = (Date.now() - (g.createdAt || g.ts || Date.now())) / 3600000;
              const ageFactor = Math.min(3, 1 + Math.log1p(ageH) * 0.5);
              const retryPenalty = 1 + (g.attempts || 0) * 0.3;
              totalTension += w * ageFactor * retryPenalty;
            }

            const pending  = jaaDB.query('gaps', r => r.status === 'needs_manual', 50);
            const patched  = jaaDB.query('gaps', r => r.status === 'forge_applied', 50);
            const ready    = jaaDB.query('gaps', r => r.status === 'forge_patch_ready', 50);
            const human    = jaaDB.query('gaps', r => r.status === 'human_required', 50);
            const patches  = jaaDB.tail('forge_patches', 20);

            this._json(res, 200, { ok: true,
              pending:        pending.length,
              patched:        patched.length,
              ready:          ready.length,
              human_required: human.length,
              openLoops:      openGaps.length,
              totalTension:   Math.round(totalTension * 100) / 100,
              byStatus,
              recentPatches:  patches,
            });
          } catch(e) { this._json(res, 500, { ok: false, error: e.message }); }
          break;
        }

        // ── Lab — snapshot test environment ─────────────────────────────────
        // POST /api/lab/session { snapId }  → create session from production snap
        // POST /api/lab/session/upload      → create session from .nex file body
        // GET  /api/lab/sessions            → list sessions
        // POST /api/lab/session/:id/run     → run experiment
        // GET  /api/lab/session/:id         → get session
        // DELETE /api/lab/session/:id       → destroy session

        case route === 'POST /api/lab/session': {
          try {
            const body = await this._body(req);
            const lab  = require('../lab/index');
            let session;
            if (body.snapId) {
              const snapData = lab.loadProductionSnapshot(body.snapId);
              session = lab.createSession(snapData);
            } else if (body.snapData) {
              session = lab.createSession(body.snapData);
            } else {
              this._json(res, 400, { ok:false, error:'snapId or snapData required' }); break;
            }
            this._json(res, 201, { ok:true, session: session.toJSON() });
          } catch(e) { this._json(res, 500, { ok:false, error:e.message }); }
          break;
        }

        case route === 'GET /api/lab/sessions': {
          try {
            const lab = require('../lab/index');
            this._json(res, 200, { ok:true, sessions: lab.listSessions() });
          } catch(e) { this._json(res, 500, { ok:false, error:e.message }); }
          break;
        }

        case url.pathname.startsWith('/api/lab/session/') && route.includes('/run'): {
          try {
            const parts     = url.pathname.split('/').filter(Boolean);
            const sessionId = parts[3];
            const body      = await this._body(req);
            const lab       = require('../lab/index');
            const result    = await lab.runExperiment(sessionId, body);
            this._json(res, 200, { ok:true, result });
          } catch(e) { this._json(res, 500, { ok:false, error:e.message }); }
          break;
        }

        case url.pathname.startsWith('/api/lab/session/') && req.method === 'GET': {
          try {
            const sessionId = url.pathname.split('/')[4];
            const lab       = require('../lab/index');
            const session   = lab.getSession(sessionId);
            if (!session) { this._json(res, 404, { ok:false, error:'session not found' }); break; }
            this._json(res, 200, { ok:true, session: session.toJSON() });
          } catch(e) { this._json(res, 500, { ok:false, error:e.message }); }
          break;
        }

        case url.pathname.startsWith('/api/lab/session/') && req.method === 'DELETE': {
          try {
            const sessionId = url.pathname.split('/')[4];
            const lab       = require('../lab/index');
            const ok        = lab.destroySession(sessionId);
            this._json(res, ok ? 200 : 404, { ok });
          } catch(e) { this._json(res, 500, { ok:false, error:e.message }); }
          break;
        }

        // ── Gap bulk resolve — clear noise gaps by type ───────────────────────
        // POST /api/gaps/resolve-batch { type, reason }
        // Use to clear DELTA.TENSION and other signal-not-gap rows
        case route === 'POST /api/gaps/resolve-batch': {
          try {
            const body   = await this._body(req);
            const type   = body.type;
            const reason = body.reason || 'bulk-resolve';
            if (!type) { this._json(res, 400, { ok:false, error:'type required' }); break; }

            const matches = jaaDB.query('gaps',
              r => r.type === type && r.status !== 'resolved' && r.status !== 'forge_applied',
              500
            );
            let resolved = 0;
            for (const g of matches) {
              jaaDB.update('gaps', g.uuid, {
                status:     'resolved',
                resolvedAt: Date.now(),
                fixStrategy:'bulk-resolve',
                resolveReason: reason,
              });
              resolved++;
            }
            jaaDB.insert('event_log', {
              uuid: require('crypto').randomUUID(),
              type: 'gaps.bulk-resolved',
              payload: { gapType: type, count: resolved, reason },
              source: 'admin-server', ts: Date.now(),
            });
            this._json(res, 200, { ok:true, resolved, type, reason });
          } catch(e) { this._json(res, 500, { ok:false, error: e.message }); }
          break;
        }

                default: {
          // ── RAID decision seam — GET /api/raid/decide?intent=...&preferred=... ──
          if (this._raid && url.pathname === '/api/raid/decide') {
            try {
              const intent    = url.searchParams.get('intent') || url.searchParams.get('prompt') || '';
              const preferred = url.searchParams.get('preferred') || '';
              const snap      = (typeof this._raid._health === 'object' && this._raid._health) || {};
              const weights   = this._raid._weights instanceof Map ? this._raid._weights : new Map();
              const decision  = this._raid._decide({ intent, preferredAgent: preferred }, snap, weights);
              this._json(res, 200, { ok: true, ...decision });
            } catch (e) {
              this._json(res, 500, { ok: false, error: e.message });
            }
            break;
          }
          // Delegate /api/intelligence/* to the registered intelligence module
          if (this._intelligence && url.pathname.startsWith('/api/intelligence')) {
            const body = req.method !== 'GET' ? await this._body(req).catch(() => null) : null;
            const handled = this._intelligence.handleRequest(
              req.method, url.pathname, url.searchParams, body,
              (status, data) => this._json(res, status, data)
            );
            if (handled) break;
          }
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

  // Promisified body reader — used by async route handlers (await this._body(req))
  _body(req) {
    return new Promise((resolve, reject) => {
      this._readBody(req, (text) => {
        if (text === null) return reject(new Error('request body too large'));
        try { resolve(JSON.parse(text)); } catch { resolve(text); }
      });
    });
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
