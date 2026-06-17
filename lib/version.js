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

  // ── Roadmap — Phases 10–30 ──────────────────────────────────────────────────
  // §3.1 BOTTOM-UP ONLY. Each phase depends only on what is already built.
  // Every phase lists its hard dependencies explicitly.
  // status: complete | active | next | pending
  roadmap: {

    // ── TIER 0: Already complete ──────────────────────────────────────────────
    // These sessions produced working code. Recorded here for continuity.

    'Phase 22': {
      name: 'Divergence Watcher + Blackbox Recorder',
      status: 'complete',
      deps: ['snapshot', 'intelligence', 'gap-loop'],
      summary: 'cortex/snapshot/divergence-watcher.js — polls sigma_records every 5s. Fires at sigma >= 0.65 or spike +0.20 in one window. 90s cooldown. On divergence: captures system_state synchronously, blackbox_pre (last 10min deflate-compressed), schedules blackbox_post (30s after). cortex/intelligence/macro-compiler.js walks 30 days of history → cause chain, precursors, sigma trajectory, recurrence, plain-English summary. .nex upgraded to v1.1: system_state, divergence_context, blackbox_pre, blackbox_post, macro, resume. New Cortex API: GET /api/snapshots/divergence-watcher, /blackbox, /macro.',
    },

    'Phase 23': {
      name: 'Stale Module Gap — Named, Typed, Severity-Graded',
      status: 'complete',
      deps: ['gap-finder', 'escalation', 'emerge/siso'],
      summary: 'gap-finder encodes full identity: "[idearium:4800] stale 47s — last seen: 2026-06-17T..." with moduleName, modulePort, staleSec, typed severity. Severity by criticality: cortex/orchestrator/guardian → high immediately; bridge/idearium/emerge → medium 2min then high; others → low 5min, medium 10min, high after. Escalation logs read "escalating stale_module:idearium:4800". bus.onAny fixed in emerge/siso (intercept-patch stream.emit). idearium/core/index.js restored as re-export stub.',
    },

    'Phase 24': {
      name: 'TV Shell — Floating Menu Root Cause + Hardening',
      status: 'complete',
      deps: ['ui/home/index.html'],
      summary: 'Root cause: literal newline inside single-quoted JS string in asSend() killed the entire script block — toggleMenu undefined everywhere. Also: all 6 Overview tile tune() indices off by one, tile-dg called tune(7) out of bounds (CH_META has 7 entries, 0-6). Duplicate transform: in #menu-overlay CSS. z-index stacking during ch-in animation — menu-btn z-index → 9999, isolation:isolate + will-change:transform added. Cortex event logging wired: ui.boot, ui.menu.open, ui.menu.close, ui.channel.switch.',
    },

    // ── TIER 1: No pending-phase dependencies — build these first ─────────────

    'Phase 10': {
      name: 'Constitutional AI — lib/constitutional-ai.js',
      status: 'next',
      deps: ['request-handler', 'gap-loop', 'jaa'],
      // §3.1: request-handler already exists. This formalises what it enforces implicitly.
      // §1.1: typed axiom objects — nothing silent, every violation has a UUID
      // §4.3: enterprise-grade — blast_radius typed, cost estimated before action
      summary: 'Formalise the four axioms implicit in request-handler into typed objects: USER_AUTONOMY, REVERSIBILITY, TRUTH_OVER_COHERENCE, EXPLAINABILITY. Each axiom: check(req, ctx) -> { pass, reason, axiom, cost, alternatives }, severity (block/warn/flag), blast_radius (none/local/system/irreversible). Goal graph maps intent to cluster, checks alignment with system objectives — misaligned → HELD not DENIED (user may be right). Identity kernel: typed self-model of what NEXUS is/is not/will not do — read-only from request-handler, writable only by reflection engine after N confirmed evidence items. Wired into request-handler Phase A as constitution.check() before all outcome decisions.',
    },

    'Phase 14': {
      name: 'Hot Module Loader — Immune System Model',
      status: 'pending',
      deps: ['bus', 'jaa', 'snapshot'],
      // §3.1: data/schema before behavior — module spec proved before integration
      // §1.3: no stubs in production — module must pass its own invariant tests first
      // §5.1: UUID + hook + bus on everything loaded
      summary: 'Drop a file into the watched directory → prove → integrate live. No restart. Stages: (1) QUARANTINE — module loaded in isolated vm.Script context, given a mock JAA and bus; (2) PROVE — module must export validateInvariants() that returns { pass, violations }; (3) INTEGRATE — if pass, register with real bus + JAA, add to component-registry; (4) MONITOR — heartbeat watcher checks it for 60s, auto-eject if invariants fail. Rollback: snapshot taken before integration, auto-restore on eject. Every loaded module gets UUID + hook + bus registration at wire time.',
    },

    'Phase 17': {
      name: 'Userscript Heartbeat Pulse — ♥ on NCP Emit',
      status: 'pending',
      deps: ['userscript-claude', 'userscript-chatgpt', 'guardian/server'],
      summary: 'Userscript pill gets ♥ that pulses (snap red, fade back) on every NCP SSE message received. Each system tile in TV shell Overview flashes its icon on events from that system — wired via SSE, no polling. SRC_DOT map: source string → dot element ID. SRC_TILE_ICON map: source string → tile icon element. flashDot() removes/re-adds flash class (void offsetWidth forces reflow to restart animation). tile-icon.flash animation: drop-shadow pulse 0.5s ease-out.',
    },

    'Phase 15': {
      name: 'Grammar Engine — CLI + Component System',
      status: 'pending',
      deps: ['grammar-engine', 'component-registry', 'request-handler', 'nexus-repl'],
      // §3.1: grammar-engine already built (Phase 5). This wires it into consumers.
      // §5.2: everything implements the bridge — grammar becomes the interface layer
      summary: 'grammar-engine.js hooked into: (1) CLI tab completion in nexus-repl.js — on Tab, resolve() the partial input, complete() the token, display candidates; (2) component-registry — every registered component exposes a grammar signature (verb + noun + params); (3) guardian dispatch — command string parsed by grammar.resolve() before NCP dispatch, structured intent extracted; (4) request-handler Phase B — grammar resolve runs before SNR filter. Grammar tree expands from component-registry on every boot. Custom component commands: any system can register new grammar nodes by adding to component-registry.',
    },

    // ── TIER 2: Depends on Phase 10 (Constitutional AI) ──────────────────────

    'Phase 11': {
      name: 'Reflection Engine — lib/reflection.js',
      status: 'pending',
      deps: ['Phase 10', 'request-handler', 'raid', 'gap-loop', 'jaa'],
      // §3.1: needs Phase 10 identity kernel before it can propose updates to it
      // §2.1: every decision persisted before reflection runs on it
      summary: 'UNRESOLVED as first-class state — not failure, legitimate outcome. Every decision: reason + outcome + satisfaction score (0-1). If outcome.satisfaction < 0.5 for N consecutive decisions of same class → lower RAID agent score + open KNOWLEDGE or CAPABILITY loop in gap system. Self-model update loop: reflection.js proposes updates to constitutional-ai.js identity kernel — only after N confirmed evidence items, only via gap system (never directly). Satisfaction scores accumulate into BDA as behavioral signal. Decision log queryable: GET /api/reflection/decisions?class=forge&outcome=UNRESOLVED.',
    },

    // ── TIER 3: Depends on Phase 10 + 11 ─────────────────────────────────────

    'Phase 12': {
      name: 'User Model — Hypotheses, Not Profile',
      status: 'pending',
      deps: ['Phase 10', 'Phase 11', 'bda', 'jaa'],
      // §1.1: every observation has a UUID — nothing stored as fact without evidence
      // §4.3: confidence + evidence count on every belief, never inferred silently
      summary: 'Hypothesis store, not a profile. Every observation: { uuid, claim, confidence, evidence_count, last_seen, source }. confidence + evidence on every item — never stored as fact. BDA baseline integration: behavioral drift signals update hypothesis confidence. Tracks: preferences (provider choice, prompt style), pace (how fast responses are consumed), communication style (technical depth, verbosity). User model queryable from request-handler Phase B for context injection. Never shared externally. Decays: confidence reduces 0.1/day without reinforcement.',
    },

    // ── TIER 4: Depends on Phases 10 + 11 + 12 ───────────────────────────────

    'Phase 13': {
      name: 'Autonomous Loop — Ollama as Brain',
      status: 'pending',
      deps: ['Phase 10', 'Phase 11', 'Phase 12', 'gap-loop', 'ollama', 'snapshot'],
      // §3.1: Goal + Budget + Boundary + Exit MUST be declared before loop starts
      // §1.1: every autonomous action has UUID + causedBy chain
      // §2.1: snapshot before every irreversible autonomous action
      // §4.3: Budget is hard ceiling — loop auto-halts at cost ceiling
      summary: 'Ollama is the brain. Autonomous run requires: Goal (typed intent cluster), Budget (cost ceiling, default 0.50), Boundary (what it cannot touch — file paths, systems, axioms), Exit (completion condition OR timeout). gap-loop becomes the execution spine — each gap is a step. Agent fallback: full context injection on each Ollama call (open gaps, last N events, current sigma, user model snapshot). Rewind on failure: if sigma rises above 0.70 during autonomous run, auto-halt and rewind to pre-run snapshot. Every autonomous action emits to bus with { autonomous: true, runId, step, causedBy }.',
    },

    // ── TIER 5: Depends on Phase 14 (Hot Loader) + Phase 15 (Grammar) ────────

    'Phase 16': {
      name: 'Idearium ↔ Repo ↔ Spec Builder ↔ Architect',
      status: 'pending',
      deps: ['Phase 14', 'Phase 15', 'idearium', 'architect', 'versionium'],
      // §3.1: data (idea) before schema (spec) before behavior (hook) before UI (component)
      summary: 'Full pipeline: idea → tension → spec → hook → component → commit. Steps: (1) Idearium: POST /api/ideas/:uuid/promote → creates spec in architect input queue; (2) Architect: spec → hook registration in hook-registry; (3) Hot Module Loader (Phase 14): hook → component-registry entry; (4) Grammar Engine (Phase 15): component exposes grammar node; (5) Versionium: commit tagged with idea UUID, spec hash. Bidirectional: git commit message containing spec UUID back-links to idea. Ideas visible in TV shell Idearium channel with spec/hook/commit status badges. Tension score drives promotion priority.',
    },

    // ── TIER 6: Depends on Phase 27 (VM) ─────────────────────────────────────

    'Phase 27': {
      name: 'System State VM — Full Suspend/Resume (NEX-VM/1.0)',
      status: 'pending',
      deps: ['snapshot', 'divergence-watcher', 'replay-engine', 'jaa'],
      // §3.1: persistence (JAA tables, snapshot) before behavior (suspend/resume logic)
      // §2.1: disk before behavior — runtime_state written atomically before any action
      // §1.2: resume must verify all invariants before marking as restored
      summary: 'Every .nex becomes a full suspend image. Fields added: runtime_state (heap snapshot, open file descriptors, socket states, active timers, env vars), bus_queue (in-flight events at suspend moment — ordered by seam_ts), module_states (each organ last known state from heartbeat), resume_plan (dependency-ordered restart sequence). Auto-suspend: sigma >= 0.80 sustained 30s, or SIGTERM, or critical module enters failure mode. Different half-life: VM images kept 7 days vs 24h for regular snapshots. Resume: orchestrator reads resume_plan, restarts in dependency order, replays bus_queue events, verifies sigma < 0.50 within 60s or triggers divergence-watcher.',
    },

    // ── TIER 7: Depends on Phase 14 + 27 ─────────────────────────────────────

    'Phase 28': {
      name: 'Build From Inside — Live System Editor',
      status: 'pending',
      deps: ['Phase 14', 'Phase 27', 'emerge-ide', 'architect', 'gap-loop'],
      // §3.1: hot loader (14) and VM rollback (27) must exist before editing live
      // §2.1: snapshot (VM image) always taken before any live edit
      // §1.3: no stubs — every edit must pass invariant proof before integration
      summary: 'Three modes of building NEXUS from within: (1) IN-PROCESS HOT PATCH via Emerge IDE channel — source tree editable inline, SISO bus live stream visible, compile + gap list, one-click patch-and-reload with auto-rollback on failure; (2) SPEC-FIRST via Idearium→Architect pipeline (Phase 16) — idea → spec → hook → hot-load → verify; (3) META LAYER COMMAND SURFACE — natural language → grammar (15) → request-handler (9) → spec → architect → forge → hot-load. When escalation hits level 3.5, opens failing module source in editor with VM snapshot as rollback. TV shell gets Emerge IDE channel showing live source of whichever module gap-loop is currently targeting.',
    },

    // ── TIER 8: Depends on Phase 15 + 16 + 28 ────────────────────────────────

    'Phase 29': {
      name: 'Topology View — Live System Graph',
      status: 'pending',
      deps: ['Phase 15', 'Phase 16', 'Phase 28', 'orchestrator/sse', 'gap-loop'],
      // §3.1: grammar + component pipeline must exist before topology can represent them
      summary: 'The entire NEXUS system as a live directed graph. Nodes = modules (color encodes sigma: green→amber→red; size = event volume). Edges = bus event flows (thickness = frequency; animation = direction + rate). Snapshot dots on timeline below graph. Clicking a node: opens that system\'s TV shell channel. Clicking an edge: shows last 20 events with seam_ts. Gap-loop focal points: pulsing highlighted nodes. Updates from orchestrator SSE — no polling. The topology view is a separate meta-view above the TV shell, not a channel within it.',
    },

    // ── TIER 9: Depends on Phase 27 + 29 (VM + Topology) ────────────────────

    'Phase 30': {
      name: 'Time-Travel Debugging — Checkpoint Ring + Fork',
      status: 'pending',
      deps: ['Phase 27', 'Phase 29', 'replay-engine', 'divergence-watcher'],
      // §3.1: VM (27) and topology (29) must exist — time travel needs both
      // §1.1: every fork gets a UUID + causedBy the checkpoint it branched from
      summary: 'Checkpoint ring: lightweight VM checkpoint every 10min. On divergence: full-fidelity checkpoint forced (+ blackbox + macro). Rewind timeline distinguishes checkpoint types by color. Fork a timeline: select checkpoint → "Fork from here" → second runtime spins up on alternate ports (9001, 3749, 7821...) — original keeps running. Diff two runtimes live in topology view (Phase 29). Time-travel debugging: jump to 5min before divergence, replay forward deterministically (replay-engine + VM state = exact reconstruction), inject synthetic events to test counterfactuals. SEAM as time machine: seam_ts annotated on checkpoints → "show me system when this SEAM job dispatched" → jump.',
    },

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
