'use strict';
/**
 * cortex/heartbeat/index.js — System Heartbeat + API Pulse
 * UUID: nexus-heartbeat-v1-0000-4000-0000-000000000001
 * Version: 2.0.0
 *
 * Two-tier liveness monitoring:
 *
 * TIER 1 — HEARTBEAT (every 10s)
 *   HTTP probe each system's /health endpoint.
 *   Updates project_registry.online / lastSeenAt.
 *   Gap-finder reads this to detect stale systems.
 *
 * TIER 2 — API PULSE (every 30s)
 *   Probes a representative API endpoint per system — not just /health.
 *   This proves the system is SERVING, not just alive.
 *   A process can pass /health and still have broken routes.
 *   Pulse failures → gap.found (type: api_degraded, severity: high)
 *
 * TIER 3 — TELEMETRY FRAME (every 60s)
 *   Feeds system health metrics into TelemetryRuntime.
 *   Emits heartbeat.frame with composite health score + drift signals.
 *   ALK perception runs on this to classify system state.
 *
 * §M1: init(cfg) + stop()
 * §1.2: every failure emits — never silent
 */

const http = require('http');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'heartbeat';
const VERSION   = '2.0.0';

// ── System definitions ─────────────────────────────────────────────────────────
// Each system: health probe + at least one API probe
const SYSTEMS = [
  {
    name: 'orchestrator', port: 9000,
    health: '/health',
    apis: [
      { path: '/api/status', label: 'status' },
      { path: '/api/trust',  label: 'trust'  },
    ],
  },
  {
    name: 'cortex', port: 3748,
    health: '/health',
    apis: [
      { path: '/api/events?n=1',       label: 'events'   },
      { path: '/api/self-heal/status', label: 'self-heal' },
    ],
  },
  {
    name: 'guardian', port: 7820,
    health: '/health',
    apis: [
      { path: '/jobs?limit=1',    label: 'jobs'      },
      { path: '/artifacts?limit=1', label: 'artifacts' },
    ],
  },
  {
    name: 'idearium', port: 4800,
    health: '/health',
    apis: [
      { path: '/api/stats',  label: 'stats' },
      { path: '/api/ideas?limit=1', label: 'ideas' },
    ],
  },
  {
    name: 'bridge', port: 9999,
    health: '/health',
    apis: [
      { path: '/bridge/contract', label: 'contract' },
    ],
  },
  {
    name: 'architect', port: 3747,
    health: '/api/health',
    apis: [
      { path: '/api/contract', label: 'contract' },
    ],
  },
  {
    name: 'emerge', port: 4242,
    health: '/health',
    apis: [
      { path: '/api/emerge/status', label: 'status', via: 9000 },  // via orchestrator proxy
    ],
  },
  {
    name: 'diagnostic', port: 7825,
    health: '/status',
    apis: [
      { path: '/tension', label: 'tension' },
    ],
  },
];

let _interval    = null;
let _apiInterval = null;
let _telInterval = null;
let _cfg         = {};
let _seenAt      = {};
let _apiStatus   = {};     // systemName → { label: { ok, latencyMs, lastAt } }
let _telRuntime  = null;   // TelemetryRuntime instance
let _alkKernel   = null;   // ALKPerceptionKernel instance

// ── HTTP probe ────────────────────────────────────────────────────────────────
function _probe(port, path, timeoutMs = 2500) {
  return new Promise(resolve => {
    const t0  = Date.now();
    const req = http.get({
      hostname: '127.0.0.1', port, path, timeout: timeoutMs,
    }, res => {
      const ok = res.statusCode < 500;
      resolve({ ok, statusCode: res.statusCode, latencyMs: Date.now() - t0 });
      res.resume(); // drain
    });
    req.on('error',   () => resolve({ ok: false, latencyMs: Date.now() - t0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, latencyMs: timeoutMs }); });
  });
}

// ── Tier 1: heartbeat ─────────────────────────────────────────────────────────
async function _tick() {
  const now = Date.now();
  const snapshot = {};

  for (const system of SYSTEMS) {
    const { ok, latencyMs } = await _probe(system.port, system.health);
    if (ok) _seenAt[system.name] = now;
    snapshot[system.name] = { online: ok, latencyMs };

    const existing = jaaDB.query('project_registry', r => r.name === system.name, 1)[0];
    if (existing) {
      jaaDB.update('project_registry', existing.uuid, {
        lastSeenAt: ok ? now : (existing.lastSeenAt || 0),
        online: ok, port: system.port, latencyMs, ts: now,
      });
    } else {
      jaaDB.insert('project_registry', {
        uuid: uid(), name: system.name, system: system.name,
        port: system.port, online: ok,
        lastSeenAt: ok ? now : 0, latencyMs, ts: now, source: MODULE_ID,
      });
    }
  }

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'heartbeat.tick',
    payload: snapshot,
    source: MODULE_ID, causedBy: null, ts: now,
  });
}

// ── Tier 2: API pulse ─────────────────────────────────────────────────────────
async function _apiPulseTick() {
  const now    = Date.now();
  const pulses = {};

  for (const system of SYSTEMS) {
    if (!system.apis?.length) continue;
    if (!_seenAt[system.name]) continue; // don't probe if health is already failing

    const apiResults = {};
    for (const api of system.apis) {
      const port = api.via || system.port;
      const { ok, latencyMs } = await _probe(port, api.path, 3000);
      apiResults[api.label] = { ok, latencyMs, ts: now };

      // Only emit gap if system was previously healthy — avoids boot-time noise
      if (!ok && _seenAt[system.name] && (now - _seenAt[system.name]) > 20000) {
        jaaDB.insert('gaps', {
          uuid:     uid(),
          type:     'api_degraded',
          path:     `${system.name}/${api.label}`,
          body:     `${system.name} ${api.label} API probe failed (${system.port}${api.path})`,
          severity: 'high',
          status:   'open',
          source:   MODULE_ID,
          ts:       now,
        });
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'heartbeat.api.degraded',
          payload: { system: system.name, api: api.label, port, path: api.path },
          source: MODULE_ID, causedBy: null, ts: now,
        });
      }
    }

    _apiStatus[system.name] = apiResults;
    pulses[system.name] = apiResults;
  }

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'heartbeat.pulse',
    payload: pulses,
    source: MODULE_ID, causedBy: null, ts: now,
  });
}

// ── Tier 3: telemetry frame ───────────────────────────────────────────────────
async function _telemetryTick() {
  try {
    const meta = require('../../lib/meta');

    // Lazy init
    if (!_telRuntime) {
      const { TelemetryRuntime } = meta.telemetry;
      _telRuntime = new TelemetryRuntime({ serviceId: 'nexus' });
    }
    if (!_alkKernel) {
      const { ALKPerceptionKernel } = meta.alk;
      _alkKernel = new ALKPerceptionKernel();
    }

    // Feed system health into telemetry runtime
    const onlineCount = SYSTEMS.filter(s => _seenAt[s.name] && Date.now() - _seenAt[s.name] < 15000).length;
    const apiHealthy  = Object.values(_apiStatus).flatMap(s => Object.values(s)).filter(a => a.ok).length;
    const apiTotal    = Object.values(_apiStatus).flatMap(s => Object.values(s)).length;

    _telRuntime.observe('systems_online',   onlineCount / SYSTEMS.length);
    _telRuntime.observe('api_health',       apiTotal > 0 ? apiHealthy / apiTotal : 1);

    // Pull live gap and friction data
    try {
      const gaps      = jaaDB.query('gaps', r => r.status === 'open' && r.type !== 'DELTA.TENSION', 50);
      const artifacts = jaaDB.query('artifacts', () => true, 20);
      _telRuntime.observe('gap_rate',       Math.min(1, gaps.length / 10));
      _telRuntime.observe('artifact_count', Math.min(1, artifacts.length / 20));
    } catch(_) {}

    const frame = _telRuntime.tick();

    // ALK perception
    const alkInput = {
      gapCount:      frame.snapshot?.gap_rate ? Math.round(frame.snapshot.gap_rate * 10) : 0,
      friction:      1 - (frame.snapshot?.systems_online || 1),
      coherence:     frame.snapshot?.systems_online || 1,
      tension:       frame.health < 0.4 ? 1.8 : 0.5,
      systemsOnline: onlineCount,
      systemsTotal:  SYSTEMS.length,
      artifactRate:  frame.snapshot?.artifact_count || 0,
      dispatchCount: 0,
    };
    const perception = _alkKernel.feed(alkInput);

    jaaDB.insert('event_log', {
      uuid: uid(), type: 'heartbeat.frame',
      payload: {
        health:    frame.health,
        slope:     frame.slope?.direction,
        drift:     frame.drift?.cluster ? 'cluster' : 'none',
        signals:   frame.drift?.signals?.length || 0,
        state:     perception.dominant?.state || 'UNKNOWN',
        onlineCount, apiHealthy, apiTotal,
      },
      source: MODULE_ID, causedBy: null, ts: Date.now(),
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] telemetry tick failed: ${e.message}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  const pollMs    = cfg.pollMs    || 10_000;   // heartbeat: 10s
  const apiPollMs = cfg.apiPollMs || 30_000;   // API pulse: 30s
  const telPollMs = cfg.telPollMs || 60_000;   // telemetry: 60s

  if (_interval)    clearInterval(_interval);
  if (_apiInterval) clearInterval(_apiInterval);
  if (_telInterval) clearInterval(_telInterval);

  // Stagger starts to avoid thundering herd on boot
  _tick();
  _interval = setInterval(_tick, pollMs);
  _interval.unref?.();

  setTimeout(() => {
    _apiPulseTick();
    _apiInterval = setInterval(_apiPulseTick, apiPollMs);
    _apiInterval.unref?.();
  }, 5000); // wait 5s after boot before first API pulse

  setTimeout(() => {
    _telemetryTick();
    _telInterval = setInterval(_telemetryTick, telPollMs);
    _telInterval.unref?.();
  }, 15000); // wait 15s before first telemetry frame

  console.log(`[${MODULE_ID}] v${VERSION} — heartbeat:${pollMs}ms api-pulse:${apiPollMs}ms telemetry:${telPollMs}ms`);
}

function stop() {
  if (_interval)    clearInterval(_interval);
  if (_apiInterval) clearInterval(_apiInterval);
  if (_telInterval) clearInterval(_telInterval);
  _interval = _apiInterval = _telInterval = null;
}

function getApiStatus() { return { ..._apiStatus }; }
function getSeenAt()    { return { ..._seenAt };    }

module.exports = { init, stop, getApiStatus, getSeenAt, SYSTEMS, MODULE_ID, VERSION };
