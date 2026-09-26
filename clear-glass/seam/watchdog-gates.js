'use strict';
/**
 * seam/watchdog-gates.js — Co-pilot Watchdog Gates
 * UUID: cg-watchdog-gates-v1-0000-0000-000000000009
 *
 * Co-pilot as watchdog — active, not passive.
 * Every concern is a Gate on the SISO bus.
 * Gates fire on events, not on polls.
 *
 * Law: watchdog behavior is gates, not a monitoring loop.
 * Each gate owns exactly one concern. §SISO: single responsibility.
 */

const { Gate, Event } = require('../siso/index');
const { randomUUID: uuidv4 } = require('crypto'); // §BUGFIX 2026-08-23 — the real 'uuid' npm package was never installed (checked node_modules and package.json directly); this crashed every real file that required it, including boot-critical ones. Node's own built-in produces the identical UUID format, zero dependency.

function gate(signature, transformFn) {
  const g = new Gate(signature);
  g.transform = transformFn;
  return g;
}

// ── Rate limit watchdog ────────────────────────────────────────────────────
// When an agent hits a rate limit, automatically route to mesh fallback
const rateLimitWatchdog = (mesh) => gate('context.rate-limited', (event, stream) => {
  const { agentId } = event.data;
  console.log(`[Watchdog] Rate limit on ${agentId} — routing to mesh`);

  // Don't block — async fire
  mesh?.route({ prompt: null, preferAgent: null, _meta: { reason: 'rate-limit-fallback', agentId } })
    .catch(() => {}); // mesh handles errors internally

  stream.emit(new Event('watchdog.rate-limit.handled', {
    agentId,
    action: 'mesh.route.triggered',
    ts:     Date.now(),
  }));
});

// ── Cookie health watchdog ─────────────────────────────────────────────────
// Unhealthy session tokens → flag to Cortex as a gap
const cookieHealthWatchdog = (nexusBusUrl) => gate('cookie.health.result', (event, stream) => {
  const { agentId, healthy, expired, total } = event.data;
  if (healthy) return; // nothing to do

  console.log(`[Watchdog] Cookie health fail on ${agentId} — ${expired} expired / ${total} total`);

  stream.emit(new Event('watchdog.gap.open', {
    source:   'clear-glass.cookie.health',
    agentId,
    severity: expired > 5 ? 'high' : 'medium',
    summary:  `Agent ${agentId}: ${expired} expired cookies`,
    action:   'cookie.restore',
    ts:       Date.now(),
  }));

  // Forward gap to Cortex if bus is available
  _notifyCortex(nexusBusUrl, 'cookie.health.fail', { agentId, expired, total });
});

// ── Diagnostic failure watchdog ────────────────────────────────────────────
// Failed diagnostic run → open Cortex gap, log details
const diagWatchdog = (nexusBusUrl) => gate('diag.complete', (event, stream) => {
  const { runId, label, passed, failed, total, results } = event.data;
  if (event.data.success) return; // pass — nothing to do

  console.log(`[Watchdog] Diagnostic failed [${label}]: ${passed}/${total}`);

  const failedSteps = (results || []).filter(r => !r.passed).map(r => r.label);

  stream.emit(new Event('watchdog.gap.open', {
    source:      'clear-glass.diagnostic',
    runId,
    severity:    failed > total / 2 ? 'high' : 'medium',
    summary:     `${label}: ${failed} steps failed`,
    failedSteps,
    action:      'diag.run',
    ts:          Date.now(),
  }));

  _notifyCortex(nexusBusUrl, 'diag.failure', { runId, label, passed, failed, failedSteps });
});

// ── Driver error watchdog ──────────────────────────────────────────────────
// Driver errors → log to Cortex, retry if retryable
const driverErrorWatchdog = (nexusBusUrl) => gate('driver.error', (event, stream) => {
  const { action, agentId, error, requestId } = event.data;

  console.warn(`[Watchdog] Driver error [${action}] on ${agentId}: ${error}`);

  const retryable = !error?.includes('timeout') && !error?.includes('not found');

  stream.emit(new Event('watchdog.driver.error', {
    action, agentId, error, requestId, retryable, ts: Date.now(),
  }));

  if (retryable) {
    // Emit retry signal — gates downstream can act on it
    stream.emit(new Event('driver.retry', { action, agentId, requestId, error }));
  }

  _notifyCortex(nexusBusUrl, 'driver.error', { action, agentId, error });
});

// ── Token relay watchdog ───────────────────────────────────────────────────
// DOM token scan results → relay to Cortex intelligence
const tokenRelayWatchdog = (nexusBusUrl) => gate('dom.tokens.result', (event, stream) => {
  const { agentId, result } = event.data;
  if (!result) return;

  const hasApiCalls = result.apiCalls?.length > 0;
  const hasModels   = result.modelRefs?.length > 0;

  if (!hasApiCalls && !hasModels) return; // nothing interesting

  console.log(`[Watchdog] Token scan hit on ${agentId} — ${result.apiCalls?.length} API calls, ${result.modelRefs?.length} model refs`);

  stream.emit(new Event('watchdog.tokens.found', {
    agentId,
    apiCallCount: result.apiCalls?.length,
    modelRefs:    result.modelRefs?.slice(0, 5),
    ts:           Date.now(),
  }));

  _notifyCortex(nexusBusUrl, 'tokens.found', { agentId, result });
});

// ── Mesh error watchdog ────────────────────────────────────────────────────
// Agent mesh errors → demote health, reroute
const meshErrorWatchdog = () => gate('mesh.error', (event, stream) => {
  const { op, agentKey, error } = event.data;

  console.warn(`[Watchdog] Mesh error [${op}] on ${agentKey}: ${error}`);

  stream.emit(new Event('watchdog.mesh.demote', {
    agentKey,
    op,
    error,
    ts: Date.now(),
  }));

  // If send failed, try routing to another agent
  if (op === 'send' || op === 'route') {
    stream.emit(new Event('mesh.route', {
      prompt:        event.data.prompt,
      preferAgent:   null, // let RAID pick fresh
      _meta:         { reason: 'mesh-error-fallback', failedAgent: agentKey },
    }));
  }
});

// ── NEXUS offline watchdog ─────────────────────────────────────────────────
// NEXUS bus goes offline → queue commands, surface alert
const nexusOfflineWatchdog = () => {
  let _offlineSince = null;
  let _queue = [];

  return gate('nexus.status', (event, stream) => {
    const { connected } = event.data;

    if (!connected && !_offlineSince) {
      _offlineSince = Date.now();
      console.warn('[Watchdog] NEXUS bus offline — queuing commands');
      stream.emit(new Event('watchdog.nexus.offline', { since: _offlineSince }));
    }

    if (connected && _offlineSince) {
      const downtime = Date.now() - _offlineSince;
      console.log(`[Watchdog] NEXUS bus back online after ${Math.round(downtime/1000)}s`);
      _offlineSince = null;

      stream.emit(new Event('watchdog.nexus.reconnected', {
        downtime,
        queueDepth: _queue.length,
        ts:         Date.now(),
      }));

      // Flush queued commands
      for (const cmd of _queue) {
        stream.emit(new Event(cmd.type, cmd.data));
      }
      _queue = [];
    }
  });
};

// ── Seam stall watchdog ────────────────────────────────────────────────────
// Detects stalled SEAM sessions (no progress for > 5 minutes)
const seamStallWatchdog = () => {
  const _sessions = new Map(); // sessionId → { startedAt, lastActivity }

  // Track session starts
  const startGate = gate('seam.session.started', (event, stream) => {
    const { sessionId } = event.data;
    _sessions.set(sessionId, { startedAt: Date.now(), lastActivity: Date.now() });
  });

  // Track session activity
  const activityGate = gate('seam.session.activity', (event, stream) => {
    const { sessionId } = event.data;
    if (_sessions.has(sessionId)) _sessions.get(sessionId).lastActivity = Date.now();
  });

  // Periodic stall check
  setInterval(() => {
    const now     = Date.now();
    const STALL   = 5 * 60 * 1000; // 5 minutes
    for (const [id, s] of _sessions) {
      if (now - s.lastActivity > STALL) {
        console.warn(`[Watchdog] SEAM stall detected: ${id}`);
        // Can't emit directly without stream ref here — emit via bus module
        try {
          const { emit } = require('../src/core/bus');
          emit('watchdog.seam.stall', { sessionId: id, stalledFor: now - s.lastActivity });
        } catch {}
        _sessions.delete(id);
      }
    }
  }, 60000); // check every minute

  return [startGate, activityGate];
};

// ── URL match relay ────────────────────────────────────────────────────────
// URL match hits → relay to Cortex memory if hook specifies
const urlMatchRelayWatchdog = (nexusBusUrl) => gate('url.match', (event, stream) => {
  const { listenerId, label, hook, url, agentId } = event.data;

  // If the hook is a Cortex hook, relay it
  if (hook?.startsWith('cortex.')) {
    _notifyCortex(nexusBusUrl, hook, event.data);
  }

  stream.emit(new Event('watchdog.url.relayed', {
    listenerId, label, hook, url, agentId, ts: Date.now(),
  }));
});

// ── Helper: notify Cortex ──────────────────────────────────────────────────
function _notifyCortex(nexusBusUrl, type, data) {
  if (!nexusBusUrl) return;
  // §BUGFIX 2026-08-23 — same real, missing node-fetch dependency as
  // copilot/bridge.js — Node's own global fetch() replaces it, no
  // require needed.
  fetch(`${nexusBusUrl}/api/event`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type, data, source: 'clear-glass', ts: Date.now() }),
    timeout: 3000,
  }).catch(() => {}); // non-fatal
}

// ── Register all watchdog gates ────────────────────────────────────────────
function registerWatchdogs(bus, { mesh, nexusBusUrl }) {
  const gates = [
    rateLimitWatchdog(mesh),
    cookieHealthWatchdog(nexusBusUrl),
    diagWatchdog(nexusBusUrl),
    driverErrorWatchdog(nexusBusUrl),
    tokenRelayWatchdog(nexusBusUrl),
    meshErrorWatchdog(),
    nexusOfflineWatchdog(),
    urlMatchRelayWatchdog(nexusBusUrl),
  ];

  // Stall watchdog returns multiple gates
  const stallGates = seamStallWatchdog();

  for (const g of [...gates, ...stallGates]) {
    try { bus.register(g); }
    catch (err) {
      // Signature collision means another gate already owns this — log and skip
      console.warn(`[Watchdog] Gate '${g.signature}' already registered — skipping: ${err.message}`);
    }
  }

  console.log(`[Watchdog] ${gates.length + stallGates.length} watchdog gates active`);
}

module.exports = {
  registerWatchdogs,
  // Export individual gate factories for testing
  rateLimitWatchdog,
  cookieHealthWatchdog,
  diagWatchdog,
  driverErrorWatchdog,
  tokenRelayWatchdog,
  meshErrorWatchdog,
  nexusOfflineWatchdog,
  urlMatchRelayWatchdog,
};
