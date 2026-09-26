'use strict';
/**
 * lib/uid/component-map.js — NEXUS Component Registry
 * UUID: nexus-uid-map-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * The registry of every component in the system.
 * UUID = address. This map = semantics. Event bus = behavior. causedBy = history.
 * These four never collapse into each other.
 *
 * IMMUTABLE CORE (immutable: true):
 *   The load-bearing walls. What the system cannot survive without.
 *   Config readable, never overridden at runtime.
 *   No mutation rights from parent to child — parent = origin of contract only.
 *
 * COMPONENT ID FORMAT:
 *   8 chars, human-readable, stable across versions.
 *   First 8 chars of any UUID tells you exactly what component it came from.
 *   nexus-co → core kernel
 *   nexus-gu → guardian
 *   nexus-br → bridge
 *   etc.
 *
 * §5.1  Everything has a UUID — every component is registered here.
 * §A-4  Living document — append-only, never delete.
 */

const COMPONENT_MAP = {

  // ── IMMUTABLE CORE ──────────────────────────────────────────────────────────
  // These are the invariants. What the system cannot survive without.
  // parent: null — nothing owns the core, the core owns everything.

  'nexus-co': {
    componentId: 'nexus-co',
    name:        'core',
    intent:      'Immutable kernel — invariants, axioms, system contract, the load-bearing layer everything else builds from',
    context:     { layer: 0, tier: 'kernel' },
    content:     ['contracts/SYSTEM-CONTRACTS.js', 'contracts/nexus-interaction-contract.js'],
    parent:      null,
    children:    [], // populated at runtime via register()
    config:      {}, // no config — immutable
    immutable:   true,
  },

  'nexus-jaa': {
    componentId: 'nexus-jaa',
    name:        'jaaDB',
    intent:      'Three-tier memory kernel — working/short/long with decay physics. CORTEX IS THE ULTIMATE TRUTH.',
    context:     { layer: 0, tier: 'kernel' },
    content:     ['cortex/memory/jaa-db.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      DECAY_INTERVAL_MS:   5 * 60 * 1000,   // 5 min
      WORKING_EVICT_MS:    2 * 60 * 60 * 1000, // 2h
      SHORT_EVICT_MS:     24 * 60 * 60 * 1000, // 24h
    },
    immutable:   true, // memory kernel is immutable — modify via ledger-writer only
  },

  'nexus-bus': {
    componentId: 'nexus-bus',
    name:        'event-bus',
    intent:      'Unified event multiplex — all systems emit and subscribe through here, nothing talks directly',
    context:     { layer: 0, tier: 'kernel', port: 9000 },
    content:     ['nexus/nexus-bus.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      REPLAY_BUFFER_SIZE: 50,
      SSE_PATH:           '/nexus-bus/sse',
    },
    immutable:   true,
  },

  'nexus-que': {
    componentId: 'nexus-que',
    name:        'queue',
    intent:      'Physical queue — file-first, atomic claim, replay on crash. §LAW II: file exists before job is processed.',
    context:     { layer: 0, tier: 'kernel' },
    content:     ['lib/queue.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      DEFAULT_PRIORITY:    'normal',
      MAX_RETRY:           3,
      REPLAY_ON_BOOT:      true,
    },
    immutable:   true,
  },

  'nexus-led': {
    componentId: 'nexus-led',
    name:        'ledger-writer',
    intent:      'Single write surface — §2.1 disk before behavior. Four types: event_log, gaps, failures, metrics.',
    context:     { layer: 0, tier: 'kernel' },
    content:     ['lib/ledger-writer.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      VALID_TYPES: ['event_log', 'gaps', 'failures', 'metrics'],
    },
    immutable:   true,
  },

  // ── SYSTEM LAYER ────────────────────────────────────────────────────────────
  // Each system is a component of the core.
  // parent: 'nexus-co' — born from the core contract, not controlled by it at runtime.

  'nexus-or': {
    componentId: 'nexus-or',
    name:        'orchestrator',
    intent:      'Central hub — service registry, SSE broadcast, UI hotswap, proxy routes to all systems',
    context:     { layer: 1, port: 9000, host: '127.0.0.1' },
    content:     ['orchestrator/orchestrator.js', 'ui/index.html', 'ui/ports.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:              9000,
      HEARTBEAT_MS:      10000,
      HOTSWAP_DEBOUNCE:  500,
    },
    immutable:   false,
  },

  // §RETIRED 2026-09-06 — 'nexus-br' (bridge) component entry removed;
  // bridge/ archived under _archive/bridge-retired-2026-09-06/.

  'nexus-cx': {
    componentId: 'nexus-cx',
    name:        'cortex',
    intent:      'Sovereign memory — three layers: storage, memory, pattern formation. Intelligence moved to its own system, nexus-in, 2026-08-22.',
    context:     { layer: 1, port: 3748, host: '127.0.0.1' },
    content:     ['cortex/boot.js', 'cortex/foundation/', 'cortex/memory/', 'cortex/orion/', 'cortex/self-heal/'],
    parent:      'nexus-co',
    children:    [],
    config: {
      // §CORRECTED 2026-08-23 — this block previously listed POLL_MS,
      // SIGMA_THRESHOLD, FAILURE_SCAN_MS, REUSE_INDEX_MS as if they
      // belonged to cortex. Checked directly against the real code:
      // POLL_MS/FAILURE_SCAN_MS/REUSE_INDEX_MS genuinely relocated to
      // intelligence/config.js during the phase-1 extraction (2026-08-22)
      // and this entry was never updated to match. SIGMA_THRESHOLD
      // confirmed to never have existed as real code anywhere in this
      // codebase — a phantom value, not a relocated one. Only PORT was
      // ever actually true for cortex itself.
      PORT: 3748,
    },
    immutable:   false,
  },

  // §2026-08-22 — real, new system. Extracted per intelligence/spec/
  // intelligence.spec, phase 1 (cortex/intelligence/ moved, all 7 real
  // consumers updated and verified, cortex/boot.js's own 7 broken
  // internal references caught by the real dangling-report scanner and
  // fixed). Phases 2-4 (baseline/snapshot-trigger, the much larger and
  // riskier meta/cfr move, and the new framework-builder module) not yet
  // done — see the spec's own rollout section.
  'nexus-in': {
    componentId: 'nexus-in',
    name:        'intelligence',
    intent:      'Pattern crystallisation, relational-field (RFR2), adversarial comparison, intuition, mastermind, behavioral baseline, sigma-to-snapshot, CFR (field/regime physics), WARP-based framework generation, and the full former meta/ layer (gap detection, alk, spatial, bda, causal, liminal, topo-kernel, telemetry, lattice) plus liminal-space (moved from cortex, 2026-08-22 — genuinely a cognitive/pattern-causality module, not storage) — the cognition + system-health + framework layer.',
    context:     { layer: 1, port: 3753, host: '127.0.0.1' },
    content:     ['intelligence/index.js', 'intelligence/relational-field.js', 'intelligence/adversarial.js', 'intelligence/intuition.js', 'intelligence/mastermind.js', 'intelligence/baseline.js', 'intelligence/snapshot-trigger.js', 'intelligence/cfr/', 'intelligence/framework-builder.js', 'intelligence/server.js', 'intelligence/consumer.js', 'intelligence/config.js', 'intelligence/schemas.js', 'intelligence/registry-components.js', 'intelligence/topo-kernel/', 'intelligence/alk-perception/', 'intelligence/telemetry-codec/', 'intelligence/alk/', 'intelligence/lattice/', 'intelligence/spatial/', 'intelligence/bda/', 'intelligence/causal/', 'intelligence/rfr2/', 'intelligence/gap/', 'intelligence/liminal-space/'],
    parent:      'nexus-co',
    children:    [],
    config: {
      // §2026-08-23 — matches intelligence/config.js's real, current
      // content exactly, including the 6 timing constants + 2 maturity
      // thresholds found genuinely still inline in intelligence/index.js
      // and centralized during this same pass.
      PORT: 3753,
      POLL_MS: 5000,
      PATTERN_SCAN_MS: 60000,
      FAILURE_SCAN_MS: 30000,
      REUSE_INDEX_MS: 120000,
      CROSS_LEDGER_MS: 90000,
      META_SCAN_MS: 180000,
      LOOM_MAP_SYNC_MS: 120000,
      MATURE_MIN_COUNT: 50,
      MATURE_CONFIDENCE: 0.95,
    },
    immutable:   false,
  },

  'nexus-gu': {
    componentId: 'nexus-gu',
    name:        'guardian',
    intent:      'AI dispatch + routing + execution control — SEAM chunker, NCP transport, job queue, provider RAID',
    context:     { layer: 1, port: 7820, host: '127.0.0.1' },
    content:     ['guardian/server.js', 'guardian/lib/seam-queue.js', 'guardian/lib/gap-hunter.js', 'guardian/ui/index.html'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:              7820,
      MAX_CONCURRENT:    3,
      HEARTBEAT_MS:      15000,
      NCP_TIMEOUT_MS:    120000,
    },
    immutable:   false,
  },

  'nexus-id': {
    componentId: 'nexus-id',
    name:        'idearium',
    intent:      'Idea capture + knowledge management — stores, tags, and surfaces ideas with decay-weighted recall',
    context:     { layer: 1, port: 4800, host: '127.0.0.1' },
    content:     ['idearium/api/index.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT: 4800,
    },
    immutable:   false,
  },

  'nexus-ar': {
    componentId: 'nexus-ar',
    name:        'architect',
    intent:      'Constraint-first system authoring — spec builder, hook registry, blueprint viewer, SNR gate, topology scanner',
    context:     { layer: 1, port: 3747, host: '127.0.0.1' },
    content:     ['architect/service.js', 'architect/src/spec/Blueprint.js', 'architect/src/hooks/Registry.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT: 3747,
    },
    immutable:   false,
  },

  'nexus-em': {
    componentId: 'nexus-em',
    name:        'emerge',
    intent:      'Code generation kernel — SEAM compiler, emergence pipeline, LLM-to-code translation layer',
    context:     { layer: 1, port: 4242, host: '127.0.0.1' },
    content:     ['emerge-kernel.js', 'emerge-ide.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT: 4242,
    },
    immutable:   false,
  },

  'nexus-di': {
    componentId: 'nexus-di',
    name:        'diagnostic',
    intent:      'System observability — sigma/slope/friction monitoring, gap surface, CFR field, causal trace, memory pressure',
    context:     { layer: 1, port: 7825, host: '127.0.0.1' },
    content:     ['diagnostic/nexus-diagnostic.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:        7825,
      POLL_MS:     15000,
      BASELINE_N:  10,
    },
    immutable:   false,
  },

  // ── INFRASTRUCTURE LAYER ────────────────────────────────────────────────────
  // Sub-components of systems — registered as children at runtime.

  'nexus-uid': {
    componentId: 'nexus-uid',
    name:        'uid-system',
    intent:      'Component identity — structured UUIDs, registry lookup, config inheritance. UUID=address, registry=semantics.',
    context:     { layer: 0, tier: 'infrastructure' },
    content:     ['lib/uid/index.js', 'lib/uid/component-map.js', 'lib/uid/config-schema.js'],
    parent:      'nexus-co',
    children:    [],
    config:      {},
    immutable:   true, // identity system itself is immutable
  },

};

module.exports = { COMPONENT_MAP };
