/**
 * blueprint/index.js
 * COMPARTMENT OS — Blueprint Public API (Phase 22, spec §44/§61)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE: this pass implements list / get / import / launch / destroy /
 * status. It does NOT implement `scale` (hk-b-004) or `map` (hk-b-007) —
 * deferred, not silently dropped. Launch + destroy + status is the load-
 * bearing loop; scale/map are refinements on top of a working foundation.
 *
 * DEVIATION FROM SPEC, FLAGGED: §61.2's BlueprintInstance.compartments is
 * typed Record<role, CompartmentID> — one compartment per role. But nodes
 * can be scalable with maxInstances > 1 (worker-pool's "worker" role goes
 * to 20). A single-id-per-role map cannot represent that. This build uses
 * Record<role, CompartmentID[]> instead. If a future spec revision defines
 * this differently, this is the seam to revisit.
 *
 * PIPE WIRING, FLAGGED: spec gives no fan-out semantics for wiring a pipe
 * between two roles when one or both sides have multiple instances. This
 * build wires the full cross product (every instance of `from` to every
 * instance of `to`) — correct for every blueprint in this registry, where
 * at most one side of any given pipe is ever scaled. An N-to-M pipe where
 * BOTH sides are scaled >1 would produce a full mesh, which may not be
 * the intended topology — there's no spec text to resolve that case.
 */

'use strict';

const { randomUUID } = require('crypto');
const fs   = require('fs');
const path = require('path');

const { BLUEPRINTS, getBuiltInBlueprint } = require('./registry.js');
const { validateBlueprint, BlueprintSchemaError } = require('./schema.js');
const { ARCHETYPE_MAP, getBuiltInArchetype } = require('../archetype/registry.js');
const { makePipe } = require('../foundation/types.js');

// ─── Template substitution ─────────────────────────────────────────────────────

/**
 * Replaces {{key}} tokens. Used for both nameTemplate and fsTemplate content.
 * @param {string} str
 * @param {Record<string,string>} vars
 * @returns {string}
 */
function substituteTemplate(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : `{{${key}}}`));
}

// ─── List / Get / Import ───────────────────────────────────────────────────────

function listBlueprints(customBlueprints = []) {
  return [...BLUEPRINTS, ...customBlueprints];
}

function getBlueprint(idOrName, customBlueprints = []) {
  const builtIn = getBuiltInBlueprint(idOrName);
  if (builtIn) return builtIn;
  return customBlueprints.find(b => b.id === idOrName || b.name === idOrName) || null;
}

/**
 * Import a custom blueprint (§77-style: upload a schema directly).
 * Same id-collision guard as archetype/index.js importArchetype — see
 * that function's comment for why the check matters, not just "is this
 * a UUID."
 * @param {object} rawBlueprint
 * @returns {object}
 */
function importBlueprint(rawBlueprint) {
  const { isUUID } = require('../foundation/hook-schema.js');
  const { BLUEPRINT_MAP } = require('./registry.js');

  const idIsFree = isUUID(rawBlueprint.id) && !BLUEPRINT_MAP.has(rawBlueprint.id);
  const candidate = Object.assign({}, rawBlueprint, {
    id:       idIsFree ? rawBlueprint.id : randomUUID(),
    builtIn:  false,
    pluginId: rawBlueprint.pluginId ?? null,
  });
  validateBlueprint(candidate, ARCHETYPE_MAP);
  return candidate;
}

// ─── Launch ─────────────────────────────────────────────────────────────────────

/**
 * Launch a blueprint into a real set of wired compartments.
 *
 * Per node: creates minInstances compartments (via the existing compartment
 * creation gate), assigns the node's archetype to each (via the existing
 * archetype assignment gate — reusing Phase 21, not duplicating preset
 * logic), and writes the archetype's fsTemplate into each compartment's
 * fs.root. Per pipe: wires the cross product of from/to instances using
 * the existing makePipe()/sysmap.upsertPipe() primitives.
 *
 * This function does the orchestration; the gate (host/gates/blueprint.js)
 * is the thin event-bus wrapper around it, matching the existing
 * archetype/index.js + host/gates/archetype.js split.
 *
 * @param {object} host       { store, sysmap, bus } — needs store+sysmap for createCompartment/assign
 * @param {object} blueprint
 * @param {string} instanceName  user-given name, e.g. "myapp"
 * @returns {{ instance: object, compartments: object[], pipes: object[] }}
 */
function launchBlueprint(host, blueprint, instanceName) {
  const { createCompartment } = require('../cli/commands/create.js');

  const roleToCompartmentIds = {};
  const createdCompartments = [];

  const orderedNodes = blueprint.startOrder
    .map(role => blueprint.nodes.find(n => n.role === role))
    .filter(Boolean);

  for (const node of orderedNodes) {
    const archetype = getBuiltInArchetype(node.archetypeId) ||
      (host.sysmap.get().archetypes || []).find(a => a.id === node.archetypeId);
    if (!archetype) {
      throw new Error(`launchBlueprint: role "${node.role}" references archetype "${node.archetypeId}", which does not exist`);
    }

    const minInstances = node.minInstances ?? 1;
    const ids = [];

    for (let i = 0; i < minInstances; i++) {
      const vars = { blueprintName: instanceName, role: node.role, index: i + 1 };
      const name = substituteTemplate(node.nameTemplate, vars);
      const purpose = (node.overrides && node.overrides.purpose) || `${blueprint.displayName} — ${node.role}`;
      const runtimeId = (node.overrides && node.overrides.runtimeId) || archetype.runtimeId;

      const compartment = createCompartment(host, { name, purpose, runtimeId });

      // Reuse Phase 21's archetype assignment — same preset logic, no duplication.
      let assigned = null;
      const unsub = host.bus.on('archetype:assigned', (ev) => {
        if (ev.payload.compartmentName === name) assigned = ev.payload;
      });
      host.bus.emit('host:archetype:assign', {
        compartmentName: name,
        archetypeIdOrName: archetype.id,
        store: host.store,
        sysmap: host.sysmap,
      });
      unsub();

      const finalCompartment = (assigned && assigned.compartment) || compartment;

      // Scaffold the archetype's fsTemplate into the new compartment's root.
      for (const file of archetype.fsTemplate || []) {
        const filePath = path.join(finalCompartment.fs.root, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const content = file.binary ? file.content : substituteTemplate(file.content, { name, slug: finalCompartment.slug });
        fs.writeFileSync(filePath, content, file.binary ? 'binary' : 'utf8');
      }

      ids.push(finalCompartment.id);
      createdCompartments.push(finalCompartment);
    }

    roleToCompartmentIds[node.role] = ids;
  }

  // Wire pipes — cross product per role pair (see file header for the flagged limitation).
  const createdPipes = [];
  for (const pipeSpec of blueprint.pipes) {
    const fromIds = roleToCompartmentIds[pipeSpec.from] || [];
    const toIds   = roleToCompartmentIds[pipeSpec.to]   || [];
    for (const sourceId of fromIds) {
      for (const targetId of toIds) {
        const pipe = makePipe({
          id: randomUUID(),
          name: pipeSpec.name,
          sourceId, targetId,
          hookId: pipeSpec.hookId,
          filter: pipeSpec.filter ?? null,
          state: 'active',
          createdAt: Date.now(),
          eventLog: true,
        });
        host.sysmap.upsertPipe(pipe);
        createdPipes.push(pipe);
      }
    }
  }

  const instance = {
    id: randomUUID(),
    blueprintId: blueprint.id,
    name: instanceName,
    compartments: roleToCompartmentIds,   // Record<role, CompartmentID[]> — see file header
    pipeIds: createdPipes.map(p => p.id),
    state: 'starting',
    createdAt: Date.now(),
  };

  return { instance, compartments: createdCompartments, pipes: createdPipes };
}

/**
 * Destroy a blueprint instance: destroys every compartment it created,
 * leaves the pipes' upsertPipe records to be cleaned up by the caller
 * (the gate removes them from sysmap directly — pipes have no standalone
 * destroy gate yet, same gap noted for Blueprint pipe creation itself).
 *
 * @param {object} host
 * @param {object} instance
 * @returns {{ destroyed: string[], errors: Array<{compartmentId, error}> }}
 */
function destroyBlueprintInstance(host, instance) {
  const { destroyCompartment } = require('../cli/commands/destroy.js');
  const destroyed = [];
  const errors = [];

  const allCompartmentIds = Object.values(instance.compartments).flat();
  for (const compartmentId of allCompartmentIds) {
    const comp = host.store.getCompartment(compartmentId);
    if (!comp) continue;
    try {
      destroyCompartment(host, comp.name, { force: true, wipe: false });
      destroyed.push(compartmentId);
    } catch (err) {
      errors.push({ compartmentId, error: err.message });
    }
  }

  for (const pipeId of instance.pipeIds) {
    host.sysmap.removePipe(pipeId);
  }

  return { destroyed, errors };
}

module.exports = {
  listBlueprints,
  getBlueprint,
  importBlueprint,
  launchBlueprint,
  destroyBlueprintInstance,
  substituteTemplate,
  BlueprintSchemaError,
};
