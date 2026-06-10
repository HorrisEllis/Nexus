'use strict';
// ── memory/agent-memory.js ────────────────────────────────────────────────────
// UUID: mod-agent-memory-v5-0000-4000-0000-000000000001
//
// Manages the associative memory lattice. Reads event_log for significant events
// and distills them into memory_index. Also manages cortex_memory recall layer.
//
// §M1: init(cfg) + stop().
// §M2: reads: event_log, failures, gaps. writes: memory_index, memory_queries.

const { jaaDB, uid } = require('./jaa-db');

const MODULE_ID = 'memory/agent-memory';

let _interval  = null;
let _cfg       = {};
let _lastRowId = 0;

function init(cfg = {}) {
  _cfg      = cfg;
  // Initialize lastRowId from existing data
  const last = jaaDB.tail('event_log', 1);
  if (last.length) _lastRowId = last[0]._rowId;

  _interval = setInterval(_tick, _cfg.pollMs ?? 4000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    // Scan new event_log entries
    const newEvents = jaaDB.query('event_log', r => r._rowId > _lastRowId, 100);
    if (!newEvents.length) return;
    _lastRowId = newEvents[newEvents.length - 1]._rowId;

    for (const ev of newEvents) {
      const tags = _tagsFor(ev);
      if (!tags) continue; // not significant

      // Check if already indexed
      const existing = jaaDB.query('memory_index',
        r => r.sourceEventUuid === ev.uuid,
        1
      );
      if (existing.length) continue;

      jaaDB.insert('memory_index', {
        uuid:            uid(),
        tags,
        content:         _summarize(ev),
        source:          MODULE_ID,
        sourceEventUuid: ev.uuid,
        sourceEventType: ev.type,
        causedBy:        ev.uuid,
        ts:              ev.ts || Date.now(),
      });
    }

    // Maintenance: prune memory_index beyond 500 entries (keep hot)
    const allMem = jaaDB.tail('memory_index', 600);
    if (allMem.length > 500) {
      // Mark oldest 100 as archived (soft delete)
      const toArchive = allMem.slice(0, 100);
      for (const m of toArchive) {
        jaaDB.update('memory_index', m.uuid, { status: 'archived' });
      }
    }

  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

function _tagsFor(ev) {
  const t = ev.type || '';

  if (t.startsWith('agent.'))         return ['agent', ...t.split('.').slice(1)];
  if (t.startsWith('raid.'))          return ['raid', 'routing'];
  if (t.startsWith('gap.'))           return ['gap', 'gate'];
  if (t.startsWith('healer.'))        return ['healer', 'fix'];
  if (t.startsWith('guardian.'))      return ['guardian'];
  if (t.startsWith('versionium.'))    return ['versionium', 'commit'];
  if (t.startsWith('cobalt.'))        return ['cobalt', 'bus'];
  if (t === 'system.booted')          return ['system', 'boot'];
  if (t.startsWith('cortex.'))        return ['cortex', 'memory'];
  return null; // not indexable
}

function _summarize(ev) {
  const p = ev.payload || {};
  const lines = [`type: ${ev.type}`, `source: ${ev.source || 'unknown'}`];
  for (const [k, v] of Object.entries(p).slice(0, 4)) {
    lines.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 80)}`);
  }
  return lines.join(' · ');
}

module.exports = { init, stop };
