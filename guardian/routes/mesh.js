'use strict';
// guardian/routes/mesh.js — routes for the mesh subsystem (mesh/install.js).
// UUID: nexus-guardian-route-mesh-v1-0000-4700-0000-000000000003
//
// Rebuilt from BrainOS's nexus-bridge-modules.js's own handle() (v1.0.0),
// which used to run as a standalone bridge server's raw-http route table.
// Same real dispatch logic, translated to guardian's proven
// handle(req, res, ctx) -> boolean route contract (the one settings.js,
// autonomous-loop.js already use) instead of BrainOS's own
// (req, res, parts, method, u) -> true|null|Promise shape.
//
// Routes (all under /mesh/*, matching BrainOS's /snr, /keys, /hosts,
// /ports, /canvas, /crypto, /modules, just namespaced under mesh/ so
// they don't collide with any existing guardian route):
//   /mesh/snr/*      — SNR Filter        (mesh/lib/mesh-snr-filter.js)
//   /mesh/keys/*     — Key Manager       (mesh/lib/key-manager.js)
//   /mesh/hosts/*    — Host Rotation     (mesh/lib/host-rotation.js)
//   /mesh/ports/*    — Port Registry     (mesh/lib/port-registry.js)
//   /mesh/canvas/*   — Canvas Persistence(mesh/lib/canvas-persistence.js)
//   /mesh/crypto/*   — Crypto Engine health
//   /mesh/modules     — combined status of every mesh module

const mesh = require('../../mesh/install.js');

function handle(req, res, ctx) {
  const { method, url, pRes, bodyJ } = ctx;

  if (!url.pathname.startsWith('/mesh/') && url.pathname !== '/mesh') return false;
  if (!mesh.installed) return false; // mesh not wired at boot — fall through, don't 500

  const parts = url.pathname.slice('/mesh/'.length).split('/').filter(Boolean);
  const first = parts[0];

  // Every mesh module exposes bridgeRoute(parts, method, body, req) — same
  // real per-module contract BrainOS's bridge already used, unchanged.
  const run = async () => {
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
      ? await bodyJ(req).catch(() => ({}))
      : null;

    if (first === 'snr' && mesh.snr) return mesh.snr.bridgeRoute(parts.slice(1), method, body, req);
    if (first === 'keys' && mesh.keys) return mesh.keys.bridgeRoute(parts.slice(1), method, body, req);
    if (first === 'hosts' && mesh.hosts) return mesh.hosts.bridgeRoute(parts.slice(1), method, body, req);
    if (first === 'ports' && mesh.ports) return mesh.ports.bridgeRoute(parts.slice(1), method, body, req);

    if (first === 'canvas' && mesh.canvas) {
      // Canvas persistence writes its own response (same as BrainOS's
      // original — it needs raw res access for streaming reads/writes).
      const canvasParts = parts.slice(1);
      const handled = await mesh.canvas.handle(req, res, canvasParts, method, url);
      return handled === true ? undefined /* already responded */ : null;
    }

    if (first === 'crypto') {
      if (!mesh.engine) return { ok: false, error: 'crypto-engine not loaded' };
      if (parts[1] === 'health' || !parts[1]) return mesh.engine.health();
      return null;
    }

    if (first === 'modules' || !first) {
      return {
        ok: true,
        modules: {
          snr:    mesh.snr    ? { ok: true, rules: mesh.snr.size, ...mesh.snr.stats() }   : { ok: false },
          keys:   mesh.keys   ? { ok: true, ...mesh.keys.stats() }                         : { ok: false },
          hosts:  mesh.hosts  ? { ok: true, ...mesh.hosts.stats() }                        : { ok: false },
          ports:  mesh.ports  ? { ok: true, ...mesh.ports.stats() }                        : { ok: false },
          engine: mesh.engine ? { ok: true, ...mesh.engine.health() }                      : { ok: false },
          canvas: mesh.canvas ? { ok: true, ...mesh.canvas.watchdog() }                    : { ok: false },
        },
      };
    }

    return null;
  };

  run().then(result => {
    if (result === undefined) return; // canvas branch already wrote the response
    if (result === null) { pRes(res, 404, { ok: false, error: `no mesh route for /mesh/${parts.join('/')}` }); return; }
    pRes(res, 200, result);
  }).catch(err => {
    pRes(res, 500, { ok: false, error: err.message });
  });

  return true;
}

module.exports = { handle };
