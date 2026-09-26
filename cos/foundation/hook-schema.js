/**
 * foundation/hook-schema.js
 * COMPARTMENT OS — Hook Contract Validator
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * validateHook(hook) — throws HookSchemaError if invalid.
 * Used by schema-engine at registration time.
 * Enforces COS-1 (nothing exists until proven) and COS-3 (every hook has UUID + contract + version).
 */

'use strict';

const { CosAxiomError } = require('./axioms.js');

// ─── HookSchemaError ──────────────────────────────────────────────────────────

class HookSchemaError extends Error {
  constructor(field, message, hook = null) {
    super(`HookSchema: ${field} — ${message}`);
    this.name  = 'HookSchemaError';
    this.field = field;
    this.hook  = hook;
  }
}

// ─── UUID v4 pattern ─────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} val
 * @returns {boolean}
 */
function isUUID(val) {
  return typeof val === 'string' && UUID_RE.test(val);
}

// ─── Semver pattern (simple: major.minor.patch) ───────────────────────────────
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * @param {string} val
 * @returns {boolean}
 */
function isSemver(val) {
  return typeof val === 'string' && SEMVER_RE.test(val);
}

// ─── EventType pattern: "{layer}:{noun}:{verb}" ───────────────────────────────
const EVENT_TYPE_RE = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/**
 * @param {string} val
 * @returns {boolean}
 */
function isEventType(val) {
  return typeof val === 'string' && EVENT_TYPE_RE.test(val);
}

// ─── Kebab-case pattern ───────────────────────────────────────────────────────
const KEBAB_RE = /^[a-z][a-z0-9-]*$/;

/**
 * @param {string} val
 * @returns {boolean}
 */
function isKebab(val) {
  return typeof val === 'string' && KEBAB_RE.test(val);
}

// ─── validateHook ─────────────────────────────────────────────────────────────

/**
 * Validates a Hook object against the COS hook schema.
 * Throws HookSchemaError (or CosAxiomError for axiom violations) on failure.
 * Returns the hook unchanged if valid.
 *
 * @param {object} hook
 * @returns {object} the validated hook
 */
function validateHook(hook) {
  if (!hook || typeof hook !== 'object') {
    throw new HookSchemaError('hook', 'must be an object');
  }

  // COS-3: Every hook has UUID + contract + version
  if (!isUUID(hook.id)) {
    throw new HookSchemaError('id', `must be a valid UUID v4, got: ${JSON.stringify(hook.id)}`, hook);
  }
  if (!isKebab(hook.name)) {
    throw new HookSchemaError('name', `must be kebab-case, got: ${JSON.stringify(hook.name)}`, hook);
  }
  if (!isSemver(hook.version)) {
    throw new HookSchemaError('version', `must be semver (x.y.z), got: ${JSON.stringify(hook.version)}`, hook);
  }

  // compartmentId: UUID or 'host'
  if (hook.compartmentId !== 'host' && !isUUID(hook.compartmentId)) {
    throw new HookSchemaError('compartmentId',
      `must be 'host' or a valid UUID v4, got: ${JSON.stringify(hook.compartmentId)}`, hook);
  }

  // contract
  if (!hook.contract || typeof hook.contract !== 'object') {
    throw new HookSchemaError('contract', 'must be an object', hook);
  }
  if (!Array.isArray(hook.contract.inputs)) {
    throw new HookSchemaError('contract.inputs', 'must be an array', hook);
  }
  if (!Array.isArray(hook.contract.outputs)) {
    throw new HookSchemaError('contract.outputs', 'must be an array', hook);
  }
  if (!Array.isArray(hook.contract.sideEffects)) {
    throw new HookSchemaError('contract.sideEffects', 'must be an array', hook);
  }
  if (!Array.isArray(hook.contract.axioms)) {
    throw new HookSchemaError('contract.axioms', 'must be an array', hook);
  }

  // bindings
  if (!hook.bindings || typeof hook.bindings !== 'object') {
    throw new HookSchemaError('bindings', 'must be an object', hook);
  }
  if (!isEventType(hook.bindings.event)) {
    throw new HookSchemaError('bindings.event',
      `must match pattern {layer}:{noun}:{verb}, got: ${JSON.stringify(hook.bindings.event)}`, hook);
  }

  // meta
  if (!hook.meta || typeof hook.meta !== 'object') {
    throw new HookSchemaError('meta', 'must be an object', hook);
  }
  if (typeof hook.meta.description !== 'string') {
    throw new HookSchemaError('meta.description', 'must be a string', hook);
  }
  if (typeof hook.meta.autoDetected !== 'boolean') {
    throw new HookSchemaError('meta.autoDetected', 'must be a boolean', hook);
  }
  if (typeof hook.meta.createdAt !== 'number') {
    throw new HookSchemaError('meta.createdAt', 'must be a number (epoch ms)', hook);
  }

  return hook;
}

/**
 * Validates an EventType string.
 * @param {string} eventType
 * @returns {string} the validated event type
 */
function validateEventType(eventType) {
  if (!isEventType(eventType)) {
    throw new HookSchemaError('eventType',
      `must match pattern {layer}:{noun}:{verb}, got: ${JSON.stringify(eventType)}`);
  }
  return eventType;
}

module.exports = {
  HookSchemaError,
  validateHook,
  validateEventType,
  isUUID,
  isSemver,
  isEventType,
  isKebab,
};
