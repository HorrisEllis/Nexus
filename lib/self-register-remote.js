'use strict';
/**
 * lib/self-register-remote.js — cross-process self-registration
 * UUID: nexus-lib-self-register-remote-v1-0000-2026-0916-001
 * Version: 1.0.0
 *
 * §RAID-FIX 2026-09-16 — James: "raid also needs to stop failing, i dont
 * think its using the agent mesh, router, ncp, or the job dispatcher."
 *
 * lib/self-register.js's registerSelf() calls component-registry.js's
 * register() directly, in-process — correct for intelligence/index.js
 * (required straight into cortex's own process), useless for anything
 * that boots as its own OS process: guardian, copilot (NCP), clear-glass
 * (agent-mesh + its driver/router), orchestrator — each has its own real
 * `server.listen()`, so a bare require('lib/component-registry') from any
 * of them gets a fresh, never-initialized registry instance that cortex's
 * RAID router (cortex/boot.js's router.init) never sees. Every one of
 * those four systems' capabilities has been invisible to RAID's resolver
 * since router.js existed — not a routing bug, a missing announcement.
 *
 * This is the client half of cortex/boot.js's new
 * POST /api/components/register-batch — same real register()/
 * registerBatch() intelligence already goes through, just reached over
 * HTTP instead of require(). Uses lib/self-register.js's own
 * buildComponents() for the component shape, so the two paths can never
 * drift out of sync with each other.
 *
 * Honest-degrade, matching every other cross-process call this codebase
 * makes at boot (clear-glass's _ledgerWrite, _reportCompartmentDomEvent,
 * etc.): cortex being down at boot time must never crash the caller —
 * this resolves { ok:false, error } instead of throwing, and the caller
 * decides whether that's worth a console.warn.
 */

const http = require('http');
const { buildComponents } = require('./self-register.js');

const MODULE_ID = 'lib/self-register-remote';
const VERSION = '1.0.0';

/**
 * registerSelfRemote(namespace, capabilities, opts) — same contract as
 * registerSelf(), but POSTs to cortex's real HTTP registration endpoint
 * instead of calling component-registry.js directly. Returns a Promise
 * (the one real difference from registerSelf's synchronous return — an
 * HTTP round-trip cannot be synchronous).
 *
 * @param {string} namespace
 * @param {Array}  capabilities — same shape registerSelf() takes
 * @param {object} opts — { registeredBy?, version?, cortexHost?, cortexPort?, timeoutMs? }
 * @returns {Promise<{ ok, registered, failed, results, error? }>}
 */
function registerSelfRemote(namespace, capabilities, opts = {}) {
  if (!namespace || typeof namespace !== 'string') {
    return Promise.resolve({ ok: false, error: 'namespace required', registered: 0, failed: 0, results: [] });
  }
  if (!Array.isArray(capabilities) || !capabilities.length) {
    return Promise.resolve({ ok: false, error: 'capabilities must be a non-empty array', registered: 0, failed: 0, results: [] });
  }

  const { components, errors: buildErrors } = buildComponents(namespace, capabilities, opts);
  if (!components.length) {
    return Promise.resolve({ ok: false, error: 'no valid capabilities after building', registered: 0, failed: buildErrors.length, results: buildErrors });
  }

  const host = opts.cortexHost || process.env.NEXUS_HOST || '127.0.0.1';
  const port = parseInt(opts.cortexPort || process.env.NEXUS_PORT || '3748', 10);
  const timeoutMs = opts.timeoutMs || 5000;

  return new Promise((resolve) => {
    const body = JSON.stringify({ components });
    const req = http.request({
      hostname: host, port, path: '/api/components/register-batch', method: 'POST',
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            ok: !!parsed.ok,
            registered: parsed.registered || 0,
            failed: (parsed.failed || 0) + buildErrors.length,
            results: [...buildErrors, ...(parsed.results || [])],
          });
        } catch (e) {
          resolve({ ok: false, error: `cortex returned an unparseable response: ${e.message}`, registered: 0, failed: components.length, results: [] });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ ok: false, error: `cortex unreachable on ${host}:${port}: ${e.code || e.message}`, registered: 0, failed: components.length, results: [] });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: `cortex registration timed out after ${timeoutMs}ms`, registered: 0, failed: components.length, results: [] });
    });
    req.write(body);
    req.end();
  });
}

module.exports = { MODULE_ID, VERSION, registerSelfRemote };
