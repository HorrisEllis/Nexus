'use strict';
/**
 * lib/checks/ck-255-warp-builds.js — CK-255 "every build goes through WARP" (cos/spec/check-catalogue.spec).
 * component_id: nexus.lib.checks.ck-255-warp-builds
 *
 * James (2026-10-15): "make sure all builds use warp." lib/build-paths.js census reads the build code and finds every
 * agent call: red while a build path calls an agent directly, or while an agent call sits where no build path is named.
 *
 *   run({}, { root }) → { ok, verifiable, evidence, reason, items: [{ path, file, line, call, why }] }
 */
const ID = 'CK-255';

function run(c = {}, { root } = {}) {
  const B = require('../build-paths.js');
  let r;
  try { r = B.census(root ? { root } : {}); } catch (e) { return { ok: false, verifiable: false, reason: `unverifiable: the census did not run (${e.message})` }; }
  const items = [
    ...r.paths.filter(p => p.warp === 'no').flatMap(p => p.sites.map(s => ({ path: p.id, file: s.file, line: s.line, call: s.call, why: `${p.label} calls ${s.call} directly — not through WARP` }))),
    ...r.unknown.map(u => ({ path: null, file: u.file, line: u.line || null, call: u.call || null, why: u.why })),
  ];
  const evidence = { check: ID, warp: r.paths.filter(p => p.warp !== 'no').map(p => `${p.id}${p.warp === 'fallback' ? ' (fallback when WARP cannot load)' : ''}`), bypass: r.bypass, notBuilds: r.notBuilds.map(n => n.where) };
  if (items.length) return { ok: false, verifiable: true, items, evidence, reason: `${ID}: ${r.bypass.length} build path(s) do not go through WARP (${r.bypass.join(', ')})${r.unknown.length ? `; ${r.unknown.length} agent call(s) no build path names` : ''}` };
  return { ok: true, verifiable: true, items: [], evidence };
}

module.exports = { ID, run };
