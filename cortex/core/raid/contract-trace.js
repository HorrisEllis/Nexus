'use strict';
/**
 * cortex/core/raid/contract-trace.js — GW3: a contract traced end to end, one ordered story per brick.
 * comp_id: nexus.cortex.core.raid.contract-trace
 *
 * James, 2026-10-15: "each contract tracked through the system using the event ledger, tagging and each gate, the
 * intelligence system, physical file running through the back end." · 2026-10-16, deciding GW0: "Yes. It’s analysis. The
 * bricks." (the brick is the unit, so the trace is per brick).
 *
 * §7.6 the trace is a projection of what was already written, never a second record. It joins:
 *   the contract's own log  p.state.evidence_log ({ key, value, by, at }) — every record() since the contract was made
 *   its checkpoints         p.state.checkpoints ({ gate, at, hashes, agent, commit }) — every pass, its input hashes
 *   the run's ledger rows   idearium_phase_runs rows of this build (GT2: brick moves with provider, class, commit, progress)
 *   RAID's queue row        (optional) the contract's row in RAID's queue: its status, the job it dispatched
 * Holes are named, never filled (§1.2, §0.1): a PASSED brick with no commit, a move with no agent, a brick whose state says
 * it ran with no move on the ledger, a checkpoint commit no move carries.
 *
 * trace(p, { runs, raid }) → { contract, complete, bricks: [{ id, file, status, attempts, agents, commits, files, steps }],
 *                              steps: [{ at, gate, what, detail, by, source }], holes: [{ gate, what }], counts }
 */
const VERSION = '1.0.0';

function _gateOf(key) {
  const k = String(key || '');
  const i = k.lastIndexOf('.');
  return i > 0 ? k.slice(0, i) : null;
}

function trace(p, { runs = [], raid = null } = {}) {
  const state = (p && p.state) || {};
  const gates = (p && p.gates) || [];
  const bricks = gates.filter(g => g.type !== 'phase');
  const ids = new Set(gates.map(g => g.id));
  const steps = [];

  // the contract's own log: each record, with who wrote it and when
  for (const e of state.evidence_log || []) {
    const gate = ids.has(_gateOf(e.key)) ? _gateOf(e.key) : null;
    steps.push({ at: e.at || null, gate, what: gate ? String(e.key).slice(gate.length + 1) : e.key, detail: e.value, by: e.by || null, source: 'contract' });
  }
  // every pass: its input hashes and the commit it passed at
  for (const c of state.checkpoints || []) {
    steps.push({ at: c.at || null, gate: c.gate, what: 'checkpoint', detail: c.commit ? `passed at ${c.commit}` : 'passed (no commit recorded)', by: c.agent || null, source: 'checkpoint',
      commit: c.commit || null, hashes: c.hashes || {} });
  }
  // the run's ledger: each gate move (GT2) and the run's own states
  for (const r of runs) {
    if (!r) continue;
    const gate = r.brick || null;
    steps.push({ at: r.ts || null, gate, what: r.state, detail: r.error || (r.progress ? `${r.progress.passed}/${r.progress.total} passed` : null), by: r.provider || null, source: 'ledger',
      ...(r.commit ? { commit: r.commit } : {}), ...(r.file ? { file: r.file } : {}), ...(r.failureClass ? { class: r.failureClass } : {}) });
  }
  if (raid) steps.push({ at: raid.updatedAt || raid.createdAt || null, gate: null, what: `raid.${String(raid.status || 'queued').toLowerCase()}`, detail: raid.dispatchedJobId ? `job ${raid.dispatchedJobId}` : null, by: raid.forAgent || null, source: 'raid' });
  steps.sort((a, b) => (a.at || 0) - (b.at || 0));

  const evd = state.evidence || {};
  const holes = [];
  const out = bricks.map(g => {
    const st = (state.gates || {})[g.id] || {};
    const mine = steps.filter(s => s.gate === g.id);
    const moves = mine.filter(s => s.source === 'ledger');
    const agents = [...new Set(mine.map(s => s.by).filter(b => b && !/^scheduler:/.test(b)))];
    const commits = [...new Set(mine.map(s => s.commit).filter(Boolean))];
    let rewound = null; try { rewound = evd[`${g.id}.rewound`] ? JSON.parse(evd[`${g.id}.rewound`]) : null; } catch (_) {}
    const files = [...new Set([g.file, ...moves.map(m => m.file), ...((rewound && rewound.files) || [])].filter(Boolean))];
    if (st.status === 'PASSED' && !commits.length && !evd[`${g.id}.commit`]) holes.push({ gate: g.id, what: 'PASSED with no commit recorded: it cannot be rewound to' });
    for (const m of moves) if (!m.by && /^brick-(passed|failed)$/.test(m.what)) holes.push({ gate: g.id, what: `a ${m.what.replace('brick-', '')} move with no agent named` });
    if ((st.attempts || 0) > 0 && !moves.length && runs.length) holes.push({ gate: g.id, what: `ran ${st.attempts} time(s) by its state, but no move of it is on the ledger` });
    return { id: g.id, file: g.file || null, status: st.status || null, attempts: st.attempts || 0, agents, commits, files, ...(rewound ? { rewound } : {}), steps: mine.length };
  });
  const moveCommits = new Set(steps.filter(s => s.source === 'ledger' && s.commit).map(s => s.commit));
  for (const c of state.checkpoints || []) if (c.commit && runs.length && !moveCommits.has(c.commit)) holes.push({ gate: c.gate, what: `checkpoint commit ${c.commit} is on no ledger move` });

  return {
    version: VERSION, contract: (p && p.uuid) || null, complete: null,
    bricks: out, steps, holes,
    counts: { bricks: out.length, passed: out.filter(b => b.status === 'PASSED').length, steps: steps.length, holes: holes.length,
      files: [...new Set(out.flatMap(b => b.files))].length, commits: [...new Set(out.flatMap(b => b.commits))].length },
  };
}

/** lines(t) — the trace as plain lines, oldest first (the CLI and an agent read this) */
function lines(t, { limit = 200 } = {}) {
  const fmt = (at) => (at ? new Date(at).toISOString().replace('T', ' ').slice(0, 19) : '—'.padEnd(19));
  return t.steps.slice(-limit).map(s => `${fmt(s.at)}  ${(s.gate || '(run)').padEnd(18)} ${String(s.what).padEnd(16)} ${s.by ? `${s.by} · ` : ''}${s.detail ? String(s.detail).slice(0, 120) : ''}${s.commit ? `  @${String(s.commit).slice(0, 12)}` : ''}`);
}

module.exports = { VERSION, trace, lines };
