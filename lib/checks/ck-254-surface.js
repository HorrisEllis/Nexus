'use strict';
/**
 * lib/checks/ck-254-surface.js — CK-254 spec surface: a capability's code exposes what its spec promises, no more, no less.
 * component_id: nexus.lib.checks.ck-254-surface · Map: docs/2026-10-15-capability-specs-and-semantic-page-tree-phasemap.spec CS1
 * James (2026-10-15): "like specs can reduce surface area".
 *   run({ path? }, { root }) → { ok, verifiable, items: [{ spec, grew, unkept }], evidence, reason }
 *   path: one capability spec (relative to root); none → every capability spec found (<system>/spec/*.spec, kind capability)
 */
const fs = require('fs');
const path = require('path');
const ID = 'CK-254';

function run(c = {}, { root } = {}) {
  const C = require('../capability-spec.js');
  const base = root || path.resolve(__dirname, '..', '..');
  let specs;
  if (c.path) {
    let text; try { text = fs.readFileSync(path.join(base, c.path), 'utf8'); } catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: cannot read ${c.path}` }; }
    specs = [{ ...C.parse(text), file: c.path }];
  } else specs = C.find({ root: base });
  if (!specs.length) return { ok: false, verifiable: false, reason: 'unverifiable: no capability spec here (kind: capability under <system>/spec/)' };
  const items = [], checked = [];
  for (const s of specs) {
    const r = C.check(s, { root: base });
    if (!r.verifiable) { items.push({ spec: s.file, problem: r.reason }); continue; }
    checked.push(s.file);
    if (!r.ok) items.push({ spec: s.file, grew: r.grew, unkept: r.unkept, problem: r.reason });
  }
  if (items.length) return { ok: false, verifiable: true, items, reason: `${ID}: ${items.map(i => `${i.spec} — ${i.problem}`).join(' | ')}` };
  return { ok: true, verifiable: true, items: [], evidence: { check: ID, specs: checked } };
}
module.exports = { ID, run };
