'use strict';
/**
 * hooks/ollama.hooks.js — Ollama System Hook Map
 * UUID: ollama-hooks-map-v1-0000-4000
 * System: Ollama :3749
 * Status: living
 *
 * §A-2  Hooks are the wire.
 * §A-3  Map before build.
 * §A-4  Spec is living.
 *
 * Generated 2026-06-29 (Phase 61 backfill) by projecting registry-components.js
 * (already audited, Phase 96) into this schema — see hooks/idearium.hooks.js
 * for the hand-written reference this follows. Every inbound hook is a real
 * route from the registry; every outbound hook is a real hooks.out.wires_to[]
 * entry already declared in the registry. Nothing here was invented — this
 * makes data that already existed registry-visible at the hooks/ level too.
 */
const HOOKS = [
  {
    id: "ollama-hook-api-upload-post-0100",
    name: "ollama-api-upload-post",
    intent: "Write upload (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "ollama", layer: 1, port: 3749 },
    config: { path: "/api/upload", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["ollama/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-tools-0009",
    name: "ollama-jobs-tools",
    intent: "Run a job through the sovereign agent tool-calling loop (lib/agent-tools)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "ollama", layer: 1, port: 3749 },
    config: { path: "/api/jobs/tools", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["lib/agent-tools/index.js","lib/agent-tools/tools/query/read-file.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-dispatch-0001",
    name: "ollama-jobs-dispatch",
    intent: "Queue a job for local model execution",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/jobs",
      method: "POST"
    },
    contract: {
      axioms: [
        "nexus-interaction-contract-v1::ollama"
      ],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: {
      componentId: "ollama.jobs.dispatch.receive",
      intentId: "build|ask|forge|classify"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-dispatch-out-cortex-0002",
    name: "ollama-jobs-dispatch-to-cortex",
    intent: "Queue a job for local model execution — result wire to cortex",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    to: {
      surface: "cortex",
      layer: 1
    },
    config: {
      eventType: "ollama.jobs.dispatch.complete"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: cortex.raid.feedback",
        "wires_to: copilot.receive_result"
      ],
      idempotent: false
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: {
      componentId: "ollama.jobs.dispatch.complete",
      intentId: "result"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-dispatch-out-copilot-0003",
    name: "ollama-jobs-dispatch-to-copilot",
    intent: "Queue a job for local model execution — result wire to copilot",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    to: {
      surface: "copilot",
      layer: 1
    },
    config: {
      eventType: "ollama.jobs.dispatch.complete"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: cortex.raid.feedback",
        "wires_to: copilot.receive_result"
      ],
      idempotent: false
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: {
      componentId: "ollama.jobs.dispatch.complete",
      intentId: "result"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-list-0004",
    name: "ollama-jobs-list",
    intent: "List recent jobs",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/jobs",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-get-0005",
    name: "ollama-jobs-get",
    intent: "Get single job by id",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/jobs/:id",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-jobs-cancel-0006",
    name: "ollama-jobs-cancel",
    intent: "Cancel a queued job",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/jobs/:id",
      method: "DELETE"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-queue-status-0007",
    name: "ollama-queue-status",
    intent: "Queue depth and running count",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/queue",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-models-list-0008",
    name: "ollama-models-list",
    intent: "Available local models",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/api/models",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "ollama-hook-health-0009",
    name: "ollama-health",
    intent: "Ollama bridge health",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "ollama",
      layer: 1,
      port: 3749
    },
    config: {
      path: "/health",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "ollama/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },

  // §Phase-0 nerve-pulse 2026-07-01
  {
    id:        'ol-hook-heartbeat-0099',
    name:      'ollama-heartbeat',
    intent:    'Signal ollama-bridge liveness to orchestrator every 10s for Nerve presence tracking',
    type:      'api',
    direction: 'unidirectional',
    from:      { surface: 'ollama', layer: 2, port: 3749 },
    to:        { surface: 'orchestrator', layer: 0, port: 9000 },
    config:    { path: '/api/heartbeat', method: 'POST', intervalMs: 10000 },
    contract:  { axioms: ['§2.3'], sideEffects: ['orchestrator.lastSeen updated'], idempotent: true },
    references: { files: ['ollama/server.js → register() → startHeartbeat()', 'nexus-connect.js → startHeartbeat'] },
    seam:      null,
    status:    'active',
    updatedAt: '2026-07-01T00:00:00Z',
  }
];
module.exports = {
  systemId: 'ollama', port: 3749, version: '1.0.0', updatedAt: '2026-06-29T00:00:00Z',
  hooks: HOOKS,
  byId: (id) => HOOKS.find(h => h.id === id),
  byName: (n) => HOOKS.find(h => h.name === n),
  byType: (t) => HOOKS.filter(h => h.type === t),
  withSEAM: () => HOOKS.filter(h => h.seam !== null),
  active: () => HOOKS.filter(h => h.status === 'active'),
};
