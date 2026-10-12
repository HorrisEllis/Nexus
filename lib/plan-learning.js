'use strict';
/**
 * lib/plan-learning.js — what planned builds teach Nexus, read back into the next plan and the next coder ladder.
 * comp_id: nexus.lib.plan-learning
 * UUID: nexus-lib-plan-learning-v1-0000-2026-1012-jamesbrooks-001
 *
 * James (2026-10-12): "nexus learning from the agents, optimizing learning and improving. I want it to improve over time,
 * reusing components, code from nexus internally, learn from the agents."
 *
 * A projection of idearium_phase_runs (one row per state change, written by idearium/api _phaseBuild); it stores nothing.
 * Planned builds (lib/phase-plan.js) leave rows a projection can read:
 *   planned        { plan }                                   — what the planner mapped
 *   plan-refused   { problems }                               — what a planner got wrong
 *   replied / incomplete / failed with planned:true, file     — what each coder did with one planned file
 *     incomplete + missingExports                             — the export a coder dropped
 *   proven / unproven                                         — whether the whole phase held
 *
 *   lessons(rows, { system, files }) -> { text, coders, problems, built }
 *       text: a few lines for the planner — which coder lands which layer, which exports get dropped, which plan
 *       problems recur, which files of this system were already built from a plan (reuse them, do not rewrite them)
 *   orderCoders(rungs, rows, { minRecords }) -> { rungs, changed, why }
 *       the coder ladder's Ollama rungs by their record on planned files (landed first try / attempts); the rest keep
 *       their order. Below minRecords for a coder, its place is kept — nothing is learned from one try.
 */

const MODULE_ID = 'nexus.lib.plan-learning';
const VERSION = '1.0.0';

function _layerOf(plans, file) {
  for (const p of plans) { const f = (p.files || []).find(x => x.path === file); if (f && f.layer) return f.layer; }
  return null;
}

/** coders(rows) -> { provider: { attempts, landed, incomplete, failed, dropped:{ name: n }, byLayer:{ layer: { attempts, landed } } } } */
function coders(rows, plans = []) {
  const out = {};
  for (const r of rows) {
    if (!r.planned || !r.file || !r.provider || !['replied', 'incomplete', 'failed', 'blocked'].includes(r.state)) continue;
    const c = out[r.provider] || (out[r.provider] = { attempts: 0, landed: 0, incomplete: 0, failed: 0, dropped: {}, byLayer: {} });
    c.attempts++;
    if (r.state === 'replied') c.landed++; else if (r.state === 'incomplete') c.incomplete++; else c.failed++;
    for (const n of r.missingExports || []) c.dropped[n] = (c.dropped[n] || 0) + 1;
    const layer = _layerOf(plans, r.file) || 'unknown';
    const l = c.byLayer[layer] || (c.byLayer[layer] = { attempts: 0, landed: 0 });
    l.attempts++; if (r.state === 'replied') l.landed++;
  }
  return out;
}

function lessons(rows = [], { system = null, files = [], max = 1200 } = {}) {
  const plans = rows.filter(r => r.state === 'planned' && r.plan).map(r => ({ ...r.plan, runId: r.runId, ts: r.ts }));
  const mine = system ? plans.filter(p => !p.system || p.system === system) : plans;
  const cs = coders(rows, plans);
  const lines = [];
  // coders: who lands what
  for (const [p, c] of Object.entries(cs).sort((a, b) => b[1].attempts - a[1].attempts).slice(0, 5)) {
    const layers = Object.entries(c.byLayer).map(([l, x]) => `${l} ${x.landed}/${x.attempts}`).join(', ');
    const dropped = Object.entries(c.dropped).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, k]) => `${n}×${k}`).join(', ');
    lines.push(`- coder ${p}: landed ${c.landed} of ${c.attempts} planned files (${layers})${dropped ? `; dropped exports ${dropped} — spell those out in its steps` : ''}`);
  }
  // planners: the problems that recur
  const probs = {};
  for (const r of rows) if (r.state === 'plan-refused') for (const x of r.problems || []) { const k = String(x).replace(/[`"'][^`"']*[`"']/g, '…').replace(/\S+\.(?:[cm]?js|ts|json|md)\b/g, '<file>').slice(0, 120); probs[k] = (probs[k] || 0) + 1; }
  const top = Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, n] of top) lines.push(`- plans were refused ${n}× for: ${k}`);
  // what is already built from a plan in this system: reuse, never rewrite
  const landed = new Set(rows.filter(r => r.planned && r.state === 'replied' && r.file).map(r => r.file));
  const proven = new Set(rows.filter(r => r.state === 'proven').map(r => r.buildRunId || String(r.runId || '').replace(/-proof$/, '')));
  const built = [];
  for (const p of mine) for (const f of p.files || []) {
    if (!landed.has(f.path) || built.some(b => b.path === f.path)) continue;
    built.push({ path: f.path, component: f.component || null, exports: (f.exports || []).map(e => e.name).slice(0, 6), proven: proven.has(p.runId) });
  }
  const want = new Set(files);
  const near = built.filter(b => want.has(b.path) || files.some(f => f.split('/').slice(0, -1).join('/') === b.path.split('/').slice(0, -1).join('/'))).slice(0, 8);
  for (const b of near) lines.push(`- ${b.path} was already built from a plan${b.proven ? ' and proven' : ''}${b.exports.length ? ` (exports ${b.exports.join(', ')})` : ''} — import it, do not write it again`);
  let text = lines.join('\n');
  if (text.length > max) text = `${text.slice(0, max - 1)}…`;
  return { text, coders: cs, problems: top.map(([k, n]) => ({ problem: k, n })), built };
}

function orderCoders(rungs = [], rows = [], { minRecords = 3 } = {}) {
  const cs = coders(rows);
  const ollama = rungs.filter(r => r.base === 'ollama');
  const rest = rungs.filter(r => r.base !== 'ollama');
  const score = (r) => { const c = cs[r.provider]; return c && c.attempts >= minRecords ? c.landed / c.attempts : null; };
  const known = ollama.filter(r => score(r) !== null);
  if (known.length < 2) return { rungs: [...ollama, ...rest], changed: false, why: 'not enough planned files built yet to reorder the coders' };
  // a known coder takes the slot of a known coder; unknown ones keep their places
  const sorted = [...known].sort((a, b) => score(b) - score(a));
  let k = 0;
  const reordered = ollama.map(r => (score(r) !== null ? sorted[k++] : r));
  const changed = reordered.some((r, i) => r !== ollama[i]);
  return { rungs: [...reordered, ...rest], changed, why: `coders ordered by planned files landed: ${sorted.map(r => `${r.provider} ${Math.round(score(r) * 100)}%`).join(', ')}` };
}

module.exports = { MODULE_ID, VERSION, coders, lessons, orderCoders };
