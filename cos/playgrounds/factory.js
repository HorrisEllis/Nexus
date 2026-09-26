/**
 * playgrounds/factory.js
 * COMPARTMENT OS — Playground Factory (Phase 30, spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE, same spirit as blueprint/plugin headers:
 *   Built this pass: create (all 3 modes — isolated/mirrored/synthetic),
 *   destroy, promote, status. The load-bearing loop.
 *   Deferred, flagged: enter/exit (CLI context switching — this CLI is a
 *   fresh process per invocation, "entering" a playground would need a
 *   persisted `.cos-context` file; a real feature, just not this pass),
 *   snapshot/restore (depends on the Nexus snapshot system's actual
 *   on-disk format, which this build hasn't verified end-to-end), clone,
 *   replay, diff-as-a-command (diffAgainstSource exists in cow-fs.js and
 *   IS used by status, just not exposed as its own `cos playground diff`
 *   verb yet), ttl/auto-destroy (would need a long-running daemon timer;
 *   this CLI has no persistent process to own that timer).
 *
 * STATE MODEL NOTE, flagged: spec's CompartmentState enum includes a
 * 'sandboxed' value AND Compartment has a separate `sandboxed: Boolean`
 * field — overlapping signals. This build uses `playgroundId` (which
 * playground, if any) + `sandboxed: true` (boolean flag) as the real
 * signal, and leaves `state` to track actual process lifecycle
 * (created/running/stopped) so start/stop/destroy gates keep working
 * normally on a playground compartment. CompartmentState.sandboxed is
 * available but not forced onto every playground compartment — that
 * would conflict with normal lifecycle transitions.
 */

'use strict';

const { randomUUID } = require('crypto');
const path = require('path');

const { createScopedHost } = require('./kernel.js');
const { setupPlaygroundFs, diffAgainstSource } = require('./cow-fs.js');
const { startEchoServer, stopEchoServer } = require('./network-sim.js');

const PLAYGROUND_MODES = Object.freeze(['isolated', 'mirrored', 'synthetic']);

class PlaygroundError extends Error {
  constructor(message) {
    super(`Playground: ${message}`);
    this.name = 'PlaygroundError';
  }
}

function defaultsForMode(mode) {
  switch (mode) {
    case 'mirrored':  return { fsMode: 'cow',   networkMode: 'proxied'  };
    case 'synthetic': return { fsMode: 'fresh', networkMode: 'isolated' };
    default:          return { fsMode: 'fresh', networkMode: 'isolated' }; // isolated
  }
}

function networkConfigForMode(networkMode) {
  switch (networkMode) {
    case 'proxied':   return { isolated: false, level: 3, logAllTraffic: true };
    case 'simulated': return { isolated: false, level: 2, logAllTraffic: true };
    default:          return { isolated: true,  level: 0, logAllTraffic: false }; // isolated
  }
}

/**
 * @param {object} host
 * @param {{ name: string, mode: string, sourceCompartmentName?: string,
 *           sourceBlueprintIdOrName?: string, fsMode?: string, networkMode?: string }} opts
 * @returns {Promise<{ playground: object, scopedHost: object, compartments: object[] }>}
 */
async function createPlayground(host, opts) {
  const { name, mode } = opts;
  if (!name) throw new PlaygroundError('name is required');
  if (!PLAYGROUND_MODES.includes(mode)) throw new PlaygroundError(`unknown mode "${mode}"`);

  const defaults = defaultsForMode(mode);
  const fsMode = opts.fsMode || defaults.fsMode;
  const networkMode = opts.networkMode || defaults.networkMode;

  const playgroundId = randomUUID();
  const scopedHost = createScopedHost(host, playgroundId);

  let sourceCompartmentId = null;
  let sourceBlueprintId = null;
  const compartments = [];

  if (mode === 'mirrored') {
    if (!opts.sourceCompartmentName) throw new PlaygroundError('mirrored mode requires sourceCompartmentName');
    const source = host.store.getCompartmentByName(opts.sourceCompartmentName);
    if (!source) throw new PlaygroundError(`source compartment "${opts.sourceCompartmentName}" not found`);
    sourceCompartmentId = source.id;

    const { createCompartment } = require('../cli/commands/create.js');
    const mirrorName = `${name}-${source.name}`;
    const mirrored = createCompartment(scopedHost, {
      name: mirrorName,
      purpose: `Playground mirror of ${source.name}`,
      runtimeId: source.runtimeId,
    });

    const newRoot = mirrored.fs.root;
    setupPlaygroundFs(fsMode === 'readonly' ? 'cow' : fsMode, newRoot, source.fs.root);

    const updated = Object.assign({}, mirrored, {
      playgroundId, sandboxed: true,
      network: Object.assign({}, mirrored.network, networkConfigForMode(networkMode)),
      fs: Object.assign({}, mirrored.fs, fsMode === 'readonly' ? { writable: [] } : {}),
      updatedAt: Date.now(),
    });
    host.store.setCompartment(updated);
    host.store.flushSync();
    host.sysmap.upsertCompartment(updated);
    compartments.push(updated);

  } else if (mode === 'synthetic') {
    if (!opts.sourceBlueprintIdOrName) throw new PlaygroundError('synthetic mode requires sourceBlueprintIdOrName');
    const { getBlueprint } = require('../blueprint/index.js');
    const blueprint = getBlueprint(opts.sourceBlueprintIdOrName, host.sysmap.get().blueprintDefs.filter(b => !b.builtIn));
    if (!blueprint) throw new PlaygroundError(`blueprint "${opts.sourceBlueprintIdOrName}" not found`);
    sourceBlueprintId = blueprint.id;

    const { launchBlueprint } = require('../blueprint/index.js');
    const result = launchBlueprint(scopedHost, blueprint, name);
    for (const comp of result.compartments) {
      const updated = Object.assign({}, comp, {
        playgroundId, sandboxed: true,
        network: Object.assign({}, comp.network, networkConfigForMode(networkMode)),
        updatedAt: Date.now(),
      });
      host.store.setCompartment(updated);
      host.sysmap.upsertCompartment(updated);
      compartments.push(updated);
    }
    host.store.flushSync();

  } // 'isolated' — empty container, no compartments created yet

  if (networkMode === 'simulated') {
    await startEchoServer(playgroundId);
  }

  const playground = {
    id: playgroundId,
    name,
    description: opts.description || '',
    mode,
    sourceCompartmentId,
    sourceBlueprintId,
    compartmentIds: compartments.map(c => c.id),
    nexusKernelId: playgroundId, // the scoped bus IS the kernel; no separate id needed
    network: { mode: networkMode },
    fs: { mode: fsMode },
    state: 'active',
    createdAt: Date.now(),
    destroyAt: null,
    snapshotIds: [],
  };

  return { playground, scopedHost, compartments };
}

/**
 * @param {object} host
 * @param {object} playground
 * @returns {{ destroyed: string[], errors: Array<{compartmentId, error}> }}
 */
function destroyPlayground(host, playground) {
  const { destroyCompartment } = require('../cli/commands/destroy.js');
  const destroyed = [];
  const errors = [];

  for (const compartmentId of playground.compartmentIds) {
    const comp = host.store.getCompartment(compartmentId);
    if (!comp) continue;
    try {
      destroyCompartment(host, comp.name, { force: true, wipe: true });
      destroyed.push(compartmentId);
    } catch (err) {
      errors.push({ compartmentId, error: err.message });
    }
  }

  if (playground.network.mode === 'simulated') {
    stopEchoServer(playground.id);
  }

  return { destroyed, errors };
}

/**
 * Moves a compartment OUT of a playground into production — clears the
 * playground tag. The compartment keeps whatever state/config it had;
 * "promotion" is the tag removal, not a config change.
 * @param {object} host
 * @param {string} compartmentId
 * @returns {object} the updated compartment
 */
function promoteCompartment(host, compartmentId) {
  const comp = host.store.getCompartment(compartmentId);
  if (!comp) throw new PlaygroundError(`compartment "${compartmentId}" not found`);
  if (!comp.playgroundId) throw new PlaygroundError(`compartment "${comp.name}" is not inside a playground`);

  const updated = Object.assign({}, comp, { playgroundId: null, sandboxed: false, updatedAt: Date.now() });
  host.store.setCompartment(updated);
  host.store.flushSync();
  host.sysmap.upsertCompartment(updated);
  return updated;
}

/**
 * @param {object} host
 * @param {object} playground
 * @returns {object} status summary, including per-compartment file diff counts for mirrored mode
 */
function playgroundStatus(host, playground) {
  const compartments = playground.compartmentIds
    .map(id => host.store.getCompartment(id))
    .filter(Boolean);

  let diffs = null;
  if (playground.mode === 'mirrored' && playground.sourceCompartmentId) {
    const source = host.store.getCompartment(playground.sourceCompartmentId);
    if (source) {
      diffs = compartments.map(c => ({
        compartmentId: c.id,
        name: c.name,
        ...diffAgainstSource(c.fs.root, source.fs.root),
      }));
    }
  }

  return {
    playground,
    compartments: compartments.map(c => ({ id: c.id, name: c.name, state: c.state })),
    diffs,
  };
}

module.exports = {
  PlaygroundError,
  PLAYGROUND_MODES,
  createPlayground,
  destroyPlayground,
  promoteCompartment,
  playgroundStatus,
};
