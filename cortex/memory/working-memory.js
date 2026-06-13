'use strict';
// ── cortex/memory/working-memory.js ──────────────────────────────────────────
// UUID: cortex-working-memory-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// Working memory module. Manages the `working_memory` table.
//
// Working memory = what is happening right now, in this conversation, in this
// session. It is the most ephemeral tier: half-life 30 minutes, fully evicted
// at 2 hours, wiped completely on OS restart.
//
// Three entry types:
//   turn   — a single conversation turn (user or assistant)
//   signal — a named event extracted from a turn (?REMEMBER:, ?FLAG:, etc.)
//   context — a context snapshot (open gaps, current job, active session name)
//
// Writes:
//   - Userscript memory module pushes turns here directly
//   - Data poller pulls from guardian conversations/ folder
//   - Admin-server POST /api/event with type 'working.memory.turn' routes here
//
// Reads:
//   - pullCortexContext() in userscripts reads here for prompt injection
//   - self-model portrait synthesis reads here for activity summary
//
// §M1: init(cfg) + stop()
// §2.1: working_memory table JSONL is the disk-first write for this tier

'use strict';

const { jaaDB, uid } = require('./jaa-db');

const MODULE_ID = 'memory/working-memory';

// Half-life constants (kept here for clarity; jaa-db enforces eviction)
const WORKING_HALF_LIFE_MS  = 30 * 60 * 1000;   // 30 min
const WORKING_EVICT_AFTER_MS = 2 * 60 * 60 * 1000; // 2 hours

let _interval = null;
let _cfg      = {};

function init(cfg = {}) {
  _cfg      = cfg;
  // Maintenance every 5 minutes (jaa-db handles decay, this handles context snapshots)
  _interval = setInterval(_tick, 5 * 60 * 1000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── Write a conversation turn ─────────────────────────────────────────────────
// Called by the data poller or directly by admin-server.
function writeTurn({ sessionId, role, content, provider, chatUrl, jobId, turnIndex }) {
  const now    = Date.now();
  const weight = 1.0; // full weight on write, decays over time

  return jaaDB.insert('working_memory', {
    uuid:        uid(),
    type:        'turn',
    sessionId:   sessionId || 'unknown',
    role:        role || 'unknown',     // 'user' | 'assistant' | 'system'
    content:     (content || '').slice(0, 8000),
    chars:       (content || '').length,
    provider:    provider || 'unknown',
    chatUrl:     chatUrl || '',
    jobId:       jobId || null,
    turnIndex:   turnIndex || 0,
    weight,
    source:      MODULE_ID,
    causedBy:    jobId || null,
    ts:          now,
    decayAt:     now + WORKING_EVICT_AFTER_MS,
  });
}

// ── Write a signal extracted from a response ──────────────────────────────────
// e.g. ?REMEMBER:, ?FLAG:, code snippet summaries, named entities
function writeSignal({ sessionId, kind, content, jobId, source }) {
  return jaaDB.insert('working_memory', {
    uuid:      uid(),
    type:      'signal',
    kind:      kind || 'unknown', // 'remember', 'flag', 'code', 'entity', 'gap'
    sessionId: sessionId || 'unknown',
    content:   (content || '').slice(0, 2000),
    jobId:     jobId || null,
    weight:    1.0,
    source:    source || MODULE_ID,
    causedBy:  jobId || null,
    ts:        Date.now(),
  });
}

// ── Write a context snapshot ──────────────────────────────────────────────────
// Periodic snapshot of the current session state for prompt injection.
function writeContext({ sessionId, openGaps, activeJob, sessionName, provider }) {
  return jaaDB.insert('working_memory', {
    uuid:        uid(),
    type:        'context',
    sessionId:   sessionId || 'unknown',
    openGaps:    openGaps  || 0,
    activeJob:   activeJob || null,
    sessionName: sessionName || null,
    provider:    provider || 'unknown',
    weight:      1.0,
    source:      MODULE_ID,
    causedBy:    null,
    ts:          Date.now(),
  });
}

// ── Read working memory for recall context ────────────────────────────────────
// Returns the most recent weighted turns for a session, suitable for
// injection into the next prompt as context.
function recallForSession(sessionId, opts = {}) {
  const limit   = opts.limit   || 10;
  const minWeight = opts.minWeight || 0.1;

  const rows = jaaDB.queryWeighted('working_memory',
    r => r.sessionId === sessionId && r.type === 'turn',
    limit * 3 // over-fetch, then filter by weight
  ).filter(r => (r._weight || 0) >= minWeight)
   .slice(0, limit);

  return rows;
}

// ── Read all recent signals across sessions ───────────────────────────────────
function recallSignals(opts = {}) {
  const limit = opts.limit || 20;
  return jaaDB.queryWeighted('working_memory',
    r => r.type === 'signal',
    limit
  );
}

// ── Maintenance tick ──────────────────────────────────────────────────────────
// jaa-db handles decay/eviction. This tick writes periodic context snapshots.
async function _tick() {
  try {
    // Write a context snapshot for each active session
    const recentTurns = jaaDB.tail('working_memory', 50);
    const sessions    = new Set(recentTurns.filter(r => r.type === 'turn').map(r => r.sessionId));

    for (const sessionId of sessions) {
      const openGaps = jaaDB.count('gaps', r => r.status === 'open');
      const lastJob  = jaaDB.query('agent_calls', r => r.sessionId === sessionId, 1);
      writeContext({
        sessionId,
        openGaps,
        activeJob: lastJob[0]?.jobId || null,
        sessionName: null, // populated by session.named events
        provider: lastJob[0]?.provider || 'unknown',
      });
    }
  } catch (err) {
    try {
      jaaDB.insert('failures', {
        uuid: uid(), source: MODULE_ID, error: err.message, ts: Date.now(),
      });
    } catch {}
  }
}

// ── Summary stats ─────────────────────────────────────────────────────────────
function stats() {
  const rows    = jaaDB.tail('working_memory', 1000);
  const turns   = rows.filter(r => r.type === 'turn').length;
  const signals = rows.filter(r => r.type === 'signal').length;
  const ctx     = rows.filter(r => r.type === 'context').length;
  const sessions = new Set(rows.map(r => r.sessionId)).size;

  return { turns, signals, context: ctx, sessions, total: rows.length };
}

module.exports = { init, stop, writeTurn, writeSignal, writeContext, recallForSession, recallSignals, stats };
