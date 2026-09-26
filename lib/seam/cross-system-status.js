'use strict';
/**
 * lib/seam/cross-system-status.js — cross-system chunk/compartment status
 * UUID: nexus-seam-cross-system-status-v1-0000-2026-0713-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-13 — lib/seam/chunk-lifecycle.js already did the careful
 * half of reconciling CHUNK_STATES (idearium) and SEAMQueue (lib/seam) —
 * a canonical vocabulary and honest translation tables, explicitly scoped
 * NOT to attempt the full multi-hour merge of two systems that both
 * currently work. Checked before building anything further: that
 * translation layer had exactly one real caller (a comment, not even a
 * function call) and zero real cross-system reporting anywhere — the
 * exact thing its own header says it exists for. This is that report,
 * built on top of it, not a second attempt at the full merge that file's
 * own header correctly declined to rush.
 *
 * §HONEST SCOPE — reads real, persisted state from both systems as they
 * exist on disk/in JAA right now:
 *   - idearium: every spec's manifest.chunks[], via the real spec-engine
 *     listSpecs()/loadSpec() (filesystem-backed, not JAA).
 *   - SEAMQueue: the real queue_compartments JAA table, written by every
 *     live SEAMQueue instance (checked: guardian/server.js is the one
 *     real instantiation in this tree).
 * Both get normalized through chunk-lifecycle.js's existing, tested
 * normalizeState() — nothing here reimplements that mapping a third time.
 */

const { CANONICAL, normalizeState, isTerminal } = require('./chunk-lifecycle.js');
const { jaaDB } = require('../../cortex/memory/jaa-db.js');

/**
 * status() — the real report. Returns:
 *   {
 *     byCanonicalState: { QUEUED: n, GENERATING: n, ... },
 *     stuck: [ { system, id, canonicalState, ageMs, raw } ],
 *     totals: { idearium: n, seamqueue: n },
 *   }
 * "Stuck" — a real, opinionated definition, not just "not terminal":
 * anything non-terminal older than staleMs (default 10 minutes) — a chunk
 * that's been GENERATING for 3 seconds is normal; one that's been
 * GENERATING for an hour is the actual "what's stuck, across both
 * systems" question this was built to answer.
 */
function status({ staleMs = 10 * 60 * 1000 } = {}) {
  const byCanonicalState = {};
  for (const k of Object.values(CANONICAL)) byCanonicalState[k] = 0;
  const stuck = [];
  const now = Date.now();
  let idCount = 0, sqCount = 0;

  // ── Idearium side ──────────────────────────────────────────────────────────
  let specs = [];
  try {
    const specEngine = require('../../idearium/spec-engine/index.js');
    specs = specEngine.listSpecs ? specEngine.listSpecs() : [];
  } catch (e) {
    // §1.2 — a system that can't be read is reported, not silently skipped.
    return { error: `idearium spec-engine unreadable: ${e.message}`, byCanonicalState, stuck, totals: { idearium: 0, seamqueue: 0 } };
  }

  for (const s of specs) {
    let manifest;
    try {
      const specEngine = require('../../idearium/spec-engine/index.js');
      manifest = specEngine.loadSpec(s.uuid);
    } catch (_) { continue; } // a spec that vanished between list and load — real race, not fatal
    for (const chunk of manifest.chunks || []) {
      idCount++;
      let canonical;
      try {
        canonical = normalizeState(chunk.status, 'idearium');
      } catch (e) {
        // A genuinely unrecognized state is real signal (see
        // chunk-lifecycle.js's own reasoning) — counted, not hidden, but
        // doesn't crash the whole report over one stale mapping.
        byCanonicalState['__unrecognized'] = (byCanonicalState['__unrecognized'] || 0) + 1;
        continue;
      }
      byCanonicalState[canonical]++;
      if (!isTerminal(canonical) && (now - (chunk.updatedAt || manifest.updatedAt || now)) > staleMs) {
        stuck.push({ system: 'idearium', id: `${manifest.uuid}/${chunk.sectionId}`, canonicalState: canonical, ageMs: now - (chunk.updatedAt || manifest.updatedAt || now), raw: chunk.status });
      }
    }
  }

  // ── SEAMQueue side ────────────────────────────────────────────────────────
  let rows = [];
  try {
    rows = jaaDB.query('queue_compartments', {});
  } catch (e) {
    return { error: `queue_compartments unreadable: ${e.message}`, byCanonicalState, stuck, totals: { idearium: idCount, seamqueue: 0 } };
  }

  for (const row of rows) {
    sqCount++;
    let canonical;
    try {
      canonical = normalizeState(row.state, 'seamqueue');
    } catch (e) {
      byCanonicalState['__unrecognized'] = (byCanonicalState['__unrecognized'] || 0) + 1;
      continue;
    }
    byCanonicalState[canonical]++;
    if (!isTerminal(canonical) && (now - (row.updatedAt || now)) > staleMs) {
      stuck.push({ system: 'seamqueue', id: row.uuid, canonicalState: canonical, ageMs: now - (row.updatedAt || now), raw: row.state });
    }
  }

  return { byCanonicalState, stuck, totals: { idearium: idCount, seamqueue: sqCount } };
}

module.exports = { status };
