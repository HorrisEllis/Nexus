'use strict';
/**
 * contracts/nodes/ledgers.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.ledgers.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block LEDGERS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({

  // §RETIRED 2026-09-06 — bridge_requests table removed with Bridge.

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
