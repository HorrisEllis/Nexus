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
    content:     ['nexus-bus.js'],
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
    content:     ['orchestrator.js', 'ui/index.html', 'ui/ports.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:              9000,
      HEARTBEAT_MS:      10000,
      HOTSWAP_DEBOUNCE:  500,
    },
    immutable:   false,
  },

  'nexus-br': {
    componentId: 'nexus-br',
    name:        'bridge',
    intent:      'Identity + transport boundary — handshake verification, token issuance, SSE relay, causal routing',
    context:     { layer: 1, port: 9999, host: '127.0.0.1' },
    content:     ['bridge/server.js', 'bridge/identity.js', 'bridge/router.js', 'bridge/registry.js'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:              9999,
      TOKEN_EXPIRY_MS:   24 * 60 * 60 * 1000, // 24h
      MAX_TOKENS_PER_SYS: 10,
      HOST:              '127.0.0.1',
    },
    immutable:   false,
  },

  'nexus-cx': {
    componentId: 'nexus-cx',
    name:        'cortex',
    intent:      'Sovereign memory + intelligence — four layers: storage, memory, pattern formation, operational intelligence',
    context:     { layer: 1, port: 3748, host: '127.0.0.1' },
    content:     ['cortex/boot.js', 'cortex/foundation/', 'cortex/memory/', 'cortex/intelligence/', 'cortex/orion/', 'cortex/healer/'],
    parent:      'nexus-co',
    children:    [],
    config: {
      PORT:              3748,
      POLL_MS:           5000,
      SIGMA_THRESHOLD:   0.3,
      FAILURE_SCAN_MS:   30000,
      REUSE_INDEX_MS:    120000,
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
    content:     ['service/nexus-diagnostic.js'],
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
