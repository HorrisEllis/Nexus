'use strict';
/**
 * lib/spec-collect.js — SF3: a .spec an agent writes is checked against the spec compiler's own format and collected.
 * comp_id: nexus.lib.spec-collect
 *
 * James, 2026-10-15: "need to inject a framework for generating a .spec file. then need to listen for it to collect it."
 *
 * The framework is the 'spec-framework' prompt block (lib/repo-prompt-blocks.js, sent when the intent is spec). An
 * agent's reply lands as .inject nodes (lib/repo-inject.js); every file passes the code.write step gate first. This
 * module is that gate's spec check and the record of what was collected:
 *
 *   isCompilerSpec(path, text)  a .spec file whose top key is `spec:` — the compiler's format. Other .spec files
 *                               (phasemaps, prose specs) are not this format and are never judged by it.
 *   validate(text)              → { ok, errors[], summary } against docs/spec-compiler.spec spec_format:
 *                               root spec:, required meta + modules, meta name/version/purpose/uuid, each module
 *                               id + description, each export "name(params) → returns" (emerge/compiler parseExportSig).
 *   summaryOf(spec)             → { name, version, modules: [{ id, exports: [names] }], schemas, tests }
 *   collected(entry, …)         the event + the summary for a .spec that landed (idearium.spec.collected)
 */

const VERSION = '1.0.0';
// docs/spec-compiler.spec spec_format — read once from the spec itself would tie the gate to a prose file; the four
// lists are copied here and the test checks they still match the spec (SC-05).
const FORMAT = Object.freeze({
  required: ['meta', 'modules'],
  optional: ['schemas', 'events', 'tests', 'handshake', 'routes', 'ui', 'axioms'],
  metaRequired: ['name', 'version', 'purpose', 'uuid'],
  moduleRequired: ['id', 'description'],
});
const EXPORT_RE = /^([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:→|->)\s*(.+)$/;

function _yaml() { return require('js-yaml'); }

function isCompilerSpec(path, text) {
  if (!/\.spec$/i.test(String(path || ''))) return false;
  return /^spec\s*:/m.test(String(text || '').replace(/^\s*#.*$/gm, '').trimStart().split('\n').find(l => l.trim()) || '');
}

function _modules(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([k, v]) => ({ id: k, ...(v || {}) }));
  return null;
}

function summaryOf(spec) {
  const mods = _modules(spec && spec.modules) || [];
  return {
    name: spec && spec.meta ? spec.meta.name || null : null,
    version: spec && spec.meta ? String(spec.meta.version || '') || null : null,
    modules: mods.map(m => ({ id: m && (m.id || m.name) || null, path: m && m.path || null, exports: (m && Array.isArray(m.exports) ? m.exports : []).map(e => { const x = EXPORT_RE.exec(String(e).trim()); return x ? x[1] : String(e).trim().split(/[\s(]/)[0]; }) })),
    schemas: Array.isArray(spec && spec.schemas) ? spec.schemas.length : (spec && spec.schemas && typeof spec.schemas === 'object' ? Object.keys(spec.schemas).length : 0),
    tests: Array.isArray(spec && spec.tests) ? spec.tests.length : 0,
  };
}

/** validate(text) → { ok, errors: [string], summary } — each error says exactly what to add or fix */
function validate(text) {
  let doc;
  try { doc = _yaml().load(String(text || '')); } catch (e) { return { ok: false, errors: [`not YAML: ${String(e.message).split('\n')[0].slice(0, 160)}`], summary: null }; }
  const errors = [];
  const spec = doc && doc.spec;
  if (!spec || typeof spec !== 'object') return { ok: false, errors: ['the root key must be spec: (the spec compiler\'s format)'], summary: null };
  for (const k of FORMAT.required) if (spec[k] == null) errors.push(`spec.${k} is required`);
  const unknown = Object.keys(spec).filter(k => !FORMAT.required.includes(k) && !FORMAT.optional.includes(k));
  if (unknown.length) errors.push(`spec has keys the compiler does not read: ${unknown.join(', ')} (allowed: ${[...FORMAT.required, ...FORMAT.optional].join(', ')})`);
  if (spec.meta && typeof spec.meta === 'object') for (const k of FORMAT.metaRequired) { if (spec.meta[k] == null || String(spec.meta[k]).trim() === '') errors.push(`spec.meta.${k} is required`); }
  else if (spec.meta != null) errors.push('spec.meta must be a mapping (name, version, purpose, uuid)');
  if (spec.modules != null) {
    const mods = _modules(spec.modules);
    if (!mods || !mods.length) errors.push('spec.modules must list at least one module');
    else mods.forEach((m, i) => {
      const at = `spec.modules[${i}]${m && m.id ? ` (${m.id})` : ''}`;
      if (!m || typeof m !== 'object') { errors.push(`${at} must be a mapping`); return; }
      for (const k of FORMAT.moduleRequired) if (m[k] == null || String(m[k]).trim() === '') errors.push(`${at}.${k} is required`);
      if (m.exports != null) {
        if (!Array.isArray(m.exports)) errors.push(`${at}.exports must be a list of "name(params) → returns"`);
        else m.exports.forEach((e, j) => { if (!EXPORT_RE.test(String(e).trim())) errors.push(`${at}.exports[${j}] "${String(e).slice(0, 80)}" must read "name(params) → returns"`); });
      }
    });
  }
  return { ok: errors.length === 0, errors, summary: summaryOf(spec) };
}

/** collected({ repoUuid, path, content, injectUuid, causedBy, phase }) → the record of a spec that landed; emitted on the bus */
function collected({ repoUuid = null, path = null, content = '', injectUuid = null, causedBy = null, phase = null } = {}) {
  const v = validate(content);
  const rec = { repoUuid, path, injectUuid, causedBy, phase, ok: v.ok, summary: v.summary, ts: Date.now() };
  try { const bus = require('../nexus/nexus-bus.js'); if (bus && typeof bus.emit === 'function') bus.emit('idearium.spec.collected', rec, { source: 'nexus.lib.spec-collect', causedBy }); } catch (_) { /* the record still returns */ }
  return rec;
}

module.exports = { VERSION, FORMAT, EXPORT_RE, isCompilerSpec, validate, summaryOf, collected };
