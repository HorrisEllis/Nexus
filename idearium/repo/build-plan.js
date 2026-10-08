/**
 * idearium/repo/build-plan.js — the build plan: every phase in build order, its gates as progress, its event ledger.
 * §0.39.280 BS6.
 * UUID: nexus-idearium-repo-build-plan-v1-0000-2026-0929-jamesbrooks-001
 * Map: docs/2026-09-29-build-surface-phasemap.spec (BS6).
 *
 * James: "the plan, can you have something like that, showing progress, and expandable tasks, to show the event
 * ledger and activity. maybe use the gates as progress also?"
 *
 * A projection (§10.2, invariant I4): computed from the phases (idearium/repo/phases.js managerView) and the phase
 * runs (idearium_phase_runs, one row per state change) on every read; it stores nothing.
 *
 * GATES, in order — a step's progress is how many it has passed:
 *   mapped      the phase is in a phasemap
 *   snapshot    a Versionium snapshot was taken before building it (nothing is built without one, I2)
 *   dispatched  the repo's agent was given it
 *   replied     the agent answered
 *   landed      its changes came back as injects (files)
 *   closed      the phasemap marks it complete
 * A run that failed or was refused stops at the gate it reached and says why.
 *
 * buildPlan({ phases, runs, order }) → { steps:[{ key, map, title, layer, status, gates:[{gate, passed, at}], gate,
 *                                         progress, current, times, ledger:[…] }], summary }
 *
 * §0.39.361 SB50 — James: "tasks need time stamped." Every step carries its times:
 *   mapped     its map's date (phase.mappedOn, from the map's meta)
 *   started    its first run began (ms)
 *   lastRun    its newest run row (ms)
 *   closed     complete: its last proven run (ms), else the date its status was written (phase.statusDate)
 *   runningMs  how long its current run has gone, while it builds
 * Each ledger row carries startedAt — when its run began — so the panel can say how far into the run it came.
 */
export const GATES = ['mapped', 'snapshot', 'dispatched', 'replied', 'landed', 'closed'];

function _gatesFor(phase, runs) {
  const done = phase.status === 'complete' || phase.status === 'done';
  const last = runs[0] || null;   // newest first
  const passed = { mapped: phase.createdAt || true };
  if (last) {
    if (last.snapshot) passed.snapshot = last.startedAt || last.ts;
    const started = runs.find(r => r.runId === last.runId && r.state === 'building');
    if (last.state !== 'refused' && (started || last.state === 'building' || last.state === 'replied' || last.state === 'failed')) passed.dispatched = last.startedAt || last.ts;
    if (last.state === 'replied') passed.replied = last.ts;
    if (last.state === 'replied' && last.injects && (last.injects.injected || []).length) passed.landed = last.ts;
  }
  if (done) for (const g of GATES) if (!passed[g]) passed[g] = true;
  if (done) passed.closed = true;
  const gates = GATES.map(g => ({ gate: g, passed: !!passed[g], at: typeof passed[g] === 'number' ? passed[g] : null }));
  const n = gates.filter(g => g.passed).length;
  const failed = last && (last.state === 'failed' || last.state === 'refused') && !done ? { state: last.state, error: last.error || null } : null;
  return { gates, progress: +(n / GATES.length).toFixed(3), gate: n < GATES.length ? GATES[n] : null, failed, run: last };
}

/** the times of one step (SB50); a date-only value (YYYY-MM-DD from the map) is kept as that string */
export function timesOf(phase, runs = [], now = Date.now()) {
  const done = phase.status === 'complete' || phase.status === 'done';
  const ms = (x) => (typeof x === 'number' && x > 0 ? x : null);
  const starts = runs.map(r => ms(r.startedAt) || ms(r.ts)).filter(Boolean);
  const lasts = runs.map(r => ms(r.ts)).filter(Boolean);
  const proven = runs.filter(r => r.state === 'proven').map(r => ms(r.ts)).filter(Boolean);
  const last = runs[0] || null;
  return {
    mapped: ms(phase.createdAt) || phase.mappedOn || null,
    started: starts.length ? Math.min(...starts) : null,
    lastRun: lasts.length ? Math.max(...lasts) : null,
    closed: done ? (proven.length ? Math.max(...proven) : phase.statusDate || null) : null,
    runningMs: last && last.state === 'building' && !done ? Math.max(0, now - (ms(last.startedAt) || ms(last.ts) || now)) : null,
  };
}

export function buildPlan({ phases = [], runs = [], order = null, now = Date.now() } = {}) {
  const runsBy = new Map();
  for (const r of [...runs].sort((a, b) => (b.ts || 0) - (a.ts || 0))) {
    const k = `${r.map}::${r.phase}`;
    if (!runsBy.has(k)) runsBy.set(k, []);
    runsBy.get(k).push(r);
  }
  const list = order ? order.map(k => phases.find(p => p.phase_key === k || p.uuid === k)).filter(Boolean) : phases;
  const steps = list.map(p => {
    const rs = runsBy.get(`${p.map}::${p.phase_key}`) || [];
    const g = _gatesFor(p, rs);
    const times = timesOf(p, rs, now);
    if (g.gates[0] && !g.gates[0].at && typeof times.mapped === 'number') g.gates[0].at = times.mapped;
    if (times.closed && typeof times.closed === 'number') { const c = g.gates.find(x => x.gate === 'closed'); if (c && !c.at) c.at = times.closed; }
    return {
      key: p.phase_key, uuid: p.uuid || null, map: p.map, title: p.title || p.name || p.phase_key, layer: p.layer || null, status: p.status,
      ...g, runs: rs.length, times,
      ledger: rs.slice().reverse().map(r => ({ ts: r.ts, startedAt: r.startedAt || null, runId: r.runId, ...(r.chunk ? { chunk: r.chunk, chunks: r.chunks, file: r.file || null } : {}), state: r.state, snapshot: r.snapshot || null, provider: r.provider || null, ...(r.route ? { route: r.route } : {}), ...(r.precedent ? { precedent: r.precedent } : {}), ...(r.against ? { against: r.against, overlaid: r.overlaid || [], againstNote: r.againstNote || null, leverage: r.leverage || null } : {}), ...(r.rung ? { rung: r.rung, rungs: r.rungs, attempt: r.attempt } : {}),
        error: r.error || null, injected: r.injects ? r.injects.injected || [] : [], reply: r.reply ? String(r.reply).slice(0, 600) : null })),
    };
  });
  const cur = steps.find(s => s.status !== 'complete' && s.status !== 'done' && (s.run && s.run.state === 'building'))
    || steps.find(s => s.status !== 'complete' && s.status !== 'done') || null;
  if (cur) cur.current = true;
  const complete = steps.filter(s => s.status === 'complete' || s.status === 'done').length;
  return { steps, summary: { total: steps.length, complete, building: steps.filter(s => s.run && s.run.state === 'building').length,
    failed: steps.filter(s => s.failed).length, current: cur ? cur.key : null,
    progress: steps.length ? +(steps.reduce((a, s) => a + s.progress, 0) / steps.length).toFixed(3) : 0 }, gates: GATES };
}
