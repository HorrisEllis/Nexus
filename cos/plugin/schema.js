/**
 * plugin/schema.js
 * COMPARTMENT OS — Plugin Manifest Validator (spec §62.1)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * validateManifest(manifest) — throws PluginSchemaError if invalid.
 * Mirrors archetype/schema.js and blueprint/schema.js. Enforces COS-39
 * (plugin manifests are validated against the JSON Schema before any
 * code runs) at the earliest possible point — before installer.js even
 * looks at entryPoint.
 */

'use strict';

const { isUUID, isSemver, isKebab } = require('../foundation/hook-schema.js');
const { PLUGIN_TYPE } = require('../foundation/enums.js');

class PluginSchemaError extends Error {
  constructor(field, message, manifest = null) {
    super(`PluginSchema: ${field} — ${message}`);
    this.name     = 'PluginSchemaError';
    this.field    = field;
    this.manifest = manifest;
  }
}

// ─── Sub-validators ────────────────────────────────────────────────────────────

function validatePermissions(perms, manifest) {
  if (!perms || typeof perms !== 'object') {
    throw new PluginSchemaError('permissions', 'must be an object', manifest);
  }
  const required = ['hostFs', 'network', 'spawnProcess', 'adminRequired'];
  for (const field of required) {
    if (typeof perms[field] !== 'boolean') {
      throw new PluginSchemaError(`permissions.${field}`, 'is required and must be a boolean', manifest);
    }
  }
  for (const optional of ['readSystemMap', 'writeCompartment', 'readVaultKeys']) {
    if (optional in perms && typeof perms[optional] !== 'boolean') {
      throw new PluginSchemaError(`permissions.${optional}`, 'must be a boolean if present', manifest);
    }
  }
}

function validateContributes(contributes, manifest) {
  if (contributes === undefined) return; // contributes is optional — a plugin can contribute nothing yet
  if (typeof contributes !== 'object' || contributes === null) {
    throw new PluginSchemaError('contributes', 'must be an object', manifest);
  }
  const arrayFields = [
    'runtimes', 'compilers', 'archetypes', 'blueprints', 'uiComponents',
    'cliCommands', 'watchdogRules', 'pipeTransforms', 'themes', 'hooks',
  ];
  for (const field of arrayFields) {
    if (field in contributes && !Array.isArray(contributes[field])) {
      throw new PluginSchemaError(`contributes.${field}`, 'must be an array', manifest);
    }
  }
  for (const cmd of contributes.cliCommands || []) {
    if (typeof cmd.name !== 'string' || typeof cmd.description !== 'string' || typeof cmd.handler !== 'string') {
      throw new PluginSchemaError('contributes.cliCommands[]', 'each entry needs { name, description, handler }', manifest);
    }
  }
  for (const rule of contributes.watchdogRules || []) {
    if (typeof rule.id !== 'string' || typeof rule.name !== 'string' || typeof rule.triggerCondition !== 'string' || typeof rule.defaultAction !== 'string') {
      throw new PluginSchemaError('contributes.watchdogRules[]', 'each entry needs { id, name, triggerCondition, defaultAction }', manifest);
    }
  }
  for (const theme of contributes.themes || []) {
    if (typeof theme.id !== 'string' || typeof theme.name !== 'string' || typeof theme.cssPath !== 'string') {
      throw new PluginSchemaError('contributes.themes[]', 'each entry needs { id, name, cssPath }', manifest);
    }
  }
}

// ─── validateManifest ──────────────────────────────────────────────────────────

/**
 * Validates a Plugin Manifest object against spec §62.1.
 * @param {object} manifest
 * @returns {object} the validated manifest
 */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new PluginSchemaError('manifest', 'must be an object');
  }
  if (!isUUID(manifest.id)) {
    throw new PluginSchemaError('id', `must be a valid UUID v4, got: ${JSON.stringify(manifest.id)}`, manifest);
  }
  if (!isKebab(manifest.name)) {
    throw new PluginSchemaError('name', `must be kebab-case, got: ${JSON.stringify(manifest.name)}`, manifest);
  }
  if (!isSemver(manifest.version)) {
    throw new PluginSchemaError('version', `must be semver, got: ${JSON.stringify(manifest.version)}`, manifest);
  }
  for (const field of ['displayName', 'description', 'author', 'cosVersion', 'entryPoint']) {
    if (typeof manifest[field] !== 'string' || manifest[field].length < 1) {
      throw new PluginSchemaError(field, 'must be a non-empty string', manifest);
    }
  }

  validateContributes(manifest.contributes, manifest);
  validatePermissions(manifest.permissions, manifest);

  if ('uiBundlePath' in manifest && manifest.uiBundlePath !== null && typeof manifest.uiBundlePath !== 'string') {
    throw new PluginSchemaError('uiBundlePath', 'must be null or a string', manifest);
  }
  if ('nativeModule' in manifest && manifest.nativeModule !== null && typeof manifest.nativeModule !== 'string') {
    throw new PluginSchemaError('nativeModule', 'must be null or a string', manifest);
  }

  return manifest;
}

/**
 * Checks a manifest's declared cosVersion range (e.g. ">=1.0.0") against
 * the running COS_VERSION. Only supports the simple ">=x.y.z" form spec
 * actually uses everywhere (§62.2/62.3 manifests are all ">=1.x.x") —
 * flagged: not a full semver range parser, intentionally minimal.
 * @param {string} requiredRange
 * @param {string} runningVersion
 * @returns {boolean}
 */
function isCompatibleVersion(requiredRange, runningVersion) {
  const m = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(requiredRange.trim());
  if (!m) return true; // unrecognized range form — don't block on something we can't parse
  const [reqMaj, reqMin, reqPatch] = m.slice(1).map(Number);
  const runM = /^(\d+)\.(\d+)\.(\d+)$/.exec(runningVersion.trim());
  if (!runM) return true;
  const [runMaj, runMin, runPatch] = runM.slice(1).map(Number);
  if (runMaj !== reqMaj) return runMaj > reqMaj;
  if (runMin !== reqMin) return runMin > reqMin;
  return runPatch >= reqPatch;
}

module.exports = {
  PluginSchemaError,
  validateManifest,
  isCompatibleVersion,
  PLUGIN_TYPE,
};
