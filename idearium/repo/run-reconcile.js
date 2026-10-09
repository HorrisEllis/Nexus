/**
 * idearium/repo/run-reconcile.js — runs left unfinished by a process that is gone are said to be interrupted (HP2, 0.52.0).
 * UUID: nexus-idearium-repo-run-reconcile-v1-0000-2026-1009-jamesbrooks-001
 * Map: docs/2026-10-09-hardening-pass-phasemap.spec (HP2_interrupted_runs_are_said)
 *
 * James: "Do the hardening pass" (on a review that asked: interrupt a run midway — do its files and changes still point at
 * the right run?).
 *
 * A run's dispatch lives in the idearium process that started it (a promise). When idearium starts, every run whose
 * latest row (idearium_phase_runs, one row per state change) is still in flight and was written before this process
 * began has lost that process: nothing will ever come back for it. It gets one 'interrupted' row saying so — its last
 * state, when, and that it can be built again. No timer, no guess: a run started by this process is never touched, and
 * 'interrupted' is final, so reconciling twice adds nothing.
 *
 *   interruptedRows(rows, { bootAt, now }) → the rows to append (pure)
 */
export const IN_FLIGHT = Object.freeze(['building', 'running', 'reviewing', 'retrying', 'escalating', 'dispatched', 'planning']);

export function interruptedRows(rows = [], { bootAt = Date.now(), now = Date.now() } = {}) {
  const latest = new Map();
  for (const r of rows) {
    if (!r || !r.runId) continue;
    const cur = latest.get(r.runId);
    if (!cur || (r.ts || 0) >= (cur.ts || 0)) latest.set(r.runId, r);
  }
  const out = [];
  for (const r of latest.values()) {
    if (!IN_FLIGHT.includes(r.state) || (r.ts || 0) >= bootAt) continue;
    // the run's own fields carry over (which repo, map, phase, title); its state and reason are the interruption's
    const { uuid, state, error, reply, tools, injects, elapsedMs, ts, ...base } = r;
    out.push({ ...base, uuid: `${r.runId}-interrupted`, state: 'interrupted', interruptedFrom: state, lastAt: r.ts || null,
      error: `idearium restarted while this run was ${state}${r.provider ? ` (${r.provider}${r.rung ? `, rung ${r.rung}/${r.rungs}` : ''})` : ''} — nothing came back from it; build it again`, ts: now });
  }
  return out;
}
