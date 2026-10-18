'use strict';
/**
 * lib/checks/ck-239-two-ends.js — CK-239 "every edge has two ends" (cos/spec/check-catalogue.spec).
 * component_id: nexus.lib.checks.ck-239-two-ends
 *
 * QA1, built 0.60.157 (the gating census, layer 1). In loom's registry — the system's model of its own connections — every
 * wire's two hooks exist and every hook's component exists. A dangling edge is a connection the system believes in that has
 * nothing at one end.
 *
 *   run({}, { root, registry }) → { ok, verifiable, evidence, reason, items: [{ kind, id, missing, why }] }
 *   registry: { component, hook, wire } keyed by id (default: loom/data/registry.json, read, never written)
 */
const ID = 'CK-239';

function run(c = {}, { root, registry = null } = {}) {
  let reg = registry;
  if (!reg) {
    const file = require('path').join(root || require('path').resolve(__dirname, '../..'), 'loom/data/registry.json');
    try { reg = JSON.parse(require('fs').readFileSync(file, 'utf8')); }
    catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: loom's registry could not be read (${e.message})` }; }
  }
  const comps = reg.component || {}, hooks = reg.hook || {}, wires = reg.wire || {};
  const items = [];
  for (const [id, h] of Object.entries(hooks)) if (h.component_id && !comps[h.component_id]) items.push({ kind: 'hook', id, missing: h.component_id, why: `its component ${h.component_id} is not in the registry` });
  for (const [id, w] of Object.entries(wires)) {
    if (!hooks[w.from_hook_id]) items.push({ kind: 'wire', id, missing: w.from_hook_id, why: `its from hook ${w.from_hook_id} is not in the registry` });
    if (!hooks[w.to_hook_id]) items.push({ kind: 'wire', id, missing: w.to_hook_id, why: `its to hook ${w.to_hook_id} is not in the registry` });
  }
  const evidence = { check: ID, components: Object.keys(comps).length, hooks: Object.keys(hooks).length, wires: Object.keys(wires).length };
  return items.length ? { ok: false, verifiable: true, items: items.slice(0, 200), evidence: { ...evidence, dangling: items.length }, reason: `${ID}: ${items.length} edge(s) with a missing end (${items.slice(0, 3).map(i => `${i.kind} ${i.id} → ${i.missing}`).join('; ')})` }
    : { ok: true, verifiable: true, items: [], evidence };
}

module.exports = { ID, run };
