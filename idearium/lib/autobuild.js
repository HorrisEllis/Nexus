/**
 * idearium/lib/autobuild.js — SL4: the loop. Build the next phase when the last one closed, from SL0's queue, until a limit.
 * comp_id: nexus.idearium.lib.autobuild
 * Spec: docs/self-building-loop.spec MOD-SL-LOOP. Map: docs/2026-10-23-self-building-loop-phasemap.spec SL4.
 *
 * James, 2026-10-23: "whats the most important? can you help me build, invent, innovate, ways for idearium to build phases, all of
 * them, we need this to work so it can start building itself." · 2026-10-24: "yes do it." (SL5 B, the 2 closes, and SL4)
 *
 * Stands on (§8.6): lib/build-queue.js (SL0, what can be built now), the phase build (_phaseBuild: DG1/DG2/DG3, the ladder, the
 * proof), lib/phase-close.js (SL1, closes a proven, landed phase), lib/trust-rule.js (SL5, what lands without him), and the run
 * watchdog's minute tick (AB1's _watchRuns), which steps every running loop. Nothing here talks to an agent or writes a file: the
 * caller passes every effect as a dep, so the loop is a state machine a test can drive.
 *
 *   start({ repo, budget, by, deps })  → LoopRun      refused while one runs on the repo (never two loops on one repo)
 *   stop(repo, { why, deps })          → LoopRun
 *   status(repoUuid, { deps })         → LoopRun | null
 *   step(loop, deps)                   → { loop, outcome: 'built'|'waiting'|'closed'|'skipped'|'stopped'|'idle', key?, why }
 *
 * LoopRun { uuid, loopId, repoUuid, state: 'running'|'stopped', budget { phases, minutes }, startedAt, stoppedAt?, stopWhy?,
 *           current { key, map, phase, runId, at } | null, built: [key], closed: [{ key, runId, why }],
 *           skipped: [{ key, why }], misses (in a row), by, at }
 * deps: { load(): LoopRun[], save(loop), queue(repo): { queue: QueueEntry[], blocked }, build(repo, entry): { ok, runId, error },
 *         runState(runId): { final: bool, state, proven }, land(runId): { landed: n, asked: n, why }, close(runId): { closed, why },
 *         now(): ms, emit(type, payload) }
 *
 * The stop rule (FR10's intent, at the loop's level): MISSES_MAX phases in a row that did not close stop the loop, said — it never
 * climbs through a backlog that keeps failing the same way. A phase that did not close is skipped for the rest of this loop (listed,
 * never dropped), so the loop moves on to the next.
 */
export const VERSION = '1.0.0';
export const MISSES_MAX = 3;
const DEFAULT_BUDGET = { phases: 5, minutes: 240 };

function _latest(rows, repoUuid) {
  return (rows || []).filter(r => r && r.repoUuid === repoUuid).sort((a, b) => (a.at || 0) - (b.at || 0)).pop() || null;
}
function _save(deps, loop) { const l = { ...loop, uuid: `${loop.loopId}-${(deps.now ? deps.now() : Date.now())}-${Math.random().toString(36).slice(2, 6)}`, at: deps.now ? deps.now() : Date.now() }; deps.save(l); return l; }

export function status(repoUuid, { deps } = {}) { return _latest(deps.load(), repoUuid); }

export function start({ repo, budget = {}, by = 'unknown', deps } = {}) {
  const cur = status(repo.uuid, { deps });
  if (cur && cur.state === 'running') { const e = new Error(`a loop is already running on ${repo.name || repo.uuid} (${cur.loopId})`); e.code = 'LOOP_RUNNING'; e.loop = cur; throw e; }
  const now = deps.now ? deps.now() : Date.now();
  const b = { phases: Math.max(1, Math.min(100, parseInt(budget.phases, 10) || DEFAULT_BUDGET.phases)), minutes: Math.max(5, Math.min(24 * 60, parseInt(budget.minutes, 10) || DEFAULT_BUDGET.minutes)) };
  const loop = _save(deps, { loopId: `loop-${now.toString(36)}`, repoUuid: repo.uuid, state: 'running', budget: b, startedAt: now, current: null, built: [], closed: [], skipped: [], misses: 0, by });
  if (deps.emit) deps.emit('loop.started', { repo: repo.uuid, loopId: loop.loopId, budget: b, by });
  return loop;
}

export function stop(repo, { why = 'stopped by a person', deps } = {}) {
  const cur = status(repo.uuid, { deps });
  if (!cur || cur.state !== 'running') return cur;
  const loop = _save(deps, { ...cur, state: 'stopped', stoppedAt: deps.now ? deps.now() : Date.now(), stopWhy: why });
  if (deps.emit) deps.emit('loop.stopped', { repo: repo.uuid, loopId: loop.loopId, why });
  return loop;
}

/** one step: finish the current phase's run, or start the next. Called by the watchdog's tick and after each run ends. */
export async function step(loop, deps) {
  if (!loop || loop.state !== 'running') return { loop, outcome: 'idle', why: 'not running' };
  const now = deps.now ? deps.now() : Date.now();
  const repo = { uuid: loop.repoUuid };
  const halt = (why) => { const l = stop(repo, { why, deps }); return { loop: l, outcome: 'stopped', why }; };
  const said = (outcome, key, why, l) => { if (deps.emit) deps.emit('loop.step', { repo: loop.repoUuid, loopId: loop.loopId, key, outcome, why }); return { loop: l, outcome, key, why }; };

  // GATE-SL4-003 — the current phase's run: still going → wait; ended → land (his rule), close, then the next step picks
  if (loop.current) {
    const c = loop.current;
    const rs = await deps.runState(c.runId);
    if (!rs || !rs.final) return { loop, outcome: 'waiting', key: c.key, why: `run ${c.runId} is ${rs ? rs.state : 'not found yet'}` };
    let landed = null, closed = null;
    if (rs.proven) { try { landed = await deps.land(c.runId); } catch (e) { landed = { landed: 0, why: `land failed: ${e.message}` }; } }
    try { closed = await deps.close(c.runId); } catch (e) { closed = { closed: false, why: `close failed: ${e.message}` }; }
    const ok = !!(closed && (closed.closed || closed.already));
    const why = ok ? (closed.why || 'closed') : `${rs.proven ? 'proven, not closed' : `ended ${rs.state}`}: ${(closed && closed.why) || ''}${landed && landed.asked ? ` (${landed.asked} change(s) wait for him: ${landed.why})` : ''}`;
    const l = _save(deps, { ...loop, current: null, closed: ok ? [...loop.closed, { key: c.key, runId: c.runId, why }] : loop.closed,
      skipped: ok ? loop.skipped : [...loop.skipped, { key: c.key, why }], misses: ok ? 0 : (loop.misses || 0) + 1 });
    if (!ok && l.misses >= MISSES_MAX) { said('skipped', c.key, why, l); return halt(`${MISSES_MAX} phases in a row did not close (last: ${c.phase}: ${why}) — read their flights before building more`); }
    return said(ok ? 'closed' : 'skipped', c.key, why, l);
  }

  // GATE-SL4-001 — budget left?
  if (loop.built.length >= loop.budget.phases) return halt(`the budget: ${loop.budget.phases} phase(s) built`);
  if (now - loop.startedAt >= loop.budget.minutes * 60000) return halt(`the budget: ${loop.budget.minutes} minutes`);

  // GATE-SL4-002 — the queue's first phase not already tried in this loop → build it
  const tried = new Set([...loop.built, ...loop.skipped.map(s => s.key)]);
  let q; try { q = await deps.queue(repo); } catch (e) { return halt(`the queue could not be read: ${e.message}`); }
  const next = (q.queue || []).find(e => !tried.has(e.key));
  if (!next) {
    const waits = ((q.blocked || []).filter(b => b.group === 'decision')).length;
    return halt(`nothing left to build now${waits ? ` (${waits} phase(s) wait on his decisions)` : ''}`);
  }
  let r; try { r = await deps.build(repo, next); } catch (e) { r = { ok: false, error: e.message }; }
  if (!r || !r.ok || !r.runId) {
    const why = `the build refused or failed: ${(r && r.error) || 'no run'}`;
    const l = _save(deps, { ...loop, skipped: [...loop.skipped, { key: next.key, why }], misses: (loop.misses || 0) + 1 });
    if (l.misses >= MISSES_MAX) { said('skipped', next.key, why, l); return halt(`${MISSES_MAX} phases in a row did not close (last: ${next.id}: ${why})`); }
    return said('skipped', next.key, why, l);
  }
  const l = _save(deps, { ...loop, current: { key: next.key, map: next.map, phase: next.id, runId: r.runId, at: now }, built: [...loop.built, next.key] });
  return said('built', next.key, `run ${r.runId} started`, l);
}
