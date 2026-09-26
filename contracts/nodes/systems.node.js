'use strict';
/**
 * contracts/nodes/systems.node.js — extracted from contracts/SYSTEM-CONTRACTS.js
 * Real node id: contracts.systems.node
 * §EXTRACTED 2026-09-12 — cli/decompose.js --mode=registry, block SYSTEMS.
 * Verbatim body — this extraction moves the const, it does not re-derive it,
 * so nothing about the taxonomy itself changed, only where it lives.
 */
module.exports = Object.freeze({
  ORCHESTRATOR: {
    id:          'orchestrator',
    uuid:        'nexus-orchestrator-v2-0-0',
    port:        9000,
    healthPath:  '/health',
    role:        'Command and control. Source of truth for system state. Proxies all routes.',
    bootFile:    'orchestrator/orchestrator.js',
    ledger:      'data/ledger/orchestrator.jsonl',
    secret:      'nexus-orchestrator-internal-v1',
    bootOrder:   0,
  },
  // §RETIRED 2026-09-06 — bridge system entry removed (James: "it has to go"). See docs/AXIOMS-v3.1.md §5.2/§9.1.
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
    bootFile:    'emerge/emerge-ide.js',
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
