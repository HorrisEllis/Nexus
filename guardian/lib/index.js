'use strict';
/**
 * guardian/lib/index.js — wires the decomposed components together.
 * comp_id: nexus.guardian.lib.index
 * UUID: nexus-guardian-lib-index-v1-0000-2026-0902-001
 *
 * Load order matters and didn't in the monolith (function hoisting hid
 * it): jobs.js has no dependency on the others, so it goes first.
 * provider-routing.js needs jobs.js's updateJob. dispatcher.js needs
 * both jobs.js's updateJob and provider-routing.js's _dispatchToMistral,
 * plus bus/ncp/pendingQueue/cockpitBroadcast which are still server.js's
 * own — this file does NOT create those, server.js must pass them in,
 * same as it always did.
 *
 * What this file does NOT wire, honestly: the NCP protocol handler
 * (_handleNCPMessage, server.js 850–1381 — this is where dispatch-pool-
 * bridge.js's completion events actually originate), queue-flush/seam
 * chunking, artifact extraction, self-probe, RAID feedback, and the
 * ~1650-line handleExtendedRoutes route dispatcher are all still inline
 * in server.js. See MANIFEST.md for the real, current state of each.
 *
 * §RECONCILED 2026-09-02, before wiring: this package was decompiled
 * from a server.js snapshot that predated the same-day deepseek addition
 * (server.js's own "§ADDED 2026-09-02 — James: 'I want deepseek added as
 * an agent'" comment). provider-routing.js and dispatcher.js were
 * checked against the actual current server.js and patched to carry
 * deepseek routing through (KNOWN_PROVIDERS/PROVIDER_ALIASES,
 * _dispatchToDeepseek, the dispatcher branch, provUrls) before this was
 * wired in — wiring the stale version would have silently dropped it.
 */

const { createJobStore } = require('./jobs');
const { createProviderRouter } = require('./provider-routing');
const { createDispatcher } = require('./dispatcher');
const wireDispatchPoolRelease = require('./dispatch-pool-bridge');

/**
 * wireGuardianCore({ bus, ncp, pendingQueue, cockpitBroadcast, NEXUS_URL, postEvent })
 * → { jobs, createJob, updateJob, _suggestJobHat, _findActiveJobForProvider,
 *     chooseProvider, normaliseProvider, parseCommand,
 *     dispatchJob, pool }
 *
 * `bus`, `ncp`, `pendingQueue`, `cockpitBroadcast` are still server.js's —
 * this file does not create a bus or an NCP server, those stay owned by
 * server.js's boot sequence exactly as before.
 */
function wireGuardianCore({ bus, ncp, pendingQueue, cockpitBroadcast, NEXUS_URL, postEvent, ladder, completeFromMesh, chatFor, answerFirst, erosType, completeWith, economy }) {
  for (const [name, v] of Object.entries({ bus, ncp, pendingQueue, cockpitBroadcast, NEXUS_URL })) {
    if (!v) throw new Error(`[guardian/lib] wireGuardianCore missing required dependency: ${name}`);
  }

  const jobStore = createJobStore();

  const providerRouter = createProviderRouter({
    updateJob: jobStore.updateJob, bus, NEXUS_URL, postEvent,
  });

  const dispatcher = createDispatcher({
    updateJob: jobStore.updateJob, bus, ncp, pendingQueue, cockpitBroadcast,
    dispatchToMistral: providerRouter._dispatchToMistral,
    dispatchToDeepseek: providerRouter._dispatchToDeepseek,
    ladder, completeFromMesh, chatFor, answerFirst, erosType, completeWith,   // 0.39.265 — late-bound, see server.js
    economy,   // 0.39.281 — guardian/lib/economy-guard.js (optional)
  });

  wireDispatchPoolRelease(bus, dispatcher.pool); // the leak fix — every completion path frees its slot now

  return {
    ...jobStore,
    ...providerRouter,
    dispatchJob: dispatcher.dispatchJob,
    pool: dispatcher.pool,
  };
}

module.exports = { wireGuardianCore };
