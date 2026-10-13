'use strict';
/**
 * lib/phase-cost.js — 0.60.27 AG1a — what a phase cost in agent calls and tokens.
 *
 * James (2026-10-13): "it would be nice to use agents intentionally for what theyre best at. as little as possible. …
 * less tokens from you, the better." The rule in docs/CLAUDE.md ends "Count it." This is the count.
 *
 * Every agent call of a phase build already writes an idearium_phase_runs row:
 *   - 'planning' for each planner call;
 *   - an attempt row (replied · failed · incomplete · blocked) for each coder call, with the agent's provider;
 *   - 'reviewing' for each draft review (the agent is row.reviewer).
 * Pure functions over those rows.
 *
 *   isCall(row)        → 'plan' | 'code' | 'review' | null   (escalating, retrying, proof, skipped rows are not calls)
 *   isLocal(provider)  → an Ollama model (runs on his machine) rather than a remote agent
 *   tokensOf(row)      → { in, out, method }   estimate-v1 recorded at the source, else chars/4 for older rows
 *   costOf(rows)       → { calls, byRole, byAgent, local, remote, tokensIn, tokensOut, method, runs: [...] }
 *   line(cost)         → "N calls (plan p · code c · review r) · L local · R remote · ~T tokens"
 */
const { runsOf } = require('./run-watch.js');

const VERSION = '1.0.0';
const CODE_STATES = new Set(['replied', 'failed', 'incomplete', 'blocked']);

function isCall(r) {
  if (!r) return null;
  if (r.state === 'planning' && r.provider) return 'plan';
  if (r.state === 'reviewing' && (r.reviewer || r.provider)) return 'review';
  // a coder attempt: a provider and an attempt end. A chunk-stopped row restates a failure; it is not another call.
  if (CODE_STATES.has(r.state) && r.provider && !r.chunkStopped && !/-(review|proof)$/.test(String(r.runId || ''))) return 'code';
  return null;
}

function agentOf(r) { return String(r.reviewer || r.provider || 'unknown'); }
function isLocal(provider) { return /^ollama(:|$)/i.test(String(provider || '')) || /^local(:|$)/i.test(String(provider || '')); }

function tokensOf(r) {
  if (Number.isFinite(r.tokensIn) || Number.isFinite(r.tokensOut)) return { in: r.tokensIn || 0, out: r.tokensOut || 0, method: 'estimate-v1' };
  const outChars = Number.isFinite(r.replyChars) ? r.replyChars : (r.reply ? String(r.reply).length : 0);
  return { in: Math.ceil((r.promptChars || 0) / 4), out: Math.ceil(outChars / 4), method: 'chars/4' };
}

function _tally(rows) {
  const t = { calls: 0, byRole: { plan: 0, code: 0, review: 0 }, byAgent: {}, local: 0, remote: 0, tokensIn: 0, tokensOut: 0, methods: new Set() };
  for (const r of rows) {
    const role = isCall(r);
    // a review's answer is written on its end row (reviewed · failed · …); its call was counted on 'reviewing'
    if (!role) { if (/-review$/.test(String(r.runId || '')) && Number.isFinite(r.tokensOut)) t.tokensOut += r.tokensOut; continue; }
    const a = agentOf(r), k = tokensOf(r);
    t.calls++; t.byRole[role]++;
    t.byAgent[a] = (t.byAgent[a] || 0) + 1;
    if (isLocal(a)) t.local++; else t.remote++;
    t.tokensIn += k.in; t.tokensOut += k.out; t.methods.add(k.method);
  }
  const method = t.methods.size > 1 ? 'mixed: estimate-v1 and chars/4 (older rows)' : [...t.methods][0] || null;
  delete t.methods;
  return { ...t, method };
}

/** costOf(rows) — the phase total and each run's own count, newest run first */
function costOf(rows = []) {
  const total = _tally(rows);
  const byRun = new Map();
  for (const run of runsOf(rows).values()) {
    const base = run.runId.replace(/-(review|proof)$/, '');   // a run's review is part of that run
    if (!byRun.has(base)) byRun.set(base, []);
    byRun.get(base).push(...run.rows);
  }
  const runs = [...byRun.entries()].map(([runId, rs]) => ({ runId, at: Math.max(...rs.map(r => r.ts || 0)), ..._tally(rs) }))
    .filter(r => r.calls).sort((a, b) => b.at - a.at);
  return { ...total, runs };
}

function _k(n) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n); }
function line(c) {
  if (!c || !c.calls) return 'no agent calls yet';
  const roles = ['plan', 'code', 'review'].filter(x => c.byRole[x]).map(x => `${x} ${c.byRole[x]}`).join(' · ');
  return `${c.calls} call${c.calls === 1 ? '' : 's'} (${roles}) · ${c.local} local · ${c.remote} remote · ~${_k(c.tokensIn)} tokens in, ~${_k(c.tokensOut)} out`;
}

module.exports = { VERSION, isCall, isLocal, agentOf, tokensOf, costOf, line };
