/**
 * cli/commands/stop.js
 * COMPARTMENT OS — cos stop <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Dispatches via SISO gate pipeline:
 *   emit('host:compartment:stop') → StopCompartmentGate → emit('host:compartment:stopped')
 *
 * Hook: hk-h-004
 * Event: host:compartment:stopped
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');

function stopCompartment(host, name, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!name) throw new Error('stop: name is required');

  let result    = null;
  let errorData = null;

  const unsubStopped = host.bus.on(HOST.COMPARTMENT_STOPPED, ev => {
    if (ev.payload.name === name) result = ev.payload.compartment;
  });
  const unsubError = host.bus.on(HOST.COMPARTMENT_ERROR, ev => {
    if (ev.payload.operation === 'stop') errorData = ev.payload;
  });

  host.bus.emit('host:compartment:stop', {
    name,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubStopped();
  unsubError();

  if (errorData) {
    const err = new Error(errorData.reason);
    error(`  Error: ${err.message}`);
    throw err;
  }

  if (!result) throw new Error(`stop: gate did not produce a result for "${name}"`);

  log(`  ◌ Stopped: ${result.name}  [${result.id}]`);

  return result;
}

module.exports = { stopCompartment };
