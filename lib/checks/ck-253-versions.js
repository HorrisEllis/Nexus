'use strict';
/**
 * lib/checks/ck-253-versions.js — CK-253 "versions agree" (cos/spec/check-catalogue.spec, family relationships).
 * component_id: nexus.lib.checks.ck-253-versions
 *
 * James (2026-10-14): "i also want versions in idearium, github, and each zip, needs to match." lib/version.js system is
 * the release; package.json, CHANGELOG-<version>.md and a git tag at HEAD must say the same (lib/release-version.js).
 * condition.path: another checkout (a repo's folder) instead of Nexus's own.
 *
 *   run({ path }, { root }) → { ok, verifiable, evidence, reason, items: [{ place, says, why }] }
 */
const path = require('path');
const ID = 'CK-253';

function run(c = {}, { root } = {}) {
  const R = require('../release-version.js');
  const base = c.path ? path.resolve(root, c.path) : root;
  let a;
  try { a = R.agreement({ root: base }); } catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: no release version here (${e.message})` }; }
  if (!a.version) return { ok: false, verifiable: false, reason: 'unverifiable: no lib/version.js system line — nothing says what the release is' };
  const bad = a.places.filter(p => !p.ok);
  if (bad.length) return { ok: false, verifiable: true, items: bad.map(p => ({ place: p.place, says: p.says, why: p.why })), reason: `${ID}: the release is ${a.version}, but ${bad.map(p => `${p.place} ${p.why}`).join('; ')}` };
  return { ok: true, verifiable: true, items: [], evidence: { check: ID, version: a.version, places: a.places.map(p => p.place) } };
}

module.exports = { ID, run };
