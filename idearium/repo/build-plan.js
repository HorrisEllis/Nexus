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
 *                                         progress, current, ledger:[…] }], summary }
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

export function buildPlan({ phases = [], runs = [], order = null } = {}) {
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
    return {
      key: p.phase_key, uuid: p.uuid || null, map: p.map, title: p.title || p.name || p.phase_key, layer: p.layer || null, status: p.status,
      ...g, runs: rs.length,
      ledger: rs.slice().reverse().map(r => ({ ts: r.ts, runId: r.runId, state: r.state, snapshot: r.snapshot || null, provider: r.provider || null,
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
