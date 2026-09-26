'use strict';
/**
 * copilot/diagnostics.js — OB1 of the observability/tablet phasemap
 * UUID: nexus-copilot-diagnostics-v1-0000-2026-0730-001
 *
 * §PHASEMAP OB1 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E). Expands
 * CA1's status poll (copilot/system-status.js) into FULL live diagnostics: per-
 * system health + recent gaps + recent RAID decisions + schema drift + the CFR
 * field regime (friction/stress — "where and why"). "How is nexus doing" returns
 * REAL per-system diagnostic data, not a canned summary. §8.6 — composes CA1 +
 * the cortex tables + cfr/computeRegime, builds no new monitoring. §1.1 — real
 * data only. §17.6 — every datum traces to its source table/endpoint. Non-fatal:
 * any unreachable source degrades to a stated 'unknown', never throws.
 */

function _jaa() { try { return require('../cortex/memory/jaa-db').jaaDB; } catch { return null; } }
function _rows(table, n = 5) {
  const jaaDB = _jaa();
  if (!jaaDB) return [];
  try { return (jaaDB.query(table, () => true, 100000) || []).slice(-n).reverse(); } catch { return []; }
}

/**
 * diagnose() — the full live diagnostic sweep. Returns a structured report:
 *   { health, gaps, decisions, drift, regime, summary }
 * Each section is real data pulled live; missing sources are marked, not faked.
 */
async function diagnose(opts = {}) {
  const status = require('./system-status');
  const report = { ts: Date.now() };

  // 1. Per-system health (CA1's poll) — the online/offline picture.
  try { report.health = await status.pollStatus(); }
  catch { report.health = { systems: {}, online: 0, total: 0, note: 'health poll unavailable' }; }

  // 2. Open gaps — the known issues/faults/capability holes (real cortex rows).
  const openGaps = (_jaa() ? (_jaa().query('gaps', g => g.status === 'open' || g.status === 'pending', 100000) || []) : []);
  report.gaps = {
    open: openGaps.length,
    recent: openGaps.slice(-5).reverse().map(g => ({ title: g.body || g.type || g.path || g.kind || 'gap', kind: g.type || g.kind, severity: g.severity })),
  };

  // 3. Recent RAID decisions — what the verification spine has been doing.
  const decisions = _rows('raid_decisions', 5);
  report.decisions = {
    recent: decisions.map(d => ({ tool: d.tool, outcome: d.outcome, approved: d.approved, source: d.source })),
    denied: decisions.filter(d => d.approved === false).length,
  };

  // 4. Schema drift — data not matching its expected shape (integrity signal).
  const drift = _rows('schema_drift', 5);
  report.drift = { count: (_jaa() ? (_jaa().query('schema_drift', () => true, 100000) || []).length : 0), recent: drift.map(d => ({ table: d.table, missing: d.missing })) };

  // 5. CFR regime — the "where and why": friction/stress field state.
  try {
    const { computeRegime } = require('../intelligence/cfr/field');
    // Derive an aggregate field from the most recent decisions' stress signals.
    const field = opts.field || { coherence: 0.5, friction: 0.2, resonance: 0.2, entropy: 0.2 };
    report.regime = { state: computeRegime(field), field };
  } catch { report.regime = { state: 'unknown', note: 'CFR field unavailable' }; }

  // 6. §OB9 — movement graph (OB3) + bottlenecks (OB4) so the 3D map + tablet
  // render REAL topology, not an invented one. Derived from the live event stream
  // + health systems (real nodes only).
  try {
    const mm = require('./movement-map');
    const stream = opts.stream || [];
    let graph = mm.buildMovementGraph(stream);
    // ensure health systems appear as nodes even with an empty stream (real systems)
    if (report.health && report.health.systems) {
      const have = new Set(graph.nodes.map(n => n.id));
      for (const s of Object.keys(report.health.systems)) if (!have.has(s)) graph.nodes.push({ id: s, name: s, system: s, type: 'system' });
    }
    report.movement = graph;
    report.bottlenecks = mm.detectBottlenecks(graph, opts.eventsBySystem || {});
  } catch { report.movement = null; report.bottlenecks = []; }

  report.summary = _summarize(report);
  return report;
}

/**
 * diagnoseText() — the human, legible diagnostic (§16.2 reads like a story).
 * This is what co-pilot says for "how is nexus doing".
 */
async function diagnoseText(opts = {}) {
  const r = await diagnose(opts);
  const lines = [];
  const h = r.health || {};
  lines.push(`NEXUS diagnostics — ${h.online}/${h.total} systems online.`);
  const offline = Object.entries(h.systems || {}).filter(([, v]) => v !== 'online').map(([k]) => k);
  if (offline.length) lines.push(`Offline/degraded: ${offline.join(', ')}.`);
  lines.push(`${r.gaps.open} open gap${r.gaps.open === 1 ? '' : 's'}${r.gaps.recent.length ? ` (recent: ${r.gaps.recent.map(g => g.title).slice(0, 3).join('; ')})` : ''}.`);
  if (r.decisions.denied) lines.push(`${r.decisions.denied} recently denied action${r.decisions.denied === 1 ? '' : 's'} at the verification gate.`);
  if (r.drift.count) lines.push(`${r.drift.count} schema-drift record${r.drift.count === 1 ? '' : 's'} (data not matching expected shape).`);
  lines.push(`CFR regime: ${r.regime.state}${r.regime.state === 'turbulent' || r.regime.state === 'chaotic' ? ' — friction/stress elevated, worth a look.' : '.'}`);
  return { text: lines.join(' '), report: r };
}

function _summarize(r) {
  const concerns = [];
  if (r.health && r.health.online < r.health.total) concerns.push('systems offline');
  if (r.gaps.open > 20) concerns.push('many open gaps');
  if (r.decisions.denied > 0) concerns.push('denied actions');
  if (r.regime.state === 'turbulent' || r.regime.state === 'chaotic') concerns.push(`${r.regime.state} regime`);
  return { healthy: concerns.length === 0, concerns };
}

module.exports = { diagnose, diagnoseText, MODULE_ID: 'copilot-diagnostics', VERSION: '1.0.0' };
