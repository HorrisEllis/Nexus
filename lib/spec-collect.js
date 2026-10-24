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
 *   compileToProposals(…)       SF4: a collected spec laid out from its template — genesis by default (0.60.68); every
 *                               file proposed, nothing overwritten, components' lib files listed to build
 */

const VERSION = '1.1.0';   // 1.1.0 (0.60.68): laid out from a template — genesis by default
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

/**
 * 0.60.68 — James: "Use the templates. The genesis by default."
 * A collected spec is laid out from a TEMPLATE, chosen in this order: the caller's `template`, the spec's own
 * meta.template, the setting specs.default_template — genesis when none is set.
 *   genesis    the nexus-system skeleton (cos/archetype/nexus-system — genesis 1.4.0's catalog, file for file), with the
 *              spec's modules SLOTTED IN by lib/file-tree-plan.js plan({ slot }): each module a component in
 *              registry-components.js with its component, capability, command, event, route and hook nodes; each export
 *              a command. Each component's lib file is left to build (genesis: "nothing pretends to work") — listed in
 *              `toBuild` with what it must export, not stubbed.
 *   compiler   the spec compiler's T0/T1 TypeScript scaffold (emerge/compiler) — the earlier default, kept.
 *   <id>       any other file-tree template lib/file-tree-plan.js knows (cos-archetype:…, cos-blueprint:…).
 */
const DEFAULT_TEMPLATE = 'genesis';
const _kebab = (x, n = 32) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n);

/** templateOf(spec, explicit) → the template id this spec is laid out from */
function templateOf(spec, explicit = null) {
  return String(explicit || (spec && spec.meta && spec.meta.template) || compileSetting().template || DEFAULT_TEMPLATE).trim();
}

/** slotFromSpec(spec) → genesis slot components: a module → { name, file, purpose, capability, commands, uses } */
function slotFromSpec(spec) {
  return (_modules(spec && spec.modules) || []).map(m => {
    const name = _kebab(m.id || m.name);
    const file = m.path && /^(lib|tests|ui)\//.test(String(m.path)) ? String(m.path) : `lib/${name}.js`;
    const commands = [...new Set((Array.isArray(m.exports) ? m.exports : []).map(e => { const x = EXPORT_RE.exec(String(e).trim()); return _kebab(x ? x[1] : String(e).split(/[\s(]/)[0], 24); }).filter(Boolean))];
    const uses = (Array.isArray(m.uses) ? m.uses : Array.isArray(m.depends_on) ? m.depends_on : []).map(u => _kebab(String(u).split('.').pop())).filter(Boolean);
    return { name, file, purpose: String(m.description || '').slice(0, 300) || null, capability: String(m.description || name).slice(0, 120), commands: commands.length ? commands : ['run'], uses };
  }).filter(c => c.name);
}

/** _layout(spec, content, template, specPath) → { ok, files: [{ path, content|null, purpose }], template, error? } */
async function _layout(spec, content, template, specPath) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const FTP = require('./file-tree-plan.js');
  const name = (spec.meta && spec.meta.name) || path.basename(specPath, '.spec');
  const description = (spec.meta && String(spec.meta.purpose || '').trim()) || '';
  if (template === 'compiler') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-compile-'));
    try {
      const src = path.join(tmp, path.basename(specPath)); fs.writeFileSync(src, content);
      const dir = path.join(tmp, 'out');
      const r = await require('./emerge/compiler/index.js').compile(src, dir, { skipCortex: true, tier: 1 });
      if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'the compiler did not run' };
      const rels = [...new Set([...((r.t0 && r.t0.emitted) || []), ...((r.t1 && r.t1.emitted) || [])])];
      return { ok: true, template: 'compiler', files: rels.map(rel => ({ path: rel, content: fs.readFileSync(path.join(dir, rel), 'utf8'), purpose: 'spec compiler T0/T1' })) };
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
  }
  const id = template === 'genesis' ? FTP.SKELETON_ID : template;
  if (!FTP.isFileTreeTemplate(id)) return { ok: false, error: `no template "${template}" — genesis, compiler, or a file-tree template (${FTP.SKELETON_ID}, cos-blueprint:…)` };
  const planned = await FTP.plan({ name, description, templateIds: [id], ...(id === FTP.SKELETON_ID ? { slot: slotFromSpec(spec) } : {}) });
  if (!planned.ok) return { ok: false, error: (planned.errors || ['the template could not be laid out']).join('; ') };
  return { ok: true, template, files: planned.files.map(f => ({ path: f.path, content: f.content == null ? null : String(f.content), purpose: f.purpose || null })), slot: planned.slot || null };
}

/**
 * compileToProposals({ layer, repo, specPath, content, into, hat, template }) — a collected spec laid out from its template
 * (genesis by default); every file with content is PROPOSED as an .inject (lib/repo-inject.js propose), never written;
 * a file the repo already has is skipped and named; a file the template leaves to build is listed in toBuild.
 * → { ok, template, proposed: [{ path, uuid }], skipped: [{ path, why }], toBuild: [{ path, purpose }], slot, error? }
 */
async function compileToProposals({ layer, repo, specPath = 'spec/spec.spec', content, into = '', hat = null, template = null } = {}) {
  const v = validate(content);
  if (!v.ok) return { ok: false, error: `not a spec the compiler can read — ${v.errors.join('; ')}`, proposed: [], skipped: [], toBuild: [] };
  const spec = _yaml().load(content).spec;
  const tpl = templateOf(spec, template);
  const out = { ok: true, template: tpl, proposed: [], skipped: [], toBuild: [], slot: null };
  try {
    const lay = await _layout(spec, content, tpl, specPath);
    if (!lay.ok) return { ok: false, template: tpl, error: lay.error, proposed: [], skipped: [], toBuild: [] };
    out.slot = lay.slot || null;
    const RI = require('./repo-inject.js');
    const base = String(into || '').replace(/^\/+|\/+$/g, '');
    for (const f of lay.files) {
      const target = base ? `${base}/${f.path}` : f.path;
      if (f.content == null) { out.toBuild.push({ path: target, purpose: f.purpose }); continue; }
      let existing = null; try { const r = layer.readFile(repo.uuid, target); existing = r && !r.error ? r.content : null; } catch (_) {}
      if (existing != null) { out.skipped.push({ path: target, why: 'already in the repo — a template never overwrites' }); continue; }
      const p = RI.propose({ layer, repo, hat, path: target, content: f.content, source: { kind: 'compiler', spec: specPath, template: tpl } });
      if (p.ok) out.proposed.push({ path: target, uuid: p.inject.uuid }); else out.skipped.push({ path: target, why: (p.errors || []).join('; ') });
    }
    try { const bus = require('../nexus/nexus-bus.js'); bus.emit('idearium.spec.compiled', { repoUuid: repo.uuid, spec: specPath, template: tpl, proposed: out.proposed.map(x => x.path), toBuild: out.toBuild.map(x => x.path), skipped: out.skipped.length }, { source: 'nexus.lib.spec-collect' }); } catch (_) {}
    return out;
  } catch (e) { return { ok: false, template: tpl, error: e.message, proposed: out.proposed, skipped: out.skipped, toBuild: out.toBuild }; }
}

/** templateBrief(template) — what the spec-framework block tells the agent about the template its spec is laid out on */
function templateBrief(template = null) {
  const t = String(template || compileSetting().template || DEFAULT_TEMPLATE);
  if (t === 'genesis') return 'This system is laid out from the GENESIS template (the nexus-system skeleton): server, CLI, config, registry, '
    + 'interaction contract, event taxonomy, JAA store, node index, listener, heartbeat, handoff and modules are already there. '
    + 'Name ONLY the modules this system adds (each becomes a component in lib/ with its registry entry and nodes); each '
    + 'export becomes one of its commands. Set meta.template: genesis.';
  if (t === 'compiler') return 'This spec is laid out by the spec compiler as a TypeScript package (meta.template: compiler).';
  return `This spec is laid out from the template "${t}" (meta.template: ${t}). Name only the modules it adds.`;
}

// SF4 — whether a collected spec is compiled at once (idearium's specs.compile_on_collect / compile_into), and the default
// template (specs.default_template), handed in by idearium/api at boot like repo-agent's default provider: this module never
// reads another system's store.
let _compileSetting = () => ({ on: false, into: '', template: DEFAULT_TEMPLATE });
function setCompileSetting(fn) { if (typeof fn === 'function') _compileSetting = fn; }
function compileSetting() { try { const v = _compileSetting() || {}; return { on: v.on === true, into: String(v.into || ''), template: String(v.template || DEFAULT_TEMPLATE) }; } catch (_) { return { on: false, into: '', template: DEFAULT_TEMPLATE }; } }

module.exports = { VERSION, DEFAULT_TEMPLATE, FORMAT, EXPORT_RE, isCompilerSpec, validate, summaryOf, collected, compileToProposals, templateOf, slotFromSpec, templateBrief, setCompileSetting, compileSetting };
