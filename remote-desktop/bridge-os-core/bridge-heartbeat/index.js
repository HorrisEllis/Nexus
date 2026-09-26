// Copyright (c) 2026 James Brooks. All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
'use strict';
/**
 * bridge-heartbeat/index.js  v2.0.0
 * UUID: guardian-heartbeat-v2-0-0
 *
 * Pulse. Every node proves it's alive by beating. Silence = dead.
 *
 *   - UDP pulse broadcast on LAN :7777 (peer discovery)
 *   - HTTP health poll every N ms (liveness)
 *   - BPM tracking from inter-beat intervals
 *   - Health score: consistency × latency_grade
 *   - 3 missed beats → node:degraded
 *   - 10 missed beats → node:dead
 *
 * §5.7 — All output via busEmit callback only. Zero external deps.
 * §1.2 — Every missed beat is logged. Nothing silent.
 * §2.3 — getStatus() / listNodes() expose all state for observation.
 *
 * DRIFT NOTES (v1 → v2):
 *   - Event names: node:degraded / node:dead preserved (boot.js lines 331-332)
 *   - _uuid alias preserved in all payloads (boot.js: d._uuid||d.uuid)
 *   - checkHealth: URL parse now in try/catch (was crash on bad URL in v1)
 *   - PulseEmitter: optional sign() callback added for signed pulses
 *   - Exports: identical to v1
 */

const dgram  = require('dgram');
const http   = require('http');
const https  = require('https');

const DEFAULTS = {
  pulsePort:     7777,
  pulseInterval: 5000,
  healthTimeout: 3000,
  degradeAt:     3,
  deadAt:        10,
  bpmWindow:     10,
};

// ── BPM tracker ───────────────────────────────────────────────────────────────

function createBPMTracker(windowSize = 10) {
  const intervals = [];
  let lastBeatTs  = null;

  function beat() {
    const now = Date.now();
    if (lastBeatTs !== null) {
      intervals.push(now - lastBeatTs);
      if (intervals.length > windowSize) intervals.shift();
    }
    lastBeatTs = now;
    return bpm();
  }

  function bpm() {
    if (!intervals.length) return 0;
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return avg > 0 ? Math.round(60000 / avg) : 0;
  }

  function consistency() {
    if (intervals.length < 2) return 1.0;
    const avg      = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length;
    return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / Math.max(avg, 1)));
  }

  return { beat, bpm, consistency, intervals: () => [...intervals] };
}

// ── Latency grade (0–1) ───────────────────────────────────────────────────────

function latencyGrade(ms) {
  if (ms <= 50)   return 1.0;
  if (ms <= 150)  return 0.8;
  if (ms <= 500)  return 0.5;
  if (ms <= 1500) return 0.2;
  return 0.0;
}

// ── HTTP health check ─────────────────────────────────────────────────────────

function checkHealth(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0     = Date.now();
    const client = url.startsWith('https') ? https : http;

    let parsed;
    try { parsed = new URL(url); }
    catch (_) { resolve({ ok: false, latency: 0, error: 'invalid url' }); return; }

    const req = client.get({
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname || '/health',
      timeout:  timeoutMs,
    }, (res) => {
      const latency = Date.now() - t0;
      resolve({ ok: res.statusCode === 200, status: res.statusCode, latency });
      res.resume();
    });

    req.on('error',   ()  => resolve({ ok: false, latency: Date.now() - t0 }));
    req.on('timeout', ()  => { req.destroy(); resolve({ ok: false, latency: timeoutMs }); });
  });
}

// ── HeartbeatManager ──────────────────────────────────────────────────────────

function createHeartbeatManager({ cfg = {}, busEmit = null, nodeRegistry = null } = {}) {
  const config = { ...DEFAULTS, ...cfg };
  const _nodes = new Map();

  function _emit(type, payload, level = 'INFO') {
    if (!busEmit) return;
    try { busEmit(type, payload, level); }
    catch (e) { console.error(`[heartbeat] busEmit failed (${type}):`, e.message); }
  }

  function register(uuid, healthUrl) {
    if (_nodes.has(uuid)) return;
    _nodes.set(uuid, {
      uuid,
      healthUrl,
      bpmTracker:    createBPMTracker(config.bpmWindow),
      missedBeats:   0,
      lastLatencyMs: null,
      healthScore:   1.0,
      timer:         null,
    });
    _startMonitor(uuid);
    if (process.env.NEXUS_LOG === 'DEBUG') process.stderr.write(`[heartbeat] registered: ${uuid.slice(0, 12)}... -> ${healthUrl}\n`);
  }

  function unregister(uuid) {
    const n = _nodes.get(uuid);
    if (n?.timer) clearInterval(n.timer);
    _nodes.delete(uuid);
  }

  function _startMonitor(uuid) {
    const node = _nodes.get(uuid);
    if (!node) return;

    node.timer = setInterval(async () => {
      const { ok, latency } = await checkHealth(node.healthUrl, config.healthTimeout);
      node.lastLatencyMs = latency;

      if (ok) {
        const bpm  = node.bpmTracker.beat();
        const cons = node.bpmTracker.consistency();
        const lgrd = latencyGrade(latency);

        node.healthScore = cons * lgrd;
        node.missedBeats = 0;

        nodeRegistry?.seen(uuid);

        // _uuid alias: boot.js reads d._uuid||d.uuid (line 331-332)
        _emit('heartbeat:pulse', {
          _uuid:       uuid,
          uuid,
          bpm,
          latency,
          healthScore: node.healthScore,
          consistency: cons,
        }, 'DEBUG');

      } else {
        node.missedBeats++;
        nodeRegistry?.missedBeat(uuid, { degradeAt: config.degradeAt, deadAt: config.deadAt });

        if (node.missedBeats === config.degradeAt) {
          process.stderr.write(`  ⚠  heartbeat   ${uuid.slice(0, 12)}... degraded (${node.missedBeats} missed)\n`);
          // node:degraded — boot.js bus.on('node:degraded') line 332
          _emit('node:degraded', {
            _uuid:       uuid,
            uuid,
            missedBeats: node.missedBeats,
          }, 'WARN');
        }

        if (node.missedBeats >= config.deadAt) {
          process.stderr.write(`  ✗  heartbeat   ${uuid.slice(0, 12)}... dead (${node.missedBeats} missed)\n`);
          // §5.7 — signal only. boot.js bus.on('node:dead') -> nodeRegistry.evict() line 331
          // node:dead — boot.js bus.on('node:dead') line 331
          _emit('node:dead', {
            _uuid:       uuid,
            uuid,
            missedBeats: node.missedBeats,
            reason:      'missed_beats',
          }, 'ERROR');
          unregister(uuid);
        }
      }
    }, config.pulseInterval);
  }

  function getStatus(uuid) {
    const n = _nodes.get(uuid);
    if (!n) return null;
    return {
      uuid,
      bpm:         n.bpmTracker.bpm(),
      consistency: n.bpmTracker.consistency(),
      missedBeats: n.missedBeats,
      latency:     n.lastLatencyMs,
      healthScore: n.healthScore,
      healthUrl:   n.healthUrl,
    };
  }

  function listNodes() {
    return [..._nodes.keys()].map(getStatus);
  }

  return { register, unregister, getStatus, listNodes };
}

// ── PulseEmitter — UDP broadcast on LAN ──────────────────────────────────────
//
// LAN Trust Invariant: UDP pulse != trust increase.
// A node discovered via LAN still requires full signed handshake.
// Proximity is not a credential.

function createPulseEmitter({ uuid, publicKeyB64 = null, groupHint = null, port = DEFAULTS.pulsePort, sign = null } = {}) {
  let _socket   = null;
  let _interval = null;

  function start(intervalMs = DEFAULTS.pulseInterval) {
    _socket = dgram.createSocket('udp4');
    _socket.bind(() => {
      _socket.setBroadcast(true);
      _interval = setInterval(_pulse, intervalMs);
      _pulse();
    });
    _socket.on('error', (e) => {
      if (!e.message.includes('EADDRINUSE'))
        console.error('[heartbeat] UDP emitter error:', e.message);
    });
  }

  async function _pulse() {
    if (!_socket) return;
    const ts  = Date.now();
    const msg = { type: 'nexus:pulse', uuid, publicKey: publicKeyB64, groupHint, ts, sig: null };
    if (sign) {
      try { msg.sig = await sign(String(ts)); } catch (_) {}
    }
    const buf = Buffer.from(JSON.stringify(msg));
    _socket.send(buf, 0, buf.length, port, '255.255.255.255', () => {});
  }

  function stop() {
    clearInterval(_interval);
    _socket?.close();
    _socket = null;
  }

  return { start, stop };
}

// ── PulseListener — hear LAN pulses ──────────────────────────────────────────

function createPulseListener({ port = DEFAULTS.pulsePort, onPulse } = {}) {
  let _socket = null;

  function start() {
    _socket = dgram.createSocket('udp4');
    _socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type !== 'nexus:pulse') return;
        onPulse?.({ ...data, address: rinfo.address });
      } catch (_) {}
    });
    _socket.on('error', () => {});
    _socket.bind(port);
  }

  function stop() {
    _socket?.close();
    _socket = null;
  }

  return { start, stop };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createHeartbeatManager,
  createPulseEmitter,
  createPulseListener,
  createBPMTracker,
  checkHealth,
  latencyGrade,
};
