'use strict';
/**
 * nexus-connect.js — Universal cross-system connection layer
 * UUID: nexus-connect-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * §1.2  Every failure loud, specific, traceable.
 * §5.1  Every call has a UUID.
 * §5.7  All inter-system communication via event bus only.
 *
 * Usage (CJS):
 *   const nc = require('../nexus-connect');
 *   await nc.postEvent('guardian.job.complete', { jobId, chars });
 *   await nc.postLedger('guardian', 'guardian.job.complete', payload);
 *   await nc.healthCheck('cortex');
 */

const http = require('http');
const { randomUUID } = require('crypto');

// ── Canonical port map ────────────────────────────────────────────────────────
let _pulseEmitter = null;

/**
 * startPulse — every system calls this on boot.
 * Replaces registerWithOrchestrator() + startHeartbeat().
 * The orchestrator hears the UDP pulse and updates its ledger.
 * No HTTP registration call needed. No hardcoded orchestrator URL required.
 */
function startPulse(systemId, port) {
  try {
    const { createPulseEmitter } = require('../lib/heartbeat');
    const SYSTEM_UUIDS = {
      cortex:       'nexus-cortex-0000-4000-0000-000000000001',
      guardian:     'nexus-guardian-0000-4000-0000-000000000001',
      idearium:     'nexus-idearium-0000-4000-0000-000000000001',
      emerge:       'nexus-emerge-0000-4000-0000-000000000001',
      orchestrator: 'nexus-orchestrator-0000-4000-0000-000000000001',
    };
    const GROUP_HINTS = {
      cortex: 'nexus:memory', guardian: 'nexus:agent',
      idearium: 'nexus:ide', emerge: 'nexus:ide', orchestrator: 'nexus:core',
    };
    _pulseEmitter = createPulseEmitter({
      uuid:      SYSTEM_UUIDS[systemId] || `nexus-${systemId}-unknown`,
      groupHint: GROUP_HINTS[systemId]  || `nexus:${systemId}`,
      port:      7777,
    });
    _pulseEmitter.start(10000);  // pulse every 10s
    console.log(`\x1b[90m[nexus-connect] pulse started: ${systemId} every 10s on :7777\x1b[0m`);
  } catch(e) {
    // UDP unavailable — fall back to HTTP registration
    console.warn(`[nexus-connect] pulse unavailable (${e.message}) — using HTTP registration`);
    registerWithOrchestrator(systemId, port, {}).catch(() => {});
  }
}

const PORTS = {
  bridge:       parseInt(process.env.BRIDGE_PORT        || '9999'),
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT  || '9000'),
  cortex:       parseInt(process.env.NEXUS_PORT         || '3748'),
  guardian:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  idearium:     parseInt(process.env.IDEARIUM_PORT      || '4800'),
  architect:    parseInt(process.env.ARCHITECT_PORT     || '3747'),
  emerge:       parseInt(process.env.EMERGE_PORT        || '4242'),
  diagnostic:   parseInt(process.env.DIAGNOSTIC_PORT   || '7825'),
  ollama:       parseInt(process.env.OLLAMA_PORT        || '11434'),
  'ollama-bridge': parseInt(process.env.OLLAMA_BRIDGE_PORT || '3749'),
  copilot:      parseInt(process.env.COPILOT_PORT        || '3750'),
  loom:         parseInt(process.env.LOOM_PORT            || '3752'),
};

const HEALTH_PATHS = {
  cortex:       '/health',
  guardian:     '/health',
  idearium:     '/health',
  emerge:       '/status',
  orchestrator: '/health',
  ollama:       '/api/tags',
  loom:         '/health',
};

// ── Lattice feed — the real cross-system relationship signal ───────────────
// docs/nexus-relationship-shape.spec build_order_v0_2 step 8, done at the
// actual point of contact instead of inferred from a log line after the
// fact (see intelligence/lattice/fanin-listener.js's poll reconciler,
// which tried causedBy-inference and found the signal essentially never
// present in real ledger data — this is the honest fix, not a second
// guess). Lazy-required so a lattice failure can never break a real
// cross-system call, and so there's no load-order dependency on the
// lattice existing before nexus-connect does.
let _lattice = null;
function _feedLattice(from, to, eventPath, ok) {
  if (!from || !to || from === to) return; // self-calls aren't a pair
  try {
    if (!_lattice) _lattice = require('../intelligence/lattice/associative-lattice');
    // A failed cross-system call is real, direct evidence of friction —
    // better grounded than any inference. A successful one is left at 0
    // and handled by field.js's own eventType-based nudge, same as every
    // other caller of updateEdge().
    _lattice.updateEdge(from, to, eventPath, ok ? 0 : 0.7).catch(() => {});
  } catch (_) { /* lattice unavailable — the real cross-system call is unaffected */ }
}

// ── Gated HTTP helper ─────────────────────────────────────────────────────────
// §1.2: never swallows errors silently — always returns { ok, data, error, uuid, ms }
function _req(system, method, path, body, timeout = 5000) {
  const callUuid = randomUUID();
  const port     = PORTS[system];
  if (!port) return Promise.resolve({ ok:false, error:`[nexus-connect] unknown system: ${system}`, uuid:callUuid, ms:0 });
  const fromSystem = process.env.NEXUS_SYSTEM_ID || 'nexus';

  return new Promise(resolveOuter => {
    const resolve = (result) => { _feedLattice(fromSystem, system, path, result.ok); resolveOuter(result); };
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

/** POST event — orchestrator first (source of truth), cortex second */
async function postEvent(type, payload, opts = {}) {
  const { causedBy = null, source = process.env.NEXUS_SYSTEM_ID || 'unknown' } = opts;
  // §FIX-24.1: postEvent is now fully fire-and-forget.
  // The previous implementation awaited the cortex write (5s timeout by default).
  // When cortex is briefly offline (pattern crystallization, snapshot, GC), every
  // guardian.job.complete/gaps/dispatched call blocked for 5s, cascading into
  // the "cortex timeout" storm visible in the logs. These are telemetry writes —
  // they MUST NOT block the caller. Use 1200ms timeout. Never await. Never throw.
  _req('orchestrator', 'POST', '/api/ledger', { system: source, type, payload }, 1200).catch(() => {});
  _req('cortex', 'POST', '/api/event', { type, payload, causedBy, source, ts: Date.now() }, 1200).catch(() => {});
  return { ok: true, async: true }; // fire-and-forget — caller must not rely on this result
}

/** POST to orchestrator ledger ring */
async function postStream(jobId, text, fullLen, chunkIndex, provider) {
  return _req('cortex', 'POST', '/api/event', {
    type: 'guardian.job.stream',
    payload: { jobId, text: (text||'').slice(0,2000), chars:(text||'').length, fullLen, chunkIndex, provider },
    source: 'guardian-stream', causedBy: jobId, ts: Date.now(),
  }, 1500);
}

async function postTableInsert(table, row) {
  return _req('cortex', 'POST', '/api/table/insert', { table, row }, 2000);
}


async function postLedger(system, type, payload) {
  const r = await _req('orchestrator', 'POST', '/api/ledger', { system, type, payload });
  if (!r.ok && process.env.NEXUS_VERBOSE) console.warn(`[nexus-connect] postLedger: orchestrator offline`);
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

  // §AXIOM: orchestrator is source of truth — logs FIRST
  _req('orchestrator', 'POST', '/api/ledger', {
    system: systemId,
    type:   success ? `${systemId}.step.complete` : `${systemId}.step.failed`,
    payload,
  }).catch(() => {});

  // Then cortex (secondary truth, event_log)
  _req('cortex', 'POST', '/api/event', {
    type:    success ? `${systemId}.step.complete` : `${systemId}.step.failed`,
    payload, source: systemId, ts: Date.now(),
  }).catch(() => {});

  if (error) throw error;
  return { ok: success, uuid, ms, result };
}

// ── Recall — reads orchestrator ledger history (CLI replay, context restore) ──
// §AXIOM: all CLIs can use recall. Orchestrator is source of truth.
async function recall(opts = {}) {
  const { system = '', n = 100, since = 0, type = '' } = opts;
  const qs = new URLSearchParams();
  if (system) qs.set('system', system);
  if (n)      qs.set('n', n);
  if (since)  qs.set('since', since);
  if (type)   qs.set('type', type);
  const r = await _req('orchestrator', 'GET', `/api/ledger?${qs}`, null, 6000);
  if (!r.ok) {
    console.warn(`[nexus-connect] recall failed: ${r.error || r.status}`);
    return { ok: false, entries: [] };
  }
  return { ok: true, entries: r.data?.entries || [], counts: r.data?.counts || {} };
}

// ── Register with orchestrator (all systems call this on boot) ───────────────
// §AXIOM: all systems connect to orchestrator first, then to bus/kernel
async function registerWithOrchestrator(systemId, port, meta = {}, components = []) {
  const r = await _req('orchestrator', 'POST', '/api/register', {
    systemId, port, meta, ts: Date.now(), components,
  }, 5000);
  if (r.ok) {
    console.log(`[nexus-connect §AXIOM] ${systemId} registered with orchestrator`);
    // Then post to ledger
    await postLedger(systemId, `${systemId}.registered`, { port, ...meta });
  } else {
    // §FIX 2026-07-30 — found in James's real boot log. This logged
    // "standalone — orchestrator offline" and GAVE UP FOREVER. In phase 2 all
    // four kernels start in parallel, so whichever reaches this line before
    // orchestrator has bound :9000 stays permanently unregistered. In that
    // boot, guardian happened to be slow enough to succeed and BRIDGE LOST THE
    // RACE — so bridge ran healthy, served traffic, and was invisible to the
    // registration authority for the whole session.
    //
    // Invisible-but-working is the worst failure shape in this codebase: the
    // registry is what health, contract verification and the connectome all
    // read, so bridge was simultaneously fine and absent from every map.
    //
    // Retries with backoff instead. Bounded, because a system that cannot
    // register after this long has a real problem that silence would hide.
    console.log(`[nexus-connect §AXIOM] ${systemId} standalone — orchestrator offline; retrying (it may still be starting)`);
    _scheduleRegisterRetry(systemId, port, meta, components);
  }
  return r;
}

// Retry registration until orchestrator answers. Deliberately not infinite:
// after REGISTER_MAX_ATTEMPTS the failure is stated loudly rather than retried
// silently forever, because "still trying" that never ends is indistinguishable
// from "gave up" to anyone reading the log.
const REGISTER_MAX_ATTEMPTS = 10;
const _registerRetries = new Map();
function _scheduleRegisterRetry(systemId, port, meta, components) {
  const attempt = (_registerRetries.get(systemId) || 0) + 1;
  _registerRetries.set(systemId, attempt);
  if (attempt > REGISTER_MAX_ATTEMPTS) {
    console.error(`[nexus-connect §AXIOM] ${systemId} FAILED to register after ${REGISTER_MAX_ATTEMPTS} attempts — it is running but INVISIBLE to the registry, so health, contract verification and the connectome will all omit it`);
    return;
  }
  const delay = Math.min(1000 * Math.pow(1.6, attempt - 1), 15000);
  const t = setTimeout(async () => {
    const r = await _req('orchestrator', 'POST', '/api/register', {
      systemId, port, meta, ts: Date.now(), components,
    }, 5000).catch(() => ({ ok: false }));
    if (r && r.ok) {
      _registerRetries.delete(systemId);
      console.log(`[nexus-connect §AXIOM] ${systemId} registered with orchestrator (attempt ${attempt})`);
      await postLedger(systemId, `${systemId}.registered`, { port, ...meta, lateRegistration: true, attempts: attempt }).catch(() => {});
    } else {
      _scheduleRegisterRetry(systemId, port, meta, components);
    }
  }, delay);
  if (t.unref) t.unref();   // registration retry must never hold a process open
}

// ── Heartbeat — all systems ping orchestrator every 10s ───────────────────────
function startHeartbeat(systemId, port) {
  // §MIGRATED 2026-08-29 — nexus-connect.js's own startHeartbeat() is a
  // SHARED utility, not a per-system duplicate — confirmed 3 real, live
  // callers (loom/server.js, ollama/server.js, copilot/server.js), all
  // of which discard the return value entirely (checked directly, not
  // assumed — none capture or call anything on it), so the internal
  // implementation is free to change without touching any caller.
  // Replaces the hand-rolled setInterval+_req pattern with real,
  // shared orchestrator/lib/pulse.js's createPulse() — real latency
  // tracking, real online/offline transitions, real missed-beat
  // logging, none of which this had. One real fix here migrates all 3
  // callers at once, higher leverage than migrating each individually
  // (the earlier real migrations — clear-glass, cortex, idearium — each
  // had their OWN separate hand-rolled copy; this one function serving
  // 3 systems is a different, better-leveraged case).
  const { createPulse } = require('../orchestrator/lib/pulse.js');
  return createPulse({ systemId, port });
}

// ── postBridge — post an event to Bridge SSE/ledger ───────────────────────────
// §A-2 hooks are the wire. Bridge is the wire for all cross-system events.
async function postBridge(type, payload = {}) {
  return _req('bridge', 'POST', '/bridge/event', {
    type, payload: { ...payload, _source: 'nexus-connect', _ts: Date.now() },
    ts: Date.now(),
  }, 2000).catch(e => ({ ok: false, error: e.message }));
}

// ── bridgeEmit — emit a causal event to the Bridge Causal Spine (item 1.6) ────
// §B-7: buffer locally on Bridge unreachable. Flush on reconnect.
// Ring buffer: max 100 events. Oldest evicted when full.
const _localBuffer = [];
const _LOCAL_BUFFER_MAX = 100;
let   _bridgeWasOffline = false;

/**
 * bridgeEmit — emit a causal event to /bridge/causal/emit.
 *
 * @param {object} opts
 * @param {string}   opts.source       — must be a valid CAUSAL_SOURCE
 * @param {string}   opts.action       — verb.noun, e.g. 'job.dispatched'
 * @param {string}   [opts.sessionId]
 * @param {Array}    [opts.causalEdges]  — [{ type, eventId }]
 * @param {object}   [opts.input]
 * @param {object}   [opts.output]
 * @param {object}   [opts.stateDiff]   — deltas only
 * @param {string[]} [opts.tags]
 * @returns {Promise<{ ok, uuid? }>}
 */
async function bridgeEmit({ source, action, sessionId = null, causalEdges = [], input = {}, output = {}, stateDiff = {}, tags = [] } = {}) {
  const payload = { source, action, sessionId, causalEdges, input, output, stateDiff, tags, ts: Date.now() };

  try {
    const result = await _req('bridge', 'POST', '/bridge/causal/emit', payload, 2000);

    // If Bridge just came back online, flush the local buffer in order
    if (_bridgeWasOffline && _localBuffer.length > 0) {
      _bridgeWasOffline = false;
      const toFlush = _localBuffer.splice(0);
      for (const buffered of toFlush) {
        await _req('bridge', 'POST', '/bridge/causal/emit', buffered, 2000).catch(() => {});
      }
      console.log(`[nexus-connect] flushed ${toFlush.length} buffered causal events`);
    }

    return result;
  } catch (e) {
    // Bridge unreachable — buffer locally (§B-7)
    _bridgeWasOffline = true;
    _localBuffer.push(payload);
    if (_localBuffer.length > _LOCAL_BUFFER_MAX) _localBuffer.shift();
    return { ok: false, buffered: true };
  }
}

module.exports = { _req, postEvent, postLedger, postStream, postTableInsert, healthCheck, healthAll, gate, recall, registerWithOrchestrator, startHeartbeat, startPulse, postBridge, bridgeEmit, PORTS };
