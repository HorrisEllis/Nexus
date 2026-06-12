'use strict';
/**
 * bridge/registry.js — System Registry
 * UUID: nexus-bridge-registry-v1-0000-4000-0000-000000000001
 *
 * Wraps lib/heartbeat.js HeartbeatManager.
 * Owns the live health map for all NEXUS systems.
 * Provides weight + fallback chains for router.js.
 *
 * SISO pipeline:
 *   system.register   → RegistryAddGate     → system added, health polling started
 *   system.heartbeat  → RegistryHeartbeatGate → score updated, held queue notified
 *   system.query      → RegistryQueryGate   → current health map emitted
 *   system.resolve    → RegistryResolveGate → live target or fallback emitted
 *
 * §1.2  Nothing silently fails.
 * §5.1  Every system has a UUID.
 */

const { randomUUID }           = require('crypto');
const { createHeartbeatManager } = require('../lib/heartbeat');

// ── SISO primitives ───────────────────────────────────────────────────────────
class Event {
  constructor(type, data = {}) {
    this.uuid = randomUUID();
    this.type = type;
    this.data = data;
    this.ts   = Date.now();
  }
}
class Gate {
  constructor(sig) { this.signature = sig; }
  transform() {}
}
class Stream {
  constructor() { this.gates = new Map(); this.pending = []; }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[bridge/registry] signature collision: ${gate.signature}`);
    this.gates.set(gate.signature, gate);
  }
  emit(event) {
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
  }
}

// ── Canonical system definitions ──────────────────────────────────────────────
// weight: 0-1, preference for routing. fallback: ordered list of alternatives.
const SYSTEM_DEFS = {
  orchestrator: { port: parseInt(process.env.ORCHESTRATOR_PORT || '9000'), health: '/health',   weight: 1.0, fallback: [] },
  cortex:       { port: parseInt(process.env.NEXUS_PORT        || '3748'), health: '/health',   weight: 1.0, fallback: ['orchestrator'] },
  guardian:     { port: parseInt(process.env.GUARDIAN_HTTP_PORT|| '7820'), health: '/health',   weight: 1.0, fallback: ['ollama'] },
  idearium:     { port: parseInt(process.env.IDEARIUM_PORT     || '4800'), health: '/health',   weight: 1.0, fallback: [] },
  emerge:       { port: parseInt(process.env.EMERGE_PORT       || '4242'), health: '/status',   weight: 0.8, fallback: [] },
  ollama:       { port: parseInt(process.env.OLLAMA_PORT       || '11434'), health: '/api/tags', weight: 0.7, fallback: [] },
};

const DEGRADED_THRESHOLD = 0.5;
const DEAD_THRESHOLD     = 3;    // missed beats

// ── Gates ─────────────────────────────────────────────────────────────────────

class RegistryAddGate extends Gate {
  constructor(ctx) { super('system.register'); this._ctx = ctx; }
  transform(event, stream) {
    const { systemId, port, meta = {}, resolve } = event.data;
    const def = SYSTEM_DEFS[systemId] || {};
    const entry = {
      systemId,
      uuid:      meta.uuid || `nexus-${systemId}-unknown`,
      port:      port || def.port,
      health:    def.health || '/health',
      weight:    def.weight ?? 1.0,
      fallback:  def.fallback || [],
      status:    'online',
      score:     1.0,
      latency:   null,
      failures:  0,
      lastCheck: Date.now(),
      lastSeen:  Date.now(),
      meta,
    };
    this._ctx._systems.set(systemId, entry);

    // Start heartbeat polling via HeartbeatManager
    const url = `http://127.0.0.1:${entry.port}${entry.health}`;
    this._ctx._heartbeat.register(entry.uuid, url);

    stream.emit(new Event('system.registered', { entry, resolve }));
  }
}

class RegistryRegisteredGate extends Gate {
  constructor() { super('system.registered'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve(event.data.entry);
  }
}

class RegistryHeartbeatGate extends Gate {
  constructor(ctx) { super('system.heartbeat'); this._ctx = ctx; }
  transform(event, stream) {
    const { systemId, score, latency, online, onHeldQueue } = event.data;
    const entry = this._ctx._systems.get(systemId);
    if (!entry) return;

    const wasOffline = entry.status === 'offline';
    entry.score     = score ?? entry.score;
    entry.latency   = latency ?? entry.latency;
    entry.lastCheck = Date.now();

    if (online) {
      entry.failures = 0;
      entry.lastSeen = Date.now();
      entry.status   = score < DEGRADED_THRESHOLD ? 'degraded' : 'online';
    } else {
      entry.failures++;
      if (entry.failures >= DEAD_THRESHOLD) entry.status = 'offline';
      else entry.status = 'degraded';
    }

    this._ctx._systems.set(systemId, entry);

    // If system just came back online, drain its held queue
    if (wasOffline && online && typeof onHeldQueue === 'function') {
      stream.emit(new Event('system.recovered', { systemId, onHeldQueue }));
    }
  }
}

class RegistryRecoveredGate extends Gate {
  constructor() { super('system.recovered'); }
  transform(event) {
    // Router's held-queue drain callback
    event.data.onHeldQueue(event.data.systemId);
  }
}

class RegistryQueryGate extends Gate {
  constructor(ctx) { super('system.query'); this._ctx = ctx; }
  transform(event, stream) {
    const { resolve } = event.data;
    const snapshot = Object.fromEntries(
      [...this._ctx._systems.entries()].map(([id, e]) => [id, { ...e }])
    );
    stream.emit(new Event('system.queried', { snapshot, resolve }));
  }
}

class RegistryQueriedGate extends Gate {
  constructor() { super('system.queried'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve(event.data.snapshot);
  }
}

class RegistryResolveGate extends Gate {
  constructor(ctx) { super('system.resolve'); this._ctx = ctx; }
  transform(event, stream) {
    const { target, routeHistory = [], resolve } = event.data;
    const entry = this._ctx._systems.get(target);

    // Target is live
    if (entry && entry.status !== 'offline') {
      return stream.emit(new Event('system.resolved', { target, entry, resolve }));
    }

    // Target offline — try fallback chain
    const def = SYSTEM_DEFS[target] || {};
    for (const fb of (def.fallback || [])) {
      if (routeHistory.includes(fb)) continue;  // no loops
      const fbEntry = this._ctx._systems.get(fb);
      if (fbEntry && fbEntry.status !== 'offline') {
        return stream.emit(new Event('system.resolved', { target: fb, entry: fbEntry, resolve, fallback: true }));
      }
    }

    // All offline — must hold
    stream.emit(new Event('system.unresolvable', { target, resolve }));
  }
}

class RegistryResolvedGate extends Gate {
  constructor() { super('system.resolved'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve({ ok: true, ...event.data });
  }
}

class RegistryUnresolvableGate extends Gate {
  constructor() { super('system.unresolvable'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve({ ok: false, target: event.data.target });
  }
}

// ── createBridgeRegistry ─────────────────────────────────────────────────────

function createBridgeRegistry({ onHeldQueue } = {}) {
  const _systems = new Map();

  // HeartbeatManager from lib/heartbeat.js
  // busEmit wired back into the registry stream so heartbeat events flow through SISO
  const _heartbeat = createHeartbeatManager({
    cfg: { pulseInterval: 10_000, healthTimeout: 3_000, degradeAt: 3, deadAt: 6 },
    busEmit: (type, data) => {
      if (type === 'heartbeat:pulse') {
        // Find which systemId owns this uuid
        for (const [id, entry] of _systems) {
          if (entry.uuid === data.uuid) {
            stream.emit(new Event('system.heartbeat', {
              systemId: id,
              score:    data.healthScore,
              latency:  data.latency,
              online:   true,
              onHeldQueue,
            }));
            break;
          }
        }
      }
      if (type === 'node:degraded' || type === 'node:dead') {
        for (const [id, entry] of _systems) {
          if (entry.uuid === data.uuid) {
            stream.emit(new Event('system.heartbeat', {
              systemId: id, score: 0, latency: null,
              online: false, onHeldQueue,
            }));
            break;
          }
        }
      }
    },
  });

  const ctx = { _systems, _heartbeat };

  const stream = new Stream();
  stream.register(new RegistryAddGate(ctx));
  stream.register(new RegistryRegisteredGate());
  stream.register(new RegistryHeartbeatGate(ctx));
  stream.register(new RegistryRecoveredGate());
  stream.register(new RegistryQueryGate(ctx));
  stream.register(new RegistryQueriedGate());
  stream.register(new RegistryResolveGate(ctx));
  stream.register(new RegistryResolvedGate());
  stream.register(new RegistryUnresolvableGate());

  // ── Boot: register all known systems ────────────────────────────────────
  function init() {
    for (const [id, def] of Object.entries(SYSTEM_DEFS)) {
      _systems.set(id, {
        systemId: id, uuid: `nexus-${id}-unknown`,
        port: def.port, health: def.health,
        weight: def.weight, fallback: def.fallback,
        status: 'unknown', score: 1.0, latency: null,
        failures: 0, lastCheck: null, lastSeen: null, meta: {},
      });
    }
  }

  function register(systemId, port, meta = {}) {
    return new Promise(resolve => {
      stream.emit(new Event('system.register', { systemId, port, meta, resolve }));
    });
  }

  function resolve(target, routeHistory = []) {
    return new Promise(resolve => {
      stream.emit(new Event('system.resolve', { target, routeHistory, resolve }));
    });
  }

  function snapshot() {
    return new Promise(resolve => {
      stream.emit(new Event('system.query', { resolve }));
    });
  }

  function get(systemId) {
    return _systems.get(systemId) || null;
  }

  return { init, register, resolve, snapshot, get };
}

module.exports = { createBridgeRegistry, SYSTEM_DEFS };
