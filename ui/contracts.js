/**
 * ui/contracts.js — NEXUS Interaction Contract Layer
 * UUID: nexus-ui-contracts-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Single source of truth for every system endpoint, port, expected
 * shape, and SSE event name. Derived directly from the four
 * interaction-contract.json files. Nothing in the UI hardcodes a
 * URL string except this file.
 *
 * §AXIOM: CLI = UI = API — same commands, same shapes, same ports.
 */

'use strict';

// ── Ports ─────────────────────────────────────────────────────────────────────
const PORTS = Object.freeze({
  orchestrator: 9000,
  bridge:       9999,
  cortex:       3748,
  guardian:     7820,
  guardian_ncp: 7820,
  idearium:     4800,
  emerge:       4242,
  ollama:       11434,
});

// ── Base URLs ─────────────────────────────────────────────────────────────────
const BASE = Object.freeze({
  orchestrator: `http://127.0.0.1:${PORTS.orchestrator}`,
  bridge:       `http://127.0.0.1:${PORTS.bridge}`,
  cortex:       `http://127.0.0.1:${PORTS.cortex}`,
  guardian:     `http://127.0.0.1:${PORTS.guardian}`,
  idearium:     `http://127.0.0.1:${PORTS.idearium}`,
  emerge:       `http://127.0.0.1:${PORTS.emerge}`,
  ollama:       `http://127.0.0.1:${PORTS.ollama}`,
});

// ── Orchestrator endpoints (:9000) ────────────────────────────────────────────
const ORCH = Object.freeze({
  health:     `${BASE.orchestrator}/health`,
  status:     `${BASE.orchestrator}/api/status`,
  recall:     `${BASE.orchestrator}/api/recall`,
  register:   `${BASE.orchestrator}/api/register`,
  registry:   `${BASE.orchestrator}/api/registry`,
  heartbeat:  `${BASE.orchestrator}/api/heartbeat`,
  ledger:     `${BASE.orchestrator}/api/ledger`,
  channels:   `${BASE.orchestrator}/api/channels`,
  bus:        `${BASE.orchestrator}/api/bus`,
  exec:       `${BASE.orchestrator}/api/exec`,
  apiMap:     `${BASE.orchestrator}/api/api-map`,
  sse:        `${BASE.orchestrator}/sse`,
  // Proxied routes — orchestrator forwards to systems
  // INT-06: proxy helpers require leading slash in path, e.g. proxy.bridge('/health')
  proxy: {
    cortex:    (path) => `${BASE.orchestrator}/api/cortex${path.startsWith('/') ? path : '/' + path}`,
    guardian:  (path) => `${BASE.orchestrator}/api/guardian${path.startsWith('/') ? path : '/' + path}`,
    idearium:  (path) => `${BASE.orchestrator}/api/idearium${path.startsWith('/') ? path : '/' + path}`,
  },
});

// ── Bridge endpoints (:9999) ──────────────────────────────────────────────────
const BRIDGE = Object.freeze({
  health:     `${BASE.bridge}/health`,
  sse:        `${BASE.bridge}/bridge/sse`,
  handshake:  `${BASE.bridge}/bridge/handshake`,
  request:    `${BASE.bridge}/bridge/request`,
  event:      `${BASE.bridge}/bridge/event`,
  requests:   `${BASE.bridge}/bridge/requests`,
  registry:   `${BASE.bridge}/bridge/registry`,
  circuits:   `${BASE.bridge}/bridge/circuits`,
  revoke:     `${BASE.bridge}/bridge/revoke`,
  contract:   `${BASE.bridge}/bridge/contract`,
  tags:       `${BASE.bridge}/bridge/tags`,
  stats:      `${BASE.bridge}/bridge/stats`,
  broadcast:  `${BASE.bridge}/bridge/broadcast`,
  subscribe:  `${BASE.bridge}/bridge/subscribe`,
});

// ── Guardian endpoints (:7820) ────────────────────────────────────────────────
// Transport: HTTP + NCP (SSE server→client, fetch POST client→server)
// NCP replaces WebSocket entirely. No TLS required for localhost.
const GUARDIAN = Object.freeze({
  health:     `${BASE.guardian}/health`,
  contract:   `${BASE.guardian}/contract`,
  events:     `${BASE.guardian}/events`,           // SSE — live job stream
  bus:        `${BASE.guardian}/bus`,
  busEmit:    `${BASE.guardian}/bus/emit`,

  // NCP channel — provider tabs open this SSE to receive jobs
  // GET /channel?provider=claude&tabId=XYZ
  ncp: {
    channel:   `${BASE.guardian}/channel`,
    result:    `${BASE.guardian}/result`,
    heartbeat: `${BASE.guardian}/heartbeat`,
  },

  // Job dispatch — three-leg async flow:
  //   POST /command → { ok, jobId, status }
  //   poll GET /status/:jobId until complete=true
  //   GET /response/:jobId → { response, status }
  command:    `${BASE.guardian}/command`,
  cliExec:    `${BASE.guardian}/cli/exec`,
  jobStatus:  (id) => `${BASE.guardian}/status/${id}`,
  jobResponse:(id) => `${BASE.guardian}/response/${id}`,
  jobs:       `${BASE.guardian}/jobs`,
  providers:  `${BASE.guardian}/providers`,
  artifacts:  `${BASE.guardian}/artifacts`,
  gaps:       `${BASE.guardian}/gaps`,
  gapsSummary:`${BASE.guardian}/gaps/summary`,
  sessions:   `${BASE.guardian}/sessions`,
  ledger:     `${BASE.guardian}/ledger`,
  settings:   `${BASE.guardian}/settings`,

  // SEAM queue
  seam: {
    queues:    `${BASE.guardian}/seam/queues`,
    sessions:  `${BASE.guardian}/seam/sessions`,
    queue:     (id) => `${BASE.guardian}/seam/queues/${id}`,
  },

  // Physical queue compartments
  queue: {
    compartments: `${BASE.guardian}/queue/compartments`,
    compartment:  (id) => `${BASE.guardian}/queue/compartments/${id}`,
    // CON-03: note — Guardian routes have no /api/ prefix; verify against Guardian route table
    progress:     (id) => `${BASE.guardian}/queue/${id}/progress`,
  },

  // Memory
  memory: {
    ledger:    `${BASE.guardian}/memory/ledger`,
    artifacts: `${BASE.guardian}/memory/artifacts`,
    stats:     `${BASE.guardian}/memory/stats`,
    context:   `${BASE.guardian}/memory/context`,
    downloads: `${BASE.guardian}/memory/downloads`,
    search:    `${BASE.guardian}/memory/search`,
  },

  // CLI commands — all go to /cli/exec with { command: 'raw string' }
  // Valid commands: jobs, artifacts, gaps, sessions, providers,
  //                 health, stats, ledger, settings, set, send, seam, version, bus
  // AI dispatch from CLI: 'send <provider> <prompt>'
  cli: {
    commands: ['jobs','artifacts','gaps','sessions','providers',
               'health','stats','ledger','settings','set',
               'send','seam','version','bus'],
    dispatch: 'send',   // 'send <provider> <prompt...>'
  },
});

// ── Cortex endpoints (:3748) ──────────────────────────────────────────────────
// §2.1 — Cortex is the memory. Append-only. Nothing deleted.
// 28 JAA tables, all on disc.
const CORTEX = Object.freeze({
  health:     `${BASE.cortex}/health`,
  contract:   `${BASE.cortex}/contract`,
  sse:        `${BASE.cortex}/sse`,               // live event_log stream

  events:     `${BASE.cortex}/api/events`,        // GET ?n=50
  gaps:       `${BASE.cortex}/api/gaps`,          // GET ?status=open|resolved|ignored
  failures:   `${BASE.cortex}/api/failures`,
  memory:     `${BASE.cortex}/api/memory`,        // GET ?table=event_log&n=50
  memSearch:  `${BASE.cortex}/api/memory/search`, // POST { q }
  memForget:  `${BASE.cortex}/api/memory/forget`, // POST { uuid }
  event:      `${BASE.cortex}/api/event`,         // POST { type, payload, source }
  modules:    `${BASE.cortex}/api/modules`,
  ring:       `${BASE.cortex}/api/ring`,
  requests:   `${BASE.cortex}/api/requests`,
  snapshots:  `${BASE.cortex}/api/snapshots`,
  tools:      `${BASE.cortex}/api/tools`,
  toolsExec:  `${BASE.cortex}/api/tools/exec`,
  cliExec:    `${BASE.cortex}/api/cli/exec`,

  resilience: {
    status:  `${BASE.cortex}/api/resilience/status`,
    run:     `${BASE.cortex}/api/resilience/run`,
  },
  selfHeal: {
    status:  `${BASE.cortex}/api/self-heal/status`,
  },
  contract_audit: {
    agents:     `${BASE.cortex}/api/contract/agents`,
    violations: `${BASE.cortex}/api/contract/violations`,
    audit:      `${BASE.cortex}/api/contract/audit`,
    check:      `${BASE.cortex}/api/contract/check`,
  },

  // JAA tables available via GET /api/memory?table=X
  tables: [
    'event_log','agent_calls','agent_signatures',
    'artifacts','gaps','failures','fix_map','memory_index','memory_queries',
    'conditioning_log','feedback_scores','crystals','bep_patterns',
    'active_traces','orion_sessions','versionium_commits','versionium_branches',
    'versionium_file_index','versionium_calendar','versionium_objects',
    'schedules','workflow_runs','project_registry','shape_samples',
    'poll_log','requests','cortex_memory',
  ],
});

// ── Idearium endpoints (:4800) ────────────────────────────────────────────────
// Ideas live on disc (idearium.json) AND in cortex project_registry.
// §AXIOM: Idearium is the spec layer. Cortex is the memory layer.
const IDEARIUM = Object.freeze({
  health:    `${BASE.idearium}/health`,
  sse:       `${BASE.idearium}/sse`,

  ideas: {
    list:    `${BASE.idearium}/api/ideas`,         // GET ?phase&tag&sort&limit&search
    create:  `${BASE.idearium}/api/ideas`,         // POST { text, tags, compartment }
    show:    (id) => `${BASE.idearium}/api/ideas/${id}`,
    update:  (id) => `${BASE.idearium}/api/ideas/${id}`,  // PATCH
    tension: (id) => `${BASE.idearium}/api/ideas/${id}/tension`,
    link:    (id) => `${BASE.idearium}/api/ideas/${id}/link`,
    spec:    (id) => `${BASE.idearium}/api/ideas/${id}/spec`,
    phase:   (id) => `${BASE.idearium}/api/ideas/${id}/phase`,
    archive: (id) => `${BASE.idearium}/api/ideas/${id}`,   // DELETE
  },
  specs: {
    list:    `${BASE.idearium}/api/specs`,
    show:    (id) => `${BASE.idearium}/api/specs/${id}`,
    update:  (id) => `${BASE.idearium}/api/specs/${id}`,   // PATCH
    build:   (id) => `${BASE.idearium}/api/specs/${id}/build`,
    export:  (id) => `${BASE.idearium}/api/specs/${id}/export`,
  },
  gaps: {
    list:    `${BASE.idearium}/api/gaps`,
    open:    `${BASE.idearium}/api/gaps`,                  // POST
    show:    (id) => `${BASE.idearium}/api/gaps/${id}`,
    resolve: (id) => `${BASE.idearium}/api/gaps/${id}/resolve`,
    ignore:  (id) => `${BASE.idearium}/api/gaps/${id}/ignore`,
  },
  snapshots: {
    list:   `${BASE.idearium}/api/snapshots`,
    push:   `${BASE.idearium}/api/snapshots`,              // POST
    diff:   (a,b) => `${BASE.idearium}/api/snapshots/${a}/diff/${b}`,
  },
  events:   `${BASE.idearium}/api/events`,
  snr:      `${BASE.idearium}/api/snr`,

  // Idea phases in order
  phases: ['seed','expanding','tensioned','specced','building','complete','archived'],

  // SNR weight reference (from idearium/core/index.js)
  snrWeights: {
    'spec.built':     1.0,
    'spec.created':   0.95,
    'push.complete':  0.95,
    'gap.resolved':   0.85,
    'idea.created':   0.9,
    'ci.run':         0.9,
    'idea.linked':    0.65,
    'spec.updated':   0.6,
    'idea.updated':   0.5,
    'idea.tensioned': 0.7,
  },
});


// ── CFR endpoints — per-kernel field state (:3748 cortex, :7820 guardian) ────
// CFR is baked into every kernel's event ledger. Not a separate service.
// Each kernel exposes /cfr/* routes on its own port.
const CFR = Object.freeze({
  // Intelligence kernel CFR (cortex no longer hosts a CFR surface: it only ever served /cfr/health and
  // /cfr/field as a relay of the orchestrator's field; that relay was removed 2026-09-19)
  intelligence: {
    health:  `http://127.0.0.1:3753/cfr/health`,
    state:   `http://127.0.0.1:3753/cfr/state`,
    field:   `http://127.0.0.1:3753/cfr/field`,
    nodes:   `http://127.0.0.1:3753/cfr/nodes`,
    deltas:  `http://127.0.0.1:3753/cfr/deltas`,
    emit:    `http://127.0.0.1:3753/cfr/emit`,
    sse:     `http://127.0.0.1:3753/cfr/stream`,
  },
  // Guardian kernel CFR
  guardian: {
    health:  `${BASE.guardian}/cfr/health`,
    state:   `${BASE.guardian}/cfr/state`,
    field:   `${BASE.guardian}/cfr/field`,
    nodes:   `${BASE.guardian}/cfr/nodes`,
    deltas:  `${BASE.guardian}/cfr/deltas`,
    emit:    `${BASE.guardian}/cfr/emit`,
    sse:     `${BASE.guardian}/cfr/stream`,
  },
  // Orchestrator kernel CFR
  orchestrator: {
    health:  `${BASE.orchestrator}/cfr/health`,
    state:   `${BASE.orchestrator}/cfr/state`,
    field:   `${BASE.orchestrator}/cfr/field`,
    nodes:   `${BASE.orchestrator}/cfr/nodes`,
    deltas:  `${BASE.orchestrator}/cfr/deltas`,
    emit:    `${BASE.orchestrator}/cfr/emit`,
    sse:     `${BASE.orchestrator}/cfr/stream`,
  },
});

// ── Ollama endpoints (:11434) ─────────────────────────────────────────────────
const OLLAMA = Object.freeze({
  health: `${BASE.ollama}/api/tags`,
  tags:   `${BASE.ollama}/api/tags`,
  gen:    `${BASE.ollama}/api/generate`,
  chat:   `${BASE.ollama}/api/chat`,
});

// ── SSE event names the UI subscribes to ─────────────────────────────────────
const SSE_EVENTS = Object.freeze({
  // Orchestrator SSE (/sse)
  orch: [
    'orchestrator.booted',
    'orchestrator.system.registered',
    'orchestrator.watchdog.tick',
    'orchestrator.pulse',    // emitted on every heartbeat beat — carries health snapshot
    'orchestrator.ui.hotswap',
    'system.online',
    'system.offline',
  ],
  // Cortex SSE (/sse) — pushes event_log rows
  cortex: [
    'cortex.gap.found',
    'cortex.gap.resolved',
    'cortex.memory.updated',
    'cortex.event.stored',
  ],
  // Guardian SSE (/events) — live job stream
  guardian: [
    'guardian.job.queued',
    'guardian.job.dispatched',
    'guardian.job.complete',
    'guardian.artifact',
    'guardian.gaps',
    'guardian.provider.connected',
    'guardian.provider.disconnected',
    'guardian.seam.queue.complete',
    'guardian.baseline.deviation',
    'ncp.client.evicted',    // stale provider tab evicted by pulse system
    'ncp.dom.systems',       // DOM capability report from provider tab
  ],
  // Idearium SSE (/sse)
  idearium: [
    'idea.created',
    'idea.updated',
    'spec.created',
    'spec.built',
    'gap.resolved',
  ],
});

// ── Job status machine ────────────────────────────────────────────────────────
// Guardian job lifecycle: queued → dispatching → generating → complete | failed
const JOB_STATES = Object.freeze({
  QUEUED:      'queued',
  DISPATCHING: 'dispatching',
  GENERATING:  'generating',
  COMPLETE:    'complete',
  DONE:        'done',
  FAILED:      'failed',
  ERROR:       'error',
  WAITING:     'queued_waiting_for_provider',
});

// SEAM compartment states (from SEAM queue state machine)
const SEAM_STATES = Object.freeze({
  QUEUED:    'QUEUED',
  INJECTED:  'INJECTED',
  GENERATING:'GENERATING',
  STABLE:    'STABLE',
  VERIFIED:  'VERIFIED',
  FAILED:    'FAILED',
  RETRYING:  'RETRYING',
  SKIPPED:   'SKIPPED',
});

// ── Request timeout budgets (ms) ─────────────────────────────────────────────
const TIMEOUTS = Object.freeze({
  health:    2500,   // health checks — fast fail
  read:      5000,   // read-only queries
  write:     8000,   // mutations
  dispatch: 10000,   // job dispatch (returns jobId, not result)
  poll:      3000,   // job status polls
  ai:       90000,   // wait for AI response (poll every 600ms, max 150 polls)
  ollama:   60000,   // local ollama — slower model loads
  sse:          0,   // SSE — no timeout (held open)
});

// ── Poll config ───────────────────────────────────────────────────────────────
const POLL = Object.freeze({
  intervalMs: 600,
  maxPolls:   150,   // 150 × 600ms = 90s max
});

// ── Pulse config ──────────────────────────────────────────────────────────────
// Pulse = active heartbeat system. Every system sends POST /api/heartbeat
// to orchestrator on PULSE.orchIntervalMs. Provider browser tabs send
// POST /heartbeat to Guardian NCP on PULSE.ncpIntervalMs.
//
// Stale detection:
//   system:   missed > PULSE.orchMissLimit beats → orchestrator marks offline
//   provider: lastHeartbeat > PULSE.ncpStaleMs → NCP evicts from _clients
//   UI:       orchPulse.online=false after PULSE.orchMissLimit misses → dots go grey
const PULSE = Object.freeze({
  // Orchestrator pulse (system→orch, ui→orch)
  orchIntervalMs: 10000,  // 10s between beats
  orchTimeoutMs:  3000,   // give up on a single beat after 3s
  orchMissLimit:  3,      // 3 consecutive misses (30s) before declaring offline
  orchStaleMs:    35000,  // registry entry older than this = stale

  // NCP pulse (browser tab → Guardian)
  ncpIntervalMs:  5000,   // 5s — tighter because tab loss is time-sensitive
  ncpTimeoutMs:   3000,
  ncpStaleMs:     30000,  // 30s without heartbeat = evict from NCP _clients
  ncpCheckMs:     15000,  // run evictStale every 15s

  // SSE events emitted on each pulse
  events: {
    orchPulse:  'orchestrator.pulse',
    ncpPulse:   'NCP_PULSE',
    evicted:    'ncp.client.evicted',
    missed:     'pulse.missed',
    received:   'pulse.received',
  },
});

// Export — works in both browser (window.NX) and Node require()
const CONTRACTS = {
  PORTS, BASE, BRIDGE, ORCH, GUARDIAN, CORTEX, IDEARIUM, OLLAMA, CFR,
  SSE_EVENTS, JOB_STATES, SEAM_STATES, TIMEOUTS, POLL, PULSE,
};

if (typeof window !== 'undefined') window.NX = CONTRACTS;
if (typeof module !== 'undefined') module.exports = CONTRACTS;
