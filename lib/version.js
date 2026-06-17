'use strict';
/**
 * lib/version.js — NEXUS Canonical Version Registry
 * UUID: nexus-version-registry-v1-0000-4000-0000-000000000001
 *
 * Single source of truth for all system and module versions.
 * Every module imports from here — no hardcoded version strings scattered
 * across 265 files. VERSION.system is the platform release.
 * VERSION.modules[name] is the module's own semver.
 *
 * Bump rules:
 *   PATCH (+0.0.1) — bug fixes, no new API surface
 *   MINOR (+0.1.0) — new capability, backward compatible
 *   MAJOR (+1.0.0) — breaking change, API incompatibility
 *
 * System version bump = new zip release.
 * Module version bump = that module's contract changed.
 */

const VERSION = {

  // ── System ──────────────────────────────────────────────────────────────────
  // The full NEXUS platform version. Matches package.json.
  system: '0.7.1',

  // ── Services ────────────────────────────────────────────────────────────────
  // Each service running on a port.
  services: {
    orchestrator: '2.0.0',   // :9000 — root coordinator, contract verification
    bridge:       '3.0.0',   // :9999 — trust relay, circuit breaker
    cortex:       '3.0.0',   // :3748 — memory, organs, intelligence, RAID
    guardian:     '3.6.0',   // :7820 — AI engine, NCP, SEAM, provider routing
    idearium:     '3.0.0',   // :4800 — idea manager, project repo, lattice
    architect:    '1.0.0',   // :3747 — spec builder, hook registry
    emerge:       '1.0.0',   // :4242 — DSL runtime, .eg compiler
    diagnostic:   '1.0.0',   // :7825 — 12-engine diagnostic suite
  },

  // ── Core modules ─────────────────────────────────────────────────────────────
  modules: {
    // Memory
    'jaa-db':           '6.0.0',
    'vector-memory':    '1.0.0',   // SNR-gated semantic search
    'chat-logger':      '1.0.0',   // conversation logging + context reinjection
    'context-builder':  '1.0.0',
    'component-registry':'1.0.0',   // Phase 1 complete
    'ui-registry':      '1.0.0',   // Phase 2 complete — UI handshake

    // Intelligence
    'raid':             '6.0.0',   // provider routing, cluster chains
    'intelligence':     '1.0.0',   // pattern crystallisation
    'heartbeat':        '2.0.0',   // 3-tier: health + API pulse + telemetry

    // Self-heal
    'self-heal':        '1.0.0',
    'escalation':       '1.1.0',   // named+typed stale_module gaps, gapLabel in all logs
    'gap-finder':       '1.1.0',   // stale_module: named module, port, staleSec, typed severity
    'snapshot':         '1.1.0',   // NEX-SNAP/1.1: system_state, blackbox, macro, resume fields
    'divergence-watcher':'1.0.0',  // sigma threshold watcher, 90s cooldown, blackbox pre+post
    'macro-compiler':   '1.0.0',   // causal macro from pattern engine: chain, precursors, trajectory

    // Forge
    'forge':            '1.0.0',   // patch + gate + scaffold + seamDispatch
    'seam':             '1.0.0',

    // Auth
    'auth':             '1.0.0',   // RSA-2048 + AES-256-GCM + SNR gate

    // Diagnostic
    'diagnostic-engines': '1.0.0', // 12 cross-domain methods

    // Spec / Build
    'spec-compiler':    '1.1.0',
    'blueprint':        '1.0.0',

    // UI
    'builder':          '1.0.0',
    'spec-drift':       '1.0.0',   // spec version drift detector
    'behavioral-boundary':'1.0.0', // behavioral boundary organ — INV-A/B/C
    'grammar-engine':   '1.0.0',   // Phase 5 — trie, resolve, complete, parseParams
    'cli-reasoning':    '1.0.0',   // Qwen 0.5b — rephrase, gap, correction, agent check
    'liminal-space':    '1.0.0',   // Phase 7 — 5 interstitial spaces, crystallisation, forward inference
    'raid-snr-filter':  '1.0.0',   // Phase 8 — invariants first, patterns second, AI last
    'intelligence-bridge':'1.0.0', // Phase 8.5 — intelligence fully wired into RAID
    'replay-engine':    '1.1.0',   // Phase 8.6 — 16/16 tests, orchestrator boot wiring
    'open-loop-taxonomy':'1.0.0',  // Phase 8.6 — 10-type loop taxonomy, legacy type map
    'loop-topology':    '1.0.0',   // Phase 8.6 — focal point detection, leverage scoring
    'gap-loop':         '1.0.0',   // Phase 8.6 — continuous resolution loop, RAID-routed
    'request-handler':  '1.0.0',   // Phase 9 — constitutional choke point, ABCD pipeline
  },

  // ── Roadmap — phases 10-17 ────────────────────────────────────────────────────
  roadmap: {
    'Phase 10': {
      name: 'Constitutional AI',
      status: 'pending',
      summary: 'lib/constitutional-ai.js — goal graph, identity kernel. USER_AUTONOMY, REVERSIBILITY, TRUTH_OVER_COHERENCE, EXPLAINABILITY as typed axiom objects. Decision tree with cost + blast-radius. Wired into request-handler Phase A.',
    },
    'Phase 11': {
      name: 'Reflection Engine',
      status: 'pending',
      summary: 'lib/reflection.js — UNRESOLVED as first-class state. Every decision gets a reason, an outcome, and a satisfaction score. Pattern: did this work? Feed back into RAID weights. Self-model update loop.',
    },
    'Phase 12': {
      name: 'User Model',
      status: 'pending',
      summary: 'Hypotheses not profile. confidence + evidence on every observation. BDA baseline integration. Tracks preferences, pace, communication style. Never stores as fact — only as weighted belief.',
    },
    'Phase 13': {
      name: 'Autonomous Loop',
      status: 'pending',
      summary: 'Ollama as the brain. Goal + Budget + Boundary + Exit required before any autonomous run. Agent fallback with full context injection. Rewind on failure. gap-loop becomes the execution spine.',
    },
    'Phase 14': {
      name: 'Hot Module Loader',
      status: 'pending',
      summary: 'Immune system model. Drop file → prove → integrate live. No restart required. Every module gets a UUID + bus hook on load. Replaces emerge module loading.',
    },
    'Phase 15': {
      name: 'Grammar Engine CLI + Component System',
      status: 'pending',
      summary: 'grammar-engine.js hooked into: CLI autocomplete (nexus-repl.js tab completion), component system registry (UI commands), guardian dispatch (command parsing before NCP). Custom component commands per system. Grammar tree expands from component-registry on boot.',
    },
    'Phase 16': {
      name: 'Idearium ↔ Repo ↔ Spec Builder ↔ Architect',
      status: 'pending',
      summary: 'Idearium ideas promote to specs (POST /api/ideas/:uuid/promote → spec). Specs flow to spec-builder UI (architect). Architect registers hooks into hook-registry. Component-registry reflects built hooks. Git repo integration: ideas link to commits via versionium. Full pipeline: idea → tension → spec → hook → component → commit.',
    },
    'Phase 17': {
      name: 'Userscript Heartbeat Pulse',
      status: 'pending',
      summary: 'Userscript pill/UI gets a ♥ heart icon that pulses (CSS animation) on every NCP SSE emit. Each system tile in the TV shell Overview flashes its icon on each event received from that system. Wired via the SSE event source — no polling.',
    },
  },

    'Phase 18': {
      name: 'System State VM — Full Suspend/Resume',
      status: 'planned',
      summary: `
The entire NEXUS runtime becomes a suspendable virtual machine, like VMware snapshots.

WHAT IT MEANS:
  Every .nex file becomes a complete VM image — not just JAA tables, but:
    process.*: PID, heap, uptime, open sockets, pending timers
    module registry: every organ's last known state + config
    bus state: in-flight events at suspend time, in-order replay on resume
    SSE connections: client list + last event IDs (reconnect on resume)
    open gaps: full gap tree with escalation history
    forge queue: pending patches, their forge context, applied order
    CFR field: coherence/friction/entropy snapshot at suspend moment
    RAID weights: current routing table so first request after resume is correct

HOW .nex BECOMES A VM IMAGE (format NEX-VM/1.0):
  New field: runtime_state { suspendedAt, pid, heap, sockets, pendingTimers[] }
  New field: bus_queue — in-flight events serialized in emit order
  New field: module_states — each organ's init config + last tick state
  New field: forge_queue — pending patches + applied order
  New field: resume_plan — ordered list of what to restart and in what order

RESUME SEQUENCE:
  1. Load .nex, verify format NEX-VM/1.0
  2. Restore JAA tables (existing rollback logic)
  3. Restore module configs (restart organs in recorded order)
  4. Re-inject bus_queue (replay in-flight events)
  5. Restore SSE: send X-Last-Event-ID to reconnecting clients
  6. Mark resume in event_log: { type: 'vm.resumed', snapId, suspendedAt, resumedAt }

AUTO-SUSPEND TRIGGERS (beyond manual):
  - sigma >= 0.80 sustained for 30s (critical divergence — preserve state before cascade)
  - System receives SIGTERM/SIGINT (graceful shutdown = suspend, not kill)
  - Escalation reaches failure mode on a CRITICAL_MODULE (cortex, orchestrator, guardian)
  - User sends 'suspend' via NEXUS CLI or TV shell assistant

HALF-LIFE RULES for VM images:
  VM images are heavier than snapshots — separate decay schedule:
    < 48h: keep all   2d-7d: keep 1/2   7d-14d: keep 1/4   > 14d: keep only pinned
  VM images from divergence events get priority over routine boots.`,
    },

    'Phase 19': {
      name: 'Build From Inside — Live System Editor',
      status: 'planned',
      summary: `
Build and modify NEXUS from within NEXUS itself. The system can edit its own source,
hot-reload modules, and verify changes — all without stopping the runtime.

THREE MODES:

  1. IN-PROCESS HOT PATCH (emerge-ide channel 8 in TV shell)
     Architect module exposes a file editor API (:3747/api/edit).
     Hot Module Loader (Phase 14) watches for writes → prove → integrate.
     The TV shell "Emerge IDE" channel shows:
       - Active file tree (editable inline)
       - SISO bus live stream (what's flowing right now)
       - Compile output + gap list
       - One-click "patch & reload" per module

  2. SPEC-FIRST BUILDER (Idearium → Architect → Emerge pipeline)
     Idea → promote to spec → spec-builder UI → architect hook → hot-load.
     Every spec change is a versionium commit — full git history.
     The TV shell "Forge" overlay shows the pipeline state.

  3. META LAYER COMMAND SURFACE (Phase 20 prerequisite)
     Any module can be described as a typed spec (input/output/axioms).
     The meta layer can generate a new module from a spec.
     Output goes to forge → hot-load → verify → integrate or revert.

WHAT "BUILD FROM INSIDE" MEANS FOR ESCALATION:
  When escalation reaches level 3.5 (agent consult), instead of just dispatching
  to Guardian, it can open the module's spec in the IDE and let the agent
  EDIT THE SOURCE DIRECTLY — with the divergence-watcher holding a VM snapshot
  as rollback. If the edit passes prove + health check, it hot-loads.
  If it fails, VM rollback in one click.`,
    },

    'Phase 20': {
      name: 'Meta Command Surface — Build System From Above',
      status: 'planned',
      summary: `
A UI layer ABOVE the system — not a channel in the TV shell, but a separate
meta-view that shows the entire NEXUS topology as a live graph, with the ability
to add, modify, or remove modules by describing them in natural language.

THE TOPOLOGY VIEW:
  Nodes: every service + organ + module, colored by health/sigma
  Edges: every bus connection, API call, SSE stream, JAA table dependency
  Live: sigma scores pulse on nodes, delta values animate on edges
  Snapshot dots: .nex files float on a timeline beneath the graph — click to inspect

FROM ABOVE, YOU CAN:
  "Add a rate limiter to Guardian's dispatch queue"
    → meta layer generates a spec → spec flows to architect → hook registered
    → module generated → hot-loaded → connection appears in topology view

  "Move Cortex's pattern scan to run every 30s instead of 60s"
    → meta layer finds the config → proposes the edit → shows diff in topology
    → confirm → hot-patch live, no restart

  "What broke the last 3 times sigma hit 0.8?"
    → macro-compiler runs → causal chain displayed as highlighted path in graph
    → precursor events shown as animated sequence on the timeline

  "Suspend and save a clean VM image before I experiment"
    → Phase 18 suspend triggered → VM image pinned → experiment freely
    → one click to restore

THE BUILD-FROM-ABOVE FLOW:
  Natural language intent → grammar engine (Phase 15) → request-handler (Phase 9)
  → spec generator → architect → forge → hot-load → verify → topology update

This is the constitutional layer of the IDE: you describe what you want,
the system builds it, and the meta layer shows you the result in context
of the entire running system.`,
    },

    'Phase 21': {
      name: 'Persistent VM Checkpoints — Time Travel Debugging',
      status: 'planned',
      summary: `
Combines Phase 18 (VM state) with Phase 19 (build from inside) to create
time-travel debugging: you can jump to any point in the system's history,
inspect it, modify it, and fork a new timeline from there.

CHECKPOINT RING:
  Every 10 minutes, a lightweight VM checkpoint is written (NEX-VM/1.0).
  On divergence, a full-fidelity checkpoint is forced (+ blackbox + macro).
  Checkpoints form a ring — the timeline visible in the Rewind overlay.

FORK A TIMELINE:
  Select a checkpoint in the Rewind UI → "Fork from here"
  System spins up a SECOND RUNTIME on alternate ports (9001, 3749, 7821...)
  Original runtime keeps running — no interruption
  You can diff the two runtimes live in the meta topology view

TIME-TRAVEL DEBUGGING:
  Jump to the moment 5min before a divergence
  The system state is exactly as it was
  You can replay events forward (deterministic from checkpoint)
  You can inject synthetic events to test "what if we had handled this differently"
  Replay engine (Phase 8.6) + VM state = exact reconstruction

SEAM AS TIME MACHINE:
  Every SEAM chunk already has a seam_ts as source of truth
  Checkpoints annotate which seam_ts they correspond to
  "Show me what the system looked like when this SEAM job was dispatched"
  → jump to checkpoint → inspect → return`,
    },
  meta: {
    layer:           '1.2.0',   // meta/index.js
    'topo-kernel':   '1.0.0',   // 8-gate SNR pipeline
    'telemetry-codec':'1.0.0',  // SlopeEngine + DriftEngine + Runtime
    'liminal':       '1.0.0',   // 12 gap detectors
    'alk-perception':'1.0.0',   // composite behavioral state classifier
    'spatial':       '1.0.0',   // sigma + lattice
    'bda':           '1.0.0',   // Behavioral Drift Analyzer
  },

  // ── Userscripts (Tampermonkey) ───────────────────────────────────────────────
  // These are deployed artifacts — version tracked separately from the platform.
  // Bump when the userscript's interface or behaviour changes.
  userscripts: {
    claude:     '10.1.0',  // added: NEXUS tab (memory + RAID + self-heal hooks)
    chatgpt:    '9.1.0',   // added: compact NEXUS tab
    gemini:     '1.0.0',   // initial — NCP + NEXUS widget
    perplexity: '1.0.0',   // initial — NCP + citation extraction + NEXUS widget
    ollama:     '1.0.0',   // NCP fallback via GM_xmlhttpRequest
  },

  // ── Changelog (last 5 entries) ───────────────────────────────────────────────
  changelog: [
    { version:'0.7.1', date:'2026-06-17', summary:'Bug fixes: emerge Bus.onAny added (emerge-ide SSE push now works), idearium/core/index.js re-export stub restored (idearium boots again). Named stale_module gaps: gap-finder now encodes module name+port+staleSec+typed-severity into every gap; escalation logs show [moduleName:port] not just fault class. NEX-SNAP format → v1.1 with system_state/blackbox_pre/blackbox_post/macro/resume fields. Divergence watcher: sigma>=0.65 or spike+0.20 triggers auto-snapshot with 90s cooldown, 10min blackbox capture + 30s post-capture, async macro compilation via intelligence pattern engine. Phases 18-21 added to roadmap: VM suspend/resume, build from inside, meta command surface, time-travel debugging.' },
    { version:'0.7.0', date:'2026-06-16', summary:'Phase 9: request-handler (constitutional choke point) — Phase A (intent→goal→constitution→cost→ALLOW/DEFER/DENY/CLARIFY/HELD/UNRESOLVED), Phase B (grammar→SNR→memory→RAID), Phase C (reflect: decision+reason+outcome), Phase D (learn: memory update→gap registration→RAID weight feedback). POST /api/request wired. USER_AUTONOMY, REVERSIBILITY, TRUTH_OVER_COHERENCE, EXPLAINABILITY axioms enforced.' },
    { version:'0.6.4', date:'2026-06-16', summary:'Phase 8.6 complete: replay engine 16/16 tests, universal boot snapshot wired into orchestrator, self-heal logs decisions to replay engine, diagnose checks snapshot+replay health. New: open-loop-taxonomy (10 types), loop-topology (focal point detection, leverage scoring), gap-loop (continuous RAID-routed resolution). Guardian fixes: SISOStream hoisted, gap dedup terminal states, escalation log table, level0 query, level1 restart+probe, level3.5 agent consult. TV shell UI with bottom menu, rewind timeline (sigma-colored, delta-positioned). 23,705 dead lines removed.' },
    { version:'0.5.0', date:'2026-06-15', summary:'Meta layer (6 modules: topo-kernel/telemetry-codec/liminal/alk/spatial/bda), vector memory (SNR-gated semantic search), chat logger + context reinjection, diagnostic engines (12 methods), escalation ladder (5 levels, friction ledger), RAID expansion (9 clusters, 5 providers via NCP), 4 userscripts with NEXUS tab (memory/RAID/self-heal hooks), seamDispatch (qwen2.5-coder primary), chat-log + failure-modes + friction JAA tables' },
    { version:'0.4.0-pre', date:'2026-06-14', summary:'Builder UI (4 modes: drop/spec/canvas/repo), spec-compiler integration, contract handshake retry, intelligence human-readable patterns, allOpenGaps fix, ledgerDir fix, heartbeat API pulse tier, BDA + ErosmancerOS staged' },
    { version:'0.3.0', date:'2026-06-13', summary:'SEAM pipeline, GapHunter, self-heal organs, heartbeat v2, auth RSA layer, peer relay, remote client, snapshot system, bridge circuit breaker' },
    { version:'0.2.0', date:'2026-06-12', summary:'Cortex memory tiers, intelligence core, replay engine, CFR field, boot sequence, contract system' },
    { version:'0.1.0', date:'2026-06-11', summary:'Initial: orchestrator, bridge, cortex, guardian, idearium, architect, emerge services online' },
  ],
};

// Convenience: get a module version by name (searches all categories)
VERSION.get = function(name) {
  return VERSION.modules[name]
    || VERSION.services[name]
    || VERSION.meta[name]
    || VERSION.userscripts[name]
    || null;
};

// Convenience: full version string for logging
VERSION.toString = function() {
  return `NEXUS v${VERSION.system} — ${Object.keys(VERSION.services).length} services · ${Object.keys(VERSION.modules).length} modules · ${Object.keys(VERSION.meta).length} meta`;
};

module.exports = VERSION;
