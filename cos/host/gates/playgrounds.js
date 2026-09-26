/**
 * host/gates/playgrounds.js
 * COMPARTMENT OS — Host Playground Gates (Phase 30, spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Gates registered here on the host stream:
 *   host:playgrounds:create   → PlaygroundCreateGate
 *   host:playgrounds:destroy  → PlaygroundDestroyGate
 *   host:playgrounds:promote  → PlaygroundPromoteGate
 *   host:playgrounds:status   → PlaygroundStatusGate
 *
 * NOTE: createPlayground() is async (the 'simulated' network mode starts
 * a real HTTP server). Gate.transform() itself stays synchronous per the
 * SISO Gate contract — the async work happens before this gate emits its
 * result event, driven by the CLI layer awaiting the factory call
 * directly rather than routing the async part through the gate. See
 * cli/commands/playground.js.
 */

'use strict';

const { Gate }  = require('../../siso/Gate.js');
const { Event } = require('../../siso/Event.js');
const { PLAYGROUNDS } = require('../../foundation/event-contracts.js');
const { enforce } = require('../../foundation/axioms.js');

const { destroyPlayground, promoteCompartment, playgroundStatus } = require('../../playgrounds/factory.js');

// ─── PlaygroundCreateGate ───────────────────────────────────────────────────────

/**
 * Handles: 'host:playgrounds:create'
 * Input payload: { playground, sysmap }  — the ALREADY-CREATED playground
 *   object (createPlayground() ran beforehand, async, by the caller —
 *   see note above). This gate's job is just the synchronous
 *   system-map registration + event emission.
 */
class PlaygroundCreateGate extends Gate {
  constructor() {
    super('host:playgrounds:create');
  }

  transform(event, stream) {
    const { playground, sysmap } = event.data;
    sysmap.upsertPlayground(playground);
    enforce('COS-7', { mapUpdated: true });
    stream.emit(new Event(PLAYGROUNDS.CREATED, {
      playgroundId: playground.id, name: playground.name, mode: playground.mode,
      compartmentCount: playground.compartmentIds.length, playground,
    }));
  }
}

// ─── PlaygroundDestroyGate ───────────────────────────────────────────────────────

class PlaygroundDestroyGate extends Gate {
  constructor() {
    super('host:playgrounds:destroy');
  }

  transform(event, stream) {
    const { playgroundId, host, sysmap } = event.data;
    const playground = sysmap.get().playgrounds.find(p => p.id === playgroundId);
    if (!playground) {
      stream.emit(new Event(PLAYGROUNDS.ERROR, { operation: 'destroy', reason: `playground "${playgroundId}" not found` }));
      return;
    }
    const { destroyed, errors } = destroyPlayground(host, playground);
    sysmap.removePlayground(playgroundId);
    enforce('COS-7', { mapUpdated: true });
    stream.emit(new Event(PLAYGROUNDS.DESTROYED, {
      playgroundId, name: playground.name, destroyedCompartments: destroyed, errors,
    }));
  }
}

// ─── PlaygroundPromoteGate ───────────────────────────────────────────────────────

class PlaygroundPromoteGate extends Gate {
  constructor() {
    super('host:playgrounds:promote');
  }

  transform(event, stream) {
    const { compartmentId, host } = event.data;
    try {
      const updated = promoteCompartment(host, compartmentId);
      enforce('COS-7', { mapUpdated: true });
      stream.emit(new Event(PLAYGROUNDS.PROMOTED, { compartmentId: updated.id, name: updated.name }));
    } catch (err) {
      stream.emit(new Event(PLAYGROUNDS.ERROR, { operation: 'promote', reason: err.message }));
    }
  }
}

// ─── PlaygroundStatusGate ───────────────────────────────────────────────────────

class PlaygroundStatusGate extends Gate {
  constructor() {
    super('host:playgrounds:status');
  }

  transform(event, stream) {
    const { playgroundId, host, sysmap } = event.data;
    const playground = sysmap.get().playgrounds.find(p => p.id === playgroundId);
    if (!playground) {
      stream.emit(new Event(PLAYGROUNDS.ERROR, { operation: 'status', reason: `playground "${playgroundId}" not found` }));
      return;
    }
    const status = playgroundStatus(host, playground);
    stream.emit(new Event(PLAYGROUNDS.SHOWN, status));
  }
}

module.exports = {
  PlaygroundCreateGate,
  PlaygroundDestroyGate,
  PlaygroundPromoteGate,
  PlaygroundStatusGate,
};
