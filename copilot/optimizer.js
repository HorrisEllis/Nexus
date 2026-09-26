'use strict';
/**
 * copilot/optimizer.js — OB7 of the observability/tablet phasemap
 * UUID: nexus-copilot-optimizer-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB7 (docs/nexus-observability-tablet-phasemap.spec, CHUNK H). Uses the
 * diagnostic + movement data to OPTIMIZE the system: a detected bottleneck (OB4)
 * weighted by pattern leverage (OB8) and read through its sigma role (OB10)
 * becomes an optimization PROPOSAL, routed toward gaps/forge. §8.6 — composes the
 * existing intelligence system (cortex/intelligence mastermind) + OB4/OB8/OB10;
 * builds no new optimizer brain. §0.4 — proposals are options, not mandates
 * (the user/forge decides). §13.4 — the accepted/rejected ratio is drift data.
 */

/**
 * propose(opts) — produce optimization proposals from live observability data.
 * Composes: OB1 diagnostics → OB3/OB4 bottlenecks → OB8 leverage → OB10 role.
 * Returns { proposals: [{ target, action, why, leverage, role, priority }] }.
 */
async function propose(opts = {}) {
  const proposals = [];

  // 1. Live diagnostics (OB1) + movement/bottlenecks (OB3/OB4).
  let report = null, bottlenecks = [];
  try {
    report = await require('./diagnostics').diagnose(opts);
    const mm = require('./movement-map');
    const stream = opts.stream || [];
    const graph = mm.buildMovementGraph(stream);
    bottlenecks = mm.detectBottlenecks(graph, opts.eventsBySystem || {});
  } catch { /* degrade gracefully */ }

  const leverage = require('../lib/pattern-leverage');
  const roles = require('../lib/sigma-roles');

  // 2. Each bottleneck → a proposal, weighted by leverage + read by role.
  for (const b of bottlenecks) {
    // leverage: a bottleneck's impact is its score; frequency 1 (a live instance).
    const lev = leverage.leverage({ impact: b.score, occurrenceCount: 1 });
    // role: how this node's sigma should read (default deviation).
    const role = roles.intentFor(b.where || b.node);
    proposals.push({
      target: b.name || b.node,
      action: `relieve bottleneck at ${b.name} — ${b.why}`,
      why: b.why,
      leverage: lev.leverage, tier: lev.tier,
      role,
      priority: b.score >= 0.75 ? 'high' : b.score >= 0.5 ? 'medium' : 'low',
    });
  }

  // 3. Diagnostic concerns → proposals (offline systems, gap backlog, drift).
  if (report && report.summary && report.summary.concerns) {
    for (const c of report.summary.concerns) {
      proposals.push({ target: 'system', action: `address: ${c}`, why: c, leverage: 0.5, tier: 'medium', role: 'deviation', priority: 'medium' });
    }
  }

  // 4. Optional: pass the high-leverage set to the intelligence mastermind for a
  // strategic read (best-effort; non-fatal if intelligence isn't reachable).
  let strategic = null;
  if (opts.useIntelligence !== false) {
    try {
      const mm = require('../intelligence/mastermind');
      if (mm && typeof mm.analyze === 'function') strategic = await mm.analyze({ proposals });
    } catch { /* intelligence optional */ }
  }

  // Sort by leverage then priority.
  proposals.sort((a, b) => (b.leverage - a.leverage) || (_pri(b.priority) - _pri(a.priority)));
  return { proposals, strategic, healthy: proposals.length === 0, ts: Date.now() };
}

function _pri(p) { return p === 'high' ? 2 : p === 'medium' ? 1 : 0; }

module.exports = { propose, MODULE_ID: 'copilot-optimizer', VERSION: '1.0.0' };
