'use strict';
// ── guardian/watchman.js ──────────────────────────────────────────────────────
// UUID: guardian-watchman
// VERSION: 5.1.0  — §5.4 one version everywhere
// COBALT: guardian.watchman | bootPhase: 11 | pollMs: 5000
//
// Reads guardian_nodes (written by Pulse).
// Writes: guardian_health (one row every 5s).
// Emits: cobalt.resonance.guardian events → cockpit guardian-pill via SSE.
// Emits gaps on disconnect / health < 0.3.
//
// QUEUE MANAGER INTEGRATION:
//   queue-manager reads guardian_health before dispatching guardian-* steps.
//   Watchman does NOT call queue-manager. LAW III.
//
// COCKPIT INTEGRATION:
//   cockpit SSE stream (admin-server GET /sse) pushes event_log rows.
//   Watchman writes cobalt.resonance.guardian to event_log → cockpit gets it for free.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID          = 'guardian.watchman';
const FRESH_THRESHOLD_MS = 12_000;
const STALE_THRESHOLD_MS = 25_000;

let _interval             = null;
let _prevNodeListeners    = {};   // instanceId → listenerCount from last tick
let _disconnectedGapOpen  = false;
let _disconnectedGapUuid  = null;
let _lowHealthGapOpen     = false;
let _lowHealthGapUuid     = null;

// ── init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _interval = setInterval(_tick, cfg.pollMs ?? 5000);
  _interval.unref();
  console.log('[watchman] init');
  _toast('toast.info', `${MODULE_ID} started`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── tick ──────────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    const allNodes = jaaDB.query('guardian_nodes', () => true, 500);
    const now      = Date.now();

    // 1. Classify nodes
    const activeNodes = allNodes.filter(n => now - n.lastSeen <= FRESH_THRESHOLD_MS);
    const staleNodes  = allNodes.filter(n => now - n.lastSeen >  STALE_THRESHOLD_MS);
    const connected   = activeNodes.length > 0;

    // 2. Aggregate stats
    const listenerCount = activeNodes.reduce((s, n) => s + (n.listenerCount || 0), 0);
    const sessionCount  = activeNodes.reduce((s, n) => s + (n.tabCount || 0), 0);
    const staleNodeIds  = staleNodes.map(n => n.instanceId);

    // 3. Detect lost listeners
    const lostListeners = _identifyLostListeners(allNodes);

    // 4. Composite health score
    let healthScore;
    if (!connected) {
      healthScore = 0;
    } else {
      const listenerScore = Math.min(1, listenerCount / 2);
      const sessionScore  = Math.min(1, sessionCount  / 1);
      const staleRatio    = staleNodes.length / Math.max(1, allNodes.length);
      healthScore = 0.4 * listenerScore + 0.4 * sessionScore + 0.2 * (1 - staleRatio);
      healthScore = Math.max(0, Math.min(1, healthScore));
    }

    // 5. Write guardian_health row (LAW II — row first)
    const latestNode = activeNodes[0] || allNodes[0];
    const healthRow = jaaDB.insert('guardian_health', {
      uuid:          uid(),
      connected,
      listenerCount,
      sessionCount,
      staleNodes:    staleNodeIds,
      lostListeners,
      healthScore,
      ts:            now,
      source:        MODULE_ID,
      causedBy:      latestNode?.uuid ?? null,
    });

    // 6. Threshold checks + gap emission
    _checkDisconnected(connected, activeNodes.length);
    _checkLowHealth(healthScore);
    if (lostListeners.length > 0) _checkLostListeners(lostListeners);

    // 7. cobalt.resonance.guardian → cockpit SSE
    const resonanceState = !connected || healthScore < 0.3 ? 'critical'
                         : healthScore < 0.6 ? 'degraded'
                         : 'healthy';

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'cobalt.resonance.guardian',
      payload: {
        state:        resonanceState,
        healthScore,
        connected,
        listenerCount,
        sessionCount,
        staleNodes:   staleNodeIds,
        activeNodes:  activeNodes.length,
      },
      source:  MODULE_ID,
      causedBy: healthRow.uuid,
      ts:      now,
    });

    // 8. Update prevNodeListeners for next tick
    for (const n of allNodes) {
      _prevNodeListeners[n.instanceId] = n.listenerCount || 0;
    }

  } catch (err) {
    _recordFailure(err, null);
    // Safe degradation: write health=disconnected so queue manager blocks guardian calls
    try {
      jaaDB.insert('guardian_health', {
        uuid: uid(), connected: false, listenerCount: 0, sessionCount: 0,
        staleNodes: [], lostListeners: [], healthScore: 0,
        ts: Date.now(), source: MODULE_ID, causedBy: null,
      });
    } catch (innerErr) { console.error("[guardian-layer] inner failure:", innerErr.message); }
  }
}

// ── threshold checks ──────────────────────────────────────────────────────────
function _checkDisconnected(connected, activeCount) {
  if (!connected && !_disconnectedGapOpen) {
    const gap = jaaDB.insert('gaps', {
      uuid:      uid(),
      type:      'dead_listener',
      path:      'guardian/all',
      body:      'All Guardian instances disconnected',
      severity:  'high',
      nodeId:    MODULE_ID,
      status:    'open',
      causedBy:  null,
      createdAt: Date.now(),
    });
    _disconnectedGapUuid = gap.uuid;
    _disconnectedGapOpen = true;
    _toast('toast.error', `${MODULE_ID}: Guardian disconnected — no active instances`);
  }
  if (connected && _disconnectedGapOpen) {
    if (_disconnectedGapUuid) {
      jaaDB.update('gaps', _disconnectedGapUuid, { status: 'filled', closedAt: Date.now() });
    }
    _disconnectedGapOpen = false;
    _disconnectedGapUuid = null;
    _toast('toast.success', `${MODULE_ID}: Guardian reconnected — ${activeCount} instance(s) active`);
  }
}

function _checkLowHealth(healthScore) {
  if (healthScore < 0.3 && !_lowHealthGapOpen) {
    const gap = jaaDB.insert('gaps', {
      uuid:      uid(),
      type:      'behavior_gap',
      path:      'guardian/health',
      body:      `Guardian health degraded: ${healthScore.toFixed(2)}`,
      severity:  'high',
      nodeId:    MODULE_ID,
      status:    'open',
      causedBy:  null,
      createdAt: Date.now(),
    });
    _lowHealthGapUuid = gap.uuid;
    _lowHealthGapOpen = true;
    _toast('toast.error', `${MODULE_ID}: Guardian health degraded: score=${healthScore.toFixed(2)}`);
  }
  if (healthScore >= 0.5 && _lowHealthGapOpen) {
    if (_lowHealthGapUuid) {
      jaaDB.update('gaps', _lowHealthGapUuid, { status: 'filled', closedAt: Date.now() });
    }
    _lowHealthGapOpen = false;
    _lowHealthGapUuid = null;
    _toast('toast.success', `${MODULE_ID}: Guardian health restored: score=${healthScore.toFixed(2)}`);
  }
}

function _checkLostListeners(lostListeners) {
  _toast('toast.warn', `${MODULE_ID}: ${lostListeners.length} listener(s) lost (${lostListeners.join(', ')})`);
  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'guardian.listeners.lost',
    payload: { lostListeners },
    source:  MODULE_ID,
    causedBy: null,
    ts:      Date.now(),
  });
}

// ── lost listener detection ───────────────────────────────────────────────────
function _identifyLostListeners(allNodes) {
  const lost = [];
  for (const n of allNodes) {
    const prev = _prevNodeListeners[n.instanceId] ?? 0;
    const curr = n.listenerCount || 0;
    if (curr < prev) lost.push(n.instanceId);
  }
  return lost;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _toast(type, msg) {
  try {
    jaaDB.insert('toasts', { uuid: uid(), type, msg, source: MODULE_ID, ts: Date.now() });
  } catch (innerErr) {
    console.error(`[${mod_id.replace(".","-")}] toast insert failed:`, innerErr.message);
  }
}

function _recordFailure(err, causedBy) {
  try {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack,
      causedBy: causedBy ?? null, ts: Date.now(),
    });
  } catch (innerErr) {
    console.error(`[${mod_id.replace(".","-")}] failure insert failed:`, innerErr.message);
  }
}

// ── CLI status ────────────────────────────────────────────────────────────────
function status() {
  const latest = jaaDB.tail('guardian_health', 1)[0];
  if (!latest) return '[WATCHMAN] WARN  no health records yet';

  const age = Math.round((Date.now() - latest.ts) / 1000);
  const connStr = latest.connected ? `YES (${latest.sessionCount} tabs)` : 'NO';
  const lines = [
    `[WATCHMAN] ${latest.connected ? 'OK   ' : 'ERROR'}  connected: ${connStr}`,
    `[WATCHMAN] OK     listeners: ${latest.listenerCount}  sessions: ${latest.sessionCount}`,
    `[WATCHMAN] OK     health score: ${(latest.healthScore||0).toFixed(2)}`,
    `[WATCHMAN] INFO   stale nodes: ${latest.staleNodes?.length ? latest.staleNodes.join(', ') : 'none'}`,
    `[WATCHMAN] INFO   lost listeners: ${latest.lostListeners?.length ? latest.lostListeners.join(', ') : 'none'}`,
    `[WATCHMAN] INFO   last health record: ${age}s ago`,
  ];
  if (_disconnectedGapOpen) lines.push('[WATCHMAN] ERROR  fallback: queue manager routing to API Claude (LAW I)');
  // §2.3 — all state must be observable
  const listenersStr = Object.entries(_prevNodeListeners).map(([id,n])=>`${id}:${n}`).join(', ') || 'none';
  lines.push(`[WATCHMAN] INFO   prev listener map: ${listenersStr}`);
  return lines.join('\n');
}

// ── External read — used by queue-manager, RAID, callto-executor ─────────────
// Returns the latest guardian_health row directly.
// LAW III: other modules must read guardian_health via jaaDB, not this export.
// This helper is provided for convenience in boot contexts only.
function latestHealth() {
  return jaaDB.tail('guardian_health', 1)[0] ?? { connected: false, healthScore: 0 };
}

module.exports = { init, stop, status, latestHealth };
