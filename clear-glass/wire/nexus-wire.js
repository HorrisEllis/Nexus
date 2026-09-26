'use strict';
/**
 * wire/nexus-wire.js — ErosmancerOS ↔ Clear Glass ↔ NEXUS
 * UUID: wire-nexus-v1-0000-0000-000000000011
 * Version: 1.1.0 — NEXUS protocol fix
 *
 * Standalone HTTP bridge process at :7704.
 *
 *   1. Registers ErosmancerOS into NEXUS via POST /api/register on :9000
 *      (matching nc.registerWithOrchestrator() exactly)
 *   2. Proxies NEXUS → ErosmancerOS REST commands (/eros/*)
 *   3. Proxies NEXUS → Clear Glass IPC commands (/cg/cmd)
 *   4. Receives ErosmancerOS webhooks and forwards to NEXUS cortex
 *   5. On hostile detection → triggers Clear Glass fingerprint switch
 *
 * NEXUS registration protocol (matches nexus-connect.js exactly):
 *   POST :9000/api/register   { systemId, port, meta, components[] }
 *   POST :9000/api/heartbeat  { systemId, port, status }
 *   POST :9000/api/ledger     { system, type, payload }
 *   POST :3748/api/event      { type, payload, source, ts }
 */

'use strict';

const http    = require('http');
const express = require('express');
const { randomUUID } = require('crypto');

const NEXUS_ORCH_PORT   = parseInt(process.env.ORCHESTRATOR_PORT  || '9000');
const NEXUS_CORTEX_PORT = parseInt(process.env.NEXUS_PORT         || '3748');
const EROS_PORT         = parseInt(process.env.EROS_PORT          || '7432');
const CG_IPC_PORT       = parseInt(process.env.CLEARGL_IPC_PORT   || '7702');
const WIRE_PORT         = parseInt(process.env.WIRE_PORT          || '7704');

const EROS_URL   = `http://127.0.0.1:${EROS_PORT}`;
const CG_IPC_URL = `http://127.0.0.1:${CG_IPC_PORT}`;
const MODULE_UUID = randomUUID();

// ── NEXUS HTTP helper ──────────────────────────────────────────────────────
function _ncReq(port, method, urlPath, body, timeout = 4000) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: {
        'Content-Type': 'application/json',
        'X-Nexus-Source': 'nexus-wire',
        'X-Nexus-Call-UUID': randomUUID(),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d), ms: Date.now() - t0 }); }
        catch { resolve({ ok: res.statusCode < 400, data: d, ms: Date.now() - t0 }); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false, error: 'timeout', ms: timeout }); });
    req.on('error', e => resolve({ ok: false, error: e.message, ms: Date.now() - t0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Upstream proxy helper ──────────────────────────────────────────────────
function _proxy(baseUrl, method, urlPath, body, timeout = 12000) {
  const url = new URL(urlPath, baseUrl);
  return new Promise(resolve => {
    const payload = (body && method !== 'GET') ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname, port: parseInt(url.port),
      path: url.pathname + url.search, method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ status: 504, body: { error: 'upstream timeout' } }); });
    req.on('error', e => resolve({ status: 502, body: { error: e.message } }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── NEXUS event emit — fire-and-forget ────────────────────────────────────
function _postEvent(type, payload) {
  _ncReq(NEXUS_ORCH_PORT,   'POST', '/api/ledger', { system: 'nexus-wire', type, payload }, 1200).catch(() => {});
  _ncReq(NEXUS_CORTEX_PORT, 'POST', '/api/event',  { type, payload, source: 'nexus-wire', ts: Date.now() }, 1200).catch(() => {});
}

// ── ErosmancerOS component registry ───────────────────────────────────────
const EROS_COMPONENTS = require('./eros-registry-components');

// ── NEXUS registration — exact nc.registerWithOrchestrator() protocol ──────
async function registerErosWithNexus() {
  const r = await _ncReq(NEXUS_ORCH_PORT, 'POST', '/api/register', {
    systemId:   'erosmancer-os',
    port:       EROS_PORT,
    meta:       { role: 'cdp-engine', version: '0.1.0', wirePort: WIRE_PORT, wireUrl: `http://127.0.0.1:${WIRE_PORT}` },
    ts:         Date.now(),
    components: EROS_COMPONENTS,
  }, 5000);

  if (r.ok) {
    console.log(`[Wire §AXIOM] ErosmancerOS registered with orchestrator :${NEXUS_ORCH_PORT}`);
    _ncReq(NEXUS_ORCH_PORT, 'POST', '/api/ledger', {
      system: 'nexus-wire', type: 'erosmancer-os.registered',
      payload: { port: EROS_PORT, wirePort: WIRE_PORT, components: EROS_COMPONENTS.length },
    }, 1500).catch(() => {});
  } else {
    console.log('[Wire §AXIOM] orchestrator offline — ErosmancerOS standalone');
  }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
// §MIGRATED 2026-08-29 — real, standalone process (:7704), never touched
// by clear-glass's main-process createPulse migration since this is a
// genuinely separate process, not part of that Electron app. Confirmed
// the caller (line ~220) discards the return value, same as every other
// real migration this session — safe to change internals freely.
// Two real createPulse() instances, not one — this process heartbeats
// on behalf of TWO distinct systemIds (nexus-wire itself, and
// erosmancer-os, which it fronts), and createPulse is scoped to one
// systemId+port pair per call, matching how orchestrator's own real
// SYSTEM_REGISTRY tracks each systemId independently.
function _startHeartbeat() {
  const { createPulse } = require('../../orchestrator/lib/pulse.js');
  const wirePulse = createPulse({ systemId: 'nexus-wire', port: WIRE_PORT, orchPort: NEXUS_ORCH_PORT });
  const erosPulse = createPulse({ systemId: 'erosmancer-os', port: EROS_PORT, orchPort: NEXUS_ORCH_PORT });
  return { wirePulse, erosPulse };
}

// ── Express ────────────────────────────────────────────────────────────────
const wireApp = express();
wireApp.use(express.json({ limit: '4mb' }));
wireApp.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });

wireApp.get('/health', (req, res) => res.json({ ok: true, module: 'nexus-wire', uuid: MODULE_UUID, ts: Date.now() }));

// ErosmancerOS proxy
wireApp.all('/eros/*path', async (req, res) => {
  const erosPath = '/api' + req.path.replace(/^\/eros/, '');
  const up = await _proxy(EROS_URL, req.method, erosPath, req.body, 15000);
  res.status(up.status).json(up.body);
});

// Clear Glass IPC proxy
wireApp.post('/cg/cmd', async (req, res) => {
  const up = await _proxy(CG_IPC_URL, 'POST', '/cmd', req.body, 10000);
  res.status(up.status).json(up.body);
});

// Hostile detection webhook
wireApp.post('/hook/hostile', async (req, res) => {
  const { level, type, tabId, recommendation } = req.body;
  console.log(`[Wire] Hostile: ${type} (${level}) tab=${tabId}`);
  if (level === 'high' || level === 'critical') {
    _proxy(CG_IPC_URL, 'POST', '/cmd', {
      eventType: 'context.fp.switch',
      data: { agentId: tabId, mode: 'firefox', reason: `hostile:${type}` },
    }, 5000).catch(() => {});
  }
  _postEvent('eros.hostile.detected', { level, type, tabId, recommendation });
  res.json({ ok: true });
});

// Behavior plan webhook
wireApp.post('/hook/behavior', async (req, res) => {
  const { planId, profile, variant, meta } = req.body;
  _postEvent('eros.behavior.plan', { planId, profile, variant, meta });
  res.json({ ok: true });
});

// ClearDriver → ErosmancerOS bridge
wireApp.post('/bridge/driver', async (req, res) => {
  const ACTION_MAP = {
    click: '/api/os/click', type: '/api/os/type', hover: '/api/os/hover',
    scroll: '/api/os/scroll', navigate: '/api/os/navigate', evaluate: '/api/os/evaluate',
    screenshot: '/api/os/screenshot', waitForSelector: '/api/os/wait', attribute: '/api/os/attribute',
  };
  const { action, agentId, ...args } = req.body;
  const endpoint = ACTION_MAP[action];
  if (!endpoint) return res.status(400).json({ error: `No Eros mapping: ${action}` });
  const up = await _proxy(EROS_URL, 'POST', endpoint, { tabId: agentId, ...args }, 30000);
  res.status(up.status).json(up.body);
});

// Wire status
// §FIX 2026-09-02 — James: diagnostic logging "'clear-glass' missed its
// /status probe but registered 2s ago — treating as ONLINE... No gap
// raised." Traced to root cause, not patched in diagnostic's fallback
// logic (which is working exactly as designed — §COMPETING TRUTH FIXED
// 2026-07-24, service/nexus-diagnostic.js). The real bug is HERE:
// diagnostic probes this exact endpoint with its own 2000ms OUTER
// timeout (service/nexus-diagnostic.js's pollSystem(), `{ timeout: 2000 }`
// against http://127.0.0.1:7704/status), while this handler's three
// upstream proxy calls each carried their OWN 2000ms timeout. They run
// in parallel (Promise.allSettled), so total wait is ~max(single call),
// not the sum — but "max" can legitimately BE ~2000ms if any one of
// erosmancer/clear-glass-ipc/orchestrator is briefly slow, which is
// equal to or past diagnostic's own outer cutoff for the SAME request.
// A perfectly healthy wire process, with one slow upstream, could push
// its own /status past 2000ms and get marked as a missed probe —
// exactly the intermittent, non-persistent symptom observed. Fixed by
// giving each internal proxy call real headroom under diagnostic's
// 2000ms budget: 800ms each means the worst case (all three maximally
// slow, run in parallel) still responds in ~800ms + overhead, safely
// inside diagnostic's window.
wireApp.get('/status', async (req, res) => {
  const [e, cg, o] = await Promise.allSettled([
    _proxy(EROS_URL, 'GET', '/api/health', null, 800),
    _proxy(CG_IPC_URL, 'GET', '/health', null, 800),
    _ncReq(NEXUS_ORCH_PORT, 'GET', '/health', null, 800),
  ]);
  res.json({
    wire:         { ok: true, uuid: MODULE_UUID, port: WIRE_PORT },
    erosmancerOs: { ok: e.status === 'fulfilled' && e.value.status < 400 },
    clearGlass:   { ok: cg.status === 'fulfilled' && cg.value.status < 400 },
    orchestrator: { ok: o.status === 'fulfilled' && o.value.ok },
    ts: Date.now(),
  });
});

// ── Boot ───────────────────────────────────────────────────────────────────
async function start() {
  await new Promise((resolve, reject) => {
    const server = wireApp.listen(WIRE_PORT, '127.0.0.1', () => {
      console.log(`[Wire] nexus-wire :${WIRE_PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });

  await registerErosWithNexus();
  await _ncReq(NEXUS_ORCH_PORT, 'POST', '/api/register', {
    systemId: 'nexus-wire', port: WIRE_PORT,
    meta: { role: 'integration-bridge', version: '1.1.0' },
    ts: Date.now(), components: [],
  }, 5000);

  _startHeartbeat();
  console.log(`[Wire] Ready — Eros:${EROS_PORT} ↔ CG:${CG_IPC_PORT} ↔ NEXUS:${NEXUS_ORCH_PORT}`);
}

if (require.main === module) {
  start().catch(err => { console.error('[Wire] Boot failed:', err); process.exit(1); });
}

module.exports = { start, EROS_COMPONENTS };
