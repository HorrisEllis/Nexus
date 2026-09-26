/**
 * foundation/types.js
 * COMPARTMENT OS — Base Type Definitions
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * These are structural contracts, not runtime validators.
 * Use validateHook() in hook-schema.js for runtime validation.
 * Every shape defined here maps 1:1 to the spec §3.
 */

'use strict';

// ─── Primitive Aliases ────────────────────────────────────────────────────────
// Documented here for spec traceability. All are strings or numbers at runtime.

// CompartmentID  = String  (UUID v4)
// HookID         = String  (UUID v4)
// EventType      = String  ("{layer}:{noun}:{verb}")
// RuntimeID      = String  ("node" | "python" | "electron" | "html" | "deno" | ...)
// CompilerID     = String  ("esbuild" | "tsc" | "pyinstaller" | ...)

// ─── Default Shapes ───────────────────────────────────────────────────────────
// Used as templates and for Object.assign defaults.

const DEFAULT_NETWORK_CONFIG = Object.freeze({
  isolated:     true,
  proxyPort:    null,
  allowedHosts: [],
  dnsOverride:  {},
});

const DEFAULT_FS_CONFIG = Object.freeze({
  root:         '',
  writable:     [],
  readonly:     [],
  mounts:       [],
  watchEnabled: true,
});

const DEFAULT_COMPILER_CONFIG = Object.freeze({
  id:      null,
  target:  null,
  flags:   [],
  outDir:  'dist',
  watch:   false,
});

const DEFAULT_WATCHDOG_CONFIG = Object.freeze({
  enabled:        false,   // COS: Watchdog off by default
  memoryLimitMB:  0,
  cpuLimitPct:    0,
  stallTimeoutMs: 0,
  crashLoopLimit: 3,
  fsPolicy:       'log',
  netPolicy:      'log',
  onAnomaly:      'snapshot',
});

const DEFAULT_COMPARTMENT = Object.freeze({
  id:          null,
  name:        '',
  purpose:     '',
  runtimeId:   null,
  archetypeId: null,
  entryFile:   null,
  uiFile:      null,
  state:       'created',
  // §MCO04 2026-09-18 — James: "Migrate to cos. Expand cos if needed."
  // Real, confirmed gap: `state` (created/running/stopped) tracks
  // PROCESS lifecycle — whether the compartment is alive — not what
  // KIND of work an agent is doing inside a running one. workPhase is
  // that second, independent axis: EXPLORING (read-only investigation)
  // -> ACTING (mutation-capable) -> VERIFYING (read-only again, checking
  // ACTING's real result). null until an agent-driven run actually
  // starts using phases — a compartment created for something else
  // entirely (a plain dev sandbox) is never forced into this model.
  workPhase:   null,
  network:     DEFAULT_NETWORK_CONFIG,
  fs:          DEFAULT_FS_CONFIG,
  compiler:    DEFAULT_COMPILER_CONFIG,
  watchdog:    DEFAULT_WATCHDOG_CONFIG,
  hooks:       [],
  tags:        [],
  createdAt:   null,
  updatedAt:   null,
  snapshotAt:  null,
  cosVersion:  null,
  slug:        '',
  createdBy:   null,
});

const DEFAULT_HOOK = Object.freeze({
  id:            null,
  name:          '',
  version:       '1.0.0',
  compartmentId: 'host',
  contract: Object.freeze({
    inputs:      [],
    outputs:     [],
    sideEffects: [],
    axioms:      [],
  }),
  bindings: Object.freeze({
    ui:    null,
    cli:   null,
    event: null,
  }),
  meta: Object.freeze({
    description:  '',
    autoDetected: false,
    sourceFile:   null,
    createdAt:    null,
    updatedAt:    null,
  }),
});

const DEFAULT_SYSTEM_MAP = Object.freeze({
  version:      '1.0.0',
  generatedAt:  null,
  compartments: [],
  hooks:        [],
  events:       [],
  files:        [],
  axioms:       [],
  runtimes:     [],
  compilers:    [],
  plugins:      [],
  variables:    [],
  pipes:        [],
  // §BUGFIX 2026-09-06: archetypes/blueprintDefs/blueprintInstances/
  // playgrounds/vaultKeys/vaultdState are all read via
  // host.sysmap.get().<field> by archetype/index.js, blueprint/index.js,
  // plugin/host-api.js, playgrounds/index.js, vault/index.js, and
  // cli/commands/vaultd.js — none were ever added to this default shape,
  // so every one of those reads threw on `undefined.filter`/`.find`.
  // Added following the exact same array-field convention as `plugins`
  // above (vaultdState is a single object|null, not an array — COS-42:
  // "vaultd state is visible in SystemMap whether running or not").
  archetypes:         [],
  blueprintDefs:      [],
  blueprintInstances: [],
  playgrounds:        [],
  vaultKeys:          [],
  vaultdState:        null,
});

const DEFAULT_PIPE = Object.freeze({
  id:        null,
  name:      '',
  sourceId:  null,
  targetId:  null,
  hookId:    null,
  transform: null,
  filter:    null,
  state:     'active',
  createdAt: null,
  eventLog:  true,
});

const DEFAULT_SERVICE_CONFIG = Object.freeze({
  snapshotPath:    '',
  masterRingCap:   10_000_000,
  apiPort:         3748,
  ssePort:         3749,
  metricsInterval: 5000,
  logLevel:        'info',
  autoStart:       true,
});

// ─── Factory Functions ────────────────────────────────────────────────────────
// Produce new instances with defaults merged in. Spec §3.

/**
 * Create a new Compartment object.
 * @param {Partial<typeof DEFAULT_COMPARTMENT>} overrides
 * @returns {object}
 */
function makeCompartment(overrides = {}) {
  return Object.assign({}, DEFAULT_COMPARTMENT, overrides, {
    network:  Object.assign({}, DEFAULT_NETWORK_CONFIG,  overrides.network  ?? {}),
    fs:       Object.assign({}, DEFAULT_FS_CONFIG,       overrides.fs       ?? {}),
    compiler: Object.assign({}, DEFAULT_COMPILER_CONFIG, overrides.compiler ?? {}),
    watchdog: Object.assign({}, DEFAULT_WATCHDOG_CONFIG, overrides.watchdog ?? {}),
    hooks:    [...(overrides.hooks ?? [])],
    tags:     [...(overrides.tags  ?? [])],
  });
}

/**
 * Create a new Hook object.
 * @param {Partial<typeof DEFAULT_HOOK>} overrides
 * @returns {object}
 */
function makeHook(overrides = {}) {
  return Object.assign({}, DEFAULT_HOOK, overrides, {
    contract: Object.assign({}, DEFAULT_HOOK.contract, overrides.contract ?? {}),
    bindings: Object.assign({}, DEFAULT_HOOK.bindings, overrides.bindings ?? {}),
    meta:     Object.assign({}, DEFAULT_HOOK.meta,     overrides.meta     ?? {}),
  });
}

/**
 * Create a new SystemMap object.
 * @param {Partial<typeof DEFAULT_SYSTEM_MAP>} overrides
 * @returns {object}
 */
function makeSystemMap(overrides = {}) {
  return Object.assign({}, DEFAULT_SYSTEM_MAP, overrides, {
    generatedAt:  overrides.generatedAt ?? Date.now(),
    compartments: [...(overrides.compartments ?? [])],
    hooks:        [...(overrides.hooks        ?? [])],
    events:       [...(overrides.events       ?? [])],
    files:        [...(overrides.files        ?? [])],
    axioms:       [...(overrides.axioms       ?? [])],
    runtimes:     [...(overrides.runtimes     ?? [])],
    compilers:    [...(overrides.compilers    ?? [])],
    plugins:      [...(overrides.plugins      ?? [])],
    variables:    [...(overrides.variables    ?? [])],
    pipes:        [...(overrides.pipes        ?? [])],
    archetypes:         [...(overrides.archetypes         ?? [])],
    blueprintDefs:      [...(overrides.blueprintDefs      ?? [])],
    blueprintInstances: [...(overrides.blueprintInstances ?? [])],
    playgrounds:        [...(overrides.playgrounds        ?? [])],
    vaultKeys:          [...(overrides.vaultKeys          ?? [])],
    vaultdState:        overrides.vaultdState ?? null,
  });
}

/**
 * Create a new Pipe object.
 * @param {Partial<typeof DEFAULT_PIPE>} overrides
 * @returns {object}
 */
function makePipe(overrides = {}) {
  return Object.assign({}, DEFAULT_PIPE, overrides);
}

/**
 * Create a new ServiceConfig object.
 * @param {Partial<typeof DEFAULT_SERVICE_CONFIG>} overrides
 * @returns {object}
 */
function makeServiceConfig(overrides = {}) {
  return Object.assign({}, DEFAULT_SERVICE_CONFIG, overrides);
}

// ─── Compartment State Machine ────────────────────────────────────────────────
// Valid states and transitions. Used by schema-engine to enforce COS-1.

const COMPARTMENT_STATES = Object.freeze([
  'created', 'running', 'stopped', 'error', 'snapshotted',
]);

const COMPARTMENT_TRANSITIONS = Object.freeze({
  created:     ['running', 'error', 'snapshotted'],
  running:     ['stopped', 'error', 'snapshotted'],
  stopped:     ['running', 'snapshotted'],
  error:       ['running', 'stopped', 'snapshotted'],
  snapshotted: ['running', 'stopped'],
});

// §MCO04 2026-09-18 — the real work-phase state machine, same shape and
// convention as COMPARTMENT_STATES/TRANSITIONS above. Forward-only —
// there is no legal transition back to a prior phase; a compartment
// that needs to redo exploration is a new run, not a phase regression.
const WORK_PHASES = Object.freeze(['EXPLORING', 'ACTING', 'VERIFYING']);

const WORK_PHASE_TRANSITIONS = Object.freeze({
  null:      ['EXPLORING'],
  EXPLORING: ['ACTING'],
  ACTING:    ['VERIFYING'],
  VERIFYING: [],
});

function isValidWorkPhaseTransition(from, to) {
  const key = from === null || from === undefined ? 'null' : from;
  const allowed = WORK_PHASE_TRANSITIONS[key];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * Returns true if the transition from `from` to `to` is valid.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isValidTransition(from, to) {
  const allowed = COMPARTMENT_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

module.exports = {
  // Defaults (read-only references — do not mutate)
  DEFAULT_NETWORK_CONFIG,
  DEFAULT_FS_CONFIG,
  DEFAULT_COMPILER_CONFIG,
  DEFAULT_WATCHDOG_CONFIG,
  DEFAULT_COMPARTMENT,
  DEFAULT_HOOK,
  DEFAULT_SYSTEM_MAP,
  DEFAULT_PIPE,
  DEFAULT_SERVICE_CONFIG,

  // Factories
  makeCompartment,
  makeHook,
  makeSystemMap,
  makePipe,
  makeServiceConfig,

  // State machine
  COMPARTMENT_STATES,
  COMPARTMENT_TRANSITIONS,
  isValidTransition,

  // Work-phase state machine (§MCO04)
  WORK_PHASES,
  WORK_PHASE_TRANSITIONS,
  isValidWorkPhaseTransition,
};
