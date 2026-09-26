/**
 * playgrounds/kernel.js
 * COMPARTMENT OS — Scoped Nexus Kernel for a Playground (spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * "Playground kernel: 1,423 events" in spec's UI mockup — a playground's
 * compartments emit into THEIR OWN event stream, not the master one. This
 * is what makes COS-43 ("playground compartments cannot communicate with
 * production compartments — ever") structurally true rather than just
 * documented: there's no shared bus for a cross-boundary message to
 * travel on.
 *
 * createScopedHost(host, playgroundId) returns a sub-host object with the
 * SAME shape as createHost()'s return value — { store, bus, sysmap,
 * version } — so every existing function that takes `host` (createCompartment,
 * the archetype/blueprint gates, etc.) works against a playground without
 * modification. store and sysmap are SHARED with the real host (so
 * playground compartments are still real, persisted, first-class
 * compartments, visible in the system map — COS-40's spirit, extended to
 * playgrounds) — only `bus` is a fresh, isolated instance.
 */

'use strict';

const { createEventBus } = require('../host/event-bus.js');

const { CreateCompartmentGate, StartCompartmentGate, StopCompartmentGate, DestroyCompartmentGate } = require('../host/gates/compartment.js');
const { ProcessSpawnGate, ProcessKillGate, ProcessStdinGate } = require('../host/gates/process.js');
const { ArchetypeAssignGate, ArchetypeImportGate, ArchetypeDetectGate } = require('../host/gates/archetype.js');
const { BlueprintCreateGate, BlueprintImportGate, BlueprintDestroyGate } = require('../host/gates/blueprint.js');

const { HOST } = require('../foundation/event-contracts.js');

/**
 * @param {object} host          the real host — { store, sysmap, bus, version }
 * @param {string} playgroundId
 * @returns {object} scopedHost  { store, sysmap, bus, version, playgroundId }
 */
function createScopedHost(host, playgroundId) {
  const bus = createEventBus({ logLevel: 'EVENTS' });

  bus.register(new CreateCompartmentGate());
  bus.register(new StartCompartmentGate());
  bus.register(new StopCompartmentGate());
  bus.register(new DestroyCompartmentGate());
  bus.register(new ProcessSpawnGate());
  bus.register(new ProcessKillGate());
  bus.register(new ProcessStdinGate());
  bus.register(new ArchetypeAssignGate());
  bus.register(new ArchetypeImportGate());
  bus.register(new ArchetypeDetectGate());
  bus.register(new BlueprintCreateGate());
  bus.register(new BlueprintImportGate());
  bus.register(new BlueprintDestroyGate());

  // Same auto-spawn-on-start / auto-kill-on-stop wiring createHost() does,
  // scoped to this playground's own bus only.
  bus.on(HOST.COMPARTMENT_STARTED, (ev) => {
    const comp = ev.payload.compartment;
    if (!comp || !comp.entryFile || !comp.runtimeId) return;
    const { getInjectionEnvVars } = require('../vault/index.js');
    const { VAULT } = require('../foundation/event-contracts.js');
    const vaultEnv = getInjectionEnvVars({ sysmap: host.sysmap, vaultOpts: host.vaultOpts }, comp);
    for (const key of Object.keys(vaultEnv)) {
      bus.emit(VAULT.INJECTED, { compartmentId: comp.id, key });
    }
    bus.emit('comp:process:spawn', {
      compartmentId: comp.id, name: comp.name, runtimeId: comp.runtimeId,
      entryFile: comp.entryFile, entryArgs: comp.entryArgs || [],
      cwd: comp.fs && comp.fs.root ? comp.fs.root : process.cwd(),
      env: Object.assign({}, vaultEnv, comp.envVars || {}),
      bus, store: host.store, sysmap: host.sysmap,
    });
  });
  bus.on(HOST.COMPARTMENT_STOPPED, (ev) => {
    const comp = ev.payload.compartment;
    if (!comp) return;
    bus.emit('comp:process:kill', { compartmentId: comp.id, name: comp.name });
  });

  return {
    store: host.store,
    sysmap: host.sysmap,
    bus,
    version: host.version,
    playgroundId,
  };
}

module.exports = { createScopedHost };
