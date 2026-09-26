'use strict';
/**
 * lib/nexus-wake-events.js — real, persistent record of every "hey nexus"
 * moment, so an agent (copilot or otherwise) can consume one whether or
 * not anything was live-listening on cortex's SSE stream at the moment it
 * happened.
 * comp_id: nexus.lib.nexus-wake-events
 *
 * James: "i feel like it needs to be a agent/co-pilot tool." Real gap this
 * closes: cortex/boot.js's wake detection only ever broadcast over SSE —
 * if nobody was connected at that exact second, the event was gone
 * forever. Now every detection is written to a real table first, and the
 * broadcast is a live convenience on top of that, not the only path.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const TABLE = 'nexus_wake_events';

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

/** pending(limit) — every real, not-yet-consumed wake event, oldest first. */
function pending(limit = 20) {
  const jaa = _jaa();
  if (!jaa) return [];
  const rows = jaa.query(TABLE, r => r.consumed === false, 10000) || [];
  return rows.sort((a, b) => a.ts - b.ts).slice(0, limit);
}

/**
 * consume(id, answer) — marks one real wake event as handled, with the real
 * answer given. §1.2 — an id that doesn't resolve to a real row is a real
 * failure, not a silent no-op.
 */
function consume(id, answer) {
  const jaa = _jaa();
  if (!jaa) return { ok: false, reason: 'cortex unavailable' };
  const row = jaa.get(TABLE, { id });
  if (!row) return { ok: false, reason: `no wake event with id ${id}` };
  jaa.update(TABLE, { id }, { consumed: true, answer: answer || null, consumedAt: Date.now() });
  return { ok: true };
}

module.exports = { pending, consume, TABLE, MODULE_ID: 'lib.nexus-wake-events', VERSION: '1.0.0' };
