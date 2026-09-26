'use strict';
/**
 * src/plugins/permission-adapter.js — permission-filter ↔ Electron wiring
 * UUID: cg-plugin-permission-adapter-v1-0000-0000-000000000005
 *
 * §HONEST LIMIT — traced against Electron's real, documented
 * session.setPermissionRequestHandler API (webContents, permission,
 * callback, details) => callback(granted: boolean). Same
 * session.fromPartition(partition) access pattern already proven in
 * providers/host.js and reused for webrequest-adapter.js. This sandbox
 * has no Electron runtime — not live-run, same caveat as every other
 * adapter this session built.
 *
 * §FAIL-CLOSED, NOT FAIL-OPEN — the one deliberate difference from
 * webrequest-adapter.js's own pattern. An ad-request filter that hangs
 * should still let the page load (fail-open is correct there — see that
 * file's own comment). A permission request (camera, mic, geolocation)
 * that hangs should default to DENIED, not granted — the security-
 * conservative default, and the correct one: nothing here should ever
 * grant camera/mic access just because a plugin was slow to answer.
 */

const { randomUUID } = require('crypto');

/**
 * attachPermissionFilters(session, bus, { signatures, timeoutMs = 3000 })
 * Same shape as webrequest-adapter's attachContentFilters: any registered
 * plugin denying wins immediately; ALL must explicitly allow for a grant.
 * No filters registered at all -> deny by default (see main/index.js's
 * wiring: this adapter is only attached when getSignaturesForType returns
 * at least one signature, matching content-filter's own guard).
 */
function attachPermissionFilters(session, bus, { signatures, agentId = 'default', timeoutMs = 3000 } = {}) {
  if (!session?.setPermissionRequestHandler) {
    throw new Error('[permission-adapter] session.setPermissionRequestHandler is required — not a real Electron Session?');
  }
  if (!Array.isArray(signatures) || signatures.length === 0) {
    throw new Error('[permission-adapter] at least one permission-filter signature is required');
  }

  const { Event } = require('../core/bus.js');

  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestId = randomUUID();
    let settled = false;
    let seenCount = 0;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      callback(false); // §fail-closed — see file header. A slow/hung plugin never grants access.
    }, timeoutMs);

    const unsub = bus.on('permission:decision', (event) => {
      if (event.data.requestId !== requestId || settled) return;
      seenCount++;
      if (event.data.allow === false) {
        settled = true;
        clearTimeout(timer);
        unsub();
        callback(false);
        return;
      }
      if (seenCount >= signatures.length) {
        // Every registered filter explicitly allowed — and none denied
        // (checked above, per-event, as each response arrives).
        settled = true;
        clearTimeout(timer);
        unsub();
        callback(true);
      }
    });

    for (const sig of signatures) {
      bus.emit(new Event(sig, {
        requestId, permission, agentId,
        requestingUrl: details?.requestingUrl || webContents?.getURL?.() || null,
        isMainFrame: details?.isMainFrame !== false,
        mediaTypes: details?.mediaTypes || null,
      }));
    }
  });

  return () => {}; // Electron has no per-listener removal for setPermissionRequestHandler — same honest scope note as webrequest-adapter.js.
}

module.exports = { attachPermissionFilters };
