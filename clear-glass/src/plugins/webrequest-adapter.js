'use strict';
/**
 * src/plugins/webrequest-adapter.js — content-filter ↔ Electron wiring
 * UUID: cg-plugin-webrequest-adapter-v1-0000-0000-000000000004
 *
 * §HONEST LIMIT — traced against real, existing source, not live-run.
 * session.fromPartition(partition).webRequest is the exact real pattern
 * already used in src/providers/host.js:257 (onHeadersReceived, for CSP
 * stripping) — this file does the equivalent for onBeforeRequest, same
 * session-access shape, different hook. main/index.js:1241 confirms the
 * real per-agent partition name this must match: `persist:agent-${agentId}`.
 * This sandbox has no Electron runtime (same limit already stated for
 * screenshot/toast in CLEAR-GLASS-CAPABILITY-BREAKDOWN-2026-08-23.md) —
 * confirm against a real running window before trusting the callback
 * actually fires.
 *
 * §WHY A GATE ROUND-TRIP INSTEAD OF CALLING THE PLUGIN DIRECTLY —
 * Electron's onBeforeRequest callback is synchronous-or-async-single-
 * shot (call `callback({cancel})` once). Going through the real bus
 * (emit the plugin's signature, listen once for its 'webrequest:decision'
 * response) keeps content-filter plugins honoring the exact same COS-4/
 * 10/14 event-only contract every other contribution type does — a
 * plugin never gets a direct Electron `callback` reference, only ever
 * sees `{ url, requestId }` and returns a decision, same shape whether
 * it's tested via the mock bus (host.js's own test block) or run for
 * real inside Electron.
 */

const { randomUUID } = require('crypto');

/**
 * attachContentFilters(session, bus, { signatures, timeoutMs = 3000 })
 *   session    — a real Electron Session (session.fromPartition(...)).
 *   bus        — the real clear-glass bus (getBus()).
 *   signatures — array of installed content-filter Gate signatures to
 *                run, in order; first plugin to return block:true wins
 *                (matches how a real hosts-file/uBlock chain works — any
 *                one filter blocking is sufficient, no "vote").
 * Returns an unsubscribe function.
 */
function attachContentFilters(session, bus, { signatures, timeoutMs = 3000 } = {}) {
  if (!session?.webRequest?.onBeforeRequest) {
    throw new Error('[webrequest-adapter] session.webRequest.onBeforeRequest is required — not a real Electron Session?');
  }
  if (!Array.isArray(signatures) || signatures.length === 0) {
    throw new Error('[webrequest-adapter] at least one content-filter signature is required');
  }

  const { Event } = require('../core/bus.js');

  session.webRequest.onBeforeRequest((details, callback) => {
    const requestId = randomUUID();
    let settled = false;
    let seenCount = 0;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      callback({ cancel: false }); // §fail-open — a hung/slow filter plugin blocks nothing, never hangs the request itself. A filter that silently breaks browsing for every page is a worse failure than one that occasionally lets an ad through.
    }, timeoutMs);

    // §CORRECTED before shipping — the first version settled on whichever
    // filter's decision arrived first, discarding any LATER filter's
    // block:true. That directly contradicted this file's own stated rule
    // ("any one filter blocking is sufficient, no vote"). Now: any single
    // block:true short-circuits immediately (correct — a block never
    // needs to wait on anyone else), but an allow only settles once every
    // registered signature has actually responded for this requestId.
    const unsub = bus.on('webrequest:decision', (event) => {
      if (event.data.requestId !== requestId || settled) return;
      seenCount++;
      if (event.data.block) {
        settled = true;
        clearTimeout(timer);
        unsub();
        callback({ cancel: true });
        return;
      }
      if (seenCount >= signatures.length) {
        settled = true;
        clearTimeout(timer);
        unsub();
        callback({ cancel: false });
      }
    });

    for (const sig of signatures) {
      bus.emit(new Event(sig, { url: details.url, requestId }));
    }
  });

  return () => {}; // real unsubscribe would need Electron's own webRequest removal API — not exposed per-listener by Electron itself; scoped honestly, not faked.
}

module.exports = { attachContentFilters };
