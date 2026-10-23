'use strict';
/**
 * lib/phase-close.js — SL1: a proven, landed phase closes itself; undoing its change reopens it.
 * comp_id: nexus.lib.phase-close
 * Spec: docs/self-building-loop.spec MOD-SL-CLOSE (SL2's byEvidence joins it later, MOD-SL-EVIDENCE-CLOSE).
 * Map: docs/2026-10-23-self-building-loop-phasemap.spec SL1.
 *
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · "contiue getting idearium building phases"
 * Found: nothing marked a phase done. The only status writes were 'active' when a build starts and the manual POST …/phases/status,
 * so a proven run left its phase open and DG1 refused every phase that depends on it until he marked it by hand.
 *
 * Stands on (§8.6): the one status writer (idearium/api _phaseSetStatus → idearium/repo/roadmap.js setPhaseStatus, which proves loom
 * reads the edit back), the run rows (idearium_phase_runs: a proof row says 'proven'), and the changes (lib/repo-inject.js: each
 * change names its run, lib/change-entry.js runOf). Nothing here writes a file: the caller passes the writer and keeps the records.
 *
 *   landed(run, { injects })                                       → { landed, proven, waiting[], why }
 *   closeIfLanded({ repo, run, injects, setStatus, version, closes }) → { closed, record?, why }
 *   reopenIfUndone({ repo, inject, setStatus, closes })            → { reopened, record?, why }
 *
 * A proof met only by proposals (any change of the run not yet applied) never closes: the proof ran against overlays, so "proven" can
 * be true with nothing on disk. A rejected or reverted change means part of the run did not land: not closed, said.
 */
const VERSION = '1.0.0';

function baseRun(id) { return String(id || '').replace(/-(review|proof)$/, ''); }
function runOfInject(n) { const s = (n && n.source) || {}; return baseRun(s.runId || s.run || (n && n.task && n.task.runId) || ''); }

/** the changes of one run (any of its -review / -proof ids) */
function injectsOf(runId, injects = []) { const b = baseRun(runId); return injects.filter(n => runOfInject(n) === b); }

/**
 * run = { runId, map, phase, proven: bool }   proven: some row of the run (its -proof row) says 'proven'
 */
function landed(run, { injects = [] } = {}) {
  if (!run || !run.runId) return { landed: false, proven: false, waiting: [], why: 'no run' };
  if (!run.proven) return { landed: false, proven: false, waiting: [], why: `run ${run.runId} is not proven (${run.state || 'no proof row'})` };
  const mine = injectsOf(run.runId, injects);
  const waiting = mine.filter(n => n.status === 'proposed' || n.status === 'staged').map(n => n.path);
  const refused = mine.filter(n => n.status === 'rejected' || n.status === 'reverted');
  if (refused.length) return { landed: false, proven: true, waiting, why: `part of the run did not land: ${refused.map(n => `${n.path} ${n.status}`).join(', ')}` };
  if (waiting.length) return { landed: false, proven: true, waiting, why: `proven against proposals: ${waiting.length} change(s) not applied yet (${waiting.slice(0, 5).join(', ')})` };
  const applied = mine.filter(n => n.status === 'applied');
  return { landed: true, proven: true, waiting: [], applied: applied.map(n => n.uuid),
    why: applied.length ? `proven, and its ${applied.length} change(s) are applied` : 'proven, and the run changed nothing (its phase was already true on disk)' };
}

/** the live close of a run: its newest record (the table is append-only: a reopen is a newer row), unless that one reopened it */
function _openClose(closes, runId) {
  const b = baseRun(runId);
  const last = [...(closes || [])].filter(c => c && baseRun(c.runId) === b).sort((x, y) => (x.reopenedAt || x.at || 0) - (y.reopenedAt || y.at || 0)).pop();
  return last && !last.reopenedAt ? last : null;
}

async function closeIfLanded({ repo, run, injects = [], setStatus, version = null, closes = [] } = {}) {
  const l = landed(run, { injects });
  if (!l.landed) return { closed: false, why: l.why, waiting: l.waiting };
  const had = _openClose(closes, run.runId);
  if (had) return { closed: false, already: true, record: had, why: `already closed by run ${run.runId} (${new Date(had.at).toISOString().slice(0, 10)})` };
  if (typeof setStatus !== 'function') return { closed: false, why: 'no status writer given' };
  const note = `${version ? `${version} — ` : ''}proven by run ${baseRun(run.runId)}${run.snapshot ? `, on snapshot ${String(run.snapshot).slice(0, 12)}` : ''}`;
  const w = await setStatus(repo, { map: run.map, phase: run.phase, status: 'complete', note, reason: `SL1: ${l.why}` });
  if (!w || !w.ok) return { closed: false, why: `the status writer refused: ${(w && w.error) || 'no answer'}`, refused: w && w.extra || null };
  const record = { kind: 'run', runId: baseRun(run.runId), repoUuid: repo && repo.uuid || null, map: run.map, phase: run.phase, at: Date.now(),
    version, note, why: l.why, injects: l.applied || [], via: w.data && w.data.change && w.data.change.via || null, before: w.data && w.data.change && w.data.change.before || null };
  return { closed: true, record, why: l.why };
}

/** inject = a change just reverted (or rejected after apply); closes = the close records */
async function reopenIfUndone({ repo, inject, setStatus, closes = [] } = {}) {
  if (!inject || inject.status !== 'reverted') return { reopened: false, why: 'not a revert' };
  const runId = runOfInject(inject);
  if (!runId) return { reopened: false, why: 'the change names no run' };
  const c = _openClose(closes, runId);
  if (!c) return { reopened: false, why: `run ${runId} closed no phase` };
  if (typeof setStatus !== 'function') return { reopened: false, why: 'no status writer given' };
  const note = `reopened: ${inject.path} of run ${runId} was undone`;
  const w = await setStatus(repo, { map: c.map, phase: c.phase, status: 'active', note, reason: `SL1: ${note}` });
  if (!w || !w.ok) return { reopened: false, why: `the status writer refused: ${(w && w.error) || 'no answer'}` };
  return { reopened: true, record: { ...c, reopenedAt: Date.now(), reopenedBy: inject.uuid, reopenNote: note }, why: note };
}

module.exports = { VERSION, baseRun, runOfInject, injectsOf, landed, closeIfLanded, reopenIfUndone };
