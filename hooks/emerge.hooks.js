'use strict';
/**
 * hooks/emerge.hooks.js — Emerge System Hook Map
 * UUID: emerge-hooks-map-v1-0000-4000
 * System: Emerge :4242
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
    id: "emerge-hook-health-0001",
    name: "emerge-health",
    intent: "Emerge IDE health",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/status",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-compile-0002",
    name: "emerge-compile",
    intent: "Compile .emerge spec → T0/T1/T2 pipeline",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/compile",
      method: "POST"
    },
    contract: {
      axioms: [
        "nexus-interaction-contract-v1::emerge"
      ],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: {
      componentId: "emerge.compiler.receive",
      intentId: "build|compile|forge"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-compile-out-cortex-0003",
    name: "emerge-compile-to-cortex",
    intent: "Compile .emerge spec → T0/T1/T2 pipeline — result wire to cortex",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    to: {
      surface: "cortex",
      layer: 1
    },
    config: {
      eventType: "emerge.compiler.complete"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: cortex.raid.feedback",
        "wires_to: guardian.job.dispatch.receive"
      ],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: {
      componentId: "emerge.compiler.complete",
      intentId: "result"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-compile-out-guardian-0004",
    name: "emerge-compile-to-guardian",
    intent: "Compile .emerge spec → T0/T1/T2 pipeline — result wire to guardian",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    to: {
      surface: "guardian",
      layer: 1
    },
    config: {
      eventType: "emerge.compiler.complete"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: cortex.raid.feedback",
        "wires_to: guardian.job.dispatch.receive"
      ],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: {
      componentId: "emerge.compiler.complete",
      intentId: "result"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-codegen-0005",
    name: "emerge-codegen",
    intent: "Code generation from spec fragment",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/codegen",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-hot-load-0006",
    name: "emerge-hot-load",
    intent: "Hot-patch a running module (QUARANTINE→PROVE→INTEGRATE→MONITOR)",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/hot-load",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: {
      componentId: "emerge.hot-load.receive",
      intentId: "deploy|patch|hot-load"
    },
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-snapshot-0007",
    name: "emerge-snapshot",
    intent: "Snapshot before applying patch",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/snapshot",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-check-0008",
    name: "emerge-check",
    intent: "Pre-compile spec validation",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/check",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-models-0009",
    name: "emerge-models",
    intent: "Available Ollama models for compilation",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
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
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-files-0010",
    name: "emerge-files",
    intent: "File browser for spec loading",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/files",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "emerge-hook-seams-0011",
    name: "emerge-seams",
    intent: "Active SEAM sessions for current file",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "emerge",
      layer: 1,
      port: 4242
    },
    config: {
      path: "/api/seams",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "emerge/registry-components.js"
      ]
    },
    seam: null,
    status: "planned",
    updatedAt: "2026-06-29T00:00:00Z"
  }
];
module.exports = {
  systemId: 'emerge', port: 4242, version: '1.0.0', updatedAt: '2026-06-29T00:00:00Z',
  hooks: HOOKS,
  byId: (id) => HOOKS.find(h => h.id === id),
  byName: (n) => HOOKS.find(h => h.name === n),
  byType: (t) => HOOKS.filter(h => h.type === t),
  withSEAM: () => HOOKS.filter(h => h.seam !== null),
  active: () => HOOKS.filter(h => h.status === 'active'),
};
