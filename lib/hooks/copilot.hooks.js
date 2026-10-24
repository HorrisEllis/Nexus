'use strict';
/**
 * hooks/copilot.hooks.js — Copilot System Hook Map
 * UUID: copilot-hooks-map-v1-0000-4000
 * System: Copilot :3750
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
    id: "copilot-hook-bridge-deliver-post-0100",
    name: "copilot-bridge-deliver-post",
    intent: "Write bridge deliver (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "copilot", layer: 1, port: 3750 },
    config: { path: "/bridge/deliver", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["copilot/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "copilot-hook-api-channel-post-0101",
    name: "copilot-api-channel-post",
    intent: "Write channel (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "copilot", layer: 1, port: 3750 },
    config: { path: "/api/channel", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["copilot/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "copilot-hook-api-observe-post-0102",
    name: "copilot-api-observe-post",
    intent: "Write observe (generated from code by scripts/generate-hooks.js — refine by hand)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "copilot", layer: 1, port: 3750 },
    config: { path: "/api/observe", method: "POST" },
    contract: { axioms: [], sideEffects: [], idempotent: false },
    references: { files: ["copilot/server.js"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-0001",
    name: "copilot-prompt",
    intent: "Primary entry — all co-pilot interactions",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/prompt",
      method: "POST"
    },
    contract: {
      axioms: [
        "nexus-interaction-contract-v1::copilot"
      ],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: {
      componentId: "copilot.prompt.receive",
      intentId: "ask|build|diagnose|navigate|note|tool|action"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-out-ollama-0002",
    name: "copilot-prompt-to-ollama",
    intent: "Primary entry — all co-pilot interactions — result wire to ollama",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    to: {
      surface: "ollama",
      layer: 1
    },
    config: {
      eventType: "copilot.prompt.to-ollama"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: ollama.jobs.dispatch.receive"
      ],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: {
      componentId: "copilot.prompt.to-ollama",
      intentId: "model"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-out-ui-0003",
    name: "copilot-prompt-to-ui",
    intent: "Primary entry — all co-pilot interactions — result wire to ui",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    to: {
      surface: "ui",
      layer: 1
    },
    config: {
      eventType: "copilot.prompt.reply"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: ui.copilot.receive"
      ],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: {
      componentId: "copilot.prompt.reply",
      intentId: "response"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-stream-query-0004",
    name: "copilot-stream-query",
    intent: "Query the continuous event stream",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/stream",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-stream-ingest-0005",
    name: "copilot-stream-ingest",
    intent: "Push events into co-pilot stream",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/stream/ingest",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-sessions-0006",
    name: "copilot-sessions",
    intent: "Active co-pilot sessions",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/sessions",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-axioms-list-0007",
    name: "copilot-axioms-list",
    intent: "List all axioms",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/axioms",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-axioms-add-0008",
    name: "copilot-axioms-add",
    intent: "Add a runtime axiom",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/axioms/add",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-axioms-remove-0009",
    name: "copilot-axioms-remove",
    intent: "Remove a runtime axiom",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/axioms/remove",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-lifeline-health-0010",
    name: "copilot-lifeline-health",
    intent: "Lifeline provider health",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/lifeline/health",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-build-0011",
    name: "copilot-build",
    intent: "Build a new module from description",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/build",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-diagnose-0012",
    name: "copilot-diagnose",
    intent: "Start recursive fractal diagnosis",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/diagnose",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-diagnose-list-0013",
    name: "copilot-diagnose-list",
    intent: "List past diagnosis sessions",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/diagnose/list",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-fulfill-0013b",
    name: "copilot-prompt-fulfill",
    intent: "Adaptive iteration — RAID-routed, fault-classified, reflection-scored (§15.1-15.3)",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "copilot", layer: 1, port: 3750 },
    config: { path: "/api/prompt/fulfill", method: "POST" },
    contract: {
      axioms: ["nexus-interaction-contract-v1::copilot"],
      sideEffects: [],
      idempotent: false
    },
    references: { files: ["copilot/registry-components.js", "copilot/adaptive-fulfillment.js"] },
    seam: { componentId: "copilot.prompt.fulfill.receive", intentId: "ask|build|diagnose" },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-fulfill-out-cortex-0013c",
    name: "copilot-prompt-fulfill-to-cortex",
    intent: "Adaptive iteration — result wire to cortex",
    type: "event-bus",
    direction: "unidirectional",
    from: { surface: "copilot", layer: 1, port: 3750 },
    to: { surface: "cortex", layer: 1 },
    config: { eventType: "copilot.fulfillment.attempt" },
    contract: {
      axioms: [],
      sideEffects: ["wires_to: cortex.intelligence.event"],
      idempotent: false
    },
    references: { files: ["copilot/registry-components.js", "copilot/adaptive-fulfillment.js"] },
    seam: { componentId: "copilot.fulfillment.attempt", intentId: "learning" },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-stream-0014",
    name: "copilot-prompt-stream",
    intent: "Streaming SSE prompt — token-by-token, no timeout (P112)",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/api/prompt/stream",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: {
      componentId: "copilot.prompt.stream.receive",
      intentId: "ask"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-prompt-stream-out-ui-0015",
    name: "copilot-prompt-stream-to-ui",
    intent: "Streaming SSE prompt — token-by-token, no timeout (P112) — result wire to ui",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    to: {
      surface: "ui",
      layer: 1
    },
    config: {
      eventType: "copilot.prompt.stream.chunk"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: ui.copilot.stream"
      ],
      idempotent: false
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: {
      componentId: "copilot.prompt.stream.chunk",
      intentId: "streaming"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-health-0016",
    name: "copilot-health",
    intent: "Co-pilot health",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
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
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "copilot-hook-contract-0017",
    name: "copilot-contract",
    intent: "Co-pilot interaction contract",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "copilot",
      layer: 1,
      port: 3750
    },
    config: {
      path: "/contract",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "copilot/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },

  // §Phase-0 nerve-pulse 2026-07-01 — presence signal added so Nerve's
  // per-source lastSeen/emitCount tracking has something real to read.
  {
    id:        'cp-hook-heartbeat-0099',
    name:      'copilot-heartbeat',
    intent:    'Signal copilot liveness to orchestrator every 10s so nexus-bus._sources tracks real presence for the Nerve attention layer',
    type:      'api',
    direction: 'unidirectional',
    from:      { surface: 'copilot', layer: 2, port: 3750 },
    to:        { surface: 'orchestrator', layer: 0, port: 9000 },
    config:    { path: '/api/heartbeat', method: 'POST', intervalMs: 10000 },
    contract:  { axioms: ['§2.3'], sideEffects: ['orchestrator.lastSeen updated', 'nexus-bus._sources.emitCount++'], idempotent: true },
    references: { files: ['copilot/server.js → register() → startHeartbeat()', 'nexus-connect.js → startHeartbeat'] },
    seam:      null,
    status:    'active',
    updatedAt: '2026-07-01T00:00:00Z',
  }
];
module.exports = {
  systemId: 'copilot', port: 3750, version: '1.0.0', updatedAt: '2026-06-29T00:00:00Z',
  hooks: HOOKS,
  byId: (id) => HOOKS.find(h => h.id === id),
  byName: (n) => HOOKS.find(h => h.name === n),
  byType: (t) => HOOKS.filter(h => h.type === t),
  withSEAM: () => HOOKS.filter(h => h.seam !== null),
  active: () => HOOKS.filter(h => h.status === 'active'),
};
