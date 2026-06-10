'use strict';
// ════════════════════════════════════════════════════════════════════════════
// NEXUS ORCHESTRATOR — v2.0.0
// UUID: nexus-orchestrator-v2-0-0
//
// Root orchestrator. One process that:
//   • Executes commands against every system API
//   • Exposes a unified /api/* surface covering all systems
//   • Streams all live events through one SSE endpoint
//   • Serves each system's UI from ui/<system>/index.html (hotswapped)
//   • Provides a full CLI: node orchestrator.js <command> [args]
//
// Port: 9000
//
// ── API surface ───────────────────────────────────────────────────────────────
//   GET  /                        Orchestrator UI
//   GET  /health                  All systems health (parallel)
//   GET  /api/status              Full status JSON
//   GET  /api/channels            SISO channel map (22 channels)
//   GET  /api/api-map             All routes across all systems
//   GET  /api/cli                 CLI reference
//   GET  /api/ui                  UI file status
//   GET  /sse                     Unified SSE (all system events)
//   GET  /ui/:system              System UI (hotswapped from disk)
//
//   ── Cortex ───────────────────────────────────────────────────────────────
//   GET  /api/cortex/health
//   GET  /api/cortex/events       ?n=20
//   POST /api/cortex/event        { type, payload, causedBy? }
//   GET  /api/cortex/gaps         ?status=open
//   GET  /api/cortex/failures
//   GET  /api/cortex/memory       ?table=event_log&n=50
//   POST /api/cortex/memory/search { q }
//   POST /api/cortex/memory/forget { uuid }
//   GET  /api/cortex/files
//   GET  /api/cortex/tags         ?entityId=x
//   POST /api/cortex/tags         { entityId, entityType, system, tags[] }
//   GET  /api/cortex/ring
//   GET  /api/cortex/modules
//
//   ── Guardian ─────────────────────────────────────────────────────────────
//   POST /api/guardian/dispatch   { provider, command, prompt, content? }
//   GET  /api/guardian/status/:jobId
//   GET  /api/guardian/response/:jobId
//   GET  /api/guardian/jobs       ?status=&limit=20
//   GET  /api/guardian/providers
//   GET  /api/guardian/health
//   GET  /api/guardian/log
//   GET  /api/guardian/artifacts  ?lang=&q=
//   POST /api/guardian/artifacts  { hash, name, type, lang, content, context }
//   GET  /api/guardian/artifacts/:hash
//   DELETE /api/guardian/artifacts/:hash
//   POST /api/guardian/memory/ingest { type, payload, source }
//   GET  /api/guardian/memory/query  ?q=
//   GET  /api/guardian/memory/artifacts
//   GET  /api/guardian/memory/ledger
//   GET  /api/guardian/memory/context
//   GET  /api/guardian/memory/stats
//   GET  /api/guardian/memory/downloads
//   POST /api/guardian/ledger     { level, category, msg, meta }
//   GET  /api/guardian/ledger
//
//   ── Idearium ─────────────────────────────────────────────────────────────
//   GET  /api/idearium/health
//   GET  /api/idearium/snr
//   GET  /api/idearium/snr/history
//   GET  /api/idearium/events
//   GET  /api/idearium/ideas
//   POST /api/idearium/ideas      { text, tags?, compartment? }
//   GET  /api/idearium/ideas/:uuid
//   PATCH /api/idearium/ideas/:uuid { text?, phase? }
//   POST /api/idearium/ideas/:uuid/tension
//   POST /api/idearium/ideas/:uuid/phase { phase }
//   POST /api/idearium/ideas/:uuid/link  { toUuid, linkType? }
//   POST /api/idearium/ideas/:uuid/spec
//   GET  /api/idearium/specs
//   GET  /api/idearium/specs/:uuid
//   POST /api/idearium/specs/:uuid/build
//   GET  /api/idearium/gaps
//   POST /api/idearium/gaps       { description }
//   POST /api/idearium/gaps/:uuid/resolve { resolution }
//   GET  /api/idearium/snapshots
//   POST /api/idearium/snapshots  { message }
//   GET  /api/idearium/contract
//   GET  /api/idearium/stats
//
// ── CLI ───────────────────────────────────────────────────────────────────────
//   node orchestrator.js                start server
//   node orchestrator.js status         all systems health
//   node orchestrator.js watch          live event stream
//   node orchestrator.js ui             UI file status
//   node orchestrator.js dispatch       dispatch job to guardian
//   node orchestrator.js jobs           list guardian jobs
//   node orchestrator.js events         tail cortex events
//   node orchestrator.js gaps           list all gaps
//   node orchestrator.js ideas          list idearium ideas
//   node orchestrator.js idea <text>    create idea
//   node orchestrator.js requests       list bridge requests
//   node orchestrator.js tag <id> <tags> tag entity
//   node orchestrator.js push <msg>     snapshot + versionium
//   node orchestrator.js snr            idearium SNR
//   node orchestrator.js help
//
// ════════════════════════════════════════════════════════════════════════════

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { URL } = require('url');

const PORT    = parseInt(process.env.ORCHESTRATOR_PORT || '9000');

// ── Pulse system ──────────────────────────────────────────────────────────────
// lib/pulse.js is optional — if it doesn't exist yet, pulse is a no-op.
let _orchPulse = null;
try {
  const { createPulse } = require('./lib/pulse');
  // Pulse is started after server binds (in server.listen callback)
  module._createPulse = createPulse;
} catch(_) {
  console.warn('[orchestrator] lib/pulse.js not found — heartbeat self-registration disabled');
}
const ROOT    = __dirname;
const UI_ROOT = path.join(ROOT, 'ui');

// ── System registry ───────────────────────────────────────────────────────────
const SYS = {
  cortex:   { port:3748,  host:'127.0.0.1', label:'Cortex',     color:'#2dd4bf' },
  guardian: { port:7820,  host:'127.0.0.1', label:'Guardian',   color:'#9b7fe8' },
  idearium: { port:4800,  host:'127.0.0.1', label:'Idearium',   color:'#4a9eff' },
  emerge:   { port:4242,  host:'127.0.0.1', label:'Emerge IDE', color:'#3ecf8e' },
  ollama:   { port:11434, host:'127.0.0.1', label:'Ollama',     color:'#e85d3c' },
};

// ── Channel map ───────────────────────────────────────────────────────────────
const CHANNELS = [
  { from:'guardian', ch:'guardian.job.complete',    to:['cortex'],   desc:'Job finished → memory.ingest' },
  { from:'guardian', ch:'guardian.artifact',        to:['cortex'],   desc:'Code artifact → cortex + tagged' },
  { from:'guardian', ch:'guardian.gaps',            to:['cortex'],            desc:'Gaps detected in AI output' },
  { from:'guardian', ch:'guardian.ledger',          to:['jaa'],               desc:'Ledger entry' },
  { from:'guardian', ch:'guardian.session.named',   to:['jaa'],               desc:'Chat session named' },
  { from:'guardian', ch:'guardian.timeline',        to:['jaa'],               desc:'Timeline event' },
  { from:'guardian', ch:'guardian.setting.update',  to:['jaa'],               desc:'Setting changed' },
  { from:'cortex',   ch:'cortex.gap.found',         to:['guardian'], desc:'Gap → guardian ledger' },
  { from:'idearium', ch:'idearium.idea.created',    to:['cortex'],   desc:'Idea → cortex + tagged' },
  { from:'idearium', ch:'idearium.snapshot.pushed', to:['cortex'],            desc:'Snapshot → versionium' },
  { from:'alk',      ch:'alk.signal.composite',     to:['cortex'],            desc:'ALK composite → event_log' },
];

// ── CLI reference ─────────────────────────────────────────────────────────────
const CLI_REF = {
  orchestrator: [
    { cmd:'node orchestrator.js',              desc:'Start server (port 9000)' },
    { cmd:'node orchestrator.js status',       desc:'All systems health' },
    { cmd:'node orchestrator.js watch',        desc:'Live unified event stream' },
    { cmd:'node orchestrator.js ui',           desc:'UI file status + hotswap' },
    { cmd:'node orchestrator.js dispatch "prompt" [provider] [command]', desc:'Dispatch to guardian' },
    { cmd:'node orchestrator.js jobs [status]',desc:'Guardian job list' },
    { cmd:'node orchestrator.js events [n]',   desc:'Cortex event log tail' },
    { cmd:'node orchestrator.js gaps',         desc:'All gaps (idearium + cortex)' },
    { cmd:'node orchestrator.js ideas',        desc:'Idearium ideas' },
    { cmd:'node orchestrator.js idea "text"',  desc:'Create idea' },
    { cmd:'node orchestrator.js requests [status]', desc:'Bridge request queue' },
    { cmd:'node orchestrator.js tag <id> <t1,t2>', desc:'Tag entity' },
    { cmd:'node orchestrator.js push "msg"',   desc:'Idearium snapshot' },
    { cmd:'node orchestrator.js snr',          desc:'Idearium SNR' },
    { cmd:'node orchestrator.js help',         desc:'This message' },
  ],
  nexus_unified: [
    { cmd:'nexus status',              desc:'All systems health' },
    { cmd:'nexus dispatch "prompt"',   desc:'Dispatch to chatgpt' },
    { cmd:'nexus jobs',                desc:'Guardian jobs' },
    { cmd:'nexus events --n=20',       desc:'Cortex events' },
    { cmd:'nexus gaps',                desc:'All gaps' },
    { cmd:'nexus ideas',               desc:'Idearium ideas' },
    { cmd:'nexus idea "text"',         desc:'Create idea' },
    { cmd:'nexus push "message"',      desc:'Snapshot + versionium' },
    { cmd:'nexus snr',                 desc:'System SNR' },
    { cmd:'nexus stream',              desc:'Live cortex SSE' },
    { cmd:'nexus watch <jobId>',       desc:'Stream job tokens' },
    { cmd:'nexus watchdog',            desc:'Live all-systems dashboard' },
    { cmd:'nexus requests',            desc:'Bridge request queue' },
    { cmd:'nexus tag <id> --tags=x,y', desc:'Tag entity' },
    { cmd:'nexus cortex status',       desc:'Cortex status' },
    { cmd:'nexus guardian providers',  desc:'Provider status' },
  ],
  passthrough: [
    { cmd:'nexus /guardian /code chatgpt "prompt"', desc:'Guardian code' },
    { cmd:'nexus /guardian jobs',                   desc:'Jobs' },
    { cmd:'nexus /cockpit pipeline list',           desc:'Pipelines' },
    { cmd:'nexus /cockpit seam compile <file>',     desc:'Compile SEAM' },
    { cmd:'nexus /cockpit forge gap create "t"',    desc:'Create gap' },
    { cmd:'nexus /cockpit jaa stats',               desc:'JAA stats' },
    { cmd:'nexus /cortex ask "question"',           desc:'Ask cortex' },
    { cmd:'nexus /idearium idea add "text"',        desc:'Add idea' },
    { cmd:'nexus /idearium spec new <uuid>',        desc:'Create spec' },
    { cmd:'nexus /ollama pull qwen2.5-coder:7b',    desc:'Pull model' },
    { cmd:'nexus /ollama run "prompt"',             desc:'Run inference' },
  ],
};

// ── HTTP proxy helpers ────────────────────────────────────────────────────────
function sysReq(systemId, method, p, body, timeout = 5000) {
  return new Promise(resolve => {
    const sys = SYS[systemId];
    if (!sys) return resolve({ ok:false, error:`unknown system: ${systemId}` });
    const pl = body !== undefined ? JSON.stringify(body) : null;
    const opts = {
      hostname: sys.host, port: sys.port, path: p, method,
      headers: {
        'Content-Type': 'application/json',
        'X-Orchestrator': 'nexus-orchestrator-v2',
        ...(pl ? { 'Content-Length': Buffer.byteLength(pl) } : {}),
      },
    };
    const r = http.request(opts, res => {
      // ORC-03: Buffer accumulation (same fix as ORC-01)
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const d = Buffer.concat(chunks).toString('utf8');
        // ORC-04: preserve upstream status for honest error propagation
        const upstreamOk = res.statusCode >= 200 && res.statusCode < 300;
        try {
          const parsed = JSON.parse(d);
          // If upstream returned an error status, surface it even if body parses
          if (!upstreamOk && parsed.ok !== false) parsed._upstreamStatus = res.statusCode;
          resolve(parsed);
        }
        catch { resolve({ ok: upstreamOk, raw: d, status: res.statusCode }); }
      });
    });
    r.setTimeout(timeout, () => { r.destroy(); resolve({ ok:false, error:`${sys.label} timeout` }); });
    r.on('error', e => resolve({ ok:false, error:`${sys.label} offline: ${e.message}` }));
    if (pl) r.write(pl);
    r.end();
  });
}

const GET  = (sys, p, timeout)    => sysReq(sys, 'GET',    p, undefined, timeout);
const POST = (sys, p, b, timeout) => sysReq(sys, 'POST',   p, b, timeout);
const DEL  = (sys, p, timeout)    => sysReq(sys, 'DELETE', p, undefined, timeout);
const PATCH= (sys, p, b, timeout) => sysReq(sys, 'PATCH',  p, b, timeout);

// ── All systems health ────────────────────────────────────────────────────────
const HEALTH_PATHS = {
  cortex:   '/health',
  guardian: '/health',
  idearium: '/health',
  emerge:   '/status',
  ollama:   '/api/tags',
};

async function allHealth() {
  return Promise.all(Object.entries(SYS).map(async ([id, sys]) => {
    const start = Date.now();
    const d     = await GET(id, HEALTH_PATHS[id], 3000);
    const online = !d.error && (d.ok !== false);
    // Merge with registry (last seen ≤ 15s = online even if health check missed)
    const reg = SYSTEM_REGISTRY.get(id) || {};
    const regOnline = reg.lastSeen && (Date.now() - reg.lastSeen) < 15000;
    return { id, sys, d, ms: Date.now() - start, online: online || regOnline, port: sys.port };
  }));
}

// ── SSE unified stream ────────────────────────────────────────────────────────
const sseClients = new Set();

// ── §AXIOM: Orchestrator is source of truth ──────────────────────────────────
// All systems register here on boot. CLI uses recall to read state.
// Connection order: system → event bus → kernel → orchestrator
const SYSTEM_REGISTRY = new Map();
// { systemId → { port, registeredAt, lastSeen, meta, online } }

function registryUpdate(systemId, data) {
  const existing = SYSTEM_REGISTRY.get(systemId) || {};
  SYSTEM_REGISTRY.set(systemId, {
    ...existing, ...data,
    systemId, lastSeen: Date.now(),
  });
  ledgerWrite('orchestrator', 'system.registered', { systemId, ...data });
  broadcast(JSON.stringify({ type:'orchestrator.system.registered', systemId, ...data, ts:Date.now() }));
}

function registryAll() {
  const now = Date.now();
  const out = {};
  for (const [id, s] of SYSTEM_REGISTRY) {
    out[id] = { ...s, online: (now - (s.lastSeen||0)) < 30000 };
  }
  return out;
}

// ── Per-system ledger — §2.2 persisted to disk + in-memory ring ─────────────
// §2.2: Storage device is the source of truth. Survives restart.
const LEDGER_MAX  = 200;
const LEDGER_DIR  = path.join(ROOT, 'data', 'ledger');
const LEDGER_FILE = path.join(LEDGER_DIR, 'orchestrator.jsonl');

// §LAW II — module-scope event ledger: every ledgerWrite goes here first
let _eventLedger = null;
try {
  const { createEventLedger } = require('./lib/event-ledger');
  _eventLedger = createEventLedger({ ledgerDir: LEDGER_DIR, systemId:'orchestrator' });
  _eventLedger.open();
  _eventLedger.startAutoSave(60000);
} catch(e) { console.warn('[orchestrator] event-ledger init failed:', e.message); }

// In-memory ring (fast reads)
const LEDGER = { orchestrator:[], cortex:[], guardian:[], idearium:[], emerge:[] };

// Ensure ledger dir exists
try { fs.mkdirSync(LEDGER_DIR, { recursive: true }); } catch(_) {}

// Replay from disk on boot (§7.6 — codebase is a materialised view of the ledger)
let _ledgerFd = null;
try {
  if (fs.existsSync(LEDGER_FILE)) {
    const lines = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines.slice(-1000)) {  // last 1000 on boot
      try {
        const e = JSON.parse(line);
        const ring = LEDGER[e._system] || (LEDGER[e._system] = []);
        ring.push(e);
        if (ring.length > LEDGER_MAX) ring.shift();
      } catch(_) {}
    }
  }
  _ledgerFd = fs.createWriteStream(LEDGER_FILE, { flags: 'a' });
  // ORC-14: WriteStream errors don't throw synchronously — listen on 'error' event
  _ledgerFd.on('error', e => {
    console.error('[ledger] disk write error:', e.message);
    _ledgerFd = null; // stop further writes to a broken stream
  });
} catch(e) { console.warn('[ledger] disk init failed:', e.message); }

function ledgerWrite(system, type, payload = {}) {
  // §LAW II — event-ledger writes first, before anything else sees this event
  if (_eventLedger) {
    _eventLedger.record(type, payload, { source: system, causedBy: payload.causedBy || null });
  }
  const entry = { _system: system, _ts: Date.now(), type, payload };
  const ring  = LEDGER[system] || (LEDGER[system] = []);
  ring.unshift(entry);
  if (ring.length > LEDGER_MAX) ring.pop();
  // §2.2 — persist to disk
  if (_ledgerFd) {
    try { _ledgerFd.write(JSON.stringify(entry) + '\n'); } catch(_) {}
  }
  // §2.3 — broadcast to SSE clients
  broadcast(JSON.stringify({ type: 'ledger.entry', system, entry, ts: Date.now() }));
}

function ledgerAll(n = 100) {
  const all = [];
  for (const [sys, ring] of Object.entries(LEDGER)) {
    for (const e of ring) all.push({ ...e, _system: sys });
  }
  return all.sort((a, b) => (b._ts || 0) - (a._ts || 0)).slice(0, n);
}

function broadcast(data) {
  const msg = `data: ${data}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch(_) { sseClients.delete(res); }
  }
}

function connectBridgeRelay() {
  // ORC-05: prevent double-connect and clear any pending retry timer first

  const r = http.request({
    hostname:'127.0.0.1', port:9999,
    headers:{Accept:'text/event-stream'},
  }, res => {
    let buf = '';
    res.on('data', c => {
      buf += c.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (l.startsWith('data:')) broadcast(l.slice(5).trim());
      }
    });
    res.on('end', () => {
      // ORC-05: single timer, cleared above on next connect
    });
  });
  r.on('error', () => {
  });
  r.end();
}

// ── §AXIOM: System watchdog — pauses bridge relay until core systems online ────
// Orchestrator knows the required boot order. If bridge/cortex are down it
// retries every 5s and logs to ledger. Forge UI will show red dots until they come up.
const REQUIRED_SYSTEMS   = ['cortex','guardian','idearium']; // must be online for full operation
const WATCHDOG_INTERVAL  = 10000; // ms
const _prevSystemState   = {}; // track transitions: online ↔ offline

let _watchdogRunning = false; // ORC-06: prevent overlapping watchdog ticks
async function systemWatchdog() {
  if (_watchdogRunning) return;
  _watchdogRunning = true;
  try {
  const systems = await allHealth();
  const now     = Date.now();
  let   allRequired = true;

  for (const { id, online, ms } of systems) {
    const prev    = _prevSystemState[id];
    const changed = prev !== undefined && prev !== online;

    if (changed) {
      const evType = online ? 'system.online' : 'system.offline';
      ledgerWrite('orchestrator', evType, { systemId:id, ms });
      broadcast(JSON.stringify({ type:`orchestrator.${evType}`, systemId:id, online, ms, ts:now }));
      console.log(`\x1b[${online?'32':'31'}m[watchdog] ${id} → ${online?'ONLINE':'OFFLINE'}\x1b[0m`);
    }

    _prevSystemState[id] = online;
    if (REQUIRED_SYSTEMS.includes(id) && !online) allRequired = false;
  }



  // Broadcast current health to all SSE clients
  broadcast(JSON.stringify({
    type: 'orchestrator.watchdog.tick',
    systems: Object.fromEntries(systems.map(s=>[s.id,{ online:s.online, ms:s.ms }])),
    allRequired, ts: now,
  }));
  } finally { _watchdogRunning = false; } // ORC-06
}

// Start watchdog after server is ready
function startWatchdog() {
  // Initial check after 2s (let systems start)
  setTimeout(async () => {
    await systemWatchdog();
    setInterval(systemWatchdog, WATCHDOG_INTERVAL);
  }, 2000);
}

// ── UI hotswap watcher ────────────────────────────────────────────────────────
const UI_SYSTEMS = ['cortex','guardian','idearium','emerge','orchestrator'];
// System-local ui/ dirs (guardian/ui/, cortex/ui/, etc.) — also watched
// These are the canonical sources. Edit files here → hotswap fires.
// Run `npm run sync-ui` to mirror them to root ui/<system>/ for orchestrator serving.
const SYSTEM_LOCAL_UI_DIRS = [
  { system:'guardian',     dir: path.join(ROOT,'guardian','ui') },
  { system:'cortex',       dir: path.join(ROOT,'cortex','ui') },
  { system:'idearium',     dir: path.join(ROOT,'idearium','ui') },
  { system:'nexus',       dir: path.join(ROOT,'ui') },
  { system:'emerge',       dir: path.join(ROOT,'emerge','ui') },
  { system:'orchestrator', dir: path.join(ROOT,'ui','orchestrator') },
];

// ── UI Hotswap Watcher ───────────────────────────────────────────────────────
// Watches ONLY system-local ui/ dirs (guardian/ui/, cortex/ui/, etc.)
// These are the canonical source of truth for each system's UI.
// The root ui/<system>/ dirs are mirrors — updated manually by npm run sync-ui.
// NO file copying in watchers. Copying causes infinite loops.
// Debounce at 500ms per file key prevents rapid re-fires from editors.
const _hotswapDebounce = new Map();
// ORC-09: clear stale debounce entries every 30s to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - 30000;
  for (const [key, ts] of _hotswapDebounce) {
    if (ts < cutoff) _hotswapDebounce.delete(key);
  }
}, 30000).unref();

function watchUIDirs() {
  const WATCH_DIRS = SYSTEM_LOCAL_UI_DIRS.filter(({ dir }) => {
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch(_) {}
      return false;
    }
    return true;
  });

  for (const { system, dir } of WATCH_DIRS) {
    try {
      fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const ext = path.extname(filename).toLowerCase();
        if (!['.html', '.js', '.css', '.json'].includes(ext)) return;
        const key = `${dir}::${filename}`;
        const now = Date.now();
        if (now - (_hotswapDebounce.get(key) || 0) < 500) return;
        _hotswapDebounce.set(key, now);
        const msg = JSON.stringify({
          type: 'orchestrator.ui.hotswap',
          system, file: filename, event, ts: now,
        });
        broadcast(msg);
        console.log(`[hotswap] ${system}/ui/${filename}`);
      });
      console.log(`[ui] watching ${system}/ui/`);
    } catch (e) {
      console.error(`[hotswap] watch failed ${system}/ui/: ${e.message}`);
    }
  }
}

// ── MIME ──────────────────────────────────────────────────────────────────────
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

function serveFile(res, fp) {
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'text/plain', 'Access-Control-Allow-Origin':'*' });
    res.end(data);
  });
}

// ORC-10/11: Validate that resolved path stays within a root dir (path traversal guard)
function _safePath(root, ...parts) {
  const resolved = path.resolve(path.join(root, ...parts));
  return resolved.startsWith(path.resolve(root)) ? resolved : null;
}

// ── JSON response helpers ─────────────────────────────────────────────────────
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  // ORC-01: accumulate Buffer chunks — don't do d += c (corrupts multi-byte chars)
  return new Promise(resolve => {
    const chunks = [];
    let total = 0;
    req.on('data', c => { total += c.length; chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw || '{}')); } catch(_) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bridge-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u     = new URL(req.url, `http://localhost:${PORT}`);
  const seg   = u.pathname.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
  const top   = seg[0] || '';
  const sub   = seg[1] || '';
  const rest  = seg.slice(2).join('/');
  const M     = req.method;
  const QS    = u.searchParams;

  // ── Root UI — NEXUS Home (Phase 1: structure complete) ─────────────────
  if (M==='GET' && (u.pathname==='/' || u.pathname==='/home')) {
    const homePath = path.join(UI_ROOT,'home','index.html');
    if (fs.existsSync(homePath)) return serveFile(res, homePath);
    // fallback to orchestrator UI while home is being built
    return serveFile(res, path.join(UI_ROOT,'orchestrator','index.html'));
  }

  // ── Home static assets ───────────────────────────────────────────────────
  if (M==='GET' && u.pathname.startsWith('/home/')) {
    // ORC-11: path traversal guard
    const asset = _safePath(UI_ROOT, u.pathname.slice(1));
    if (asset && fs.existsSync(asset)) return serveFile(res, asset);
    else if (!asset) return json(res, 403, { ok:false, error:'forbidden path' });
  }

  // ── System UIs ───────────────────────────────────────────────────────────
  if (M==='GET' && top==='ui' && sub) {
    // ORC-10: path traversal guard — validate both sub and rest
    const fp = _safePath(UI_ROOT, sub, rest || 'index.html');
    if (!fp) return json(res, 403, { ok:false, error:'forbidden path' });
    if (fs.existsSync(fp)) return serveFile(res, fp);
    const idx = _safePath(UI_ROOT, sub, 'index.html');
    if (idx && fs.existsSync(idx)) return serveFile(res, idx);
    return json(res, 404, { ok:false, error:`UI not found: ${sub}` });
  }

  // ── SSE unified ──────────────────────────────────────────────────────────
  if (M==='GET' && u.pathname==='/sse') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache',
      'Connection':'keep-alive', 'Access-Control-Allow-Origin':'*' });
    res.write(`data: ${JSON.stringify({ type:'orchestrator.connected', ts:Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── /health ──────────────────────────────────────────────────────────────
  if (M==='GET' && u.pathname==='/health') {
    const systems = await allHealth();
    const online  = systems.filter(s=>s.online).length;
    return json(res, 200, {
      ok:true, orchestrator:'nexus-orchestrator-v2', port:PORT,
      uptime:process.uptime(), online, total:systems.length,
      systems: Object.fromEntries(systems.map(s=>[s.id,{online:s.online,ms:s.ms}])),
    });
  }

  // ── Top-level static routes (before /api check) ─────────────────────────
  if (M==='GET' && u.pathname==='/ports.js') {
    return serveFile(res, path.join(UI_ROOT,'ports.js'));
  }

  // ────────────────────────────────────────────────────────────────────────
  // All orchestrated routes under /api/*
  // ────────────────────────────────────────────────────────────────────────
  if (top !== 'api') {
    return json(res, 404, { ok:false, error:`route not found: ${M} ${u.pathname}` });
  }

  // ── Meta routes ───────────────────────────────────────────────────────────
  if (M==='GET' && sub==='status') {
    const systems = await allHealth();
    return json(res, 200, { ok:true, ts:Date.now(),
      systems: Object.fromEntries(systems.map(s=>[s.id,{
        online:s.online, ms:s.ms, label:s.sys.label,
        port:s.sys.port, color:s.sys.color, data:s.d,
      }])),
    });
  }

  if (M==='GET' && sub==='channels')  return json(res, 200, { ok:true, channels:CHANNELS });

  // ── §AXIOM: System registration — all systems call this on boot ───────────
  // Flow: system boots → bus connects → kernel starts → registers here
  if (M==='POST' && sub==='register') {
    const body = await readBody(req);
    const { systemId, port, meta = {} } = body;
    if (!systemId) return json(res, 400, { ok:false, error:'systemId required' });
    registryUpdate(systemId, { port, meta, registeredAt: Date.now() });
    // Acknowledge with current orchestrator state for context
    return json(res, 200, {
      ok: true, systemId, ts: Date.now(),
      orchestrator: { port: PORT, version: '2.0.0', uptime: process.uptime() },
      registry: registryAll(),
    });
  }

  // ── §AXIOM: Recall — read-only ledger replay for CLIs ─────────────────────
  // All CLIs use recall to get context. Orchestrator is the source of truth.
  if (M==='GET' && sub==='recall') {
    const system  = QS.get('system') || '';
    const type    = QS.get('type')   || '';
    const n       = parseInt(QS.get('n') || '200');
    const since   = parseInt(QS.get('since') || '0');
    const before  = parseInt(QS.get('before') || '0');
    // Read from persisted JSONL for full history
    let entries = [];
    try {
      if (fs.existsSync(LEDGER_FILE)) {
        // ORC-07: readFileSync blocks the event loop. Cap at last 5000 lines to
        // limit blocking time. For production scale use readline streaming instead.
        const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
        const lines = raw.split('\n').filter(Boolean);
        const readLines = lines.slice(-5000); // cap to prevent extreme blocking
        for (const line of readLines) {
          try {
            const e = JSON.parse(line);
            if (system && e._system !== system) continue;
            if (type   && !e.type?.includes(type)) continue;
            if (since  && (e._ts||0) < since)  continue;
            if (before && (e._ts||0) > before) continue;
            entries.push(e);
          } catch(_) {}
        }
      }
    } catch(e) { console.warn('[recall] read failed:', e.message); }
    // Merge with in-memory ring (most recent)
    const ringEntries = system && LEDGER[system] ? LEDGER[system] : ledgerAll(500);
    const seen = new Set(entries.map(e => e._ts + ':' + e.type));
    for (const e of ringEntries) {
      const k = e._ts + ':' + e.type;
      if (!seen.has(k)) { seen.add(k); entries.push(e); }
    }
    entries.sort((a,b) => (b._ts||0)-(a._ts||0));
    entries = entries.slice(0, n);
    return json(res, 200, {
      ok: true, entries, n: entries.length,
      systems: Object.keys(LEDGER),
      registry: registryAll(),
      counts: Object.fromEntries(Object.entries(LEDGER).map(([k,v])=>[k,v.length])),
    });
  }

  // ── System registry read ──────────────────────────────────────────────────
  if (M==='GET' && sub==='registry') {
    return json(res, 200, { ok:true, registry: registryAll(), ts: Date.now() });
  }

  // ── Heartbeat from any system ─────────────────────────────────────────────
  // Receives beats from: systems (via lib/pulse.js), UI pages (via ui/pulse.js)
  // Returns: full system health snapshot so caller can update dots immediately
  if (M==='POST' && sub==='heartbeat') {
    const body = await readBody(req);
    const { systemId, port, status = 'online', seq, pulseId, meta = {} } = body;
    const now = Date.now();

    if (systemId) {
      const existing = SYSTEM_REGISTRY.get(systemId) || {};
      SYSTEM_REGISTRY.set(systemId, {
        ...existing, systemId, port, status, meta,
        lastSeen: now, seq, pulseId,
      });
    }

    // Build lightweight health snapshot from registry (no outbound requests — fast)
    const snapshot = {};
    for (const [id, s] of SYSTEM_REGISTRY) {
      snapshot[id] = {
        online: (now - (s.lastSeen || 0)) < 30000,
        ms:     s.latencyMs || null,
        port:   s.port,
      };
    }

    // Broadcast pulse event to all SSE clients — updates health dots in real time
    broadcast(JSON.stringify({
      type:     'orchestrator.pulse',
      systemId: systemId || 'orchestrator',
      seq,
      pulseId,
      systems:  snapshot,
      ts:       now,
    }));

    ledgerWrite('orchestrator', 'orchestrator.pulse', {
      systemId, seq, pulseId, port,
      clients: sseClients.size,
    });

    return json(res, 200, {
      ok:      true,
      ts:      now,
      seq,
      pulseId,
      systems: snapshot,
    });
  }

  // ── Unified SISO bus log — all systems' event buses merged ────────────────
  if (M==='GET' && sub==='bus') {
    const n   = parseInt(QS.get('n') || '100');
    const sys = QS.get('system') || '';
    const results = await Promise.all([
      GET('guardian',`/bus?n=${n}`).catch(()=>null),
      GET('cortex','/sse').catch(()=>null),  // cortex SSE log via health
    ]);
    const guardianLog = results[0]?.entries || [];
    // Merge with orchestrator's own ledger
    const orchEntries = ledgerAll(n).map(e => ({
      seq: e._ts, ts: e._ts, type: e.type, system: e._system, claimed: null,
    }));
    const all = [...guardianLog.map(e=>({...e,system:'guardian'})), ...orchEntries]
      .sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,n);
    return json(res, 200, {
      ok: true,
      entries: sys ? all.filter(e=>e.system===sys) : all,
      gates: results[0]?.gates || [],
      guardian: { count: guardianLog.length },
      orchestrator: { count: orchEntries.length },
    });
  }

  // ── Ledger — all system events ────────────────────────────────────────────
  if (M==='GET' && sub==='ledger') {
    const system = QS.get('system') || '';
    const n      = parseInt(QS.get('n') || '100');
    const entries = system && LEDGER[system] ? LEDGER[system].slice(0, n) : ledgerAll(n);
    return json(res, 200, { ok:true, entries, systems:Object.keys(LEDGER), counts: Object.fromEntries(Object.entries(LEDGER).map(([k,v])=>[k,v.length])) });
  }

  // ── Exec — run CLI command and stream result ──────────────────────────────
  if (M==='POST' && sub==='exec') {
    const body = await readBody(req);
    const { cmd = '', args = [], system = '' } = body;
    if (!cmd) return json(res, 400, { ok:false, error:'cmd required' });
    // ORC-02: allowlist — prevent arbitrary OS execution via SSRF/XSS
    const ALLOWED_BINS = new Set(['node','npm','npx','git','ls','cat','echo','pwd','which']);
    const { spawnSync } = require('child_process');
    const fullArgs = args.length ? [cmd, ...args] : cmd.split(' ').filter(Boolean);
    const bin = fullArgs.shift();
    if (!ALLOWED_BINS.has(require('path').basename(bin))) {
      return json(res, 403, { ok:false, error:`exec: '${bin}' not in allowlist` });
    }
    const result = spawnSync(bin, fullArgs, { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    const output = (result.stdout || '') + (result.stderr || '');
    const entry = { cmd: [bin, ...fullArgs].join(' '), exit: result.status, output, ts: Date.now() };
    ledgerWrite('orchestrator', 'exec', entry);
    return json(res, 200, { ok: result.status === 0, ...entry });
  }

  // ── Ledger write from external systems ────────────────────────────────────
  if (M==='POST' && sub==='ledger') {
    const body = await readBody(req);
    const { system = 'orchestrator', type = 'event', payload = {} } = body;
    ledgerWrite(system in LEDGER ? system : 'orchestrator', type, payload);
    return json(res, 200, { ok:true });
  }
  if (M==='GET' && sub==='cli')       return json(res, 200, { ok:true, cli:CLI_REF });
  if (M==='GET' && sub==='ui') {
    return json(res, 200, { ok:true, uis: UI_SYSTEMS.map(s => {
      const fp = path.join(UI_ROOT,s,'index.html');
      const st = fs.existsSync(fp) ? fs.statSync(fp) : null;
      return { system:s, url:`/ui/${s}`, exists:!!st, size:st?.size||0, modified:st?.mtime?.toISOString()||null };
    })});
  }

  if (M==='GET' && sub==='baselines') {
    // What the ledger has learned: event baselines and invariants
    if (!_eventLedger) return json(res, 503, { ok:false, error:'event ledger not started' });
    const baselines  = _eventLedger.getAllBaselines();
    const stats      = _eventLedger.getAllStats();
    const invariants = _eventLedger.scanInvariants(5000);
    return json(res, 200, { ok:true, baselines, stats: Object.fromEntries(
      Object.entries(stats).map(([k,v]) => [k, { count: v.count, lastTs: v.lastTs }])
    ), invariants, ts: Date.now() });
  }

  if (M==='GET' && sub==='api-map') {
    return json(res, 200, { ok:true, generated: new Date().toISOString(), systems: {
      cortex:{ port:3748, routes:[
        { m:'GET',p:'/health' },{ m:'GET',p:'/sse' },{ m:'GET',p:'/api/events?n=N' },
        { m:'POST',p:'/api/event' },{ m:'GET',p:'/api/gaps' },{ m:'GET',p:'/api/failures' },
        { m:'GET',p:'/api/memory?table=x&n=N' },{ m:'POST',p:'/api/memory/search' },
        { m:'POST',p:'/api/memory/forget' },{ m:'GET',p:'/api/files' },
        { m:'GET',p:'/api/tags?entityId=x' },{ m:'POST',p:'/api/tags' },
        { m:'GET',p:'/api/ring' },{ m:'GET',p:'/api/modules' },
      ]},
      guardian:{ port:7820, routes:[
        { m:'POST',p:'/command' },{ m:'GET',p:'/status/:jobId' },{ m:'GET',p:'/response/:jobId' },
        { m:'GET',p:'/stream/:jobId' },{ m:'GET',p:'/jobs' },{ m:'GET',p:'/providers' },
        { m:'GET',p:'/health' },{ m:'GET',p:'/events' },{ m:'GET',p:'/log' },
        { m:'GET',p:'/artifacts' },{ m:'POST',p:'/artifacts' },{ m:'DELETE',p:'/artifacts/:hash' },
        { m:'POST',p:'/memory/ingest' },{ m:'GET',p:'/memory/query' },{ m:'GET',p:'/memory/artifacts' },
        { m:'GET',p:'/memory/ledger' },{ m:'GET',p:'/memory/context' },{ m:'GET',p:'/memory/stats' },
        { m:'GET',p:'/memory/downloads' },{ m:'POST',p:'/ledger' },{ m:'GET',p:'/ledger' },
        { m:'GET',p:'/cockpit' },
      ]},
      idearium:{ port:4800, routes:[
        { m:'GET',p:'/' },{ m:'GET',p:'/api/snr' },{ m:'GET',p:'/api/snr/history' },
        { m:'GET',p:'/api/events' },{ m:'GET',p:'/api/ideas' },{ m:'POST',p:'/api/ideas' },
        { m:'GET',p:'/api/ideas/:uuid' },{ m:'PATCH',p:'/api/ideas/:uuid' },
        { m:'POST',p:'/api/ideas/:uuid/tension' },{ m:'POST',p:'/api/ideas/:uuid/phase' },
        { m:'POST',p:'/api/ideas/:uuid/link' },{ m:'POST',p:'/api/ideas/:uuid/spec' },
        { m:'GET',p:'/api/specs' },{ m:'GET',p:'/api/specs/:uuid' },{ m:'POST',p:'/api/specs/:uuid/build' },
        { m:'GET',p:'/api/gaps' },{ m:'POST',p:'/api/gaps' },
        { m:'POST',p:'/api/gaps/:uuid/resolve' },{ m:'GET',p:'/api/snapshots' },
        { m:'POST',p:'/api/snapshots' },{ m:'GET',p:'/api/contract' },{ m:'GET',p:'/api/stats' },
      ]},
      orchestrator:{ port:PORT, routes:[
        { m:'GET',p:'/' },{ m:'GET',p:'/health' },{ m:'GET',p:'/sse' },
        { m:'GET',p:'/ui/:system' },{ m:'GET',p:'/api/status' },{ m:'GET',p:'/api/channels' },
        { m:'GET',p:'/api/cli' },{ m:'GET',p:'/api/ui' },{ m:'GET',p:'/api/api-map' },
      ]},
    }});
  }


  // ── Cortex proxy ──────────────────────────────────────────────────────────
  if (sub==='cortex') {
    const action = seg[2] || '';
    const action2= seg[3] || '';

    if (M==='GET'  && action==='health')           return json(res,200,await GET('cortex','/health'));
    if (M==='GET'  && action==='events')           return json(res,200,await GET('cortex',`/api/events?n=${QS.get('n')||20}`));
    if (M==='POST' && action==='event')            return json(res,200,await POST('cortex','/api/event',await readBody(req)));
    if (M==='GET'  && action==='gaps')             return json(res,200,await GET('cortex',`/api/gaps${QS.get('status')?'?status='+QS.get('status'):''}`));
    if (M==='GET'  && action==='failures')         return json(res,200,await GET('cortex','/api/failures'));
    if (M==='GET'  && action==='ring')             return json(res,200,await GET('cortex','/api/ring'));
    if (M==='GET'  && action==='modules')          return json(res,200,await GET('cortex','/api/modules'));
    if (M==='GET'  && action==='files' && !action2) return json(res,200,await GET('cortex',`/api/files?n=${QS.get('n')||200}`));
    if (M==='GET'  && action==='files' && action2==='get') return json(res,200,await GET('cortex',`/api/files/get?hash=${QS.get('hash')||''}`));
    if (M==='POST' && action==='files' && action2==='upload') return json(res,200,await POST('cortex','/api/files/upload',await readBody(req)));
    if (M==='GET'  && action==='versionium' && action2==='log') return json(res,200,await GET('cortex',`/api/versionium/log?n=${QS.get('n')||50}${QS.get('branch')?'&branch='+QS.get('branch'):''}`));
    if (M==='POST' && action==='versionium' && action2==='commit') return json(res,200,await POST('cortex','/api/versionium/commit',await readBody(req)));
    if (M==='GET'  && action==='projects')         return json(res,200,await GET('cortex','/api/projects'));
    if (M==='POST' && action==='ess' && action2==='analyse') return json(res,200,await POST('cortex','/api/ess/analyse',await readBody(req)));
    if (M==='GET'  && action==='tags')             return json(res,200,await GET('cortex',`/api/tags?entityId=${QS.get('entityId')||''}`));
    if (M==='POST' && action==='tags')             return json(res,200,await POST('cortex','/api/tags',await readBody(req)));
    if (M==='GET'  && action==='memory' && !action2) return json(res,200,await GET('cortex',`/api/memory?table=${QS.get('table')||'event_log'}&n=${QS.get('n')||50}`));
    if (M==='POST' && action==='memory' && action2==='search') return json(res,200,await POST('cortex','/api/memory/search',await readBody(req)));
    if (M==='POST' && action==='memory' && action2==='forget') return json(res,200,await POST('cortex','/api/memory/forget',await readBody(req)));
    if (M==='GET'  && action==='requests')         return json(res,200,await GET('cortex','/api/requests'));
    if (M==='GET'  && !action)                     return json(res,200,await GET('cortex','/health'));
    if (M==='GET'  && action==='contract')         return json(res,200,await GET('cortex','/contract'));

    // SSE proxy
    if (M==='GET' && action==='sse') {
      res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*' });
      const r = http.request({ hostname:'127.0.0.1',port:3748,path:'/sse',method:'GET',headers:{Accept:'text/event-stream'} }, rs => {
        rs.on('data', c => res.write(c)); rs.on('end', () => res.end());
      });
      r.on('error', () => { try { res.end(); } catch {} });
      r.on('close', () => { try { res.end(); } catch {} }); // ORC-15
      r.end();
      req.on('close', () => r.destroy());
      return;
    }

    return json(res,404,{ok:false,error:`cortex route not found: ${M} /api/cortex/${action}`});
  }

  // ── Guardian proxy ────────────────────────────────────────────────────────
  if (sub==='guardian') {
    const action = seg[2] || '';
    const uuid   = seg[3] || '';
    const op     = seg[4] || '';
    const sub2   = seg[3] || '';

    if (M==='GET'  && !action)                      return json(res,200,await GET('guardian','/health'));
    if (M==='GET'  && action==='contract')          return json(res,200,await GET('guardian','/contract'));
    if (M==='GET'  && action==='health')             return json(res,200,await GET('guardian','/health'));
    if (M==='GET'  && action==='bus')                return json(res,200,await GET('guardian',`/bus?n=${QS.get('n')||100}`));
    if (M==='POST' && action==='bus' && sub2==='emit') return json(res,200,await POST('guardian','/bus/emit',await readBody(req)));
    if (M==='GET'  && action==='providers')          return json(res,200,await GET('guardian','/providers'));
    if (M==='GET'  && action==='jobs')               return json(res,200,await GET('guardian',`/jobs?status=${QS.get('status')||''}&limit=${QS.get('limit')||20}`));
    if (M==='GET'  && action==='log')                return json(res,200,await GET('guardian',`/log?limit=${QS.get('limit')||20}`));
    if (M==='POST' && action==='dispatch')           return json(res,202,await POST('guardian','/command',await readBody(req)));
    if (M==='GET'  && action==='status' && uuid)     return json(res,200,await GET('guardian',`/status/${uuid}`));
    if (M==='GET'  && action==='response' && uuid)   return json(res,200,await GET('guardian',`/response/${uuid}`));
    if (M==='GET'  && action==='artifacts' && !uuid) return json(res,200,await GET('guardian',`/artifacts?lang=${QS.get('lang')||''}&q=${QS.get('q')||''}`));
    if (M==='GET'  && action==='artifacts' && uuid)  return json(res,200,await GET('guardian',`/artifacts/${uuid}`));
    if (M==='POST' && action==='artifacts')          return json(res,200,await POST('guardian','/artifacts',await readBody(req)));
    if (M==='DELETE'&&action==='artifacts' && uuid)  return json(res,200,await DEL('guardian',`/artifacts/${uuid}`));
    if (M==='POST' && action==='ledger')             return json(res,200,await POST('guardian','/ledger',await readBody(req)));
    if (M==='GET'  && action==='ledger')             return json(res,200,await GET('guardian',`/ledger?category=${QS.get('category')||''}`));

    // Memory sub-routes
    if (action==='memory') {
      if (M==='POST' && uuid==='ingest')   return json(res,200,await POST('guardian','/memory/ingest',await readBody(req)));
      if (M==='GET'  && uuid==='query')    return json(res,200,await GET('guardian',`/memory/query?q=${encodeURIComponent(QS.get('q')||'')}`));
      if (M==='GET'  && uuid==='artifacts')return json(res,200,await GET('guardian','/memory/artifacts'));
      if (M==='GET'  && uuid==='ledger')   return json(res,200,await GET('guardian',`/memory/ledger?limit=${QS.get('limit')||50}`));
      if (M==='GET'  && uuid==='context')  return json(res,200,await GET('guardian',`/memory/context?q=${encodeURIComponent(QS.get('q')||'')}`));
      if (M==='GET'  && uuid==='stats')    return json(res,200,await GET('guardian','/memory/stats'));
      if (M==='GET'  && uuid==='downloads')return json(res,200,await GET('guardian','/memory/downloads'));
    }

    // Stream proxy (SSE)
    if (M==='GET' && action==='stream' && uuid) {
      res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*' });
      const r = http.request({ hostname:'127.0.0.1',port:7820,path:`/stream/${uuid}`,method:'GET',headers:{Accept:'text/event-stream'} }, rs => {
        rs.on('data', c => res.write(c)); rs.on('end', () => res.end());
      });
      r.on('error', () => res.end()); r.end();
      req.on('close', () => r.destroy());
      return;
    }

    // Events SSE proxy
    if (M==='GET' && action==='events') {
      res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*' });
      const r = http.request({ hostname:'127.0.0.1',port:7820,path:'/events',method:'GET',headers:{Accept:'text/event-stream'} }, rs => {
        rs.on('data', c => res.write(c)); rs.on('end', () => res.end());
      });
      r.on('error', () => res.end()); r.end();
      req.on('close', () => r.destroy());
      return;
    }

    return json(res,404,{ok:false,error:`guardian route not found: ${M} /api/guardian/${action}`});
  }

  // ── Idearium proxy ────────────────────────────────────────────────────────
  if (sub==='idearium') {
    const action = seg[2] || '';
    const uuid   = seg[3] || '';
    const op     = seg[4] || '';

    if (M==='GET'  && !action)               return json(res,200,await GET('idearium','/health'));
    if (M==='GET'  && action==='health')     return json(res,200,await GET('idearium','/health'));
    if (M==='GET'  && action==='snr' && !uuid)    return json(res,200,await GET('idearium','/api/snr'));
    if (M==='GET'  && action==='snr' && uuid==='history') return json(res,200,await GET('idearium','/api/snr/history'));
    if (M==='GET'  && action==='events')     return json(res,200,await GET('idearium','/api/events'));
    if (M==='GET'  && action==='stats')      return json(res,200,await GET('idearium','/api/stats'));
    if (M==='GET'  && action==='contract')   return json(res,200,await GET('idearium','/api/contract'));

    if (action==='ideas') {
      if (M==='GET'  && !uuid)               return json(res,200,await GET('idearium','/api/ideas'));
      if (M==='POST' && !uuid)               return json(res,200,await POST('idearium','/api/ideas',await readBody(req)));
      if (M==='GET'  && uuid && !op)         return json(res,200,await GET('idearium',`/api/ideas/${uuid}`));
      if (M==='PATCH'&& uuid && !op)         return json(res,200,await PATCH('idearium',`/api/ideas/${uuid}`,await readBody(req)));
      if (M==='DELETE'&& uuid && !op)        return json(res,200,await DEL('idearium',`/api/ideas/${uuid}`));
      if (M==='POST' && uuid && op)          return json(res,200,await POST('idearium',`/api/ideas/${uuid}/${op}`,await readBody(req)));
    }

    if (action==='specs') {
      if (M==='GET'  && !uuid)               return json(res,200,await GET('idearium','/api/specs'));
      if (M==='GET'  && uuid && !op)         return json(res,200,await GET('idearium',`/api/specs/${uuid}`));
      if (M==='POST' && uuid && op==='build')return json(res,200,await POST('idearium',`/api/specs/${uuid}/build`,await readBody(req)));
    }

    if (action==='gaps') {
      if (M==='GET'  && !uuid)               return json(res,200,await GET('idearium','/api/gaps'));
      if (M==='POST' && !uuid)               return json(res,200,await POST('idearium','/api/gaps',await readBody(req)));
      if (M==='POST' && uuid && op==='resolve') return json(res,200,await POST('idearium',`/api/gaps/${uuid}/resolve`,await readBody(req)));
    }

    if (action==='snapshots') {
      if (M==='GET')                         return json(res,200,await GET('idearium','/api/snapshots'));
      if (M==='POST')                        return json(res,200,await POST('idearium','/api/snapshots',await readBody(req)));
    }

    // SSE proxy
    if (M==='GET' && action==='sse') {
      res.writeHead(200, { 'Content-Type':'text/event-stream','Cache-Control':'no-cache','Access-Control-Allow-Origin':'*' });
      const r = http.request({ hostname:'127.0.0.1',port:4800,path:'/sse',method:'GET',headers:{Accept:'text/event-stream'} }, rs => {
        rs.on('data', c => res.write(c)); rs.on('end', () => res.end());
      });
      r.on('error', () => res.end()); r.end();
      req.on('close', () => r.destroy());
      return;
    }

    return json(res,404,{ok:false,error:`idearium route not found: ${M} /api/idearium/${action}`});
  }

  return json(res,404,{ok:false,error:`route not found: ${M} ${u.pathname}`});
});

// ── CLI ───────────────────────────────────────────────────────────────────────
const C = { r:'\x1b[0m',b:'\x1b[1m',g:'\x1b[32m',red:'\x1b[31m',y:'\x1b[33m',
            c:'\x1b[36m',m:'\x1b[35m',d:'\x1b[90m',blue:'\x1b[34m' };

function sysDot(online) { return online ? `${C.g}●${C.r}` : `${C.red}○${C.r}`; }
function sysCol(id) {
  return { cortex:C.c, guardian:C.m, idearium:C.blue, emerge:C.g, ollama:C.red }[id] || C.d;
}

async function cliStatus() {
  const systems = await allHealth();
  const online  = systems.filter(s=>s.online).length;
  console.log(`\n${C.b}${C.c}⬡  NEXUS${C.r}  ${C.d}orchestrator v2${C.r}  ${online}/${systems.length} online\n`);
  for (const { id, sys, online, ms, d } of systems) {
    const sc = sysCol(id);
    console.log(`  ${sysDot(online)}  ${C.b}${sc}${sys.label.padEnd(12)}${C.r}  ${C.d}:${sys.port}  ${ms}ms${C.r}`);
    if (online) {
      if (id==='cortex'  ) { const n=Object.values(d.jaa?.counts||{}).reduce((a,b)=>a+b,0); if(n) console.log(`     ${C.d}${n} records · 28 tables${C.r}`); }
      if (id==='guardian') {
        const conn=Object.entries(d.providers||{}).filter(([,v])=>v==='connected').map(([k])=>k);
        if(conn.length) console.log(`     ${C.d}providers: ${conn.join(', ')}${C.r}`);
        const q=Object.values(d.queued||{}).reduce((a,b)=>a+b,0);
        if(q) console.log(`     ${C.y}${q} jobs queued${C.r}`);
      }
      if (id==='ollama'  ) { const m=(d.models||[]).map(x=>x.name); if(m.length) console.log(`     ${C.d}${m.join(', ')}${C.r}`); }
    } else { console.log(`     ${C.red}${d.error}${C.r}`); }
  }
  console.log(`\n${C.d}UI:  http://localhost:${PORT}${C.r}`);
  console.log(`${C.d}SSE: http://localhost:${PORT}/sse${C.r}\n`);
}

function cliWatch() {
  console.log(`\n${C.b}${C.c}NEXUS LIVE${C.r}  ${C.d}connecting to cortex SSE…${C.r}\n`);
  const r = http.request({ hostname:'127.0.0.1', port:PORT, path:'/sse', method:'GET', headers:{Accept:'text/event-stream'} }, res => {
    let buf='';
    res.on('data', c => {
      buf+=c.toString();
      const lines=buf.split('\n'); buf=lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue;
        try {
          const d=JSON.parse(l.slice(5).trim());
          const ts=new Date(d.ts||Date.now()).toTimeString().slice(0,8);
          const sys=(d.type||'').split('.')[0];
          console.log(`  ${C.d}${ts}${C.r}  ${sysCol(sys)}${sys.padEnd(10)}${C.r}  ${C.c}${(d.type||'event').padEnd(34)}${C.r}  ${C.d}${JSON.stringify(d).slice(0,60)}${C.r}`);
        } catch(_) {}
      }
    });
    res.on('end', () => { console.log('stream ended'); process.exit(0); });
  });
  r.on('error', e => { console.log(`${C.red}cortex offline: ${e.message}${C.r}`); process.exit(1); });
  r.end();
}

function cliUI() {
  console.log(`\n${C.b}${C.c}NEXUS UI${C.r}  ${C.d}hotswap watcher — edit ui/<system>/ to reload${C.r}\n`);
  for (const sys of UI_SYSTEMS) {
    const fp=path.join(UI_ROOT,sys,'index.html');
    const exists=fs.existsSync(fp);
    const st=exists?fs.statSync(fp):null;
    console.log(`  ${sysDot(exists)}  ${sysCol(sys)}${sys.padEnd(14)}${C.r}  ${C.d}ui/${sys}/index.html${C.r}  ${exists?(st.size/1024).toFixed(1)+'KB':'MISSING'}  →  http://localhost:${PORT}/ui/${sys}`);
  }
  console.log(`\n${C.d}Orchestrator: http://localhost:${PORT}${C.r}\n`);
}

async function cliJobs(statusFilter) {
  const d=await GET('guardian',`/jobs?status=${statusFilter||''}&limit=20`);
  if(d.error){console.log(`${C.red}✗${C.r} Guardian offline: ${d.error}`);return;}
  const jobs=d.jobs||[];
  console.log(`\n${C.b}${C.c}JOBS (${jobs.length})${C.r}\n`);
  for (const j of jobs.slice(0,20)) {
    const sc=j.status==='complete'?C.g:j.status==='failed'?C.red:j.status==='queued'?C.y:C.d;
    console.log(`  ${C.d}${(j.id||'').slice(0,8)}${C.r}  ${sc}${(j.status||'—').padEnd(12)}${C.r}  ${C.m}${(j.provider||'—').padEnd(10)}${C.r}  ${C.d}${(j.command||'').padEnd(6)}${C.r}  ${(j.prompt||'').slice(0,50)}`);
  }
  console.log('');
}

async function cliEvents(n) {
  const d=await GET('cortex',`/api/events?n=${n||20}`);
  if(d.error){console.log(`${C.red}✗${C.r} Cortex offline: ${d.error}`);return;}
  const rows=d.rows||d||[];
  console.log(`\n${C.b}${C.c}EVENTS (${rows.length})${C.r}\n`);
  for (const e of rows) {
    const ts=new Date(e.ts||0).toTimeString().slice(0,8);
    console.log(`  ${C.d}${ts}${C.r}  ${C.c}${(e.type||'—').padEnd(36)}${C.r}  ${C.d}${JSON.stringify(e.payload||{}).slice(0,60)}${C.r}`);
  }
  console.log('');
}

async function cliGaps() {
  const [ig,cg]=await Promise.all([GET('idearium','/api/gaps'),GET('cortex','/api/gaps')]);
  console.log(`\n${C.b}${C.c}GAPS${C.r}\n`);
  const ig_list=ig.gaps||ig||[];
  if(ig_list.length) {
    console.log(`  ${C.d}idearium${C.r}`);
    for (const g of ig_list) console.log(`    ${C.y}○${C.r}  ${C.d}${(g.uuid||'').slice(0,8)}${C.r}  ${g.description?.slice(0,60)||'—'}`);
  }
  const cg_list=(cg.rows||cg||[]).filter(g=>g.status!=='resolved');
  if(cg_list.length) {
    console.log(`  ${C.d}cortex${C.r}`);
    for (const g of cg_list) {
      const pc=(g.pressure||0)>0.7?C.red:C.y;
      console.log(`    ${pc}○${C.r}  ${C.d}${(g.uuid||'').slice(0,8)}${C.r}  ${(g.body||g.message||'—').slice(0,60)}`);
    }
  }
  if(!ig_list.length&&!cg_list.length) console.log(`  ${C.d}no open gaps${C.r}`);
  console.log('');
}

async function cliIdeas() {
  const d=await GET('idearium','/api/ideas');
  if(d.error){console.log(`${C.red}✗${C.r} Idearium offline: ${d.error}`);return;}
  const list=d.ideas||d||[];
  console.log(`\n${C.b}${C.c}IDEAS (${list.length})${C.r}\n`);
  for (const i of [...list].reverse().slice(0,20)) {
    const pc=i.phase==='complete'?C.g:i.phase==='building'?C.c:C.d;
    console.log(`  ${C.d}${(i.uuid||'').slice(0,8)}${C.r}  ${pc}${(i.phase||'seed').padEnd(12)}${C.r}  ${(i.text||i.title||'—').slice(0,60)}`);
  }
  console.log('');
}

async function cliIdea(text) {
  if(!text){console.log(`Usage: node orchestrator.js idea "text"`);return;}
  const d=await POST('idearium','/api/ideas',{text});
  if(d.error){console.log(`${C.red}✗${C.r} ${d.error}`);return;}
  console.log(`${C.g}✓${C.r} Idea: ${(d.idea?.uuid||d.uuid||'').slice(0,8)}  "${text.slice(0,50)}"`);
}

async function cliDispatch(prompt, provider='chatgpt', command='code') {
  if(!prompt){console.log(`Usage: node orchestrator.js dispatch "prompt" [provider] [command]`);return;}
  const d=await POST('guardian','/command',{provider,command,prompt});
  if(d.error){console.log(`${C.red}✗${C.r} Guardian offline: ${d.error}`);return;}
  console.log(`${C.g}✓${C.r} Job ${(d.jobId||'').slice(0,8)}  status: ${d.status}`);
  if(d.status==='queued') console.log(`  ${C.d}waiting for ${provider} userscript — install in Tampermonkey${C.r}`);
  else console.log(`  ${C.d}watch: node cli/nexus.js watch ${d.jobId}${C.r}`);
}





async function cliPush(message) {
  const d=await POST('idearium','/api/snapshots',{message:message||'orchestrator snapshot'});
  if(d.error){console.log(`${C.red}✗${C.r} Idearium offline: ${d.error}`);return;}
  console.log(`${C.g}✓${C.r} Pushed: ${(d.snapshot?.uuid||d.uuid||'').slice(0,8)}  "${message}"`);
}

async function cliSNR() {
  const d=await GET('idearium','/api/snr');
  if(d.error){console.log(`${C.red}✗${C.r} Idearium offline: ${d.error}`);return;}
  const v=d.snr||0;
  const col=v>0.8?C.g:v>0.5?C.y:C.red;
  const bar='█'.repeat(Math.round(v*30))+'░'.repeat(30-Math.round(v*30));
  console.log(`\n  ${col}${bar}${C.r}  ${col}${(v*100).toFixed(1)}% SNR${C.r}\n`);
}

function cliHelp() {
  console.log(`
${C.b}${C.c}NEXUS ORCHESTRATOR${C.r}  v2.0  port ${PORT}

${C.b}Server mode${C.r}
  node orchestrator.js                  start (port ${PORT})

${C.b}CLI commands${C.r}
  node orchestrator.js status           all systems health
  node orchestrator.js watch            live event stream (cortex SSE)
  node orchestrator.js ui               UI file status + hotswap dirs
  node orchestrator.js jobs [status]    guardian jobs
  node orchestrator.js events [n]       cortex event log
  node orchestrator.js gaps             all gaps (idearium + cortex)
  node orchestrator.js ideas            idearium ideas
  node orchestrator.js idea "text"      create idea
  node orchestrator.js dispatch "prompt" [provider] [command]
  node orchestrator.js requests [status] cortex memory queries
  node orchestrator.js tag <id> <tags>  tag entity
  node orchestrator.js push "message"   idearium snapshot
  node orchestrator.js snr              idearium SNR
  node orchestrator.js help             this message

${C.b}Endpoints${C.r}
  GET  /                    orchestrator UI
  GET  /health              all systems health
  GET  /sse                 unified event stream
  GET  /ui/:system          system UI (hotswapped)
  GET  /api/status          full status JSON
  GET  /api/channels        ${CHANNELS.length} SISO channels
  GET  /api/api-map         all routes across all systems
  GET  /api/cli             CLI reference
  GET  /api/ui              UI file status
  *    /api/bridge/*        full bridge API (${19} routes)
  *    /api/cortex/*        full cortex API (${14} routes)
  *    /api/guardian/*      full guardian API (${22} routes)
  *    /api/idearium/*      full idearium API (${22} routes)

${C.b}UI hotswap${C.r}
  Edit any file in ui/<system>/  →  served on next request, no restart
  ui/cortex/      → http://localhost:${PORT}/ui/cortex
  ui/guardian/    → http://localhost:${PORT}/ui/guardian
  ui/idearium/    → http://localhost:${PORT}/ui/idearium
  ui/emerge/      → http://localhost:${PORT}/ui/emerge
  ui/orchestrator/ → http://localhost:${PORT}/
`);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd  = argv[0];

if      (cmd==='status')   allHealth().then(cliStatus).then(()=>process.exit(0));
else if (cmd==='watch')    cliWatch();
else if (cmd==='ui')     { cliUI(); process.exit(0); }
else if (cmd==='jobs')     cliJobs(argv[1]).then(()=>process.exit(0));
else if (cmd==='events')   cliEvents(argv[1]).then(()=>process.exit(0));
else if (cmd==='gaps')     cliGaps().then(()=>process.exit(0));
else if (cmd==='ideas')    cliIdeas().then(()=>process.exit(0));
else if (cmd==='idea')     cliIdea(argv.slice(1).join(' ')).then(()=>process.exit(0));
else if (cmd==='dispatch') cliDispatch(argv[1],argv[2],argv[3]).then(()=>process.exit(0));
else if (cmd==='requests') cliRequests(argv[1]).then(()=>process.exit(0));
else if (cmd==='tag')      cliTag(argv[1],argv[2]).then(()=>process.exit(0));
else if (cmd==='push')     cliPush(argv.slice(1).join(' ')).then(()=>process.exit(0));
else if (cmd==='snr')      cliSNR().then(()=>process.exit(0));
else if (cmd==='help'||cmd==='--help'||cmd==='-h') { cliHelp(); process.exit(0); }
else {
  // Start server
server.listen(PORT, '127.0.0.1', async () => {
  const { BootSequence } = require('./lib/boot-sequence');

  // ════════════════════════════════════════════════════════════════════════════
  // ORCHESTRATOR OWN BOOT SEQUENCE (§AXIOM — starts first)
  // ════════════════════════════════════════════════════════════════════════════
  const ownSeq = new BootSequence({
    systemId: 'orchestrator', port: PORT, version: '2.0.0',
    label: 'Nexus Orchestrator', maxRetries: 1,
  });

  // Phase 0 HARD: HTTP server bound
  ownSeq.phase({ name:'server.bound', type:'HARD',
    label:'HTTP server bound :' + PORT,
    fn: async () => { /* in listen callback = bound */ },
  });

  // Phase 1 HARD: ledger directory writable
  ownSeq.phase({ name:'ledger.writable', type:'HARD',
    label:'Ledger directory writable (§2.1)',
    fn: async () => {
      const ledgerDir = path.join(ROOT, 'data', 'ledger');
      require('fs').mkdirSync(ledgerDir, { recursive: true });
      const testFile = path.join(ledgerDir, '.boot-test');
      require('fs').writeFileSync(testFile, String(Date.now()));
      require('fs').unlinkSync(testFile);
    },
  });

  // Phase 2 HARD: health endpoint responds
  ownSeq.phase({ name:'health.verify', type:'HARD',
    label:'Verify /health responds with ok=true',
    fn: async () => {
      await new Promise((resolve, reject) => {
        const r = require('http').get(
          'http://127.0.0.1:' + PORT + '/health',
          res => { res.statusCode === 200 ? resolve()
            : reject(new Error('health ' + res.statusCode)); }
        );
        r.setTimeout(2000, () => { r.destroy(); reject(new Error('timeout')); });
        r.on('error', reject);
      });
    },
  });

  // Phase 3 HARD: recall endpoint readable
  ownSeq.phase({ name:'recall.verify', type:'HARD',
    label:'Verify /api/recall returns entries array',
    fn: async () => {
      const r = await new Promise((resolve, reject) => {
        let d = '';
        const req = require('http').get(
          'http://127.0.0.1:' + PORT + '/api/recall',
          res => {
            res.on('data', c => { d += c; });
            res.on('end', () => {
              try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
            });
          }
        );
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
      });
      if (!Array.isArray(r.entries)) throw new Error('entries not array');
    },
  });

  // Phase 4 SOFT: UI hotswap watcher
  ownSeq.phase({ name:'ui.hotswap', type:'SOFT',
    label:'Start UI hotswap file watcher',
    fn: async () => { watchUIDirs(); },
  });

  // Phase 5 SOFT: open CLI terminal
  ownSeq.phase({ name:'cli.terminal', type:'SOFT',
    label:'Open CLI terminal (nexus-repl.js)',
    fn: async () => {
      const VERSION = '2.0.0';
      const { spawn } = require('child_process');
      const cliScript = path.join(ROOT, 'cli', 'nexus-repl.js');
      const args = [cliScript, '--repl', `--port=${PORT}`];
      const terminals = [
        ['cmd',    ['/c','start','cmd','/k','node',...args]],
        ['osascript',['-e',`tell app "Terminal" to do script "node ${cliScript} --repl --port=${PORT}"`]],
        ['gnome-terminal',['--','node',...args]],
        ['xterm',['-e','node',...args]],
        ['konsole',['--','node',...args]],
      ];
      for (const [bin, termArgs] of terminals) {
        try {
          const proc = spawn(bin, termArgs, { detached:true, stdio:'ignore', windowsHide:false });
          proc.on('error', () => {});
          proc.unref();
          ledgerWrite('orchestrator','orchestrator.cli.terminal.opened',{ terminal:bin });
          break;
        } catch(_) {}
      }
    },
  });

  // Phase 6 SOFT: open NEXUS UI in browser
  // Controlled by orchestrator.config.json → openUIOnBoot (default: true)
  ownSeq.phase({ name:'nexus.ui.open', type:'SOFT',
    label:'Open NEXUS UI in browser',
    fn: async () => {
      const cfgPath = path.join(ROOT, 'orchestrator.config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
      if (cfg.openUIOnBoot === false) return;  // explicit opt-out only
      const rawUrl = cfg.uiURL || `http://127.0.0.1:${PORT}`;
      // ORC-12: validate uiURL to prevent command injection via crafted config
      const uiUrl = /^https?:\/\/[\w.:\/-]+$/.test(rawUrl) ? rawUrl : `http://127.0.0.1:${PORT}`;
      const { spawn } = require('child_process');
      const openers = [
        ['cmd',      ['/c', 'start', '', uiUrl]],
        ['open',     [uiUrl]],
        ['xdg-open', [uiUrl]],
        ['wslview',  [uiUrl]],
      ];
      for (const [bin, args] of openers) {
        try {
          const proc = spawn(bin, args, { detached: true, stdio: 'ignore', shell: bin === 'cmd' });
          proc.on('error', () => {});
          proc.unref();
          ledgerWrite('orchestrator', 'orchestrator.ui.opened', { url: uiUrl });
          return;
        } catch (_) {}
      }
      console.log(`[nexus] UI available at ${uiUrl}`);
    },
  });

  const ownResult = await ownSeq.run();
  if (!ownResult.ok) process.exit(1);

  // ────────────────────────────────────────────────────────────────────────────
  // Record own boot to ledger
  const VERSION = '2.0.0';
  ledgerWrite('orchestrator','orchestrator.booted',{ version:VERSION, port:PORT });
  startWatchdog();

  // ── Start pulse self-registration ─────────────────────────────────────────
  // Orchestrator registers itself as a system in its own registry so the UI
  // can see it as a first-class entry and track its own health dot.
  if (module._createPulse) {
    _orchPulse = module._createPulse({
      systemId:   'orchestrator',
      port:       PORT,
      orchPort:   PORT,  // self-loop: register with itself
      intervalMs: 10000,
      meta:       { version: VERSION },
      onBeat: ({ latency, seq }) => {
        // Update own registry entry with measured latency
        const existing = SYSTEM_REGISTRY.get('orchestrator') || {};
        SYSTEM_REGISTRY.set('orchestrator', { ...existing, latencyMs: latency, lastSeen: Date.now() });
      },
      log: (...a) => {},  // suppress self-loop noise
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // START-SYSTEMS SEQUENCE — delegated to cli/boot-systems.js
  // ════════════════════════════════════════════════════════════════════════════
  const { _bootSystems } = require('./cli/boot-systems');
});
}
