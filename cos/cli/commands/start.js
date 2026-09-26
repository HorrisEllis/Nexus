/**
 * cli/commands/start.js
 * COMPARTMENT OS — cos start <name>
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Dispatches via SISO gate pipeline:
 *   emit('host:compartment:start') → StartCompartmentGate → emit('host:compartment:started')
 *
 * Hook: hk-h-003
 * Event: host:compartment:started
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');

function startCompartment(host, name, out = {}) {
  const log   = out.log   || ((...a) => console.log(...a));
  const error = out.error || ((...a) => console.error(...a));

  if (!name) throw new Error('start: name is required');

  let result    = null;
  let errorData = null;

  const unsubStarted = host.bus.on(HOST.COMPARTMENT_STARTED, ev => {
    if (ev.payload.name === name) result = ev.payload.compartment;
  });
  const unsubError = host.bus.on(HOST.COMPARTMENT_ERROR, ev => {
    if (ev.payload.operation === 'start') errorData = ev.payload;
  });

  host.bus.emit('host:compartment:start', {
    name,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubStarted();
  unsubError();

  if (errorData) {
    const err = new Error(errorData.reason);
    error(`  Error: ${err.message}`);
    throw err;
  }

  if (!result) throw new Error(`start: gate did not produce a result for "${name}"`);

  log(`  ● Started: ${result.name}  [${result.id}]`);
  log(`    Note: process spawn requires compartment kernel (Phase 4)`);

  return result;
}

module.exports = { startCompartment };
