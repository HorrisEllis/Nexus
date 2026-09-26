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
// §BUILD 2026-08-30 — ET4_orchestrator_autopilot_event_taxonomy. Same
// real, fail-open boot-time self-check already proven for clear-glass
// and guardian.
try {
  const taxonomy = require('./event-taxonomy');
  const { validateTaxonomy } = require('../lib/event-taxonomy-pattern.js');
  const result = validateTaxonomy(taxonomy, { systemName: 'orchestrator' });
  if (!result.ok) {
    console.warn(`[Orchestrator/EventTaxonomy] ${result.errors.length} real shape violation(s) in event-taxonomy.js:`);
    result.errors.forEach(e => console.warn(`  - ${e}`));
  }
} catch (err) {
  console.warn(`[Orchestrator/EventTaxonomy] validation itself failed (non-fatal): ${err.message}`);
}
const { buildIntentMap } = require('./lib/intent-map');  // Gap 2: intent-map endpoint

// ── Hoist all dynamic requires — fixes ReferenceError in ESM-adjacent contexts ──
// These were previously inside server.listen callback and cli functions.
// §3.1 load order is law — all imports declared before any logic runs.
let BootSequence, _bootSystems, createCFRLedger, spawnChild;
try { ({ BootSequence } = require('../lib/boot-sequence')); } catch(e) { console.warn('[orchestrator] boot-sequence not found:', e.message); BootSequence = null; }
try { ({ _bootSystems } = require('../cli/boot-systems')); } catch(e) { console.warn('[orchestrator] boot-systems not found:', e.message); _bootSystems = null; }
// §CFR-WIRE-01: orchestrator now runs the CFR-Ω ledger (sigma/delta/field on
// every ledgerWrite) instead of the plain event-ledger. ledgerWrite() below is
// already the single funnel point, so this is a drop-in swap — same .record()/
// .open()/.startAutoSave()/.getAllBaselines()/.getAllStats()/.scanInvariants()
// surface, plus .handleCFRRoute() for the /cfr/* debugger routes mounted below.
try { ({ createCFRLedger } = require('../intelligence/cfr/ledger')); } catch(e) { console.warn('[orchestrator] cfr ledger not found:', e.message); createCFRLedger = null; }

// ── NEXUS INTERCONNECT LAYER ──────────────────────────────────────────────────
const nexusBus       = (() => { try { return require('../nexus/nexus-bus');           } catch(e) { console.warn('[orc] nexus-bus:',e.message); return null; } })();
const nexusQuery     = (() => { try { return require('../nexus/nexus-query');         } catch(e) { return null; } })();
const nexusKnowledge = (() => { try { return require('../nexus/nexus-knowledge');     } catch(e) { return null; } })();
const nexusCFR       = (() => { try { return require('../nexus/nexus-cfr-influence'); } catch(e) { return null; } })();
const nexusHealLoop  = (() => { try { return require('../diagnostic/nexus-heal-loop');     } catch(e) { return null; } })();
try { ({ spawn: spawnChild } = require('child_process')); } catch(e) { spawnChild = null; }

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
// §BUGFIX 2026-08-23 — ROOT was __dirname, correct only because
// orchestrator.js sat at repo root. Used in 19 real places throughout
// this file (path.join(ROOT, 'ui'), path.join(ROOT, 'cli', ...), etc.)
// as if it meant "the repo root," not "wherever this file lives" — the
// two were the same thing before this file moved into orchestrator/,
// and would have silently diverged for every one of those 19 real call
// sites otherwise. Single-point fix rather than patching each call site
// individually: ROOT now explicitly means repo root, correct regardless
// of which folder this file itself lives in.
const ROOT    = path.join(__dirname, '..');
const UI_ROOT = path.join(ROOT, 'ui');

// ── System registry ───────────────────────────────────────────────────────────
const SYS = {
  bridge:     { port:9999,  host:'127.0.0.1', label:'Bridge',      color:'#00d4ff', healthPath:'/health' },
  cortex:     { port:3748,  host:'127.0.0.1', label:'Cortex',      color:'#2dd4bf' },
  intelligence: { port:3753, host:'127.0.0.1', label:'Intelligence', color:'#f0abfc', healthPath:'/health' },
  guardian:   { port:7820,  host:'127.0.0.1', label:'Guardian',    color:'#9b7fe8' },
  idearium:   { port:4800,  host:'127.0.0.1', label:'Idearium',    color:'#4a9eff' },
  architect:  { port:3747,  host:'127.0.0.1', label:'Architect',   color:'#ef9f27' },
  emerge:     { port:4242,  host:'127.0.0.1', label:'Emerge IDE',  color:'#3ecf8e' },
  diagnostic: { port:7825,  host:'127.0.0.1', label:'Diagnostic',  color:'#ff6b35', healthPath:'/status' },
  eravos:     { port:3751, host:'127.0.0.1', label:'ERAVOS',        color:'#a78bfa', healthPath:'/health' },
  ollama:     { port:3749, host:'127.0.0.1', label:'Ollama Bridge', color:'#00ff88', healthPath:'/health' },
  copilot:    { port:3750, host:'127.0.0.1', label:'Co-pilot',      color:'#cc44ff', healthPath:'/health' },
  loom:       { port:3752, host:'127.0.0.1', label:'Loom',          color:'#e879f9', healthPath:'/health' },
  versionium: { port:3754, host:'127.0.0.1', label:'Versionium',   color:'#8855ff', healthPath:'/health' },
  autopilot:  { port:7799,  host:'127.0.0.1', label:'Autopilot',   color:'#fbbf24' },
};

// ── Channel map ───────────────────────────────────────────────────────────────
const CHANNELS = [
  { from:'guardian',  ch:'guardian.job.complete',        to:['cortex'],      desc:'Job finished → memory.ingest' },
  { from:'guardian',  ch:'guardian.artifact',            to:['cortex'],      desc:'Code artifact → cortex + tagged' },
  { from:'guardian',  ch:'guardian.gaps',                to:['cortex'],      desc:'Gaps detected in AI output' },
  { from:'guardian',  ch:'guardian.ledger',              to:['jaa'],         desc:'Ledger entry' },
  { from:'guardian',  ch:'guardian.session.named',       to:['jaa'],         desc:'Chat session named' },
  { from:'guardian',  ch:'guardian.timeline',            to:['jaa'],         desc:'Timeline event' },
  { from:'guardian',  ch:'guardian.setting.update',      to:['jaa'],         desc:'Setting changed' },
  { from:'cortex',    ch:'cortex.gap.found',             to:['guardian'],    desc:'Gap → guardian ledger' },
  { from:'idearium',  ch:'idearium.idea.created',        to:['cortex'],      desc:'Idea → cortex + tagged' },
  { from:'idearium',  ch:'idearium.snapshot.pushed',     to:['versionium'],  desc:'Snapshot → versionium (no real subscriber yet — documentation only, §6.1)' },
  { from:'alk',       ch:'alk.signal.composite',         to:['cortex'],      desc:'ALK composite → event_log' },
  { from:'architect', ch:'architect.hook.registered',    to:['cortex'],      desc:'Hook declared → cortex event_log' },
  { from:'architect', ch:'architect.hook.wired',         to:['cortex'],      desc:'Hook wiring → cortex event_log' },
  { from:'architect', ch:'architect.blueprint.built',    to:['cortex'],      desc:'Blueprint → cortex + guardian' },
  { from:'architect', ch:'architect.snr.checked',        to:['cortex'],      desc:'SNR result → cortex event_log' },
  { from:'architect', ch:'architect.gap.opened',         to:['cortex','guardian'], desc:'Architect gap → cortex + guardian' },
  { from:'architect', ch:'architect.map.scanned',        to:['cortex'],      desc:'Topology map → cortex event_log' },
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
    { cmd:'nexus /ollama pull qwen2.5-coder:1.5b',    desc:'Pull model' },
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
  cortex:       '/health',
  guardian:     '/health',
  idearium:     '/health',
  emerge:       '/status',
  architect:    '/health',
  ollama:       '/api/tags',
  autopilot:    '/status',
  intelligence: '/health',
  versionium:   '/health',
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
// { systemId → { port, registeredAt, lastSeen, meta, online, _intervals, bpm, healthScore } }

// ── §BPM — heartbeat-derived health score, not binary online/offline ─────────
// James: "systems have to announce themselves, then use the bpm as a health
// score system." Announce = the existing POST /api/register (real, unchanged).
// Pulse = the existing 10s POST /api/heartbeat (real, unchanged). What was
// missing: turning the actual, observed beat-to-beat rhythm into one honest
// number instead of just "last beat was < 30s ago -> online".
//
// Four real signals, each independently checkable against a live system:
//   regularity  — is the actual gap between beats close to the cadence this
//                 system itself said it would beat at (intervalMs, sent this
//                 pass)? A system that's fine but slow to schedule its own
//                 timer looks different from one that's actually stalling.
//   steadiness  — coefficient of variation across the last BPM_RING_SIZE real
//                 intervals. A regular-on-average-but-erratic rhythm (long
//                 pause, burst, long pause) is a real degradation signature
//                 a simple average would hide.
//   latency     — the system's OWN measured round-trip to /api/heartbeat
//                 (orchestrator/lib/pulse.js's real latency ring, now sent
//                 in the beat body) — network/handling slowness, not guessed.
//   missed      — the system's OWN missed-beat count since its last online
//                 transition (same real pulse.js counter).
// Weighted, clamped 0-100. Weights are a first, honest pass (§16.4 — simple,
// generalize after real repetition) — not tuned against production data yet,
// which is why they're named constants here, not buried magic numbers.
const BPM_RING_SIZE      = 10;
const BPM_WEIGHT         = { regularity: 0.5, steadiness: 0.2, latency: 0.15, missed: 0.15 };
const BPM_LATENCY_CEILING_MS = 2000; // self-reported avg latency at/above this scores 0 on that axis
const BPM_MISSED_PENALTY_PER = 0.1;  // each recent missed beat costs 10% on that axis, floor 0

function _mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function _clamp01(n) { return Math.max(0, Math.min(1, n)); }

/**
 * computeBpmHealth — pure function, no side effects, so it's testable without
 * a running orchestrator. `intervals` is the real, observed gap-between-beats
 * history (ms), oldest first. `expectedIntervalMs` is the system's own
 * self-reported cadence. `stats` is the system's own self-reported
 * { latencyAvgMs, missed } from this beat (may be absent — older/other pulse
 * clients that haven't sent it yet degrade honestly, not falsely-perfect).
 * Returns { bpm, targetBpm, healthScore, components } — components kept for
 * anyone debugging why a score is what it is (§16.2 — systems explain
 * themselves), not just the final number.
 */
function computeBpmHealth(intervals, expectedIntervalMs, stats = {}) {
  if (!intervals.length || !expectedIntervalMs) {
    return { bpm: null, targetBpm: null, healthScore: null, components: null };
  }
  const avgIntervalMs = _mean(intervals);
  const bpm       = Math.round(60000 / avgIntervalMs);
  const targetBpm = Math.round(60000 / expectedIntervalMs);

  const regularity = _clamp01(1 - Math.abs(avgIntervalMs - expectedIntervalMs) / expectedIntervalMs);

  const variance = intervals.length > 1
    ? _mean(intervals.map(v => (v - avgIntervalMs) ** 2))
    : 0;
  const cov = avgIntervalMs > 0 ? Math.sqrt(variance) / avgIntervalMs : 0;
  const steadiness = _clamp01(1 - cov);

  const latencyScore = typeof stats.latencyAvgMs === 'number'
    ? _clamp01(1 - stats.latencyAvgMs / BPM_LATENCY_CEILING_MS)
    : 0.5; // unknown — neutral, not falsely perfect and not falsely failing
  const missedScore = typeof stats.missed === 'number'
    ? _clamp01(1 - stats.missed * BPM_MISSED_PENALTY_PER)
    : 0.5;

  const healthScore = Math.round(100 * _clamp01(
    BPM_WEIGHT.regularity * regularity +
    BPM_WEIGHT.steadiness * steadiness +
    BPM_WEIGHT.latency    * latencyScore +
    BPM_WEIGHT.missed     * missedScore
  ));

  return {
    bpm, targetBpm, healthScore,
    components: { regularity: +regularity.toFixed(3), steadiness: +steadiness.toFixed(3),
                   latencyScore: +latencyScore.toFixed(3), missedScore: +missedScore.toFixed(3) },
  };
}

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
//
// §SPLIT 2026-09-20 — James: "whatever system generates it, it is in charge
// of holding it." Previously ONE createCFRLedger instance lived at
// data/ledger/ and every event crossing the bus — regardless of which of
// the 15 real systems actually emitted it — was written into that single
// shared event_log.jsonl/cfr_state.json/event_stats.json. That's the pile-up:
// not an abnormal write rate (measured ~0.04 events/sec average, ~1 pulse
// per system per 5min — sane), but one un-rotated global sink nothing ever
// split. Fixed to match the pattern guardian/server.js already uses
// correctly for its own CFR ledger (data/guardian/ledger/cfr/): one CFR
// ledger instance PER SYSTEM, lazily created on first real write, living at
// data/<system>/ledger/cfr/. Each system's coherence/tension/sigma is now
// computed over only its own events, not a blended global stream.
const _eventLedgers = new Map(); // system -> CFR ledger instance

function _getEventLedger(system) {
  if (!createCFRLedger) return null;
  if (_eventLedgers.has(system)) return _eventLedgers.get(system);
  const dir = path.join(ROOT, 'data', system, 'ledger', 'cfr');
  let ledger = null;
  try {
    ledger = createCFRLedger({
      ledgerDir: dir,
      systemId: system,
      onGap: (gap) => {
        // §CFR-WIRE-02: mirror cortex/boot.js's gap routing — tension signals
        // are field observations, not actionable gaps, so they're dropped
        // here rather than ever reaching a queue that nothing will drain.
        try {
          const SIGNAL_TYPES = new Set(['DELTA.TENSION','delta.tension','tension','cfr.tension']);
          if (SIGNAL_TYPES.has(gap.type)) return;
          console.warn(`[orchestrator][cfr:${system}] ${gap.type}: ${gap.message}`);
        } catch(_) {}
      },
    });
    ledger.open();
    ledger.startAutoSave(60000);
  } catch (e) {
    console.warn(`[orchestrator] cfr ledger init failed for system=${system}:`, e.message);
    return null;
  }
  _eventLedgers.set(system, ledger);
  return ledger;
}

// Backward-compat alias — orchestrator's OWN ledger instance, for the debug/
// admin surfaces below (handleCFRRoute, getAllBaselines, getAllStats,
// scanInvariants) that were already scoped to systemId:'orchestrator' before
// this split and don't need to change: they report on orchestrator itself,
// not on the whole ecosystem.
const _eventLedger = _getEventLedger('orchestrator');

// §BUILT 2026-09-20 — James: "make pulse emission an event, use negative
// space for when an event is missed a number of times." orchestrator.pulse
// was already a real event (bus + ledger + SSE, see the heartbeat handler
// below) — what didn't exist was anything noticing its ABSENCE. Same shape
// as guardian/lib/dispatcher.js's _armCompletionWatch: a timer re-armed on
// every real beat; if it fires, that's one missed interval, not yet an
// alert (jitter, a briefly slow system, is not a fault). Only after
// PULSE_MISS_THRESHOLD consecutive misses — the system never came back to
// clear the count — is this real, worth-alerting negative space, not noise.
const PULSE_MISS_THRESHOLD = 3;
const _pulseWatch = new Map(); // systemId -> { timer, missed }

function _armPulseWatch(systemId, intervalMs) {
  const prior = _pulseWatch.get(systemId);
  if (prior) clearTimeout(prior.timer);
  // §GRACE — 1.5x the system's own declared interval, not the raw interval:
  // one real beat arriving a bit late (GC pause, event-loop backlog) is not
  // a miss. Floored at 5s so a system declaring an unrealistically small
  // intervalMs can't make this fire on ordinary network jitter.
  const grace = Math.max(intervalMs || 10000, 5000) * 1.5;
  const state = prior || { missed: 0, timer: null };
  state.missed = 0; // a real beat just arrived — negative space resets
  const _tick = () => {
    state.missed += 1;
    if (state.missed >= PULSE_MISS_THRESHOLD) {
      const entry = SYSTEM_REGISTRY.get(systemId) || {};
      SYSTEM_REGISTRY.set(systemId, { ...entry, pulseMissed: state.missed });
      const payload = {
        systemId, missed: state.missed, expectedIntervalMs: intervalMs || 10000,
        lastSeen: entry.lastSeen || null, sinceLastSeenMs: entry.lastSeen ? Date.now() - entry.lastSeen : null,
      };
      console.warn(`[orchestrator][pulse] '${systemId}' missed ${state.missed} consecutive pulses (expected every ${intervalMs || 10000}ms) — negative space: the event never arrived, not a probe failure`);
      if (nexusBus) { try { nexusBus.emit('pulse.missed', payload, { source: systemId }); } catch(_) {} }
      // Recorded to the MISSING system's own ledger (not orchestrator's) —
      // this is a fact about that system, same routing rule as every other
      // real event since the per-system ledger split.
      const ledger = _getEventLedger(systemId);
      if (ledger) { try { ledger.record('pulse.missed', payload, { source: systemId, causedBy: null }); } catch(_) {} }
      broadcast(JSON.stringify({ type: 'pulse.missed', ...payload, ts: Date.now() }));
      // Keeps watching at the same grace interval — does not stop after
      // one alert; a system that stays dead should not go quiet again
      // just because it was already reported once. Recovery (a real beat)
      // is what clears this, via the reset at the top of this function.
    }
    state.timer = setTimeout(_tick, grace);
  };
  state.timer = setTimeout(_tick, grace);
  _pulseWatch.set(systemId, state);
}

// In-memory ring (fast reads)
// §FIX 2026-09-16 — 'clear-glass' added. Real, pre-existing gap: this dict
// gates POST /api/ledger's system field (`system in LEDGER ? system :
// 'orchestrator'` below) — clear-glass/src/main/index.js's own
// _postEvent()/_registerWithNexus() have posted `system: 'clear-glass'`
// here since before this checkout, and every one of those writes was
// silently rebucketed under 'orchestrator' instead, losing which system
// actually emitted it. Same gate now also carries the new real DOM-
// mutation and artifact-download ledger traffic (clear-glass/src/dom/
// archaeology.js, clear-glass/src/providers/download-capture.js).
const LEDGER = { orchestrator:[], cortex:[], guardian:[], idearium:[], emerge:[], 'clear-glass':[] };

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
  // §SPLIT 2026-09-20 — routed to the emitting system's OWN ledger instance,
  // not the shared orchestrator one. `system` here is already the true
  // resolved origin (every real call site passes it explicitly).
  const ledger = _getEventLedger(system);
  if (ledger) {
    // §CAUSAL HYGIENE (ported from v44 2026-07-30) — a causedBy equal to the
    // emitting system's own name is NOT a causal edge; it's a self-loop
    // (status/heartbeat pings like guardian.ncp.status with causedBy:'guardian')
    // that pollutes the causal graph. A heartbeat has no cause. Null is honest.
    // One guard at the choke point covers all systems (§1.2 — never a false edge).
    const rawCause = payload.causedBy || null;
    const causedBy = (rawCause === system) ? null : rawCause;
    ledger.record(type, payload, { source: system, causedBy });
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

// §FIXED 2026-08-17 — found while adding a new call, not assumed correct
// from the existing pattern: this function only ever accepted ONE
// argument (a pre-stringified JSON string, the majority real pattern in
// this file). But 6 REAL, PRE-EXISTING call sites already called it as
// broadcast(type, payload) — system.contract.verified (x2),
// spec.compile.complete, orchestrator.auth.hotswapped/hotswap_failed, and
// the broadcastSSE wrappers used by peer-relay pruning. Every one of
// those has been silently broadcasting the bare event-name STRING with
// zero payload, this whole time — any real UI listening for a payload on
// those events has never received one. Real, severe, found by accident
// while wiring co-pilot's own new announcement, not a bug I introduced.
// Fixed generically: accepts EITHER calling convention correctly, rather
// than rewrite 6+ scattered call sites and risk missing one.
function broadcast(data, payload) {
  const msg = payload !== undefined ? `data: ${JSON.stringify({ type: data, ...payload })}\n\n` : `data: ${data}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch(_) { sseClients.delete(res); }
  }
}

function connectBridgeRelay() {
  // ORC-05: prevent double-connect and clear any pending retry timer first

  const r = http.request({
    hostname:'127.0.0.1', port:9999,
    path: '/bridge/sse',  // §AXIOM fix: relay bridge SSE events into orchestrator broadcast
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
  _startSubscriptionPublisher();
}

// §B1 2026-07-24 — publish orchestrator's own bus subscriptions to the shared
// store (lib/bus-subscriptions.js), so the cross-process consumer graph
// includes them. Orchestrator is a heavy subscriber — sigma-writer,
// request-handler and the CFR influence poller all wire listeners here — and
// every one of them was invisible to any other process's consumer-registry
// before this.
//
// Shares startWatchdog's timing deliberately: both run after the server has
// bound, which is after this process's listeners are wired. Publishing earlier
// would snapshot an empty bus and record orchestrator as consuming nothing.
function _startSubscriptionPublisher() {
  try {
    if (!nexusBus) { console.warn('[orc] §B1 subscription publisher skipped — no nexus-bus in this process'); return; }
    const { jaaDB } = require('../cortex/memory/jaa-db');
    require('../lib/bus-subscriptions').publishPeriodically({
      systemId: 'orchestrator', bus: nexusBus, jaa: jaaDB, intervalMs: 10000,
    });
    console.log('[orc] bus subscriptions publishing to the shared store (§B1)');
  } catch (e) {
    // Observability must never be the reason orchestrator fails to start.
    console.error(`[orc] §B1 subscription publisher failed to start: ${e.message}`);
  }
}

// ── Serve control panel ──────────────────────────────────────────────────────
// Control panel accessible at :9000/ui/control-panel/
// comp_id: nexus.ui.control-panel / orchestrator.js

// ── Contract poller — meta-system watches all system input/output folders ────────
// comp_id: nexus.lib.contract-poller / lib/contract-poller.js
try {
  const contractPoller = require('./lib/contract-poller');
  contractPoller.start();
  console.log('[orchestrator] contract-poller started');
} catch(e) { console.warn('[orchestrator] contract-poller not available:', e.message); }

// ── UI hotswap watcher ────────────────────────────────────────────────────────
const UI_SYSTEMS = ['cortex','guardian','idearium','emerge','orchestrator'];
// System-local ui/ dirs (guardian/ui/, cortex/ui/, etc.) — also watched
// These are the canonical sources. Edit files here → hotswap fires.
// Run `npm run sync-ui` to mirror them to root ui/<system>/ for orchestrator serving.
const SYSTEM_LOCAL_UI_DIRS = [
  // guardian UI absorbed into main nexus UI — no separate guardian/ui
  { system:'cortex',       dir: path.join(ROOT,'cortex','ui') },
  { system:'idearium',     dir: path.join(ROOT,'idearium','ui') },
  { system:'nexus',        dir: path.join(ROOT,'ui') },
  { system:'emerge',       dir: path.join(ROOT,'ui') },        // emerge IDE ui lives at root ui/
  { system:'orchestrator', dir: path.join(ROOT,'ui','orchestrator') },
  { system:'explorer',     dir: path.join(ROOT,'ui') },  // contract-explorer + contract-renderer
  { system:'diagnostic',   dir: path.join(ROOT,'ui','diagnostics') },  // §HOTSWAP-03
  // §BUGFIX 2026-07-02: was 'ui','diagnostic' (singular) — that folder is
  // empty. The real diagnostic UI, with a real index.html, lives at
  // ui/diagnostics (plural). GET /ui/diagnostic was serving nothing.
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

  // ── Root UI — TV-shell is the homepage (explicit, repeated request —
  // diagnostics and the ALK-GL/spotlight/channel-switching home were both
  // tried here before and both were wrong per that same repeated ask).
  // Diagnostics and home both stay fully reachable at /ui/diagnostics and
  // /ui/home, and as fallbacks below if tv-shell is ever missing. ────────
  if (M==='GET' && (u.pathname==='/' || u.pathname==='/home')) {
    const tvPath = path.join(UI_ROOT,'tv-shell','index.html');
    if (fs.existsSync(tvPath)) return serveFile(res, tvPath);
    const diagPath = path.join(UI_ROOT,'diagnostics','index.html');
    if (fs.existsSync(diagPath)) return serveFile(res, diagPath);
    const homePath = path.join(UI_ROOT,'home','index.html');
    if (fs.existsSync(homePath)) return serveFile(res, homePath);
    // fallback to orchestrator UI while everything else is being built
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
  // §ROUTER-FIX-2026-06-20: fs.existsSync() is true for directories as well
  // as files — a request for a directory path (e.g. /ui/agents/chatgpt, a
  // real dir with no filename) was passing that check, then serveFile()
  // tried fs.readFile() on a directory (EISDIR) and silently 404'd instead
  // of falling through to that directory's index.html. Flat files with an
  // extension (e.g. /ui/forge-shell.html) had the opposite problem — sub
  // alone *is* the target, but the old code always treated sub as a
  // directory and looked for 'index.html' underneath it. Check what's
  // actually at each candidate path by type, not by assuming the shape.
  if (M==='GET' && top==='ui' && sub) {
    // §BUG FIXED 2026-07-11 — idearium's real UI directory is
    // nexus/idearium/ui/, a sibling of UI_ROOT (nexus/ui/), not nested
    // under it. Every other system's full-tab UI lives inside UI_ROOT,
    // so the generic lookup below works for them; idearium's never has,
    // and /ui/idearium has 404'd with "UI not found: idearium" since
    // whenever the tv-shell's full-idearium-tab iframe (ch-idr-full) was
    // built to point at it. tests/integration.test.js already asserts
    // `GET /ui/idearium → serves idearium UI HTML, status 200` — this
    // was a documented requirement failing silently, not a new one.
    if (sub === 'idearium') {
      // §TRAILING-SLASH FIX 2026-07-15 — a request for the exact URL
      // /ui/idearium (no trailing slash, no rest path) served index.html
      // directly AT that URL. The browser has no way to know /ui/idearium
      // is a directory — it treats the URL's last segment as the current
      // "file," so index.html's own relative <script src="js/app.js">
      // resolves against /ui/ (stripping 'idearium'), requesting
      // /ui/js/app.js — 404, app.js never loads, every onclick handler
      // that calls a function app.js defines throws ReferenceError. This
      // is exactly what showed up live: "Loading failed for the <script>
      // with source .../ui/js/app.js" plus "openModal is not defined" —
      // not two bugs, one bug with two symptoms. Standard fix, same as
      // any static file server: redirect to the trailing-slash URL first,
      // so the browser's relative-URL base is actually the directory.
      if (!rest && !u.pathname.endsWith('/')) {
        res.writeHead(302, { Location: `${u.pathname}/` });
        return res.end();
      }
      const ideariumSubPath = rest || 'index.html';
      const ideariumDirect = _safePath(path.join(ROOT, 'idearium', 'ui'), ideariumSubPath);
      if (!ideariumDirect) return json(res, 403, { ok:false, error:'forbidden path' });
      if (fs.existsSync(ideariumDirect) && fs.statSync(ideariumDirect).isFile()) {
        return serveFile(res, ideariumDirect);
      }
      return json(res, 404, { ok:false, error:`idearium UI not found: ${ideariumSubPath} (looked in nexus/idearium/ui/)` });
    }

    const subPath = rest ? path.join(sub, rest) : sub;
    const direct = _safePath(UI_ROOT, subPath);
    if (!direct) return json(res, 403, { ok:false, error:'forbidden path' });

    if (fs.existsSync(direct)) {
      const st = fs.statSync(direct);
      if (st.isFile()) return serveFile(res, direct);
      if (st.isDirectory()) {
        // §TRAILING-SLASH FIX 2026-07-15 — same bug, same fix, for every
        // other system UI this generic path serves (not just idearium's
        // special-cased branch above). A directory hit with no trailing
        // slash on the request URL needs a redirect before its index.html
        // relative asset paths can resolve correctly.
        if (!u.pathname.endsWith('/')) {
          res.writeHead(302, { Location: `${u.pathname}/` });
          return res.end();
        }
        const idx = _safePath(UI_ROOT, path.join(subPath, 'index.html'));
        if (idx && fs.existsSync(idx)) return serveFile(res, idx);
      }
    }
    return json(res, 404, { ok:false, error:`UI not found: ${sub}${rest?'/'+rest:''}` });
  }

  // ── SSE unified ──────────────────────────────────────────────────────────
if (M==='GET' && u.pathname==='/nexus-bus/sse') {
    if (nexusBus) { nexusBus.handleSSE(req,res); return; }
    res.writeHead(503); return res.end('nexus-bus not loaded');
  }
  // ── CFR-Ω routes — orchestrator's own field debugger ────────────────────
  // §CFR-WIRE-03: same handleCFRRoute() contract as cortex/guardian/bridge.
  if (u.pathname.startsWith('/cfr')) {
    if (_eventLedger && _eventLedger.handleCFRRoute && _eventLedger.handleCFRRoute(req, res, u)) return;
  }
  if (M==='POST' && u.pathname==='/api/nexus/query') {
    if (!nexusQuery) return json(res,503,{ok:false,error:'nexus-query not loaded'});
    try { const b=await readBody(req); const r=await nexusQuery.query(b); return json(res,r.ok?200:500,r); }
    catch(e) { return json(res,500,{ok:false,error:e.message}); }
  }
  if (u.pathname.startsWith('/api/nexus/knowledge')) {
    if (!nexusKnowledge) return json(res,503,{ok:false,error:'not loaded'});
    const kseg=u.pathname.split('/').filter(Boolean),kact=kseg[3];
    if (M==='GET'&&!kact) return json(res,200,{ok:true,stats:nexusKnowledge.stats(),facts:nexusKnowledge.recall({n:parseInt(u.searchParams?.get('n')||50)})});
    if (M==='POST'&&kact==='learn'){const b=await readBody(req);return json(res,201,{ok:true,fact:nexusKnowledge.learn(b)});}
    if (M==='GET'&&kact==='recall'){const q={type:u.searchParams?.get('type'),subject:u.searchParams?.get('subject'),tag:u.searchParams?.get('tag'),n:parseInt(u.searchParams?.get('n')||50)};return json(res,200,{ok:true,facts:nexusKnowledge.recall(q)});}
  }
  if (M==='GET'&&u.pathname==='/api/nexus/cfr') {
    if (!nexusCFR) return json(res,503,{ok:false,error:'not loaded'});
    return json(res,200,{ok:true,...nexusCFR.getState(),thresholds:nexusCFR.THRESHOLDS});
  }
  if (M==='POST'&&u.pathname==='/api/nexus/heal') {
    if (!nexusHealLoop) return json(res,503,{ok:false,error:'not loaded'});
    return nexusHealLoop.healLoopHandler(req,res);
  }
  if (M==='GET'&&u.pathname==='/api/nexus/bus') {
    if (!nexusBus) return json(res,503,{ok:false,error:'not loaded'});
    return json(res,200,{ok:true,...nexusBus.stats(),recent:nexusBus.history(20)});
  }
  // ── Mutation Contract (seam-component-registry-spec.md §9.5) ────────────
  // Separate route, separate module — PUT /api/components/:id above remains
  // the path for full record updates; this is specifically the
  // comp_properties-only door with audit-first ordering and forbidden-
  // target enforcement. Not folded into the PUT handler — different
  // contract, different failure semantics, conflating them would blur the
  // exact boundary §9.5 exists to draw.
  if (u.pathname.startsWith('/api/components/') && u.pathname.endsWith('/properties') && M === 'PATCH') {
    const cseg = u.pathname.split('/').filter(Boolean); // ['api','components', id, 'properties']
    const compId = cseg[2];
    let mutationContract;
    try { mutationContract = require('./lib/mutation-contract'); }
    catch(e) { return json(res,503,{ok:false,error:'mutation-contract not loaded: '+e.message}); }
    const body = await readBody(req);
    if (!body || !body.field) return json(res,400,{ok:false,error:'body.field is required, e.g. "comp_properties.style.color"'});
    const result = mutationContract.mutateProperty(compId, body.field, body.value, { issuedVia: body.issuedVia || 'api' });
    return json(res, result.ok ? 200 : 400, result);
  }
  if (u.pathname.startsWith('/api/notes')) {
    let quickNotes;
    try { quickNotes = require('./lib/quick-notes'); }
    catch(e) { return json(res,503,{ok:false,error:'quick-notes not loaded: '+e.message}); }
    const nseg = u.pathname.split('/').filter(Boolean); // ['api','notes', uuid?]
    const nuuid = nseg[2];
    if (M==='GET' && !nuuid)    return json(res,200,{ ok:true, notes: quickNotes.listNotes() });
    if (M==='POST' && !nuuid) {
      const body = await readBody(req);
      const result = await quickNotes.createNote(body || {});
      return json(res, result.ok ? 200 : 400, result);
    }
    if (M==='DELETE' && nuuid) {
      const result = await quickNotes.deleteNote(nuuid);
      return json(res, result.ok ? 200 : 404, result);
    }
    return json(res,404,{ok:false,error:`notes route not found: ${M} ${u.pathname}`});
  }
  // ── Component Registry (Phase 63b) ────────────────────────────────────────
  // lib/component-registry.js exports handleRequest specifically to be
  // mounted here ("Mounted on orchestrator. All routes under /api/components."
  // — its own doc comment) but nothing ever called it. require() returns the
  // same module-cache singleton compReg.init() already initialized at boot
  // (see "Component Registry + UI Registry init" above) — this does not
  // create a second instance.
  if (u.pathname.startsWith('/api/components')) {
    let compReg;
    try { compReg = require('../lib/component-registry'); }
    catch(e) { return json(res,503,{ok:false,error:'component-registry not loaded: '+e.message}); }
    const cseg = u.pathname.split('/').filter(Boolean); // ['api','components', sub?, rest?]
    const csub = cseg[2], crest = cseg[3];
    const cbody = (M==='POST'||M==='PUT') ? await readBody(req) : null;
    const result = compReg.handleRequest(M, csub, crest, cbody, u.searchParams);
    return json(res, result._status || (result.ok===false ? 400 : 200), result);
  }
  // §Phase B 2026-07-20 — capability-registry (copilot-expansion.spec phase 3).
  // Co-pilot's emergent tool surface: a LIVE projection of component-registry
  // (not a static list), so anything module-builder registers is immediately a
  // usable tool. clear-glass/src/copilot/bridge.js fetches /prompt over HTTP and
  // falls back to its static tools.js only if this is unreachable.
  if (u.pathname === '/api/capabilities' || u.pathname === '/api/capabilities/prompt' || u.pathname === '/api/capabilities/resolve') {
    let compReg, capReg;
    try {
      compReg = require('../lib/component-registry');
      capReg  = require('../lib/capability-registry');
      capReg.init(compReg);
    } catch(e) { return json(res,503,{ok:false,error:'capability-registry not loaded: '+e.message}); }
    if (u.pathname === '/api/capabilities/prompt') {
      const fixed = (() => { try { return require('../clear-glass/src/copilot/tools').TOOLS; } catch { return []; } })();
      res.writeHead(200, { 'Content-Type':'text/plain' });
      return res.end(capReg.buildToolsPrompt(fixed));
    }
    if (u.pathname === '/api/capabilities/resolve') {
      return json(res, 200, capReg.resolve(u.searchParams.get('q') || ''));
    }
    return json(res, 200, { ok:true, capabilities: capReg.capabilities(), health: capReg.health() });
  }
    if (M==='GET' && u.pathname==='/sse') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache',
      'Connection':'keep-alive', 'Access-Control-Allow-Origin':'*' });
    res.write(`data: ${JSON.stringify({ type:'orchestrator.connected', ts:Date.now() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // ── /api/state — NEXUS_STATE persistence ─────────────────────────────────
  if (u.pathname === '/api/state' && M === 'GET') {
    try {
      const statePath = path.join(ROOT, 'data', 'NEXUS_STATE.json');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return json(res, 200, { ok:true, state });
    } catch(_) { return json(res, 200, { ok:true, state:null }); }
  }
  if (u.pathname === '/api/state/save' && M === 'POST') {
    try {
      const body = await readBody(req);
      const statePath = path.join(ROOT, 'data', 'NEXUS_STATE.json');
      fs.mkdirSync(path.dirname(statePath), { recursive:true });
      fs.writeFileSync(statePath, JSON.stringify({ ...body, savedAt:Date.now() }, null, 2));
      return json(res, 200, { ok:true });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }

  // §OFFICIATOR TOOL SURFACE 2026-09-02 — James: "agent tool for
  // analysis, intuition, mastermind, synthesis... co-pilot should have
  // all those tools, same with guardian agents." cortex/core/raid/
  // officiator.js runs in THIS process (started right above, same file,
  // §OFFICIATOR block) — a real HTTP route here is the sovereign-
  // transport door a new agent tool (running in guardian's or copilot's
  // own process) needs to reach it, matching every other cross-process
  // capability in this codebase.
  if (u.pathname === '/api/officiator/synthesize' && M === 'POST') {
    try {
      const officiator = require('../cortex/core/raid/officiator.js');
      const body = await readBody(req);
      if (!body || typeof body.context !== 'string' || !body.context.trim()) {
        return json(res, 400, { ok: false, error: 'context is required — a real, non-empty string' });
      }
      const result = await officiator.synthesizeFromContext(body.context, {
        forAgent: body.forAgent || undefined,
        dispatchTo: body.dispatchTo || undefined,
        // §MERGED 2026-09-02 — a parallel session's real synthesizeFromContext()
        // separates preview from submission (submit:true/false); this route
        // now passes it through instead of always submitting.
        submit: !!body.submit,
      });
      return json(res, result.ok ? 200 : 502, result);
    } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }

  // ── /api/contract — Unified Interaction Contract ──────────────────────────
  if (u.pathname === '/api/contract' && M === 'GET') {    try {
      const { getVersionedContract } = require('../contracts/nexus-interaction-contract');
      const version = u.searchParams?.get('version') || null;
      const contract = getVersionedContract(version);
      if (!contract) return json(res, 404, { ok:false, error:`contract version not found: ${version}` });
      return json(res, 200, { ok:true, contract });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }
  if (u.pathname.startsWith('/api/contract/') && M === 'GET') {
    try {
      const { getVersionedContract } = require('../contracts/nexus-interaction-contract');
      const seg = u.pathname.split('/');
      const system = seg[3];
      if (system === 'snapshots') {
        const { listSnapshots } = require('../contracts/nexus-interaction-contract');
        return json(res, 200, { ok:true, snapshots: listSnapshots() });
      }
      const contract = getVersionedContract();
      const sysCont = contract?.systems?.[system];
      if (!sysCont) return json(res, 404, { ok:false, error:`unknown system: ${system}` });
      return json(res, 200, { ok:true, contract:sysCont, schemaHash:contract.schemaHash });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }
  if (u.pathname === '/api/contract/validate' && M === 'POST') {
    try {
      const { validateRequestAt, getVersionedContract } = require('../contracts/nexus-interaction-contract');
      const body = await readBody(req);
      // Use snapshot-bound validation — deterministic
      const current = getVersionedContract();
      const hash = body.snapshotHash || current.schemaHash;
      const result = validateRequestAt(hash, body.system, body.method, body.path, body.body || {});
      return json(res, 200, { ok:true, result });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
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

  // §BUGFIX 2026-09-25 — James: "doesn't look any different" (a black
  // screen at the real root URL, after 0.39.229 finally pointed Clear
  // Glass's default window here). Root cause, confirmed with a live
  // server, not guessed: the root '/' route above serves ui/tv-shell/
  // index.html's CONTENT directly at the URL '/', but that file's own
  // asset tags are authored relative — <script src="./warp-ui/...">,
  // src="../lib/api.js", href="./spotlight/spotlight.css", href="../
  // themes/nexus-dark.css" — and a browser resolves '.'/'..' against the
  // DOCUMENT's URL, not the file's real location on disk. Served at '/',
  // every one of those resolves to a bare top-level path
  // (/warp-ui/warp-browser.js, /lib/api.js, /spotlight/spotlight.css,
  // /themes/nexus-dark.css) that hit the blanket `if (top !== 'api')` gate
  // right below this comment and 404'd silently, every time, for every
  // person who has ever loaded this page directly at '/'. Only the page's
  // inline <script> blocks ran (the dark background + faint canvas dots
  // in James's screenshot); warp-browser.js/nexus-shell.js/spotlight.js/
  // nerve.js — the scripts that build the actual visible UI — never
  // loaded. Same bug class already named and fixed for idearium elsewhere
  // in this file (§TRAILING-SLASH FIX 2026-07-15), but idearium's fix
  // (redirect into a directory URL) doesn't apply here — tv-shell is
  // deliberately served AT '/', by explicit prior decision (see the root-
  // route comment above), not at a nested path it could redirect into.
  // FIRST FIX ATTEMPT, WRONG PLACEMENT: initially added a static fallback
  // right before this file's OWN final 404 (near EOF) — verified dead on
  // a live server: this exact `top !== 'api'` gate, being earlier in the
  // same function, always fires first and returns before that code could
  // ever run. Moved here, above the gate, and re-verified live.
  //
  // Fix: a real, guarded static fallback — tried only for a GET that
  // nothing above already matched, right before the /api/*-only gate
  // would otherwise kill it. tv-shell's '../x' refs land one level above
  // UI_ROOT/tv-shell (i.e. at UI_ROOT itself — lib/, themes/); its './x'
  // refs land inside UI_ROOT/tv-shell itself (warp-ui/, spotlight/,
  // nerve/, tv-shell.css) — both checked, in that order, against real
  // files on disk via the same _safePath traversal guard every other
  // static route in this file already uses. Nothing invented: every path
  // this can serve is a real, existing file found directly, never a
  // naming guess — a genuinely bogus path still falls through to the
  // ordinary 404 below, unchanged.
  if (M === 'GET') {
    const relPath = u.pathname.slice(1);
    const uiRootCandidate = _safePath(UI_ROOT, relPath);
    if (uiRootCandidate && fs.existsSync(uiRootCandidate) && fs.statSync(uiRootCandidate).isFile()) {
      return serveFile(res, uiRootCandidate);
    }
    const tvShellCandidate = _safePath(path.join(UI_ROOT, 'tv-shell'), relPath);
    if (tvShellCandidate && fs.existsSync(tvShellCandidate) && fs.statSync(tvShellCandidate).isFile()) {
      return serveFile(res, tvShellCandidate);
    }
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
      systems: Object.fromEntries(systems.map(s=>{
        const reg = SYSTEM_REGISTRY.get(s.id);
        return [s.id,{
          online:s.online, ms:s.ms, label:s.sys.label,
          port:s.sys.port, color:s.sys.color, data:s.d,
          bpm: reg?.bpm ?? null, targetBpm: reg?.targetBpm ?? null,
          healthScore: reg?.healthScore ?? null,
        }];
      })),
    });
  }

  if (M==='GET' && sub==='channels')  return json(res, 200, { ok:true, channels:CHANNELS });

  // §GAP CLOSED 2026-07-06 — lib/nerve/index.js's _pollBus() has been
  // polling /api/bus/stats since Nerve was built, 404ing silently the
  // whole time ("keep stale sources rather than null them") — this route
  // never existed. The write side (heartbeat -> nexusBus.emit) is merged
  // into the real, pre-existing heartbeat handler further down in this
  // file (search "Heartbeat from any system") rather than living here as
  // a separate route — an earlier pass at this fix added a second,
  // duplicate /api/heartbeat handler at this exact point in the file,
  // which silently shadowed that real handler (SYSTEM_REGISTRY + SSE
  // broadcast + health snapshot) ever since, since routes return on
  // first match and this one came first. Caught and corrected before
  // building anything further on top of it — removed the duplicate,
  // merged the one real line it added into the actual handler instead.
  // §WARP SPINE — GET /api/warp/map. The map projected from what actually
  // ran (StreamLog), not from a document. A capability held only in memory
  // is the same orphan as an undeclared route; this makes it callable, and
  // it is declared in the hooks registry.
  // §ORPHAN WIRED 2026-07-09 — lib/system-manifest.js ("One System → One
  // Manifest") had ZERO consumers. It projects components + hooks + wires +
  // APIs + CLI phrases per system from data that already exists, which is
  // exactly "the system is mapped as it's built". It was also broken:
  // buildAllManifests() threw because it required an undocumented argument.
  // Fixed and given a door.
  // §PERF 2026-07-10 — resource telemetry, queryable. The 0xC0000409 crash was
  // the FIRST symptom of memory pressure because nothing exposed the pressure
  // before it became fatal. GET /api/perf returns a real sample + trend; the
  // supervisor uses the same classifier to gate spawns.
  if (M==='GET' && sub==='perf') {
    if (!global._resourceMonitor) return json(res, 503, { ok:false, error:'resource monitor not started' });
    return json(res, 200, { ok:true, ...global._resourceMonitor.report() });
  }

  if (M==='GET' && sub==='manifest') {
    try {
      const { buildManifest, buildAllManifests } = require('../lib/system-manifest');
      const which = seg[2];
      if (which) return json(res, 200, { ok:true, manifest: buildManifest(which) });
      return json(res, 200, { ok:true, manifests: buildAllManifests() });
    } catch (e) {
      return json(res, 500, { ok:false, error: e.message });
    }
  }

  if (M==='GET' && sub==='warp' && seg[2]==='map') {
    if (!global._warpSpine) return json(res, 503, { ok:false, error:'warp spine not attached' });
    return json(res, 200, { ok:true, ...global._warpSpine.map() });
  }

  if (M==='GET' && sub==='bus' && seg[2]==='stats') {
    if (!nexusBus) return json(res, 503, { ok:false, error:'nexus-bus not available' });
    return json(res, 200, { ok:true, ...nexusBus.stats() });
  }

  // ── §AXIOM: System registration — all systems call this on boot ───────────
  // Flow: system boots → bus connects → kernel starts → registers here
  if (M==='POST' && sub==='register') {
    const body = await readBody(req);
    const { systemId, port, meta = {} } = body;
    if (!systemId) return json(res, 400, { ok:false, error:'systemId required' });
    registryUpdate(systemId, { port, meta, registeredAt: Date.now() });

    // §ADDED 2026-08-17 — James: "i need co-pilot to be announced in the
    // sse for autopilot." Checked first: this handler already broadcasts
    // system.contract.verified, but only 2s later (contract verification
    // is deliberately delayed to let the system finish binding), and only
    // reports trust state, not "a real system just registered." Generic —
    // every system that hits this real route gets this, not co-pilot
    // specifically hardcoded, since the same real gap applies to any
    // system registering, not just this one.
    broadcast('system.registered', { systemId, port, meta, ts: Date.now() });

    // Component registry — auto-register system components (CR-007)
    // §FIX: this previously referenced an undefined '_bus' variable, which
    // threw on every single call (caught + warned, never actually
    // registering anything) — the registry has been stuck at 0 components
    // since CR-007 was built, regardless of what any system sent. The third
    // arg isn't even used internally by onSystemRegister (component-registry
    // emits via its own module-level _bus set during its own init()), so
    // there's nothing to pass here.
    if (Array.isArray(body.components) && body.components.length) {
      try {
        const reg = require('../lib/component-registry');
        reg.onSystemRegister(systemId, body.components);
      } catch(e) {
        console.warn('[component-registry] auto-register failed:', e.message);
      }
    }

    // §1.1 Contract verification — fetch and verify the system's interaction contract
    // Non-blocking: registration succeeds regardless, but trust state is set
    // Skip self-verification: orchestrator knows its own contract without HTTP round-trip
    if (systemId === 'orchestrator') {
      try {
        const hs = require('./lib/contract-handshake');
        const { getVersionedContract } = require('../contracts/nexus-interaction-contract');
        const full = getVersionedContract();
        const orchContract = full?.systems?.orchestrator || full;
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256')
          .update(JSON.stringify(orchContract)).digest('hex').slice(0,16);
        registryUpdate('orchestrator', { contractTrust: 'VERIFIED', contractHash: hash, contractVerifiedAt: Date.now() });
        broadcast('system.contract.verified', { systemId: 'orchestrator', trust: 'VERIFIED', hash, routeCount: (orchContract.routes||[]).length });
        console.log('[orch] contract.verified — orchestrator (' + (orchContract.routes||[]).length + ' routes, hash:' + hash.slice(0,8) + ')');
      } catch(e) { console.warn('[orch] self-contract failed:', e.message); }
    } else
    // Delay contract verification by 2s — system just registered but may not
    // have finished binding its HTTP server yet (especially on Windows)
    setTimeout(async () => {
      try {
        const hs = require('./lib/contract-handshake');
        const entry = await hs.verifySystem(systemId, '127.0.0.1', port, {
          jaaInsert: null, // cortex not guaranteed up during early boot
          onResult: (e) => {
            registryUpdate(systemId, { contractTrust: e.trust, contractHash: e.hash, contractVerifiedAt: e.checkedAt });
            const routeStr = e.routeCount !== undefined ? e.routeCount + ' routes' : e.error || 'unreachable';
            const hashStr  = e.hash ? e.hash.slice(0,8) : '—';
            console.log('[orch] contract.' + e.trust.toLowerCase() + ' — ' + systemId + ' (' + routeStr + ', hash:' + hashStr + ')');
            // Broadcast trust state over SSE so UIs can show it
            broadcast('system.contract.verified', { systemId, trust: e.trust, hash: e.hash, routeCount: e.routeCount });
          },
        });
      } catch(e) {
        console.warn('[orch] contract verify failed for ' + systemId + ': ' + e.message);
      }
    }, 2000); // 2s delay — system needs time to finish binding

    return json(res, 200, {
      ok: true, systemId, ts: Date.now(),
      orchestrator: { port: PORT, version: '2.0.0', uptime: process.uptime() },
      registry: registryAll(),
    });
  }

  // ── Peer relay — cross-orchestrator connection ─────────────────────────────
  // POST /api/peer/announce  — remote orchestrator announces itself
  // GET  /api/peer/list      — all known peers
  // GET  /api/remote/:peerId/* — proxy a request to a remote peer's system
  if (top === 'api' && sub === 'peer') {
    const relay = require('./lib/peer-relay');
    if (M === 'POST' && rest === 'announce') {
      const body = await readBody(req);
      const result = await relay.handleAnnounce(body, {
        broadcastSSE: (type, data) => broadcast(type, data),
      });
      return json(res, result.ok ? 200 : 400, result);
    }
    if (M === 'GET' && rest === 'list') {
      return json(res, 200, { ok: true, peers: relay.getAllPeers() });
    }
    if (M === 'GET' && rest === 'online') {
      return json(res, 200, { ok: true, peers: relay.getOnlinePeers() });
    }
    // Stale peer prune (can be called by health check cron)
    if (M === 'POST' && rest === 'prune') {
      relay.pruneStalePeers({ broadcastSSE: (type, data) => broadcast(type, data) });
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { ok: false, error: 'unknown peer route' });
  }

  // ── Remote proxy — /api/remote/:peerId/* → remote orchestrator ────────────
  if (top === 'api' && sub === 'remote' && rest) {
    const relay  = require('./lib/peer-relay');
    const parts  = u.pathname.split('/').filter(Boolean);
    // parts: ['api', 'remote', ':peerId', ...rest]
    const peerId     = parts[2];
    const remotePath = '/' + parts.slice(3).join('/') + (u.search || '');
    relay.proxyToRemote(peerId, remotePath, req, res);
    return; // relay handles response
  }

  // ── File push — /api/push/* ───────────────────────────────────────────────
  // POST /api/push/file         — push a single file, auto-routed by extension
  // POST /api/push/peer/:peerId — push file to a connected remote peer
  // GET  /api/push/routes       — list all file type routes
  if (top === 'api' && sub === 'push') {
    const filePush = require('./lib/file-push');

    if (M === 'GET' && rest === 'routes') {
      return json(res, 200, { ok: true, routes: filePush.ROUTES });
    }

    if (M === 'POST' && rest === 'file') {
      const body    = await readBody(req);
      const filename= body.filename || 'upload.txt';
      const content = body.content  || '';
      const result  = await filePush.processPush(filename, content, {
        source:     body.source || 'api-push',
        provider:   body.provider || 'ollama',
      });
      return json(res, result.ok ? 200 : 400, result);
    }

    // Push to remote peer
    if (M === 'POST' && rest && rest.startsWith('peer/')) {
      const peerId  = rest.slice(5);
      const body    = await readBody(req);
      const filename= body.filename || 'upload.txt';
      const content = body.content  || '';

      // Push locally first
      const local = await filePush.processPush(filename, content, { source: 'peer-push' });
      // Then push to remote peer
      const remote = await filePush.pushToPeer(peerId, filename, content);

      return json(res, 200, { ok: true, local, remote, peerId });
    }

    return json(res, 404, { ok: false, error: 'unknown push route' });
  }

  // ── Auth layer — /auth/* ──────────────────────────────────────────────────
  // Hotswappable: auth/index.js + auth/policy.json + auth/clients/*.pub
  // All watched by fs.watch — changes take effect within 500ms
  if (top === 'auth') {
    let _auth;
    try { _auth = require('../auth/index'); } catch(e) {
      return json(res, 503, { ok: false, error: 'auth module unavailable: ' + e.message });
    }

    if (M === 'GET' && sub === 'pubkey') return _auth.handlePubkey(req, res);
    if (M === 'GET' && sub === 'challenge') return _auth.handleChallenge(req, res);
    if (M === 'POST' && sub === 'handshake') {
      const body = await readBody(req);
      return _auth.handleHandshake(body, req, res);
    }
    if (M === 'POST' && sub === 'revoke') {
      const body = await readBody(req);
      return _auth.handleRevoke(body, res);
    }
    // Client management (admin only — should be behind local-only guard in prod)
    if (M === 'GET'    && sub === 'clients') return _auth.handleClients(res);
    if (M === 'POST'   && sub === 'clients') {
      const body = await readBody(req);
      return _auth.handleRegisterClient(body, res);
    }
    if (M === 'DELETE' && sub === 'clients' && rest) {
      return _auth.handleRevokeClient(rest, res);
    }
    return json(res, 404, { ok: false, error: 'unknown auth route' });
  }

  // ── Spec compiler — /api/compile/* ──────────────────────────────────────
  // POST /api/compile/spec    — compile a .spec through T0/T1 pipeline
  // GET  /api/compile/status  — check compile availability
  if (top === 'api' && sub === 'compile') {
    if (M === 'GET' && !rest) {
      // Compiler availability check
      let compilerAvailable = false;
      try {
        const p = require('path').join(__dirname, 'emerge', 'compiler', 'pipeline.js');
        require('fs').accessSync(p);
        compilerAvailable = true;
      } catch(_) {}
      return json(res, 200, { ok:true, available: compilerAvailable });
    }

    if (M === 'POST' && (rest === 'spec' || !rest)) {
      const body = await readBody(req);
      const { content, filename = 'input.spec', ideaUuid } = body;
      if (!content) return json(res, 400, { ok:false, error:'content required' });

      try {
        // Write spec to a temp file and run through spec-compiler pipeline
        const fs   = require('fs');
        const path = require('path');
        const { execSync } = require('child_process');

        const tmpDir  = path.join(__dirname, 'data', 'compile-tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, filename.replace(/[^a-z0-9._-]/gi,'_'));
        fs.writeFileSync(tmpFile, content);

        // Try spec-compiler CLI
        const compilerCli = path.join(__dirname, 'emerge', 'cli.js');
        let result;
        if (fs.existsSync(compilerCli)) {
          try {
            const out = execSync(`node "${compilerCli}" "${tmpFile}"`, { encoding:'utf8', timeout:30000 });
            result = { ok:true, output:out, source:'spec-compiler', filename };
          } catch(e) {
            result = { ok:false, error:e.message.slice(0,200), source:'spec-compiler' };
          }
        } else {
          // Spec compiler not found — use guardian SEAM as fallback
          result = { ok:false, error:'spec-compiler not found at expected path', fallback:'guardian-seam' };
        }

        // Log to cortex event ledger
        broadcast('spec.compile.complete', { filename, ok:result.ok, source:result.source, ideaUuid });

        // If ideaUuid given, update idearium phase to 'specced'
        if (ideaUuid && result.ok) {
          try {
            const r = await (async () => {
              const http = require('http');
              return new Promise((resolve) => {
                const b = JSON.stringify({ phase:'specced' });
                const req2 = http.request({ hostname:'127.0.0.1', port:4800, path:'/api/ideas/'+ideaUuid, method:'PATCH',
                  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)} }, res2 => { res2.resume(); resolve(true); });
                req2.on('error',()=>resolve(false)); req2.write(b); req2.end();
              });
            })();
          } catch(_) {}
        }

        return json(res, result.ok ? 200 : 422, result);
      } catch(e) {
        return json(res, 500, { ok:false, error:e.message });
      }
    }
    return json(res, 404, { ok:false, error:'unknown compile route' });
  }

  // ── Meta layer — /api/meta/* ─────────────────────────────────────────────
  // GET /api/meta/status    — all four modules + versions
  // GET /api/meta/classify  — ALK perception of current system state
  // GET /api/meta/gaps?text= — run Liminal gap detection on text
  if (top === 'api' && sub === 'meta') {
    const meta = (() => { try { return require('../meta'); } catch(_) { return null; } })();
    if (!meta) return json(res, 503, { ok:false, error:'meta layer not loaded' });

    if (M === 'GET' && !rest) {
      return json(res, 200, { ok:true, modules: {
        'topo-kernel':     meta.topo?.VERSION      || 'unavailable',
        'telemetry-codec': meta.telemetry?.VERSION || 'unavailable',
        'liminal':         meta.liminal?.VERSION   || 'unavailable',
        'alk-perception':  meta.alk?.VERSION       || 'unavailable',
        'spatial':         meta.spatial?.VERSION   || 'unavailable',
        'bda':             meta.bda?.VERSION       || 'unavailable',
      }});
    }

    if (M === 'GET' && rest === 'status') {
      return json(res, 200, { ok:true, modules: {
        'topo-kernel':     { version: meta.topo?.VERSION,      id: meta.topo?.MODULE_ID },
        'telemetry-codec': { version: meta.telemetry?.VERSION, id: meta.telemetry?.MODULE_ID },
        'liminal':         { version: meta.liminal?.VERSION,   id: meta.liminal?.MODULE_ID },
        'alk-perception':  { version: meta.alk?.VERSION,       id: meta.alk?.MODULE_ID },
      }});
    }

    if (M === 'POST' && rest === 'gaps') {
      const body = await readBody(req);
      const text = body.text || body.content || '';
      if (!text) return json(res, 400, { ok:false, error:'text required' });
      try {
        const gaps = meta.liminal.analyze(text, { mode: body.mode || 'text' });
        return json(res, 200, { ok:true, gaps, count: gaps.length });
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    if (M === 'POST' && rest === 'classify') {
      const body = await readBody(req);
      try {
        const state = meta.alk.classify(body);
        return json(res, 200, { ok:true, state });
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    // BDA observe — feed text through behavioral drift analyzer
    if (M === 'POST' && rest === 'observe') {
      const body = await readBody(req);
      try {
        const { BDAKernel } = meta.bda;
        // Per-session BDA kernel — stored on orchestrator module scope
        if (!global._bdaKernel) global._bdaKernel = new BDAKernel();
        const result = global._bdaKernel.observe({ role: body.role||'user', text: body.text||'', ts: body.ts });
        return json(res, 200, { ok:true, result, state: global._bdaKernel.state() });
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    if (M === 'GET' && rest === 'bda') {
      if (!global._bdaKernel) return json(res, 200, { ok:true, state: null, note:'no observations yet' });
      return json(res, 200, { ok:true, state: global._bdaKernel.state() });
    }

    return json(res, 404, { ok:false, error:'unknown meta route' });
  }

  // ── Guardian capabilities — /api/guardian/capabilities ─────────────────
  // Lists all available AI providers and their strengths
  if (top === 'api' && sub === 'guardian' && rest === 'capabilities') {
    try {
      const ad = require('../guardian/api-dispatch');
      const caps = ad.capabilities();
      return json(res, 200, { ok:true, providers: caps });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }

  // ── Semantic search proxy — /api/search/* ───────────────────────────────
  // Proxies to cortex /api/search for UI + auth client access
  if (top === 'api' && sub === 'search') {
    const http = require('http');
    const cortexPath = '/api/search' + (rest ? '/' + rest : '') + (u.search || '');
    const r = await new Promise((resolve) => {
      const req2 = http.request({ hostname:'127.0.0.1', port:3748, path:cortexPath, method:M,
        headers:{'Content-Type':'application/json'} }, res2 => {
        const chunks=[]; res2.on('data',c=>chunks.push(c));
        res2.on('end',()=>{ try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch(_){resolve(null);} });
      });
      req2.on('error',()=>resolve(null));
      if (M==='POST') { readBody(req).then(b=>{ req2.write(JSON.stringify(b)); req2.end(); }); }
      else req2.end();
    });
    if (r) return json(res, 200, r);
    return json(res, 503, { ok:false, error:'cortex search unavailable' });
  }

  // ── Diagnostic engines proxy — /api/engines ──────────────────────────────
  // Proxies to nexus-diagnostic /engines endpoint for UI access
  if (top === 'api' && sub === 'engines') {
    try {
      const http = require('http');
      const r = await new Promise((resolve) => {
        const req2 = http.get('http://127.0.0.1:7825/engines', { timeout: 5000 }, res2 => {
          const chunks = []; res2.on('data', c => chunks.push(c));
          res2.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(_) { resolve(null); } });
        });
        req2.on('error', () => resolve(null));
      });
      if (r) return json(res, 200, r);
      return json(res, 503, { ok:false, error:'diagnostic service unavailable' });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }

  // ── Version registry — /api/version ─────────────────────────────────────
  if (top === 'api' && sub === 'version') {
    try {
      const V = require('../lib/version');
      return json(res, 200, { ok:true, ...V, toString: undefined, get: undefined });
    } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
  }

  // ── Contract trust map ────────────────────────────────────────────────────
  if (top === 'api' && sub === 'trust') {
    const hs = require('./lib/contract-handshake');
    return json(res, 200, { ok: true, trust: hs.getTrustMap(), all: hs.getAllEntries().map(e => ({
      systemId: e.systemId, trust: e.trust, hash: e.hash, routeCount: e.routeCount,
      checkedAt: e.checkedAt, latencyMs: e.latencyMs, driftReason: e.driftReason,
    }))});
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
    const { systemId, port, status = 'online', seq, pulseId, intervalMs, stats, meta = {} } = body;
    const now = Date.now();

    if (systemId) {
      const existing = SYSTEM_REGISTRY.get(systemId) || {};

      // §BPM — real, observed gap since this same system's last beat. Only
      // meaningful once there IS a prior beat, and only within a sane window
      // (a >2min gap is a restart/stall, not "the rhythm slowed down" — don't
      // let one huge outlier permanently poison the ring's average).
      let intervals = existing._intervals || [];
      if (existing.lastSeen) {
        const observed = now - existing.lastSeen;
        if (observed > 0 && observed < 120000) {
          intervals = [...intervals, observed].slice(-BPM_RING_SIZE);
        }
      }
      const bpmHealth = computeBpmHealth(intervals, intervalMs, stats);

      // §NEGATIVE SPACE — a real beat just arrived: re-arm the watchdog and
      // clear any prior miss count. This is the ONLY place pulseMissed is
      // cleared — recovery is proven by a real beat, not assumed by a timer.
      const wasMissed = existing.pulseMissed || 0;
      if (wasMissed > 0) {
        console.log(`[orchestrator][pulse] '${systemId}' recovered after ${wasMissed} missed pulse(s)`);
      }
      _armPulseWatch(systemId, intervalMs);

      SYSTEM_REGISTRY.set(systemId, {
        ...existing, systemId, port, status, meta,
        lastSeen: now, seq, pulseId, pulseMissed: 0,
        _intervals: intervals,
        bpm: bpmHealth.bpm, targetBpm: bpmHealth.targetBpm,
        healthScore: bpmHealth.healthScore, healthComponents: bpmHealth.components,
      });
      // §BUG FIXED 2026-07-06 — a separate, duplicate heartbeat route was
      // added earlier this session to fix Nerve's empty _sources map, at
      // an EARLIER point in this file's route-matching order — meaning
      // it silently shadowed THIS real, richer, pre-existing handler
      // (SYSTEM_REGISTRY + SSE broadcast + health snapshot) ever since,
      // turning it into dead code. Found by checking for exactly this
      // kind of self-inflicted regression before building anything else
      // on top of it. Merged here instead; the duplicate route is removed.
      if (nexusBus) nexusBus.emit('system.heartbeat', { port, status }, { source: systemId });
    }

    // Build lightweight health snapshot from registry (no outbound requests — fast)
    const snapshot = {};
    for (const [id, s] of SYSTEM_REGISTRY) {
      snapshot[id] = {
        online: (now - (s.lastSeen || 0)) < 30000,
        ms:     s.latencyMs || null,
        port:   s.port,
        bpm:         s.bpm ?? null,
        targetBpm:   s.targetBpm ?? null,
        healthScore: s.healthScore ?? null, // 0-100, null until 2+ real beats observed
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

  // ── Generic external event relay ────────────────────────────────────────
  // §ADDED 2026-08-17 — James: "cos compartments being created to be
  // announced." COS runs in-process wherever it's invoked from (an
  // agent-tool, a CLI command) — not as its own standalone server the way
  // guardian/idearium are — so it can't call broadcast() directly the way
  // orchestrator's own code does. This is the real, generic bridge: any
  // external process POSTs {type, payload}, this calls the real, now-
  // fixed broadcast(type, payload) — useful beyond COS specifically,
  // which is why it's a real, named route rather than a COS-only hack.
  if (M==='POST' && sub==='broadcast') {
    const body = await readBody(req);
    const { type, payload } = body || {};
    if (!type) return json(res, 400, { ok:false, error:'type required' });
    broadcast(type, payload || {});
    return json(res, 200, { ok:true, type, ts: Date.now() });
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


  // ── Request Handler — constitutional choke point (Phase 9) ────────────────
  // ALL requests that require AI routing, memory recall, or system decisions
  // should flow through here. Grammar → SNR → memory → RAID → execute.
  if (M==='POST' && sub==='request') {
    const body = await readBody(req);
    try {
      const handler = require('./lib/request-handler');
      const result  = await handler.handle(body, { costCeiling: body.costCeiling });
      return json(res, 200, result);
    } catch(e) {
      return json(res, 500, { ok:false, error: e.message, outcome: 'UNRESOLVED' });
    }
  }

  // ── Exec — run CLI command and stream result ──────────────────────────────
  if (M==='POST' && sub==='exec') {
    const body = await readBody(req);
    const { cmd = '', args = [], system = '' } = body;
    if (!cmd) return json(res, 400, { ok:false, error:'cmd required' });
    // ORC-02: allowlist — prevent arbitrary OS execution via SSRF/XSS
    const ALLOWED_BINS = new Set(['node','npm','npx','git','ls','cat','echo','pwd','which']);
    const { spawnSync } = require('child_process'); // inline ok — CLI path
    const fullArgs = args.length ? [cmd, ...args] : cmd.split(' ').filter(Boolean);
    const bin = fullArgs.shift();
    if (!ALLOWED_BINS.has(path.basename(bin))) {
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

  if (M==='GET' && sub==='intent-map') {
    // Gap 2: the intent-map — every interaction point tagged with what a HUMAN
    // wants, grouped by intent category, component resolved via the UID backbone.
    // This is what the map-driven orchestrator UI reads. ?category=ACT to filter.
    const full = buildIntentMap();
    const cat = QS.get('category');
    if (cat && full.map[cat]) {
      return json(res, 200, { ok:true, generated: full.generated, category: cat, ...full.map[cat] });
    }
    return json(res, 200, full);
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
        { m:'GET',p:'/api/cli' },{ m:'GET',p:'/api/ui' },{ m:'GET',p:'/api/api-map' },{ m:'GET',p:'/api/intent-map' },
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
    if (M==='POST' && action==='memory' && action2==='insert') return json(res,200,await POST('cortex','/api/memory/insert',await readBody(req)));
    if (M==='POST' && action==='memory' && action2==='search') return json(res,200,await POST('cortex','/api/memory/search',await readBody(req)));
    if (M==='POST' && action==='memory' && action2==='forget') return json(res,200,await POST('cortex','/api/memory/forget',await readBody(req)));
    if (M==='GET'  && action==='requests')         return json(res,200,await GET('cortex','/api/requests'));
    if (M==='GET'  && !action)                     return json(res,200,await GET('cortex','/health'));
    if (M==='GET'  && action==='contract')         return json(res,200,await GET('cortex','/contract'));

    // Snapshots (cortex/foundation/admin-server.js)
    if (M==='GET'  && action==='snapshots' && !action2)              return json(res,200,await GET('cortex','/api/snapshots'));
    if (M==='GET'  && action==='snapshots' && action2==='divergence-watcher') return json(res,200,await GET('cortex','/api/snapshots/divergence-watcher'));
    if (M==='GET'  && action==='snapshots' && action2==='blackbox')   return json(res,200,await GET('cortex','/api/snapshots/blackbox'));
    if (M==='GET'  && action==='snapshots' && action2==='macro')      return json(res,200,await GET('cortex','/api/snapshots/macro'));
    if (M==='GET'  && action==='snapshots' && action2==='diff')       return json(res,200,await GET('cortex',`/api/snapshots/diff${url.search||''}`));
    if (M==='POST' && action==='snapshots' && action2==='create')     return json(res,200,await POST('cortex','/api/snapshots/create',await readBody(req)));
    if (M==='POST' && action==='snapshots' && action2==='rollback')   return json(res,200,await POST('cortex','/api/snapshots/rollback',await readBody(req)));

    // Replay inspection
    if (M==='POST' && action==='replay' && action2==='inspect')       return json(res,200,await POST('cortex','/api/replay/inspect',await readBody(req)));

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
  // ── Diagnostic proxy ─────────────────────────────────────────────────────
  // Did not exist before — diagnostic (:7825) was only reachable via one
  // ad-hoc /engines GET call elsewhere in this file. nexus-repl.js's `heal`
  // command has been calling diagnostic directly (http://127.0.0.1:7825/
  // gaps/:id/fix) rather than through orchestrator, which works but bypasses
  // Phase 23.5-style centralized routing. Adding the proxy so `heal` can be
  // registered into component-registry (same pattern as forge/snapshot) —
  // confirmed POST /gaps/:uuid/fix is real, in diagnostic/nexus-diagnostic.js.
  if (sub==='diagnostic') {
    const action = seg[2] || '';
    const uuid   = seg[3] || '';
    const op     = seg[4] || '';

    if (M==='GET'  && !action)             return json(res,200,await GET('diagnostic','/status'));
    if (M==='GET'  && action==='status')   return json(res,200,await GET('diagnostic','/status'));
    if (M==='GET'  && action==='self-heal') return json(res,200,await GET('diagnostic','/self-heal'));
    if (M==='POST' && action==='gaps' && uuid && op==='fix')
      return json(res,200,await POST('diagnostic',`/gaps/${uuid}/fix`,await readBody(req)));

    return json(res,404,{ok:false,error:`diagnostic route not found: ${M} /api/diagnostic/${action}`});
  }

  if (sub==='guardian') {
    const action = seg[2] || '';
    const uuid   = seg[3] || '';
    const op     = seg[4] || '';
    const sub2   = seg[3] || '';

    if (M==='GET'  && !action)                      return json(res,200,await GET('guardian','/health'));
    // §FIX 2026-06-21: SEAM watchdog escalations write to GUARDIAN's own
    // local gaps table (guardian/lib/seam-queue.js's _escalate()), not
    // cortex's. The orchestrator's /api/cortex/gaps route only ever
    // queried cortex — every escalated SEAM stall was invisible through
    // it. Confirmed directly: guardian exposes its own /gaps and
    // /gaps/summary on :7820, never proxied until now.
    if (M==='GET'  && action==='local-gaps' && sub2==='summary') return json(res,200,await GET('guardian','/gaps/summary'));
    if (M==='GET'  && action==='local-gaps')        return json(res,200,await GET('guardian','/gaps'));
    if (M==='GET'  && action==='contract')          return json(res,200,await GET('guardian','/contract'));
    if (M==='GET'  && action==='health')             return json(res,200,await GET('guardian','/health'));
    if (M==='GET'  && action==='bus')                return json(res,200,await GET('guardian',`/bus?n=${QS.get('n')||100}`));
    if (M==='POST' && action==='bus' && sub2==='emit') return json(res,200,await POST('guardian','/bus/emit',await readBody(req)));
    if (M==='GET'  && action==='providers')          return json(res,200,await GET('guardian','/providers'));
    if (M==='GET'  && action==='jobs')               return json(res,200,await GET('guardian',`/jobs?status=${QS.get('status')||''}&limit=${QS.get('limit')||20}`));
    if (M==='GET'  && action==='log')                return json(res,200,await GET('guardian',`/log?limit=${QS.get('limit')||20}`));
    if (M==='POST' && action==='dispatch')           return json(res,202,await POST('guardian','/command',await readBody(req)));
    if (M==='POST' && action==='blueprint' && sub2==='compile')  return json(res,200,await POST('guardian','/blueprint/compile', await readBody(req), 120000));
    if (M==='GET'  && action==='blueprint')                       return json(res,200,GET_cached('guardian', '/blueprint'));
    // Blueprint index — live system component/CLI/SEAM map (§BP-01)
    if (M==='POST' && action==='blueprint' && sub2==='index') {
      try {
        const bi  = require('../lib/blueprint-index');
        const res2 = bi.build({ bus: { emit: (type, data) => broadcast(JSON.stringify({ type, ...data, ts: Date.now() })) } });
        return json(res, 200, { ok: res2.ok, built: res2.ok,
          totalComponents: res2.index?.totalComponents,
          systemCount: res2.index?.systemCount,
          errors: res2.index?.errors?.length || 0,
          buildMs: res2.index?.buildMs,
        });
      } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
    }
    if (M==='GET' && action==='blueprint' && sub2==='index') {
      try {
        const bi = require('../lib/blueprint-index');
        const idx = bi.load();
        if (!idx) return json(res, 404, { ok: false, error: 'blueprint-index not built — POST /api/blueprint/index first' });
        return json(res, 200, { ok: true, index: idx });
      } catch(e) { return json(res, 500, { ok: false, error: e.message }); }
    }
    // Blueprint index — per-system component query
    if (M==='GET' && action==='blueprint' && sub2==='systems') {
      try {
        const bi = require('../lib/blueprint-index');
        const idx = bi.load();
        if (!idx) return json(res, 404, { ok:false, error:'not built' });
        return json(res, 200, { ok:true, systems: idx.systems, totalComponents: idx.totalComponents });
      } catch(e) { return json(res, 500, { ok:false, error: e.message }); }
    }
    // CLI map — grammar lookup endpoint
    if (M==='GET' && action==='blueprint' && sub2==='cli') {
      try {
        const bi = require('../lib/blueprint-index');
        const idx = bi.load();
        if (!idx) return json(res, 404, { ok:false, error:'not built' });
        const q = url.searchParams.get('q') || '';
        const cmds = q
          ? idx.allCLI.filter(c => c.command.includes(q) || c.aliases.some(a=>a.includes(q)) || c.systemId.includes(q))
          : idx.allCLI;
        return json(res, 200, { ok:true, commands: cmds, total: cmds.length });
      } catch(e) { return json(res, 500, { ok:false, error: e.message }); }
    }
    if (M==='POST' && action==='copilot' && sub2==='prompt')  return json(res,200,await POST('copilot','/api/prompt',  await readBody(req), 120000)); // sovereign copilot :3750
    if (M==='POST' && action==='copilot' && sub2==='channel') return json(res,200,await POST('copilot','/api/channel', await readBody(req), 2000));
    if (M==='POST' && action==='copilot' && sub2==='observe') return json(res,200,await POST('copilot','/api/observe', await readBody(req), 1000));
    // Clear Glass launch — UI calls this when no NCP tab is connected
    if (M==='POST' && action==='clear-glass' && sub2==='open') {
      const body = await readBody(req);
      const targetUrl = body.url || 'https://claude.ai/new';
      // Emit to all SSE clients so Clear Glass (if running) picks it up
      broadcastSSE({ type: 'clear-glass.open', url: targetUrl, ts: Date.now(), source: 'nexus-ui' });
      return json(res, 200, { ok: true, url: targetUrl, note: 'Clear Glass launch dispatched via SSE' });
    }
    // Phase 67: MCP routes
    if (M==='GET' && action==='mcp' && sub2==='status') return json(res,200,await GET('guardian','/mcp/status'));
    if (M==='GET' && action==='mcp' && sub2==='tools') return json(res,200,await GET('guardian','/mcp/tools'));
  // ── Spec Engine proxy (Phase 40) ──────────────────────────────────────────
  if (action==='spec-engine') {
    const ideariumPath = '/' + ['api','spec-engine',...segs.slice(3)].join('/');
    if (M==='GET')  return json(res,200,await GET('idearium', ideariumPath));
    if (M==='POST') return json(res,200,await POST('idearium', ideariumPath, await readBody(req), 300000));
  } // 120s — Mistral 7b can take 45s+
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

    // CFR-Ω field state (lib/cfr/ledger.js, mounted on Guardian at /cfr/*)
    if (M==='GET'  && action==='cfr' && uuid==='state') return json(res,200,await GET('guardian','/cfr/state'));

    // Queue control
    if (M==='POST' && action==='queue' && uuid==='cancel' && op) return json(res,200,await POST('guardian',`/queue/cancel/${op}`,await readBody(req)));

    // SEAM queue — guardian/lib/seam-queue.js + seam-watchdog.js
    if (M==='GET'  && action==='seam' && uuid==='queues' && !op)   return json(res,200,await GET('guardian','/seam/queues'));
    if (M==='GET'  && action==='seam' && uuid==='queues' && op)    return json(res,200,await GET('guardian',`/seam/queues/${op}`));
    if (M==='GET'  && action==='seam' && uuid==='sessions')        return json(res,200,await GET('guardian','/seam/sessions'));
    if (M==='POST' && action==='seam' && uuid==='retry')           return json(res,200,await POST('guardian','/seam/retry',await readBody(req)));
    if (M==='GET'  && action==='seam' && uuid==='watchdog' && op==='status') return json(res,200,await GET('guardian','/seam/watchdog/status'));
    // §BUILT 2026-07-13 — lib/seam/cross-system-status.js's real report.
    if (M==='GET'  && action==='seam' && uuid==='status' && op==='cross-system') return json(res,200,await GET('guardian','/seam/status/cross-system'));

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

  // ── Architect proxy ───────────────────────────────────────────────────────
  if (sub==='architect') {
    const action  = seg[2] || '';
    const action2 = seg[3] || '';
    const action3 = seg[4] || '';

    if (M==='GET'  && !action)                                  return json(res,200,await GET('architect','/health'));
    if (M==='GET'  && action==='health')                        return json(res,200,await GET('architect','/health'));
    if (M==='GET'  && action==='spec')                          return json(res,200,await GET('architect','/api/spec'));

    // Hooks — §2026-07-20 write authority moved architect → loom (docs/hooks-migration.spec).
    // Reads stay on architect (its read view + Blueprint context); every mutation goes to loom :3752.
    if (M==='GET'  && action==='hooks' && !action2)             return json(res,200,await GET('architect',`/api/hooks${url.search||''}`));
    if (M==='GET'  && action==='hooks' && action2==='validate') return json(res,200,await GET('architect','/api/hooks/validate'));
    if (M==='GET'  && action==='hooks' && action2)              return json(res,200,await GET('architect',`/api/hooks/${action2}`));
    if (M==='POST' && action==='hooks' && action2==='wire')     return json(res,200,await POST('loom','/api/hooks/wire',await readBody(req)));
    if (M==='POST' && action==='hooks' && action2==='unwire')   return json(res,200,await POST('loom','/api/hooks/unwire',await readBody(req)));
    if (M==='POST' && action==='hooks' && !action2)             return json(res,200,await POST('loom','/api/hooks',await readBody(req)));
    if (M==='PATCH'&& action==='hooks' && action2)              return json(res,200,await sysReq('loom','PATCH', `/api/hooks/${action2}`,await readBody(req)));
    if (M==='DELETE'&&action==='hooks' && action2)              return json(res,200,await sysReq('loom','DELETE',`/api/hooks/${action2}`,await readBody(req)));
    if (M==='GET'  && action==='hooks' && action2==='graph')    return json(res,200,await GET('architect',`/api/hooks/graph${url.search||''}`));

    // Blueprints
    if (M==='GET'  && action==='blueprint' && !action2)         return json(res,200,await GET('architect','/api/blueprint'));
    if (M==='GET'  && action==='blueprint' && action2)          return json(res,200,await GET('architect',`/api/blueprint/${action2}`));
    if (M==='POST' && action==='blueprint' && action2==='scan') return json(res,200,await POST('architect','/api/blueprint/scan',await readBody(req)));
    if (M==='POST' && action==='blueprint' && action2==='diff') return json(res,200,await POST('architect','/api/blueprint/diff',await readBody(req)));

    // Topology map
    if (M==='GET'  && action==='map')                           return json(res,200,await GET('architect','/api/map'));
    if (M==='POST' && action==='map' && action2==='scan')       return json(res,200,await POST('architect','/api/map/scan',await readBody(req)));

    // SNR gate
    if (M==='GET'  && action==='snr')                           return json(res,200,await GET('architect','/api/snr'));
    if (M==='POST' && action==='snr' && action2==='check')      return json(res,200,await POST('architect','/api/snr/check',await readBody(req)));
    if (M==='GET'  && action==='snr' && action2==='history')    return json(res,200,await GET('architect',`/api/snr/history/${action3}`));

    // Translate / UTL
    if (M==='POST' && action==='translate' && action2==='utl')  return json(res,200,await POST('architect','/api/translate/utl',await readBody(req)));

    // Gaps
    if (M==='GET'  && action==='gaps')                          return json(res,200,await GET('architect',`/api/gaps${url.search||''}`));
    if (M==='POST' && action==='gaps')                          return json(res,200,await POST('architect','/api/gaps',await readBody(req)));

    // UI assets
    if (M==='GET'  && action==='ui' && action2==='arch-builder') return json(res,200,await GET('architect','/ui/arch-builder'));
    if (M==='GET'  && action==='ui' && action2==='alk-lattice')  return json(res,200,await GET('architect','/ui/alk-lattice'));

    return json(res,404,{ok:false,error:`architect route not found: ${M} /api/architect/${action}`});
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

  // ── Emerge proxy — /api/emerge/* → emerge-ide.js :4242 ─────────────────────
  // emerge-ide.js no longer auto-opens its own browser window.
  // All emerge API calls route through orchestrator.
  if (top === 'api' && sub === 'emerge') {
    const action = rest || seg[2] || '';
    const p = '/' + (action || 'status');

    // SSE stream from emerge
    if (M === 'GET' && action === 'events') {
      const r = http.request({ hostname:'127.0.0.1', port:4242, path:'/events', method:'GET',
        headers:{'Accept':'text/event-stream'} }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
        req.on('close', () => r.destroy());
      });
      r.on('error', () => json(res,503,{ok:false,error:'emerge offline'}));
      r.end(); return;
    }

    // All other emerge routes
    const r = await GET('emerge', p).catch(() => ({ok:false,error:'emerge offline'}));
    return json(res, r.ok ? 200 : (r.error==='emerge offline'?503:500), r);
  }

  // ── Autopilot proxy ───────────────────────────────────────────────────────
  // Process supervisor — separate from every system above. Those report
  // "did my HTTP endpoint respond"; this reports real kernel state (restart
  // counts, crash history, circuit-breaker trips, downSince) that no health
  // probe can see. Off when autopilot isn't the thing that booted the stack
  // (e.g. plain `npm run start:all`) — GET fails clean via sysReq, same as
  // any other offline system.
  if (sub === 'autopilot') {
    const action = seg[2] || '';
    if (M==='GET' && (!action || action==='status')) return json(res,200,await GET('autopilot','/status'));
    return json(res,404,{ok:false,error:`autopilot route not found: ${M} /api/autopilot/${action}`});
  }

  // ── /api/system/* — routes moved from guardian (own lib, no guardian proxy) ──
  if (u.pathname.startsWith('/api/system/')) {
    const seg = u.pathname.split('/').filter(Boolean); // ['api','system',action,sub]
    const action = seg[2] || '';
    const sub    = seg[3] || '';

    // hot-load
    if (M==='POST' && action==='hot-load') {
      const body = await readBody(req);
      const { modulePath, src, monitorMs = 60000 } = body || {};
      if (!modulePath) return json(res, 400, { ok:false, error:'modulePath required' });
      try {
        const hl = require('./lib/hot-loader');
        if (!hl._inited) {
          // §BUG FIXED 2026-07-06 — was jaaDB: null, same pattern found in
          // autonomous-loop's init just below. This file already imports a
          // real jaaDB correctly elsewhere (see the compReg.init calls) —
          // using that instead of a hardcoded null.
          const { jaaDB: realJaaDB } = require('../cortex/memory/jaa-db');
          hl.init({ bus: nexusBus, jaaDB: realJaaDB }); hl._inited = true;
        }
        const result = await hl.load({ modulePath, src, monitorMs });
        return json(res, result.ok ? 200 : 400, result);
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }
    if (M==='GET' && action==='hot-load' && sub==='status') {
      try { const hl = require('./lib/hot-loader'); return json(res, 200, { ok:true, ...hl.status() }); }
      catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    // autonomous loop
    if (M==='POST' && action==='autonomous') {
      const body = await readBody(req);
      const { goal, budget, boundary, exit: exitCond, source } = body || {};
      if (!goal || !budget || !boundary || !exitCond)
        return json(res, 400, { ok:false, error:'goal, budget, boundary, exit required' });
      try {
        const al = require('./lib/autonomous-loop');
        // §BUG FIXED 2026-07-06 — was jaaDB: null, meaning
        // meta/crystal-lattice.js's _maybeCrystallize() (called via
        // lib/compartment-engine.js's execute() path) always hit its own
        // `if (!jaa) return {crystallized:false, reason:'jaa-unavailable'}`
        // guard, guaranteed, every time this ran. This is the one real
        // trigger for that whole chain — traced directly from the user's
        // "pattern engine migrated to intuition" report two turns back.
        const { jaaDB: realJaaDB2 } = require('../cortex/memory/jaa-db');
        al.init({ bus: nexusBus, jaaDB: realJaaDB2, raid: null });
        const result = await al.run({ goal, budget, boundary, exit:exitCond, source:source||'api' });
        return json(res, result.ok ? 200 : 400, result);
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }
    if (M==='GET' && action==='autonomous' && sub==='status') {
      try { const al = require('./lib/autonomous-loop'); return json(res, 200, { ok:true, ...al.status() }); }
      catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    // mcp
    if (M==='GET' && action==='mcp' && (!sub || sub==='status')) {
      try { const mcp = require('./lib/mcp-server'); return json(res, 200, { ok:true, ...mcp.status() }); }
      catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }
    if (M==='GET' && action==='mcp' && sub==='tools') {
      try {
        const mcp = require('./lib/mcp-server');
        return json(res, 200, { ok:true, tools: mcp.TOOLS.map(t=>({ name:t.name, description:t.description })), total:mcp.TOOLS.length });
      } catch(e) { return json(res, 500, { ok:false, error:e.message }); }
    }

    return json(res,404,{ok:false,error:`system route not found: ${M} ${u.pathname}`});
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

// ── FIX (James, 2026-06-19 — "command line tool for the intelligence
// system, raid engine, compartments") ────────────────────────────────────────
// intelligence/RAID/compartments had zero CLI surface — internal-API-only.
// These proxy to the routes added in cortex/foundation/admin-server.js.

async function cliIntel(sub='patterns', arg) {
  if (sub==='patterns') {
    const d=await GET('intelligence','/api/intelligence/patterns');
    if(d.error){console.log(`${C.red}✗${C.r} Intelligence offline: ${d.error}`);return;}
    const list=d.patterns||[];
    console.log(`\n${C.b}${C.c}PATTERNS (${list.length})${C.r}\n`);
    for (const p of list) {
      const cc=p.crystallised?C.g:C.d;
      console.log(`  ${cc}${p.crystallised?'●':'○'}${C.r}  ${C.d}${(p.patternType||'—').padEnd(18)}${C.r}  ${(p.description||p.signature||'—').slice(0,70)}`);
    }
    console.log('');
  } else if (sub==='failures') {
    const d=await GET('intelligence','/api/intelligence/failures');
    if(d.error){console.log(`${C.red}✗${C.r} Intelligence offline: ${d.error}`);return;}
    const list=d.failures||[];
    console.log(`\n${C.b}${C.c}FAULT TAXONOMY (${list.length})${C.r}\n`);
    for (const f of list) console.log(`  ${C.red}✗${C.r}  ${C.d}${(f.faultClass||'—').padEnd(24)}${C.r}  count:${f.count||0}  ${C.d}${(f.precursors||[]).slice(0,3).join(', ')}${C.r}`);
    console.log('');
  } else if (sub==='reuse') {
    const d=await GET('intelligence',`/api/intelligence/reuse${arg?`?q=${encodeURIComponent(arg)}`:''}`);
    if(d.error){console.log(`${C.red}✗${C.r} Intelligence offline: ${d.error}`);return;}
    const list=d.results||[];
    console.log(`\n${C.b}${C.c}REUSE INDEX (${list.length})${C.r}\n`);
    for (const r of list) console.log(`  ${C.d}${(r.type||'—').padEnd(12)}${C.r}  ${C.c}${(r.lang||'—').padEnd(10)}${C.r}  ${(r.intent||'—').slice(0,50)}`);
    console.log('');
  } else {
    console.log(`Usage: node orchestrator.js intel <patterns|failures|reuse> [query]`);
  }
}

async function cliRaid() {
  const d=await GET('cortex','/api/raid/status');
  if(d.error){console.log(`${C.red}✗${C.r} Cortex offline or RAID not registered: ${d.error}`);return;}
  console.log(`\n${C.b}${C.c}RAID${C.r}  ${C.d}v${d.version||'—'}${C.r}\n`);
  const health=d.health||{};
  for (const [agent,h] of Object.entries(health)) {
    console.log(`  ${sysDot(h?.online!==false)}  ${C.b}${agent.padEnd(12)}${C.r}  ${C.d}${JSON.stringify(h).slice(0,60)}${C.r}`);
  }
  const weights=d.weights||{};
  if (Object.keys(weights).length) {
    console.log(`\n  ${C.d}weights:${C.r}`);
    for (const [agent,w] of Object.entries(weights)) console.log(`    ${C.m}${agent.padEnd(12)}${C.r}  ${(w*100).toFixed(1)}%`);
  }
  console.log('');
}

async function cliCompartments(sub='list', arg) {
  if (sub==='show') {
    if(!arg){console.log(`Usage: node orchestrator.js compartments show <uuid>`);return;}
    const d=await GET('cortex',`/api/compartments/${arg}`);
    if(d.error||!d.ok){console.log(`${C.red}✗${C.r} ${d.error||'not found'}`);return;}
    console.log(`\n${C.b}${C.c}COMPARTMENT ${arg.slice(0,8)}${C.r}\n`);
    console.log(JSON.stringify(d.compartment, null, 2));
    console.log('');
    return;
  }
  const statusArg = sub==='list' ? arg : sub; // allow `compartments PASS` shorthand
  const qs = statusArg ? `?status=${encodeURIComponent(statusArg)}` : '';
  const d=await GET('cortex',`/api/compartments${qs}`);
  if(d.error){console.log(`${C.red}✗${C.r} Cortex offline: ${d.error}`);return;}
  const list=d.compartments||[];
  console.log(`\n${C.b}${C.c}COMPARTMENTS (${list.length})${C.r}\n`);
  for (const c of list) {
    const sc=c.status==='PASS'?C.g:c.status==='FAILED-REWOUND'?C.y:c.status==='DELETE'?C.red:C.d;
    console.log(`  ${C.d}${(c.uuid||'').slice(0,8)}${C.r}  ${sc}${(c.status||'—').padEnd(16)}${C.r}  ${C.d}${(c._declaredDomain||'—')}:${(c._declaredVerb||'—')}${C.r}`);
  }
  console.log('');
}

async function cliPurge(dryRun) {
  console.log(`\n${C.b}${C.c}PURGE${C.r}  ${C.d}${dryRun?'(dry run — nothing will be evicted)':'redundant gaps + patterns'}${C.r}\n`);
  const d=await POST('cortex','/api/purge',{dryRun:!!dryRun});
  if(d.error){console.log(`${C.red}✗${C.r} Cortex offline: ${d.error}`);return;}
  for (const line of d.log||[]) console.log(`  ${C.d}${line}${C.r}`);
  console.log(`\n${C.g}✓${C.r} patterns: ${d.patterns?.rowsEvicted||0} evicted  ${C.g}✓${C.r} gaps: ${d.gaps?.rowsEvicted||0} evicted${dryRun?`  ${C.y}(dry run)${C.r}`:''}\n`);
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
  node orchestrator.js intel <patterns|failures|reuse> [query]   cortex pattern engine
  node orchestrator.js raid             RAID routing health + weights
  node orchestrator.js compartments [list|show <uuid>] [status]  compartment-engine lifecycle
  node orchestrator.js purge [--dry-run] purge redundant gaps + patterns
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
  ui/tv-shell/    → http://localhost:${PORT}/  (primary — diagnostics/home/orchestrator as fallback)
  ui/diagnostics/ → http://localhost:${PORT}/ui/diagnostic
  ui/home/        → http://localhost:${PORT}/ui/home
  ui/orchestrator/ → http://localhost:${PORT}/ui/orchestrator
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
else if (cmd==='intel')        cliIntel(argv[1],argv[2]).then(()=>process.exit(0));
else if (cmd==='raid')         cliRaid().then(()=>process.exit(0));
else if (cmd==='compartments') cliCompartments(argv[1],argv[2]).then(()=>process.exit(0));
else if (cmd==='purge')        cliPurge(argv.includes('--dry-run')).then(()=>process.exit(0));
else if (cmd==='help'||cmd==='--help'||cmd==='-h') { cliHelp(); process.exit(0); }
else {
  // Start server
// ── Wire nexus interconnect ────────────────────────────────────────────────────
if (nexusBus) {
  if (nexusCFR)       nexusCFR.init({ bus: nexusBus, pollMs: 5000 });
  if (nexusHealLoop)  nexusHealLoop.attachToBus(nexusBus);

  // §WARP SPINE 2026-07-09 — "warp is the spine for each system, supposed to
  // be." Measured: it wasn't. WARP was required by loom (3 files), ollama (1)
  // and lib/seam (3); guardian, cortex, copilot, orchestrator, idearium,
  // architect, bridge and emerge touched it not at all. This ATTACHES WARP to
  // the existing bus rather than replacing it — 80 files emit onto nexus-bus,
  // and swapping it outright would be the largest change with the least
  // evidence. Every event is mirrored into a real WARP Stream, recorded to a
  // real StreamLog (the map, projected from what actually ran, not a parallel
  // document that drifts), and checked against WARP Axioms.
  //
  // Advisory by default: violations are reported, never thrown. Turning
  // enforcement on over a live bus on day one converts a reporting tool into
  // an outage. Observe first, enforce second.
  try {
    const { WarpSpine, defaultAxioms } = require('../lib/warp-bus');
    global._warpSpine = new WarpSpine({ bus: nexusBus, name: 'orchestrator', strict: false });
    defaultAxioms(global._warpSpine).attach();
    console.log('[warp-spine] attached to orchestrator bus — 4 axioms, StreamLog mapping active');
  } catch (e) {
    console.warn('[warp-spine] not attached:', e.message);
  }

  // §PERF 2026-07-10 — pressure emitted onto the bus, so the WARP spine records
  // it in StreamLog and anything listening (heal-loop, copilot) can react before
  // the machine fast-fails. Sampling is cheap (os counters, no child probing).
  try {
    const { ResourceMonitor } = require('../lib/resource-monitor');
    global._resourceMonitor = new ResourceMonitor({ bus: nexusBus, name: 'orchestrator', intervalMs: 10000 }).start();
    console.log('[resource-monitor] sampling every 10s — GET /api/perf');
  } catch (e) {
    console.warn('[resource-monitor] not started:', e.message);
  }

  // §GAP CLOSED 2026-07-09 — heal-loop has always listened on THIS
  // in-process bus, but every real gap is produced in another process:
  // guardian's userscripts emit 'cortex.gap.found' on guardian's bus, and
  // diagnostic/nexus-diagnostic.js (:7825) broadcasts 'gap.found' to its own
  // SSE clients. connectBridgeRelay() pipes bridge SSE into broadcast()
  // (orchestrator's SSE fan-out), never into bus.emit(). So no gap has
  // ever crossed into heal-loop. lib/gap-relay.js is that missing wire —
  // gap-shaped events only, loop-guarded, deduped.
  if (nexusHealLoop) {
    try {
      const { GapRelay } = require('../lib/gap-relay');
      const _gapRelay = new GapRelay({
        bus: nexusBus,
        sources: [
          { name: 'guardian',   host: '127.0.0.1', port: 7820, path: '/events' },
          { name: 'diagnostic', host: '127.0.0.1', port: 7825, path: '/events' },
        ],
      });
      _gapRelay.start();
      console.log('[gap-relay] relaying gap events from guardian:7820 + diagnostic:7825 → heal-loop');
    } catch (e) {
      console.warn('[gap-relay] not started:', e.message);
    }
  }
  if (nexusKnowledge) nexusKnowledge.seedSystemFacts();
  // §P106: wire sigma-writer so sigma_records table actually gets populated.
  // Previously zero call sites for sigma_records insert anywhere in the codebase.
  // autonomous-loop.js sigma halt checks this table — without data it always
  // returns null and logs a degraded-monitoring warning, never halts a run.
  try {
    const sigmaWriter = require('./lib/sigma-writer');
    sigmaWriter.init({ compositeIntervalMs: 30000 });
    console.log('[orchestrator] §P106: sigma-writer wired — sigma_records now populates');
  } catch(e) { console.warn('[orchestrator] sigma-writer init failed:', e.message); }
  // §VERSIONIUM STEP 4 2026-08-28 — same real sigma-writer bus, listening
  // for the threshold events it already emits. Wired right after
  // sigma-writer itself since this has no reason to exist before that
  // module's own bus subscription is live.
  try {
    require('./lib/versionium-auto-commit').init();
    console.log('[orchestrator] Versionium step 4 — sigma-gated auto-commit active');
  } catch(e) { console.warn('[orchestrator] versionium-auto-commit init failed:', e.message); }
  // §RAID-WORKER 2026-08-29 — the missing automatic consumer for RAID's
  // real contract queue (self-heal, co-pilot, idearium all submit real
  // contracts now; nothing was ever draining them). Same real, proven
  // pattern as sigma-writer/versionium-auto-commit right above.
  try {
    require('../cortex/core/raid/worker.js').start();
    console.log('[orchestrator] RAID worker active — draining the real contract queue');
  } catch (e) { console.warn('[orchestrator] raid-worker init failed:', e.message); }
  // §OFFICIATOR 2026-09-02 — James: "did you finish the synthesis for
  // the contracts. thats top priority." Real, second automatic
  // consumer alongside raid-worker above: this one turns a staged
  // artifact (clear-glass download -> guardian intake -> lib/intake.js)
  // into a real, agent-synthesized build contract, which raid-worker
  // then picks up and dispatches exactly like any other real contract.
  try {
    require('../cortex/core/raid/officiator.js').start();
    console.log('[orchestrator] RAID officiator active — synthesizing contracts from staged artifacts');
  } catch (e) { console.warn('[orchestrator] raid-officiator init failed:', e.message); }
  // Compaction belongs to the same write authority, same process (§10.1) —
  // rolls expired sigma_records (>24h, tiers.js short tier) into hourly
  // sigma_rollups, then hard-deletes them. Built 2026-07-20: 13,944 rows
  // and growing, parsed whole by six processes at every boot, was the
  // measured driver of the OOM/0xC0000409 crashes.
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    require('./lib/sigma-compaction').start(jaaDB);
  } catch(e) { console.warn('[orchestrator] sigma-compaction init failed:', e.message); }
  // §ADDED 2026-09-12 — James: "we need decay for tables." Same real
  // problem sigma-compaction.js already fixed for sigma_records
  // (tombstone-only never actually shrinks a table — see
  // cortex/memory/table-compactor.js's own header), generalized to every
  // OTHER confirmed real, high-volume table: event_log (71,765+ rows,
  // already tiered 'short' but never actually hard-deleted before this),
  // component_ledger and cfr_tension_history (49,440 and 23,062 rows,
  // previously undeclared in tiers.js at all). Started separately from
  // sigma-compaction — different module, different table set, no
  // double-processing of sigma_records.
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    require('../cortex/memory/table-compactor').start(jaaDB, [
      'event_log', 'component_ledger', 'cfr_tension_history',
      // §ADDED 2026-09-12 — James's own live boot log named these
      // directly (2,256 / 1 / 5 rows and growing respectively). Real
      // writers checked (lib/constitutional-ai.js, guardian/lib/
      // ncp-handler.js + lib/chat-logger.js, cortex/memory/jaa-db.js) —
      // all three are genuine append-only history, not live state.
      'constitution_decisions', 'chat_log', 'schema_drift',
    ]);
  } catch(e) { console.warn('[orchestrator] table-compactor init failed:', e.message); }
  // §ADDED 2026-09-12 — James: "should be able to clear sigmas. maybe
  // delete after 100? per system." sigma_records has no literal `system`
  // field (checked sigma-writer.js's real record shape directly) — its
  // real per-source dimension is `type` (the originating bus event type).
  // Keeps the 100 most recent sigma_records per real event type,
  // independent of sigma-compaction.js's own 24h age-based rollup above
  // (a type with heavy volume inside 24h can still exceed 100 well before
  // the age cutoff would ever trigger).
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    require('../cortex/memory/table-compactor').startCaps(jaaDB, [
      { table: 'sigma_records', keyFn: (r) => r.type || null, maxPerGroup: 100 },
    ]);
  } catch(e) { console.warn('[orchestrator] table-compactor count-cap init failed:', e.message); }
  // §ADDED 2026-09-12 — James: "clear all duplicates from each table...
  // expand autonomous mode, including the dedup." Real, exact-uuid-
  // collision dedup runs unconditionally on every table below (always
  // safe — see table-deduplicator.js's own header for why this case can
  // never be legitimate); content-level dedup stays opt-in per table and
  // is not configured here yet, so it does not run — no fingerprint is
  // guessed for any of these tables' real content shape.
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const { TABLE_TIERS } = require('../cortex/memory/tiers.js');
    require('../cortex/memory/table-deduplicator').start(jaaDB, Object.keys(TABLE_TIERS));
  } catch(e) { console.warn('[orchestrator] table-deduplicator init failed:', e.message); }
  console.log('[orchestrator] nexus interconnect: bus+cfr+heal+knowledge+sigma active');
}

const BIND_HOST = process.env.NEXUS_BIND_HOST || '127.0.0.1'; // §REMOTE-15
server.listen(PORT, BIND_HOST, async () => {
  // BootSequence hoisted to top-level

  // ════════════════════════════════════════════════════════════════════════════
  // ORCHESTRATOR OWN BOOT SEQUENCE (§AXIOM — starts first)
  // ════════════════════════════════════════════════════════════════════════════
  // §BUGFIX 2026-07-04: was a hardcoded '2.0.0' here, independent of
  // lib/version.js's VERSION.services.orchestrator — the two happened to
  // agree by coincidence, not by construction. Sourcing from the registry
  // means this can't silently drift from it again.
  const NEXUS_VERSION = require('../lib/version');
  const ownSeq = new BootSequence({
    systemId: 'orchestrator', port: PORT, version: NEXUS_VERSION.services.orchestrator,
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
      fs.mkdirSync(ledgerDir, { recursive: true });
      const testFile = path.join(ledgerDir, '.boot-test');
      fs.writeFileSync(testFile, String(Date.now()));
      fs.unlinkSync(testFile);
    },
  });

  // Phase 2 HARD: health endpoint responds
  ownSeq.phase({ name:'health.verify', type:'HARD',
    label:'Verify /health responds with ok=true',
    fn: async () => {
      await new Promise((resolve, reject) => {
        const r = http.get(
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
        const req = http.get(
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
    fn: async () => { watchUIDirs();

// ── Auth module init + hotswap ────────────────────────────────────────────────
// auth/index.js, auth/policy.json, auth/clients/*.pub all watched live
try {
  const _authMod = require('../auth/index');
  _authMod.init();
  // Watch auth/index.js itself for hotswap
  const _authFile = require.resolve('../auth/index');
  fs.watch(_authFile, () => {
    setTimeout(() => {
      try {
        delete require.cache[_authFile];
        const fresh = require('../auth/index');
        fresh.init();
        broadcast('orchestrator.auth.hotswapped', { ts: Date.now() });
        console.log('[auth] module hotswapped');
      } catch(e) {
        console.warn('[auth] hotswap failed:', e.message);
        broadcast('orchestrator.auth.hotswap_failed', { error: e.message, ts: Date.now() });
      }
    }, 300);
  });
  console.log('[orch] auth module loaded');
} catch(e) {
  console.warn('[orch] auth module unavailable:', e.message);
} },
  });

  // Phase 5 SOFT: open CLI terminal — guarded, fires once only
  // Controlled by orchestrator.config.json → openTerminalOnBoot (default: false)
  // The main UI is the intended single entry point now; nexus-repl.js is still
  // available to run manually (`node cli/nexus-repl.js --repl`) but no longer
  // auto-launches a separate OS window on every boot.
  let _cliOpened = false;
  ownSeq.phase({ name:'cli.terminal', type:'SOFT',
    label:'Open CLI terminal (nexus-repl.js)',
    fn: async () => {
      if (_cliOpened) return; // guard — never open twice
      const cfgPath = path.join(ROOT, 'orchestrator', 'orchestrator.config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
      if (cfg.openTerminalOnBoot !== true) return;  // explicit opt-in only
      _cliOpened = true;
      // §5.4 fix 2026-08-08 — was hardcoded '3.0.0', independent of
      // lib/version.js's services.orchestrator (2.2.0 at the time), the
      // exact drift the comment near this function's own NEXUS_VERSION
      // import already warned about for a different spot in this same
      // file. require() is cached/idempotent — no cost to sourcing fresh
      // here instead of trusting closure scope across a 2600-line file.
      const VERSION = require('../lib/version').services.orchestrator;
      const spawn = spawnChild;
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
  // §2026-07-04: Open NEXUS in Clear Glass, not the default browser.
  // Posts to Clear Glass wire server :7704/open → openAgentWindow().
  // Falls back to system browser if Clear Glass isn't running.
  ownSeq.phase({ name:'nexus.ui.open', type:'SOFT',
    label:'Open NEXUS UI in Clear Glass',
    fn: async () => {
      const cfgPath = path.join(ROOT, 'orchestrator', 'orchestrator.config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
      if (cfg.openUIOnBoot === false) return;

      const rawUrl  = cfg.uiURL || `http://127.0.0.1:${PORT}`;
      const uiUrl   = /^https?:\/\/[\w.:\/-]+$/.test(rawUrl) ? rawUrl : `http://127.0.0.1:${PORT}`;
      const cgWire  = cfg.clearGlassWire || 'http://127.0.0.1:7704';

      // Try Clear Glass wire server — retry up to 8x (Clear Glass boots after orchestrator)
      const _http  = require('http');
      const cgPort = parseInt(cgWire.split(':').pop()) || 7704;
      const body   = JSON.stringify({ url: uiUrl, agentId: 'nexus-home' });

      // §CRASH ROOT CAUSE 2026-07-15 — this whole phase polled :7704 for up
      // to 60s and never once asked anything to actually START Clear
      // Glass. Clear Glass is onDemand:true in autopilot (deliberately —
      // "heaviest single process in the stack... nobody's controlling a
      // browser unless something is actively using it") — dormant by
      // design until requestSpawn() is called. Autopilot's real trigger
      // surface (POST :7799/spawn/:name) exists and works; this caller
      // was simply never updated to use it, so the 20x3s retry loop below
      // was waiting out its full 60s against a process nobody had told to
      // exist, every single boot. Fire the spawn request first — non-
      // fatal if autopilot isn't running this session (e.g. orchestrator
      // launched standalone), the poll loop below still runs as a fallback
      // for that case exactly as it did before this fix.
      // §BUGFIX 2026-08-28 — James, directly: "it opens 127.0.0.1:9000...
      // that would be an event. It's opened every time since it's been
      // made." Real, structured tracking through this whole sequence, so
      // a failure — which has never had a real ledger event, only the
      // success path did (orchestrator.ui.opened below) — gets one too,
      // with the actual diagnostic detail: did the autopilot spawn
      // request itself succeed, how many poll attempts ran, how long it
      // took. Same real event system the success case already writes
      // into, not a new one.
      let spawnRequestOutcome = 'not_attempted';
      const bootStartedAt = Date.now();
      try {
        await new Promise((resolve) => {
          const spawnReq = _http.request({
            hostname: '127.0.0.1', port: 7799,
            path: '/spawn/clear-glass', method: 'POST',
            timeout: 35000, // requestSpawn's own default spawnTimeoutMs is 30s — give it margin
          }, r => { r.resume(); r.on('end', () => { spawnRequestOutcome = 'ok'; resolve(); }); });
          // §BUGFIX 2026-08-28 — James asked directly: "wouldn't [a spawn
          // failure] be in the event ledger? error.log? gap system?" Real
          // answer: no, and this line is exactly why not. Autopilot
          // unreachable (not running, wrong port, crashed) fell through
          // to the poll loop below with ZERO output anywhere — no
          // console line, no ledger write, no gap. The poll loop then
          // fails too (nothing ever told Clear Glass to start), and
          // THAT failure is what finally surfaces, days later, as an
          // unexplained "Clear Glass didn't come up in time" with no
          // link back to the real, silent cause. One real console.warn,
          // not a ledger write — this path is genuinely expected to fire
          // whenever orchestrator runs standalone without autopilot, so
          // a warn (not an error/gap) is the honest severity, but it
          // must say SOMETHING instead of nothing.
          spawnReq.on('error', (err) => {
            spawnRequestOutcome = `error: ${err.code || err.message}`;
            console.warn(`[nexus] Clear Glass spawn request to autopilot :7799 failed (${err.code || err.message}) — autopilot may not be running. Falling back to polling, which will time out with no further explanation if nothing else starts Clear Glass.`);
            resolve();
          });
          spawnReq.on('timeout', () => {
            spawnRequestOutcome = 'timeout';
            console.warn('[nexus] Clear Glass spawn request to autopilot :7799 timed out after 35s — autopilot may be unresponsive. Falling back to polling.');
            spawnReq.destroy();
            resolve();
          });
          spawnReq.end();
        });
        console.log('[nexus] requested Clear Glass spawn via autopilot :7799');
      } catch (_) { /* non-fatal by design, see comment above */ }

      const _tryOpen = () => new Promise((resolve, reject) => {
        const req = _http.request({
          hostname: '127.0.0.1', port: cgPort,
          path: '/open', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          timeout: 2000,
        }, r => { r.resume(); resolve(true); });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body); req.end();
      });
      let opened = false;
      let attemptsMade = 0;
      // §BUGFIX 2026-07-04: was 8 attempts x 2s = 16s total. Clear Glass's
      // real boot sequence (SSE :7701, IPC :7702, TLS proxy :7703, THEN 4
      // provider tabs loading sequentially, THEN the wire server :7704)
      // routinely takes longer than that on a real machine — so this
      // retry loop was giving up and falling back to the system browser
      // moments before Clear Glass would have succeeded on its own,
      // producing two genuinely different "open NEXUS" triggers (Clear
      // Glass's own default boot window, plus this fallback) instead of
      // one. 20 attempts x 3s = 60s gives real, comfortable margin.
      const MAX_ATTEMPTS = 20;
      const RETRY_DELAY_MS = 3000;
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !opened; attempt++) {
        attemptsMade = attempt + 1;
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          await _tryOpen();
          opened = true;
          // §BUGFIX 2026-08-28 — enriched with the real diagnostic detail
          // gathered above (spawnRequestOutcome, attempt count, elapsed
          // time), same real event this line already wrote, not a new
          // one — so even a SLOW-but-successful boot is now visible as
          // such instead of looking identical to an instant one.
          ledgerWrite('orchestrator', 'orchestrator.ui.opened', {
            url: uiUrl, via: 'clear-glass',
            spawnRequestOutcome, attempts: attemptsMade, elapsedMs: Date.now() - bootStartedAt,
          });
          console.log(`[nexus] UI opened in Clear Glass: ${uiUrl} (attempt ${attempt + 1})`);
        } catch (_) {
          console.log(`[nexus] Clear Glass :${cgPort} not ready yet (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`);
        }
      }
      if (opened) return;
      // §BUGFIX 2026-08-28 — James, directly: "it opens 127.0.0.1:9000...
      // that would be an event. It's opened every time since it's been
      // made." This was the real, precise gap: the success path above
      // has always written a real ledger event; this failure path only
      // ever did console.log — invisible to anything that isn't watching
      // stdout at the exact moment it happens. Same real event system,
      // same ledgerWrite() call, real diagnostic payload: whether the
      // autopilot spawn request itself succeeded (spawnRequestOutcome —
      // 'ok', an error code, 'timeout', or 'not_attempted' if this whole
      // try block threw before even getting there), how many poll
      // attempts ran, total elapsed time. A failed boot is now queryable
      // in the exact same place a successful one already was, instead of
      // only ever surfacing as a stdout line nobody was watching.
      ledgerWrite('orchestrator', 'orchestrator.ui.open_failed', {
        url: uiUrl, via: 'clear-glass', spawnRequestOutcome,
        attempts: attemptsMade, elapsedMs: Date.now() - bootStartedAt,
        reason: `Clear Glass :${cgPort} never became reachable after ${attemptsMade} attempt(s) over ~${Math.round((Date.now() - bootStartedAt) / 1000)}s`,
      });
      console.log(`[nexus] Clear Glass didn't start after ${MAX_ATTEMPTS * RETRY_DELAY_MS / 1000}s — falling back to system browser`);

      // Fallback: system browser
      const spawn   = spawnChild;
      const openers = [
        ['cmd', ['/c', 'start', '', uiUrl]],
        ['open', [uiUrl]],
        ['xdg-open', [uiUrl]],
      ];
      for (const [bin, args] of openers) {
        try {
          const proc = spawn(bin, args, { detached: true, stdio: 'ignore', shell: bin === 'cmd' });
          proc.on('error', () => {});
          proc.unref();
          ledgerWrite('orchestrator', 'orchestrator.ui.opened', { url: uiUrl, via: 'system-browser' });
          return;
        } catch (_) {}
      }
      console.log(`[nexus] UI available at ${uiUrl}`);
    },
  });

  const ownResult = await ownSeq.run();
  if (!ownResult.ok) process.exit(1);

  // ── Component Registry + UI Registry init ────────────────────────────────
  // Both are SOFT — failure never blocks orchestrator
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const compReg = require('../lib/component-registry');
    compReg.init(jaaDB, nexusBus);
    console.log('  [component-registry] ' + compReg.list().length + ' components loaded');
    // Auto-build blueprint-index right after registry is ready (§BP-01)
    try {
      const bi = require('../lib/blueprint-index');
      const biR = bi.build({ bus: nexusBus });
      console.log(`  [blueprint-index] ${biR.index?.totalComponents} components indexed across ${biR.index?.systemCount} systems`);
    } catch(be) { console.warn('  [blueprint-index] init skipped:', be.message); }
  } catch(e) {
    console.warn('  [component-registry] init skipped:', e.message);
  }

  // §PERSISTENCE-NODES 2026-09-16 — James: "how about .job .dispatch and
  // .response .artifact nodes for persistence?" Real endpoint this maps
  // to: GET /api/ledger above (system=clear-glass&n=...) — the durable,
  // on-disk, per-system ledger this same file writes (ledgerWrite,
  // LEDGER dict) and clear-glass's DOM-mutation stream + download-capture
  // now both feed (added this session). orchestrator is the real, always-
  // on process that actually SERVES this read, so it registers under its
  // own namespace here rather than a misleading 'clear-glass.artifact'
  // pointing at a port clear-glass doesn't even serve on. Same cross-
  // process path guardian/copilot/clear-glass now use — orchestrator is
  // its own OS process too (this file's own server.listen above), so this
  // can't be the in-process registerSelf() intelligence/index.js uses.
  try {
    const { registerSelfRemote } = require('../lib/self-register-remote.js');
    registerSelfRemote('orchestrator', [
      { name: 'artifact', description: 'real, durable per-agent-per-chatUrl artifact and DOM-mutation ledger (clear-glass downloads + DOM archaeology) — filter with ?system=clear-glass',
        route: { method: 'GET', path: '/api/ledger?system={system}&n={n}' } },
    ], { registeredBy: 'orchestrator/orchestrator.js' }).then((r) => {
      if (r.ok) console.log(`  [orchestrator] registered ${r.registered} capabilit${r.registered === 1 ? 'y' : 'ies'} with RAID (cortex)`);
      else console.warn(`  [orchestrator] RAID self-registration incomplete: ${r.error || (r.failed + ' failed')}`);
    });
  } catch (err) {
    console.warn('  [orchestrator] RAID self-registration failed:', err.message);
  }
  // §9.5 mutation contract (seam-component-registry-spec.md) — must init
  // before any CLI/API mutateProperty() call, or it fails loudly by design
  // (see lib/mutation-contract.js's audit-first ordering rationale).
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const mutationContract = require('./lib/mutation-contract');
    mutationContract.init(jaaDB, nexusBus);
    console.log('  [mutation-contract] ready');
  } catch(e) {
    console.warn('  [mutation-contract] init skipped:', e.message);
  }
  // Phase 31 remaining gap — misfire streak tracker, escalates to idearium
  // at 3 consecutive low-confidence grammar resolutions of the same pattern.
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const misfireTracker = require('./lib/grammar-misfire-tracker');
    misfireTracker.init(jaaDB);
    console.log('  [grammar-misfire-tracker] ready');
  } catch(e) {
    console.warn('  [grammar-misfire-tracker] init skipped:', e.message);
  }
  // Phase 35 — Quick Notes. postIdea reuses the same internal POST() helper
  // and the already-verified /api/idearium/ideas route (Phase 23.5 lockdown
  // respected — quick-notes never talks to idearium directly).
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const quickNotes = require('./lib/quick-notes');
    quickNotes.init(jaaDB, {
      broadcast: (payload) => broadcast(JSON.stringify(payload)),
      postIdea: (body) => POST('idearium', '/api/ideas', body),
    });
    console.log('  [quick-notes] ready');
  } catch(e) {
    console.warn('  [quick-notes] init skipped:', e.message);
  }
  // User model — was fully built and tested (copilot/lib/user-model.js, 24
  // tests) but never init'd by any live code: user_model_hypotheses had one
  // row, the lattice had zero. Wired here: init + hydrate from the REAL
  // chat_log history (no bus event fires on chat writes — lib/chat-logger.js
  // writes straight to JAA — so history hydration is the honest live feed),
  // plus the two real bus events that do exist for errors/gaps. The lattice's
  // own updates were silent no-ops until today's jaa-store string-where fix.
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const userModel = require('../copilot/lib/user-model');
    userModel.init(jaaDB);
    try { userModel.deriveFromChatLog(100); } catch(e) { console.warn('  [user-model] chat-log derive skipped:', e.message); }
    try {
      // Real chat_log schema (verified against the live 253 rows): one row
      // per exchange with { prompt, response, channel, intent } — NOT the
      // { role, content } turn format lib/chat-logger.js writes. The user's
      // words are in `prompt`.
      const exchanges = jaaDB.query('chat_log', r => r.prompt, 200);
      for (const ex of exchanges) userModel.recordIntent(ex.intent || 'chat', ex.prompt, ex.channel);
      console.log(`  [user-model] lattice hydrated from ${exchanges.length} real user prompts`);
    } catch(e) { console.warn('  [user-model] lattice hydration skipped:', e.message); }
    nexusBus.on('cortex.gap.found', (e) => {
      const gap = e?.payload?.gap;
      if (gap?.type) userModel.recordError(`${gap.type}: ${gap.body || ''}`, gap.source, gap.meta?.severity || 'medium');
    });
    nexusBus.on('copilot.error.detected', (e) => {
      const p = e?.payload || {};
      if (p.errorText || p.message) userModel.recordError(p.errorText || p.message, p.channel, p.severity || 'medium');
    });
    console.log('  [user-model] hypotheses + lattice live');
  } catch(e) {
    console.warn('  [user-model] init skipped:', e.message);
  }
  // Pressure relay — resource-monitor emits 'nexus.resource.pressure' on
  // THIS process's bus; the consumer (cortex/self-heal/escalation.js, which
  // maps it to the memory_pressure fault class) lives in the cortex process.
  // Relay over the same POST /api/event path guardian already uses. Built
  // 2026-07-20 from a live crash log: guardian+orchestrator both died
  // 0xC0000409 under 16.7% free memory two minutes after this event fired
  // with no consumer anywhere.
  try {
    nexusBus.on('nexus.resource.pressure', (e) => {
      POST('cortex', '/api/event', {
        type: 'nexus.resource.pressure',
        payload: e?.payload || e,
        source: 'orchestrator/resource-monitor',
      }).catch(() => {}); // cortex briefly down: supervisor handles it; next transition re-relays
    });
    console.log('  [pressure-relay] nexus.resource.pressure → cortex /api/event');
  } catch(e) {
    console.warn('  [pressure-relay] skipped:', e.message);
  }
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const uiReg = require('./lib/ui-registry');
    uiReg.init((type, payload) => {
      broadcast(JSON.stringify({ type, ...payload }));
    }, jaaDB);
    console.log('  [ui-registry] UI handshake active');
  } catch(e) {
    console.warn('  [ui-registry] init skipped:', e.message);
  }
  // Spec drift check — opens gaps for any spec/code version mismatch
  // SOFT: drift is a gap, not a crash. Boot continues regardless.
  try {
    const drift = require('./lib/spec-drift');
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const result = drift.check({ jaaDB, bus: nexusBus });
    const issues = (result.drifted||[]).length + (result.missing||[]).length;
    if (issues > 0) {
      console.warn('  [spec-drift] ⚠  ' + issues + ' gap(s) — ' + result.summary);
    } else {
      console.log('  [spec-drift] ✓  ' + result.summary);
    }
  } catch(e) {
    console.warn('  [spec-drift] check failed (non-fatal):', e.message);
  }

  // Living changelog — driven by real .spec version bumps (§5.4), not
  // hand-written prose per change. Idempotent: only writes when something
  // actually changed since last boot's snapshot.
  try {
    const changelog = require('./lib/changelog');
    const result = changelog.update();
    if (result.written) {
      console.log('  [changelog] ✓  ' + result.entries + ' new entr' + (result.entries===1?'y':'ies') + ' written to CHANGELOG.md');
    } else {
      console.log('  [changelog] ✓  no spec changes since last boot');
    }
  } catch(e) {
    console.warn('  [changelog] update failed (non-fatal):', e.message);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Record own boot to ledger
  // §5.4 fix 2026-08-08 — same drift as the CLI-open spot above: hardcoded
  // '3.0.0' independent of lib/version.js's services.orchestrator.
  const VERSION = require('../lib/version').services.orchestrator;
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
  // §FIX 2026-06-20 — double-spawn collision: when orchestrator.js is one of
  // several sibling processes already being spawned by something else
  // (npm run start:all via concurrently, or autopilot.js), that something
  // else is ALSO spawning bridge/cortex/guardian/idearium/architect/
  // diagnostic directly. _bootSystems() below does the exact same thing
  // internally, so both copies fight over the same ports (3748, 7820, 3747,
  // 7825, 4800, ...) and every one but the first to bind throws EADDRINUSE.
  // Plain `node orchestrator.js` (orchestrator as the *only* process) still
  // wants _bootSystems to run — that's its normal, working boot path. Set
  // NEXUS_SUPERVISED=1 in the environment of the orchestrator child only
  // (concurrently's command, or autopilot's spawn env) to skip this and let
  // the supervisor own spawning every sub-system itself.
  if (process.env.NEXUS_SUPERVISED) {
    console.log('[orchestrator] NEXUS_SUPERVISED set — skipping internal _bootSystems (sub-systems are being spawned by the supervisor instead)');
    return;
  }
  // _bootSystems hoisted to top-level
  _bootSystems(
    (system, type, payload) => {
      LEDGER[system] = LEDGER[system] || [];
      LEDGER[system].push({ type, payload, ts: Date.now() });
      // §SPLIT 2026-09-20 — routed per-system, same as ledgerWrite() above.
      const ledger = _getEventLedger(system);
      if (ledger) {
        try { ledger.record(type, payload, { source: system, causedBy: null }); }
        catch(e) { console.error('[orchestrator] §1.2 ledger.record:', e.message); }
      }
    },
    PORT,
    connectBridgeRelay,
    _eventLedger
  ).then(() => {
    // ── Universal boot snapshot (§2.1 — persistence baseline after all systems up) ──
    // Phase 8.6: snapshot the full system state once boot sequence completes.
    // This gives the rewind timeline a clean baseline after every cold start.
    try {
      const http = require('http');
      http.request({
        host: '127.0.0.1', port: PORT,
        path: '/api/cortex/snapshots/create', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            const d = JSON.parse(body);
            console.log(`[orchestrator] §2.1 boot snapshot — ${d.snapshot?.snapId || 'ok'}`);
          } catch(_) {}
        });
      }).on('error', () => {
        console.warn('[orchestrator] §2.1 boot snapshot: cortex not responding (non-fatal)');
      }).end(JSON.stringify({ message: 'orchestrator-boot-complete', type: 'boot' }));
    } catch(e) {
      console.warn('[orchestrator] §2.1 boot snapshot failed (non-fatal):', e.message);
    }
  }).catch(e => {
    console.error('[orchestrator] §1.2 _bootSystems error:', e.message);
  });
});
}
