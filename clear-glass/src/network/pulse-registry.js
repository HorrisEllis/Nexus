'use strict';
// clear-glass/src/network/pulse-registry.js — node handshake/heartbeat/
// liveness registry.
// UUID: cg-network-pulse-registry-v1-0000-2026-0906-001
//
// This is BrainOS's real mesh mechanic — not its canvas UI, not its
// standalone bridge server, just the actual liveness protocol
// guardian-bridge-api.html documented: POST /handshake to register + get
// a token, POST /heartbeat every 1-2s to refresh it, a node goes idle at
// 15s without a pulse and dead at 30s (both BrainOS's own real
// thresholds, kept as-is). Added now, alongside network/install.js's
// other 6 modules, rather than back when those first moved — this one
// has a real, direct consumer only now that src/mesh/agent-mesh.js (the
// real AM1 agent mesh) tracks node liveness itself; the other 6 modules
// didn't need it to be useful on their own.
//
// Lives under network/ (not mesh/) for the same reason every other
// module here does: this subsystem owns clear-glass's actual
// network-facing surface, and "mesh" is reserved for src/mesh/
// agent-mesh.js's real per-agent contract mesh (see routes.js's own
// header on this exact point).

const crypto = require('crypto');

const IDLE_MS = 15000; // BrainOS's own real threshold
const DEAD_MS = 30000; // BrainOS's own real threshold
const PRUNE_MS = 5 * 60 * 1000; // stop tracking a node 5 min after it goes dead

class PulseRegistry {
  constructor({ name } = {}) {
    this.name = name || 'Network Pulse Registry';
    this._nodes = new Map(); // instanceId -> { instanceId, logicalId, meta, token, firstSeen, lastPulse }
    this._busEmit = () => {};
  }

  connectBus(busEmit) { this._busEmit = busEmit || (() => {}); }

  handshake({ instanceId, logicalId, meta } = {}) {
    if (!instanceId) return { ok: false, error: 'handshake requires instanceId' };
    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const existing = this._nodes.get(instanceId);
    this._nodes.set(instanceId, {
      instanceId,
      logicalId: logicalId || existing?.logicalId || instanceId,
      meta: meta || existing?.meta || {},
      token,
      firstSeen: existing?.firstSeen || now,
      lastPulse: now,
    });
    this._busEmit('pulse.handshake', { instanceId, logicalId: logicalId || instanceId }, 'info');
    return { ok: true, token, ttlMs: IDLE_MS * 4 }; // 60s, matching BrainOS's docs
  }

  heartbeat({ instanceId, token } = {}) {
    const node = this._nodes.get(instanceId);
    if (!node) return { ok: false, error: 'unknown instanceId — handshake first' };
    if (node.token !== token) return { ok: false, error: 'token mismatch' };
    node.lastPulse = Date.now();
    return { ok: true, ttlMs: IDLE_MS * 4 };
  }

  _status(node) {
    const age = Date.now() - node.lastPulse;
    if (age < IDLE_MS) return 'alive';
    if (age < DEAD_MS) return 'idle';
    return 'dead';
  }

  list() {
    this._prune();
    return [...this._nodes.values()].map(n => ({
      instanceId: n.instanceId,
      logicalId:  n.logicalId,
      meta:       n.meta,
      firstSeen:  n.firstSeen,
      lastPulse:  n.lastPulse,
      ageMs:      Date.now() - n.lastPulse,
      status:     this._status(n),
    }));
  }

  stats() { return { nodes: this._nodes.size }; }

  _prune() {
    const now = Date.now();
    for (const [id, n] of this._nodes) {
      if (now - n.lastPulse > PRUNE_MS) this._nodes.delete(id);
    }
  }

  // Same bridgeRoute(parts, method, body, req) contract every other
  // network module exposes — routes.js dispatches /network/pulse/* here
  // unchanged from how it dispatches to snr/keys/hosts/ports.
  bridgeRoute(parts, method, body) {
    if (parts[0] === 'handshake' && method === 'POST') return this.handshake(body || {});
    if (parts[0] === 'heartbeat' && method === 'POST') return this.heartbeat(body || {});
    if (parts[0] === 'nodes' && method === 'GET') return { ok: true, nodes: this.list() };
    return null;
  }
}

module.exports = { PulseRegistry, IDLE_MS, DEAD_MS };
