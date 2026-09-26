'use strict';
// orchestrator/event-taxonomy.js — ET4_orchestrator_autopilot_event_taxonomy.
// Conforms to lib/event-taxonomy-pattern.js's real ET1 shape.
//
// §CORRECTED against the phasemap's own summary — same discipline
// already applied to ET2, not assumed accurate just because it's
// written down. The phase claimed "gap.found and resource.pressure
// already exist as real bus events [from orchestrator/autopilot],
// confirmed by grep." Checked directly: both are real events, but
// neither originates from orchestrator or autopilot — gap.found is
// service/nexus-diagnostic.js's own broadcast (confirmed by a comment
// in orchestrator.js itself naming diagnostic as the source), and
// nexus.resource.pressure comes from a separate resource-monitor
// module; orchestrator only subscribes to it (nexusBus.on(...)) and
// relays it onward to cortex. Neither belongs in a taxonomy file
// scoped to what orchestrator/autopilot themselves emit.

module.exports = Object.freeze({
  // ── Real, already-governed bus events ──────────────────────────────────────
  SYSTEM_CONTRACT_VERIFIED: {
    description: "A system's real contract (route/hash) was checked against orchestrator's expectation and verified to match.",
    payloadShape: ['systemId', 'trust', 'hash', 'routeCount'],
    severity: 'info',
  },
  ORCHESTRATOR_SYSTEM_ONLINE: {
    description: "The watchdog's real health check found a previously-offline system responding again.",
    payloadShape: ['type', 'systemId', 'online', 'ms', 'ts'],
    severity: 'notable',
  },
  ORCHESTRATOR_SYSTEM_OFFLINE: {
    description: "The watchdog's real health check found a previously-online system no longer responding.",
    payloadShape: ['type', 'systemId', 'online', 'ms', 'ts'],
    severity: 'warning',
  },

  // ── §HONEST GAP — real, confirmed-happening events with no real bus
  //    emission yet, only console+file logging via autopilot.js's own
  //    _log() helper (checked directly: console.log + fs.appendFileSync,
  //    no bus.emit anywhere in it). These genuinely need real
  //    instrumentation added, not just a taxonomy entry describing
  //    something that can't be queried — a bigger, separate, more
  //    invasive change to autopilot's real boot-supervision code than
  //    this taxonomy pass makes on its own:
  //      - "[kernel] phase N gate passed" (autopilot.js) - a supervised
  //        kernel's boot phase gate succeeded.
  //      - "[kernel] stable for 60s — backoff reset" (autopilot.js) - a
  //        kernel ran long enough that its real crash-loop backoff timer
  //        reset to base.
  //      - "contract.unreachable" - referenced only in a comment
  //        (autopilot.js:181) describing what a contract poller logs;
  //        no real emission found anywhere by grep.
});
