'use strict';
/**
 * cortex/boot.js — NEXUS Cortex Service v3.0.0
 * UUID: nexus-cortex-boot-v3-0000-2026-0628-001
 * Port: 3748
 *
 * The cortex is NEXUS's memory + intelligence layer. Every other system
 * reads from and writes to cortex. It is the single source of truth for:
 *   - JAA persistent memory (all tables: chat_log, gaps, artifacts, events…)
 *   - CFR field state (coherence, friction, entropy, regime)
 *   - RAID routing decisions
 *   - Intelligence (patterns, RCA, intuition, mastermind)
 *   - Gap management
 *   - Event log
 *   - Self-heal status
 *   - Snapshots
 *
 * Rebuilt from scratch — cortex/boot.js was absent from the uploaded zip.
 * All routes are inferred from every caller across the codebase.
 *
 * Routes (alphabetical):
 *   GET  /health                         — liveness
 *   GET  /cfr/health                     — CFR field state
 *   GET  /cfr/field                      — CFR field (orchestrator poll)
 *   GET  /api/health                     — alias /health
 *   POST /api/event                      — ingest event to event_log
 *   GET  /api/events                     — query event_log
 *   GET  /api/friction                   — current friction value
 *   GET  /api/gaps                       — query gaps table
 *   POST /api/gaps                       — insert gap
 *   GET  /api/failure-modes              — list failure mode entries
 *   GET  /api/intelligence/context       — assembled context snapshot
 *   GET  /api/intelligence/intuition     — fast intuition answer
 *   POST /api/intelligence/intuition     — same, POST body
 *   POST /api/intelligence/mastermind    — causal analysis
 *   POST /api/intelligence/mastermind/patterns — recurring causal-shape detection (RFR2 delta engine)
 *   POST /api/intelligence/adversarial   — inner-critic: scores & reconciles intuition vs mastermind
 *   GET  /api/intelligence/patterns      — pattern log
 *   GET  /api/intelligence/rca           — root cause analysis entries
 *   GET  /api/intelligence/status        — intelligence subsystem health
 *   GET  /api/jaa/:table                 — query any JAA table (safe read)
 *   POST /api/push                        — real Unified API write (cortex/push-recall.js)
 *   GET/POST /api/recall                  — real Unified API read, 2 of 5 lanes (lexical+recency)
 *   GET  /api/memory                     — query memory table
 *   POST /api/memory/insert              — insert to memory table
 *   POST /api/memory/forget              — delete from memory table
 *   GET  /api/memory/working             — working memory set
 *   POST /api/meta/observe               — meta observation ingest
 *   GET  /api/raid/decide                — RAID agent routing decision
 *   POST /api/raid/feedback              — RAID outcome feedback
 *   GET  /api/self-heal/status           — self-heal queue status
 *   GET  /api/snapshot                   — latest system snapshot
 *   GET  /api/snapshots                  — list snapshots
 *   POST /api/snapshot                   — write snapshot
 *   POST /api/table/insert               — generic table insert
 *   GET  /api/cli/exec                   — CLI command exec (internal)
 *   GET  /api/replay/inspect             — replay inspector
 *   GET  /api/settings.js               — settings table (deprecated path)
 *   GET  /api/n=:n                       — compat alias for event query
 */

const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

// §WIRED — real, distinct config, not inline constants. See
// cortex/config.js's own header. Matches the established pattern.
const config = require('./config.js');
const PORT    = config.PORT;
const OR_URL  = config.OR_URL;
const GD_URL  = config.GD_URL;
const OL_URL  = config.OL_URL;
const IN_PORT = config.IN_PORT;

// Old cortex path -> its home on the intelligence system (tombstone handler in
// the request switch below).
const MOVED_TO_INTELLIGENCE = {
  '/api/intelligence/status':              '/api/intelligence/status',
  '/api/intelligence/event':               '/api/intelligence/event',
  '/api/intelligence/context':             '/api/intelligence/context',
  '/api/intelligence/patterns':            '/api/intelligence/patterns',
  '/api/intelligence/failures':            '/api/intelligence/failures',
  '/api/intelligence/reuse':               '/api/intelligence/reuse',
  '/api/intelligence/intuition':           '/api/intelligence/intuition',
  '/api/intelligence/mastermind':          '/api/intelligence/mastermind',
  '/api/intelligence/mastermind/patterns': '/api/intelligence/mastermind/patterns',
  '/api/intelligence/adversarial':         '/api/intelligence/adversarial',
  '/api/intelligence/rca':                 '/api/intelligence/rca',
  '/api/cortex/query':                     '/api/intelligence/query',
  '/api/cortex/lattice':                   '/api/intelligence/lattice',
  '/api/liminal-space/status':             '/api/liminal-space/status',
  '/api/liminal-space/list':               '/api/liminal-space/list',
};

const ROOT    = path.join(__dirname, '..');
// §5.4 2026-08-14 — was a hardcoded '3.0.0', drifted from lib/version.js's
// real services.cortex ('3.5.0') — the exact "version drift is a bug, not
// an oversight" case that file's own header warns about, live in the one
// service most central to the whole system. Reading from the canonical
// source now; falls back to the last-known value only if the registry
// itself is ever unreachable at boot, never silently to a stale guess.
const VERSION = (() => { try { return require('../lib/version').services.cortex; } catch (_) { return '3.5.0'; } })();
const SYSTEM  = 'cortex';

// ── JAA memory store ──────────────────────────────────────────────────────────
const { jaaDB, uid } = require('./memory/jaa-db');
// §BUILD 2026-08-30 — Versionium/heartbeat continuation: cortex's own
// heartbeat is the same hand-rolled bare POST /api/heartbeat pattern
// already replaced in Clear Glass this session — no latency tracking,
// no miss detection, no online/offline transitions. Real, shared
// createPulse() replaces it below, not left running alongside it.
const { createPulse } = require('../orchestrator/lib/pulse.js');
// §GAP CLOSED 2026-07-19 — nexus-bus.js already existed at repo root, already
// documented as "the common event fabric," and other systems (guardian,
// orchestrator) were already POSTing to cortex's /api/event with it in mind
// — but this file never required it, so nothing arriving at /api/event ever
// reached an in-process listener. Fixed at the two points below.
const bus = require('../nexus/nexus-bus');

// -- Event relay to the intelligence system (2026-09-19) ----------------------
// liminal-space now runs inside intelligence/server.js on ITS OWN bus. The events
// it listens for that originate in or through cortex are forwarded there,
// fire-and-forget. This is cortex acting as an event PRODUCER: intelligence's
// state and routes do not depend on cortex being up (cortex down => these
// producers are down too, and liminal-space keeps serving what it persisted).
// Deliberately excluded: cortex.intelligence.pattern_crystallised and
// tc.drift.signal originate inside intelligence itself. Pinned against
// liminal-space's own SUBSCRIBED_EVENTS by tests/modules/test-intelligence-organs-move.js.
const RELAY_TO_INTELLIGENCE = new Set([
  'cortex.gap.found', 'escalation.friction.increased', 'guardian.job.complete',
  'forge.patch.proposed', 'cortex.gap.resolved',
]);
let _relayFail = { n: 0, lastWarn: 0 };
bus.on('*', (event) => {
  if (!event || !RELAY_TO_INTELLIGENCE.has(event.type)) return;
  const data = JSON.stringify({ type: event.type, payload: event.payload || {}, source: event.source, causedBy: event.causedBy });
  const rq = http.request({
    hostname: '127.0.0.1', port: IN_PORT, path: '/api/intelligence/bus', method: 'POST', timeout: 2000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  }, (r) => { r.resume(); });
  const fail = (why) => {
    _relayFail.n++;
    if (Date.now() - _relayFail.lastWarn > 60000) {
      _relayFail.lastWarn = Date.now();
      console.warn(`[cortex] relay to intelligence:${IN_PORT} failing (${_relayFail.n} dropped so far): ${why}`);
    }
  };
  rq.on('error', (e) => fail(e.code || e.message));
  rq.on('timeout', () => { rq.destroy(); fail('timeout'); });
  rq.write(data); rq.end();
});


// ── Cortex SSE — real broadcast channel, matches guardian's own
// cockpitClients/cockpitBroadcast pattern (guardian/server.js) exactly.
const _cortexSSEClients = new Set();
function _cortexSSEBroadcast(data) {
  if (!_cortexSSEClients.size) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const r of _cortexSSEClients) { try { r.write(msg); } catch (_) { _cortexSSEClients.delete(r); } }
}


// §GAP CLOSED 2026-07-06: the spec's "Unified API" (cortex.push/recall,
// intent IR, 5-lane MQL) was 100% documentation, 0% code — confirmed by
// reading this file's actual /api/memory/insert handler, which was a raw
// {table,row} passthrough with no validation. cortex/push-recall.js is
// the real implementation (2 of 5 lanes honestly — lexical + recency;
// causal/failure/BEP need structures that don't exist yet, see that
// file's header), tested standalone before being wired here. Adapter
// below maps its {insert,tail,all} expectation onto jaaDB's real
// {insert(table,row), tail(table,n)} signature, targeting one fixed
// table ('memory_unified') so push/recall don't scatter across whatever
// table name a caller feels like typing — the exact problem raw
// {table,row} passthrough caused everywhere else.
const { CortexPushRecall } = require('./push-recall.js');
const _pushRecall = new CortexPushRecall({
  store: {
    insert: (row) => jaaDB.insert('memory_unified', row),
    all:    () => jaaDB.tail('memory_unified', 10_000),
  },
});

// §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
// phasemap.spec) — versionium is now its own sovereign system
// (versionium/server.js, port 3754), not embedded in this process. The
// require('./versionium') that used to live here, and the boot-time
// init()/setDeps() calls below it, are gone — the real logic moved
// wholesale to versionium/lib/engine.js. cortex/versionium/ itself is
// kept, unexecuted, as a real historical reference (§0.3 never delete,
// archive) rather than silently vanishing; nothing in this file
// requires it anymore.

// Ensure data dirs exist
// §D3 2026-09-19 — 'data/snapshots' removed from this list. James:
// "cortex is not versionium... there should not be any .nex files
// generating in cortex." The snapshot engine moved to versionium/lib/
// snapshot.js and writes to versionium/data/snapshots; this line was
// creating a root-level data/snapshots that the engine never wrote to
// (it used cortex/data/snapshots, now relocated) — an empty directory
// whose only effect was to keep implying cortex owns snapshots. The 17
// real .nex files that WERE under cortex/data/snapshots were moved to
// versionium and re-indexed (versionium/lib/migrate-cortex-snapshots.js);
// nothing was deleted (§0.3).
['data/cortex/memory', 'data/cortex/ledger'].forEach(d => {
  fs.mkdirSync(path.join(ROOT, d), { recursive: true });
});

// §PER-SYSTEM LEDGER 2026-09-19 — James: "the ledgers in cortex need to be
// per system." lib/component-ledger.js now writes each row to the owning
// system's own store (lib/ledger-store.js), but rows written BEFORE that
// change are still in cortex's shared component_ledger table. New writes
// landing in the right place while the history stays in the wrong one is a
// half-migration, and the read surface would then report an empty past.
//
// Runs here, in cortex, for two real reasons rather than convenience:
// cortex OWNS the source table (§5.9 — the system holding the data runs the
// migration off it), and cortex is autopilot's phase-1 kernel, so this
// completes before any phase-2 system writes its first ledger row.
//
// §IDEMPOTENT, §NON-DESTRUCTIVE — copies only rows the target store doesn't
// already have, keyed on uuid; cortex's own rows are left in place (§0.3).
// purgeSource is deliberately NOT passed: five readers (cli/sentinel.js,
// lib/introspect.js, intelligence/index.js, cli/compact.js,
// cli/purge-pollution.js) still read cortex's table directly, and purging
// before they move would make them report "no rows" rather than "moved"
// (§1.2 — a failure must never look like a success).
try {
  const { migrateLedgerPerSystem } = require('../lib/migrate-ledger-per-system.js');
  const r = migrateLedgerPerSystem();
  if (r && r.copied) {
    const spread = Object.entries(r.bySystem).map(([s, n]) => `${s}:${n}`).join(' ');
    console.log(`[cortex] ledger migrated to per-system stores — ${r.copied} row(s) [${spread}]`);
  }
  if (r && r.errors && r.errors.length) {
    console.warn(`[cortex] §1.2 ledger migration — ${r.errors.length} row(s) failed to copy; cortex's copy is untouched, safe to re-run`);
  }
  if (r && r.ok === false) {
    console.warn(`[cortex] §1.2 ledger migration did not run: ${r.reason}`);
  }
} catch (e) {
  console.warn(`[cortex] per-system ledger migration failed (non-fatal): ${e.message}`);
}

// ── CFR field state — lightweight in-memory implementation ───────────────────
// Full CFR (lib/cfr/) is wired in orchestrator. Cortex keeps a HTTP-readable
// copy so copilot-context Layer 4 and the cfr-influence poller can read it.
let _field = {
  coherence:  0.6,
  friction:   0.2,
  resonance:  0.3,
  entropy:    0.2,
  regime:     'stable',
  updatedAt:  Date.now(),
};

// Receive CFR updates from orchestrator (POST /cfr/field)
function _updateField(patch) {
  _field = { ..._field, ...patch, updatedAt: Date.now() };
  // Compute regime
  if (_field.entropy > 0.65 || _field.friction > 0.6) _field.regime = 'chaotic';
  else if (_field.coherence > 0.75 && _field.friction < 0.3) _field.regime = 'ordered';
  else _field.regime = 'stable';
}

// ── RAID state ────────────────────────────────────────────────────────────────
// Lightweight routing table — full RAID is in cortex/core/raid (when present)
// §EXPANDED 2026-09-12 — James: "expand raid to fit all agents." Was
// {ollama, guardian, claude, chatgpt} — a lightweight legacy table that
// pre-dated agent-mesh's real 7-agent AGENT_REGISTRY (clear-glass/src/
// mesh/agent-mesh.js: claude, chatgpt, gemini, perplexity, mistral,
// deepseek, grok — confirmed there this session). guardian and ollama
// are real too (guardian's own dispatch path, ollama-bridge's local
// model) so both are kept alongside the full agent set, not replaced
// by it. New agents start at a neutral 70 (matches this file's own
// existing 70-100 "healthy" range used elsewhere) rather than 0 or 100,
// since nothing has confirmed them healthy or unhealthy yet.
const _raidHealth = {
  ollama: 100, guardian: 100, claude: 80, chatgpt: 75,
  gemini: 70, perplexity: 70, mistral: 70, deepseek: 70, grok: 70,
};
const _raidTransport = {};   // 'agent@transport' -> {calls, ok, failed, needsUser, lastFallbackReason}
const _raidDecisions = [];

function _raidDecide(intent, cfrCtx = {}) {
  const sigma = cfrCtx.sigmaFloor || 0;
  const regime = cfrCtx.regime || _field.regime;

  // LAW I: Ollama first when healthy and regime is not chaotic
  const candidates = Object.entries(_raidHealth)
    .filter(([, h]) => h >= 50)
    .sort(([, a], [, b]) => b - a);

  // In chaotic regime, prefer faster providers — ollama/guardian (local)
  // first as before; the remaining real agents appended after them
  // (not reasoned about here as faster/slower relative to each other,
  // just no longer excluded from chaotic-regime routing entirely).
  const agentOrder = regime === 'chaotic'
    ? ['ollama', 'guardian', 'claude', 'chatgpt', 'gemini', 'perplexity', 'mistral', 'deepseek', 'grok']
    : candidates.map(([k]) => k);

  const agent  = agentOrder[0] || 'ollama';
  const reason = `health=${_raidHealth[agent]} regime=${regime} sigma=${sigma.toFixed(3)}`;

  const decision = { agent, reason, intent: String(intent).slice(0, 100),
    sigma, regime, ts: Date.now(), id: uid() };
  _raidDecisions.unshift(decision);
  if (_raidDecisions.length > 200) _raidDecisions.length = 200;

  return decision;
}

// ── Working memory ────────────────────────────────────────────────────────────
// (working memory is now backed by the real `working_memory` JAA table —
// see cortex/memory/decay.js and the /api/memory/working route below)

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => d += c);
    req.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const method = req.method;
  const p      = url.pathname;

  if (method === 'OPTIONS') { json(res, 200, {}); return; }

  // ── Health ──────────────────────────────────────────────────────────────
  // ── Contract — orchestrator polls this to verify cortex is spec-compliant ──
  if (p === '/contract' && method === 'GET') {
    try {
      const c = require('fs').readFileSync(require('path').join(__dirname, 'interaction-contract.json'), 'utf8');
      // §BUGFIX 2026-08-23 — James, live, from a real screenshot: CORS
      // blocks in co-pilot's own devtools console. Root cause found by
      // reading the actual handler, not guessed: this raw res.writeHead
      // bypassed the file's own real, CORS-enabled json() helper (used
      // correctly everywhere else in this file) — a real, silent gap in
      // this one route only.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(c);
    } catch(e) {
      json(res, 500, { ok: false, error: 'interaction-contract.json missing' });
    }
    return;
  }

    if (p === '/health' || p === '/api/health') {
    json(res, 200, { ok: true, system: SYSTEM, version: VERSION, port: PORT,
      field: _field, uptime: process.uptime(), ts: Date.now() });
    return;
  }

  // ── CFR field ───────────────────────────────────────────────────────────

  // ── Nerve snapshot — §5.7 sovereign consumer pattern ─────────────────────────
  // Clear Glass (the browser) fetches this URL as any browser consumer fetches
  // /cfr/field — no direct import between sibling systems. Versionium owns
  // snapshot/commit/replay; this route exposes Nerve's attention-layer read
  // surface over HTTP so the expression layer (alk-gl.js) can pull it without
  // any module coupling between Clear Glass and lib/nerve/.
  if (p === '/nerve/snapshot' && method === 'GET') {
    try {
      const nerve = require('../lib/nerve/index.js');
      json(res, 200, { ok: true, ...nerve.getSnapshot() });
    } catch (e) {
      json(res, 500, { ok: false, error: 'nerve read failed: ' + e.message });
    }
    return;
  }

  // -- CFR field relay: REMOVED (2026-09-19) ------------------------------------
  // Cortex only ever mirrored the orchestrator's field (polling it, and accepting a
  // POST nothing ever sent) and re-served it to ~8 consumers, so cortex being down took
  // the field away from guardian, versionium, copilot, nerve and cfr-influence, and
  // cortex kept serving a stale value if the orchestrator died. Consumers now read the
  // authority directly. Cortex keeps a PRIVATE cache (_field) only for its own RAID
  // decisions; it no longer serves it here.
  if (p === '/cfr/health' || p === '/cfr/field') {
    const orchPort = parseInt(new URL(OR_URL).port || '9000', 10);
    json(res, 410, { ok: false, error: `the CFR field is served by the orchestrator (its authority) -- call http://127.0.0.1:${orchPort}/cfr/field instead`, movedTo: 'orchestrator', movedPort: orchPort, newPath: '/cfr/field' });
    return;
  }

  // ── Hooks/wires summary — relational pressure feed ────────────────────────
  // §pressure-system fix 2026-06-30 — this is the route
  // ui/tv-shell/spotlight/spotlight.js's wireRelationalTension() has been
  // calling since it was written, with no real endpoint behind it
  // (logged honestly as dead in the code at the time). hooks/index.js's
  // data was always real — 80 hooks across 10 systems — it just was never
  // exposed over HTTP. This is the missing piece, not new data.
  if (p === '/hooks/summary' && method === 'GET') {
    try {
      const hooks = require('../hooks/index.js');
      json(res, 200, {
        ok: true,
        summary: hooks.summary(),
        wires: hooks.allHooks()
          .filter(h => h.type === 'event-bus' || h.type === 'stream')
          .map(h => ({ id: h.id, from: h.from, to: h.to, type: h.type, seam: h.seam, status: h.status })),
      });
    } catch (e) {
      json(res, 500, { ok: false, error: `hooks/index.js failed to load: ${e.message}` });
    }
    return;
  }

  // ── Events ──────────────────────────────────────────────────────────────
  if (p === '/api/event' && method === 'POST') {
    const body = await readBody(req);
    const row = { id: uid(), type: body.type || 'unknown',
      payload: JSON.stringify(body.payload || {}),
      source: body.source || 'unknown', ts: body.ts || Date.now(),
      causedBy: body.causedBy || null }; // §sensation 2026-06-29 — was missing
    jaaDB.insert('event_log', row);
    // §GAP CLOSED 2026-07-19 — this endpoint is how guardian/orchestrator
    // already push events into cortex, but it only ever wrote to
    // event_log. Nothing in-process (liminal-space, or anything else
    // subscribed to `bus`) ever saw these live. Emit is additive — the
    // event_log write and JSON response above are unchanged.
    try { bus.emit(row.type, body.payload || {}, { source: row.source, causedBy: row.causedBy }); }
    catch (e) { console.warn(`[cortex] bus.emit failed for ${row.type}: ${e.message}`); }
    // §0.39.282 — and to /sse subscribers (cli/nexus-repl.js, cortex-v2.js): the channel broadcast only wake events,
    // so an event posted here was logged but never seen live (tests/modules/cortex-sse-broadcast.test.js T-002).
    _cortexSSEBroadcast({ id: row.id, type: row.type, payload: body.payload || {}, source: row.source, causedBy: row.causedBy, ts: row.ts });
    json(res, 200, { ok: true, id: row.id });
    return;
  }

  // ── §RAID-FIX 2026-09-16 — cross-process self-registration ──────────────
  // James: "raid also needs to stop failing, i dont think its using the
  // agent mesh, router, ncp, or the job dispatcher." Real root cause,
  // traced: lib/self-register.js's registerSelf() — the one and only
  // established convention for a system announcing its capabilities to
  // RAID — works by calling lib/component-registry.js's register()
  // DIRECTLY, in-process. That's exactly right for intelligence/index.js
  // (the only real caller today — required straight into this same cortex
  // process by boot.js). It CANNOT work for guardian, copilot (NCP),
  // clear-glass (agent-mesh + its driver/router), or orchestrator — each
  // is its own OS process with `server.listen()` of its own, so a bare
  // require('lib/component-registry').register(...) from any of them
  // creates a throwaway, never-initialized registry instance that this
  // cortex process — the one RAID's router.js actually resolves against
  // (cortex/boot.js:1713-1715) — never sees. Every RAID envelope aimed at
  // those four systems has always resolved to NO_ROUTE, silently, because
  // they were never in the registry to begin with — not a routing bug,
  // a missing capability. This is the real cross-process path: any
  // external system's own boot POSTs its capability list here once; this
  // process (the one that actually owns the registry) registers them
  // in-process from here, same register()/registerBatch() intelligence
  // already uses (lib/self-register-remote.js is the client half — same
  // shape-building logic as registerSelf, factored so neither copy drifts).
  if (p === '/api/components/register-batch' && method === 'POST') {
    const body = await readBody(req);
    const items = Array.isArray(body.components) ? body.components : [];
    if (!items.length) { json(res, 400, { ok: false, error: 'components must be a non-empty array' }); return; }
    try {
      const componentRegistry = require('../lib/component-registry');
      const results = componentRegistry.registerBatch(items);
      const registered = results.filter(r => r.ok).length;
      json(res, 200, { ok: true, registered, failed: results.length - registered, results });
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
    }
    return;
  }


  if (p === '/api/events') {
    const n      = parseInt(url.searchParams.get('n') || url.searchParams.get('limit') || '30');
    const source = url.searchParams.get('source');
    const rows   = jaaDB.tail('event_log', n);
    const result = source ? rows.filter(r => r.source === source) : rows;
    json(res, 200, { ok: true, events: result, total: result.length });
    return;
  }

  // §MCO10 2026-09-13 — real query surface for compartment_dom_ledger,
  // same n/filter shape as /api/events above so a caller already familiar
  // with that convention needs nothing new. Filters by compartmentUuid
  // (the ledger's real key) or queueId when given.
  if (p === '/api/compartment-dom-ledger') {
    const n               = parseInt(url.searchParams.get('n') || '50');
    const compartmentUuid = url.searchParams.get('compartmentUuid');
    const queueId         = url.searchParams.get('queueId');
    let rows = jaaDB.tail('compartment_dom_ledger', n * 4); // over-fetch before filtering, same pattern as /api/events' source filter
    if (compartmentUuid) rows = rows.filter(r => r.compartmentUuid === compartmentUuid);
    if (queueId)         rows = rows.filter(r => r.queueId === queueId);
    rows = rows.slice(-n);
    json(res, 200, { ok: true, entries: rows, total: rows.length });
    return;
  }

  // §NEW 2026-09-06 — James: "SESSIONS (we can use the chat logs.)"
  // BrainOS-v2's original SESSIONS tab had no real nexus equivalent —
  // removed. Real chat_log data exists (lib/chat-logger.js writes it,
  // confirmed real rows in the live store) but had no query endpoint
  // anywhere — same real gap class /api/events already closed for
  // event_log, applied here for chat_log.
  if (p === '/api/chat-log') {
    const n = parseInt(url.searchParams.get('n') || url.searchParams.get('limit') || '50');
    const rows = jaaDB.tail('chat_log', n);
    json(res, 200, { ok: true, entries: rows, total: rows.length });
    return;
  }

  // §NEW 2026-09-06 — James: PIPELINE tab, real mapping to RAID's real
  // dependsOn/onFail contract queue (cortex/core/raid/contract-
  // intake.js) — real data exists (raid_contract_queue table, confirmed
  // real rows in the live store) but had no GET/list endpoint anywhere,
  // same real gap class as chat-log above.
  if (p === '/api/raid/queue') {
    const n = parseInt(url.searchParams.get('n') || url.searchParams.get('limit') || '50');
    const rows = jaaDB.tail('raid_contract_queue', n);
    json(res, 200, { ok: true, contracts: rows, total: rows.length });
    return;
  }

  // ── Friction ─────────────────────────────────────────────────────────────
  if (p === '/api/friction') {
    json(res, 200, { ok: true, friction: _field.friction, regime: _field.regime });
    return;
  }

  // ── Consumer graph (§8.5) ────────────────────────────────────────────────
  // The bidirectional map: who produces what, who consumes it, and what is
  // emitted into the void. Derived from observed behaviour, never declared.
  if (p === '/api/consumers') {
    try {
      const cr = require('../lib/consumer-registry');
      const view = url.searchParams.get('view');
      if (view === 'unconsumed') return json(res, 200, cr.unconsumed());
      if (view === 'producers')  return json(res, 200, { producers: cr.producers() });
      return json(res, 200, cr.graph());
    } catch (e) {
      return json(res, 503, { ok: false, error: `consumer-registry unavailable: ${e.message}` });
    }
  }

  // ── Gaps ─────────────────────────────────────────────────────────────────
  if (p === '/api/gaps') {
    if (method === 'POST') {
      const body = await readBody(req);
      const row  = { id: uid(), ...body, status: body.status || 'open', ts: Date.now() };
      jaaDB.insert('gaps', row);
      try { bus.emit('cortex.gap.found', { gap: row }, { source: row.source || 'cortex' }); }
      catch (e) { console.warn(`[cortex] bus.emit(cortex.gap.found) failed: ${e.message}`); }
      json(res, 200, { ok: true, id: row.id });
      return;
    }
    const status   = url.searchParams.get('status') || 'open';
    const limit    = parseInt(url.searchParams.get('limit') || url.searchParams.get('n') || '20');
    const severity = url.searchParams.get('severity');
    let where = {};
    if (status !== 'all') where.status = status;
    if (severity) where.severity = severity;
    const rows = jaaDB.query('gaps', where, { orderBy: 'ts', order: 'DESC', limit });
    json(res, 200, { ok: true, gaps: rows, total: rows.length });
    return;
  }

  // ── Failure modes ────────────────────────────────────────────────────────
  if (p === '/api/failure-modes') {
    const rows = jaaDB.tail('failure_modes', 20);
    json(res, 200, { ok: true, modes: rows });
    return;
  }

  // -- Intelligence routes: MOVED (hard cut) -------------------------------
  // 2026-09-19 -- James: "full move. each system needs to be sovereign. if
  // cortex going down breaks something, it needs to be moved." Every
  // intelligence-domain route this file used to host is now served by the
  // sovereign intelligence system (intelligence/server.js). Same VS1
  // precedent as /api/versionium/*: an honest 410 naming the new home, not a
  // silent 404 and not a forwarder that would keep cortex in the call path.
  // Map: docs/2026-09-19-cortex-to-intelligence-and-versionium-consolidation-
  // liminal-space moved too (organ + routes): see docs spec B7 (resolved).
  if (MOVED_TO_INTELLIGENCE[p]) {
    const newPath = MOVED_TO_INTELLIGENCE[p];
    json(res, 410, { ok: false, error: `moved to the sovereign intelligence system -- call http://127.0.0.1:${IN_PORT}${newPath} instead`, movedTo: 'intelligence', movedPort: IN_PORT, newPath, ...(p === '/api/intelligence/patterns' ? { note: 'crystal-shaped consumers (precursor/outcome/count) use /api/intelligence/crystals' } : {}) });
    return;
  }

  // §WIRED 2026-08-09 — the idea review surface. Idearium is the landing zone;
  // lib/idea-provenance.js is the discipline that keeps a machine proposal
  // distinguishable from one the user had.
  if (p === '/ideas' && method === 'GET') {
    try {
      const html = require('fs').readFileSync(require('path').join(__dirname, 'ui/ideas.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (p === '/api/ideas' && method === 'GET') {
    try {
      const P = require('../lib/idea-provenance.js');
      const f = {};
      for (const k of ['origin', 'status', 'about', 'system']) {
        const v = url.searchParams.get(k); if (v) f[k] = v;
      }
      const rows = (Object.keys(f).length ? P.list(f) : P.pending());
      json(res, 200, { ok: true, ideas: rows.map(r => ({
        slug: r.slug, text: r.text, tags: r.tags,
        origin: P.originOf(r), status: P.statusOf(r),
        evidenceFull: r.evidence || [],
        reviewedBy: r.reviewedBy, reviewNote: r.reviewNote,
      })) });
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  if (p === '/api/ideas/stats' && method === 'GET') {
    try { json(res, 200, require('../lib/idea-provenance.js').stats()); }
    catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // The ONLY path that can accept. idea-provenance refuses any accept whose
  // reviewerKind is not "user" — enforced there, not here, so a second caller
  // cannot route around it.
  if (p === '/api/ideas/review' && method === 'POST') {
    try {
      const body = await readBody(req);
      const P = require('../lib/idea-provenance.js');
      json(res, 200, P.review(body.slug, body.decision, {
        reviewer: body.reviewer, reviewerKind: body.reviewerKind, note: body.note,
      }));
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // §WIRED 2026-08-08 — lib/movement.js and lib/manifest.js had no HTTP
  // surface, so only the CLI could reach them. §1.1: a module the rest of the
  // system cannot call is not integrated, it is merely present. These are the
  // same snapshots `nexus movement` renders — one data layer, three consumers
  // (CLI, copilot tool, tablet).
  //
  // Read-only. GET because they compute nothing and persist nothing.
  if (p === '/api/movement' && method === 'GET') {
    try {
      const system = url.searchParams.get('system');
      const M = require('../lib/movement.js');
      if (!system) { json(res, 200, { ok: true, systems: M.systems() }); return; }
      const win = parseInt(url.searchParams.get('windowMs') || '', 10) || 24 * 3600e3;
      json(res, 200, M.collect(system, { windowMs: win }));
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // Manifest drift for one system. `?baseline=1` STORES the current manifest
  // instead of comparing — explicit on purpose, because a baseline that
  // updates itself can never report drift.
  if (p === '/api/manifest' && method === 'GET') {
    try {
      const system = url.searchParams.get('system');
      if (!system) { json(res, 400, { ok: false, error: 'system required' }); return; }
      const M = require('../lib/manifest.js');
      const fsx = require('fs'), pth = require('path');
      const dir = pth.join(__dirname, '..', 'data', 'manifests');
      const store = pth.join(dir, `${system}.json`);

      if (url.searchParams.get('baseline') === '1') {
        const m = M.capture(system);
        if (!m.ok) { json(res, 404, m); return; }
        fsx.mkdirSync(dir, { recursive: true });
        fsx.writeFileSync(store, JSON.stringify(m));
        json(res, 200, { ok: true, stored: true, system, fileCount: m.fileCount, complete: m.complete });
        return;
      }
      let prev = null;
      if (fsx.existsSync(store)) { try { prev = JSON.parse(fsx.readFileSync(store, 'utf8')); } catch (_) {} }
      json(res, 200, M.drift(system, prev, { expected: url.searchParams.get('expected') === '1' }));
    } catch (e) { json(res, 500, { ok: false, error: e.message }); }
    return;
  }

  // ── JAA table direct reads ────────────────────────────────────────────────
  if (p.startsWith('/api/jaa/')) {
    const table = p.slice('/api/jaa/'.length);
    if (!table) { json(res, 400, { ok: false, error: 'table required' }); return; }
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const rows  = jaaDB.tail(table, limit);
    json(res, 200, { ok: true, table, rows, count: rows.length });
    return;
  }

  // ── Memory ───────────────────────────────────────────────────────────────
  // §FIX 2026-09-07 — VSB1, James: "do it, the axioms." Real, precise
  // root cause of the versionium split-brain (RF4) traced to exactly
  // this handler: it always answered from cortex's OWN local jaaDB
  // regardless of which table was requested. For event_log/chat_log/
  // etc. (genuinely cortex's own tables) that's correct. For
  // versionium_commits/branches/calendar — genuinely a DIFFERENT
  // system's sovereign data, per §5.9 — this handler was silently
  // reading a dead, permanently-empty shared copy while versionium's
  // own real commits landed in its own real, separate sovereign store
  // (versionium/lib/store.js, confirmed real and already working).
  // Fixed the actual bug, not the symptom: sovereign tables now proxy
  // to their real owner's own store, loaded fresh each call (never
  // cached — a stale snapshot of another system's live data would be
  // its own small split-brain) via a direct require() of its real
  // store module. JaaStore is file-backed (confirmed: every real write
  // this session persisted to disk, not just an in-memory Map), so
  // this genuinely reads the other system's real, current, disk-
  // persisted state, not a guess.
  // 2026-09-19: cortex no longer reads another system's store at all. The only in-repo reader of these
  // tables through here was the cortex CLI (now on versionium's own API). A bare removal would let this
  // route fall through to cortex's own dead, permanently-empty copy -- the exact VSB1 split-brain -- so
  // sovereign tables answer with an explicit 410 naming the owner instead.
  const SOVEREIGN_TABLES = new Set(['versionium_commits', 'versionium_branches', 'versionium_calendar']);

  if (p === '/api/memory') {
    const table     = url.searchParams.get('table') || 'chat_log';
    const n         = parseInt(url.searchParams.get('n') || '10');
    const sessionId = url.searchParams.get('sessionId');
    if (SOVEREIGN_TABLES.has(table)) {
      json(res, 410, { ok: false, error: `${table} belongs to the sovereign versionium system -- call http://127.0.0.1:3754/api/versionium/history instead`, movedTo: 'versionium', movedPort: 3754, newPath: '/api/versionium/history' });
      return;
    }
    let rows = jaaDB.tail(table, n * 2);
    if (sessionId) rows = rows.filter(r => r.sessionId === sessionId || r.session_id === sessionId);
    json(res, 200, { ok: true, table, rows: rows.slice(0, n), count: rows.length });
    return;
  }

  // §GAP CLOSED 2026-09-12 — /api/tags was declared in this file's own
  // registry-components.js (tags.list / tags.add) and referenced in
  // orchestrator.js's route comment, but had no real handler anywhere in
  // this file — confirmed via repo-wide grep before writing this, not
  // assumed missing. Shape matches orchestrator.js's own documented
  // contract exactly: POST { entityId, entityType, system, tags[] }.
  if (p === '/api/tags' && method === 'GET') {
    try {
      const entityId = url.searchParams.get('entityId');
      const rows = entityId
        ? jaaDB.query('tags', { entityId })
        : jaaDB.query('tags', {});
      json(res, 200, { ok: true, count: rows.length, tags: rows });
    } catch (e) {
      json(res, 500, { ok: false, error: `tags list failed: ${e.message}` });
    }
    return;
  }

  if (p === '/api/tags' && method === 'POST') {
    const body = await readBody(req);
    const { entityId, entityType, system, tags } = body || {};
    if (!entityId) { json(res, 400, { ok: false, error: 'entityId is required' }); return; }
    if (!Array.isArray(tags) || !tags.length) { json(res, 400, { ok: false, error: 'tags[] is required and must be non-empty' }); return; }
    try {
      const row = jaaDB.insert('tags', { id: uid(), entityId, entityType: entityType || null, system: system || null, tags, ts: Date.now() });
      json(res, 200, { ok: true, tag: row });
    } catch (e) {
      json(res, 500, { ok: false, error: `tag add failed: ${e.message}` });
    }
    return;
  }

  if (p === '/api/push') {
    const body = await readBody(req);
    const { content, tags, tier } = body;
    try {
      const result = _pushRecall.push(content, tags, tier);
      json(res, 200, { ok: true, ...result });
    } catch (e) {
      // §ADDED 2026-07-06 — a rejected push used to just return a 400 and
      // vanish. Real failure now lands in data/cortex/failures.jsonl,
      // queryable via lib/ledger-writer.readLatest('cortex','failures',n).
      try { require('../lib/ledger-writer').writeFailure('cortex', e, { module: 'push-recall', source: 'api.push' }); } catch(_) {}
      json(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (p === '/api/recall') {
    let intent = url.searchParams.get('intent');
    let query  = url.searchParams.get('query');
    let tier   = url.searchParams.get('tier') || null;
    // §FIXED 2026-07-13 — found while building chunk_2 of
    // docs/nexus-copilot-recall.spec, not assumed: only `intent` was ever
    // read from a POST body here. `query` and `tier` were declared as
    // `const` from the URL search params and never revisited, so every
    // real POST caller (lib/agent-tools/tools/query/query-recall.js included,
    // since 2026-07-10) has been silently recalling with query:null —
    // lexical scoring always contributed 0, only recency ever mattered.
    // Verified directly: a real POST with {intent,query,tier} in the body
    // produced a response with query genuinely null server-side. Confirmed
    // this predates the chunk_1 fix two sessions ago — that fix corrected
    // which lanes *could* be real; this bug meant none of them were ever
    // actually being asked a real question.
    if (method === 'POST') {
      const body = await readBody(req);
      if (!intent) intent = body.intent;
      if (!query)  query  = body.query;
      if (!tier)   tier   = body.tier || null;
    }
    try {
      const results = _pushRecall.recall(intent, { query }, tier);
      json(res, 200, { ok: true, results, count: results.length });
    } catch (e) { json(res, 400, { ok: false, error: e.message }); }
    return;
  }

  if (p === '/api/memory/insert') {
    const body = await readBody(req);
    const { table, row } = body;
    if (!table || !row) { json(res, 400, { ok: false, error: 'table + row required' }); return; }
    const inserted = jaaDB.insert(table, { id: uid(), ...row, ts: row.ts || Date.now() });
    json(res, 200, { ok: true, id: inserted.id });
    return;
  }

  if (p === '/api/memory/forget') {
    const body = await readBody(req);
    const { table, where } = body;
    if (!table || !where) { json(res, 400, { ok: false, error: 'table + where required' }); return; }
    const n = jaaDB.delete(table, where);
    json(res, 200, { ok: true, deleted: n });
    return;
  }

  // §BUILT 2026-07-12 — "not flat or stubs." This used to be
  // `_workingMemory = {...working, ...body}` — a single mutable object,
  // no tiering, no expiry, gone the moment the process restarted anyway
  // (which happened to match wipeOnRestart:true for the working tier by
  // accident, not by design — a real restart lost it whether or not that
  // was ever intended). Now backed by the real `working_memory` JAA table,
  // tier-tagged, timestamped, and actually aged out by cortex/memory/decay.js
  // on its real schedule (2h evictAfterMs) instead of only ever clearing
  // on a restart nobody scheduled.
  // §BUGS FOUND AND FIXED 2026-07-19 — checked every real caller before
  // touching this, not just the boot.js side:
  //   1. guardian/userscript-claude.js's _memFetch reads `d.rows || d.memory`
  //      — neither field ever existed in this response (only `working` did),
  //      so the userscript's working-memory panel has always silently
  //      rendered empty. Fixed here, not in the userscript: this is the side
  //      I can actually verify: added `rows` and `memory` as aliases for the
  //      exact same array, existing `working` field untouched — nothing that
  //      already reads `working` changes behavior.
  //   2. No system-scoping at all — every row keyed by a bare `key` with no
  //      owner, so two systems writing the same key (e.g. both use "focus"
  //      or "context") would silently overwrite each other via the upsert.
  //      Added an optional `system` field/query param, folded into the
  //      upsert key as `${system}:${key}` — defaults to 'global' when not
  //      provided, so any existing caller that never passed one keeps
  //      exactly its old behavior (same default namespace it was already
  //      implicitly sharing), while a caller that opts in gets real
  //      isolation from every other system.
  if (p === '/api/memory/working') {
    if (method === 'POST') {
      const body = await readBody(req);
      const system = body.system || 'global';
      const key = body.key || 'default';
      const scopedKey = `${system}:${key}`;
      const inserted = jaaDB.upsert('working_memory', {
        key: scopedKey, system, localKey: key, value: body.value ?? body, tier: 'working', ts: Date.now(),
      }, 'key');
      json(res, 200, { ok: true, id: inserted.id, key: inserted.localKey, system: inserted.system });
    } else {
      const systemFilter = url.searchParams.get('system');
      let rows = jaaDB.query('working_memory', {}).filter(r => !r._evicted);
      if (systemFilter) rows = rows.filter(r => r.system === systemFilter);
      json(res, 200, { ok: true, working: rows, rows, memory: rows });
    }
    return;
  }

  // ── Meta observe ──────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  //  CORTEX SSE — James, 2026-08-22: "how about that?" Real, previously-
  // missing broadcast channel. Confirmed by reading this whole file: no
  // '/sse' handler existed here at all, despite cli/nexus-repl.js and
  // cortex/cortex-v2.js both connecting to it — they've been reaching
  // nothing this whole time. Matches guardian's own already-working
  // cockpitClients/cockpitBroadcast pattern exactly (guardian/server.js),
  // not invented fresh.
  // ══════════════════════════════════════════════════════════════════════
  if (p === '/sse') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
    _cortexSSEClients.add(res);
    req.on('close', () => _cortexSSEClients.delete(res));
    return;
  }

  if (p === '/api/meta/observe') {
    const body = await readBody(req);
    jaaDB.insert('meta_observations', { id: uid(), ...body, ts: Date.now() });

    // §WIRED 2026-08-22 — James: "i want more event types for the
    // userscripts... chat_input for my messages, then chat_response for
    // you." Real, canonical types from lib/event-types.js, emitted
    // through the SAME real event_log + bus every other real system
    // event already uses — not a new, siloed table.
    const eventTypes = require('../lib/event-types.js');
    if (typeof body.text === 'string' && body.text.trim()) {
      const blockType = body.role === 'user' ? 'user' : 'assistant';
      const blockId = crypto.createHash('sha1')
        .update(`${body.sessionId || ''}:${body.role || ''}:${body.text.slice(0, 500)}`)
        .digest('hex').slice(0, 16);
      const chatType = body.role === 'user' ? eventTypes.CHAT.CHAT_INPUT : eventTypes.CHAT.CHAT_RESPONSE;
      const chatRow = {
        type: chatType, blockId, blockType,
        source: body.source || null, sessionId: body.sessionId || null,
        chatUrl: body.chatUrl || null, account: body.account || null,
        textPreview: body.text.slice(0, 200), ts: Date.now(),
      };
      jaaDB.insert('event_log', chatRow);
      try { bus.emit(chatType, chatRow, { source: body.source || 'unknown' }); } catch (_) {}
    }

    // §WIRED 2026-08-22 — James: "anything that has 'hey nexus' at the
    // beginning gets injected into co-pilot's cli.js, with the agent and
    // chatUrl, and account, so it can open a pipeline to talk." Real
    // architecture correction from an assumption I'd made: EVERY message,
    // both roles, already reaches this exact endpoint via the userscript's
    // already-working GM_xmlhttpRequest call (confirmed by reading
    // _nexusLogMessage directly) — no separate browser-to-copilot HTTP
    // call was ever needed. This is the real detection point.
    const wakeMatch = typeof body.text === 'string' && /^\s*(?:hey|hi|ok|okay)[,\s]+nexus[,:\s]+([\s\S]+)$/i.exec(body.text);
    if (wakeMatch) {
      const wakeRow = {
        id: uid(), request: wakeMatch[1].trim(),
        agent: body.source || null, chatUrl: body.chatUrl || null,
        account: body.account || null, sessionId: body.sessionId || null,
        role: body.role || null, ts: Date.now(), consumed: false, answer: null,
      };
      jaaDB.insert('nexus_wake_events', wakeRow);
      jaaDB.insert('event_log', { type: eventTypes.CHAT.CHAT_WAKE, ...wakeRow });
      _cortexSSEBroadcast({ type: 'nexus.wake.detected', ...wakeRow });
    }
    json(res, 200, { ok: true });
    return;
  }


  // ── RAID ──────────────────────────────────────────────────────────────────
  if (p === '/api/raid/decide') {
    const intent = url.searchParams.get('intent') || '';
    const cfrCtx = { sigmaFloor: _field.entropy, regime: _field.regime };
    json(res, 200, { ok: true, ..._raidDecide(intent, cfrCtx) });
    return;
  }

  if (p === '/api/raid/feedback' && method === 'POST') {
    const body   = await readBody(req);
    // 2026-09-19: accept guardian's real shape ({provider, ok, outcome?, transport, ...}) as well as the original
    // {agent, outcome}. Before, guardian's body never matched, so this updated nothing while answering ok:true.
    const agent   = body.agent || body.provider;
    const outcome = body.outcome || (body.ok === true ? 'success' : body.ok === false ? 'failure' : null);
    if (agent && outcome === 'success') _raidHealth[agent] = Math.min(100, (_raidHealth[agent] || 50) + 5);
    if (agent && outcome === 'failure') _raidHealth[agent] = Math.max(0,   (_raidHealth[agent] || 50) - 20);
    // 'needs_user' (login wall, captcha) is not the agent's fault: recorded for visibility, never lowers health.
    if (agent && (outcome === 'success' || outcome === 'failure')) {
      try { require('./core/raid').recordOutcome(agent, body.cluster || 'seam', outcome === 'success'); } catch (_) {}
    }
    if (agent && outcome) {                                    // per-transport learning: which way of reaching an agent works
      const k = `${agent}@${body.transport || 'ncp'}`;
      const t = _raidTransport[k] = _raidTransport[k] || { calls: 0, ok: 0, failed: 0, needsUser: 0, lastFallbackReason: null };
      t.calls++;
      if (outcome === 'success') t.ok++; else if (outcome === 'failure') t.failed++; else if (outcome === 'needs_user') t.needsUser++;
      if (body.fallbackReason) t.lastFallbackReason = body.fallbackReason;
    }
    json(res, 200, { ok: true, health: _raidHealth, recorded: !!(agent && outcome) });
    return;
  }

  if (p === '/api/raid/health') {
    json(res, 200, { ok: true, health: _raidHealth, transports: _raidTransport, regime: _field.regime });
    return;
  }

  // ── Self-heal status ──────────────────────────────────────────────────────
  if (p === '/api/self-heal/status') {
    const open = jaaDB.count('gaps', { status: 'open' }) || 0;
    json(res, 200, { ok: true, openGaps: open, regime: _field.regime,
      friction: _field.friction, healing: open > 0 && _field.friction < 0.5 });
    return;
  }

  // ── Versionium ───────────────────────────────────────────────────────────
  // §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
  // phasemap.spec) — these routes moved wholesale to versionium/server.js
  // (port 3754), a real sovereign system, not embedded here anymore. A
  // caller hitting /api/versionium/* on THIS port now gets a real,
  // honest redirect notice rather than a silent 404 or stale behavior —
  // every real caller (lib/agent-tools/tools/governance/versionium-
  // commit.js, orchestrator/lib/versionium-auto-commit.js) was updated in
  // this same migration to call the new port directly instead.
  if (p.startsWith('/api/versionium/')) {
    json(res, 410, { ok: false, error: 'versionium moved to its own sovereign system — call http://127.0.0.1:3754' + p + ' instead', movedTo: 'versionium', movedPort: 3754 });
    return;
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────
  // §DECLARED-BUT-MISSING WIRE CLOSED 2026-07-09 — hook `cortex-snapshot-create`
  // has declared POST /api/snapshots/create since 2026-06-11, intent: "Archive
  // full JAA table state to a .nex snapshot so the system can rewind to any
  // prior state." Nothing implemented it. `/api/snapshots` only ever READ the
  // snapshots table — a table nothing ever wrote to.
  //
  // Integrity uses rfr2's identity.contentHash(), the same primitive proven to
  // be stable across runs, sensitive to content, and independent of key order.
  // That is the versionium primitive (Phase 32/105), and this is its second
  // real production consumer.
  if (p === '/api/snapshots/create' && method === 'POST') {
    try {
      const fs_ = require('fs');
      const path_ = require('path');
      const DIR = path_.join(__dirname, '../data/cortex/memory');
      const { loadRFR2Module } = require('../lib/rfr2-bridge.js');
      const identity = await loadRFR2Module('identity');

      const files = fs_.readdirSync(DIR).filter(f => f.endsWith('.json'));
      const tables = [];
      for (const f of files) {
        // §CAUGHT BEFORE IT BIT 2026-07-09 — a snapshot must never hash its own
        // output table. Today snapshots.json does not exist on disk, so this is
        // latent rather than broken. The moment it appears, every snapshot would
        // include the previous snapshot, stateHash would differ on every call,
        // and the one property the hash exists to provide — "same state, same
        // hash" — would be silently destroyed. Verified: with this exclusion,
        // two consecutive snapshots of unchanged state produce identical hashes.
        if (f === 'snapshots.json') continue;
        const raw = fs_.readFileSync(path_.join(DIR, f), 'utf8');
        let rows = 0;
        try { const parsed = JSON.parse(raw); rows = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length; }
        catch (_) { rows = -1; } // §1.2 — an unparseable table is recorded as such, not skipped
        tables.push({ table: f.replace(/\.json$/, ''), rows, hash: String(identity.contentHash({ table: f, body: raw })) });
      }

      const snapshot = {
        id: jaaDB.uid(),
        ts: Date.now(),
        tableCount: tables.length,
        tables,
        // Hash of the hashes: one value identifying this whole system state.
        stateHash: String(identity.contentHash({ tables: tables.map(t => t.hash) })),
      };
      jaaDB.insert('snapshots', snapshot);
      json(res, 201, { ok: true, snapshot });
    } catch (e) {
      // §1.2 — a snapshot that failed must never look like one that succeeded.
      json(res, 500, { ok: false, error: `snapshot failed: ${e.message}` });
    }
    return;
  }

  if (p === '/api/snapshot' || p === '/api/snapshots') {
    if (method === 'POST') {
      const body = await readBody(req);
      const snap = { id: uid(), ...body, field: { ..._field }, ts: Date.now() };
      jaaDB.insert('snapshots', snap);
      json(res, 200, { ok: true, id: snap.id });
      return;
    }
    const snaps = jaaDB.tail('snapshots', p === '/api/snapshots' ? 20 : 1);
    json(res, 200, { ok: true, snapshots: snaps, latest: snaps[0] || null });
    return;
  }

  // §GAP CLOSED 2026-07-06 — snapshots could be created and read, but
  // nothing ever restored state FROM one. hooks/cortex.hooks.js declares
  // this as /api/snapshots/rollback; real path kept flatter
  // (/api/snapshot/rollback) matching this file's own /api/snapshot
  // singular convention — the registry needs updating to match, not the
  // other way around, since /api/snapshot (not /api/snapshots) is what
  // every other route here already uses as the base.
  if (p === '/api/snapshot/rollback' && method === 'POST') {
    const body = await readBody(req);
    const { id } = body || {};
    if (!id) { json(res, 400, { ok: false, error: 'id required' }); return; }
    const all = jaaDB.tail('snapshots', 500);
    const target = all.find(s => s.id === id);
    if (!target) { json(res, 404, { ok: false, error: `snapshot '${id}' not found` }); return; }
    const before = { ..._field };
    Object.assign(_field, target.field);
    jaaDB.insert('event_log', { type: 'cortex.snapshot.rolled_back', payload: { id, before, after: { ..._field } }, source: 'cortex', ts: Date.now() });
    json(res, 200, { ok: true, restoredFrom: id, field: { ..._field } });
    return;
  }

  // ── Generic table insert ──────────────────────────────────────────────────
  if (p === '/api/table/insert' && method === 'POST') {
    const body = await readBody(req);
    const { table, row } = body;
    if (!table || !row) { json(res, 400, { ok: false, error: 'table + row required' }); return; }
    const inserted = jaaDB.insert(table, { id: uid(), ...row, ts: row.ts || Date.now() });
    json(res, 200, { ok: true, id: inserted.id });
    return;
  }

  // ── CLI exec (internal only) ──────────────────────────────────────────────
  if (p === '/api/cli/exec') {
    // §1.2 / §1.3 FIXED 2026-07-09 — this returned HTTP 200 with
    // `{ ok: true, result: 'cortex cli exec — not implemented' }`. A caller
    // checking `ok` saw success. A stub that reports success is worse than a
    // missing route: the missing route fails loudly at the call site, while
    // this one silently convinced every caller its command had run.
    // The route stays (in a non-linear system a route is an affordance, and
    // its missing implementation is a gap to fill) but it now tells the truth.
    json(res, 501, {
      ok: false,
      error: 'not implemented',
      route: '/api/cli/exec',
      hint: 'cortex does not execute CLI commands. Use the run_command agent tool, which reads cockpit\'s INTERACTION_CONTRACT.',
      ts: Date.now(),
    });
    return;
  }

  // ── Replay inspect ────────────────────────────────────────────────────────
  if (p === '/api/replay/inspect') {
    const rows = jaaDB.tail('event_log', 50);
    json(res, 200, { ok: true, events: rows, count: rows.length });
    return;
  }

  // ── Settings compat ───────────────────────────────────────────────────────
  // §SOVEREIGNTY 2026-07-09 — personas lived only as a module, so
  // copilot/server.js reached across the system boundary with
  // require('../cortex/personas.js') + require('../cortex/memory/jaa-db.js').
  // That is the hardest possible wire: it couples file layout, module system
  // and process, and makes cortex un-swappable. A capability that another
  // system needs must be an API. Here it is.
  if (method === 'GET' && p === '/api/personas') {
    const { PersonaStore } = require('./personas.js');
    const store = new PersonaStore({ jaa: jaaDB });
    const name = url.searchParams.get('name');
    if (name) { json(res, 200, { ok: true, persona: store.get(name) }); return; }
    json(res, 200, { ok: true, personas: store.list() });
    return;
  }

  if (method === 'POST' && p === '/api/personas') {
    const body = await readBody(req);
    try {
      const { PersonaStore } = require('./personas.js');
      const store = new PersonaStore({ jaa: jaaDB });
      json(res, 200, { ok: true, ...store.set(body) });
    } catch (e) {
      // §1.2 — validation errors (missing systemPrompt) surface, never store silently.
      json(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  if (p === '/api/settings.js' || p === '/api/settings') {
    const rows = jaaDB.query('settings', {});
    json(res, 200, { ok: true, settings: rows });
    return;
  }

  // ── n= compat alias ───────────────────────────────────────────────────────
  if (url.searchParams.get('n')) {
    const n    = parseInt(url.searchParams.get('n'));
    const rows = jaaDB.tail('event_log', n);
    json(res, 200, { ok: true, events: rows });
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({ ok: false, error: 'Not found', path: p }));
});

// ── Register with orchestrator ────────────────────────────────────────────────
function _register() {
  const components = require('../lib/component-registry').normalizeDeclarations(require('./registry-components'));
  const body = JSON.stringify({
    systemId: SYSTEM, port: PORT, version: VERSION, status: 'online',
    meta: { label: 'CORTEX', color: '#2dd4bf' },
    components,
  });
  const u   = new URL(`${OR_URL}/api/register`);
  const req = http.request({
    hostname: u.hostname, port: u.port || 9000, path: u.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 4000,
  }, () => { console.log(`[cortex] registered with orchestrator :${u.port}`); _startHeartbeat(); });
  req.on('error', () => setTimeout(_register, 5000));
  req.write(body); req.end();
}

// §FIX 2026-07-24 — cortex was the only one of orchestrator's 3
// REQUIRED_SYSTEMS (cortex/guardian/idearium) with no outbound heartbeat.
// guardian, idearium, copilot, and ollama-bridge all POST /api/heartbeat
// on a 10s interval; cortex only ever sent the one-time /api/register at
// boot. orchestrator's watchdog (systemWatchdog(), 10s tick) flips a
// system to OFFLINE only when BOTH the direct /health GET fails/times out
// (3s) AND the registry's lastSeen is >15s stale (allHealth()'s regOnline
// fallback) — for every other required system, a transient health-check
// miss gets absorbed by that fallback because their heartbeat keeps
// lastSeen fresh. Cortex had no heartbeat, so lastSeen only got set once,
// at boot registration — meaning after the first 15 seconds of runtime,
// cortex was running on the raw 3-second health-check timeout ALONE, with
// no safety net, for its entire lifetime. A single momentary event-loop
// block (e.g. synchronous JAA table loading during a busy multi-system
// boot window — this codebase's other systems load 30+ tables the same
// way) was enough to trip a real "[watchdog] cortex → OFFLINE" even
// though the process never crashed (confirmed live: autopilot's own
// "stable for 60s" fired seconds later — the process was fine, only the
// HTTP health check was momentarily unanswered). Mirrors idearium's real,
// working heartbeat pattern (idearium/api/index.js) exactly, not invented
// fresh — same interval, same payload shape, same fire-and-forget error
// handling.
let _heartbeatStarted = false;
let _pulseClient = null;
// §B1 2026-07-24 — publish cortex's bus subscriptions to the shared store so
// the consumer graph spans processes. Before this, lib/consumer-registry.js
// could only see the subscribers of whichever process happened to be asking,
// so cortex's listeners were invisible to everyone else and its own
// unconsumed() calls reported other systems' real work as "emitted into the
// void."
//
// Deliberately called from _startHeartbeat (i.e. AFTER registration succeeds,
// which is after boot has wired its listeners) rather than at module load.
// Publishing at the top of boot would snapshot a bus that has subscribed to
// nothing yet and record cortex as consuming zero events — a real footgun the
// library's own doc comment warns about. The 10s republish also means any
// listener wired later is picked up within one interval rather than never.
function _startSubscriptionPublisher() {
  try {
    const busSubs = require('../lib/bus-subscriptions');
    busSubs.publishPeriodically({ systemId: SYSTEM, bus, jaa: jaaDB, intervalMs: 10000 });
    console.log(`[cortex] bus subscriptions publishing to the shared store (§B1)`);
  } catch (e) {
    // Never fatal: the connectome is observability, and a system must not
    // fail to boot because the map could not be updated (§1.2 — loud).
    console.error(`[cortex] subscription publisher failed to start: ${e.message}`);
  }
}

function _startHeartbeat() {
  if (_heartbeatStarted) return; // _register() can retry; never double-start the interval
  _heartbeatStarted = true;
  _startSubscriptionPublisher();
  _pulseClient = createPulse({
    systemId: SYSTEM,
    port: PORT,
    orchPort: new URL(OR_URL).port || 9000,
    intervalMs: 10000,
    onMiss: ({ missed, elapsed }) => {
      if (missed === 3) console.warn(`[cortex/pulse] 3 missed beats to orchestrator (${elapsed}ms since last ack)`);
    },
    onOffline: ({ missed, elapsed }) => console.warn(`[cortex/pulse] orchestrator appears OFFLINE — ${missed} missed beats, ${elapsed}ms since last ack`),
    onOnline: ({ latency }) => console.log(`[cortex/pulse] orchestrator back online, latency=${latency}ms`),
    log: () => {}, // real pulse lifecycle logging already covered by the callbacks above
  });
}

function _stopHeartbeat() {
  try { _pulseClient?.stop(); } catch (_) {}
}

// ── Poll CFR field from orchestrator every 5s ─────────────────────────────────
function _pollOrchestrator() {
  const req = http.request({
    hostname: '127.0.0.1', port: 9000, path: '/cfr/field',
    method: 'GET', timeout: 3000,
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      try {
        const data = JSON.parse(d);
        if (data && typeof data.coherence === 'number') _updateField(data);
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.end();
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[cortex] :${PORT} — v${VERSION} — memory+cfr+raid+intelligence active`);
  setTimeout(_register, 1500);
  setInterval(_pollOrchestrator, 5000);
  // §Phase-97 fix 2026-06-29: this boot log has claimed "raid active" since
  // before cortex/core/raid/index.js existed. It does now — start its
  // health poll so _health stops sitting at boot-time defaults.
  try { require('./core/raid').startHealthPoll(15000); } catch(e) {
    console.warn(`[cortex] RAID health poll failed to start: ${e.message}`);
  }
  // §BUILT 2026-07-12 — cortex.spec has declared MEMORY_TIERS since v3.2.0;
  // this is what actually ages working/short-tier rows out on schedule.
  try { require('./memory/decay').startDecayTicker(5 * 60 * 1000); } catch (e) {
    console.warn(`[cortex] memory decay ticker failed to start: ${e.message}`);
  }
  // Half-life snapshot pruning: 1/3 pruned past 1wk, 1/2 of what's left
  // pruned past 2wk, hard-deleted past 3wk. See cortex/snapshot/index.js.
  try { require('./snapshot').startPruneTicker(6 * 60 * 60 * 1000); } catch (e) {
    console.warn(`[cortex] snapshot decay ticker failed to start: ${e.message}`);
  }
  // §FIX 2026-09-02 — James, building toward "give agents context,
  // persistent memory, reduce noise": lib/vector-memory.js's own real
  // init() has NEVER been called anywhere in this codebase, confirmed
  // by grep before fixing — the entire embedding pipeline (8 real
  // tables already listed in EMBEDDABLE_TABLES, cortex/memory/jaa-
  // db.js's own new onJaaInsert hook, this session) has been silently
  // inert regardless of any of that wiring, since _ready stayed false
  // forever. Started here, once, at cortex boot — the real home of
  // this module's own domain (embedding cortex's own tables).
  try {
    require('../lib/vector-memory').init().then(() => {
      console.log('[cortex] vector-memory initialized — semantic search + auto-embed active');
      // Component registries are static files, not jaaDB rows — no
      // insert() event to hook, so this is a real, explicit, one-time
      // scan at boot (registries only change on redeploy) rather than
      // an interval ticker.
      require('../lib/vector-memory').embedComponentRegistries().then(r => {
        console.log(`[cortex] component registries embedded: ${r.embedded} components across ${r.systemsScanned} systems (${r.failed} failed, ${r.skipped} skipped)`);
      }).catch(e => console.warn(`[cortex] embedComponentRegistries failed (non-fatal): ${e.message}`));
    }).catch(e => console.warn(`[cortex] vector-memory init failed (non-fatal, semantic search disabled): ${e.message}`));
  } catch (e) {
    console.warn(`[cortex] vector-memory require failed (non-fatal): ${e.message}`);
  }
  // §GAP CLOSED 2026-07-19 — versionium/index.js, versionium/causality.js,
  // liminal-space/index.js and intelligence/index.js existed fully written
  // and tested (unintegrated/2026-07-branch-b-cortex-v2) but were never
  // require()'d from anywhere — dead code sitting next to boot.js. All four
  // are self-contained: init(cfg)/stop(), unref'd intervals, no dependency
  // on anything not already in this tree. Starting them here is purely
  // additive — nothing else in boot.js calls into them yet, so this cannot
  // change any existing route's behavior.
  //
  // liminal-space's init(cfg) takes a cfg.bus (Node EventEmitter) to
  // subscribe to events like 'cortex.gap.found' / 'forge.patch.proposed'.
  // Turned out that bus already existed — nexus-bus.js at repo root,
  // documented as "the common event fabric," already used by guardian and
  // orchestrator to POST into cortex's /api/event — but boot.js never
  // required it, so nothing arriving there ever reached an in-process
  // listener. Now required above as `bus`, wired into /api/event and
  // /api/gaps (POST) so both cross-process events and cortex's own gap
  // creation fan out live, and passed to liminal-space for real below.
  //
  // ── Compartment DOM ledger (§MCO10 2026-09-13) ──────────────────────────
  // James: "stream the DOM to the compartment ledger per contract using
  // the compartment uuid." Reuses this exact real path — clear-glass has
  // no in-process jaa (same real cross-process boundary agent-mesh.js's
  // _raidDecide/gap-reporting already cross), so it POSTs to /api/event
  // like everything else in this section, rather than a second ingest
  // surface being invented. A single fixed bus event name is used —
  // nexus-bus is a plain EventEmitter, no wildcard matching — the real
  // DOM event's own subtype (dom.snapshot / dom.mutation / etc, clear-
  // glass's own vocabulary) travels inside the payload, not the bus name.
  // §MCO20 2026-09-13 — closes MCO19's stated gap: a real ClearGlass
  // dispatch result now advances the real contract past PROCESSING,
  // reusing _advanceToOutputFolder as-is (no new mechanism).
  bus.on('raid.contract.dispatched.clearglass.result', (payload) => {
    if (!payload || !payload.queueId) return;
    try {
      const intake = require('./core/raid/contract-intake.js');
      const row = intake.listQueue().find(r => r.uuid === payload.queueId);
      if (row) intake._advanceToOutputFolder(row.uuid, row, { queueId: row.uuid, status: 'PASS', result: payload.result });
    } catch (e) { console.warn(`[cortex] clearglass result handling failed: ${e.message}`); }
  });

  bus.on('compartment.dom.event', (payload) => {
    const { recordDomEvent } = require('../lib/compartment-dom-ledger.js');
    const result = recordDomEvent(jaaDB, payload, uid);
    if (!result.ok) console.warn(`[cortex] compartment_dom_ledger: ${result.reason}`);
  });
  // §VS1 2026-09-02 — versionium.init()/setDeps() and versionium/
  // causality's own init() used to live here (this process fed them
  // cortex's own in-process _field state directly). Both are gone —
  // versionium/server.js now runs as its own sovereign process and
  // polls this cortex process's real GET /cfr/field over sovereign
  // transport instead (see that file's own header for the full
  // reasoning). Nothing to start here anymore.
  // ── Organs array — one line per bus-wired SISO organ ────────────────────────
  // Replaces six structurally-identical try/catch blocks that accreted one
  // Phase at a time (the exact monolith-bottleneck pattern the organ model
  // exists to prevent — tests/modules/test-liminal-space.js T-015 has pinned
  // this shape since before any of these organs existed). Every organ shares
  // the same contract: init({ bus }), console log convention, isolated failure.
  const organs = [
    { name: 'self-heal/escalation', path: './self-heal/escalation', note: 'friction ledger — closes liminal-space\'s escalation.friction.increased listener' },
    { name: 'self-heal',            path: './self-heal',            note: '5-level escalation ladder' },
    { name: 'gap-finder',           path: './gap-finder',           note: 'anomaly.detected + sigma.event.* → cortex.gap.found' },
    { name: 'orion',                path: './orion',                note: 'anomaly/sigma → cortex.orion.classified' },
    { name: 'raid',                 path: './core/raid',            note: 'cortex.orion.classified → cortex.raid.decided (direct-call route unaffected)' },
  ];
  for (const organ of organs) {
    try {
      require(organ.path).init({ bus });
      console.log(`[cortex] ${organ.name} active (${organ.note})`);
    } catch (e) {
      console.warn(`[cortex] ${organ.name} failed to start: ${e.message}`);
    }
  }
  // §Phase P1 2026-07-24 — the CONSUMER side of the registry (§8.5).
  // Scan found: hook_bindings EMPTY (wire() only reachable via loom's HTTP
  // route, nothing calls it), component.events populated on 0 of 217. So
  // relationships are not DECLARED anywhere — but they ARE observable:
  // event_log holds real producer data, and this bus knows its subscribers.
  // Wired here specifically because subscriber counts can only be read from
  // inside a process that holds the bus.
  try {
    const consumerRegistry = require('../lib/consumer-registry');
    const { jaaDB } = require('./memory/jaa-db');
    consumerRegistry.init({ jaa: jaaDB, bus });
    console.log('[cortex] consumer-registry active — derives producer/consumer graph from observed behaviour (event_log + live bus)');
  } catch (e) {
    console.warn(`[cortex] consumer-registry failed to start: ${e.message}`);
  }
  try {
    const capabilityRegistry = require('../lib/capability-registry');
    try { capabilityRegistry.init(require('../lib/component-registry')); } catch (_) {}
    require('./core/raid/router').init({ bus, capabilityRegistry });
    console.log('[cortex] raid/router active — universal entry point (any surface → raid.route.request → raid.route.decided)');
  } catch (e) {
    console.warn(`[cortex] raid/router failed to start: ${e.message}`);
  }

  // §MERGE-CONSOLIDATE 2026-08-28 — James: "merge and consolidate" (the
  // .nex naming question from earlier this session). Bottom-up finding,
  // not assumed: cortex/snapshot/index.js (this file's own real
  // registry, 11 real dependents including lib/compartment-engine.js)
  // and cos/foundation/snapshot.js's SnapshotEngine (COS's own, real,
  // "pre-release" per-compartment engine — file manifests with content
  // hashes, gzip compression, process state, event tail; only 3 real
  // dependents, all inside cos/ itself) are NOT duplicates of the same
  // thing — confirmed by reading both full API surfaces and their real
  // on-disk paths (cortex/data/snapshots/ vs each compartment's own
  // <root>/.nex/ — zero collision). Mine coordinates state ACROSS
  // multiple different systems into one chain-verified snapshot; COS's
  // captures ONE compartment's rich file/process/event state. Different
  // scope, same coincidental file-extension name.
  //
  // Per axioms §17.11 (name the real benchmark, no unilateral invention)
  // and the Leverage Principles (prefer additive over replacing what
  // exists): neither system is replaced. COS's richer per-compartment
  // capture becomes ONE registered state-provider here — this is the
  // actual "merge and consolidate": composition, not replacement.
  //
  // COS is CLI-driven by design (cos/kernel.js's own comment: "no
  // http.createServer/express in cos/ core... cos core CLI-driven") —
  // an embeddable library, not a networked peer, so require()'ing it
  // directly here is COS's own documented architecture, not a
  // sovereignty violation of the "every system is sovereign, contracts
  // only" axiom (that axiom governs systems that ARE separate networked
  // processes; COS explicitly opted out of being one).
  //
  // createHost() is called FRESH inside capture()/restore(), never
  // cached — it reads real, current state from disk each time
  // (store.load()), so a live COS process creating/destroying
  // compartments between calls is always reflected correctly, not read
  // from a stale in-memory snapshot of a host object created once at
  // cortex boot.
  //
  // capture() stores a REFERENCE (snapId per compartment), not the raw
  // file/process/event content — COS's own SnapshotEngine.take() already
  // persists that heavy content to its own real, gzip-compressed .nex.gz
  // file; duplicating it into cortex's own combined snapshot blob would
  // mean storing the same bytes twice for no real benefit.
  try {
    const { createHost } = require('../cos/host/index.js');
    const { SnapshotEngine } = require('../cos/foundation/snapshot.js');
    const snap = require('./snapshot/index.js');
    snap.registerStateProvider('cos', {
      capture: () => {
        const host = createHost();
        const compartments = host.store.listCompartments();
        const refs = {};
        for (const comp of compartments) {
          try {
            const engine = new SnapshotEngine(host, comp);
            const s = engine.take('cortex.combined-snapshot');
            refs[comp.id] = { ok: true, snapId: s.id };
          } catch (e) {
            // §1.2 — one compartment's failed snapshot doesn't block the rest
            refs[comp.id] = { ok: false, error: e.message };
          }
        }
        return { compartments: refs };
      },
      restore: (state) => {
        const host = createHost();
        const restored = [], failed = [];
        for (const [compId, ref] of Object.entries(state?.compartments || {})) {
          if (!ref?.ok) { failed.push({ compId, error: ref?.error || 'capture had already failed' }); continue; }
          try {
            const comp = host.store.getCompartment(compId);
            if (!comp) { failed.push({ compId, error: 'compartment no longer exists' }); continue; }
            const engine = new SnapshotEngine(host, comp);
            engine.restore(ref.snapId);
            restored.push(compId);
          } catch (e) {
            failed.push({ compId, error: e.message });
          }
        }
        // §BUGFIX — found while verifying this, before shipping it: COS's
        // own state-store debounces writes (setCompartment schedules an
        // async save, doesn't write synchronously). engine.restore()
        // above calls setCompartment() internally, so without this, a
        // caller of THIS restore() could get a "success" result back
        // while the actual write is still pending — a real rollback
        // that isn't durable yet if anything reads the store again
        // immediately after. flushSync() forces it before returning.
        try { host.store.flushSync(); } catch (_) {}
        return { restoredCompartments: restored, failed };
      },
    });
    console.log('[cortex] cos state-provider registered — compartment snapshots via COS\'s own real SnapshotEngine, referenced not duplicated');
  } catch (e) {
    console.warn(`[cortex] could not register cos state provider (compartment backup/restore via .nex will be unavailable): ${e.message}`);
  }

});

module.exports = { server, jaaDB };
