'use strict';
// ── guardian/pulse.js ─────────────────────────────────────────────────────────
// UUID: guardian-pulse
// VERSION: 5.1.0  — §5.4 one version everywhere
// COBALT: guardian.pulse | bootPhase: 11 | pollMs: 3000
//
// Reads guardian.heartbeat events from event_log.
// Maintains guardian_nodes table: one row per connected Guardian instance.
// Detects stale nodes (>25s), emits gaps + toasts.
// Provides live data for Watchman, cockpit guardian-pill, RAID routing.
//
// LAW III: does NOT import from siphon or watchman.
// LAW II: JAA row first, then behavior.
// §M1 everything stored — stale rows stay for audit, not deleted.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID        = 'guardian.pulse';
const STALE_MS         = 25_000;   // no heartbeat in 25s → stale
const DEAD_MS          = 120_000;  // no heartbeat in 120s → dead
const BATCH            = 100;
const EXPECTED_CAPS    = ['claude', 'chatgpt', 'capture', 'inject'];

let _interval          = null;
let _lastHbRowId       = 0;
let _gappedInstances   = new Set();   // instanceIds with open stale gaps
let _openGapUuids      = new Map();   // instanceId → gap uuid
let _seenInstances     = new Set();   // instanceIds ever seen (for toast dedup)

// ── init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  // Resume watermark from last guardian_nodes row
  const last = jaaDB.tail('guardian_nodes', 1)[0];
  if (last?.causedBy) {
    const src = jaaDB.query('event_log', e => e.uuid === last.causedBy, 1)[0];
    if (src?._rowId) _lastHbRowId = src._rowId;
  }

  _interval = setInterval(_tick, cfg.pollMs ?? 3000);
  _interval.unref();
  _toast('toast.info', `${MODULE_ID} started — watermark: ${_lastHbRowId}`);
  console.log(`[pulse] init — watermark ${_lastHbRowId}`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── tick ──────────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    // 1. Read new heartbeat events
    const events = jaaDB.query('event_log',
      e => e.type === 'guardian.heartbeat' && e._rowId > _lastHbRowId,
      BATCH
    );

    for (const event of events) {
      try { await _processHeartbeat(event); }
      catch (err) { _recordFailure(err, event.uuid); }
      finally { _lastHbRowId = Math.max(_lastHbRowId, event._rowId ?? 0); }
    }

    // 2. Stale + dead detection (runs every tick regardless of new events)
    _detectStale();

  } catch (err) {
    _recordFailure(err, null);
  }
}

// ── heartbeat processing ──────────────────────────────────────────────────────
async function _processHeartbeat(event) {
  const p = event.payload || {};
  const instanceId = p.instanceId || event.source;

  if (!instanceId) {
    _recordFailure(new Error('heartbeat missing instanceId'), event.uuid);
    _toast('toast.warn', `${MODULE_ID}: malformed heartbeat ${event.uuid} — skipped`);
    return;
  }

  const capabilities = Array.isArray(p.capabilities) ? p.capabilities : [];
  const healthScore  = _computeHealthScore({ ...p, capabilities, _eventTs: event.ts });

  // Upsert guardian_nodes
  const existing = jaaDB.query('guardian_nodes', n => n.instanceId === instanceId, 1)[0];

  if (existing) {
    jaaDB.update('guardian_nodes', existing.uuid, {
      lastSeen:      event.ts,
      capabilities,
      tabCount:      p.tabCount      ?? 0,
      listenerCount: p.listenerCount ?? 0,
      healthScore,
      ts:            event.ts,
    });
  } else {
    jaaDB.insert('guardian_nodes', {
      uuid:          uid(),
      instanceId,
      lastSeen:      event.ts,
      capabilities,
      tabCount:      p.tabCount      ?? 0,
      listenerCount: p.listenerCount ?? 0,
      healthScore,
      ts:            event.ts,
      source:        MODULE_ID,
      causedBy:      event.uuid,
    });
  }

  // First-time seen toast
  if (!_seenInstances.has(instanceId)) {
    _seenInstances.add(instanceId);
    _toast('toast.info', `${MODULE_ID}: new Guardian instance ${instanceId} — health ${healthScore.toFixed(2)}`);
  }

  // Clear stale gap if this node was gapped
  if (_gappedInstances.has(instanceId)) {
    _gappedInstances.delete(instanceId);
    const gapUuid = _openGapUuids.get(instanceId);
    if (gapUuid) {
      jaaDB.update('gaps', gapUuid, { status: 'filled', closedAt: Date.now() });
      _openGapUuids.delete(instanceId);
    }
    _toast('toast.success', `${MODULE_ID}: Guardian instance ${instanceId} reconnected`);
  }
}

// ── stale + dead detection ────────────────────────────────────────────────────
function _detectStale() {
  const allNodes = jaaDB.query('guardian_nodes', () => true, 500);
  const now      = Date.now();

  for (const node of allNodes) {
    const age = now - node.lastSeen;

    // Dead pruning (120s) — emit event, stop tracking
    if (age > DEAD_MS && _gappedInstances.has(node.instanceId)) {
      _gappedInstances.delete(node.instanceId);
      _openGapUuids.delete(node.instanceId);
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'guardian.node.dead',
        payload: { instanceId: node.instanceId, age },
        source: MODULE_ID, causedBy: node.uuid, ts: now,
      });
      _toast('toast.warn', `${MODULE_ID}: Guardian instance ${node.instanceId} declared dead (${Math.round(age/1000)}s)`);
      continue;
    }

    // Stale detection (25s)
    if (age > STALE_MS && !_gappedInstances.has(node.instanceId)) {
      _gappedInstances.add(node.instanceId);

      const gapRow = jaaDB.insert('gaps', {
        uuid:      uid(),
        type:      'stale_module',
        path:      `guardian_nodes/${node.instanceId}`,
        body:      `Guardian instance ${node.instanceId} stale — last heartbeat ${Math.round(age/1000)}s ago`,
        severity:  'high',
        nodeId:    MODULE_ID,
        status:    'open',
        causedBy:  node.uuid,
        createdAt: now,
      });
      _openGapUuids.set(node.instanceId, gapRow.uuid);
      _toast('toast.gap', `${MODULE_ID}: Guardian instance ${node.instanceId} stale — last seen ${Math.round(age/1000)}s ago`);
    }
  }
}

// ── healthScore formula (spec §PULSE) ─────────────────────────────────────────
function _computeHealthScore({ listenerCount = 0, tabCount = 0, capabilities = [], _eventTs }) {
  let score = 1.0;
  if (listenerCount === 0)  score -= 0.3;
  if (tabCount === 0)        score -= 0.2;
  const missing = EXPECTED_CAPS.filter(c => !capabilities.includes(c)).length;
  score -= missing * 0.1;
  // Late heartbeat penalty
  if (_eventTs) {
    const ageMs = Date.now() - _eventTs;
    if (ageMs > 15_000) score -= 0.2;
  }
  return Math.max(0, Math.min(1, score));
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

// ── CLI status handler ────────────────────────────────────────────────────────
function status() {
  const nodes = jaaDB.query('guardian_nodes', () => true, 100);
  const now   = Date.now();
  if (!nodes.length) return '[PULSE]  INFO   no Guardian nodes seen';
  return nodes.map(n => {
    const age    = Math.round((now - n.lastSeen) / 1000);
    const stale  = age > 25 ? ' ⚠ STALE' : '';
    const status = age > 25 ? 'WARN' : 'OK  ';
    return `[PULSE]  ${status}   ${n.instanceId} | ${(n.capabilities||[]).join(',')||'—'} | tabs:${n.tabCount} | listeners:${n.listenerCount} | health:${(n.healthScore||0).toFixed(2)} | last:${age}s ago${stale}`;
  }).join('\n');
}

module.exports = { init, stop, status };
