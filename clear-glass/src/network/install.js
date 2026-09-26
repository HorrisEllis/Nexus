'use strict';
// clear-glass/src/network/install.js — wires the network subsystem's one
// remaining real module: pulse-registry.
// UUID: cg-network-install-v1-0000-2026-0903-001
//
// §RETIRED 2026-09-06 — James: "DNS/firewall/crypto/host-rotation is
// redundant and should be deleted." Confirmed before deleting anything:
// grepped every real caller of the network subsystem across the whole
// tree. Two real, genuinely distinct things lived here — (1) the DNS/
// firewall/crypto-engine/key-manager/host-rotation/port-registry/canvas-
// persistence/reverse-proxy/ddns infrastructure, confirmed to have zero
// real callers anywhere outside this file's own wiring (archived to
// _archive/2026-09-06-brainos-network-infra-retired/, not deleted
// outright, per §0.3), and (2) pulse-registry.js — a genuinely separate,
// load-bearing module: src/mesh/agent-mesh.js's real listNodes()/
// listMeshView()/_startNodePulse() read this in-process, and it emits
// real mesh.node.status_changed/mesh.nodes.snapshot SSE events. Deleting
// the whole folder would have silently broken agent-mesh's own real,
// working node-pulse feature — kept, wired exactly as before, everything
// else genuinely gone.

const path = require('path');
const { Event } = require('../core/bus');

let _pulse     = null;
let _installed = false;
let _bus       = () => {};

function loadModule(name, modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    console.error(`[network/install] Failed to load ${name}: ${e.message}`);
    return null;
  }
}

// ─── INSTALL ────────────────────────────────────────────────────────────────
// install(bus, opts?) — bus is clear-glass's real Stream instance (its
// .emit(Event) is what pulse-registry's connectBus() gets bound to).
// Requires a real Event instance per clear-glass's Stream.emit() contract
// (siso/index.js's own §1.2) — same real fix already established here
// before this retirement, unchanged.
function install(bus, opts = {}) {
  if (_installed) return module.exports;
  _installed = true;
  _bus = (type, data, level) => { try { bus.emit(new Event(`network.${type}`, { ...data, level })); } catch (_) {} };

  // ── Pulse Registry (node handshake/heartbeat/liveness — BrainOS's real
  //    mesh mechanic, see network/pulse-registry.js) — the real, direct
  //    consumer is src/mesh/agent-mesh.js's node-pulse tracking; it reads
  //    this in-process (same Electron main process) rather than polling
  //    over HTTP. ─────────────────────────────────────────────────────────────
  const { PulseRegistry } = loadModule('pulse-registry', path.join(__dirname, 'pulse-registry.js')) || {};
  if (PulseRegistry) {
    _pulse = new PulseRegistry({ name: 'Network Pulse Registry' });
    _pulse.connectBus(_bus);
    // clear-glass registers itself as the first live node on its own
    // registry, so /network/pulse/nodes is never empty on a healthy
    // boot — matches BrainOS's "every node hand-shakes" model.
    const selfId = `clearglass-${require('crypto').randomBytes(4).toString('hex')}`;
    const { token } = _pulse.handshake({ instanceId: selfId, logicalId: 'clearglass', meta: { role: 'clearglass', pid: process.pid } });
    setInterval(() => { try { _pulse.heartbeat({ instanceId: selfId, token }); } catch (_) {} }, 5000).unref?.();
  }

  bus.emit(new Event('network.ready', { pulse: !!_pulse }));

  return module.exports;
}

module.exports = {
  install,
  get pulse()  { return _pulse;  },
  get installed() { return _installed; },
  VERSION: '2.0.0',
  UUID:    'cg-network-install-v1-0000-2026-0903-001',
};
