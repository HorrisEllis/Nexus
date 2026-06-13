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
} = require('./gates/compartment.js');

const {
  ProcessSpawnGate,
  ProcessKillGate,
  ProcessStdinGate,
} = require('./gates/process.js');

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

  //    Process lifecycle
  bus.register(new ProcessSpawnGate());
  bus.register(new ProcessKillGate());
  bus.register(new ProcessStdinGate());

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
