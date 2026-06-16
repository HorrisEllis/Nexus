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
  system: '0.5.5',

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
