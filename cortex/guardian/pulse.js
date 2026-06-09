'use strict';
// ── cortex/guardian/pulse.js ──────────────────────────────────────────────────
// UUID: cortex-guardian-pulse-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// PULSE — Heartbeat consumer and mesh topology builder.
// Reads guardian.heartbeat events from event_log.
// Maintains guardian_nodes table: upsert on every fresh beat.
// Detects stale nodes (>25s), gaps on dead (>120s).
//
// LAW I   — no agent calls. Pure data processor.
// LAW II  — guardian_nodes row written before any gap/toast fires.
// LAW III — imports only jaa-db and working-memory.
// LAW IV  — guardian_nodes rows validated inline.
// LAW V   — guardian pulse status / guardian pulse node <id> CLI.
// LAW VI  — every node state transition toasted.
//
// COBALT: guardian.pulse | bootPhase: 11 | pollMs: 3000
// reads:  event_log
// writes: guardian_nodes, gaps, toasts, failures, event_log

const { jaaDB, uid } = require('../memory/jaa-db');
const { getWM }      = require('../working-memory');

const MODULE_ID   = 'guardian.pulse';
const VERSION     = '1.0.0';
const POLL_MS     = 3000;
const STALE_MS    = 25_000;
const DEAD_MS     = 120_000;
const EXPECTED_CAPS = ['claude', 'chatgpt', 'capture', 'inject'];

// ── State ─────────────────────────────────────────────────────────────────────
let _interval        = null;
let _lastHbRowId     = 0;
let _gappedInstances = new Set();  // instanceIds with open stale gaps
let _deadInstances   = new Set();  // instanceIds declared dead (pruned from tracking)

// ── Health score formula (from spec) ─────────────────────────────────────────
function _computeHealthScore(payload, eventTs) {
  const ageMs      = Date.now() - (eventTs || Date.now());
  const lisCount   = payload.listenerCount ?? 0;
  const tabCount   = payload.tabCount      ?? 0;
  const caps       = Array.isArray(payload.capabilities) ? payload.capabilities : [];
  const missing    = EXPECTED_CAPS.filter(c => !caps.includes(c)).length;

  let score = 1.0;
  if (lisCount === 0) score -= 0.3;
  if (tabCount === 0) score -= 0.2;
  score -= missing * 0.1;
  if (ageMs > 15000)  score -= 0.2;  // late heartbeat

  return Math.max(0, Math.min(1, parseFloat(score.toFixed(3))));
}

// ── Inline validation ─────────────────────────────────────────────────────────
function _validateNode(row) {
  const required = ['uuid', 'instanceId', 'lastSeen', 'healthScore', 'ts', 'source'];
  for (const f of required) {
    if (row[f] === undefined || row[f] === null) return `missing: ${f}`;
  }
  if (typeof row.healthScore !== 'number') return 'healthScore must be number';
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

// ── Upsert guardian_nodes ─────────────────────────────────────────────────────
function _upsertNode(instanceId, payload, eventTs, eventUuid) {
  const healthScore = _computeHealthScore(payload, eventTs);
  const caps        = Array.isArray(payload.capabilities) ? payload.capabilities : [];

  const existing = jaaDB.query('guardian_nodes', n => n.instanceId === instanceId, 1)[0];

  const isNew = !existing;
  const rowUuid = existing?.uuid || uid();

  const nodeRow = {
    uuid:          rowUuid,
    instanceId,
    lastSeen:      eventTs || Date.now(),
    capabilities:  caps,
    tabCount:      payload.tabCount      ?? 0,
    listenerCount: payload.listenerCount ?? 0,
    healthScore,
    ts:            eventTs || Date.now(),
    source:        MODULE_ID,
  };

  const err = _validateNode(nodeRow);
  if (err) {
    _fail(`guardian_nodes validation failed: ${err}`, eventUuid);
    try {
      jaaDB.insert('law_violations', {
        uuid: uid(), law: 'LAW_IV', module: MODULE_ID,
        description: `guardian_nodes schema violation: ${err}`, severity: 'high',
        causedBy: eventUuid, ts: Date.now(),
      });
    } catch (_) {}
    return null;
  }

  try {
    if (isNew) {
      jaaDB.insert('guardian_nodes', nodeRow);
      getWM().write('guardian.pulse.node.seen', { instanceId, healthScore, caps }, {
        source: MODULE_ID, causedBy: eventUuid,
      });
      _toast('toast.info', `Pulse: new Guardian instance ${instanceId}`, eventUuid);
      console.log(`[${MODULE_ID}] new node: ${instanceId} score=${healthScore}`);
    } else {
      jaaDB.update('guardian_nodes', existing.uuid, {
        lastSeen:      nodeRow.lastSeen,
        capabilities:  nodeRow.capabilities,
        tabCount:      nodeRow.tabCount,
        listenerCount: nodeRow.listenerCount,
        healthScore,
        ts:            nodeRow.ts,
      });
      getWM().write('guardian.pulse.node.beat', { instanceId, healthScore }, {
        source: MODULE_ID, causedBy: eventUuid,
      });
    }
    return nodeRow;
  } catch (e) {
    _fail(`guardian_nodes ${isNew ? 'insert' : 'update'} failed: ${e.message}`, eventUuid);
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'stuck_call', severity: 'medium',
      path: 'guardian_nodes/pulse-upsert', body: e.message,
      status: 'open', source: MODULE_ID, causedBy: eventUuid,
      createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
    return null;
  }
}

// ── Stale + dead detection ────────────────────────────────────────────────────
function _checkStaleness() {
  let allNodes;
  try {
    allNodes = jaaDB.query('guardian_nodes', () => true, 500);
  } catch (e) {
    _fail(`guardian_nodes read failed in stale check: ${e.message}`);
    return;
  }

  const now = Date.now();

  for (const node of allNodes) {
    const age = now - (node.lastSeen || 0);
    const id  = node.instanceId;

    // Dead check (120s) — prune from tracking
    if (age > DEAD_MS) {
      if (!_deadInstances.has(id)) {
        _deadInstances.add(id);
        _gappedInstances.delete(id);
        try {
          jaaDB.insert('event_log', {
            uuid: uid(), type: 'guardian.node.dead',
            source: MODULE_ID,
            payload: { instanceId: id, ageSec: Math.round(age / 1000) },
            causedBy: node.uuid, ts: now,
          });
        } catch (_) {}
        getWM().write('guardian.pulse.node.dead', { instanceId: id, ageSec: Math.round(age / 1000) }, {
          source: MODULE_ID, causedBy: node.uuid,
        });
        _toast('toast.warn', `Pulse: Guardian instance ${id} declared dead (${Math.round(age/1000)}s)`, node.uuid);
      }
      continue;
    }

    // Stale check (25s)
    if (age > STALE_MS) {
      if (!_gappedInstances.has(id) && !_deadInstances.has(id)) {
        _gappedInstances.add(id);
        try {
          jaaDB.insert('gaps', {
            uuid: uid(), type: 'stale_module',
            path: `guardian_nodes/${id}`,
            body: `Guardian instance ${id} stale — last heartbeat ${Math.round(age/1000)}s ago`,
            severity: 'high',
            status: 'open', source: MODULE_ID, causedBy: node.uuid,
            createdAt: now, attempts: 0, ts: now,
          });
        } catch (_) {}
        getWM().write('guardian.pulse.node.stale', { instanceId: id, ageSec: Math.round(age / 1000) }, {
          source: MODULE_ID, causedBy: node.uuid,
        });
        _toast('toast.gap', `Pulse: Guardian instance ${id} stale — last seen ${Math.round(age/1000)}s ago`, node.uuid);
      }
    } else {
      // Fresh heartbeat arrived — clear stale state if it was gapped
      if (_gappedInstances.has(id)) {
        _gappedInstances.delete(id);
        // Close the open gap
        const openGap = jaaDB.query('gaps', g =>
          g.path === `guardian_nodes/${id}` && g.status === 'open', 1
        )[0];
        if (openGap) {
          try { jaaDB.update('gaps', openGap.uuid, { status: 'filled', resolvedAt: now }); } catch (_) {}
        }
        _toast('toast.success', `Pulse: Guardian instance ${id} reconnected`, node.uuid);
        getWM().write('guardian.pulse.node.reconnected', { instanceId: id }, {
          source: MODULE_ID, causedBy: node.uuid,
        });
      }
      // Reset dead tracking if node came back
      _deadInstances.delete(id);
    }
  }
}

// ── Poll tick ─────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    // 1. Read new heartbeat events
    const events = jaaDB.query(
      'event_log',
      e => e.type === 'guardian.heartbeat' && (e._rowId || 0) > _lastHbRowId,
      100
    );

    for (const event of events) {
      const p          = event.payload || {};
      const instanceId = p.instanceId;  // event.source is NOT a valid fallback per spec

      if (!instanceId) {
        _fail(`heartbeat missing instanceId — event ${event.uuid}`, event.uuid);
        _toast('toast.warn', `Pulse: heartbeat missing instanceId ${event.uuid.slice(0,8)}`, event.uuid);
        if ((event._rowId || 0) > _lastHbRowId) _lastHbRowId = event._rowId;
        continue;
      }

      _upsertNode(instanceId, p, event.ts || Date.now(), event.uuid);

      if ((event._rowId || 0) > _lastHbRowId) _lastHbRowId = event._rowId;
    }

    // 2. Stale + dead detection runs every tick regardless of new events
    _checkStaleness();

  } catch (err) {
    _fail(`tick error: ${err.message}`, null);
  }
}

// ── init / stop ───────────────────────────────────────────────────────────────
function init(cfg = {}) {
  // Restore watermark from last guardian_nodes row's source event
  try {
    const lastNode = jaaDB.tail('guardian_nodes', 1)[0];
    if (lastNode) {
      const srcEvt = jaaDB.query('event_log', e => e.uuid === lastNode.causedBy, 1)[0];
      if (srcEvt?._rowId) _lastHbRowId = srcEvt._rowId;
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] watermark restore failed: ${e.message}`);
  }

  const pollMs = cfg.pollMs ?? POLL_MS;
  _interval = setInterval(_tick, pollMs);
  _interval.unref();

  getWM().write('guardian.pulse.started', { version: VERSION, watermark: _lastHbRowId }, {
    source: MODULE_ID,
  });

  console.log(`[${MODULE_ID}] v${VERSION} started — watermark: ${_lastHbRowId}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function stats() {
  const nodes = jaaDB.query('guardian_nodes', () => true, 500);
  const now   = Date.now();
  return {
    total:   nodes.length,
    active:  nodes.filter(n => now - n.lastSeen <= 12000).length,
    stale:   nodes.filter(n => now - n.lastSeen > STALE_MS).length,
    dead:    _deadInstances.size,
    nodes:   nodes.map(n => ({
      instanceId: n.instanceId,
      healthScore: n.healthScore,
      lastSeenAgo: Math.round((now - n.lastSeen) / 1000) + 's',
      tabCount: n.tabCount,
      listenerCount: n.listenerCount,
    })),
  };
}

module.exports = { init, stop, stats, MODULE_ID, VERSION };
