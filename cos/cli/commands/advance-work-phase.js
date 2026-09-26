/**
 * cli/commands/advance-work-phase.js
 * COMPARTMENT OS — cos advance-work-phase <name> <phase>
 *
 * §MCO04 2026-09-18 — James: "Migrate to cos. Expand cos if needed just
 * make sure you map first." Real, forward-only work-phase advance for a
 * compartment already created via `cos create`. Same real dispatch shape
 * as create.js's createCompartment — the CLI wizard, if one is ever
 * added, would be input only; all logic lives in the gate.
 *
 * Hook: hk-h-001 (compartment lifecycle family)
 * Event: host:compartment:work-phase-advanced
 */

'use strict';

const { HOST } = require('../../foundation/event-contracts.js');
const { WORK_PHASES } = require('../../foundation/types.js');

/**
 * Advance a compartment's real work phase by dispatching through the
 * SISO gate pipeline (same synchronous, depth-first dispatch as
 * createCompartment — the gate runs before emit() returns).
 *
 * @param {object} host      — { store, bus, sysmap }
 * @param {object} config    — { name, nextPhase }
 * @returns {object} the updated compartment
 */
function advanceWorkPhase(host, config) {
  const { name, nextPhase } = config;

  if (!name) throw new Error('advance-work-phase: name is required');
  if (!WORK_PHASES.includes(nextPhase)) {
    throw new Error(`advance-work-phase: nextPhase must be one of ${WORK_PHASES.join(', ')}, got "${nextPhase}"`);
  }

  let result    = null;
  let errorData = null;

  const unsubAdvanced = host.bus.on(HOST.COMPARTMENT_WORK_PHASE_ADVANCED, ev => {
    if (ev.payload.name === name) result = ev.payload.compartment;
  });
  const unsubError = host.bus.on(HOST.COMPARTMENT_ERROR, ev => {
    if (ev.payload.operation === 'advance-work-phase') errorData = ev.payload;
  });

  host.bus.emit('host:compartment:advance-work-phase', {
    name, nextPhase,
    store:  host.store,
    sysmap: host.sysmap,
  });

  unsubAdvanced();
  unsubError();

  if (errorData) throw new Error(errorData.reason);
  if (!result)   throw new Error(`advance-work-phase: gate did not produce a compartment for "${name}"`);

  return result;
}

module.exports = { advanceWorkPhase };
