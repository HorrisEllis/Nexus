/**
 * foundation/event-contracts.js
 * COMPARTMENT OS — Kernel Event Type Registry
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Every kernel event string used by the system is declared here.
 * Pattern: "{layer}:{noun}:{verb}" — all lowercase kebab.
 * Spec §24 (hook map) + §20 (Nexus events) + §21 (watchdog) are the source.
 */

'use strict';

// ─── Host Events ──────────────────────────────────────────────────────────────

const HOST = Object.freeze({
  // Compartment lifecycle
  COMPARTMENT_CREATED:   'host:compartment:created',
  COMPARTMENT_STARTED:   'host:compartment:started',
  COMPARTMENT_STOPPED:   'host:compartment:stopped',
  COMPARTMENT_DESTROYED: 'host:compartment:destroyed',
  COMPARTMENT_ERROR:     'host:compartment:error',
  COMPARTMENT_STATUS:    'host:compartment:status',
  // §MCO04 2026-09-18 — real work-phase advance, same event-naming
  // convention as the lifecycle events above.
  COMPARTMENT_WORK_PHASE_ADVANCED: 'host:compartment:work-phase-advanced',
  // §2026-10-07 — a compartment's intent (foundation/intent.js): set, and verified against its end state
  COMPARTMENT_INTENT_SET: 'host:compartment:intent-set',
  COMPARTMENT_VERIFIED:   'host:compartment:verified',
  COMPARTMENTS_LISTED:   'host:compartments:listed',

  // Snapshots
  SNAPSHOT_TAKEN:        'host:snapshot:taken',
  SNAPSHOT_RESTORED:     'host:snapshot:restored',
  SNAPSHOT_MANUAL:       'host:snapshot:manual',

  // System map
  MAP_RENDERED:          'host:map:rendered',
  MAP_EXPORTED:          'host:map:exported',
  MAP_WATCHING:          'host:map:watching',
  MAP_UPDATED:           'host:map:updated',

  // Files
  FILE_UPLOADED:         'host:file:uploaded',
  UI_SWAPPED:            'host:ui:swapped',

  // Hooks
  HOOKS_LISTED:          'host:hooks:listed',
  HOOK_SHOWN:            'host:hook:shown',
  HOOK_FIRED:            'host:hook:fired',

  // Commands
  COMMAND_RUN:           'host:command:run',

  // Events stream
  EVENTS_STREAMING:      'host:events:streaming',

  // Plugins
  PLUGINS_LISTED:        'host:plugins:listed',
  PLUGIN_ADDED:          'host:plugin:added',

  // Schema
  SCHEMA_VALIDATED:      'host:schema:validated',
  VERSION_SHOWN:         'host:version:shown',

  // System
  SYSTEM_SHUTDOWN:       'host:system:shutdown',
  NEXUS_THRESHOLD:       'host:nexus:threshold',
});

// ─── Compartment Events ───────────────────────────────────────────────────────

const COMP = Object.freeze({
  PROCESS_STARTED:       'comp:process:started',
  PROCESS_STOPPED:       'comp:process:stopped',
  PROCESS_EXITED:        'comp:process:exited',
  PROCESS_STDOUT:        'comp:process:stdout',
  PROCESS_STDERR:        'comp:process:stderr',
  PROCESS_ERROR:         'comp:process:error',
  PROCESS_CRASHED:       'comp:process:crashed',
  SPAWN_FAILED:          'comp:spawn:failed',
  COMPILER_STARTED:      'comp:compiler:started',
  BUILD_COMPLETED:       'comp:build:completed',
  TESTS_RUNNING:         'comp:tests:running',
  FS_LISTED:             'comp:fs:listed',
  FS_TREE:               'comp:fs:tree',
  FILE_WRITTEN:          'comp:file:written',
  UI_SWAPPED:            'comp:ui:swapped',
  SNAPSHOT_TAKEN:        'comp:snapshot:taken',
  COMMAND_RUN:           'comp:command:run',
  STATE_CHANGED:         'comp:state:changed',
});

// ─── Watchdog Events ──────────────────────────────────────────────────────────

const WATCHDOG = Object.freeze({
  PROCESS_STALLED:      'watchdog:process:stalled',
  PROCESS_CRASH_LOOP:   'watchdog:process:crash-loop',
  MEMORY_EXCEEDED:      'watchdog:memory:exceeded',
  CPU_EXCEEDED:         'watchdog:cpu:exceeded',
  FS_UNAUTHORIZED:      'watchdog:fs:unauthorized-write',
  NET_VIOLATION:        'watchdog:net:policy-violation',
  ANOMALY_DETECTED:     'watchdog:anomaly:detected',
  STATUS_SHOWN:         'watchdog:status:shown',
  ENABLED:              'watchdog:enabled',
  DISABLED:             'watchdog:disabled',
  CONFIG_UPDATED:       'watchdog:config:updated',
  LOG_SHOWN:            'watchdog:log:shown',
});

// ─── Replay Events ────────────────────────────────────────────────────────────

const REPLAY = Object.freeze({
  MODE_ENTERED:         'replay:mode:entered',
  PLAYING:              'replay:playing',
  PAUSED:               'replay:paused',
  REWINDING:            'replay:rewinding',
  FORWARDING:           'replay:forwarding',
  SEEKED:               'replay:seeked',
  DIFFED:               'replay:diffed',
  MODE_EXITED:          'replay:mode:exited',
});

// ─── Pipe Events ──────────────────────────────────────────────────────────────

const PIPE = Object.freeze({
  CREATED:              'pipe:created',
  LISTED:               'pipe:listed',
  SHOWN:                'pipe:shown',
  PAUSED:               'pipe:paused',
  RESUMED:              'pipe:resumed',
  SEVERED:              'pipe:severed',
  TESTED:               'pipe:tested',
  LOG_SHOWN:            'pipe:log:shown',
  MESSAGE_SENT:         'pipe:message:sent',
  MESSAGE_RECEIVED:     'pipe:message:received',
  MESSAGE_REJECTED:     'pipe:message:rejected',
});

// ─── Git Events ───────────────────────────────────────────────────────────────

const GIT = Object.freeze({
  STATUS_SHOWN:         'git:status:shown',
  COMMIT_CREATED:       'git:commit:created',
  PUSH_COMPLETED:       'git:push:completed',
  LOG_SHOWN:            'git:log:shown',
  DIFF_SHOWN:           'git:diff:shown',
  BRANCH_SWITCHED:      'git:branch:switched',
});

// ─── SSH Events ───────────────────────────────────────────────────────────────

const SSH = Object.freeze({
  SESSION_OPENED:       'ssh:session:opened',
  TUNNEL_ADDED:         'ssh:tunnel:added',
  TUNNELS_LISTED:       'ssh:tunnels:listed',
  KEY_GENERATED:        'ssh:key:generated',
});

// ─── Version Events ───────────────────────────────────────────────────────────

const VERSION = Object.freeze({
  BUMPED:               'version:bumped',
  LOG_SHOWN:            'version:log:shown',
  DIFFED:               'version:diffed',
  RESTORED:             'version:restored',
});

// ─── Nexus / Kernel Events ────────────────────────────────────────────────────

const NEXUS = Object.freeze({
  BOTTLENECK_DETECTED:  'nexus:bottleneck:detected',
  SNAPSHOT_WRITTEN:     'nexus:snapshot:written',
  WAL_FLUSHED:          'nexus:wal:flushed',
});

// ─── Network Events ───────────────────────────────────────────────────────────

const NETWORK = Object.freeze({
  REQUEST_SENT:         'network:request:sent',
  RESPONSE_RECEIVED:    'network:response:received',
});

// ─── CLI Events ───────────────────────────────────────────────────────────────

const CLI = Object.freeze({
  COMMAND_RESOLVED:     'cli:command:resolved',
  COMMAND_FAILED:       'cli:command:failed',
});

// ─── Service Events ───────────────────────────────────────────────────────────

const SERVICE = Object.freeze({
  INSTALLED:            'service:installed',
  UNINSTALLED:          'service:uninstalled',
  STARTED:              'service:started',
  STOPPED:              'service:stopped',
  RESTARTED:            'service:restarted',
  STATUS_SHOWN:         'service:status:shown',
});


// ─── Playground Events ────────────────────────────────────────────────────────

const PLAYGROUND = Object.freeze({
  BRANCH_FORKED:        'playground:branch:forked',
  BRANCH_DESTROYED:     'playground:branch:destroyed',
  BRANCH_CHECKED_OUT:   'playground:branch:checked-out',
  SANDBOX_STARTED:      'comp:sandbox:started',
  SANDBOX_EXITED:       'comp:sandbox:exited',
  SANDBOX_TIMEOUT:      'comp:sandbox:timeout',
  SANDBOX_ERROR:        'comp:sandbox:error',
  SANDBOX_STDOUT:       'comp:sandbox:stdout',
  SANDBOX_STDERR:       'comp:sandbox:stderr',
  SANDBOX_OUTPUT_LIMIT: 'comp:sandbox:output-limit',
  COMPARE_STARTED:      'comp:compare:started',
  COMPARE_DONE:         'comp:compare:done',
});

// ─── Archetype Events ─────────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: cli/commands/archetype.js and host/gates/archetype.js
// have destructured ARCHETYPE from this file since before this checkout —
// same "referenced, never defined" failure class as VAULT/PLUGIN/VAULTD.

const ARCHETYPE = Object.freeze({
  LISTED:    'archetype:listed',
  SHOWN:     'archetype:shown',
  ASSIGNED:  'archetype:assigned',
  DETECTED:  'archetype:detected',
  CREATED:   'archetype:created',
  ERROR:     'archetype:error',
});

// ─── Blueprint Events ─────────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: same failure class — cli/commands/blueprint.js and
// host/gates/blueprint.js both need BLUEPRINT.

const BLUEPRINT = Object.freeze({
  LISTED:     'blueprint:listed',
  SHOWN:      'blueprint:shown',
  STATUS:     'blueprint:status',
  CREATED:    'blueprint:created',
  IMPORTED:   'blueprint:imported',
  DESTROYED:  'blueprint:destroyed',
  ERROR:      'blueprint:error',
});

// ─── Playgrounds Events ───────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: same failure class. Named PLAYGROUNDS (plural) —
// deliberately distinct from the existing PLAYGROUND (singular) namespace
// above, which covers branch/compare sandbox execution (comp:sandbox:*).
// This is the disposable-environment CLI feature (create/list/status/
// destroy/promote), a different subsystem that happens to share a name.

const PLAYGROUNDS = Object.freeze({
  LISTED:     'playgrounds:listed',
  SHOWN:      'playgrounds:shown',
  CREATED:    'playgrounds:created',
  PROMOTED:   'playgrounds:promoted',
  DESTROYED:  'playgrounds:destroyed',
  ERROR:      'playgrounds:error',
});

// ─── Vault Events ─────────────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: cli/commands/vault.js has destructured VAULT from this
// file since before this checkout — no VAULT namespace was ever defined
// here, so every host.bus.emit(VAULT.SET, ...) etc. threw on `undefined.SET`.
// Same failure class as the runtime-enum.js / constants.js bugfixes: vault.js
// itself already names every member it needs (grep -n "VAULT\." for the
// full list) — this just supplies the namespace object that was missing.

const VAULT = Object.freeze({
  SET:            'vault:secret:set',
  DELETED:        'vault:secret:deleted',
  REVEALED:       'vault:secret:revealed',
  ACCESSED:       'vault:secret:accessed',
  ACCESS_DENIED:  'vault:access:denied',
  LISTED:         'vault:secrets:listed',
  GRANT_ADDED:    'vault:grant:added',
  GRANT_REVOKED:  'vault:grant:revoked',
  AUDIT_SHOWN:    'vault:audit:shown',
  EXPORTED:       'vault:secrets:exported',
  IMPORTED:       'vault:secrets:imported',
  ERROR:          'vault:secret:error',
  // §BUGFIX 2026-10-02 (EV0, lib/event-contract-check.js): playgrounds/kernel.js has emitted VAULT.INJECTED — one per
  // secret injected into a starting compartment's env — since before this checkout, and the key never existed here, so
  // every one went out as `undefined`. Same failure class as the VAULT / PLUGIN fixes below. James accepted the key.
  INJECTED:       'vault:secret:injected',
});

// ─── Plugin Events ────────────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: cli/commands/plugin.js has destructured PLUGIN from
// this file since before this checkout, same failure class as VAULT above.
// Named 'plugin:*' (singular) deliberately, distinct from the existing
// HOST.PLUGINS_LISTED / HOST.PLUGIN_ADDED ('host:plugin(s):*') — those are
// host-level map/system events, these are plugin.js's own command-result
// events. Two-segment form to match the existing SERVICE namespace's style.

const PLUGIN = Object.freeze({
  LISTED:     'plugin:listed',
  SHOWN:      'plugin:shown',
  INSTALLED:  'plugin:installed',
  ENABLED:    'plugin:enabled',
  DISABLED:   'plugin:disabled',
  REMOVED:    'plugin:removed',
  ERROR:      'plugin:error',
});

// ─── Vault Daemon Events ──────────────────────────────────────────────────────
// §BUGFIX 2026-09-06: cli/commands/vaultd.js has destructured VAULTD from
// this file since before this checkout, same failure class as VAULT/PLUGIN
// above. Two-segment form to match SERVICE (vaultd.js manages the vault
// daemon process — same shape of concern as SERVICE's install/start/stop).

const VAULTD = Object.freeze({
  STARTED:    'vaultd:started',
  STOPPED:    'vaultd:stopped',
  STATUS:     'vaultd:status',
  BACKED_UP:  'vaultd:backed-up',
  RESTORED:   'vaultd:restored',
  ERROR:      'vaultd:error',
});

// ─── All Events (flat set for validation) ────────────────────────────────────

const ALL_EVENT_TYPES = Object.freeze(new Set([
  ...Object.values(HOST),
  ...Object.values(COMP),
  ...Object.values(WATCHDOG),
  ...Object.values(REPLAY),
  ...Object.values(PIPE),
  ...Object.values(GIT),
  ...Object.values(SSH),
  ...Object.values(VERSION),
  ...Object.values(NEXUS),
  ...Object.values(NETWORK),
  ...Object.values(CLI),
  ...Object.values(SERVICE),
  ...Object.values(PLAYGROUND),
  ...Object.values(VAULT),
  ...Object.values(PLUGIN),
  ...Object.values(VAULTD),
  ...Object.values(ARCHETYPE),
  ...Object.values(BLUEPRINT),
  ...Object.values(PLAYGROUNDS),
]));

/**
 * Returns true if the given string is a registered kernel event type.
 * @param {string} eventType
 * @returns {boolean}
 */
function isKnownEvent(eventType) {
  return ALL_EVENT_TYPES.has(eventType);
}

module.exports = {
  HOST, COMP, WATCHDOG, REPLAY, PIPE, GIT, SSH, VERSION,
  NEXUS, NETWORK, CLI, SERVICE, PLAYGROUND, VAULT, PLUGIN, VAULTD,
  ARCHETYPE, BLUEPRINT, PLAYGROUNDS,
  ALL_EVENT_TYPES,
  isKnownEvent,
};
