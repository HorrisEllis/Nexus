'use strict';
/**
 * lib/checks/ck-237-verifiable.js — CK-237 "unverifiable condition" (cos/spec/check-catalogue.spec).
 * component_id: nexus.lib.checks.ck-237-verifiable
 *
 * QA1, built 0.60.157 (the gating census, layer 1). Every done-condition of a contract names a machine check — a test, a file
 * that exists, a piece of evidence, another gate, or a catalogue check — never a free sentence, which can never be proven
 * (the same kinds contract-gates' own checkCondition runs).
 *
 *   run({ path }, { root, contracts }) → { ok, verifiable, evidence, reason, items: [{ contract, gate, condition, why }] }
 *     path       a .contract file or a folder of them, relative to root
 *     contracts  [{ name, payload }] given directly (a caller that already holds them)
 */
const fs = require('fs');
const path = require('path');
const ID = 'CK-237';
const KINDS = ['test', 'exists', 'evidence', 'gate', 'check'];

function _read(p) {
  const NE = require('../node-export.js');
  const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => f.endsWith('.contract')).map(f => path.join(p, f)) : [p];
  return files.map(f => { const d = NE.importFromFile(f); return { name: path.basename(f), payload: d.payload || {} }; });
}

function run(c = {}, { root, contracts = null } = {}) {
  let list = contracts;
  if (!list) {
    if (!c.path) return { ok: false, verifiable: false, reason: `unverifiable: ${ID} needs a contract (path: a .contract file or folder)` };
    try { list = _read(path.join(root || process.cwd(), c.path)); } catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: ${c.path} could not be read (${e.message})` }; }
  }
  const items = [];
  let conditions = 0;
  for (const k of list) for (const g of (k.payload && k.payload.gates) || []) for (const cond of g.pass_when || []) {
    conditions++;
    const named = cond && typeof cond === 'object' ? KINDS.filter(x => cond[x]) : [];
    if (!named.length) items.push({ contract: k.name, gate: g.id, condition: typeof cond === 'string' ? cond.slice(0, 160) : JSON.stringify(cond).slice(0, 160), why: `names no machine check (${KINDS.join(' | ')})` });
  }
  const evidence = { check: ID, contracts: list.length, conditions };
  return items.length ? { ok: false, verifiable: true, items, evidence, reason: `${ID}: ${items.length} of ${conditions} condition(s) can never be proven (${items.slice(0, 3).map(i => `${i.gate}: ${i.condition}`).join('; ')})` }
    : { ok: true, verifiable: true, items: [], evidence };
}

module.exports = { ID, run };
