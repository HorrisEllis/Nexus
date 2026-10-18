'use strict';
/**
 * lib/failure-post.js — FMR2: how any system hands a failure to the .failure_mode record. A kernel primitive (D7: no state,
 * no lifecycle, no data type of its own) — it owns nothing; cortex owns the record and its one writer.
 * comp_id: nexus.lib.failure-post
 * Map: docs/2026-10-17-failure-mode-report-phasemap.spec (FMR2_every_failure_reaches_the_record)
 *
 * James, 2026-10-17: "do it. … we need to add this all to nexus, there is boundaries mapping it" — so a failure crosses into
 * cortex by its route (POST /api/failure-modes, through lib/nexus-client.js postDurable: buffered on disk when cortex is down,
 * never lost, §0.3), never by requiring cortex's files.
 *
 *   post({ faultClass, where, source, system, summary, evidence, anchor }) → Promise<{ ok, buffered?, uuid?, error? }>
 *       never throws, never blocks its caller; NEXUS_FAILURE_INTAKE=off turns it off (said in the result)
 *   fromCosRun(repo, run) · fromPhaseRun(row, flight) → the failure shapes for the two callers wired first
 */
const MODULE_ID = 'nexus.lib.failure-post';
const VERSION = '1.0.0';

async function post(failure, { client = null, timeout = 3000 } = {}) {
  if (String(process.env.NEXUS_FAILURE_INTAKE || '').toLowerCase() === 'off') return { ok: false, skipped: 'NEXUS_FAILURE_INTAKE=off' };
  if (!failure || !failure.faultClass || !failure.where) return { ok: false, error: 'faultClass and where are required' };
  try {
    const NC = client || require('./nexus-client.js');
    const r = await NC.postDurable('cortex', '/api/failure-modes', failure, { timeout });
    return r && r.result ? { ok: true, buffered: false, uuid: r.result.uuid || null, created: r.result.created, occurrences: r.result.occurrences } : { ok: !!(r && r.ok), buffered: !!(r && r.buffered), error: r && r.error };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** a failed COS run (lib/cos-run.js), with its debug report (lib/cos-debug-report.js) */
function fromCosRun(repo, run, debugCompact = null) {
  const d = debugCompact || run.debug || null;
  return {
    faultClass: run.killedByTimeout || (d && d.timedOut) ? 'timeout' : 'test-failed',
    where: `${(repo && (repo.name || repo.uuid)) || 'repo'}:${run.file || '?'}`,
    source: 'lib/cos-run.js', system: (repo && repo.nexusSelf && repo.system) || 'cos',
    summary: (d && d.error) || `exit ${run.exitCode}`,
    evidence: { mode: 'test-failed', file: run.file || null, exitCode: run.exitCode ?? null, debug: d, repoUuid: repo && repo.uuid || null },
  };
}

/** a phase run that ended without landing (idearium_phase_runs), with its flight (lib/flight-data.js) when there is one */
function fromPhaseRun(row, flight = null) {
  const shared = flight && flight.sharedFailure && flight.sharedFailure[0];
  return {
    faultClass: shared ? shared.mode : (row.state === 'failed' && row.ladderExhausted ? 'ladder-exhausted' : row.state),
    where: `${row.map || '?'}#${row.phase || '?'}`,
    source: 'idearium/api (phase build)', system: 'idearium',
    summary: flight && flight.why ? `${flight.verdict}: ${flight.why}` : `${row.state}${row.error ? ` — ${String(row.error).slice(0, 200)}` : ''}`,
    evidence: { mode: shared ? shared.mode : row.state, runId: row.runId || null, repoUuid: row.repoUuid || null, state: row.state, error: row.error || null,
      flight: flight ? { verdict: flight.verdict, why: flight.why, ladder: flight.ladder, faults: flight.faults, wasted: flight.wasted, friction: flight.friction, attempts: flight.attempts } : null },
  };
}

// a phase run that ends here did not land, and is a failure worth a report (a person's cancel and a phase with nothing to
// prove are not); 'failed' rows are per attempt and count only when every rung was tried
const PHASE_ENDS_UNLANDED = new Set(['contract-incomplete', 'unproven', 'stalled', 'refused']);
function phaseRunFailed(row) { return !!row && (PHASE_ENDS_UNLANDED.has(row.state) || (row.state === 'failed' && !!row.ladderExhausted)); }

module.exports = { MODULE_ID, VERSION, post, fromCosRun, fromPhaseRun, phaseRunFailed, PHASE_ENDS_UNLANDED };
