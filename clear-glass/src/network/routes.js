'use strict';
// clear-glass/src/network/routes.js — routes for the network subsystem
// (network/install.js).
// UUID: cg-network-routes-v1-0000-2026-0903-001
//
// §RETIRED 2026-09-06 — James: "DNS/firewall/crypto/host-rotation is
// redundant and should be deleted." /network/snr, /network/keys,
// /network/hosts, /network/ports, /network/canvas, /network/crypto all
// removed along with the modules they routed to (archived, not deleted
// outright, at _archive/2026-09-06-brainos-network-infra-retired/).
//
// Routes remaining:
//   /network/pulse/*    — Pulse Registry (network/pulse-registry.js) —
//                          the one real, load-bearing module left here,
//                          src/mesh/agent-mesh.js's own real dependency.
//   /network/modules     — trimmed status, pulse only.

const net = require('./install.js');

/**
 * handle(req, res, { method, url, body }) -> boolean (true if handled).
 * `body` is the already-parsed JSON object clear-glass's _wireServer
 * parses once up front for every request (see main/index.js) — passed
 * through here rather than re-read, matching how every other delegated
 * concern in that file already receives it.
 */
function handle(req, res, { method, url, body }) {
  if (!url.pathname.startsWith('/network/') && url.pathname !== '/network') return false;
  if (!net.installed) return false; // network subsystem not wired at boot — fall through, don't 500

  const parts = url.pathname.slice('/network/'.length).split('/').filter(Boolean);
  const first = parts[0];

  const respond = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  const run = async () => {
    // ── /network/pulse/* — node handshake/heartbeat/liveness. src/mesh/
    // agent-mesh.js reads this directly in-process (same Electron main
    // process) for its own node tracking; these HTTP routes exist for
    // any other real process (guardian, a second clear-glass instance)
    // that wants to hand-shake into the same registry from outside. ──────
    if (first === 'pulse' && net.pulse) return net.pulse.bridgeRoute(parts.slice(1), method, body, req);

    if (first === 'modules' || !first) {
      return {
        ok: true,
        modules: {
          pulse: net.pulse ? { ok: true, ...net.pulse.stats() } : { ok: false },
        },
      };
    }

    return null;
  };

  run().then(result => {
    if (result === null) { respond(404, { ok: false, error: `no network route for /network/${parts.join('/')}` }); return; }
    respond(200, result);
  }).catch(err => {
    respond(500, { ok: false, error: err.message });
  });

  return true;
}

module.exports = { handle };
