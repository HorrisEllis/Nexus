'use strict';
// ── COBALT CORE ───────────────────────────────────────────────────────────────
// foundation/cobalt-core.js
// UUID: cobalt-core-0000-4000-0000-000000000001
//
// Air gapped. Self-contained. Zero external deps.
// The center of the web. All nodes connect through it.
// Nodes never talk to each other directly — only through the event bus.
//
//   BUS      — the event bus. One way in, propagates out.
//   LEDGER   — append-only log. Deduped by content hash.
//   WATCHDOG — continuous listener. Detects silence.
//   REGISTRY — every node that connects registers here.
//
// §C1: Sealed. Do not modify after sealing.
// Ported from cobalt-core.js + cobalt-kernel.js to fully self-contained CJS.

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Content hash for ledger dedup ────────────────────────────────────────────
function contentHash(type, payload) {
  const sig = type + ':' + JSON.stringify(payload ?? {}).slice(0, 200);
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}

// ── EVENT BUS (minimal, in-memory) ───────────────────────────────────────────
// Pattern-matching subscribe. ** = all events. module.name = exact.
class CobaltBus {
  constructor() {
    this._subs    = []; // { pattern, fn }
    this._ringBuf = []; // debug ring buffer — last 10k events
    this._ringMax = 10000;
    this._tick    = 0;
  }

  on(pattern, fn) {
    this._subs.push({ pattern, fn });
    return this;
  }

  off(pattern, fn) {
    this._subs = this._subs.filter(s => !(s.pattern === pattern && s.fn === fn));
  }

  ingest(type, payload = {}, opts = {}) {
    const ev = Object.freeze({
      type,
      payload,
      source:   opts.source   || 'unknown',
      causedBy: opts.causedBy || null,
      tick:     this._tick++,
      ts:       Date.now(),
    });

    // Ring buffer
    this._ringBuf.push(ev);
    if (this._ringBuf.length > this._ringMax) this._ringBuf.shift();

    // Dispatch
    for (const { pattern, fn } of this._subs) {
      try {
        if (pattern === '**' || pattern === type) fn(ev);
      } catch (e) {
        console.error(`[CobaltBus] subscriber error (${pattern}):`, e.message);
      }
    }

    return ev;
  }

  ring(n = 100) {
    return this._ringBuf.slice(-n);
  }

  get stats() {
    return { tick: this._tick, subs: this._subs.length, ringSize: this._ringBuf.length };
  }
}

// ── LEDGER ────────────────────────────────────────────────────────────────────
class CobaltLedger {
  constructor({ dataDir = './data/cobalt', name = 'truth' } = {}) {
    this._name    = name;
    this._dataDir = dataDir;
    this._file    = path.join(dataDir, `ledger.${name}.jsonl`);
    this._seen    = new Map(); // hash → count
    this._count   = 0;
    this._ready   = false;
    this._fd      = null;
  }

  open() {
    fs.mkdirSync(this._dataDir, { recursive: true });

    if (fs.existsSync(this._file)) {
      const lines = fs.readFileSync(this._file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.hash) {
            this._seen.set(entry.hash, (this._seen.get(entry.hash) || 0) + 1);
            this._count++;
          }
        } catch {}
      }
    }

    this._fd    = fs.createWriteStream(this._file, { flags: 'a' });
    this._ready = true;
    return this;
  }

  record(type, payload, meta = {}) {
    if (!this._ready) return { isNew: false, count: 0, hash: null };

    const hash  = contentHash(type, payload);
    const prior = this._seen.get(hash) || 0;
    const count = prior + 1;
    this._seen.set(hash, count);
    this._count++;

    if (prior === 0) {
      const entry = { hash, type, payload, meta, count: 1, first: Date.now() };
      try { this._fd.write(JSON.stringify(entry) + '\n'); } catch {}
      return { isNew: true, count: 1, hash };
    }

    return { isNew: false, count, hash };
  }

  get stats() {
    return {
      name:   this._name,
      unique: this._seen.size,
      total:  this._count,
      file:   this._file,
    };
  }
}

// ── REGISTRY ──────────────────────────────────────────────────────────────────
class CobaltRegistry {
  constructor() {
    this._nodes = new Map();
  }

  register({ uuid, name, type, version = '0.0.0', meta = {} }) {
    if (!uuid) throw new Error('[CobaltRegistry] uuid required');

    if (this._nodes.has(uuid)) {
      const node = this._nodes.get(uuid);
      node.status      = 'connected';
      node.connectedAt = Date.now();
      node.reconnects  = (node.reconnects || 0) + 1;
      return node;
    }

    const node = {
      uuid, name, type, version, meta,
      status:      'connected',
      connectedAt: Date.now(),
      lastSeen:    Date.now(),
      reconnects:  0,
      eventCount:  0,
    };
    this._nodes.set(uuid, node);
    return node;
  }

  heartbeat(uuid) {
    const node = this._nodes.get(uuid);
    if (!node) return false;
    node.lastSeen = Date.now();
    node.eventCount++;
    return true;
  }

  disconnect(uuid, reason = 'explicit') {
    const node = this._nodes.get(uuid);
    if (!node) return;
    node.status       = 'disconnected';
    node.disconnectReason = reason;
  }

  get(uuid)  { return this._nodes.get(uuid) || null; }
  list(filter) {
    const all = [...this._nodes.values()];
    return filter ? all.filter(filter) : all;
  }

  get stats() {
    const all = [...this._nodes.values()];
    return {
      total:        all.length,
      connected:    all.filter(n => n.status === 'connected').length,
      disconnected: all.filter(n => n.status === 'disconnected').length,
      byType:       all.reduce((a, n) => { a[n.type] = (a[n.type] || 0) + 1; return a; }, {}),
    };
  }
}

// ── WATCHDOG ──────────────────────────────────────────────────────────────────
class CobaltWatchdog {
  constructor({ registry, bus, silenceMs = 30000 } = {}) {
    this._registry  = registry;
    this._bus       = bus;
    this._silenceMs = silenceMs;
    this._timers    = new Map();
  }

  watch(uuid) {
    this._resetTimer(uuid);
  }

  _resetTimer(uuid) {
    if (this._timers.has(uuid)) clearTimeout(this._timers.get(uuid));
    const t = setTimeout(() => {
      const node = this._registry.get(uuid);
      if (!node || node.status === 'disconnected') return;
      this._bus.ingest('cobalt.watchdog.silence', {
        uuid,
        name:      node.name,
        silenceMs: this._silenceMs,
        lastSeen:  node.lastSeen,
      }, { source: 'cobalt-watchdog' });
    }, this._silenceMs);
    this._timers.set(uuid, t);
  }

  unwatch(uuid) {
    if (this._timers.has(uuid)) {
      clearTimeout(this._timers.get(uuid));
      this._timers.delete(uuid);
    }
  }

  get watching() { return [...this._timers.keys()]; }
}

// ── COBALT CORE ───────────────────────────────────────────────────────────────
class CobaltCore {
  constructor(opts = {}) {
    this.uuid     = 'cobalt-core-0000-4000-0000-000000000001';
    this.version  = '1.0.0';
    this._opts    = opts;

    this.bus      = new CobaltBus();
    this.ledger   = new CobaltLedger({ dataDir: opts.dataDir || './data/cobalt', name: 'truth' });
    this.ideas    = new CobaltLedger({ dataDir: opts.dataDir || './data/cobalt', name: 'idea' });
    this.registry = new CobaltRegistry();
    this.watchdog = new CobaltWatchdog({
      registry:  this.registry,
      bus:       this.bus,
      silenceMs: opts.silenceMs || 30000,
    });

    this._ready   = false;
  }

  open() {
    if (this._ready) return this;

    this.ledger.open();
    this.ideas.open();

    // Wire bus → ledger
    this.bus.on('**', (ev) => {
      if (ev.source && ev.source !== 'cobalt-core' && ev.source !== 'unknown') {
        this.watchdog.watch(ev.source);
        this.registry.heartbeat(ev.source);
      }
      const { isNew, count } = this.ledger.record(ev.type, ev.payload, {
        source:   ev.source,
        causedBy: ev.causedBy,
        tick:     ev.tick,
      });
      if (!isNew && count % 10 === 0) {
        this.bus.ingest('cobalt.ledger.frequency', { type: ev.type, count, tick: ev.tick }, { source: 'cobalt-core' });
      }
    });

    this._ready = true;

    this.bus.ingest('cobalt.core.ready', {
      uuid:     this.uuid,
      version:  this.version,
      ledger:   this.ledger.stats,
      ideas:    this.ideas.stats,
      registry: this.registry.stats,
    }, { source: 'cobalt-core' });

    return this;
  }

  // Connect a node — returns air-gapped interface
  connect({ uuid, name, type = 'node', version = '0.0.0', meta = {} } = {}) {
    const node = this.registry.register({ uuid, name, type, version, meta });
    this.watchdog.watch(uuid);

    const bus = this.bus;

    return Object.freeze({
      uuid,
      name,

      emit: (type, payload = {}, opts = {}) => {
        this.registry.heartbeat(uuid);
        return bus.ingest(type, payload, { ...opts, source: uuid });
      },

      on:   (pattern, fn) => bus.on(pattern, fn),
      off:  (pattern, fn) => bus.off(pattern, fn),

      idea: (type, payload = {}) => {
        this.ideas.record(type, payload, { source: uuid });
        return bus.ingest('cobalt.idea', { type, payload, source: uuid }, { source: uuid });
      },

      disconnect: (reason) => {
        this.watchdog.unwatch(uuid);
        this.registry.disconnect(uuid, reason);
      },
    });
  }

  // Load a full project from cobalt schema
  load(schema) {
    const {
      uuid, name, version = '0.0.0',
      intent, intentMap,
      lattice  = {},
      heartbeat = {},
      apiCalls  = [],
    } = schema;

    if (!uuid || !name || !intent) throw new Error('[CobaltCore.load] uuid, name, intent required');

    const node = this.connect({
      uuid, name,
      type:    lattice.layer || 'node',
      version,
      meta:    { intent, intentMap },
    });

    const reg = this.registry.get(uuid);
    if (reg) { reg.intent = intent; reg.intentMap = intentMap || null; }

    if (heartbeat.intervalMs !== 0) {
      const hbMs = heartbeat.intervalMs || 8000;
      const hbCh = heartbeat.channel    || 'cobalt.heartbeat';
      setInterval(() => {
        node.emit(hbCh, { uuid, name, intent, latticeLayer: lattice.layer, ts: Date.now() });
      }, hbMs).unref();
    }

    const api = {};
    for (const call of apiCalls) {
      api[call.id] = async (payload = {}) => {
        const callId = `api-${uuid.slice(0, 8)}-${call.id}-${Date.now().toString(36)}`;
        node.emit('cobalt.api.call', {
          callId, callDecl: call.id, target: call.target,
          intent: call.intent, endpoint: call.endpoint || null,
          sourceUuid: uuid, sourceName: name, ts: Date.now(), payload,
        });
        this.ledger.record('cobalt.api.call', { callId, callDecl: call.id, target: call.target }, { source: uuid });
        return { callId };
      };
    }

    return { node, api };
  }

  get stats() {
    return {
      uuid:     this.uuid,
      version:  this.version,
      ready:    this._ready,
      bus:      this.bus.stats,
      ledger:   this.ledger.stats,
      ideas:    this.ideas.stats,
      registry: this.registry.stats,
      watchdog: { watching: this.watchdog.watching.length },
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const core = new CobaltCore();

module.exports = { CobaltCore, CobaltBus, CobaltLedger, CobaltRegistry, CobaltWatchdog, core };
