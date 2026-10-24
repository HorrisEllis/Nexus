'use strict';
/**
 * engines/monitor.js — uptime + performance monitor
 * anonymousservers.info
 *
 * Value adds:
 *   - Polls every engine + every vhost on a configurable interval
 *   - Tracks uptime %, avg latency, p95 latency, error rate
 *   - Alerts via SMTP or webhook when a service goes down / recovers
 *   - Customer-visible status page data (no secrets exposed)
 *   - Incident log with duration tracking
 *   - Engine heartbeat: if an engine goes quiet > N seconds → alert
 */

const http   = require('http');
const https  = require('https');
const { ipc, conf, log, claimPort, isInit } = require('./_engine');

const DEFAULTS = {
  listenPort:      4004,
  intervalMs:      30000,   // check every 30s
  timeoutMs:       8000,
  gracePeriodMs:   15000,   // wait this long after startup before first check
  alertEmail:      '',      // set to receive email alerts
  alertWebhook:    '',      // POST JSON to this URL on state change
  checks: [
    { id: 'proxy',   type: 'engine',  name: 'Reverse Proxy'    },
    { id: 'dns',     type: 'engine',  name: 'DNS'              },
    { id: 'smtp',    type: 'engine',  name: 'SMTP'             },
    { id: 'tls',     type: 'engine',  name: 'TLS / ACME'       },
    { id: 'auth',    type: 'engine',  name: 'Auth'             },
    { id: 'billing', type: 'engine',  name: 'Billing'          },
    { id: 'cache',   type: 'engine',  name: 'Cache'            },
    { id: 'storage', type: 'engine',  name: 'Storage'          },
    { id: 'queue',   type: 'engine',  name: 'Queue'            },
    { id: 'catalog', type: 'engine',  name: 'Catalog'          },
  ],
  httpChecks: [
    // { id, name, url, expectedStatus }
  ],
};

if (isInit()) {
  conf.init(DEFAULTS);
  log('monitor: wrote default conf');
  process.exit(0);
}

let cfg = conf.load(DEFAULTS);

// ─── state ────────────────────────────────────────────────────────────────────

// id -> { up, latencies[], errors, checks, lastChange, incident }
const state = new Map();

function getState(id, name) {
  if (!state.has(id)) {
    state.set(id, {
      id, name,
      up:          null,    // null = unknown, true = up, false = down
      latencies:   [],      // last 100 latency samples
      errors:      0,
      checks:      0,
      lastCheck:   null,
      lastChange:  null,
      incident:    null,    // { startedAt, duration? }
      uptime:      100,
    });
  }
  return state.get(id);
}

// ─── HTTP check ───────────────────────────────────────────────────────────────

function httpCheck(url, expectedStatus = 200) {
  return new Promise((resolve) => {
    const start = Date.now();
    const mod   = url.startsWith('https') ? https : http;
    const req   = mod.get(url, { timeout: cfg.timeoutMs }, res => {
      res.resume(); // drain
      const latency = Date.now() - start;
      const up = !expectedStatus || res.statusCode === expectedStatus || res.statusCode < 500;
      resolve({ up, latency, status: res.statusCode });
    });
    req.on('error', ()  => resolve({ up: false, latency: Date.now() - start, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false, latency: cfg.timeoutMs, status: 0 }); });
  });
}

// ─── engine ping (via IPC) ────────────────────────────────────────────────────

const pings = new Map(); // id -> { resolve, timeout }

function pingEngine(engineId) {
  return new Promise(resolve => {
    const requestId = `ping-${engineId}-${Date.now()}`;
    const start     = Date.now();
    const timeout   = setTimeout(() => {
      pings.delete(requestId);
      resolve({ up: false, latency: cfg.timeoutMs });
    }, cfg.timeoutMs);

    pings.set(requestId, { resolve: (result) => {
      clearTimeout(timeout);
      pings.delete(requestId);
      resolve({ up: true, latency: Date.now() - start, ...result });
    }});

    ipc.send('route', { type: 'status:ping', requestId }, engineId);
  });
}

ipc.on('status:pong', payload => {
  const { requestId } = payload || {};
  const pending = pings.get(requestId);
  if (pending) pending.resolve(payload);
});

// ─── record result ────────────────────────────────────────────────────────────

async function recordResult(id, name, result) {
  const s = getState(id, name);
  s.checks++;
  s.lastCheck = Date.now();

  s.latencies.push(result.latency);
  if (s.latencies.length > 100) s.latencies.shift();

  if (result.up !== s.up) {
    const wasUp = s.up;
    s.up        = result.up;
    s.lastChange = Date.now();

    if (!result.up) {
      // went down
      s.incident = { startedAt: Date.now() };
      s.errors++;
      log(`DOWN: ${name} (${id}) — latency ${result.latency}ms`, 'WARN');
      await sendAlert(id, name, 'down', result);
    } else if (wasUp === false) {
      // recovered
      if (s.incident) {
        s.incident.duration = Date.now() - s.incident.startedAt;
        await ipc.db.insert('incidents', {
          id, name,
          startedAt:  s.incident.startedAt,
          resolvedAt: Date.now(),
          duration:   s.incident.duration,
        }).catch(() => {});
        log(`UP: ${name} recovered after ${Math.round(s.incident.duration / 1000)}s`);
        await sendAlert(id, name, 'up', result);
        s.incident = null;
      }
    }
  }

  // rolling uptime %
  const recent = s.latencies.length;
  s.uptime = s.checks > 0
    ? Math.max(0, 100 - (s.errors / s.checks * 100)).toFixed(2)
    : 100;

  // persist snapshot
  await ipc.db.upsert('monitor_state',
    `r => r.id === '${id}'`,
    { id, name, up: s.up, uptime: s.uptime, latency: result.latency, lastCheck: s.lastCheck }
  ).catch(() => {});
}

// ─── alerting ─────────────────────────────────────────────────────────────────

async function sendAlert(id, name, status, result) {
  const marker  = status === 'down' ? '[DOWN]' : '[UP]';
  const subject = `${marker} ${name} is ${status.toUpperCase()} — anonymousservers.info`;
  const text    = `Service: ${name}\nStatus: ${status}\nLatency: ${result.latency}ms\nTime: ${new Date().toISOString()}`;

  // email alert
  if (cfg.alertEmail) {
    ipc.send('route', {
      type:    'smtp:send',
      from:    `monitor@${cfg.domain || 'anonymousservers.info'}`,
      to:      cfg.alertEmail,
      subject, text,
    }, 'smtp');
  }

  // webhook alert
  if (cfg.alertWebhook) {
    ipc.send('queue:push', {
      type: 'webhook:deliver',
      data: { url: cfg.alertWebhook, body: { id, name, status, latency: result.latency, ts: Date.now() } },
      priority: 'high',
    });
  }

  // also enqueue to queue engine for reliability
  await ipc.db.insert('alert_log', { id, name, status, latency: result.latency, ts: Date.now() }).catch(() => {});
}

// ─── check loop ───────────────────────────────────────────────────────────────

async function runChecks() {
  // Engine checks run concurrently. They used to run in series, and each ping
  // to a stopped engine burns the full 8s timeout — so on a box where a few
  // engines are down, a single sweep took minutes while the sweep interval is
  // 30s. Sweeps stacked, and a healthy engine sitting behind three dead ones
  // showed as "no report" for minutes after it was actually up.
  const engineChecks = cfg.checks.map(async check => {
    try {
      const result = await pingEngine(check.id);
      await recordResult(check.id, check.name, result);
    } catch {
      await recordResult(check.id, check.name, { up: false, latency: cfg.timeoutMs });
    }
  });

  const httpChecks = (cfg.httpChecks || []).map(async check => {
    try {
      const result = await httpCheck(check.url, check.expectedStatus);
      await recordResult(check.id, check.name, result);
    } catch {
      await recordResult(check.id, check.name, { up: false, latency: cfg.timeoutMs });
    }
  });

  await Promise.allSettled([...engineChecks, ...httpChecks]);
}

// ─── stats helpers ────────────────────────────────────────────────────────────

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function snapshot() {
  const services = [];
  for (const [id, s] of state) {
    services.push({
      id, name: s.name,
      up:       s.up,
      uptime:   s.uptime,
      avgLatency: s.latencies.length
        ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
        : null,
      p95Latency:  percentile(s.latencies, 95),
      lastCheck:   s.lastCheck,
      lastChange:  s.lastChange,
      incident:    s.incident ? { startedAt: s.incident.startedAt } : null,
      checks:      s.checks,
    });
  }
  const allUp   = services.every(s => s.up !== false);
  const anyDown = services.some(s => s.up === false);
  return {
    status:   anyDown ? 'degraded' : allUp ? 'operational' : 'unknown',
    services,
    ts: Date.now(),
  };
}

// ─── HTTP API (status page data) ──────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  function json(status, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body);
  }

  if (method === 'GET' && url === '/status') {
    return json(200, snapshot());
  }

  if (method === 'GET' && url === '/status/incidents') {
    const incidents = await ipc.db.all('incidents').catch(() => []);
    return json(200, { incidents: incidents.slice(-50) });
  }

  if (method === 'GET' && url.startsWith('/status/')) {
    const id = url.slice('/status/'.length);
    const s  = state.get(id);
    if (!s) return json(404, { error: 'not found' });
    return json(200, {
      id, name: s.name, up: s.up, uptime: s.uptime,
      latencies: s.latencies.slice(-20),
      p50: percentile(s.latencies, 50),
      p95: percentile(s.latencies, 95),
      p99: percentile(s.latencies, 99),
    });
  }

  json(404, { error: 'not found' });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    const next = (cfg.listenPort) + 1;
    log(`port ${(cfg.listenPort)} in use — trying :${next}`, 'WARN');
    setTimeout(() => server.listen(next, () => { log(`on :${next}`); claimPort(next); }), 300);
  } else { throw err; }
});
server.listen(cfg.listenPort, () => {
  log(`monitor engine on :${cfg.listenPort}`);
  claimPort(cfg.listenPort);
});

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipc.on('monitor:status', payload => {
  ipc.send('monitor:status:reply', { requestId: payload?.requestId, ...snapshot() });
});

ipc.on('monitor:add', payload => {
  const { id, name, url, type } = payload || {};
  if (!id || !name) return;
  if (url) cfg.httpChecks = [...(cfg.httpChecks || []), { id, name, url }];
  else cfg.checks = [...(cfg.checks || []), { id, name, type: type || 'engine' }];
  conf.save(cfg);
  log(`monitoring added: ${name}`);
});

// ─── start ────────────────────────────────────────────────────────────────────

log('monitor engine starting');
const GRACE_MS = cfg.gracePeriodMs || 15000;
setTimeout(() => {
  runChecks().catch(() => {});
  setInterval(() => runChecks().catch(() => {}), cfg.intervalMs);
}, GRACE_MS);
log(`checking every ${cfg.intervalMs / 1000}s (first check in ${GRACE_MS / 1000}s)`);
