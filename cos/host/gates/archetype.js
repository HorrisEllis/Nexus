/**
 * host/gates/archetype.js
 * COMPARTMENT OS — Host Archetype Gates (Phase 21, spec §43/§60)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates registered here on the host stream:
 *   host:archetype:assign  → ArchetypeAssignGate
 *   host:archetype:import  → ArchetypeImportGate
 *   host:archetype:detect  → ArchetypeDetectGate
 *
 * Pattern (same as host/gates/compartment.js):
 *   CLI → bus.emit('host:archetype:assign', payload)
 *       → ArchetypeAssignGate.transform()
 *       → bus.emit('archetype:assigned', result)
 */

'use strict';

const { Gate }  = require('../../siso/Gate.js');
const { Event } = require('../../siso/Event.js');
const { ARCHETYPE } = require('../../foundation/event-contracts.js');
const { enforce } = require('../../foundation/axioms.js');

const {
  getArchetype,
  importArchetype,
  detectForProject,
  applyArchetypeToCompartment,
} = require('../../archetype/index.js');

// ─── ArchetypeAssignGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:archetype:assign'
 * Input payload: { compartmentName, archetypeIdOrName, forced, store, sysmap }
 * Emits: 'archetype:assigned' on success, 'archetype:error' on failure.
 */
class ArchetypeAssignGate extends Gate {
  constructor() {
    super('host:archetype:assign');
  }

  transform(event, stream) {
    const { compartmentName, archetypeIdOrName, forced = false, store, sysmap } = event.data;

    const comp = store.getCompartmentByName(compartmentName) || store.getCompartment(compartmentName);
    if (!comp) {
      stream.emit(new Event(ARCHETYPE.ERROR, {
        operation: 'assign',
        reason:    `compartment "${compartmentName}" not found`,
      }));
      return;
    }

    const customArchetypes = sysmap.get().archetypes.filter(a => !a.builtIn);
    const archetype = getArchetype(archetypeIdOrName, customArchetypes);
    if (!archetype) {
      stream.emit(new Event(ARCHETYPE.ERROR, {
        operation: 'assign',
        reason:    `archetype "${archetypeIdOrName}" not found`,
      }));
      return;
    }

    const updated = applyArchetypeToCompartment(comp, archetype);
    updated.updatedAt = Date.now();

    store.setCompartment(updated);
    store.flushSync();
    sysmap.upsertCompartment(updated);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(ARCHETYPE.ASSIGNED, {
      compartmentId:   updated.id,
      compartmentName: updated.name,
      archetypeId:     archetype.id,
      archetypeName:   archetype.name,
      confidence:      forced ? 'forced' : null,
      compartment:     updated,
    }));
  }
}

// ─── ArchetypeImportGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:archetype:import'
 * Input payload: { raw, sysmap }   — raw = parsed JSON from disk
 * Emits: 'archetype:created' on success, 'archetype:error' on failure.
 */
class ArchetypeImportGate extends Gate {
  constructor() {
    super('host:archetype:import');
  }

  transform(event, stream) {
    const { raw, sysmap } = event.data;

    let archetype;
    try {
      archetype = importArchetype(raw);
    } catch (err) {
      stream.emit(new Event(ARCHETYPE.ERROR, {
        operation: 'import',
        reason:    err.message,
      }));
      return;
    }

    sysmap.upsertArchetype(archetype);
    enforce('COS-7', { mapUpdated: true });

    stream.emit(new Event(ARCHETYPE.CREATED, {
      archetypeId: archetype.id,
      name:        archetype.name,
      archetype,
    }));
  }
}

// ─── ArchetypeDetectGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:archetype:detect'
 * Input payload: { root }   — project/compartment root directory
 * Emits: 'archetype:detected' (always — even a no-match result is data).
 */
class ArchetypeDetectGate extends Gate {
  constructor() {
    super('host:archetype:detect');
  }

  transform(event, stream) {
    const { root } = event.data;

    if (!root) {
      stream.emit(new Event(ARCHETYPE.ERROR, {
        operation: 'detect',
        reason:    'root path is required',
      }));
      return;
    }

    const { results, top } = detectForProject(root);

    stream.emit(new Event(ARCHETYPE.DETECTED, {
      root,
      top: top ? { archetypeId: top.archetypeId, name: top.name, score: top.score, confidence: top.confidence } : null,
      results: results.slice(0, 5).map(r => ({
        archetypeId: r.archetypeId, name: r.name, score: r.score, confidence: r.confidence,
      })),
    }));
  }
}

module.exports = {
  ArchetypeAssignGate,
  ArchetypeImportGate,
  ArchetypeDetectGate,
};
