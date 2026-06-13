'use strict';
/**
 * contracts/SYSTEM-CONTRACTS.js — NEXUS System-Wide Contract Registry
 * UUID: nexus-contracts-registry-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Single source of truth for every named entity in the system:
 *   - Interaction contracts (per system)
 *   - Verification contracts (what each system must prove)
 *   - Event taxonomy (every named event type)
 *   - Gap taxonomy (every named gap type and severity)
 *   - Failure modes (every named fault and fault class)
 *   - Edge types (every named system boundary)
 *   - Delta types (transition physics)
 *   - Divergent types (CFR regimes and anomaly classes)
 *   - Bottleneck signals (ledger flow indicators)
 *   - Ledger taxonomy (every named ledger and its authority)
 *
 * §5.1  Everything has a UUID — every contract entry has a UUID.
 * §5.2  Everything implements the bridge — all systems listed here.
 * §6.1  Documentation generated from proof — this file is the proof layer.
 * §7.0  Event ontology separation — observational vs authoritative events named.
 * §1.2  Nothing silently fails — every failure mode named and classified.
 *
 * Usage:
 *   const C = require('./contracts/SYSTEM-CONTRACTS');
 *   C.EVENTS.GUARDIAN.JOB_COMPLETE  → 'guardian.job.complete'
 *   C.GAPS.TYPES.WIRING_MISSING     → 'wiring_missing'
 *   C.FAULTS.CLASS.SILENT_FAILURE   → 'silent_failure'
 */

const { randomUUID } = require('crypto');

// ── System version — single source of truth ────────────────────────────────
const NEXUS_VERSION = '0.4.0-pre'; // 0.x = pre-release. 1.0.0 = system builds on itself.

// ══════════════════════════════════════════════════════════════════════════════
// §1 — AXIOM REGISTRY
// Every axiom referenced in this system, machine-readable.
// ══════════════════════════════════════════════════════════════════════════════

const AXIOMS = Object.freeze({
  '§1.1':  'Nothing exists until proven.',
  '§1.2':  'Nothing silently fails.',
  '§1.3':  'No stubs in production.',
  '§2.1':  'Persistence is the golden rule.',
  '§2.2':  'Storage device is source of truth.',
  '§2.3':  'All state must be observable.',
  '§3.1':  'Bottom-up only.',
  '§3.2':  'Logical time (eventTs) is the ordering axis.',
  '§4.1':  'A system that cannot be tested cannot be trusted.',
  '§4.2':  'Fix bugs pre-emptively.',
  '§4.3':  'Enterprise grade. Military grade security.',
  '§5.1':  'Everything has a UUID, hook, and event bus registration.',
  '§5.2':  'Everything implements the bridge.',
  '§5.3':  'No monkey patches — full system patches only.',
  '§5.4':  'Versions persist across the entire project.',
  '§5.5':  'What does not exist must be built.',
  '§5.6':  'Structural self-similarity (fractal law).',
  '§5.7':  'Low coupling, high cohesion.',
  '§5.8':  'Composability over configuration.',
  '§6.1':  'Documentation is generated from proof.',
  '§6.2':  'Always read before building.',
  '§7.0':  'Event ontology separation.',
  '§7.1':  'Dual ledger architecture.',
  '§7.2':  'Ideas cannot affect runtime.',
  '§7.3':  'Cognition is not history.',
  '§7.4':  'Track methods, solutions, and patterns.',
  '§7.5':  'Classify idea failure.',
  '§7.6':  'Codebase is a materialised view of the Upgrade Ledger.',
  '§7.7':  'Bottleneck detection via ledger flow.',
  '§8.1':  'Begin every session with context.',
  '§8.2':  'Nothing passes the idea gate without hostile review.',
  '§8.3':  'SISO and Jaa are load-order prerequisites.',
  // Session-established rules
  '§BRIDGE-01': 'Bridge is the only write authority for requests.',
  '§BRIDGE-02': 'Ledger write before dispatch. Always.',
  '§BRIDGE-03': 'Held requests never leave the queue.',
  '§BRIDGE-04': 'MAX_ROUTE_DEPTH = 3. routeHistory written on every hop.',
  '§IDENTITY-01': 'One UUID per request event. Assigned by Bridge.',
  '§IDENTITY-02': 'One SHA-256 hash per content artifact.',
  '§IDENTITY-03': 'Session UUID chain links prompts within a conversation.',
  '§TRUTH-01': 'Each data type has exactly one write authority.',
  '§TRUTH-02': 'Cortex requests table is a projection, not a source.',
  '§TRUTH-03': 'SESSION.md is a compiled artifact, not a manual document.',
  '§SISO-01':  'Every cross-system feature is a SISO pipeline.',
  '§SISO-02':  'Gates are pure functions.',
  '§SISO-03':  'Signature collision is a hard error.',
  '§SISO-04':  'Infinite loop prevention via wasProcessedBy().',
  '§SISO-05':  'The ledger IS the learning system.',
  '§US-01':    'Userscript kernel/UI separation is mandatory.',
  '§US-02':    'IndexedDB is the userscript persistence layer.',
  '§US-03':    'Replay authority belongs to the userscript kernel.',
  '§US-04':    'Context injection is pre-prompt, not post-response.',
  '§US-05':    'SHA-256 hash dedup replaces simpleHash().',

  // Causal physics axioms
  '§CAUSAL-01': 'Compound analysis is async, gated, and selective. Never universal.',
  '§CAUSAL-02': 'Compound events (compound.*) never re-trigger compound analysis. No recomputation storms.',
  '§CAUSAL-03': 'Ripple/wave/tidal are emergent propagation regimes, not assigned labels.',
  '§CAUSAL-04': 'Every causal record carries the CausalImpulse that drove propagation.',
  '§CAUSAL-05': 'Regime is read FROM propagation physics — not written to it.',
  '§CAUSAL-06': 'The CFR ledger is a causal simulation substrate, not a debugging log.',
  '§CAUSAL-07': 'Every cause is as important as the conditions of its effect.',
});

// ══════════════════════════════════════════════════════════════════════════════
// §2 — SYSTEM REGISTRY
// Every system, its port, UUID, role, and health path.
// ══════════════════════════════════════════════════════════════════════════════

const SYSTEMS = Object.freeze({
  ORCHESTRATOR: {
    id:          'orchestrator',
    uuid:        'nexus-orchestrator-v2-0-0',
    port:        9000,
    healthPath:  '/health',
    role:        'Command and control. Source of truth for system state. Proxies all routes.',
    bootFile:    'orchestrator.js',
    ledger:      'data/ledger/orchestrator.jsonl',
    secret:      'nexus-orchestrator-internal-v1',
    bootOrder:   0,
  },
  BRIDGE: {
    id:          'bridge',
    uuid:        'nexus-bridge-v1-0000-4000-0000-000000000001',
    port:        9999,
    healthPath:  '/health',
    role:        'Trust relay. Identity, routing, durable request queue.',
    bootFile:    'bridge/index.js',
    ledger:      'data/bridge/ledger/requests.jsonl',
    secret:      'nexus-bridge-internal-v1',
    bootOrder:   1,
  },
  CORTEX: {
    id:          'cortex',
    uuid:        'cortex-boot-v2-0000',
    port:        3748,
    healthPath:  '/health',
    role:        'Append-only memory. 28 JAA tables. Source of truth for all events.',
    bootFile:    'cortex/boot.js',
    ledger:      'cortex/data/',
    secret:      'nexus-cortex-internal-v1',
    bootOrder:   2,
  },
  GUARDIAN: {
    id:          'guardian',
    uuid:        'guardian-server-v3-5',
    port:        7820,
    healthPath:  '/health',
    role:        'AI orchestration. Job queue. SEAM delivery. Provider management.',
    bootFile:    'guardian/server.js',
    ledger:      'data/guardian/',
    secret:      'nexus-guardian-internal-v1',
    bootOrder:   3,
  },
  IDEARIUM: {
    id:          'idearium',
    uuid:        'idearium-api-v1-0000',
    port:        4800,
    healthPath:  '/health',
    role:        'Idea OS. Seed → spec → gap → build lifecycle.',
    bootFile:    'idearium/api/index.js',
    ledger:      'data/idearium/',
    secret:      'nexus-idearium-internal-v1',
    bootOrder:   4,
  },
  EMERGE: {
    id:          'emerge',
    uuid:        'emerge-ide-v1-0-0',
    port:        4242,
    healthPath:  '/status',
    role:        '.eg/.emerge language compiler. SNR gate. Ollama AI assist.',
    bootFile:    'emerge-ide.js',
    ledger:      null,
    secret:      'nexus-emerge-internal-v1',
    bootOrder:   5,
  },
  OLLAMA: {
    id:          'ollama',
    uuid:        'nexus-ollama-local-v1',
    port:        11434,
    healthPath:  '/api/tags',
    role:        'Local LLM inference. Primary offline provider.',
    bootFile:    null,
    ledger:      null,
    secret:      null,
    bootOrder:   6,
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §3 — EVENT TAXONOMY
// Every named event type in the system, classified and documented.
// ══════════════════════════════════════════════════════════════════════════════

const EVENTS = Object.freeze({

  // ── Guardian job lifecycle ─────────────────────────────────────────────────
  GUARDIAN: {
    JOB_QUEUED:            'guardian.job.queued',
    JOB_DISPATCHED:        'guardian.job.dispatched',
    JOB_COMPLETE:          'guardian.job.complete',
    JOB_CONFIRMED:         'guardian.job.confirmed',
    JOB_ERROR:             'guardian.job.error',
    JOB_CHUNK:             'guardian.job.chunk',
    ARTIFACT:              'guardian.artifact',
    ARTIFACTS_WRITTEN:     'guardian.artifacts.written',
    GAPS:                  'guardian.gaps',
    BASELINE_DEVIATION:    'guardian.baseline.deviation',
    DETECTION:             'guardian.detection',
    CORTEX_RESULT:         'guardian.cortex.result',
    CLI_EXEC:              'guardian.cli.exec',
    LEDGER:                'guardian.ledger',
    LEDGER_WRITE:          'guardian.ledger.write',
    PROVIDER_REGISTERED:   'guardian.provider.registered',
    PROVIDER_CONNECTED:    'guardian.provider.connected',
    PROVIDER_DISCONNECTED: 'guardian.provider.disconnected',
    QUEUE_ENQUEUED:        'guardian.queue.enqueued',
    QUEUE_PROGRESS:        'guardian.queue.progress',
    QUEUE_RETRY:           'guardian.queue.retry',
    QUEUE_COMPARTMENT:     'guardian.queue.compartment',
    QUEUE_COMPARTMENT_UPD: 'guardian.queue.compartment.updated',
    SEAM_QUEUE_COMPLETE:   'guardian.seam.queue.complete',
    SEAM_UPDATED:          'guardian.seam.updated',
    SESSION_NAMED:         'guardian.session.named',
    SETTING_UPDATE:        'guardian.setting.update',
    TAB_CLAIMED:           'guardian.tab.claimed',
    TAB_EVENT:             'guardian.tab.event',
    TAB_NEEDED:            'guardian.tab.needed',
    CFR_GAP:               'guardian.cfr.gap',
    GATE_ERROR:            'guardian.gate.error',
    QUEUE_BRIDGE_GATE:     'guardian.queue.bridge_gate',
  },

  // ── SEAM pipeline ──────────────────────────────────────────────────────────
  SEAM: {
    CHUNK_INJECTED: 'seam.chunk.injected',
    CHUNK_STABLE:   'seam.chunk.stable',
    CHUNK_VERIFIED: 'seam.chunk.verified',
    CHUNK_FAILED:   'seam.chunk.failed',
    QUEUE_COMPLETE: 'seam.queue.complete',
    RETRY:          'seam.retry',
    DELIVER:        'seam.deliver',
  },

  // ── Cortex / memory ────────────────────────────────────────────────────────
  CORTEX: {
    GAP_FOUND:       'cortex.gap.found',
    GAP_RESOLVED:    'cortex.gap.resolved',
    MEMORY_UPDATED:  'cortex.memory.updated',
    STORAGE_OPENED:  'cortex.storage.opened',
    EVENT_STORED:    'cortex.event.stored',
    MIRROR_WRITE:    'cortex.mirror.write',
    MIRROR_FAIL:     'cortex.mirror.fail',
    INGEST_OK:       'cortex.ingest.ok',
    INGEST_ERROR:    'cortex.ingest.error',
    TAGS_WRITTEN:    'cortex.tags.written',
    CLI_EXEC:        'cortex.cli.exec',
    CFR_GAP:         'cortex.cfr.gap',
  },

  // ── Contract system ────────────────────────────────────────────────────────
  CONTRACT: {
    OK:               'contract.ok',
    VIOLATION:        'contract.violation',
    STRUCTURAL_FAIL:  'contract.structural.fail',
    BEHAVIORAL_FAIL:  'contract.behavioral.fail',
    TEMPORAL_FAIL:    'contract.temporal.fail',
    AUDIT:            'contract.audit',
    LAW_VIOLATION:    'contract.law_violation',
  },

  // ── Bridge lifecycle ───────────────────────────────────────────────────────
  BRIDGE: {
    BOOTED:           'bridge.booted',
    SYSTEM_HANDSHAKE: 'bridge.system.handshake',
    REQUEST_CREATED:  'bridge.request.created',
    REQUEST_UPDATED:  'bridge.request.updated',
    EVENT:            'bridge.event',
    TAGS_UPDATED:     'bridge.tags.updated',
    TAGS_WRITTEN:     'bridge.tags.written',
    SSE_READY:        'bridge.sse.ready',
    CIRCUIT_OPEN:     'bridge.circuit.open',
    CIRCUIT_CLOSED:   'bridge.circuit.closed',
    HELD_DRAIN:       'bridge.held.drain',
  },

  // ── Orchestrator ───────────────────────────────────────────────────────────
  ORCHESTRATOR: {
    BOOTED:           'orchestrator.booted',
    PULSE:            'orchestrator.pulse',
    SYSTEM_ONLINE:    'orchestrator.system.online',
    SYSTEM_OFFLINE:   'orchestrator.system.offline',
    SYSTEM_STARTING:  'orchestrator.system.starting',
    SYSTEM_FAILED:    'orchestrator.system.failed',
    SYSTEMS_COMPLETE: 'orchestrator.systems.sequence.complete',
    WATCHDOG_TICK:    'orchestrator.watchdog.tick',
    INVARIANTS_SCANNED: 'orchestrator.invariants.scanned',
    LEDGER_WRITE:     'orchestrator.ledger.write',
  },

  // ── Pulse / heartbeat ──────────────────────────────────────────────────────
  PULSE: {
    BEAT:       'heartbeat:pulse',
    MISSED:     'pulse.missed',
    NODE_DEGRADED: 'node:degraded',
    NODE_DEAD:  'node:dead',
    NCP_READY:  'NCP_READY',
    NCP_CLIENT_CONNECTED:    'ncp.client.connected',
    NCP_CLIENT_DISCONNECTED: 'ncp.client.disconnected',
    NCP_CLIENT_EVICTED:      'ncp.client.evicted',
    NCP_MESSAGE_RECEIVED:    'ncp.message.received',
  },

  // ── Self-heal ──────────────────────────────────────────────────────────────
  HEALER: {
    RESOLVED:   'healer.resolved',
    ESCALATED:  'healer.escalated',
    PATCHED:    'self-heal.patched',
  },

  // ── Idearium ───────────────────────────────────────────────────────────────
  IDEARIUM: {
    IDEA_CREATED:  'idearium.idea.created',
    IDEA_UPDATED:  'idearium.idea.updated',
    IDEA_LINKED:   'idearium.idea.linked',
    IDEA_TENSIONED:'idearium.idea.tensioned',
    IDEA_ARCHIVED: 'idearium.idea.archived',
    SPEC_CREATED:  'idearium.spec.created',
    SPEC_UPDATED:  'idearium.spec.updated',
    SPEC_CHECKED:  'idearium.spec.checked',
    GAP_CREATED:   'idearium.gap.created',
    GAP_RESOLVED:  'idearium.gap.resolved',
    SNR_UPDATE:    'idearium.snr.update',
    SNAPSHOT_PUSHED: 'idearium.snapshot.pushed',
    ERROR:         'idearium.error',
  },

  // ── Emerge ─────────────────────────────────────────────────────────────────
  EMERGE: {
    COMPILE_COMPLETE: 'emerge.compile.complete',
    SNR_UPDATE:       'emerge.snr.update',
    GAP_DETECTED:     'emerge.gap.detected',
  },

  // ── CFR field events ───────────────────────────────────────────────────────
  CFR: {
    SIGMA_SPIKE:    'sigma.spike',
    DELTA_TENSION:  'delta.tension',
    CFR_COLLAPSE:   'cfr.collapse',
    REGIME_CHANGE:  'cfr.regime.change',
    FIELD_UPDATE:   'cfr.field.update',
  },

  // ── Compound effects engine ────────────────────────────────────────────────
  COMPOUND: {
    RIPPLE:     'compound.ripple',     // single-hop effect — expected normal flow
    WAVE:       'compound.wave',       // 2-5 downstream events — spreading
    TIDAL:      'compound.tidal',      // 6+ downstream events — compounding cascade
    DOCUMENTED: 'compound.documented', // wave/tidal written to event_log
    REPORT:     'compound.report',     // scan report written to event_log
    ANALYZE:    'compound.analyze',    // analysis triggered on sigma spike
  },

  // ── System lifecycle (cross-system) ────────────────────────────────────────
  SYSTEM: {
    BOOTED:   'system.booted',
    ONLINE:   'system.online',
    OFFLINE:  'system.offline',
    REGISTERED: 'system.registered',
    STEP_COMPLETE: 'system.step.complete',
    STEP_FAILED:   'system.step.failed',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §4 — GAP TAXONOMY
// Every named gap type, severity, and status.
// ══════════════════════════════════════════════════════════════════════════════

const GAPS = Object.freeze({

  // Gap types — what kind of structural problem
  TYPES: {
    UNRESOLVED:       'unresolved',        // active, still being worked
    CONTRADICTION:    'contradiction',     // two parts of the system disagree
    MISSING_LINK:     'missing_link',      // connection between systems not wired
    BOUNDARY_GAP:     'boundary_gap',      // edge between systems undefined
    FILE_FRICTION:    'file_friction',     // file missing or inaccessible
    SPEC_INCOMPLETE:  'spec_incomplete',   // spec references undefined variables
    CI_FAIL:          'ci_fail',           // test or integration failure
    SCHEMA_VIOLATION: 'schema_violation',  // data doesn't match expected shape
    WIRING_MISSING:   'wiring_missing',    // module not connected to event bus
    BASELINE_DRIFT:   'baseline_drift',    // system behaviour deviated from baseline
    LEDGER_DIVERGENCE:'ledger_divergence', // two truth sources disagree
    PHANTOM_REQUEST:  'phantom_request',   // request exists in one ledger but not another
    HASH_COLLISION:   'hash_collision',    // two artifacts share a hash (simpleHash weakness)
    REPLAY_ORPHAN:    'replay_orphan',     // queue item has no corresponding ledger entry
    CONTRACT_MISMATCH:'contract_mismatch', // runtime behaviour differs from declared contract
    SILENT_FAILURE:   'silent_failure',    // §1.2 violation — failure not surfaced
    TRUST_VIOLATION:  'trust_violation',   // system called another without Bridge token
    ROGUE_WRITE:      'rogue_write',       // direct write to protected table bypassed Bridge
    HELD_OVERFLOW:    'held_overflow',     // held queue exceeds expected capacity
  },

  // Gap severities
  SEVERITIES: {
    FATAL:  'fatal',   // system cannot function — halt and diagnose
    HIGH:   'high',    // significant degradation — fix before next build
    MEDIUM: 'medium',  // non-blocking but tracked
    LOW:    'low',     // informational — review in next session
  },

  // Compounding effect classes (from lib/causal/compound.js)
  COMPOUND_CLASSES: {
    RIPPLE: { id: 'ripple', desc: '1 downstream event — expected normal flow. Not documented.' },
    WAVE:   { id: 'wave',   desc: '2-5 downstream events, spreading. Written to event_log.' },
    TIDAL:  { id: 'tidal',  desc: '6+ downstream events, compounding cascade. Opens a gap, written to event_log.' },
  },

  // Named compounding factors — what causes an event to amplify rather than dampen
  COMPOUNDING_FACTORS: {
    SIGMA_AMPLIFICATION:        'sigma_amplification',        // each hop has higher sigma — divergence growing
    RETRY_CASCADE:              'retry_cascade',              // retries amplify resonance and friction
    CROSS_SYSTEM_PROPAGATION:   'cross_system_propagation',   // effect crossed system boundary — isolation failed
    UNRESOLVED_GAP_CHAIN:       'unresolved_gap_chain',       // gaps opened faster than resolved
    CONTRACT_VIOLATION_AMPLIFIER:'contract_violation_amplifier',// contract violations inject +0.15 entropy each
    TENSION_ESCALATION:         'tension_escalation',         // delta tension growing across hops
    BACKPRESSURE_RELEASE:       'backpressure_release',       // held queue draining or backpressure releasing
  },

  // Gap statuses
  STATUSES: {
    OPEN:      'open',      // gap exists, not addressed
    RESOLVED:  'resolved',  // gap closed with proof
    IGNORED:   'ignored',   // gap acknowledged, explicitly deferred
    REJECTED:  'rejected',  // not a gap — classified as expected behaviour
  },

  // Idea failure classifications (§7.5)
  IDEA_FAILURE: {
    UNRESOLVED:  'unresolved',   // active, still being worked
    REJECTED:    'rejected',     // validated and failed — proof exists
    ABANDONED:   'abandoned',    // set aside without validation
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §5 — FAILURE MODE TAXONOMY
// Every named fault class, fault, and failure pattern.
// ══════════════════════════════════════════════════════════════════════════════

const FAULTS = Object.freeze({

  // Fault classes — the category of failure
  CLASS: {
    SILENT_FAILURE:       'silent_failure',       // §1.2 — not surfaced
    PHANTOM_WRITE:        'phantom_write',         // write claimed but not proven
    DUAL_TRUTH:           'dual_truth',            // two systems disagree on state
    ROGUE_BYPASS:         'rogue_bypass',          // direct call bypassed Bridge
    REPLAY_DOUBLE:        'replay_double',         // same request replayed twice
    GHOST_CALL:           'ghost_call',            // function called but never defined
    STUB_IN_PRODUCTION:   'stub_in_production',    // §1.3 violation
    SCOPE_ESCAPE:         'scope_escape',          // variable referenced outside scope
    MISSING_PROVENANCE:   'missing_provenance',    // no bridgeUuid on request
    TOKEN_EXPIRY:         'token_expiry',          // Bridge token expired mid-session
    CIRCUIT_DEADLOCK:     'circuit_deadlock',      // all fallbacks circuit-open simultaneously
    HELD_STARVATION:      'held_starvation',       // held queue never drains
    CONTEXT_LOSS:         'context_loss',          // session UUID chain broken
    HASH_DRIFT:           'hash_drift',            // same content, different hash algorithms
    MONOLITH_GROWTH:      'monolith_growth',       // module absorbing unrelated concerns
    BOOT_ORDER_VIOLATION: 'boot_order_violation',  // system booted before its dependency
    VERSION_DRIFT:        'version_drift',         // §5.4 — versions diverged across files
    LEDGER_ORPHAN:        'ledger_orphan',         // ledger entry with no causal parent
    CONTRACT_DRIFT:       'contract_drift',        // runtime behaviour drifted from contract
    CFR_COLLAPSE:         'cfr_collapse',          // field entered chaotic regime and stayed
    INVARIANT_BREAK:      'invariant_break',       // co-occurrence pattern broken unexpectedly
  },

  // Specific named faults encountered in this system
  KNOWN: {
    UPLOAD_DIR_UNDEFINED:   { id: 'F001', desc: 'uploadDir not aliased from cfg.uploadDir in Guardian dropzone server', fixed: true },
    GET_LOCAL_IPS_MISSING:  { id: 'F002', desc: 'getLocalIPs() called but never defined in guardian/server.js', fixed: true },
    BOOT_SYSTEMS_NOT_CALLED:{ id: 'F003', desc: '_bootSystems required but never invoked in orchestrator.js', fixed: true },
    POST_BRIDGE_GHOST:      { id: 'F004', desc: 'nc.postBridge() called in 3 places but not defined in nexus-connect.js', fixed: true },
    REQUESTS_OPEN_WRITE:    { id: 'F005', desc: 'requests table in ALLOWED set for POST /api/table/insert — Bridge bypass possible', fixed: true },
    TAGS_ENDPOINT_STUB:     { id: 'F006', desc: 'POST /api/tags in cortex admin-server returned ok:true without writing anything', fixed: true },
    NAS_PHANTOM_REQUESTS:   { id: 'F007', desc: 'NAS router polling for file_resolve requests that nothing creates', fixed: true },
    CLI_REQUESTS_GHOST:     { id: 'F008', desc: 'cliRequests() and cliTag() called in orchestrator CLI but never defined', fixed: true },
    CFR_NODE_WIPE:          { id: 'F009', desc: 'syncCanvasNodes() wiped all attractors on empty /cfr/nodes response', fixed: true },
    SIMPLE_HASH_COLLISION:  { id: 'F010', desc: 'simpleHash() in userscript is not content-addressed — collision risk', fixed: false },
    USERSCRIPT_LOCALSTORAGE:{ id: 'F011', desc: 'Userscript uses localStorage for state — lost on tab close', fixed: false },
    CONTEXT_NOT_INJECTED:   { id: 'F012', desc: 'No pre-prompt context injection — agent starts cold every session', fixed: false },
    DUAL_ORCHESTRATOR:      { id: 'F013', desc: 'ui/orchestrator.js and root orchestrator.js diverged', fixed: true },
    BRIDGE_NEVER_BUILT:     { id: 'F014', desc: 'Bridge referenced everywhere but bridge/ directory did not exist', fixed: true },
    ENQUEUE_BYPASS:         { id: 'F015', desc: 'Three _physQueue.enqueue() calls bypassed Bridge entirely', fixed: true },
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §6 — EDGE TAXONOMY
// Every named system boundary (edge) in the architecture.
// ══════════════════════════════════════════════════════════════════════════════

const EDGES = Object.freeze({

  // Named edges — every connection between systems
  USERSCRIPT_GUARDIAN:   { from: 'userscript',   to: 'guardian',     protocol: 'NCP/SSE+fetch', port: 7820, auth: 'none',         bidirectional: true },
  USERSCRIPT_BRIDGE:     { from: 'userscript',   to: 'bridge',       protocol: 'HTTP',          port: 9999, auth: 'BRIDGE_TOKEN',  bidirectional: false },
  GUARDIAN_BRIDGE:       { from: 'guardian',     to: 'bridge',       protocol: 'HTTP',          port: 9999, auth: 'BRIDGE_TOKEN',  bidirectional: false },
  GUARDIAN_CORTEX:       { from: 'guardian',     to: 'cortex',       protocol: 'HTTP',          port: 3748, auth: 'none',         bidirectional: false },
  GUARDIAN_ORCHESTRATOR: { from: 'guardian',     to: 'orchestrator', protocol: 'HTTP',          port: 9000, auth: 'none',         bidirectional: false },
  CORTEX_BRIDGE_SSE:     { from: 'cortex',       to: 'bridge',       protocol: 'SSE',           port: 9999, auth: 'none',         bidirectional: false, note: 'cortex subscribes to bridge SSE for requests projection' },
  ORCHESTRATOR_BRIDGE:   { from: 'orchestrator', to: 'bridge',       protocol: 'SSE+HTTP',      port: 9999, auth: 'BRIDGE_TOKEN',  bidirectional: false },
  ORCHESTRATOR_CORTEX:   { from: 'orchestrator', to: 'cortex',       protocol: 'HTTP',          port: 3748, auth: 'none',         bidirectional: false },
  ORCHESTRATOR_GUARDIAN: { from: 'orchestrator', to: 'guardian',     protocol: 'HTTP',          port: 7820, auth: 'none',         bidirectional: false },
  ORCHESTRATOR_IDEARIUM: { from: 'orchestrator', to: 'idearium',     protocol: 'HTTP',          port: 4800, auth: 'none',         bidirectional: false },
  IDEARIUM_GUARDIAN:     { from: 'idearium',     to: 'guardian',     protocol: 'HTTP',          port: 7820, auth: 'none',         bidirectional: false },
  EMERGE_OLLAMA:         { from: 'emerge',       to: 'ollama',       protocol: 'HTTP',          port: 11434,auth: 'none',         bidirectional: false },
  GUARDIAN_OLLAMA:       { from: 'guardian',     to: 'ollama',       protocol: 'HTTP',          port: 11434,auth: 'none',         bidirectional: false },
  UDP_PULSE:             { from: '*',            to: 'bridge',       protocol: 'UDP',           port: 7777, auth: 'signed_pulse',  bidirectional: false, note: 'all systems broadcast pulse' },

  // Edge failure modes
  FAILURE_MODES: {
    CONNECTION_REFUSED: 'connection_refused',  // target not running
    TIMEOUT:            'timeout',             // target running but slow
    AUTH_REJECTED:      'auth_rejected',       // bad or expired token
    CIRCUIT_OPEN:       'circuit_open',        // circuit breaker tripped
    SSE_DROPPED:        'sse_dropped',         // SSE connection dropped mid-stream
    NCP_STALE_TAB:      'ncp_stale_tab',       // NCP tab heartbeat missed > 15s
    CORS_BLOCKED:       'cors_blocked',        // browser blocked cross-origin
    TLS_MISMATCH:       'tls_mismatch',        // WSS TLS cert not accepted
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §7 — DELTA TAXONOMY
// Transition physics — named delta types and their axes.
// ══════════════════════════════════════════════════════════════════════════════

const DELTAS = Object.freeze({

  // Delta axes (computed per ledger entry)
  AXES: {
    TENSION:  'tension',   // 0..1 — absolute change in complexity/payload size
    FRICTION: 'friction',  // 0..1 — latency proxy (gap between events)
    SLOPE:    'slope',     // -1..1 — direction of change (positive = growing)
  },

  // Named delta transition types
  TRANSITIONS: {
    OK_TO_ERROR:    'ok_to_error',      // tension spike — normal → failure
    ERROR_TO_OK:    'error_to_ok',      // recovery — medium tension
    RETRY_CHAIN:    'retry_chain',      // consecutive retries — high tension
    JOB_FLOW:       'job_flow',         // queued → dispatched → complete — expected low tension
    GAP_CYCLE:      'gap_cycle',        // gap found → resolved — expected low tension
    SEAM_DELIVERY:  'seam_delivery',    // chunk injected → stable → verified — expected low tension
    SILENCE_BREAK:  'silence_break',    // long gap then event — mild temporal signal
  },

  // Thresholds
  THRESHOLDS: {
    TENSION_HIGH:  0.6,   // above this = high tension event
    FRICTION_HIGH: 0.6,   // above this = high friction event
    SLOPE_GROWING: 0.1,   // positive slope above this = system expanding
    SLOPE_SHRINKING: -0.1,// negative slope below this = system contracting
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §8 — DIVERGENT TYPE TAXONOMY
// CFR field regimes and anomaly classifications.
// ══════════════════════════════════════════════════════════════════════════════

const DIVERGENT = Object.freeze({

  // CFR field dimensions
  DIMENSIONS: {
    COHERENCE:  'coherence',   // 0..1 — how ordered/structured the system is
    FRICTION:   'friction',    // 0..1 — energy lost to resistance / retries / lag
    RESONANCE:  'resonance',   // 0..1 — cyclic reinforcement (retries, loops, polls)
    ENTROPY:    'entropy',     // 0..1 — disorder / randomness / unpredictability
  },

  // Named regimes (computed from field state)
  REGIMES: {
    STABLE:    { id: 'stable',    desc: 'coherence > 0.6, entropy < 0.3 — healthy flow' },
    RESONANT:  { id: 'resonant',  desc: 'coherence > 0.4, entropy < 0.3 — cyclic signal' },
    TURBULENT: { id: 'turbulent', desc: 'friction > 0.65 OR resonance > 0.7 — loop / deadlock' },
    CHAOTIC:   { id: 'chaotic',   desc: 'entropy > 0.7 OR coherence < 0.25 — SW block / error' },
  },

  // Sigma anomaly types (scored 0..1 per event)
  SIGMA: {
    AXES: {
      STRUCTURAL:  'structural',   // payload shape, type pattern, required fields
      TEMPORAL:    'temporal',     // interval since last event vs baseline
      CONTEXTUAL:  'contextual',   // current CFR field state amplification
    },
    PATTERNS: {
      ERROR_EVENT:    { name: 'error_event',    structural_weight: 0.35 },
      RETRY_PATTERN:  { name: 'retry_pattern',  structural_weight: 0.20 },
      TIMEOUT:        { name: 'timeout',        structural_weight: 0.25 },
      EMPTY_PAYLOAD:  { name: 'empty_payload',  structural_weight: 0.10 },
      CORRUPT_DATA:   { name: 'corrupt_data',   structural_weight: 0.40 },
      TEMPORAL_DRIFT: { name: 'temporal_drift', temporal_threshold_sigma: 3 },
      HIGH_ENTROPY:   { name: 'high_entropy',   contextual_threshold: 0.70 },
      LOW_COHERENCE:  { name: 'low_coherence',  contextual_threshold: 0.30 },
      HIGH_FRICTION:  { name: 'high_friction',  contextual_threshold: 0.70 },
    },
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §9 — BOTTLENECK TAXONOMY
// Named bottleneck signals from ledger flow analysis.
// ══════════════════════════════════════════════════════════════════════════════

const BOTTLENECKS = Object.freeze({

  // Named bottleneck signal types (§7.7)
  SIGNALS: {
    IDEA_CONVERSION_LOW:   'idea_conversion_low',    // low idea-to-upgrade conversion rate
    GATE_LATENCY_HIGH:     'gate_latency_high',      // boot gates taking too long
    BRANCH_ENTROPY_HIGH:   'branch_entropy_high',    // too many unresolved idea branches
    IDEA_DENSITY_HIGH:     'idea_density_high',      // too many ideas per component
    HELD_QUEUE_GROWING:    'held_queue_growing',     // held requests accumulating
    RETRY_RATE_HIGH:       'retry_rate_high',        // excessive retries per job
    SIGMA_SUSTAINED:       'sigma_sustained',        // high sigma for > N consecutive events
    LEDGER_DIVERGENCE:     'ledger_divergence',      // two ledgers disagree on same entity
    CIRCUIT_OPEN_CLUSTER:  'circuit_open_cluster',   // multiple circuits open simultaneously
    SEAM_FAIL_RATE_HIGH:   'seam_fail_rate_high',    // SEAM chunk failure rate above threshold
    CONTEXT_LOSS_RATE:     'context_loss_rate',      // session UUID chain breaks per session
    TOKEN_EXPIRY_RATE:     'token_expiry_rate',      // Bridge tokens expiring before use
  },

  // Thresholds that trigger each signal
  THRESHOLDS: {
    HELD_QUEUE_MAX:      50,    // requests
    RETRY_RATE_MAX:      0.25,  // 25% of jobs retry
    SIGMA_SUSTAINED_N:   5,     // consecutive high-sigma events
    SEAM_FAIL_MAX:       0.30,  // 30% chunk fail rate
    CIRCUIT_OPEN_MAX:    2,     // more than 2 circuits open = cluster
    IDEA_DENSITY_MAX:    10,    // ideas per component
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §10 — LEDGER TAXONOMY
// Every named ledger, its authority, and write rules.
// ══════════════════════════════════════════════════════════════════════════════

const LEDGERS = Object.freeze({

  BRIDGE_REQUESTS: {
    id:        'bridge_requests',
    file:      'data/bridge/ledger/requests.jsonl',
    authority: 'bridge',
    write_rule: 'Bridge only. No direct writes.',
    type:      'append_only',
    schema:    'RequestSchema (bridge/types.js)',
    projection: 'cortex.jaa.requests',
  },

  ORCHESTRATOR: {
    id:        'orchestrator',
    file:      'data/ledger/orchestrator.jsonl',
    authority: 'orchestrator',
    write_rule: 'Orchestrator only via ledgerWrite().',
    type:      'append_only',
    schema:    '{ system, type, payload, ts }',
    projection: null,
  },

  CORTEX_EVENT_LOG: {
    id:        'cortex_event_log',
    file:      'cortex/data/event_log.jsonl',
    authority: 'cortex',
    write_rule: 'Cortex admin server only. All systems write via POST /api/event.',
    type:      'append_only',
    schema:    '{ uuid, type, payload, source, causedBy, ts }',
    projection: null,
  },

  CORTEX_REQUESTS: {
    id:        'cortex_requests',
    file:      'cortex/data/requests.jsonl',
    authority: 'cortex',
    write_rule: 'PROJECTION ONLY. Populated by Bridge SSE subscription. Never written directly.',
    type:      'projection',
    source:    'bridge_requests',
  },

  GUARDIAN_QUEUE: {
    id:        'guardian_queue',
    file:      'data/guardian/queue/',
    authority: 'guardian',
    write_rule: 'Guardian _physQueue only. §BRIDGE-GATE notification sent before write.',
    type:      'filesystem_queue',
    schema:    'PhysicalQueue (lib/queue.js)',
    projection: null,
  },

  EVENT_LEDGER: {
    id:        'event_ledger',
    file:      'data/*/ledger/event_log.jsonl',
    authority: 'per_system',
    write_rule: 'Each system writes its own via lib/event-ledger.js. Written before dispatch.',
    type:      'append_only',
    schema:    '{ uuid, type, source, payload, ts, causedBy, sigma, delta, cfr }',
    projection: null,
  },

  // JAA table tiers (from cortex/memory/jaa-db.js)
  JAA_TIERS: {
    WORKING:   { halfLifeMs: 30*60*1000,    evictAfterMs: 2*60*60*1000,    wipeOnRestart: true },
    SHORT:     { halfLifeMs: 6*60*60*1000,  evictAfterMs: 24*60*60*1000,   wipeOnRestart: false },
    LONG:      { halfLifeMs: null,          evictAfterMs: null,            wipeOnRestart: false },
  },

  // JAA table → tier mapping (complete)
  JAA_TABLES: {
    active_traces:         'working',
    working_memory:        'working',
    agent_messages:        'short',
    cortex_memory:         'short',
    gaps:                  'short',
    artifacts:             'short',
    agent_calls:           'short',
    orion_sessions:        'short',
    seam_records:          'short',
    sigma_records:         'short',
    delta_records:         'short',
    snr_records:           'short',
    ime_profiles:          'short',
    event_log:             'short',
    toasts:                'short',
    healer_log:            'short',
    crystals:              'long',
    intent_nodes:          'long',
    bep_patterns:          'long',
    trust_scores:          'long',
    memory_index:          'long',
    conditioning_log:      'long',
    feedback_scores:       'long',
    self_model:            'long',
    agent_signatures:      'long',
    shape_samples:         'long',
    failures:              'long',
    law_violations:        'long',
    boot_records:          'long',
    fix_map:               'long',
    versionium_commits:    'long',
    versionium_branches:   'long',
    versionium_file_index: 'long',
    versionium_calendar:   'long',
    versionium_objects:    'long',
    causality_nodes:       'long',
    memory_queries:        'long',
    cli_history:           'long',
    schedules:             'long',
    workflow_runs:         'long',
    forge_patches:         'long',
    project_registry:      'long',
    poll_log:              'long',
    requests:              'long',
    backup_records:        'long',
    contract_audit:        'long',
    cfr_ledger:            'long',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// §11 — INTERACTION CONTRACTS
// Declared contracts for every system boundary.
// ══════════════════════════════════════════════════════════════════════════════

const INTERACTION_CONTRACTS = Object.freeze({

  // Bridge interaction contract
  BRIDGE: {
    id:       'bridge-v1',
    uuid:     'nexus-bridge-contract-v1-0000-4000-0000-000000000001',
    version:  '1.0.0',
    port:     9999,
    role:     'Trust-aware request relay with persistence and degradation management',
    health:   { method: 'GET', path: '/health', returns: { ok: true, sessions: 0, pendingRequests: 0 } },
    routes: [
      { method: 'POST', path: '/bridge/handshake',  auth: 'system_secret',  desc: 'System boot identity handshake → token' },
      { method: 'POST', path: '/bridge/request',    auth: 'bridge_token',   desc: 'Submit cross-system request → UUID + status' },
      { method: 'POST', path: '/bridge/event',      auth: 'optional_token', desc: 'Fire-and-forget event → ledger record' },
      { method: 'POST', path: '/bridge/broadcast',  auth: 'optional_token', desc: 'Broadcast to all SSE subscribers' },
      { method: 'POST', path: '/bridge/tags',       auth: 'optional_token', desc: 'Tag any entity by UUID' },
      { method: 'POST', path: '/bridge/revoke',     auth: 'bridge_token',   desc: 'Revoke a session token' },
      { method: 'GET',  path: '/bridge/requests',   auth: 'none',           desc: 'Query request ledger' },
      { method: 'GET',  path: '/bridge/requests/:uuid', auth: 'none',       desc: 'Single request by UUID' },
      { method: 'GET',  path: '/bridge/registry',   auth: 'none',           desc: 'Live system health map' },
      { method: 'GET',  path: '/bridge/circuits',   auth: 'none',           desc: 'Circuit breaker states' },
      { method: 'GET',  path: '/bridge/stats',      auth: 'none',           desc: 'Request ledger statistics' },
      { method: 'GET',  path: '/bridge/contract',   auth: 'none',           desc: 'This contract' },
      { method: 'GET',  path: '/bridge/sse',        auth: 'none',           desc: 'SSE stream of bridge events' },
      { method: 'GET',  path: '/health',            auth: 'none',           desc: 'Bridge health' },
    ],
    siso: {
      emits:    Object.values(EVENTS.BRIDGE),
      consumes: [],
    },
    valid_request_types: [
      'job.dispatch', 'job.complete', 'memory.ingest', 'artifact.store',
      'spec.build', 'gap.open', 'gap.resolve', 'idea.create', 'snapshot.push',
      'seam.deliver', 'event.emit', 'health.check', 'intake.file',
      'bridge.handshake', 'bridge.ping', 'bridge.sync',
    ],
    request_statuses: ['pending', 'dispatched', 'fulfilled', 'failed', 'held', 'cancelled', 'quarantined'],
    max_route_depth:  3,
    max_attempts:     5,
    circuit_breaker:  { fail_threshold: 3, reset_ms: 30000 },
  },

  // Seam contracts (from seams/seam-contracts.js)
  SEAM: {
    CORTEX:   { name: 'CORTEX_CONTRACT',      between: ['forge', 'cortex-3748'] },
    GUARDIAN: { name: 'GUARDIAN_WSS_CONTRACT', between: ['userscript', 'guardian-7821'] },
    FORGE:    { name: 'FORGE_CONTRACT',        between: ['guardian', 'forge-4800'] },
    SPEC:     { name: 'SPEC_SEAM_CONTRACT',    between: ['spec-parser', 'seam-delivery'] },
    CLI_UI:   { name: 'CLI_UI_CONTRACT',       between: ['cli', 'cockpit-ui'], hotswap: true },
  },

  // Universal rules every contract must satisfy
  UNIVERSAL_RULES: [
    'Respond to GET /health within 3000ms',
    'Emit UDP pulse on :7777 every 10s',
    'Register with orchestrator on boot via POST :9000/api/register',
    'Handshake with Bridge on boot via POST :9999/bridge/handshake',
    'Write boot record to event_log on successful start',
    'Never call another system directly — always via Bridge or nexus-connect',
    'Every request carries X-Bridge-UUID if it crossed Bridge',
    'Every request carries X-Bridge-Source identifying the originating system',
    'Requests must be idempotent — retrying must not cause duplicate state',
    'All errors are loud and specific — §1.2',
    'No stubs in production — §1.3',
  ],
});

// ══════════════════════════════════════════════════════════════════════════════
// §12 — VERIFICATION CONTRACTS
// What each system must prove to be considered functional.
// ══════════════════════════════════════════════════════════════════════════════

const VERIFICATION_CONTRACTS = Object.freeze({

  // Every system must pass all of these
  UNIVERSAL: [
    { id: 'V-UNI-01', check: 'GET /health returns { ok: true } within 3000ms' },
    { id: 'V-UNI-02', check: 'System registers with orchestrator on boot' },
    { id: 'V-UNI-03', check: 'System handshakes with Bridge on boot and receives token' },
    { id: 'V-UNI-04', check: 'Boot record written to event_log on successful start' },
    { id: 'V-UNI-05', check: 'UDP pulse emitted on :7777 within 15s of boot' },
    { id: 'V-UNI-06', check: 'System survives restart without data loss (§2.1)' },
    { id: 'V-UNI-07', check: 'All errors surface explicitly — no silent failures (§1.2)' },
    { id: 'V-UNI-08', check: 'interaction-contract.json present and valid JSON' },
    { id: 'V-UNI-09', check: 'System listed in SYSTEM-CONTRACTS.js SYSTEMS registry' },
    { id: 'V-UNI-10', check: 'Version number matches MANIFEST.json version field' },
  ],

  BRIDGE: [
    { id: 'V-BRG-01', check: 'POST /bridge/handshake with valid secret returns { ok:true, token }' },
    { id: 'V-BRG-02', check: 'POST /bridge/handshake with invalid secret returns 401' },
    { id: 'V-BRG-03', check: 'POST /bridge/request creates ledger entry before HTTP response' },
    { id: 'V-BRG-04', check: 'POST /bridge/request to offline target sets status=held' },
    { id: 'V-BRG-05', check: 'Held requests drain when target comes online' },
    { id: 'V-BRG-06', check: 'routeHistory grows by 1 on each fallback hop' },
    { id: 'V-BRG-07', check: 'MAX_ROUTE_DEPTH=3 enforced — 4th hop returns FAILED' },
    { id: 'V-BRG-08', check: 'Circuit breaker opens after 3 failures to same target' },
    { id: 'V-BRG-09', check: 'Circuit breaker half-opens after 30s' },
    { id: 'V-BRG-10', check: 'GET /bridge/requests returns array' },
    { id: 'V-BRG-11', check: 'GET /bridge/registry shows all known systems' },
    { id: 'V-BRG-12', check: 'GET /bridge/sse returns text/event-stream' },
    { id: 'V-BRG-13', check: 'SSE emits bridge.request.created on new request' },
    { id: 'V-BRG-14', check: 'Cortex requests table updated after bridge.request.created event' },
  ],

  CORTEX: [
    { id: 'V-CTX-01', check: 'GET /health returns { status: ok, jaa: { counts } }' },
    { id: 'V-CTX-02', check: 'POST /api/event writes to event_log JAA table' },
    { id: 'V-CTX-03', check: 'GET /api/events returns array of events' },
    { id: 'V-CTX-04', check: 'GET /api/gaps returns open gaps array' },
    { id: 'V-CTX-05', check: 'POST /api/tags writes event to event_log and returns { ok:true, entityId, tags }' },
    { id: 'V-CTX-06', check: 'GET /api/requests returns Bridge ledger projection (not direct writes)' },
    { id: 'V-CTX-07', check: 'POST /api/table/insert rejects table=requests with 400' },
    { id: 'V-CTX-08', check: 'NAS router quarantines requests lacking bridgeUuid' },
    { id: 'V-CTX-09', check: '28 JAA tables initialised on boot' },
    { id: 'V-CTX-10', check: 'CFR ledger writes sigma + delta + cfr snapshot per event' },
    { id: 'V-CTX-11', check: 'GET /cfr/health returns CFR field dimensions' },
    { id: 'V-CTX-12', check: 'GET /cfr/nodes returns high-sigma nodes (may be empty)' },
    { id: 'V-CTX-13', check: 'Data survives cortex restart (§2.1)' },
  ],

  GUARDIAN: [
    { id: 'V-GRD-01', check: 'GET /health returns { ok, uptime, jobs, providers }' },
    { id: 'V-GRD-02', check: 'POST /command dispatches job and returns { ok, jobId }' },
    { id: 'V-GRD-03', check: 'GET /jobs returns job array' },
    { id: 'V-GRD-04', check: 'GET /providers returns provider connection status' },
    { id: 'V-GRD-05', check: 'Artifact capture: artifact written to JAA on response' },
    { id: 'V-GRD-06', check: 'SEAM queue: chunk injected → stable → verified lifecycle' },
    { id: 'V-GRD-07', check: 'Physical queue survives Guardian restart (§LAW II)' },
    { id: 'V-GRD-08', check: 'GET /bus returns SISO bus log' },
    { id: 'V-GRD-09', check: 'POST /bus/emit injects event to bus' },
    { id: 'V-GRD-10', check: 'NCP channel: GET /channel returns SSE stream' },
    { id: 'V-GRD-11', check: 'Enqueue calls notify Bridge before filesystem write' },
    { id: 'V-GRD-12', check: 'getLocalIPs() defined and returns array of { address, name }' },
    { id: 'V-GRD-13', check: 'uploadDir aliased from cfg.uploadDir before first use' },
  ],

  ORCHESTRATOR: [
    { id: 'V-ORC-01', check: 'GET /health returns all system health in parallel' },
    { id: 'V-ORC-02', check: 'POST /api/register accepts system registrations' },
    { id: 'V-ORC-03', check: 'GET /api/recall returns ledger history' },
    { id: 'V-ORC-04', check: 'GET /api/registry returns live heartbeat map' },
    { id: 'V-ORC-05', check: 'GET /sse returns unified SSE stream' },
    { id: 'V-ORC-06', check: 'Watchdog detects system offline within 15s' },
    { id: 'V-ORC-07', check: 'GET /api/bridge/* proxies to Bridge :9999' },
    { id: 'V-ORC-08', check: '_bootSystems invoked after server listen' },
    { id: 'V-ORC-09', check: 'Bridge added as first in boot sequence' },
    { id: 'V-ORC-10', check: 'cliRequests() and cliTag() defined and callable' },
    { id: 'V-ORC-11', check: 'Ledger persisted to data/ledger/orchestrator.jsonl' },
    { id: 'V-ORC-12', check: 'ui/orchestrator.js and root orchestrator.js are identical' },
  ],

  IDEARIUM: [
    { id: 'V-IDR-01', check: 'GET /health returns { ok, version, snr, uptime }' },
    { id: 'V-IDR-02', check: 'POST /api/ideas creates idea and returns uuid' },
    { id: 'V-IDR-03', check: 'POST /api/ideas/:uuid/spec creates spec from idea' },
    { id: 'V-IDR-04', check: 'POST /api/gaps opens gap linked to idea' },
    { id: 'V-IDR-05', check: 'GET /api/snr returns current SNR value 0..1' },
    { id: 'V-IDR-06', check: 'POST /api/snapshots creates versionium commit' },
    { id: 'V-IDR-07', check: 'GET /sse returns SSE stream with idearium events' },
    { id: 'V-IDR-08', check: 'startAPI() called at EOF of idearium/api/index.js' },
    { id: 'V-IDR-09', check: 'ESM chain: package.json type:module at every level' },
  ],

  EMERGE: [
    { id: 'V-EMG-01', check: 'GET /status returns { streams, schema: { keywords: 595 } }' },
    { id: 'V-EMG-02', check: 'POST /compile returns compile result' },
    { id: 'V-EMG-03', check: 'POST /check returns SNR gate result' },
    { id: 'V-EMG-04', check: 'emerge.spec loaded with 595 keywords' },
    { id: 'V-EMG-05', check: 'emerge-kernel.js loads without error' },
  ],
});

// ══════════════════════════════════════════════════════════════════════════════
// §12b — CAUSAL PHYSICS MODEL
// The three-layer causal stack and the physics of propagation.
// ══════════════════════════════════════════════════════════════════════════════

const CAUSAL_PHYSICS = Object.freeze({

  // The three causal stack layers
  LAYERS: {
    STRUCTURAL: {
      name:   'structural_causality',
      engine: 'lib/cfr/graph.js (CausalGraph)',
      provides: ['ancestry', 'lineage', 'dependency tree', 'job chains', 'session clusters'],
      desc:   'Who caused what. Static causal graph.',
    },
    RESIDUAL: {
      name:   'residual_causality',
      engine: 'lib/cfr/sigma.js + lib/event-ledger.js',
      provides: ['invariants', 'failure precursors', 'baseline deviation', 'co-occurrence patterns'],
      desc:   'How far events deviate from baseline. The learning layer.',
    },
    PROPAGATION: {
      name:   'propagation_dynamics',
      engine: 'lib/causal/compound.js (CompoundEngine)',
      provides: ['ripple/wave/tidal regimes', 'cross-graph amplification', 'systemic resonance', 'compounding factors'],
      desc:   'How energy moves through the graph. Emergent regime detection.',
    },
  },

  // CausalImpulse — the physics underlying every event
  // Computed once at analysis time. Never recomputed (ephemeral context).
  CAUSAL_IMPULSE_SCHEMA: {
    magnitude:       'energy injected into the graph (sigma × field entropy)',
    entropy:         'disorder introduced (CFR entropy snapshot)',
    branchingFactor: 'independent causal paths opened (error=2.5, violation=3.5, collapse=4.0)',
    resistance:      'current field state damping (coherence × 0.6 − entropy × 0.4)',
    decayRate:       'energy lost per hop (0.05..0.85, high coherence = fast decay)',
    energyAtHop1:    'predicted propagation energy at depth 1',
    energyAtHop3:    'predicted propagation energy at depth 3 (wave threshold)',
    energyAtHop6:    'predicted propagation energy at depth 6 (tidal threshold)',
    predictedRegime: 'ripple | wave | tidal — from physics alone, before graph confirms',
  },

  // Propagation function
  // E(N) = magnitude × branchingFactor^N × (1 - decayRate)^N × (1 / (1 + resistance))
  PROPAGATION_EQUATION: 'E(N) = magnitude × branchingFactor^N × (1 - decayRate)^N × R where R = 1/(1 + resistance)',

  // Regime thresholds (from energy function)
  REGIME_THRESHOLDS: {
    RIPPLE: 'E(3) < 0.2  — linear + low branching. Energy dampens.',
    WAVE:   'E(3) >= 0.2 — exponential + bounded spread. Energy persists.',
    TIDAL:  'E(6) >= 0.4 — superlinear + cross-system. Energy amplifies.',
  },

  // Gate rules — when compound analysis triggers
  GATE_RULES: [
    'sigma >= 0.70 on the triggering event',
    'event type does NOT start with compound.* (no recomputation storms)',
    'analysis runs via setImmediate — write path is never blocked',
    'JAA inserts from compound engine do NOT route through CFR ledger.record()',
  ],

  // What this system is (not metaphor — correct technical terms)
  CLASSIFICATION: 'A causal physics engine over software behaviour — a second-order causal field over a first-order causal graph.',
});

// ══════════════════════════════════════════════════════════════════════════════
// §13 — SELF-AWARENESS CONTRACT
// Every backend system must be aware of its own state and the system state.
// ══════════════════════════════════════════════════════════════════════════════

const SELF_AWARENESS = Object.freeze({

  // What every system must know about itself
  SELF: [
    'Own systemId, UUID, version, port',
    'Own health status (uptime, error count, last error)',
    'Own ledger path and write count',
    'Own Bridge token (from handshake) and expiry',
    'Own boot phase completion status',
    'Own SISO bus event count and last event type',
    'Own CFR field snapshot (coherence, friction, resonance, entropy, regime)',
  ],

  // What every system must know about the system
  SYSTEM: [
    'All other systems online/offline status (from orchestrator registry)',
    'Bridge request queue depth (held + pending)',
    'Own open gaps (from Cortex GET /api/gaps?source=<systemId>)',
    'Own recent failures (from Cortex failures table)',
    'Current CFR regime (from Cortex GET /cfr/health)',
    'Session UUID chain for context continuity',
  ],

  // How self-awareness is expressed in code
  IMPLEMENTATION: {
    health_endpoint:  'GET /health — returns own state snapshot',
    contract_endpoint:'GET /contract — returns own interaction contract',
    bus_endpoint:     'GET /bus — returns own SISO bus log',
    sse_endpoint:     'GET /sse or /events — live state stream',
    diagnose_check:   'node cli/diagnose.js <systemId> — external self-test',
    session_render:   'node cli/session.js — system-wide state snapshot',
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  NEXUS_VERSION,
  AXIOMS,
  SYSTEMS,
  EVENTS,
  GAPS,
  FAULTS,
  EDGES,
  DELTAS,
  DIVERGENT,
  BOTTLENECKS,
  LEDGERS,
  INTERACTION_CONTRACTS,
  VERIFICATION_CONTRACTS,
  SELF_AWARENESS,

  // Convenience: get contract for a system by id
  CAUSAL_PHYSICS,

  getContract(systemId) {
    return INTERACTION_CONTRACTS[systemId.toUpperCase()] || null;
  },

  // Convenience: get verification checks for a system
  getVerification(systemId) {
    return VERIFICATION_CONTRACTS[systemId.toUpperCase()] || VERIFICATION_CONTRACTS.UNIVERSAL;
  },

  // Convenience: get all event types as a flat array
  allEventTypes() {
    const types = [];
    for (const group of Object.values(EVENTS)) {
      for (const val of Object.values(group)) {
        if (typeof val === 'string') types.push(val);
      }
    }
    return [...new Set(types)].sort();
  },
};
