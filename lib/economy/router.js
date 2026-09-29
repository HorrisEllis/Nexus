'use strict';
/**
 * lib/economy/router.js — the learning router ("smart economy"). §0.39.281 EC4.
 * comp_id: nexus.lib.economy.router
 * UUID: nexus-lib-economy-router-v1-0000-2026-0929-jamesbrooks-001
 *
 * James: "Smart economy like dynamically evolving and learning routing."
 *   scores(records, policy)  per (jobType, provider): ok / not-ok counts → a Beta(1+ok, 1+bad) success posterior (its
 *                            mean), median latency, the tier's cost weight, how many records it rests on
 *   choose(jobType, candidates, { policy, records, rand, allowed })
 *                            Thompson sampling: each candidate draws a success rate from its posterior; the draw is
 *                            weighted by cost (local 1.0, free 0.95, subscription 0.85, metered 0.7) and latency; the
 *                            policy's explore setting widens the draws for providers with few records. Only providers
 *                            the gate allows (allowed(provider) → bool) are candidates. Returns { provider, why, table }.
 * Used ONLY when nobody chose a provider (I1). Nothing is stored: every call reads the ledger's records (I4), so the
 * router changes as the records do.
 */
const COST = { local: 1, free: 0.95, subscription: 0.85, metered: 0.7 };
const BAD = new Set(['failed', 'truncated', 'timeout', 'login']);

function _median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function scores(records = [], policy = {}) {
  const t = {};
  for (const r of records) {
    if (r.outcome === 'refused') continue;
    const k = `${r.jobType || 'chat'}::${r.provider}`;
    const s = t[k] || (t[k] = { jobType: r.jobType || 'chat', provider: r.provider, ok: 0, bad: 0, ms: [] });
    if (r.outcome === 'ok') s.ok++; else if (BAD.has(r.outcome)) s.bad++;
    if (r.ms != null) s.ms.push(r.ms);
  }
  for (const s of Object.values(t)) {
    const tier = policy.providers && policy.providers[s.provider] ? policy.providers[s.provider].tier : null;
    s.tier = tier; s.cost = COST[tier] || 0.85;
    s.records = s.ok + s.bad; s.success = +((1 + s.ok) / (2 + s.ok + s.bad)).toFixed(3); s.medianMs = _median(s.ms); delete s.ms;
  }
  return t;
}

// Beta sample via two Gamma samples (Marsaglia–Tsang), seeded by rand
function _gamma(k, rand) {
  if (k < 1) return _gamma(k + 1, rand) * Math.pow(rand(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { const u1 = rand() || 1e-9, u2 = rand(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = rand();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function _beta(a, b, rand) { const x = _gamma(a, rand), y = _gamma(b, rand); return x / (x + y); }

function choose(jobType, candidates = [], { policy = {}, records = [], rand = Math.random, allowed = () => true } = {}) {
  const table = scores(records, policy);
  const explore = policy.router && Number.isFinite(policy.router.explore) ? policy.router.explore : 0.15;
  const rows = [];
  for (const p of candidates) {
    if (!allowed(p)) { rows.push({ provider: p, skipped: 'not allowed by the economy now' }); continue; }
    const s = table[`${jobType}::${p}`] || { ok: 0, bad: 0, records: 0, medianMs: null, cost: COST[(policy.providers && policy.providers[p] && policy.providers[p].tier)] || 0.85 };
    // exploration: fewer records → flatter posterior (scale the counts down)
    const shrink = s.records ? Math.max(0.1, 1 - explore * Math.exp(-s.records / 20)) : 1;
    const draw = _beta(1 + s.ok * shrink, 1 + s.bad * shrink, rand);
    const lat = s.medianMs ? 1 / (1 + s.medianMs / 120000) : 1;
    const score = draw * s.cost * (0.8 + 0.2 * lat);
    rows.push({ provider: p, ok: s.ok, bad: s.bad, records: s.records, draw: +draw.toFixed(3), cost: s.cost, medianMs: s.medianMs, score: +score.toFixed(4) });
  }
  const live = rows.filter(r => !r.skipped).sort((a, b) => b.score - a.score);
  if (!live.length) return { provider: null, why: 'no candidate is allowed by the economy now', table: rows };
  const w = live[0];
  return { provider: w.provider, why: `${jobType}: ${w.provider} drew ${w.draw} (${w.ok} ok / ${w.bad} not, cost ×${w.cost}) — best of ${live.length}`, table: rows, order: live.map(r => r.provider) };
}

module.exports = { scores, choose, COST, MODULE_ID: 'nexus.lib.economy.router', VERSION: '1.0.0' };
