'use strict';
/**
 * lib/adapters/contract.js — the adapter contract, the minimum two real adapters need (AD1, sliced in 0.60.286 FA1).
 * comp_id: nexus.lib.adapters.contract
 * UUID: nexus-lib-adapters-contract-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-ADAPTERS · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA1
 *
 * James, 2026-10-19 (NC0): "the components in the component registry can be any language. for idearium to build any project, anyone
 * can unnderstand, and it would be immensly stable." · 2026-10-29: "refactor tool for the architecture to use the component registry
 * as the spine, decomposition tool for breaking up each component into it's own file and wire it into the spine."
 *
 * A tool that reads a project asks an adapter, never a language's scanner itself. Every method answers or says unknown; none throws.
 *   parse(text, path)        → { verdict: 'pass'|'fail'|'unknown', error? }
 *   units(text, path)        → [{ kind, name, names, start, end, section, exported }]   top-level units, 1-based inclusive lines
 *   symbols(text, path)      → string[] | null                                          what it exports (null: cannot tell)
 *   dependencies(text, path) → [{ spec, kind, line }]                                   what it reaches, as written
 * AD1 stays OPEN in docs/2026-10-19-infrastructure-spine-phasemap.spec for the conformance run over the old JS paths and NC1.
 */

const MODULE_ID = 'nexus.lib.adapters.contract';
const VERSION = '1.0.0';
const METHODS = ['parse', 'units', 'symbols', 'dependencies'];

let _all = null;
function adapters() {
  if (!_all) _all = [require('./javascript.js'), require('./documents.js'), require('./emerge.js')];
  return _all;
}

/** forFile(path) → the adapter that reads it, or null (the caller says unknown) */
function forFile(p) {
  const ext = String(p || '').toLowerCase().match(/\.[a-z0-9]+$/);
  if (!ext) return null;
  return adapters().find(a => a.extensions.includes(ext[0])) || null;
}

/** conformance(adapter) — the contract checked on a small sample of its own: every method present, answers in shape, never throws */
function conformance(a) {
  const failures = [];
  for (const m of ['id', 'language', 'extensions', ...METHODS]) if (a[m] == null) failures.push(`missing ${m}`);
  const sample = a.sample || '';
  const call = (m, ...args) => { try { return a[m](...args); } catch (e) { failures.push(`${m} threw: ${e.message}`); return undefined; } };
  const p = call('parse', sample, `sample${a.extensions[0]}`);
  if (p && !['pass', 'fail', 'unknown'].includes(p.verdict)) failures.push(`parse verdict ${p.verdict}`);
  const u = call('units', sample, `sample${a.extensions[0]}`);
  if (u !== undefined && (!Array.isArray(u) || u.some(x => !(x.start >= 1 && x.end >= x.start && typeof x.kind === 'string')))) failures.push('units not [{ kind, start, end }]');
  const s = call('symbols', sample, `sample${a.extensions[0]}`);
  if (s !== undefined && s !== null && !Array.isArray(s)) failures.push('symbols not an array or null');
  const d = call('dependencies', sample, `sample${a.extensions[0]}`);
  if (d !== undefined && (!Array.isArray(d) || d.some(x => typeof x.spec !== 'string'))) failures.push('dependencies not [{ spec }]');
  const bad = call('parse', '\u0000{{{', `bad${a.extensions[0]}`);
  if (bad && !['pass', 'fail', 'unknown'].includes(bad.verdict)) failures.push('parse of garbage did not answer a verdict');
  return { ok: !failures.length, adapter: a.id, failures };
}

module.exports = { MODULE_ID, VERSION, METHODS, adapters, forFile, conformance };
