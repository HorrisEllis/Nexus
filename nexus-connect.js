'use strict';
/**
 * nexus-connect.js — Universal cross-system connection layer
 * UUID: nexus-connect-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * §1.2  Every failure loud, specific, traceable.
 * §5.1  Every call has a UUID.
 * §5.2  Everything implements the bridge.
 * §5.7  All inter-system communication via event bus only.
 *
 * Usage (CJS):
 *   const nc = require('./nexus-connect');
 *   await nc.postEvent('guardian.job.complete', { jobId, chars });
 *   await nc.postLedger('guardian', 'guardian.job.complete', payload);
 *   await nc.postBridge('guardian.artifact', payload);
 *   await nc.healthCheck('cortex');
 */

const http = require('http');
const { randomUUID } = require('crypto');

// ── Canonical port map ────────────────────────────────────────────────────────
const PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT || '9000'),
  bridge:       parseInt(process.env.BRIDGE_PORT       || '9999'),
  cortex:       parseInt(process.env.NEXUS_PORT        || '3748'),
  guardian:     parseInt(process.env.GUARDIAN_HTTP_PORT|| '7820'),
  idearium:     parseInt(process.env.IDEARIUM_PORT     || '4800'),
  emerge:       parseInt(process.env.EMERGE_PORT       || '4242'),
  ollama:       parseInt(process.env.OLLAMA_PORT       || '11434'),
};

const HEALTH_PATHS = {
  bridge:       '/bridge/health',
  cortex:       '/health',
  guardian:     '/health',
  idearium:     '/health',
  emerge:       '/status',
  orchestrator: '/health',
  ollama:       '/api/tags',
};

// ── Gated HTTP helper ─────────────────────────────────────────────────────────
// §1.2: never swallows errors silently — always returns { ok, data, error, uuid, ms }
function _req(system, method, path, body, timeout = 5000) {
  const callUuid = randomUUID();
  const port     = PORTS[system];
  if (!port) return Promise.resolve({ ok:false, error:`[nexus-connect] unknown system: ${system}`, uuid:callUuid, ms:0 });

  return new Promise(resolve => {
    const t0      = Date.now();
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, path, method,
      headers: {
        'Content-Type':        'application/json',
        'X-Nexus-Call-UUID':   callUuid,
        'X-Nexus-Source':      process.env.NEXUS_SYSTEM_ID || 'nexus',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const ms = Date.now() - t0;
        try {
          const data = JSON.parse(d);
          resolve({ ok: res.statusCode < 400, data, uuid: callUuid, ms, status: res.statusCode });
        } catch(_) {
          resolve({ ok: res.statusCode < 400, data: d, uuid: callUuid, ms, status: res.statusCode });
        }
      });
    });
    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ ok:false, error:`[nexus-connect] ${system} timeout after ${timeout}ms`, uuid:callUuid, ms:timeout });
    });
    req.on('error', e => {
      resolve({ ok:false, error:`[nexus-connect] ${system} ${method} ${path}: ${e.message}`, uuid:callUuid, ms:Date.now()-t0 });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** POST event to cortex event_log (§5.2 bridge compliance) */
async function postEvent(type, payload, opts = {}) {
  const { causedBy = null, source = process.env.NEXUS_SYSTEM_ID || 'unknown' } = opts;
  const r = await _req('cortex', 'POST', '/api/event', { type, payload, causedBy, source, ts: Date.now() });
  if (!r.ok) console.warn(`[nexus-connect] postEvent failed: ${r.error || r.status} type=${type}`);
  return r;
}

/** POST to orchestrator ledger ring */
async function postLedger(system, type, payload) {
  const r = await _req('orchestrator', 'POST', '/api/ledger', { system, type, payload });
  if (!r.ok) console.warn(`[nexus-connect] postLedger failed: ${r.error || r.status}`);
  return r;
}

/** POST broadcast to bridge SSE (§5.2 — all systems on the bus) */
async function postBridge(type, payload) {
  const r = await _req('bridge', 'POST', '/bridge/broadcast', { type, ...payload, ts: Date.now() });
  if (!r.ok) console.warn(`[nexus-connect] postBridge failed: ${r.error || r.status} type=${type}`);
  return r;
}

/** GET health of any system. Returns { online, ms, data } */
async function healthCheck(system) {
  const path = HEALTH_PATHS[system] || '/health';
  const r    = await _req(system, 'GET', path, null, 3000);
  return { online: r.ok && !r.error, ms: r.ms, data: r.data, error: r.error };
}

/** Health check ALL systems in parallel */
async function healthAll() {
  const results = await Promise.all(
    Object.keys(PORTS).map(async sys => {
      const h = await healthCheck(sys);
      return [sys, h];
    })
  );
  return Object.fromEntries(results);
}

/** Gated step logger — logs to cortex + orchestrator, returns { ok, uuid } */
async function gate(stepName, systemId, fn) {
  const uuid = randomUUID();
  const t0   = Date.now();
  let result, error;

  try {
    result = await fn();
  } catch (e) {
    error = e;
  }

  const ms       = Date.now() - t0;
  const success  = !error && result !== false;
  const payload  = { step: stepName, system: systemId, uuid, ms, success, error: error?.message || null };

  // §1.2 — failure is loud
  if (!success) {
    console.error(`[§1.2 GATE FAIL] ${systemId}.${stepName} — ${error?.message || 'returned false'} (${ms}ms) uuid=${uuid}`);
  }

  // Log to cortex (fire-and-forget — §2.3 all state observable)
  _req('cortex', 'POST', '/api/event', {
    type:    success ? `${systemId}.step.complete` : `${systemId}.step.failed`,
    payload, source: systemId, ts: Date.now(),
  }).catch(() => {});

  // Log to orchestrator ledger
  _req('orchestrator', 'POST', '/api/ledger', {
    system: systemId,
    type:   success ? `${systemId}.step.complete` : `${systemId}.step.failed`,
    payload,
  }).catch(() => {});

  if (error) throw error;
  return { ok: success, uuid, ms, result };
}

module.exports = { _req, postEvent, postLedger, postBridge, healthCheck, healthAll, gate, PORTS };
