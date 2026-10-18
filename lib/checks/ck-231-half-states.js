'use strict';
/**
 * lib/checks/ck-231-half-states.js — CK-231 "half-states" (cos/spec/check-catalogue.spec).
 * component_id: nexus.lib.checks.ck-231-half-states
 *
 * QA1, built 0.60.157 (the gating census, layer 1). Nothing stays running, building or pending past its timeout without a
 * row saying why: a run whose newest row is neither an end nor a wait, idle longer than stallMs, died between two writes.
 * The rule is lib/run-watch.js's own (isFinal, WAITING, stalled) — one definition of "ended", not a second.
 *
 *   run({ stallMs }, { rows, now }) → { ok, verifiable, evidence, reason, items: [{ runId, repoUuid, map, phase, state, idleMs }] }
 *   rows: idearium_phase_runs rows, handed in by the caller that holds them (Idearium's checks route) — lib does not reach
 *   into a system's table
 */
const ID = 'CK-231';

function run(c = {}, { rows = null, now = Date.now() } = {}) {
  if (!Array.isArray(rows)) return { ok: false, verifiable: false, reason: `unverifiable: ${ID} needs the run rows (Idearium's checks route hands them in)` };
  const RW = require('../run-watch.js');
  const stallMs = Number(c.stallMs) > 0 ? Number(c.stallMs) : 10 * 60 * 1000;
  const items = RW.stalled(rows, { now, stallMs });
  const runs = RW.runsOf(rows).size;
  const evidence = { check: ID, runs, stallMs };
  return items.length ? { ok: false, verifiable: true, items, evidence, reason: `${ID}: ${items.length} of ${runs} run(s) stopped half-way with no row saying why (${items.slice(0, 3).map(i => `${i.runId} at ${i.state}, idle ${Math.round(i.idleMs / 60000)} min`).join('; ')})` }
    : { ok: true, verifiable: true, items: [], evidence };
}

module.exports = { ID, run };
