'use strict';
/**
 * hooks/eravos.hooks.js — Eravos System Hook Map
 * UUID: eravos-hooks-map-v1-0000-4000
 * System: Eravos :3751
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
    id: "eravos-hook-canvas-0001",
    name: "eravos-canvas",
    intent: "Main ERAVOS canvas — organisms, wires, transport",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-organism-spawn-0002",
    name: "eravos-organism-spawn",
    intent: "Spawn an organism by id onto the canvas",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/organisms",
      method: "POST"
    },
    contract: {
      axioms: [
        "nexus-interaction-contract-v1::eravos"
      ],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: {
      componentId: "eravos.organism.spawn.receive",
      intentId: "compose|visualize|spawn"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-organism-spawn-out-cortex-0003",
    name: "eravos-organism-spawn-to-cortex",
    intent: "Spawn an organism by id onto the canvas — result wire to cortex",
    type: "event-bus",
    direction: "unidirectional",
    from: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    to: {
      surface: "cortex",
      layer: 1
    },
    config: {
      eventType: "eravos.organism.spawn.complete"
    },
    contract: {
      axioms: [],
      sideEffects: [
        "wires_to: cortex.raid.feedback"
      ],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: {
      componentId: "eravos.organism.spawn.complete",
      intentId: "spawned"
    },
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-organism-list-0004",
    name: "eravos-organism-list",
    intent: "List all mounted organisms",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/organisms",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-organism-remove-0005",
    name: "eravos-organism-remove",
    intent: "Remove an organism",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/organisms/:uuid",
      method: "DELETE"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-wire-connect-0006",
    name: "eravos-wire-connect",
    intent: "Connect two organism hooks",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/wires",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-wire-list-0007",
    name: "eravos-wire-list",
    intent: "List all wires",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/wires",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-catalog-list-0008",
    name: "eravos-catalog-list",
    intent: "Available organisms from registry",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/catalog",
      method: "GET"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: true
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-pack-install-0009",
    name: "eravos-pack-install",
    intent: "Install a .zip organism pack",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/pack/install",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-transport-play-0010",
    name: "eravos-transport-play",
    intent: "Start playback",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/transport/play",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-transport-stop-0011",
    name: "eravos-transport-stop",
    intent: "Stop playback",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
    },
    config: {
      path: "/api/transport/stop",
      method: "POST"
    },
    contract: {
      axioms: [],
      sideEffects: [],
      idempotent: false
    },
    references: {
      files: [
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-health-0012",
    name: "eravos-health",
    intent: "ERAVOS health",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
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
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  },
  {
    id: "eravos-hook-contract-0013",
    name: "eravos-contract",
    intent: "ERAVOS interaction contract",
    type: "api",
    direction: "unidirectional",
    from: {
      surface: "*",
      layer: 0
    },
    to: {
      surface: "eravos",
      layer: 1,
      port: 3751
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
        "eravos/registry-components.js"
      ]
    },
    seam: null,
    status: "active",
    updatedAt: "2026-06-29T00:00:00Z"
  }
];
module.exports = {
  systemId: 'eravos', port: 3751, version: '1.0.0', updatedAt: '2026-06-29T00:00:00Z',
  hooks: HOOKS,
  byId: (id) => HOOKS.find(h => h.id === id),
  byName: (n) => HOOKS.find(h => h.name === n),
  byType: (t) => HOOKS.filter(h => h.type === t),
  withSEAM: () => HOOKS.filter(h => h.seam !== null),
  active: () => HOOKS.filter(h => h.status === 'active'),
};
