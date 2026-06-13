'use strict';
// ── cortex/heartbeat/index.js ─────────────────────────────────────────────────
// UUID: nexus-heartbeat-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// System heartbeat. Does two things every tick:
//
// 1. REGISTER: upserts project_registry rows for every known system.
//    gap-finder watches project_registry. Without rows here, it never fires.
//
// 2. PROBE: HTTP health check each system port.
//    Updates lastSeenAt if alive — gap-finder uses this to detect stale systems.
//
// §M1: init(cfg) + stop()
// §M2: writes: project_registry, event_log

const http = require('http');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'heartbeat';
const VERSION   = '1.0.0';

const SYSTEMS = [
  { name: 'orchestrator', port: 9000, path: '/health' },
  { name: 'cortex',       port: 3748, path: '/health' },
  { name: 'guardian',     port: 7820, path: '/health' },
  { name: 'idearium',     port: 4800, path: '/health' },
  { name: 'emerge',       port: 4242, path: '/health' },
  // §MONITOR-05: added bridge, architect, diagnostic
  { name: 'bridge',       port: 9999, path: '/health' },
  { name: 'architect',    port: 3747, path: '/api/health' },
  { name: 'diagnostic',   port: 7825, path: '/status' },
];

let _interval = null;
let _cfg      = {};
let _seenAt   = {};

function _probe(system) {
  return new Promise(resolve => {
    const req = http.get({
      hostname: '127.0.0.1', port: system.port,
      path: system.path, timeout: 2000,
    }, res => { resolve(res.statusCode < 500); });
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function _tick() {
  const now = Date.now();
  try {
    for (const system of SYSTEMS) {
      const alive = await _probe(system);
      if (alive) _seenAt[system.name] = now;

      const existing = jaaDB.query('project_registry', r => r.name === system.name, 1)[0];
      if (existing) {
        jaaDB.update('project_registry', existing.uuid, {
          lastSeenAt: alive ? now : (existing.lastSeenAt || 0),
          online: alive, port: system.port, ts: now,
        });
      } else {
        jaaDB.insert('project_registry', {
          uuid: uid(), name: system.name, system: system.name,
          port: system.port, online: alive,
          lastSeenAt: alive ? now : 0, ts: now, source: MODULE_ID,
        });
      }
    }

    jaaDB.insert('event_log', {
      uuid: uid(), type: 'heartbeat.tick',
      payload: Object.fromEntries(SYSTEMS.map(s => [s.name, {
        online: !!(alive => alive)(_seenAt[s.name] && now - _seenAt[s.name] < 15_000),
        lastSeenAgo: _seenAt[s.name]
          ? Math.round((now - _seenAt[s.name]) / 1000) + 's' : 'never',
      }])),
      source: MODULE_ID, causedBy: null, ts: now,
    });
  } catch (err) {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack?.slice(0, 500), ts: Date.now(),
    });
  }
}

function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 10_000);
  _interval.unref();
  _tick().catch(() => {}); // fire immediately
  console.log(`[${MODULE_ID}] v${VERSION} — ${SYSTEMS.length} systems every ${_cfg.pollMs ?? 10_000}ms`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

module.exports = { init, stop, VERSION, MODULE_ID };
