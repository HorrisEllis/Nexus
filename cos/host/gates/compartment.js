/**
 * host/gates/compartment.js
 * COMPARTMENT OS — Host Compartment Lifecycle Gates
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Every compartment lifecycle operation is a Gate.
 * The gate's signature = the event type it handles.
 * The gate's transform = the operation logic.
 *
 * Gates registered here on the host stream:
 *   host:compartment:create   → CreateCompartmentGate
 *   host:compartment:start    → StartCompartmentGate
 *   host:compartment:stop     → StopCompartmentGate
 *   host:compartment:destroy  → DestroyCompartmentGate
 *
 * Note: these are COMMAND events (imperative intent), distinct from
 * the RESULT events (host:compartment:created, host:compartment:started, etc.)
 * which are emitted BY the gates as output.
 *
 * Pattern:
 *   CLI wizard → bus.emit('host:compartment:create', config)
 *              → CreateCompartmentGate.transform()
 *              → bus.emit('host:compartment:created', result)
 *
 * This is the SISO gate pipeline. Logic lives here. CLI is just input.
 */

'use strict';

const fs   = require('fs');
const { randomUUID } = require('crypto');

const { Gate }              = require('../../siso/Gate.js');
const { Event }             = require('../../siso/Event.js');
const { makeCompartment }   = require('../../foundation/types.js');
const { isValidTransition, isValidWorkPhaseTransition } = require('../../foundation/types.js');
const { enforce }           = require('../../foundation/axioms.js');
const { HOST }              = require('../../foundation/event-contracts.js');
const { compartmentPaths, COS_VERSION } = require('../../foundation/constants.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── CreateCompartmentGate ────────────────────────────────────────────────────

/**
 * Handles: 'host:compartment:create'
 * Input payload: { name, purpose, runtimeId, networkIsolated, store, sysmap }
 * Emits:  'host:compartment:created' with full compartment
 *
 * The store and sysmap references are passed in the event payload because
 * gates are stateless — they receive everything they need in the event.
 */
class CreateCompartmentGate extends Gate {
  constructor() {
    super('host:compartment:create');
  }

  transform(event, stream) {
    const { name, purpose, runtimeId, networkIsolated = true, parentId = null, store, sysmap } = event.data;

    if (!name) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'create',
        reason:    'name is required',
      }));
      return;
    }

    const slug = toSlug(name);
    if (!slug) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'create',
        reason:    `invalid name "${name}" — must produce a valid slug`,
      }));
      return;
    }

    const existing = store.getCompartmentByName(name);
    if (existing) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'create',
        reason:    `compartment "${name}" already exists (id: ${existing.id})`,
      }));
      return;
    }

    // §NEST 0.39.261 — a parent must already exist; nesting under a
    // compartment that isn't there is refused, never silently made top-level.
    let parent = null;
    if (parentId) {
      parent = store.getCompartment(parentId) || store.getCompartmentByName(parentId);
      if (!parent) {
        stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
          operation: 'create',
          reason:    `parent compartment "${parentId}" not found`,
        }));
        return;
      }
    }

    const id    = randomUUID();
    const now   = Date.now();
    const paths = compartmentPaths(id);

    const compartment = makeCompartment({
      id,
      name,
      slug,
      purpose:   purpose  || '',
      runtimeId: runtimeId || null,
      state:     'created',
      parentId:  parent ? parent.id : null,
      network: {
        isolated:     networkIsolated,
        proxyPort:    null,
        allowedHosts: [],
        dnsOverride:  {},
      },
      fs: {
        root:         paths.root,
        writable:     [paths.root],
        readonly:     [],
        mounts:       [],
        watchEnabled: true,
      },
      createdAt:  now,
      updatedAt:  now,
      snapshotAt: null,
      cosVersion: COS_VERSION,
      createdBy:  require('os').hostname(),
    });

    // Write to disk
    fs.mkdirSync(paths.root,   { recursive: true });
    fs.mkdirSync(paths.nexDir, { recursive: true });
    fs.mkdirSync(paths.walDir, { recursive: true });
    fs.writeFileSync(paths.manifest, JSON.stringify(compartment, null, 2), 'utf8');

    // Persist (COS-7: system map updated on every mutation)
    store.setCompartment(compartment);
    if (parent) {
      const updatedParent = Object.assign({}, parent, {
        childIds:  [...new Set([...(parent.childIds || []), id])],
        updatedAt: now,
      });
      store.setCompartment(updatedParent);
      try { fs.writeFileSync(compartmentPaths(parent.id).manifest, JSON.stringify(updatedParent, null, 2), 'utf8'); } catch (_) { /* store is authoritative; manifest refresh is best-effort */ }
      sysmap.upsertCompartment(updatedParent);
    }
    store.flushSync();
    sysmap.upsertCompartment(compartment);

    // Enforce COS-7 post-mutation
    enforce('COS-7', { mapUpdated: true });

    // Emit result event — this is the output of the gate
    stream.emit(new Event(HOST.COMPARTMENT_CREATED, {
      compartmentId: id,
      name,
      slug,
      runtimeId,
      compartment,
    }));
  }
}

// ─── StartCompartmentGate ─────────────────────────────────────────────────────

/**
 * Handles: 'host:compartment:start'
 * Input payload: { name, store, sysmap }
 * Emits:  'host:compartment:started'
 */
class StartCompartmentGate extends Gate {
  constructor() {
    super('host:compartment:start');
  }

  transform(event, stream) {
    const { name, store, sysmap } = event.data;

    const comp = store.getCompartmentByName(name) || store.getCompartment(name);

    if (!comp) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'start',
        reason:    `compartment "${name}" not found`,
      }));
      return;
    }

    if (!isValidTransition(comp.state, 'running')) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'start',
        reason:    `cannot transition "${name}" from "${comp.state}" to "running"`,
      }));
      return;
    }

    const now     = Date.now();
    const updated = Object.assign({}, comp, {
      state:       'running',
      updatedAt:   now,
      lastStartAt: now,
    });

    store.setCompartment(updated);
    store.flushSync();
    sysmap.upsertCompartment(updated);

    stream.emit(new Event(HOST.COMPARTMENT_STARTED, {
      compartmentId: updated.id,
      name:          updated.name,
      state:         'running',
      compartment:   updated,
    }));
  }
}

// ─── StopCompartmentGate ──────────────────────────────────────────────────────

/**
 * Handles: 'host:compartment:stop'
 * Input payload: { name, store, sysmap }
 * Emits:  'host:compartment:stopped'
 */
class StopCompartmentGate extends Gate {
  constructor() {
    super('host:compartment:stop');
  }

  transform(event, stream) {
    const { name, store, sysmap } = event.data;

    const comp = store.getCompartmentByName(name) || store.getCompartment(name);

    if (!comp) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'stop',
        reason:    `compartment "${name}" not found`,
      }));
      return;
    }

    if (!isValidTransition(comp.state, 'stopped')) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'stop',
        reason:    `cannot transition "${name}" from "${comp.state}" to "stopped"`,
      }));
      return;
    }

    const now     = Date.now();
    const updated = Object.assign({}, comp, {
      state:      'stopped',
      updatedAt:  now,
      lastStopAt: now,
    });

    store.setCompartment(updated);
    store.flushSync();
    sysmap.upsertCompartment(updated);

    stream.emit(new Event(HOST.COMPARTMENT_STOPPED, {
      compartmentId: updated.id,
      name:          updated.name,
      state:         'stopped',
      compartment:   updated,
    }));
  }
}

// ─── DestroyCompartmentGate ───────────────────────────────────────────────────

/**
 * Handles: 'host:compartment:destroy'
 * Input payload: { name, force, wipe, store, sysmap }
 * Emits:  'host:compartment:destroyed'
 */
class DestroyCompartmentGate extends Gate {
  constructor() {
    super('host:compartment:destroy');
  }

  transform(event, stream) {
    const { name, force = false, wipe = false, store, sysmap } = event.data;

    const comp = store.getCompartmentByName(name) || store.getCompartment(name);

    if (!comp) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'destroy',
        reason:    `compartment "${name}" not found`,
      }));
      return;
    }

    if (comp.state === 'running' && !force) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'destroy',
        reason:    `"${name}" is running — stop it first, or pass force: true`,
      }));
      return;
    }

    let wiped = false;
    if (wipe && comp.fs && comp.fs.root) {
      try {
        fs.rmSync(comp.fs.root, { recursive: true, force: true });
        wiped = true;
      } catch (_) {}
    }

    store.deleteCompartment(comp.id);
    store.flushSync();
    sysmap.removeCompartment(comp.id);

    stream.emit(new Event(HOST.COMPARTMENT_DESTROYED, {
      compartmentId: comp.id,
      name:          comp.name,
      wiped,
    }));
  }
}

// ─── AdvanceWorkPhaseGate ───────────────────────────────────────────────────
//
// §MCO04 2026-09-18 — real, forward-only work-phase advance for an
// already-running compartment. Same real validate → update → persist →
// emit shape as Start/Stop above; distinct from `state` entirely — a
// compartment can be mid-VERIFYING and still just be `state: 'running'`.
//
// Handles: 'host:compartment:advance-work-phase'
// Input payload: { name, nextPhase, store, sysmap }
// Emits: 'host:compartment:work-phase-advanced' | 'host:compartment:error'
class AdvanceWorkPhaseGate extends Gate {
  constructor() {
    super('host:compartment:advance-work-phase');
  }

  transform(event, stream) {
    const { name, nextPhase, store, sysmap } = event.data;

    const comp = store.getCompartmentByName(name) || store.getCompartment(name);
    if (!comp) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'advance-work-phase',
        reason:    `compartment "${name}" not found`,
      }));
      return;
    }

    if (!isValidWorkPhaseTransition(comp.workPhase, nextPhase)) {
      stream.emit(new Event(HOST.COMPARTMENT_ERROR, {
        operation: 'advance-work-phase',
        reason:    `cannot advance "${name}" from work-phase "${comp.workPhase}" to "${nextPhase}"`,
      }));
      return;
    }

    const now     = Date.now();
    const updated = Object.assign({}, comp, {
      workPhase: nextPhase,
      updatedAt: now,
    });

    store.setCompartment(updated);
    store.flushSync();
    sysmap.upsertCompartment(updated);

    stream.emit(new Event(HOST.COMPARTMENT_WORK_PHASE_ADVANCED, {
      compartmentId: updated.id,
      name:          updated.name,
      workPhase:     nextPhase,
      compartment:   updated,
    }));
  }
}

module.exports = {
  CreateCompartmentGate,
  StartCompartmentGate,
  StopCompartmentGate,
  DestroyCompartmentGate,
  AdvanceWorkPhaseGate,
  toSlug,
};
