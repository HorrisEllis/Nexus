'use strict';
/**
 * lib/checks/ck-247-decomposition.js — CK-247 "depth-bounded decomposition" (cos/spec/check-catalogue.spec, recursion).
 * component_id: nexus.lib.checks.ck-247-decomposition
 *
 * Invariant: a split stops at an indivisible piece and says so; it never re-splits on the same pieces. Since BR2
 * (0.60.40) a brick splits by its actions, then by the steps inside one action, to a depth bound. This reads a .contract
 * (or every .contract under a folder) and checks each split it records:
 *   - no gate deeper than the bound (condition.depth, else the contract's policy.depth, else 3)
 *   - no child whose pieces are its parent's own pieces again (a re-split on the same pieces)
 *   - every split's children exist, and point back at their parent
 *
 *   run({ path, depth }, { root }) → { ok, verifiable, evidence, reason, items: [{ contract, gate, problem }] }
 */
const fs = require('fs');
const path = require('path');
const ID = 'CK-247';

function _files(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return [p];
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const x = path.join(d, e.name); if (e.isDirectory()) walk(x); else if (/\.contract$/.test(e.name)) out.push(x); } };
  walk(p);
  return out;
}

function checkPayload(p, { depth = null } = {}) {
  const CG = require('../../cortex/core/raid/contract-gates.js');
  const bound = Number(depth || (p.policy && p.policy.depth) || 3);
  const byId = new Map((p.gates || []).map(g => [g.id, g]));
  const problems = [];
  for (const g of p.gates || []) {
    const d = CG.depthOf(p, g);
    if (d > bound) problems.push({ gate: g.id, problem: `depth ${d} is past the bound ${bound}` });
    if (g.parent) {
      const parent = byId.get(g.parent);
      if (!parent) problems.push({ gate: g.id, problem: `its parent ${g.parent} is not in the contract` });
      else if (!(parent.children || []).includes(g.id)) problems.push({ gate: g.id, problem: `its parent ${g.parent} does not list it` });
    }
    for (const c of g.children || []) if (!byId.has(c)) problems.push({ gate: g.id, problem: `child ${c} is missing` });
    const kids = (g.children || []).map(c => byId.get(c)).filter(Boolean);
    if (kids.length >= 2 && (g.actions || []).length === kids.length && kids.every((k, i) => String((k.actions || [])[0]).trim() === String(g.actions[i]).trim()) && g.parent) {
      const gp = byId.get(g.parent);
      if (gp && (gp.actions || []).length === (g.actions || []).length && gp.actions.every((a, i) => String(a).trim() === String(g.actions[i]).trim())) problems.push({ gate: g.id, problem: 'split into the same pieces as its parent (a re-split)' });
    }
  }
  return { bound, problems };
}

function run(c = {}, { root } = {}) {
  if (!c.path) return { ok: false, verifiable: false, reason: `unverifiable: ${ID} needs path — a .contract or a folder of them` };
  const abs = path.resolve(root, c.path);
  if (!fs.existsSync(abs)) return { ok: false, verifiable: false, reason: `unverifiable: ${c.path} does not exist` };
  const CG = require('../../cortex/core/raid/contract-gates.js');
  const items = []; let checked = 0, splits = 0;
  for (const f of _files(abs)) {
    let L; try { L = CG.load(f); } catch (e) { items.push({ contract: path.relative(root, f), gate: null, problem: `does not load: ${e.message}` }); continue; }
    checked++; splits += (L.payload.splits || []).length;
    for (const pr of checkPayload(L.payload, { depth: c.depth }).problems) items.push({ contract: path.relative(root, f), ...pr });
  }
  if (!checked) return { ok: false, verifiable: false, reason: `unverifiable: no .contract under ${c.path}` };
  if (items.length) return { ok: false, verifiable: true, items, reason: `${ID}: ${items.length} decomposition problem(s) — ${items.slice(0, 3).map(i => `${i.contract} ${i.gate}: ${i.problem}`).join('; ')}` };
  return { ok: true, verifiable: true, items: [], evidence: { check: ID, contracts: checked, splits } };
}

module.exports = { ID, run, checkPayload };
