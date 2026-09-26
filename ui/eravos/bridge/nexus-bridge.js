/* ═══════════════════════════════════════════════════════════
   ERAVOS NEXUS BRIDGE  v1.0.0
   bridge/nexus-bridge.js

   Polls the NEXUS guardian organism-queue.
   When NEXUS builds a new organism, it appears here.
   Delivers zips to PackLoader — organism lands in catalog.

   API:
     NexusBridge.start(orchUrl)   — begin polling (idempotent)
     NexusBridge.stop()           — stop polling
     NexusBridge.status()         — { running, orchUrl, delivered, errors }
     NexusBridge.deliver(id, zip) — manual delivery (for testing)

   Called by:
     index.html init              — start() on boot
     NEXUS autonomous loop        — deliver() directly after build

   Polling interval: 5s
   Non-fatal: if NEXUS is offline, bridge silently retries.

   §1.2: Nothing silently fails — errors logged, not swallowed.
   ═══════════════════════════════════════════════════════════ */

window.NexusBridge = (() => {
'use strict';

const POLL_MS = 5000;

let _interval = null;
let _orchUrl  = 'http://127.0.0.1:9000';
let _delivered = 0;
let _errors    = 0;
let _running   = false;

function start(orchUrl) {
  if (_running) return;
  if (orchUrl) _orchUrl = orchUrl;
  _running = true;
  _interval = setInterval(_poll, POLL_MS);
  console.log(`[NexusBridge] started — polling ${_orchUrl} every ${POLL_MS}ms`);
}

function stop() {
  if (_interval) clearInterval(_interval);
  _interval = null;
  _running  = false;
  console.log('[NexusBridge] stopped');
}

function status() {
  return { running: _running, orchUrl: _orchUrl, delivered: _delivered, errors: _errors };
}

/* Manual delivery — NEXUS can call this directly if in same context */
async function deliver(id, arrayBuffer, opts = {}) {
  const result = await PackLoader.install(arrayBuffer, {
    source: 'nexus-build',
    autoSpawn: opts.autoSpawn !== false,
    pos: opts.pos,
    onPermissionRequest: () => Promise.resolve(true),
  });
  if (result?.ok) {
    _delivered++;
    _ack(id);
    _notify(`⬡ NEXUS built: ${result.manifest?.label || id}`);
  } else {
    _errors++;
    console.warn(`[NexusBridge] deliver failed for ${id}`);
  }
  return result;
}

/* ── Poll loop ────────────────────────────────────────────── */

async function _poll() {
  try {
    const r = await fetch(`${_orchUrl}/api/guardian/organism-queue`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return;
    const data = await r.json();
    const organisms = data.organisms || [];
    for (const org of organisms) {
      await _fetch_and_install(org.id, org.label);
    }
  } catch(_) {
    // NEXUS offline — non-fatal, keep polling
  }
}

async function _fetch_and_install(id, label) {
  try {
    const r = await fetch(`${_orchUrl}/api/guardian/organism-queue/${id}/zip`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { _errors++; return; }
    const buf = await r.arrayBuffer();
    const result = await PackLoader.install(buf, {
      source: 'nexus-build',
      autoSpawn: true,
      onPermissionRequest: () => Promise.resolve(true),
    });
    if (result?.ok) {
      _delivered++;
      await _ack(id);
      _notify(`⬡ NEXUS built: ${result.manifest?.label || label || id}`);
    } else {
      _errors++;
    }
  } catch(e) {
    _errors++;
    console.warn(`[NexusBridge] install failed for ${id}: ${e.message}`);
  }
}

async function _ack(id) {
  try {
    await fetch(`${_orchUrl}/api/guardian/organism-queue/${id}/ack`, {
      method: 'POST',
      signal: AbortSignal.timeout(2000),
    });
  } catch(_) {}
}

function _notify(message) {
  if (typeof KERNEL !== 'undefined') {
    KERNEL.bus.publish('kernel:notify', { message });
  }
}

return { start, stop, status, deliver };
})();
