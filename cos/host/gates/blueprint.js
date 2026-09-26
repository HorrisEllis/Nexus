/**
 * host/gates/blueprint.js
 * COMPARTMENT OS — Host Blueprint Gates (Phase 22, spec §44/§61)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates registered here on the host stream:
 *   host:blueprint:create   → BlueprintCreateGate    (launch — hk-b-003)
 *   host:blueprint:import   → BlueprintImportGate
 *   host:blueprint:destroy  → BlueprintDestroyGate    (hk-b-005)
 *
 * scale (hk-b-004) and map (hk-b-007) are deferred — see blueprint/index.js
 * header comment for the reasoning.
 */

'use strict';

const { Gate }  = require('../../siso/Gate.js');
const { Event } = require('../../siso/Event.js');
const { BLUEPRINT } = require('../../foundation/event-contracts.js');
const { enforce } = require('../../foundation/axioms.js');

const {
  getBlueprint,
  importBlueprint,
  launchBlueprint,
  destroyBlueprintInstance,
} = require('../../blueprint/index.js');

// ─── BlueprintCreateGate (launch) ──────────────────────────────────────────────

/**
 * Handles: 'host:blueprint:create'
 * Input payload: { blueprintIdOrName, instanceName, host, sysmap }
 *   (host itself is passed through — launchBlueprint needs store+sysmap+bus
 *   to drive the compartment-creation and archetype-assignment gates)
 * Emits: 'blueprint:created' on success, 'blueprint:error' on failure.
 */
class BlueprintCreateGate extends Gate {
  constructor() {
    super('host:blueprint:create');
  }

  transform(event, stream) {
    const { blueprintIdOrName, instanceName, host, sysmap } = event.data;

    if (!instanceName) {
      stream.emit(new Event(BLUEPRINT.ERROR, { operation: 'create', reason: 'instanceName is required' }));
      return;
    }

    const customBlueprints = sysmap.get().blueprintDefs.filter(b => !b.builtIn);
    const blueprint = getBlueprint(blueprintIdOrName, customBlueprints);
    if (!blueprint) {
      stream.emit(new Event(BLUEPRINT.ERROR, { operation: 'create', reason: `blueprint "${blueprintIdOrName}" not found` }));
      return;
    }

    let result;
    try {
      result = launchBlueprint(host, blueprint, instanceName);
    } catch (err) {
      stream.emit(new Event(BLUEPRINT.ERROR, { operation: 'create', reason: err.message }));
      return;
    }

    sysmap.upsertBlueprintInstance(result.instance);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(BLUEPRINT.CREATED, {
      blueprintInstanceId: result.instance.id,
      blueprintId:          blueprint.id,
      blueprintName:        blueprint.name,
      instanceName,
      instance:             result.instance,
      compartmentCount:     result.compartments.length,
      pipeCount:            result.pipes.length,
    }));
  }
}

// ─── BlueprintImportGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:blueprint:import'
 * Input payload: { raw, sysmap }
 * Emits: 'blueprint:imported' on success, 'blueprint:error' on failure.
 */
class BlueprintImportGate extends Gate {
  constructor() {
    super('host:blueprint:import');
  }

  transform(event, stream) {
    const { raw, sysmap } = event.data;

    let blueprint;
    try {
      blueprint = importBlueprint(raw);
    } catch (err) {
      stream.emit(new Event(BLUEPRINT.ERROR, { operation: 'import', reason: err.message }));
      return;
    }

    sysmap.upsertBlueprintDef(blueprint);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(BLUEPRINT.IMPORTED, { blueprintId: blueprint.id, name: blueprint.name, blueprint }));
  }
}

// ─── BlueprintDestroyGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:blueprint:destroy'
 * Input payload: { instanceId, host, sysmap }
 * Emits: 'blueprint:destroyed' on success, 'blueprint:error' on failure.
 */
class BlueprintDestroyGate extends Gate {
  constructor() {
    super('host:blueprint:destroy');
  }

  transform(event, stream) {
    const { instanceId, host, sysmap } = event.data;

    const instance = sysmap.get().blueprintInstances.find(i => i.id === instanceId);
    if (!instance) {
      stream.emit(new Event(BLUEPRINT.ERROR, { operation: 'destroy', reason: `blueprint instance "${instanceId}" not found` }));
      return;
    }

    const { destroyed, errors } = destroyBlueprintInstance(host, instance);
    sysmap.removeBlueprintInstance(instanceId);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(BLUEPRINT.DESTROYED, {
      blueprintInstanceId: instanceId,
      instanceName: instance.name,
      destroyedCompartments: destroyed,
      errors,
    }));
  }
}

module.exports = {
  BlueprintCreateGate,
  BlueprintImportGate,
  BlueprintDestroyGate,
};
