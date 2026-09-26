/**
 * blueprint/schema.js
 * COMPARTMENT OS — Blueprint Contract Validator
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * validateBlueprint(blueprint) — throws BlueprintSchemaError if invalid.
 * Mirrors archetype/schema.js exactly. Validates against spec §61.1
 * (blueprint/v1.json). Cross-references archetype/registry.js to confirm
 * every node.archetypeId actually resolves — a blueprint pointing at a
 * nonexistent archetype is not "nothing exists until proven," it's
 * exactly the opposite.
 */

'use strict';

const { isUUID, isSemver, isKebab } = require('../foundation/hook-schema.js');

// ─── BlueprintSchemaError ──────────────────────────────────────────────────────

class BlueprintSchemaError extends Error {
  constructor(field, message, blueprint = null) {
    super(`BlueprintSchema: ${field} — ${message}`);
    this.name      = 'BlueprintSchemaError';
    this.field     = field;
    this.blueprint = blueprint;
  }
}

// ─── Sub-validators ────────────────────────────────────────────────────────────

function validateNode(node, i, blueprint) {
  if (!node || typeof node !== 'object') {
    throw new BlueprintSchemaError(`nodes[${i}]`, 'must be an object', blueprint);
  }
  if (!isKebab(node.role)) {
    throw new BlueprintSchemaError(`nodes[${i}].role`, `must be kebab-case, got: ${JSON.stringify(node.role)}`, blueprint);
  }
  if (typeof node.archetypeId !== 'string' || node.archetypeId.length === 0) {
    throw new BlueprintSchemaError(`nodes[${i}].archetypeId`, 'is required', blueprint);
  }
  if (typeof node.nameTemplate !== 'string' || node.nameTemplate.length === 0) {
    throw new BlueprintSchemaError(`nodes[${i}].nameTemplate`, 'is required', blueprint);
  }
  if (node.scalable !== undefined && typeof node.scalable !== 'boolean') {
    throw new BlueprintSchemaError(`nodes[${i}].scalable`, 'must be a boolean', blueprint);
  }
  const minI = node.minInstances ?? 1;
  const maxI = node.maxInstances ?? 1;
  if (typeof minI !== 'number' || minI < 1) {
    throw new BlueprintSchemaError(`nodes[${i}].minInstances`, 'must be an integer >= 1', blueprint);
  }
  if (typeof maxI !== 'number' || maxI < minI) {
    throw new BlueprintSchemaError(`nodes[${i}].maxInstances`, 'must be >= minInstances', blueprint);
  }
}

function validatePipe(pipe, i, blueprint, roleNames) {
  if (!pipe || typeof pipe !== 'object') {
    throw new BlueprintSchemaError(`pipes[${i}]`, 'must be an object', blueprint);
  }
  if (!roleNames.has(pipe.from)) {
    throw new BlueprintSchemaError(`pipes[${i}].from`, `references unknown role "${pipe.from}"`, blueprint);
  }
  if (!roleNames.has(pipe.to)) {
    throw new BlueprintSchemaError(`pipes[${i}].to`, `references unknown role "${pipe.to}"`, blueprint);
  }
  if (typeof pipe.hookId !== 'string' || pipe.hookId.length === 0) {
    throw new BlueprintSchemaError(`pipes[${i}].hookId`, 'is required', blueprint);
  }
  if (typeof pipe.name !== 'string' || pipe.name.length === 0) {
    throw new BlueprintSchemaError(`pipes[${i}].name`, 'is required', blueprint);
  }
}

// ─── validateBlueprint ─────────────────────────────────────────────────────────

/**
 * Validates a Blueprint object against the COS blueprint schema (§61.1).
 * Throws BlueprintSchemaError on failure. Returns the blueprint unchanged if valid.
 *
 * @param {object} blueprint
 * @param {{ has: (id: string) => boolean }|null} archetypeResolver
 *        Optional — if provided, every node.archetypeId is checked against
 *        it (registry.js passes ARCHETYPE_MAP for this). Omit only when
 *        validating in a context where archetypes aren't loaded yet.
 * @returns {object} the validated blueprint
 */
function validateBlueprint(blueprint, archetypeResolver = null) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new BlueprintSchemaError('blueprint', 'must be an object');
  }
  if (!isUUID(blueprint.id)) {
    throw new BlueprintSchemaError('id', `must be a valid UUID v4, got: ${JSON.stringify(blueprint.id)}`, blueprint);
  }
  if (!isKebab(blueprint.name)) {
    throw new BlueprintSchemaError('name', `must be kebab-case, got: ${JSON.stringify(blueprint.name)}`, blueprint);
  }
  if (!isSemver(blueprint.version)) {
    throw new BlueprintSchemaError('version', `must be semver (x.y.z), got: ${JSON.stringify(blueprint.version)}`, blueprint);
  }
  if (typeof blueprint.displayName !== 'string' || blueprint.displayName.length < 1) {
    throw new BlueprintSchemaError('displayName', 'must be a non-empty string', blueprint);
  }
  if (typeof blueprint.description !== 'string' || blueprint.description.length < 1) {
    throw new BlueprintSchemaError('description', 'must be a non-empty string', blueprint);
  }
  if (!Array.isArray(blueprint.nodes) || blueprint.nodes.length < 1) {
    throw new BlueprintSchemaError('nodes', 'must be a non-empty array', blueprint);
  }

  blueprint.nodes.forEach((n, i) => validateNode(n, i, blueprint));

  const roleNames = new Set(blueprint.nodes.map(n => n.role));
  if (roleNames.size !== blueprint.nodes.length) {
    throw new BlueprintSchemaError('nodes', 'role names must be unique within a blueprint', blueprint);
  }

  if (!Array.isArray(blueprint.pipes)) {
    throw new BlueprintSchemaError('pipes', 'must be an array', blueprint);
  }
  blueprint.pipes.forEach((p, i) => validatePipe(p, i, blueprint, roleNames));

  if (!Array.isArray(blueprint.startOrder) || blueprint.startOrder.length !== blueprint.nodes.length) {
    throw new BlueprintSchemaError('startOrder', 'must list every role exactly once', blueprint);
  }
  for (const role of blueprint.startOrder) {
    if (!roleNames.has(role)) {
      throw new BlueprintSchemaError('startOrder', `references unknown role "${role}"`, blueprint);
    }
  }

  if (typeof blueprint.builtIn !== 'boolean') {
    throw new BlueprintSchemaError('builtIn', 'must be a boolean', blueprint);
  }
  if (blueprint.pluginId !== null && !isUUID(blueprint.pluginId)) {
    throw new BlueprintSchemaError('pluginId', 'must be null or a valid UUID v4', blueprint);
  }
  if (!Array.isArray(blueprint.tags)) {
    throw new BlueprintSchemaError('tags', 'must be an array', blueprint);
  }

  if (archetypeResolver) {
    for (const node of blueprint.nodes) {
      if (!archetypeResolver.has(node.archetypeId)) {
        throw new BlueprintSchemaError('nodes[].archetypeId',
          `role "${node.role}" references archetypeId "${node.archetypeId}", which does not exist`, blueprint);
      }
    }
  }

  return blueprint;
}

module.exports = {
  BlueprintSchemaError,
  validateBlueprint,
};
