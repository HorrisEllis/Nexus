'use strict';
// ── cortex/guardian/watchman.js ───────────────────────────────────────────────
// UUID: cortex-guardian-watchman-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// WATCHMAN — Guardian health synthesizer and alarm system.
// Reads guardian_nodes every 5s. Writes one guardian_health row per tick.
// Emits high-severity gaps when healthScore < 0.3 or connected = false.
// Single source of truth for "is Guardian available right now?"
//
// LAW I   — no agent calls.
// LAW II  — guardian_health row written before any downstream action.
// LAW III — imports only jaa-db and working-memory.
// LAW IV  — guardian_health rows validated inline against spec schema.
// LAW V   — guardian watchman status / history CLI.
// LAW VI  — every connection/health state transition toasted.
//
// COBALT: guardian.watchman | bootPhase: 11 | pollMs: 5000
// reads:  guardian_nodes
// writes: guardian_health, gaps, toasts, failures, event_log

const { jaaDB, uid } = require('../memory/jaa-db');
const { getWM }      = require('../working-memory');

const MODULE_ID     = 'guardian.watchman';
const VERSION       = '1.0.0';
const POLL_MS       = 5000;
const FRESH_MS      = 12_000;  // connected if heartbeat within 12s
const STALE_MS      = 25_000;  // stale if heartbeat > 25s ago
const LOW_HEALTH_T  = 0.3;     // gap threshold
const RESTORE_T     = 0.5;     // hysteresis: gap clears when score >= this

// ── State ─────────────────────────────────────────────────────────────────────
let _interval            = null;
let _disconnectedGapOpen = false;
let _lowHealthGapOpen    = false;
let _prevNodeListeners   = new Map(); // instanceId → listenerCount (for lost listener detection)

// ── Inline validation ─────────────────────────────────────────────────────────
function _validateHealth(row) {
  const required = ['uuid', 'connected', 'listenerCount', 'sessionCount', 'healthScore', 'ts', 'source'];
  for (const f of required) {
    if (row[f] === undefined || row[f] === null) return `missing: ${f}`;
  }
  if (typeof row.healthScore !== 'number') return 'healthScore must be number';
  if (typeof row.connected !== 'boolean')  return 'connected must be boolean';
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fail(msg, causedBy = null) {
  try {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: msg, causedBy, ts: Date.now() });
  } catch (_) {}
  _toast('toast.error', msg, causedBy);
}

function _toast(type, message, causedBy = null, actions = []) {
  try {
    jaaDB.insert('toasts', {
      uuid: uid(), type, module: MODULE_ID, message,
      causedBy, ts: Date.now(), autoClose: 5000, actions,
    });
  } catch (_) {}
}

function _insertGap(type, path, body, severity, causedBy) {
  try {
    jaaDB.insert('gaps', {
      uuid: uid(), type, path, body, severity,
      status: 'open', source: MODULE_ID,
      causedBy, createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
  } catch (_) {}
}

function _closeGap(type, path) {
  const gap = jaaDB.query('gaps', g =>
    g.type === type && g.path === path && g.status === 'open', 1
  )[0];
  if (gap) {
    try { jaaDB.update('gaps', gap.uuid, { status: 'filled', resolvedAt: Date.now() }); } catch (_) {}
  }
}

// ── Lost listener detection ───────────────────────────────────────────────────
function _identifyLostListeners(activeNodes) {
  const lost = [];
  for (const node of activeNodes) {
    const prev = _prevNodeListeners.get(node.instanceId);
    if (prev !== undefined && node.listenerCount < prev) {
      lost.push(node.instanceId);
    }
  }
  // Update prev map
  _prevNodeListeners.clear();
  for (const node of activeNodes) {
    _prevNodeListeners.set(node.instanceId, node.listenerCount);
  }
  return lost;
}

// ── Poll tick ─────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    // 1. Read guardian_nodes
    const allNodes = jaaDB.query('guardian_nodes', () => true, 500);
    const now      = Date.now();

    // 2. Classify
    const activeNodes = allNodes.filter(n => now - (n.lastSeen || 0) <= FRESH_MS);
    const staleNodes  = allNodes.filter(n => now - (n.lastSeen || 0) > STALE_MS);
    const connected   = activeNodes.length > 0;

    // 3. Aggregate stats
    const listenerCount = activeNodes.reduce((s, n) => s + (n.listenerCount || 0), 0);
    const sessionCount  = activeNodes.reduce((s, n) => s + (n.tabCount || 0), 0);
    const staleNodeIds  = staleNodes.map(n => n.instanceId);

    // 4. Detect lost listeners
    const lostListeners = _identifyLostListeners(activeNodes);

    // 5. Composite healthScore
    let healthScore;
    if (!connected) {
      healthScore = 0;
    } else {
      const listenerScore = Math.min(1, listenerCount / 2);
      const sessionScore  = Math.min(1, sessionCount  / 1);
      const staleRatio    = staleNodes.length / Math.max(1, allNodes.length);
      healthScore = 0.4 * listenerScore + 0.4 * sessionScore + 0.2 * (1 - staleRatio);
      healthScore = Math.max(0, Math.min(1, parseFloat(healthScore.toFixed(3))));
    }

    // 6. Latest node UUID for causedBy
    const latestNode = activeNodes.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
    const causedBy   = latestNode?.uuid || null;

    // 7. Write guardian_health row (LAW II — before gap/toast)
    const healthRow = {
      uuid:          uid(),
      connected,
      listenerCount,
      sessionCount,
      staleNodes:    staleNodeIds,
      lostListeners,
      healthScore,
      ts:            now,
      source:        MODULE_ID,
      causedBy,
    };

    const err = _validateHealth(healthRow);
    if (err) {
      _fail(`guardian_health validation failed: ${err}`);
      try {
        jaaDB.insert('law_violations', {
          uuid: uid(), law: 'LAW_IV', module: MODULE_ID,
          description: `guardian_health schema violation: ${err}`, severity: 'high',
          causedBy: null, ts: Date.now(),
        });
      } catch (_) {}
      return; // Do not insert invalid health row
    }

    try {
      jaaDB.insert('guardian_health', healthRow);
    } catch (e) {
      _fail(`guardian_health insert failed: ${e.message}`);
      return;
    }

    // Write to WM
    getWM().write('guardian.watchman.health', { connected, healthScore, listenerCount, sessionCount }, {
      source: MODULE_ID, causedBy,
    });

    // 8. Threshold checks

    // Condition A — disconnected
    if (!connected && !_disconnectedGapOpen) {
      _disconnectedGapOpen = true;
      _insertGap('dead_listener', 'guardian/all', 'All Guardian instances disconnected', 'high', causedBy);
      _toast('toast.error', 'Guardian disconnected — no active instances', causedBy);
      getWM().write('guardian.watchman.disconnected', { healthScore: 0 }, { source: MODULE_ID, causedBy });
    }
    if (connected && _disconnectedGapOpen) {
      _disconnectedGapOpen = false;
      _closeGap('dead_listener', 'guardian/all');
      _toast('toast.success', `Guardian reconnected — ${activeNodes.length} instance(s) active`, causedBy);
      getWM().write('guardian.watchman.reconnected', { activeCount: activeNodes.length }, { source: MODULE_ID, causedBy });
    }

    // Condition B — low health
    if (healthScore < LOW_HEALTH_T && !_lowHealthGapOpen) {
      _lowHealthGapOpen = true;
      _insertGap('behavior_gap', 'guardian/health', `Guardian health degraded: ${healthScore.toFixed(2)}`, 'high', causedBy);
      _toast('toast.error', `Guardian health degraded: score=${healthScore.toFixed(2)}`, causedBy);
    }
    if (healthScore >= RESTORE_T && _lowHealthGapOpen) {
      _lowHealthGapOpen = false;
      _closeGap('behavior_gap', 'guardian/health');
      _toast('toast.success', `Guardian health restored: score=${healthScore.toFixed(2)}`, causedBy);
    }

    // Condition C — lost listeners (warn only)
    if (lostListeners.length > 0) {
      _toast('toast.warn', `Guardian: ${lostListeners.length} listener(s) lost (${lostListeners.join(', ')})`, causedBy);
      try {
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'guardian.listeners.lost',
          source: MODULE_ID, payload: { lostListeners }, causedBy, ts: now,
        });
      } catch (_) {}
    }

    // 9. Cockpit resonance events
    const resonanceState = !connected || healthScore < LOW_HEALTH_T ? 'critical'
                         : healthScore < 0.6                         ? 'degraded'
                         :                                             'healthy';
    if (resonanceState !== 'healthy') {
      try {
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'cobalt.resonance.guardian',
          source: MODULE_ID,
          payload: { state: resonanceState, healthScore, connected },
          causedBy, ts: now,
        });
      } catch (_) {}
    }

  } catch (err) {
    _fail(`tick error: ${err.message}`, null);
  }
}

// ── init / stop ───────────────────────────────────────────────────────────────
function init(cfg = {}) {
  const pollMs = cfg.pollMs ?? POLL_MS;
  _interval = setInterval(_tick, pollMs);
  _interval.unref();

  getWM().write('guardian.watchman.started', { version: VERSION }, { source: MODULE_ID });
  console.log(`[${MODULE_ID}] v${VERSION} started — polling every ${pollMs}ms`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function latestHealth() {
  return jaaDB.tail('guardian_health', 1)[0] || null;
}

function healthHistory(n = 20) {
  return jaaDB.tail('guardian_health', n);
}

module.exports = { init, stop, latestHealth, healthHistory, MODULE_ID, VERSION };
