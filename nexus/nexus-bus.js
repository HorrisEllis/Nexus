'use strict';
/**
 * nexus-bus.js — Unified Event Multiplex
 * UUID: nexus-bus-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * THE COMMON EVENT FABRIC.
 *
 * Every system emits to nexus-bus. nexus-bus fans out to all subscribers.
 * No system needs to know who else is listening.
 *
 * Architecture:
 *   Any system                 nexus-bus
 *   ──────────                 ─────────
 *   cortex.gap.found ────────► all subscribers see it simultaneously
 *   guardian.job.complete ───► cortex, architect, idearium, cfr, versionium
 *   architect.snr.flagged ───► healer, idearium, diagnostic
 *
 * §5.2  Everything implements the bridge — bus is the bridge in software
 * §1.2  Nothing silently fails — emit errors are caught and logged
 * §SEAM Growth happens at the seam — the bus IS the seam
 *
 * Usage:
 *   const bus = require('./nexus-bus');
 *   bus.emit('cortex.gap.found', { gapId, severity, path });
 *   bus.on('guardian.job.complete', handler);
 *   bus.on('*', handler); // all events
 */

const { EventEmitter } = require('events');
const http = require('http');

// ── In-memory pub/sub ─────────────────────────────────────────────────────────

class NexusBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this._history   = [];       // last 1000 events
    this._maxHist   = 1000;
    this._sseClients = new Set(); // HTTP SSE clients for /nexus-bus/sse
    this._sources   = new Map(); // systemId → { emitCount, lastSeen }
    // CFR field influence — set by cfr-influence module
    this._cfrField  = null;
    this._sigmaFloor = 0;        // raised by CFR when tension is high
  }

  // ── emit — fan out to all listeners ────────────────────────────────────────
  emit(type, payload = {}, meta = {}) {
    const event = {
      type,
      payload,
      source:    meta.source   ?? payload?._source ?? 'unknown',
      causedBy:  meta.causedBy ?? payload?._causedBy ?? null,
      ts:        Date.now(),
      id:        _uid(),
    };

    // History ring
    this._history.push(event);
    if (this._history.length > this._maxHist) this._history.shift();

    // Track source stats
    const src = event.source;
    const stats = this._sources.get(src) || { emitCount: 0, lastSeen: 0 };
    stats.emitCount++;
    stats.lastSeen = event.ts;
    this._sources.set(src, stats);

    // EventEmitter fan-out (specific type + wildcard)
    try { super.emit(type, event); } catch(e) { _log('emit.type.error', type, e); }
    try { super.emit('*', event); }  catch(e) { _log('emit.star.error', type, e); }

    // Push to SSE clients
    if (this._sseClients.size > 0) {
      const raw = 'data: ' + JSON.stringify(event) + '\n\n';
      for (const res of this._sseClients) {
        try { res.write(raw); } catch(_) { this._sseClients.delete(res); }
      }
    }

    // CFR influence: if tension is high, add sigma floor to outgoing events
    if (this._cfrField && this._sigmaFloor > 0) {
      event._sigmaFloor = this._sigmaFloor;
    }

    return event;
  }

  // ── subscribe ─────────────────────────────────────────────────────────────
  on(type, fn) {
    return super.on(type, fn);
  }

  once(type, fn) {
    return super.once(type, fn);
  }

  // ── SSE endpoint handler ──────────────────────────────────────────────────
  // Mount this as: server.on('request', (req,res) => { if (url==='/nexus-bus/sse') bus.handleSSE(req,res); });
  handleSSE(req, res) {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: {"type":"nexus-bus.connected","ts":' + Date.now() + '}\n\n');

    // Replay last 50 events for new subscribers
    const replay = this._history.slice(-50);
    for (const ev of replay) {
      try { res.write('data: ' + JSON.stringify(ev) + '\n\n'); } catch(_) {}
    }

    this._sseClients.add(res);
    req.on('close', () => this._sseClients.delete(res));

    // Heartbeat
    const hb = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch(_) { clearInterval(hb); }
    }, 15000);
    req.on('close', () => clearInterval(hb));
  }

  // ── history / query ───────────────────────────────────────────────────────
  history(n = 100) { return this._history.slice(-n); }
  recent(type, n = 20) {
    return this._history.filter(e => e.type === type || type === '*').slice(-n);
  }
  stats() {
    return {
      historySize: this._history.length,
      sseClients:  this._sseClients.size,
      sources:     Object.fromEntries(this._sources),
      listeners:   this.eventNames().length,
    };
  }

  // ── CFR influence ─────────────────────────────────────────────────────────
  setCFRField(field) { this._cfrField = field; }
  setSigmaFloor(v)   { this._sigmaFloor = Math.max(0, Math.min(1, v)); }

  // ── Cross-service relay ───────────────────────────────────────────────────
  // Post an event to a remote service's /api/event endpoint
  relay(port, type, payload, source = 'nexus-bus') {
    const body = JSON.stringify({ type, payload: { ...payload, _source: source }, source, ts: Date.now() });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/event',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, () => {});
    req.on('error', () => {});
    req.write(body); req.end();
  }

  // ── Broadcast to all known services ──────────────────────────────────────
  broadcast(type, payload, exclude = []) {
    const PORTS = { cortex:3748, guardian:7820, idearium:4800, architect:3747, orchestrator:9000 };
    for (const [sys, port] of Object.entries(PORTS)) {
      if (!exclude.includes(sys)) this.relay(port, type, { ...payload, _broadcast: true });
    }
  }
}

function _uid() {
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function _log(type, name, err) {
  // §1.2: never silently fail — log to stderr
  process.stderr.write(`[nexus-bus] §1.2 ${type}: ${name} — ${err?.message}\n`);
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const bus = new NexusBus();

// ── Built-in routing rules ────────────────────────────────────────────────────
// These make the bus a living router, not just a pub/sub.

// Gap → healer escalation: when any system reports a gap, fan out to idearium
bus.on('*.gap.*', ev => {
  if (ev.type?.includes('.gap.found') || ev.type?.includes('.gap.opened')) {
    // Relay to idearium for awareness
    bus.relay(4800, 'nexus.gap.detected', {
      gapId:    ev.payload?.id || ev.payload?.uuid,
      type:     ev.payload?.type,
      severity: ev.payload?.severity,
      source:   ev.source,
    });
  }
});

// SNR flag → diagnostic escalation
bus.on('architect.snr.flagged', ev => {
  bus.relay(7820, 'architect.snr.flagged', ev.payload);
});

// System booted → orchestrator registration ping
bus.on('*.booted', ev => {
  bus.relay(9000, 'nexus-bus.system.booted', { source: ev.source, ts: ev.ts });
});

module.exports = bus;
