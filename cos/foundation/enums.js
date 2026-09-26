/**
 * foundation/enums.js
 * COMPARTMENT OS — Foundation Enums (spec §59.1)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * RuntimeID lives in runtime-enum.js, CompilerID in compiler-enum.js,
 * CompartmentState lives in types.js next to COMPARTMENT_TRANSITIONS —
 * those three predate this file and keep their existing homes.
 * Every other enum named in spec §59.1 is declared here, frozen,
 * one array + one Set per enum for O(1) membership checks.
 *
 * These are type-level value sets. Phases that haven't been built yet
 * (Conductor, Vault, TPM, vaultd, Playground ext., Torture Chamber) still
 * get their enum declared here — COS-48: a subsystem being absent means
 * its SystemMap field is empty/null, never that its type is undefined.
 */

'use strict';

function frozenEnum(values) {
  const arr = Object.freeze([...values]);
  const set = Object.freeze(new Set(arr));
  return { values: arr, has: (v) => set.has(v) };
}

// ─── GovernorPolicy ────────────────────────────────────────────────────────────
const GOVERNOR_POLICY = frozenEnum(['fair', 'priority', 'reserved', 'burst', 'background']);

// ─── IsolationLevel (numeric — 0..4) ──────────────────────────────────────────
const ISOLATION_LEVEL = frozenEnum([0, 1, 2, 3, 4]);

// ─── CpuPriority ───────────────────────────────────────────────────────────────
const CPU_PRIORITY = frozenEnum(['realtime', 'high', 'normal', 'low', 'background']);

// ─── IoThrottle ────────────────────────────────────────────────────────────────
const IO_THROTTLE = frozenEnum(['none', 'light', 'medium', 'strict']);

// ─── FsPolicy ──────────────────────────────────────────────────────────────────
const FS_POLICY = frozenEnum(['log', 'block', 'allow']);

// ─── NetPolicy ─────────────────────────────────────────────────────────────────
const NET_POLICY = frozenEnum(['log', 'block', 'allow']);

// ─── OnAnomaly ─────────────────────────────────────────────────────────────────
const ON_ANOMALY = frozenEnum(['snapshot', 'snapshot+restart', 'snapshot+stop', 'log-only']);

// ─── PluginType ────────────────────────────────────────────────────────────────
const PLUGIN_TYPE = frozenEnum([
  'runtime', 'compiler', 'archetype', 'blueprint', 'ui',
  'cli', 'watchdog-rule', 'transform', 'theme', 'meta',
]);

// ─── PluginState ───────────────────────────────────────────────────────────────
const PLUGIN_STATE = frozenEnum(['installing', 'active', 'disabled', 'error', 'sandboxed']);

// ─── ArchetypeDetectionConfidence ─────────────────────────────────────────────
const ARCHETYPE_DETECTION_CONFIDENCE = frozenEnum(['auto', 'suggested', 'manual', 'forced']);

// ─── VaultScope ────────────────────────────────────────────────────────────────
const VAULT_SCOPE = frozenEnum(['compartment', 'shared', 'blueprint', 'global']);

// ─── TpmState ──────────────────────────────────────────────────────────────────
const TPM_STATE = frozenEnum(['not-present', 'present-unused', 'initializing', 'active', 'error']);

// ─── PlaygroundMode ────────────────────────────────────────────────────────────
const PLAYGROUND_MODE = frozenEnum(['isolated', 'mirrored', 'synthetic']);

// ─── TortureTestType ───────────────────────────────────────────────────────────
const TORTURE_TEST_TYPE = frozenEnum([
  'memory-flood', 'cpu-spike', 'io-storm', 'network-chaos', 'crash-injection',
  'hang-injection', 'fs-bomb', 'event-flood', 'pipe-storm',
  'resource-starvation', 'watchdog-stress', 'snapshot-flood', 'custom',
]);

module.exports = Object.freeze({
  GOVERNOR_POLICY,
  ISOLATION_LEVEL,
  CPU_PRIORITY,
  IO_THROTTLE,
  FS_POLICY,
  NET_POLICY,
  ON_ANOMALY,
  PLUGIN_TYPE,
  PLUGIN_STATE,
  ARCHETYPE_DETECTION_CONFIDENCE,
  VAULT_SCOPE,
  TPM_STATE,
  PLAYGROUND_MODE,
  TORTURE_TEST_TYPE,
});
