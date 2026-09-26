/**
 * archetype/schema.js
 * COMPARTMENT OS — Archetype Contract Validator
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * validateArchetype(archetype) — throws ArchetypeSchemaError if invalid.
 * Mirrors foundation/hook-schema.js exactly. Enforces COS-1 (nothing exists
 * until proven) at registry load time — every built-in archetype runs
 * through this before it's allowed into ARCHETYPES (registry.js).
 *
 * Validates against spec §60.1 (archetype/v1.json).
 */

'use strict';

const { isUUID, isSemver, isKebab } = require('../foundation/hook-schema.js');
const { isKnownRuntimeId } = require('../foundation/runtime-enum.js');
const enums = require('../foundation/enums.js');

// ─── ArchetypeSchemaError ──────────────────────────────────────────────────────

class ArchetypeSchemaError extends Error {
  constructor(field, message, archetype = null) {
    super(`ArchetypeSchema: ${field} — ${message}`);
    this.name      = 'ArchetypeSchemaError';
    this.field     = field;
    this.archetype = archetype;
  }
}

// ─── Sub-validators ────────────────────────────────────────────────────────────

function validateResourcePreset(preset, archetype) {
  if (!preset || typeof preset !== 'object') {
    throw new ArchetypeSchemaError('resources', 'must be an object', archetype);
  }
  const required = ['cpuLimitPercent', 'cpuPriority', 'ramLimitMB', 'ramReservedMB', 'governorPolicy', 'ioThrottle'];
  for (const field of required) {
    if (!(field in preset)) {
      throw new ArchetypeSchemaError(`resources.${field}`, 'is required', archetype);
    }
  }
  if (!enums.CPU_PRIORITY.has(preset.cpuPriority)) {
    throw new ArchetypeSchemaError('resources.cpuPriority', `invalid value: ${JSON.stringify(preset.cpuPriority)}`, archetype);
  }
  if (!enums.GOVERNOR_POLICY.has(preset.governorPolicy)) {
    throw new ArchetypeSchemaError('resources.governorPolicy', `invalid value: ${JSON.stringify(preset.governorPolicy)}`, archetype);
  }
  if (!enums.IO_THROTTLE.has(preset.ioThrottle)) {
    throw new ArchetypeSchemaError('resources.ioThrottle', `invalid value: ${JSON.stringify(preset.ioThrottle)}`, archetype);
  }
}

function validateWatchdogPreset(wd, archetype) {
  if (!wd || typeof wd !== 'object') {
    throw new ArchetypeSchemaError('watchdogPreset', 'must be an object', archetype);
  }
  const required = [
    'enabled', 'memoryLimitMB', 'cpuLimitPct', 'stallTimeoutMs',
    'crashLoopLimit', 'crashLoopWindowMs', 'fsPolicy', 'netPolicy', 'onAnomaly',
  ];
  for (const field of required) {
    if (!(field in wd)) {
      throw new ArchetypeSchemaError(`watchdogPreset.${field}`, 'is required', archetype);
    }
  }
  if (!enums.FS_POLICY.has(wd.fsPolicy)) {
    throw new ArchetypeSchemaError('watchdogPreset.fsPolicy', `invalid value: ${JSON.stringify(wd.fsPolicy)}`, archetype);
  }
  if (!enums.NET_POLICY.has(wd.netPolicy)) {
    throw new ArchetypeSchemaError('watchdogPreset.netPolicy', `invalid value: ${JSON.stringify(wd.netPolicy)}`, archetype);
  }
  if (!enums.ON_ANOMALY.has(wd.onAnomaly)) {
    throw new ArchetypeSchemaError('watchdogPreset.onAnomaly', `invalid value: ${JSON.stringify(wd.onAnomaly)}`, archetype);
  }
  if (wd.httpHealthCheck !== null && wd.httpHealthCheck !== undefined) {
    const hc = wd.httpHealthCheck;
    if (typeof hc.path !== 'string' || typeof hc.expectedStatus !== 'number' ||
        typeof hc.intervalMs !== 'number' || typeof hc.timeoutMs !== 'number' ||
        typeof hc.failThreshold !== 'number') {
      throw new ArchetypeSchemaError('watchdogPreset.httpHealthCheck', 'malformed WatchdogHttpCheck', archetype);
    }
  }
}

function validateNetworkPreset(net, archetype) {
  if (!net || typeof net !== 'object') {
    throw new ArchetypeSchemaError('networkPreset', 'must be an object', archetype);
  }
  if (typeof net.isolated !== 'boolean') {
    throw new ArchetypeSchemaError('networkPreset.isolated', 'must be a boolean', archetype);
  }
  if (!enums.ISOLATION_LEVEL.has(net.level)) {
    throw new ArchetypeSchemaError('networkPreset.level', `must be 0-4, got: ${JSON.stringify(net.level)}`, archetype);
  }
  if (typeof net.logAllTraffic !== 'boolean') {
    throw new ArchetypeSchemaError('networkPreset.logAllTraffic', 'must be a boolean', archetype);
  }
  if (!Array.isArray(net.allowedHosts) || !Array.isArray(net.deniedHosts)) {
    throw new ArchetypeSchemaError('networkPreset', 'allowedHosts/deniedHosts must be arrays', archetype);
  }
}

function validatePipeSignature(sig, archetype) {
  if (!sig || typeof sig !== 'object') {
    throw new ArchetypeSchemaError('pipeSignature', 'must be an object', archetype);
  }
  if (!Array.isArray(sig.exposes) || !Array.isArray(sig.consumes)) {
    throw new ArchetypeSchemaError('pipeSignature', 'exposes/consumes must be arrays', archetype);
  }
}

function validateFsTemplate(tpl, archetype) {
  if (!Array.isArray(tpl)) {
    throw new ArchetypeSchemaError('fsTemplate', 'must be an array', archetype);
  }
  for (const [i, file] of tpl.entries()) {
    if (typeof file.path !== 'string' || typeof file.content !== 'string' || typeof file.binary !== 'boolean') {
      throw new ArchetypeSchemaError(`fsTemplate[${i}]`, 'must have { path: string, content: string, binary: boolean }', archetype);
    }
  }
}

// ─── validateArchetype ─────────────────────────────────────────────────────────

/**
 * Validates an Archetype object against the COS archetype schema (§60.1).
 * Throws ArchetypeSchemaError on failure. Returns the archetype unchanged if valid.
 *
 * @param {object} archetype
 * @returns {object} the validated archetype
 */
function validateArchetype(archetype) {
  if (!archetype || typeof archetype !== 'object') {
    throw new ArchetypeSchemaError('archetype', 'must be an object');
  }

  if (!isUUID(archetype.id)) {
    throw new ArchetypeSchemaError('id', `must be a valid UUID v4, got: ${JSON.stringify(archetype.id)}`, archetype);
  }
  if (!isKebab(archetype.name)) {
    throw new ArchetypeSchemaError('name', `must be kebab-case, got: ${JSON.stringify(archetype.name)}`, archetype);
  }
  if (!isSemver(archetype.version)) {
    throw new ArchetypeSchemaError('version', `must be semver (x.y.z), got: ${JSON.stringify(archetype.version)}`, archetype);
  }
  if (typeof archetype.displayName !== 'string' || archetype.displayName.length < 1) {
    throw new ArchetypeSchemaError('displayName', 'must be a non-empty string', archetype);
  }
  if (typeof archetype.description !== 'string' || archetype.description.length < 1) {
    throw new ArchetypeSchemaError('description', 'must be a non-empty string', archetype);
  }
  if (!isKnownRuntimeId(archetype.runtimeId)) {
    throw new ArchetypeSchemaError('runtimeId', `unknown RuntimeID: ${JSON.stringify(archetype.runtimeId)}`, archetype);
  }
  if (!Array.isArray(archetype.runtimeOptions) || !archetype.runtimeOptions.every(isKnownRuntimeId)) {
    throw new ArchetypeSchemaError('runtimeOptions', 'must be an array of known RuntimeID values', archetype);
  }

  validateResourcePreset(archetype.resources, archetype);
  validateWatchdogPreset(archetype.watchdogPreset, archetype);
  validateNetworkPreset(archetype.networkPreset, archetype);
  validatePipeSignature(archetype.pipeSignature, archetype);
  validateFsTemplate(archetype.fsTemplate, archetype);

  if (!Array.isArray(archetype.detectionHints)) {
    throw new ArchetypeSchemaError('detectionHints', 'must be an array', archetype);
  }
  if (!Array.isArray(archetype.tags)) {
    throw new ArchetypeSchemaError('tags', 'must be an array', archetype);
  }
  if (typeof archetype.builtIn !== 'boolean') {
    throw new ArchetypeSchemaError('builtIn', 'must be a boolean', archetype);
  }
  if (archetype.pluginId !== null && !isUUID(archetype.pluginId)) {
    throw new ArchetypeSchemaError('pluginId', 'must be null or a valid UUID v4', archetype);
  }

  return archetype;
}

module.exports = {
  ArchetypeSchemaError,
  validateArchetype,
};
