'use strict';
// ════════════════════════════════════════════════════════════════════════════
// NEXUS ORCHESTRATOR — v1.0.0
// UUID: nexus-orchestrator-v1-0-0
//
// The unified root. Connects all systems, exposes one API, one CLI entry,
// one event stream. Watches ui/ subdirs and hotswaps HTML on file change.
//
// Port: 9000
//
// Boot: node orchestrator.js
//       npm run orchestrator
//
// ── Architecture ──────────────────────────────────────────────────────────────
//
//   orchestrator.js (port 9000)
//     ├── serves ui/orchestrator/index.html  at /
//     ├── hotswaps ui/bridge/     on change  → served at /ui/bridge
//     ├── hotswaps ui/cortex/     on change  → served at /ui/cortex
//     ├── hotswaps ui/guardian/   on change  → served at /ui/guardian
//     ├── hotswaps ui/idearium/   on change  → served at /ui/idearium
//     ├── hotswaps ui/emerge/     on change  → served at /ui/emerge
//     ├── /api/status             → all systems health (parallel)
//     ├── /api/channels           → channel map JSON
//     ├── /api/api-map            → full API surface JSON
//     ├── /api/cli                → CLI command reference JSON
//     ├── /api/dispatch           → forward command to any system
//     ├── /sse                    → unified live stream (all systems merged)
//     └── /health                 → orchestrator self-check
//
// ── CLI ───────────────────────────────────────────────────────────────────────
//   node orchestrator.js status        — all systems
//   node orchestrator.js dispatch      — dispatch to system
//   node orchestrator.js watch         — live event stream
//   node orchestrator.js ui            — list UI files with hotswap status
//   node orchestrator.js health        — self health
//
// ════════════════════════════════════════════════════════════════════════════

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const { randomUUID } = require('crypto');

const PORT    = process.env.ORCHESTRATOR_PORT || 9000;
const ROOT    = __dirname;
const UI_ROOT = path.join(ROOT, 'ui');

// ── System registry ───────────────────────────────────────────────────────────
const SYSTEMS = {
  bridge:   { port: 9999, host: '127.0.0.1', label: 'Bridge',      color: '#f0a500', healthPath: '/bridge/health' },
  cortex:   { port: 3748, host: '127.0.0.1', label: 'Cortex',      color: '#2dd4bf', healthPath: '/health' },
  guardian: { port: 7820, host: '127.0.0.1', label: 'Guardian',    color: '#9b7fe8', healthPath: '/health' },
  idearium: { port: 4800, host: '127.0.0.1', label: 'Idearium',    color: '#4a9eff', healthPath: '/health' },
  emerge:   { port: 4242, host: '127.0.0.1', label: 'Emerge IDE',  color: '#3ecf8e', healthPath: '/status' },
  ollama:   { port: 11434,host: '127.0.0.1', label: 'Ollama',      color: '#e85d3c', healthPath: '/api/tags' },
};

// ── Channel map ───────────────────────────────────────────────────────────────
const CHANNELS = [
  { from:'guardian', channel:'guardian.job.complete',    to:['cortex','bridge'],   desc:'Job finished — syncs to cortex, memory.ingest to bridge' },
  { from:'guardian', channel:'guardian.artifact',        to:['cortex','bridge'],   desc:'Code artifact — stored in cortex, tagged in bridge' },
  { from:'guardian', channel:'guardian.gaps',            to:['cortex'],            desc:'Gaps detected in AI output' },
  { from:'guardian', channel:'guardian.ledger',          to:['jaa'],               desc:'Ledger entry written to JAA' },
  { from:'guardian', channel:'guardian.session.named',   to:['jaa'],               desc:'Chat session named by AI agent' },
  { from:'guardian', channel:'guardian.timeline',        to:['jaa'],               desc:'Timeline event recorded' },
  { from:'guardian', channel:'guardian.job.queued',      to:['bridge'],            desc:'Job queued waiting for provider' },
  { from:'guardian', channel:'guardian.job.dispatched',  to:['bridge'],            desc:'Job dispatched to AI provider' },
  { from:'guardian', channel:'guardian.setting.update',  to:['jaa'],               desc:'Setting changed' },
  { from:'cortex',   channel:'cortex.gap.found',         to:['guardian','bridge'], desc:'Gap detected — notifies guardian ledger' },
  { from:'cortex',   channel:'cortex.gap.resolved',      to:['bridge'],            desc:'Gap resolved — broadcasts to all subscribers' },
  { from:'idearium', channel:'idearium.idea.created',    to:['cortex','bridge'],   desc:'New idea — synced to cortex, tagged in bridge' },
  { from:'idearium', channel:'idearium.snapshot.pushed', to:['cortex'],            desc:'Snapshot — triggers versionium commit' },
  { from:'bridge',   channel:'bridge.request.created',   to:['*'],                 desc:'New request — broadcast to all subscribers' },
  { from:'bridge',   channel:'bridge.request.accepted',  to:['*'],                 desc:'Request accepted' },
  { from:'bridge',   channel:'bridge.request.complete',  to:['*'],                 desc:'Request complete' },
  { from:'bridge',   channel:'bridge.request.expired',   to:['*'],                 desc:'Stale request purged (30min TTL)' },
  { from:'bridge',   channel:'bridge.handshake',         to:['audit'],             desc:'System handshake — audit logged' },
  { from:'bridge',   channel:'bridge.tag.added',         to:['*'],                 desc:'Entity tagged' },
  { from:'alk',      channel:'alk.video.landmarks.face', to:['gcanvas'],           desc:'Face landmarks → CFR attractor positions' },
  { from:'alk',      channel:'alk.behavior.cue.detected',to:['gcanvas','cortex'],  desc:'Behavioral cue → field delta + cortex event' },
  { from:'alk',      channel:'alk.signal.composite',     to:['cortex'],            desc:'Composite ALK signal → cortex event_log' },
];

// ── CLI commands reference ────────────────────────────────────────────────────
const CLI_REF = {
  unified: [
    { cmd:'nexus status',              desc:'All systems health' },
    { cmd:'nexus dispatch "prompt"',   desc:'Dispatch to chatgpt (default)' },
    { cmd:'nexus jobs',                desc:'Guardian job list' },
    { cmd:'nexus events --n=20',       desc:'Cortex event log' },
    { cmd:'nexus gaps',                desc:'All open gaps (idearium + cortex)' },
    { cmd:'nexus ideas',               desc:'Idearium idea list' },
    { cmd:'nexus idea "text"',         desc:'Create idea' },
    { cmd:'nexus push "message"',      desc:'Snapshot + versionium commit' },
    { cmd:'nexus snr',                 desc:'System SNR score' },
    { cmd:'nexus stream',              desc:'Live cortex SSE' },
    { cmd:'nexus watch <jobId>',       desc:'Stream guardian job tokens' },
    { cmd:'nexus watchdog',            desc:'Live all-systems dashboard' },
    { cmd:'nexus requests',            desc:'Bridge request queue' },
    { cmd:'nexus accept <uuid>',       desc:'Accept bridge request' },
    { cmd:'nexus reject <uuid>',       desc:'Reject bridge request' },
    { cmd:'nexus tag <id> --tags=x,y', desc:'Tag entity in bridge' },
    { cmd:'nexus tags <id>',           desc:'Get entity tags' },
    { cmd:'nexus bridge health',       desc:'Bridge health' },
    { cmd:'nexus cortex status',       desc:'Cortex status + JAA counts' },
    { cmd:'nexus cortex post --type=x',desc:'Write cortex event' },
    { cmd:'nexus cortex memory <q>',   desc:'Search memory' },
    { cmd:'nexus guardian dispatch',   desc:'Dispatch job' },
    { cmd:'nexus guardian providers',  desc:'Provider connection status' },
  ],
  passthrough: [
    { cmd:'nexus /guardian /code chatgpt "prompt"', desc:'Guardian code command' },
    { cmd:'nexus /guardian jobs',                   desc:'Guardian jobs' },
    { cmd:'nexus /cockpit pipeline list',           desc:'Pipeline list' },
    { cmd:'nexus /cockpit seam compile <file>',     desc:'Compile SEAM' },
    { cmd:'nexus /cockpit forge gap create "title"',desc:'Create gap' },
    { cmd:'nexus /cockpit jaa stats',               desc:'JAA statistics' },
    { cmd:'nexus /cortex ask "question"',           desc:'Ask cortex' },
    { cmd:'nexus /cortex gaps',                     desc:'Cortex gaps' },
    { cmd:'nexus /idearium idea add "text"',        desc:'Add idea' },
    { cmd:'nexus /idearium spec new <uuid>',        desc:'Create spec' },
    { cmd:'nexus /ollama status',                   desc:'Ollama models' },
    { cmd:'nexus /ollama pull qwen2.5-coder:7b',    desc:'Pull model' },
    { cmd:'nexus /ollama run "prompt"',             desc:'Run inference' },
    { cmd:'nexus /bridge health',                   desc:'Bridge health' },
    { cmd:'nexus /bridge requests',                 desc:'Bridge requests' },
    { cmd:'nexus /bridge subscribe guardian.job.*', desc:'Subscribe channel' },
  ],
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function sysReq(systemId, method, p, body, timeout = 4000) {
  return new Promise(resolve => {
    const sys = SYSTEMS[systemId];
    if (!sys) return resolve({ ok: false, error: `unknown system: ${systemId}` });
    const pl   = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: sys.host, port: sys.port, path: p, method,
      headers: { 'Content-Type': 'application/json', ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}) },
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: res.statusCode < 400, raw: d }); } });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok: false, error: `${sys.label} timeout` }); });
    r.on('error', e => resolve({ ok: false, error: `${sys.label} offline: ${e.message}` }));
    if (pl) r.write(pl);
    r.end();
  });
}

// ── System health (parallel) ──────────────────────────────────────────────────
async function getAllHealth() {
  const results = await Promise.all(
    Object.entries(SYSTEMS).map(async ([id, sys]) => {
      const start = Date.now();
      const d     = await sysReq(id, 'GET', sys.healthPath);
      return { id, sys, d, ms: Date.now() - start, online: !d.error };
    })
  );
  return results;
}

// ── UI hotswap watcher ────────────────────────────────────────────────────────
// Each system has its own ui/<system>/ folder.
// When any .html/.js/.css file in those folders changes,
// we reload it from disk on the next request — zero restart needed.
//
// Watched dirs: ui/bridge  ui/cortex  ui/guardian  ui/idearium  ui/emerge  ui/orchestrator

const UI_SYSTEMS = ['bridge', 'cortex', 'guardian', 'idearium', 'emerge', 'orchestrator'];
const sseClients = new Set(); // unified SSE subscribers

function watchUIDirs() {
  for (const sys of UI_SYSTEMS) {
    const dir = path.join(UI_ROOT, sys);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); continue; }
    try {
      fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const ext = path.extname(filename).toLowerCase();
        if (!['.html','.js','.css','.json'].includes(ext)) return;
        const msg = JSON.stringify({
          type: 'orchestrator.ui.hotswap',
          system: sys, file: filename, event,
          ts: Date.now(),
        });
        broadcast(msg);
        console.log(`[hotswap] ${sys}/${filename} ${event}`);
      });
      console.log(`[ui] watching ui/${sys}/`);
    } catch(e) {
      console.log(`[ui] watch failed for ui/${sys}: ${e.message}`);
    }
  }
}

// ── Unified SSE broadcast ─────────────────────────────────────────────────────
// Also subscribes to bridge SSE and re-emits everything here
function broadcast(data) {
  const msg = `data: ${data}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch(_) { sseClients.delete(res); }
  }
}

let bridgeSseConn = null;
function connectBridgeSSE() {
  if (bridgeSseConn) return;
  const opts = {
    hostname: '127.0.0.1', port: 9999,
    path: '/bridge/subscribe?channel=*', method: 'GET',
    headers: { Accept: 'text/event-stream' },
  };
  const req = http.request(opts, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data:')) {
          broadcast(line.slice(5).trim());
        }
      }
    });
    res.on('end', () => {
      bridgeSseConn = null;
      setTimeout(connectBridgeSSE, 3000); // reconnect
    });
  });
  req.on('error', () => {
    bridgeSseConn = null;
    setTimeout(connectBridgeSSE, 5000);
  });
  req.end();
  bridgeSseConn = req;
}

// ── MIME types ─────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ── HTTP server ───────────────────────────────────────────────────────────────
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u     = new URL(req.url, `http://localhost:${PORT}`);
  const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const first = parts[0] || '';

  // ── Root → orchestrator UI ─────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/') {
    return serveFile(res, path.join(UI_ROOT, 'orchestrator', 'index.html'));
  }

  // ── System UIs: /ui/<system>[/file] ──────────────────────────────────────
  if (req.method === 'GET' && first === 'ui' && parts[1]) {
    const sys      = parts[1];
    const rest     = parts.slice(2).join('/') || 'index.html';
    const filePath = path.join(UI_ROOT, sys, rest);
    if (fs.existsSync(filePath)) return serveFile(res, filePath);
    // Fallback to index.html of that system
    const idx = path.join(UI_ROOT, sys, 'index.html');
    if (fs.existsSync(idx)) return serveFile(res, idx);
    res.writeHead(404); return res.end(`UI not found: ${sys}`);
  }

  // ── SSE — unified event stream ─────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'orchestrator.connected', ts: Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── Health ────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/health') {
    const systems = await getAllHealth();
    const online  = systems.filter(s => s.online).length;
    return json(res, 200, {
      ok: true, orchestrator: 'nexus-orchestrator-v1',
      port: PORT, uptime: process.uptime(),
      online, total: systems.length,
      systems: Object.fromEntries(systems.map(s => [s.id, { online: s.online, ms: s.ms }])),
      uiDirs: UI_SYSTEMS.map(s => ({
        system: s,
        path: `ui/${s}/`,
        url: `http://localhost:${PORT}/ui/${s}`,
        exists: fs.existsSync(path.join(UI_ROOT, s, 'index.html')),
      })),
    });
  }

  // ── API: all systems status ───────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/api/status') {
    const systems = await getAllHealth();
    return json(res, 200, {
      ok: true, ts: Date.now(),
      systems: Object.fromEntries(systems.map(s => [s.id, {
        online: s.online, ms: s.ms, label: s.sys.label,
        port: s.sys.port, color: s.sys.color,
        data: s.d,
      }])),
    });
  }

  // ── API: channel map ─────────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/api/channels') {
    return json(res, 200, { ok: true, channels: CHANNELS });
  }

  // ── API: full API surface ─────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/api/api-map') {
    return json(res, 200, {
      ok: true,
      systems: {
        bridge:   { port: 9999, routes: [
          { m:'POST', p:'/bridge/handshake'            },{ m:'GET',  p:'/bridge/health'             },
          { m:'GET',  p:'/bridge/stats'                },{ m:'GET',  p:'/bridge/tags/:id'            },
          { m:'POST', p:'/bridge/tags'                 },{ m:'GET',  p:'/bridge/tags?tag=x'          },
          { m:'GET',  p:'/bridge/requests'             },{ m:'POST', p:'/bridge/requests'            },
          { m:'POST', p:'/bridge/requests/:uuid/accept'},{ m:'POST', p:'/bridge/requests/:uuid/reject'},
          { m:'POST', p:'/bridge/requests/:uuid/complete'},{ m:'GET', p:'/bridge/subscribe?channel=x'},
          { m:'GET',  p:'/bridge/pull?channel=x&since=ts'},{ m:'POST',p:'/bridge/broadcast'          },
          { m:'POST', p:'/bridge/forward'              },{ m:'POST', p:'/bridge/purge'               },
        ]},
        cortex:   { port: 3748, routes: [
          { m:'GET',  p:'/health'                      },{ m:'GET',  p:'/sse'                        },
          { m:'GET',  p:'/api/events?n=N'              },{ m:'POST', p:'/api/event'                  },
          { m:'GET',  p:'/api/gaps'                    },{ m:'GET',  p:'/api/failures'               },
          { m:'GET',  p:'/api/memory?table=x&n=N'      },{ m:'POST', p:'/api/memory/search'          },
          { m:'GET',  p:'/api/files'                   },{ m:'POST', p:'/api/files'                  },
          { m:'GET',  p:'/api/tags?entityId=x'         },{ m:'POST', p:'/api/tags'                   },
        ]},
        guardian: { port: 7820, routes: [
          { m:'POST', p:'/command'                     },{ m:'GET',  p:'/status/:jobId'              },
          { m:'GET',  p:'/response/:jobId'             },{ m:'GET',  p:'/stream/:jobId'              },
          { m:'GET',  p:'/jobs'                        },{ m:'GET',  p:'/providers'                  },
          { m:'GET',  p:'/health'                      },{ m:'GET',  p:'/events'                     },
          { m:'GET',  p:'/cockpit'                     },{ m:'GET',  p:'/artifacts'                  },
          { m:'POST', p:'/artifacts'                   },{ m:'GET',  p:'/ledger'                     },
        ]},
        idearium: { port: 4800, routes: [
          { m:'GET',  p:'/api/ideas'                   },{ m:'POST', p:'/api/ideas'                  },
          { m:'PATCH',p:'/api/ideas/:uuid'             },{ m:'POST', p:'/api/ideas/:uuid/tension'    },
          { m:'GET',  p:'/api/specs'                   },{ m:'GET',  p:'/api/gaps'                   },
          { m:'POST', p:'/api/gaps'                    },{ m:'GET',  p:'/api/snr'                    },
          { m:'POST', p:'/api/snapshots'               },{ m:'GET',  p:'/sse'                        },
        ]},
        orchestrator: { port: PORT, routes: [
          { m:'GET',  p:'/'                            },{ m:'GET',  p:'/health'                     },
          { m:'GET',  p:'/api/status'                  },{ m:'GET',  p:'/api/channels'               },
          { m:'GET',  p:'/api/api-map'                 },{ m:'GET',  p:'/api/cli'                    },
          { m:'POST', p:'/api/dispatch'                },{ m:'GET',  p:'/sse'                        },
          { m:'GET',  p:'/ui/:system'                  },
        ]},
      },
    });
  }

  // ── API: CLI reference ────────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/api/cli') {
    return json(res, 200, { ok: true, cli: CLI_REF });
  }

  // ── API: dispatch to any system ───────────────────────────────────────────
  if (req.method === 'POST' && u.pathname === '/api/dispatch') {
    let body = {};
    await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>{try{body=JSON.parse(d);}catch(_){}r();}); });
    const { system, path: p, payload, method = 'POST' } = body;
    if (!system || !p) return json(res, 400, { ok: false, error: 'system and path required' });
    const result = await sysReq(system, method, p, payload);
    return json(res, result.ok !== false ? 200 : 502, { ok: true, result });
  }

  // ── UI list ───────────────────────────────────────────────────────────────
  if (req.method === 'GET' && u.pathname === '/api/ui') {
    const uis = UI_SYSTEMS.map(s => {
      const dir  = path.join(UI_ROOT, s);
      const idx  = path.join(dir, 'index.html');
      const stat = fs.existsSync(idx) ? fs.statSync(idx) : null;
      return {
        system: s, url: `/ui/${s}`,
        exists: !!stat,
        size: stat?.size || 0,
        modified: stat?.mtime?.toISOString() || null,
      };
    });
    return json(res, 200, { ok: true, uis });
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  json(res, 404, { ok: false, error: `route not found: ${req.method} ${u.pathname}` });
});

// ── CLI mode ──────────────────────────────────────────────────────────────────
const C = { r:'\x1b[0m', bold:'\x1b[1m', g:'\x1b[32m', red:'\x1b[31m', y:'\x1b[33m',
            c:'\x1b[36m', m:'\x1b[35m', dim:'\x1b[90m', blue:'\x1b[34m' };

function sysColor(id) {
  const colors = { bridge:'y', cortex:'c', guardian:'m', idearium:'blue', emerge:'g', ollama:'red' };
  return C[colors[id]||'dim'];
}

async function cliStatus() {
  const results = await getAllHealth();
  console.log(`\n${C.bold}${C.c}NEXUS${C.r}  ${C.dim}orchestrator${C.r}\n`);
  for (const { id, sys, online, ms, d } of results) {
    const dot = online ? `${C.g}●${C.r}` : `${C.red}○${C.r}`;
    const sc  = sysColor(id);
    console.log(`  ${dot}  ${C.bold}${sc}${sys.label.padEnd(14)}${C.r}  ${C.dim}:${sys.port}  ${ms}ms${C.r}`);
    if (online && id === 'cortex') {
      const n = Object.values(d.jaa?.counts||{}).reduce((a,b)=>a+b,0);
      if (n) console.log(`     ${C.dim}${n} records · 28 tables${C.r}`);
    }
    if (online && id === 'guardian') {
      const conn = Object.entries(d.providers||{}).filter(([,v])=>v==='connected').map(([k])=>k);
      if (conn.length) console.log(`     ${C.dim}providers: ${conn.join(', ')}${C.r}`);
      const q = Object.values(d.queued||{}).reduce((a,b)=>a+b,0);
      if (q) console.log(`     ${C.y}${q} jobs queued (waiting for provider)${C.r}`);
    }
    if (online && id === 'ollama') {
      const models = (d.models||[]).map(m=>m.name);
      if (models.length) console.log(`     ${C.dim}${models.join(', ')}${C.r}`);
    }
    if (!online) console.log(`     ${C.red}${d.error}${C.r}`);
  }
  console.log(`\n${C.dim}UI:  http://localhost:${PORT}${C.r}`);
  console.log(`${C.dim}SSE: http://localhost:${PORT}/sse${C.r}\n`);
}

function cliWatch() {
  console.log(`${C.bold}${C.c}NEXUS LIVE${C.r}  ${C.dim}connecting to bridge…${C.r}\n`);
  const opts = { hostname:'127.0.0.1', port:9999, path:'/bridge/subscribe?channel=*', method:'GET', headers:{Accept:'text/event-stream'} };
  const r = http.request(opts, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const d = JSON.parse(line.slice(5).trim());
          const ts  = new Date(d.bridgeTs||Date.now()).toTimeString().slice(0,8);
          const sys = (d.type||'').split('.')[0];
          const sc  = sysColor(sys);
          console.log(`  ${C.dim}${ts}${C.r}  ${sc}${sys.padEnd(10)}${C.r}  ${C.c}${(d.type||'event').padEnd(36)}${C.r}  ${C.dim}${JSON.stringify(d).slice(0,60)}${C.r}`);
        } catch(_) {}
      }
    });
    res.on('end', () => { console.log('\nstream ended'); process.exit(0); });
  });
  r.on('error', e => { console.log(`${C.red}bridge offline: ${e.message}${C.r}`); process.exit(1); });
  r.end();
}

function cliUI() {
  console.log(`\n${C.bold}${C.c}NEXUS UI${C.r}  ${C.dim}hotswap watcher active${C.r}\n`);
  for (const sys of UI_SYSTEMS) {
    const idx   = path.join(UI_ROOT, sys, 'index.html');
    const exist = fs.existsSync(idx);
    const stat  = exist ? fs.statSync(idx) : null;
    const sc    = sysColor(sys);
    const dot   = exist ? `${C.g}●${C.r}` : `${C.red}○${C.r}`;
    console.log(`  ${dot}  ${sc}${sys.padEnd(14)}${C.r}  ${C.dim}ui/${sys}/index.html${C.r}  ${exist ? stat.size+'B' : 'missing'}  →  http://localhost:${PORT}/ui/${sys}`);
  }
  console.log(`\n${C.dim}Orchestrator UI: http://localhost:${PORT}${C.r}\n`);
}

function cliHelp() {
  console.log(`
${C.bold}${C.c}nexus orchestrator${C.r}  v1.0

${C.bold}CLI commands${C.r}
  node orchestrator.js               start server (port ${PORT})
  node orchestrator.js status        all systems health
  node orchestrator.js watch         live bridge event stream
  node orchestrator.js ui            list UI files + hotswap status
  node orchestrator.js health        self health check
  node orchestrator.js help          this message

${C.bold}Server endpoints${C.r}
  GET  /                    orchestrator UI
  GET  /health              all systems health
  GET  /api/status          full system status JSON
  GET  /api/channels        channel map JSON (${CHANNELS.length} channels)
  GET  /api/api-map         full API surface JSON
  GET  /api/cli             CLI command reference JSON
  GET  /api/ui              UI file status
  POST /api/dispatch        forward to any system
  GET  /sse                 unified live stream (all bridge events)
  GET  /ui/:system          serve system UI (hotswapped)

${C.bold}UI hotswap${C.r}
  edit any file in ui/<system>/  →  served immediately on next request
  ${C.dim}ui/bridge/      → /ui/bridge
  ui/cortex/      → /ui/cortex
  ui/guardian/    → /ui/guardian
  ui/idearium/    → /ui/idearium
  ui/emerge/      → /ui/emerge
  ui/orchestrator/ → /${C.r}
`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const cliArg = process.argv[2];

if (cliArg === 'status')  { cliStatus().then(() => process.exit(0)); }
else if (cliArg === 'watch')  { cliWatch(); }
else if (cliArg === 'ui')     { cliUI(); process.exit(0); }
else if (cliArg === 'health') { sysReq('bridge','GET','/bridge/health').then(d=>console.log(JSON.stringify({ok:true,self:'orchestrator',bridge:d},null,2))).then(()=>process.exit(0)); }
else if (cliArg === 'help' || cliArg === '--help') { cliHelp(); process.exit(0); }
else {
  // Start server
  server.listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('\x1b[1m\x1b[32m⬡  NEXUS ORCHESTRATOR\x1b[0m  v1.0');
    console.log('');
    console.log(`   \x1b[90mUI        \x1b[0m  http://localhost:${PORT}`);
    console.log(`   \x1b[90mHealth    \x1b[0m  http://localhost:${PORT}/health`);
    console.log(`   \x1b[90mSSE       \x1b[0m  http://localhost:${PORT}/sse`);
    console.log(`   \x1b[90mChannels  \x1b[0m  http://localhost:${PORT}/api/channels`);
    console.log(`   \x1b[90mAPI map   \x1b[0m  http://localhost:${PORT}/api/api-map`);
    console.log('');
    console.log(`   \x1b[90mSystem UIs\x1b[0m`);
    for (const sys of UI_SYSTEMS) {
      const exists = fs.existsSync(path.join(UI_ROOT, sys, 'index.html'));
      const dot = exists ? '\x1b[32m●\x1b[0m' : '\x1b[31m○\x1b[0m';
      console.log(`              ${dot}  http://localhost:${PORT}/ui/${sys}  \x1b[90m(ui/${sys}/)\x1b[0m`);
    }
    console.log('');
    console.log(`   \x1b[90mCLI       \x1b[0m  node orchestrator.js status | watch | ui`);
    console.log('');

    // Start UI watchers
    watchUIDirs();

    // Connect to bridge SSE (relay to our SSE clients)
    setTimeout(connectBridgeSSE, 1000);
    console.log('\x1b[90m[orchestrator] hotswap active — edit ui/<system>/ files to reload\x1b[0m');
  });
}
