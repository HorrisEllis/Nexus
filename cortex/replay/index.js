'use strict';
// ── cortex/replay/index.js ────────────────────────────────────────────────────
// UUID: nexus-replay-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// Deterministic replay engine.
//
// Reads event_log (or a snapshot's event_log) in chronological order
// and re-feeds events through module handlers — rebuilding derived state.
//
// Three modes:
//   inspect  — replay events in range, return state at that point (no writes)
//   verify   — replay + compare output against live JAA state (divergence check)
//   simulate — replay with synthetic events injected (fault injection testing)
//
// Rules:
//   - NO live I/O during replay
//   - NO network calls
//   - NO disk writes in inspect/verify mode
//   - Simulate mode writes to an isolated sandbox JAA
//
// §1.2  Every divergence logged as a gap
// §2.1  Replay output is append-only audit (never replaces live state)

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'replay';
const VERSION   = '1.0.0';

// ── Event → derived state processor ──────────────────────────────────────────
// Pure functions: given an event, return what state changes it implies.
// These mirror what the live modules do, but without side effects.

const PROCESSORS = {

  'gap.found': (event, state) => {
    const p = event.payload || {};
    state.gaps.push({ uuid: p.gapUuid, path: p.path, type: p.type, severity: p.severity, ts: event.ts });
  },

  'healer.resolved': (event, state) => {
    const p = event.payload || {};
    const gap = state.gaps.find(g => g.uuid === p.gapUuid);
    if (gap) gap.status = 'resolved';
  },

  'healer.escalated': (event, state) => {
    const p = event.payload || {};
    const gap = state.gaps.find(g => g.uuid === p.gapUuid);
    if (gap) gap.status = 'needs_manual';
  },

  'self-heal.patched': (event, state) => {
    const p = event.payload || {};
    const gap = state.gaps.find(g => g.uuid === p.gapUuid);
    if (gap) gap.status = p.applied ? 'forge_applied' : 'forge_patch_ready';
    state.patches.push({ gapUuid: p.gapUuid, module: p.module, applied: p.applied, ts: event.ts });
  },

  'self-heal.forge_failed': (event, state) => {
    const p = event.payload || {};
    const gap = state.gaps.find(g => g.uuid === p.gapUuid);
    if (gap) gap.status = p.attempts >= 3 ? 'human_required' : 'forge_failed';
  },

  'workflow.complete': (event, state) => {
    const p = event.payload || {};
    state.workflows.push({ runUuid: p.runUuid, name: p.name, status: 'complete', ts: event.ts });
  },

  'raid.dispatched': (event, state) => {
    const p = event.payload ? JSON.parse(typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload)) : {};
    state.dispatches.push({ callUuid: p.callUuid, agent: p.agent, cluster: p.cluster, ts: event.ts });
  },

  'snapshot.created': (event, state) => {
    const p = event.payload || {};
    state.snapshots.push({ snapId: p.snapId, type: p.type, message: p.message, ts: event.ts });
  },

  'snapshot.rollback': (event, state) => {
    state.rollbacks.push({ snapId: event.payload?.snapId, ts: event.ts });
  },

  'heartbeat.tick': (event, state) => {
    state.lastHeartbeat = event.ts;
    const online = Object.entries(event.payload || {})
      .filter(([, v]) => v?.online).map(([k]) => k);
    state.onlineSystems = online;
  },

  'cortex.storage.opened': (event, state) => {
    state.boots.push({ ts: event.ts, tables: event.payload?.tables });
  },
};

// ── Build initial state object ─────────────────────────────────────────────────
function _emptyState() {
  return {
    gaps:          [],
    patches:       [],
    workflows:     [],
    dispatches:    [],
    snapshots:     [],
    rollbacks:     [],
    boots:         [],
    onlineSystems: [],
    lastHeartbeat: null,
    eventCount:    0,
    firstEvent:    null,
    lastEvent:     null,
  };
}

// ── Replay events from a source ───────────────────────────────────────────────
function _replayEvents(events, state, opts = {}) {
  const { injectBefore = [], injectAfter = [], fromTs = 0, toTs = Infinity } = opts;

  const allEvents = [
    ...injectBefore,
    ...events.filter(e => e.ts >= fromTs && e.ts <= toTs),
    ...injectAfter,
  ].sort((a, b) => (a.ts || 0) - (b.ts || 0));

  for (const event of allEvents) {
    state.eventCount++;
    if (!state.firstEvent) state.firstEvent = event;
    state.lastEvent = event;

    const processor = PROCESSORS[event.type];
    if (processor) {
      try { processor(event, state); }
      catch (e) {
        state.errors = state.errors || [];
        state.errors.push({ eventUuid: event.uuid, type: event.type, error: e.message });
      }
    }
  }

  return state;
}

// ── inspect: replay a time range, return state at that point ──────────────────
function inspect(opts = {}) {
  const { fromTs = 0, toTs = Date.now() + 5000, n = 5000 } = opts;

  const events = jaaDB.query('event_log',
    e => (e.ts || 0) >= fromTs && (e.ts || 0) <= toTs,
    n
  ).sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const state = _emptyState();
  // Pass fromTs/toTs so _replayEvents window matches the query window
  _replayEvents(events, state, { fromTs, toTs });

  return {
    mode:       'inspect',
    fromTs,
    toTs,
    eventCount: state.eventCount,
    state,
  };
}

// ── verify: replay + compare against live JAA state ──────────────────────────
function verify(opts = {}) {
  const result = inspect(opts);
  const state  = result.state;
  const divergences = [];

  // Compare gap counts
  const liveGaps  = jaaDB.query('gaps', () => true, 10000);
  const replayGaps = state.gaps;
  if (liveGaps.length !== replayGaps.length) {
    divergences.push({
      field: 'gaps.count',
      live:   liveGaps.length,
      replay: replayGaps.length,
      delta:  liveGaps.length - replayGaps.length,
    });
  }

  // Compare open gap types
  const liveOpenTypes   = new Set(liveGaps.filter(g => g.status === 'open' || g.status === 'pending').map(g => g.type));
  const replayOpenTypes = new Set(replayGaps.filter(g => !g.status || g.status === 'pending').map(g => g.type));
  const missingInReplay = [...liveOpenTypes].filter(t => !replayOpenTypes.has(t));
  const extraInReplay   = [...replayOpenTypes].filter(t => !liveOpenTypes.has(t));
  if (missingInReplay.length || extraInReplay.length) {
    divergences.push({ field: 'gaps.open_types', missingInReplay, extraInReplay });
  }

  // Log divergences as gaps
  if (divergences.length) {
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'replay_divergence',
      path: 'replay/verify',
      body: `Replay diverged from live state: ${divergences.length} field(s)`,
      severity: divergences.length > 2 ? 'high' : 'medium',
      status: 'pending', source: MODULE_ID,
      causedBy: null, createdAt: Date.now(), ts: Date.now(),
    });
  }

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'replay.verify',
    payload: { divergences: divergences.length, eventCount: state.eventCount },
    source: MODULE_ID, causedBy: null, ts: Date.now(),
  });

  return { mode: 'verify', divergences, state: result.state, eventCount: result.eventCount };
}

// ── simulate: replay with injected fault events ───────────────────────────────
function simulate(faultEvents = [], opts = {}) {
  const events = jaaDB.query('event_log', () => true, 10000)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const state = _emptyState();
  _replayEvents(events, state, {
    ...opts,
    injectBefore: faultEvents.filter(e => e._inject === 'before'),
    injectAfter:  faultEvents.filter(e => e._inject !== 'before'),
  });

  return {
    mode:        'simulate',
    faultCount:  faultEvents.length,
    eventCount:  state.eventCount,
    state,
  };
}

// ── replay from snapshot ──────────────────────────────────────────────────────
function fromSnapshot(snapId, opts = {}) {
  let snap;
  try {
    snap = require('../snapshot').load(snapId);
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const events = (snap.tables?.event_log || [])
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const state = _emptyState();
  _replayEvents(events, state, opts);

  return { mode: 'snapshot_replay', snapId, eventCount: state.eventCount, state };
}

module.exports = { inspect, verify, simulate, fromSnapshot, VERSION, MODULE_ID };
