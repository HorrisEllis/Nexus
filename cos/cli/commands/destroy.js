/**
 * cli/commands/destroy.js
 * COMPARTMENT OS — cos destroy <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Dispatches via SISO gate pipeline:
 *   emit('host:compartment:destroy') → DestroyCompartmentGate → emit('host:compartment:destroyed')
 *
 * Hook: hk-h-005
 * Event: host:compartment:destroyed
 */

'use strict';

const readline = require('readline');
const { HOST } = require('../../foundation/event-contracts.js');

function destroyCompartment(host, name, opts = {}) {
  const { force = false, wipe = false } = opts;

  if (!name) throw new Error('destroy: name is required');

  let result    = null;
  let errorData = null;

  const unsubDestroyed = host.bus.on(HOST.COMPARTMENT_DESTROYED, ev => {
    if (ev.payload.name === name) result = ev.payload;
  });
  const unsubError = host.bus.on(HOST.COMPARTMENT_ERROR, ev => {
    if (ev.payload.operation === 'destroy') errorData = ev.payload;
  });

  host.bus.emit('host:compartment:destroy', {
    name, force, wipe,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubDestroyed();
  unsubError();

  if (errorData) throw new Error(errorData.reason);
  if (!result)   throw new Error(`destroy: gate did not produce a result for "${name}"`);

  return result;
}

async function runDestroyWizard(host, name, flags = {}, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!name) { error('  Usage: cos destroy <name>'); return false; }

  const comp = host.store.getCompartmentByName(name) || host.store.getCompartment(name);
  if (!comp) { error(`  Error: compartment "${name}" not found`); return false; }

  if (!flags.force) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve =>
      rl.question(
        `  Destroy "${comp.name}" (${comp.state})? This cannot be undone. [y/N]: `,
        ans => { rl.close(); resolve(ans.trim().toLowerCase()); }
      )
    );
    if (answer !== 'y' && answer !== 'yes') { log('  Aborted.'); return false; }
  }

  try {
    const result = destroyCompartment(host, name, { wipe: flags.wipe, force: flags.force });
    log(`  ✓ Destroyed: ${result.name}  [${result.compartmentId}]`);
    if (result.wiped) log('    Filesystem wiped.');
    return true;
  } catch (err) {
    error(`  Error: ${err.message}`);
    return false;
  }
}

module.exports = { destroyCompartment, runDestroyWizard };
