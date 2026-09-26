/**
 * host/index.js
 * COMPARTMENT OS — Host Shell Bootstrap
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * createHost() boots the host in dependency order:
 *   1. StateStore
 *   2. EventBus (SISO Stream + StreamLog)
 *   3. SystemMap
 *   4. Gate registration — compartment lifecycle + process lifecycle
 *      to process spawn when a compartment has an entryFile
 *
 * Gate pipeline for cos start <name>:
 *   CLI emit('host:compartment:start')
 *     → StartCompartmentGate  → emit('host:compartment:started')
 *     → ProcessSpawnGate      → spawnProcess() → async events
 *
 * Gate pipeline for cos stop <name>:
 *   CLI emit('host:compartment:stop')
 *     → StopCompartmentGate   → emit('host:compartment:stopped')
 *     → ProcessKillGate       → SIGTERM → async comp:process:exited
 */

'use strict';

const { StateStore }     = require('./state-store.js');
const { createEventBus } = require('./event-bus.js');
const { SystemMap }      = require('./system-map.js');
const { Event }          = require('../siso/Event.js');
const { HOST, COMP }     = require('../foundation/event-contracts.js');
const { COS_VERSION }    = require('../foundation/constants.js');

const {
  CreateCompartmentGate,
  StartCompartmentGate,
  StopCompartmentGate,
  DestroyCompartmentGate,
  AdvanceWorkPhaseGate,
} = require('./gates/compartment.js');

const {
  ProcessSpawnGate,
  ProcessKillGate,
  ProcessStdinGate,
} = require('./gates/process.js');

// §BUGFIX 2026-09-06: these five gate files (archetype, blueprint,
// playgrounds, plugin, vault) were fully implemented — each with a header
// comment describing exactly which host:* events it handles — but never
// imported or registered here. Their corresponding CLI commands emitted
// events into the bus that had no listener at all: not an error, just
// silent no-ops (assignArchetype()'s `unsubAssigned()` would fire having
// received nothing, then `result` stayed null, then `result.archetypeName`
// threw — the same failure shape as the missing-constant bugs elsewhere,
// just one layer further from where it surfaced).
const {
  ArchetypeAssignGate,
  ArchetypeImportGate,
  ArchetypeDetectGate,
} = require('./gates/archetype.js');

const {
  BlueprintCreateGate,
  BlueprintImportGate,
  BlueprintDestroyGate,
} = require('./gates/blueprint.js');

const {
  PlaygroundCreateGate,
  PlaygroundDestroyGate,
  PlaygroundPromoteGate,
  PlaygroundStatusGate,
} = require('./gates/playgrounds.js');

const {
  PluginInstallGate,
  PluginEnableGate,
  PluginDisableGate,
  PluginRemoveGate,
} = require('./gates/plugin.js');

const {
  VaultSetGate,
  VaultGetGate,
  VaultDeleteGate,
  VaultGrantGate,
  VaultRevokeGate,
  VaultExportGate,
  VaultImportGate,
} = require('./gates/vault.js');

// ─── createHost ───────────────────────────────────────────────────────────────

function createHost(opts = {}) {
  // 1. State store
  const store = new StateStore(opts.stateFile);
  store.load();

  // 2. Event bus (SISO Stream + StreamLog)
  const bus = createEventBus({
    ringCap:  opts.ringCap,
    logLevel: opts.logLevel || 'EVENTS',
  });

  // 3. System map
  const sysmap = new SystemMap({ mapFile: opts.mapFile, eventBus: bus });
  sysmap.load();

  for (const comp of store.listCompartments()) {
    sysmap.upsertCompartment(comp);
  }

  // 4. Register gates
  //    Compartment lifecycle
  bus.register(new CreateCompartmentGate());
  bus.register(new StartCompartmentGate());
  bus.register(new StopCompartmentGate());
  bus.register(new DestroyCompartmentGate());
  bus.register(new AdvanceWorkPhaseGate());

  //    Process lifecycle
  bus.register(new ProcessSpawnGate());
  bus.register(new ProcessKillGate());
  bus.register(new ProcessStdinGate());

  //    Archetype
  bus.register(new ArchetypeAssignGate());
  bus.register(new ArchetypeImportGate());
  bus.register(new ArchetypeDetectGate());

  //    Blueprint
  bus.register(new BlueprintCreateGate());
  bus.register(new BlueprintImportGate());
  bus.register(new BlueprintDestroyGate());

  //    Playgrounds
  bus.register(new PlaygroundCreateGate());
  bus.register(new PlaygroundDestroyGate());
  bus.register(new PlaygroundPromoteGate());
  bus.register(new PlaygroundStatusGate());

  //    Plugin
  bus.register(new PluginInstallGate());
  bus.register(new PluginEnableGate());
  bus.register(new PluginDisableGate());
  bus.register(new PluginRemoveGate());

  //    Vault
  bus.register(new VaultSetGate());
  bus.register(new VaultGetGate());
  bus.register(new VaultDeleteGate());
  bus.register(new VaultGrantGate());
  bus.register(new VaultRevokeGate());
  bus.register(new VaultExportGate());
  bus.register(new VaultImportGate());

  //    When a compartment transitions to 'running', check if it has an entryFile.
  //    If so, emit the spawn command into the gate pipeline.
  //    This keeps StartCompartmentGate (state) separate from ProcessSpawnGate (process).
  bus.on(HOST.COMPARTMENT_STARTED, (ev) => {
    const comp = ev.payload.compartment;
    if (!comp) return;
    if (!comp.entryFile || !comp.runtimeId) return;  // no spawn without entry + runtime

    bus.emit('comp:process:spawn', {
      compartmentId: comp.id,
      name:          comp.name,
      runtimeId:     comp.runtimeId,
      entryFile:     comp.entryFile,
      entryArgs:     comp.entryArgs || [],
      cwd:           comp.fs && comp.fs.root ? comp.fs.root : process.cwd(),
      env:           comp.envVars || {},
      bus,
      store,
      sysmap,
    });
  });

  //    When a compartment transitions to 'stopped', kill its process if running.
  bus.on(HOST.COMPARTMENT_STOPPED, (ev) => {
    const comp = ev.payload.compartment;
    if (!comp) return;

    bus.emit('comp:process:kill', {
      compartmentId: comp.id,
      name:          comp.name,
    });
  });

  // §ADDED 2026-08-17 — James: "cos compartments being created to be
  // announced." Forwards the 4 real compartment lifecycle events to
  // orchestrator's real SSE via the new generic relay (POST /api/
  // broadcast). Deliberately non-blocking and silent on failure — COS's
  // own real compartment work must never depend on orchestrator being
  // reachable; a missed announcement is a real, honest degrade, not a
  // reason to fail the actual operation.
  for (const evType of [HOST.COMPARTMENT_CREATED, HOST.COMPARTMENT_STARTED, HOST.COMPARTMENT_STOPPED, HOST.COMPARTMENT_DESTROYED]) {
    bus.on(evType, (ev) => {
      try {
        require('../../lib/nexus-client.js').post('orchestrator', '/api/broadcast', { type: evType, payload: ev.payload }).catch(() => {});
      } catch (_) { /* nexus-client unreachable — COS's own real work is unaffected, §1.2 */ }
    });
  }

  const host = {
    store,
    bus,
    sysmap,
    version: COS_VERSION,
  };

  bus.emit(HOST.MAP_UPDATED, { source: 'boot', version: COS_VERSION });

  return host;
}

module.exports = { createHost };
