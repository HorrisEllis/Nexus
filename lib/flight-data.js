'use strict';
/**
 * lib/flight-data.js — FR6: one agent run read whole, the way a flight recorder is read after a flight.
 * Product: flight-recorder   (products/flight-recorder; the branch tool carries every file tagged so)
 * comp_id: nexus.lib.flight-data
 * Map: docs/2026-10-16-repo-carve-phasemap.spec (FR6_flight_data)
 *
 * James, 2026-10-17: "we need to continue building the flight recorder. look at rfr2, and cfr for friction and tension.
 * versionium, cos test envirenements and branching for benchmarks. compartemtns to sandbox." · and, on the pitch: "once
 * proven, email them and tell them i could save them money on repair costs" — so a run's cost, and how much of it was
 * spent on attempts that never landed, has to be a number the record already holds, not an estimate.
 *
 * A projection, never a second store (§7.6), like lib/change-record.js: every number comes from the idearium_phase_runs
 * rows a phase build already writes, read through what already reads them —
 *   lib/run-watch.js runsOf / isFinal        the run, its rows oldest first, whether it ended
 *   lib/phase-cost.js costOf                 its agent calls and tokens (estimate-v1 at the source, else chars/4: said)
 *   lib/phase-faults.js modeOf               each failed attempt's failure mode (timeout, wrote-nothing, missed-files …)
 *   intelligence's CFR delta                 the tension of each step to the next (ok → error, retry → retry spike), handed
 *                                            in as opts.delta — CFR is intelligence's capability, reached through its route
 *                                            POST /api/intelligence/cfr/delta (0.60.146), never required from here: lib/ is
 *                                            the kernel and does not reach up into a system (D1, the drawbridge ratchet)
 * Friction is the diagnostic's own definition (diagnostic/spec/diagnostic.spec friction-scorer: failed / total), over the
 * run's agent calls. CFR's delta also returns a latency friction, which saturates for any agent call over 30 s, so it is
 * not used here: said, not hidden.
 *
 *   flight(rows, { now, stuckAfter })   → the run: ladder, cost, faults, landed or not, wasted, friction, tension, verdict
 *   summary(rows, opts)                 → every run: landed vs not, the calls, tokens and minutes spent on attempts that
 *                                         never landed, the modes that recur, each agent's land rate
 *   lines(flight) · summaryLines(sum)   → what a person reads
 *
 * The verdict that matters (seen on his machine, 2026-10-17, IM1: ten attempts over four providers, each failing): when
 * the SAME failure mode comes back from two or more different agents, the cause is most likely the brief or the phase,
 * not the agent, and climbing the ladder further only spends more. §17.7 — the second occurrence is an investigation.
 */
const RW = require('./run-watch.js');
const PC = require('./phase-cost.js');
const PF = require('./phase-faults.js');

const MODULE_ID = 'nexus.lib.flight-data';
const VERSION = '1.1.0';   // 1.1.0 (0.60.146): CFR's delta handed in, not required (the boundary)
const LANDED = new Set(['proven', 'contract-complete']);
const STUCK_AFTER = 4;

// a phase-run row pair as the events CFR's delta reads; the caller sends these to intelligence and hands back a lookup
function transitions(rows = []) {
  const rs = rows.filter(Boolean).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const out = [];
  for (let i = 1; i < rs.length; i++) out.push([_event(rs[i - 1]), _event(rs[i])]);
  return out;
}

// a phase-run row as the event CFR's delta reads: a fault carries 'error', a retry or a climb 'retry'
function _event(r) {
  const mode = PF.modeOf(r);
  const kind = mode ? `error.${mode}` : (r.state === 'retrying' || r.state === 'escalating') ? `retry.${r.state}` : String(r.state || 'step');
  return { type: `phase.${kind}`, ts: r.ts || 0, payload: { state: r.state, provider: r.provider || null, attempt: r.attempt || null } };
}

function _groupRows(rows) {
  // a run's review and proof belong to the run (phase-cost's own rule)
  const by = new Map();
  for (const run of RW.runsOf(rows).values()) {
    const base = run.runId.replace(/-(review|proof)$/, '');
    if (!by.has(base)) by.set(base, []);
    by.get(base).push(...run.rows);
  }
  for (const rs of by.values()) rs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  return by;
}

/** flight(rows) — rows of ONE run (with its -review / -proof rows); any order */
function flight(rows = [], { now = Date.now(), stuckAfter = STUCK_AFTER, delta = null } = {}) {
  const rs = rows.filter(Boolean).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (!rs.length) return null;
  const first = rs[0], last = rs[rs.length - 1];
  const runId = String(first.runId || '').replace(/-(review|proof)$/, '');
  const ended = RW.isFinal({ runId, rows: rs, last });
  const landed = rs.some(r => LANDED.has(r.state));

  // the ladder: each agent in the order it was first asked, with its calls and how its attempts ended
  const ladder = [];
  const byAgent = new Map();
  const faults = {};
  const calls = [];
  for (const r of rs) {
    const role = PC.isCall(r);
    const mode = PF.modeOf(r);
    if (mode) faults[mode] = (faults[mode] || 0) + 1;
    if (!role) continue;
    const agent = PC.agentOf(r);
    if (!byAgent.has(agent)) { const a = { agent, local: PC.isLocal(agent), calls: 0, faults: {} }; byAgent.set(agent, a); ladder.push(a); }
    const a = byAgent.get(agent);
    a.calls++;
    if (mode) a.faults[mode] = (a.faults[mode] || 0) + 1;
    calls.push({ row: r, role, agent, mode });
  }
  if (rs.some(r => r.ladderExhausted)) faults['ladder-exhausted'] = (faults['ladder-exhausted'] || 0) + 1;

  const cost = PC.costOf(rs);
  const attempts = rs.reduce((m, r) => Math.max(m, Number(r.attempt) || 0), 0) || null;

  // wasted: every call of a run that never landed; in one that did, the calls that ended in a fault
  const wastedCalls = landed ? calls.filter(c => c.mode) : calls;
  const wTok = wastedCalls.reduce((s, c) => { const t = PC.tokensOf(c.row); return { in: s.in + t.in, out: s.out + t.out }; }, { in: 0, out: 0 });
  const lastWaste = wastedCalls.length ? wastedCalls[wastedCalls.length - 1].row.ts || 0 : 0;
  const wallMs = Math.max(0, (ended ? (last.ts || 0) : now) - (first.ts || 0));
  const wastedMs = landed ? Math.max(0, lastWaste - (first.ts || 0)) : wallMs;

  // friction (the diagnostic's definition) and tension (CFR's delta, step to step)
  const code = calls.filter(c => c.role === 'code');
  const friction = code.length ? +(code.filter(c => c.mode).length / code.length).toFixed(4) : 0;
  // delta(prev, curr) → { tension } — CFR's, handed in by the caller (from intelligence's route); absent → tension unavailable
  const steps = [];
  let deltaMissing = 0;
  if (typeof delta === 'function') for (let i = 1; i < rs.length; i++) {
    const d = delta(_event(rs[i - 1]), _event(rs[i]));
    if (!d || typeof d.tension !== 'number') { deltaMissing++; continue; }
    steps.push({ at: rs[i].ts || 0, from: rs[i - 1].state, to: rs[i].state, tension: d.tension });
  }
  const tensionKnown = typeof delta === 'function' && steps.length > 0;
  const tension = steps.length ? { max: Math.max(...steps.map(s => s.tension)), mean: +(steps.reduce((s, x) => s + x.tension, 0) / steps.length).toFixed(4) } : { max: 0, mean: 0 };
  const turbulence = steps.filter(s => s.tension >= 0.4);

  // the same mode from different agents: the cause is the brief or the phase, not the agent
  const agentsPerMode = {};
  for (const c of code) if (c.mode) (agentsPerMode[c.mode] = agentsPerMode[c.mode] || new Set()).add(c.agent);
  const shared = Object.entries(agentsPerMode).filter(([, s]) => s.size >= 2).map(([mode, s]) => ({ mode, agents: [...s] }));

  let verdict = 'flying', why = null;
  if (landed) { verdict = 'landed'; why = friction ? `landed after ${wastedCalls.length} failed call(s)` : 'landed clean'; }
  else if (shared.length && code.length >= 2) {
    verdict = 'stuck';
    why = `the same failure (${shared.map(s => s.mode).join(', ')}) came back from ${Math.max(...shared.map(s => s.agents.length))} different agents — the brief or the phase is the likely cause, not the agent; another rung spends more for the same result (§17.7)`;
  } else if (faults['ladder-exhausted']) { verdict = 'stuck'; why = 'every agent on the ladder was tried'; }
  else if (ended) { verdict = 'crashed'; why = `ended ${last.state} without landing`; }
  else if (code.length >= stuckAfter && friction >= 0.75) { verdict = 'turbulent'; why = `${code.length} attempts, ${Math.round(friction * 100)}% failed`; }

  return {
    runId, map: first.map || null, phase: first.phase || last.phase || null, repoUuid: first.repoUuid || null,
    startedAt: first.ts || null, endedAt: ended ? last.ts || null : null, ended, state: last.state, landed, attempts,
    wallMs, ladder: ladder.map(a => ({ agent: a.agent, local: a.local, calls: a.calls, faults: a.faults })),
    cost: { calls: cost.calls, byRole: cost.byRole, local: cost.local, remote: cost.remote, tokensIn: cost.tokensIn, tokensOut: cost.tokensOut, method: cost.method },
    faults, wasted: { calls: wastedCalls.length, tokensIn: wTok.in, tokensOut: wTok.out, ms: wastedMs },
    friction, tension, turbulence: turbulence.map(s => ({ at: s.at, from: s.from, to: s.to, tension: s.tension })),
    sharedFailure: shared, verdict, why,
    tensionKnown,
    sources: { friction: 'diagnostic friction-scorer: failed / total agent calls',
      tension: tensionKnown ? `CFR delta from intelligence (POST /api/intelligence/cfr/delta), step to step${deltaMissing ? `; ${deltaMissing} step(s) without an answer` : ''}` : (typeof delta === 'function' ? 'unavailable: intelligence answered no step' : 'unavailable: no CFR delta was handed in (intelligence not reached)'),
      tokens: cost.method || null },
  };
}

/** summary(rows) — rows of many runs: what landed and what it cost to get there, and what was spent on what never landed */
function summary(rows = [], opts = {}) {
  const flights = [..._groupRows(rows).values()].map(rs => flight(rs, opts)).filter(Boolean).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const s = { runs: flights.length, landed: 0, stuck: 0, flying: 0, calls: 0, wastedCalls: 0, wastedTokens: 0, wastedMs: 0, modes: {}, agents: {} };
  for (const f of flights) {
    if (f.landed) s.landed++; else if (f.verdict === 'stuck') s.stuck++; else if (!f.ended) s.flying++;
    s.calls += f.cost.calls; s.wastedCalls += f.wasted.calls; s.wastedTokens += f.wasted.tokensIn + f.wasted.tokensOut; s.wastedMs += f.wasted.ms;
    for (const [m, n] of Object.entries(f.faults)) s.modes[m] = (s.modes[m] || 0) + n;
    for (const a of f.ladder) {
      const x = s.agents[a.agent] || (s.agents[a.agent] = { calls: 0, failed: 0, runs: 0, landedRuns: 0 });
      x.calls += a.calls; x.failed += Object.values(a.faults).reduce((p, n) => p + n, 0); x.runs++;
      // a run's landing is credited to the last agent that made a code call in it
    }
    const lastAgent = [...f.ladder].reverse()[0];
    if (f.landed && lastAgent && s.agents[lastAgent.agent]) s.agents[lastAgent.agent].landedRuns++;
  }
  s.wastedShare = s.calls ? +(s.wastedCalls / s.calls).toFixed(4) : 0;
  return { ...s, flights };
}

const _min = (ms) => ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 1000)} s`;
const _k = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);

function lines(f) {
  if (!f) return ['no rows for this run'];
  const out = [];
  out.push(`${f.verdict.toUpperCase()} · ${f.phase || '?'}${f.map ? ` (${f.map})` : ''} · ${f.attempts ? `${f.attempts} attempt(s) · ` : ''}${_min(f.wallMs)}${f.ended ? '' : ' so far'}`);
  if (f.why) out.push(`  ${f.why}`);
  out.push(`ladder: ${f.ladder.map(a => `${a.agent}×${a.calls}${Object.keys(a.faults).length ? ` (${Object.entries(a.faults).map(([m, n]) => `${m}${n > 1 ? `×${n}` : ''}`).join(', ')})` : ''}`).join(' → ') || 'no agent calls'}`);
  out.push(`cost: ${PC.line(f.cost)}`);
  out.push(`wasted: ${f.wasted.calls} call(s) · ~${_k(f.wasted.tokensIn + f.wasted.tokensOut)} tokens · ${_min(f.wasted.ms)}`);
  out.push(`friction ${f.friction.toFixed(2)} · ${f.tensionKnown ? `tension max ${f.tension.max.toFixed(2)} mean ${f.tension.mean.toFixed(2)}${f.turbulence.length ? ` · ${f.turbulence.length} turbulent step(s)` : ''}` : `tension unavailable (${f.sources.tension.replace(/^unavailable: /, '')})`}`);
  return out;
}

function summaryLines(s) {
  if (!s || !s.runs) return ['no runs recorded'];
  const out = [`${s.runs} run(s): ${s.landed} landed · ${s.stuck} stuck · ${s.flying} still flying`];
  out.push(`spent on attempts that never landed: ${s.wastedCalls} of ${s.calls} call(s) (${Math.round(s.wastedShare * 100)}%) · ~${_k(s.wastedTokens)} tokens · ${_min(s.wastedMs)}`);
  const modes = Object.entries(s.modes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (modes.length) out.push(`recurring failures: ${modes.map(([m, n]) => `${m}×${n}`).join(', ')}`);
  const agents = Object.entries(s.agents).sort((a, b) => b[1].calls - a[1].calls);
  if (agents.length) out.push(`agents: ${agents.map(([a, x]) => `${a} ${x.landedRuns}/${x.runs} landed, ${x.failed}/${x.calls} calls failed`).join(' · ')}`);
  return out;
}

module.exports = { MODULE_ID, VERSION, LANDED, transitions, flight, summary, lines, summaryLines };
