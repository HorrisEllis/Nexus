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
  system: '0.7.0',

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
    'escalation':       '1.0.0',   // 5-level friction ladder
    'healer':           '1.0.0',
    'snapshot':         '1.0.0',

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

  // ── Meta layer ───────────────────────────────────────────────────────────────
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
