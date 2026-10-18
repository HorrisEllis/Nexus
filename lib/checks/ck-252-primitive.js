'use strict';
/**
 * lib/checks/ck-252-primitive.js — CK-252 "a new check names its primitive" (cos/spec/check-catalogue.spec).
 * component_id: nexus.lib.checks.ck-252-primitive
 *
 * QA1 (docs/2026-10-13-gates-that-learn-and-priorities-phasemap.spec), built 0.60.157 in layer 1 of the gating census
 * (docs/2026-10-18-gating-census-phasemap.spec). Every check names one of the catalogue's twelve primitives, so checks can be
 * compared across domains; an unknown primitive is a proposal and must name three domains it shows up in.
 *
 *   run({}, { catalogue }) → { ok, verifiable, evidence, reason, items: [{ id, primitive, why }] }
 */
const ID = 'CK-252';

function run(c = {}, { root, catalogue = null } = {}) {
  let doc = catalogue;
  if (!doc) {
    try { doc = require('js-yaml').load(require('fs').readFileSync(require('path').join(root || require('path').resolve(__dirname, '../..'), 'cos/spec/check-catalogue.spec'), 'utf8')).spec; }
    catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: the catalogue could not be read (${e.message})` }; }
  }
  const prims = new Set(Array.isArray(doc.primitives) ? doc.primitives.map(p => (p && (p.id || p.name)) || p) : Object.keys(doc.primitives || {}));
  const items = [];
  for (const k of doc.checks || []) {
    if (!k.primitive) items.push({ id: k.id, primitive: null, why: 'names no primitive' });
    else if (!prims.has(k.primitive) && !((k.domains || []).length >= 3 && k.proposes_primitive)) items.push({ id: k.id, primitive: k.primitive, why: `"${k.primitive}" is not one of the ${prims.size} primitives, and is not proposed with three domains` });
  }
  const evidence = { check: ID, checks: (doc.checks || []).length, primitives: [...prims] };
  return items.length ? { ok: false, verifiable: true, items, evidence, reason: `${ID}: ${items.length} check(s) name no known primitive (${items.slice(0, 5).map(i => i.id).join(', ')})` }
    : { ok: true, verifiable: true, items: [], evidence };
}

module.exports = { ID, run };
