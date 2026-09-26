/**
 * watchdog/actions.js
 * COMPARTMENT OS — Watchdog Anomaly Dispatch
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Maps WatchdogConfig.onAnomaly to a real action. 'snapshot'-prefixed
 * actions are the first real caller of foundation/snapshot.js's
 * SnapshotEngine — it existed, fully built, with zero usages anywhere in
 * the codebase before this.
 */

'use strict';

const { WATCHDOG } = require('../foundation/event-contracts.js');

/**
 * @param {object} host          { store, sysmap, bus }
 * @param {object} compartment
 * @param {string} anomalyType   e.g. 'memory', 'cpu', 'stall', 'crash-loop'
 * @param {string} reason        human-readable detail for the event
 * @returns {{ action: string, snapId: string|null }}
 */
function dispatchAnomaly(host, compartment, anomalyType, reason) {
  const onAnomaly = compartment.watchdog.onAnomaly;
  let snapId = null;

  if (onAnomaly === 'snapshot' || onAnomaly === 'snapshot+restart' || onAnomaly === 'snapshot+stop') {
    const { SnapshotEngine } = require('../foundation/snapshot.js');
    try {
      const engine = new SnapshotEngine(host, compartment);
      const snap = engine.take(`watchdog:${anomalyType}`);
      snapId = snap.id;
    } catch (err) {
      host.bus.emit('watchdog:snapshot:failed', { compartmentId: compartment.id, reason: err.message });
    }
  }

  host.bus.emit(WATCHDOG.ANOMALY_DETECTED, {
    compartmentId: compartment.id, name: compartment.name,
    anomalyType, reason, onAnomaly, snapId,
  });

  if (onAnomaly === 'snapshot+restart') {
    host.bus.emit('comp:process:kill', { compartmentId: compartment.id, name: compartment.name });
    // Restart shortly after kill completes — the kill is async (SIGTERM),
    // give the OS a moment before re-spawning to avoid a port/lock race.
    setTimeout(() => {
      host.bus.emit('host:compartment:start', { name: compartment.name, store: host.store, sysmap: host.sysmap });
    }, 250);
  } else if (onAnomaly === 'snapshot+stop') {
    host.bus.emit('host:compartment:stop', { name: compartment.name, store: host.store, sysmap: host.sysmap });
  }

  return { action: onAnomaly, snapId };
}

module.exports = { dispatchAnomaly };
