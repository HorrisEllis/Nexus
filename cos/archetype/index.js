/**
 * archetype/index.js
 * COMPARTMENT OS — Archetype Public API
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * The single entry point other subsystems use. Gates (host/gates/archetype.js)
 * and CLI commands (cli/commands/archetype.js) call into this, not into
 * registry.js / schema.js / detector.js directly.
 *
 * COS-49: Archetype JSON files are first-class importable objects —
 * no plugin required (§77 Option A).
 */

'use strict';

const { randomUUID } = require('crypto');

const { ARCHETYPES, getBuiltInArchetype } = require('./registry.js');
const { validateArchetype, ArchetypeSchemaError } = require('./schema.js');
const { detectArchetype } = require('./detector.js');

/**
 * List built-ins + any custom archetypes passed in (already loaded from
 * the system map by the caller — this module holds no state of its own).
 * @param {object[]} customArchetypes
 * @returns {object[]}
 */
function listArchetypes(customArchetypes = []) {
  return [...ARCHETYPES, ...customArchetypes];
}

/**
 * @param {string} idOrName
 * @param {object[]} customArchetypes
 * @returns {object|null}
 */
function getArchetype(idOrName, customArchetypes = []) {
  const builtIn = getBuiltInArchetype(idOrName);
  if (builtIn) return builtIn;
  return customArchetypes.find(a => a.id === idOrName || a.name === idOrName) || null;
}

/**
 * Import a custom archetype (Option A — §77: upload a schema directly,
 * no plugin). Validates against the same schema built-ins go through.
 *
 * Mints a fresh UUID whenever the source id is missing, malformed, OR
 * collides with a built-in archetype's id. The collision check matters:
 * cloning a built-in as a starting template (§77's documented workflow —
 * "take an existing archetype, change a few fields") and forgetting to
 * clear `id` produces a syntactically valid UUID that happens to BE a
 * built-in's id. Without this check, upsertArchetype's findIndex-by-id
 * would silently overwrite the built-in's registry slot instead of
 * adding a new custom entry — found by testing exactly this workflow.
 *
 * @param {object} rawArchetype  parsed JSON
 * @returns {object} the validated, ready-to-register archetype
 * @throws {ArchetypeSchemaError}
 */
function importArchetype(rawArchetype) {
  const { isUUID } = require('../foundation/hook-schema.js');
  const { ARCHETYPE_MAP } = require('./registry.js');

  const idIsFree = isUUID(rawArchetype.id) && !ARCHETYPE_MAP.has(rawArchetype.id);

  const candidate = Object.assign({}, rawArchetype, {
    id:       idIsFree ? rawArchetype.id : randomUUID(),
    builtIn:  false,
    pluginId: rawArchetype.pluginId ?? null,
  });
  validateArchetype(candidate);
  return candidate;
}

/**
 * Detect the best-fit archetype for a project on disk.
 * @param {string} root
 * @returns {object} detectArchetype() result — { results, top, detection }
 */
function detectForProject(root) {
  return detectArchetype(root);
}

/**
 * Merge an archetype's presets into a compartment's config. Does not
 * mutate the input compartment — returns a new object.
 *
 * IMPORTANT: resources/watchdog/network are REPLACED wholesale by the
 * archetype's preset, not merged. makeCompartment() never leaves these
 * blocks partially populated — every field always has a concrete default
 * value, so there is no way to tell "user explicitly set this" apart from
 * "still default." A field-level merge that lets "compartment values win"
 * is therefore vacuous: the compartment's pre-existing defaults would win
 * 100% of the time and assigning an archetype would do nothing observable
 * beyond stamping archetypeId. (Found by testing this function against a
 * real compartment — ramLimitMB stayed 0 instead of becoming the preset's
 * 256 — fixed here rather than shipped.) Until compartments track which
 * fields were explicitly set by a person, "assign" means "adopt this
 * archetype's preset," full stop.
 *
 * @param {object} compartment
 * @param {object} archetype
 * @returns {object} updated compartment (not yet persisted — caller's job)
 */
function applyArchetypeToCompartment(compartment, archetype) {
  return Object.assign({}, compartment, {
    archetypeId: archetype.id,
    runtimeId:   compartment.runtimeId || archetype.runtimeId,
    resources:   { ...archetype.resources },
    watchdog:    { ...archetype.watchdogPreset },
    network:     { ...archetype.networkPreset },
  });
}

module.exports = {
  listArchetypes,
  getArchetype,
  importArchetype,
  detectForProject,
  applyArchetypeToCompartment,
  ArchetypeSchemaError,
};
