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
import { createRequire } from 'module';
const _req = createRequire(import.meta.url);
// 0.60.27 AG1a — each phase says what it cost in agent calls and tokens (lib/phase-cost.js, pure, over the same rows)
let _PC = null; try { _PC = _req('../../lib/phase-cost.js'); } catch (_) { _PC = null; }

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

// ── §0.60.123 PP1/PP2 — James: "each chunk/dependancy a piece of the progress indication. progress shows for each task
// with a full run history, and log to make it explicit." Pure, over the raw rows buildPlan already gets (0.60.27).
let _RW = null, _PPL = null;
try { _RW = _req('../../lib/run-watch.js'); } catch (_) { _RW = null; }
try { _PPL = _req('../../lib/phase-plan.js'); } catch (_) { _PPL = null; }
const _FAIL = new Set(['failed', 'incomplete', 'blocked']);
const _MOVING = new Set(['retrying', 'escalating']);
const _baseRun = (id) => String(id || '').replace(/-(review|proof)$/, '');
const _cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/**
 * piecesOf(phase, rows) → { pieces: [{ path, state, attempts, agent, uses, why, at }], from, open }
 *   the pieces: the latest plan's files, else the phase's files:; neither → one 'whole phase' piece (from: 'whole')
 *   state: pending · running · written (proposed or written) · failed · proven · done (the phase is complete)
 *   uses: what the piece imports among the others (lib/phase-plan.js depsOf over the latest plan)
 */
export function piecesOf(phase = {}, rows = []) {
  const rs = [...(rows || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const planRow = [...rs].reverse().find(r => r.state === 'planned' && r.plan && Array.isArray(r.plan.files) && r.plan.files.length);
  let paths = planRow ? planRow.plan.files.map(f => f.path).filter(Boolean) : [];
  let from = planRow ? (planRow.derived ? 'the plan Nexus wrote' : 'the plan') : 'the phase\'s files';
  if (!paths.length) paths = [...new Set((phase.files || []).map(f => String(f).split(/[\s(]/)[0]).filter(f => f && /[\w-]\.[\w]+$/.test(f)))];
  const whole = !paths.length;
  if (whole) { paths = ['(whole phase)']; from = 'whole'; }
  let deps = new Map();
  if (planRow && _PPL) { try { deps = _PPL.depsOf(planRow.plan); } catch (_) { deps = new Map(); } }
  const P = new Map(paths.map(p => [p, { path: p, state: 'pending', attempts: 0, agent: null, uses: (deps.get && deps.get(p)) || [], why: null, at: null }]));
  const touch = (pc, st, r) => { pc.state = st; pc.at = r.ts || pc.at; if (r.provider) pc.agent = r.provider; if (st === 'failed') pc.why = _cut(r.error || r.state, 200); if (st === 'written') pc.why = null; };
  // §0.60.141 TF2 — the test written first is a piece, first in the bar: written when it was seen failing and shaped the
  // plan, failed when no usable test came; its piece is proven with the phase (its run is the first condition)
  const tf = rs.filter(r => r.state === 'test-first' && r.file && ['shaped', 'refused', 'invalid', 'no-answer'].includes(r.step));
  if (tf.length && !whole) {
    const tp = tf[tf.length - 1].file;
    { const own = P.get(tp) || { path: tp, state: 'pending', attempts: 0, agent: null, uses: [], why: null, at: null }; const rest = [...P].filter(([k]) => k !== tp); P.clear(); P.set(tp, own); for (const [k, v] of rest) P.set(k, v); }   // first, always
    const pc = P.get(tp);
    for (const r of tf.filter(x => x.file === tp)) {
      pc.attempts += r.step === 'shaped' || r.step === 'invalid' ? 1 : 0; pc.at = r.ts || pc.at; if (r.provider) pc.agent = r.provider;
      if (r.step === 'shaped') { pc.state = 'written'; pc.why = null; } else { pc.state = 'failed'; pc.why = _cut(r.error || r.note || r.step, 200); }
    }
  }
  for (const r of rs) {
    if (/-proof$/.test(r.runId || '')) continue;
    if (r.state === 'test-first') continue;
    const injected = (r.injects && r.injects.injected) || [];
    if (whole) {
      const pc = P.get('(whole phase)');
      if (r.state === 'replied' && r.provider) { pc.attempts++; touch(pc, injected.length ? 'written' : 'failed', r); }
      else if (_FAIL.has(r.state) && r.provider) { pc.attempts++; touch(pc, 'failed', r); }
      else if (_MOVING.has(r.state) || r.state === 'building') touch(pc, 'running', r);
      continue;
    }
    if (r.file && P.has(r.file)) {
      const pc = P.get(r.file);
      if (r.state === 'replied' && r.provider) { pc.attempts++; touch(pc, 'written', r); }
      else if (_FAIL.has(r.state) && r.provider) { pc.attempts++; touch(pc, 'failed', r); }
      else if (_MOVING.has(r.state)) touch(pc, 'running', r);
      continue;
    }
    if (r.provider && (r.state === 'replied' || _FAIL.has(r.state))) {   // a whole-phase attempt: what it brought back, what it left out
      const absent = new Set(r.absent || []);
      for (const [p, pc] of P) {
        if (injected.includes(p)) { pc.attempts++; touch(pc, 'written', r); }
        else if (absent.has(p) || (_FAIL.has(r.state) && pc.state !== 'written')) { pc.attempts++; touch(pc, 'failed', r); }
      }
    }
  }
  // the proof: a proven run after the last write proves what was written; a complete phase is done
  const proofs = rs.filter(r => /-proof$/.test(r.runId || '') && ['proven', 'unproven', 'no-proof'].includes(r.state));
  const lastProof = proofs[proofs.length - 1];
  for (const pc of P.values()) {
    if (lastProof && lastProof.state === 'proven' && pc.state === 'written' && (lastProof.ts || 0) >= (pc.at || 0)) pc.state = 'proven';
    if ((phase.status === 'complete' || phase.status === 'done') && pc.state !== 'proven') pc.state = 'done';
  }
  // a run still open: what has not landed in it is running
  let open = false;
  if (_RW && rs.length) {
    const runs = [..._RW.runsOf(rs.filter(r => !/-(review|proof)$/.test(r.runId || ''))).values()].sort((a, b) => (b.last.ts || 0) - (a.last.ts || 0));
    const latest = runs[0];
    open = !!(latest && !_RW.isFinal(latest) && latest.last.state !== 'paused');
    if (open) for (const pc of P.values()) if (pc.state === 'pending' || (pc.state === 'failed' && (pc.at || 0) < (latest.rows[0].ts || 0))) pc.state = 'running';
  }
  return { pieces: [...P.values()], from, open };
}

/** historyOf(rows) → every run of the phase, newest first, each with its log (every row in time order); cut and said */
export function historyOf(rows = [], { maxRuns = 12, maxRows = 80 } = {}) {
  const by = new Map();
  for (const r of rows || []) { if (!r || !r.runId) continue; const k = _baseRun(r.runId); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const runs = [...by.entries()].map(([runId, rs]) => {
    rs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const last = rs[rs.length - 1];
    const proof = [...rs].reverse().find(r => /-proof$/.test(r.runId || ''));
    const agents = [...new Set(rs.map(r => r.provider || r.reviewer).filter(Boolean))];
    const starter = (rs.find(r => r.startedBy) || {}).startedBy || null;   // 0.60.188 RC7 — who started the run; an older row has none (said as such)
    const rebuild = rs.some(r => r.rebuild);   // §0.60.226 SL7 — a complete phase built again on request
    const mappedBy = (rs.find(r => r.mappedBy) || {}).mappedBy || null;   // §0.60.228 SL8 — the graph came from the agent's checked mapping
    return { runId, startedAt: rs[0].ts || null, endedAt: last.ts || null, end: proof ? proof.state : last.state, agents, startedBy: starter, total: rs.length,
      ...(rebuild ? { rebuild: true } : {}), ...(mappedBy ? { mappedBy } : {}),
      cut: rs.length > maxRows ? rs.length - maxRows : 0,
      log: rs.slice(-maxRows).map(r => ({ ts: r.ts || null, state: r.state, part: /-review$/.test(r.runId || '') ? 'review' : /-proof$/.test(r.runId || '') ? 'proof' : null,
        provider: r.provider || r.reviewer || null, file: r.file || null, rung: r.rung || null, attempt: r.attempt || null,
        // §0.60.145 TL2a — the row says when the gate's kept reply was reused instead of asking again, and when its context went with it
        note: _cut((r.reused ? `reused job ${String(r.reused.jobId).slice(0, 12)}'s reply${r.reused.waitedMs ? ` (waited ${Math.round(r.reused.waitedMs / 1000)} s for it)` : ''} — not asked again · ` : '') + (r.gateContext ? `carried this gate's context (${r.gateContext}ch) · ` : '') + (r.error || r.note || r.planSummary || (r.ready && r.ready.line) || (r.injects && (r.injects.injected || []).length ? `wrote ${(r.injects.injected || []).join(', ')}` : '')), 240), ...(r.reused ? { reused: true } : {}) })) };
  }).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  return { runs: runs.slice(0, maxRuns), more: Math.max(0, runs.length - maxRuns) };
}

export function buildPlan({ phases = [], runs = [], rows = null, order = null, now = Date.now() } = {}) {
  // 0.60.27 AG1a — the cost counts every call's own row (rows, unmerged); merged runs (one row per run) undercount
  const rowsBy = new Map();
  for (const r of rows || runs) { const k = `${r.map}::${r.phase}`; if (!rowsBy.has(k)) rowsBy.set(k, []); rowsBy.get(k).push(r); }
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
      key: p.phase_key, uuid: p.uuid || null, map: p.map, title: p.title || p.name || p.phase_key, layer: p.layer || null, status: p.status, ...(p.shelf ? { shelf: true } : {}),
      ...g, runs: rs.length, times,
      // §0.60.123 PP1/PP2 — its pieces (the progress) and every run with its log
      ...(() => { const raw = rowsBy.get(`${p.map}::${p.phase_key}`) || []; const pc = piecesOf(p, raw); return { pieces: pc.pieces, piecesFrom: pc.from, open: pc.open, history: historyOf(raw) }; })(),
      ...(_PC && (rowsBy.get(`${p.map}::${p.phase_key}`) || []).length ? (() => { const c = _PC.costOf(rowsBy.get(`${p.map}::${p.phase_key}`)); return c.calls ? { cost: { calls: c.calls, byRole: c.byRole, local: c.local, remote: c.remote, tokensIn: c.tokensIn, tokensOut: c.tokensOut, runs: c.runs.length, method: c.method, line: _PC.line(c) } } : {}; })() : {}),
      ledger: rs.slice().reverse().map(r => ({ ts: r.ts, startedAt: r.startedAt || null, runId: r.runId, ...(r.chunk ? { chunk: r.chunk, chunks: r.chunks, file: r.file || null } : {}), state: r.state, snapshot: r.snapshot || null, provider: r.provider || null, ...(r.route ? { route: r.route } : {}), ...(r.precedent ? { precedent: r.precedent } : {}), ...(r.context ? { context: r.context } : {}), ...(r.against ? { against: r.against, overlaid: r.overlaid || [], againstNote: r.againstNote || null, leverage: r.leverage || null } : {}), ...(r.rung ? { rung: r.rung, rungs: r.rungs, attempt: r.attempt } : {}),
        // §0.60.0 PC1/PC2 — plan, then code: what the planner read and mapped, why a plan was refused, what a coder dropped
        ...(r.planning ? { planning: r.planning } : {}), ...(r.system ? { system: r.system } : {}), ...(r.grounding ? { grounding: r.grounding } : {}),
        ...(r.planSummary ? { planSummary: r.planSummary, plan: r.plan ? { system: r.plan.system || null, read: r.plan.read || [], intent: r.plan.intent, order: r.plan.order, files: (r.plan.files || []).map(f => ({ path: f.path, component: f.component, new: f.new, layer: f.layer, exports: (f.exports || []).map(e => e.name) })), conditions: (r.plan.conditions || []).map(c => c.says) } : null, warnings: r.warnings || [] } : {}),
        ...(r.problems ? { problems: r.problems } : {}), ...(r.missingExports ? { missingExports: r.missingExports } : {}), ...(r.planned ? { planned: true } : {}), ...(r.coderOrder ? { coderOrder: r.coderOrder, note: r.note || null } : {}),
        // 0.60.28 PF1/PF2 — what was ready before the run, and a plan Nexus wrote without a model
        ...(r.ready ? { ready: r.ready } : {}), ...(r.derived ? { derived: true, derivedNote: r.note || null } : {}),
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
