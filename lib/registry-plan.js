'use strict';
/**
 * lib/registry-plan.js — the spec's registry block as the component list, the dependency graph and the file checklist.
 * comp_id: nexus.lib.registry-plan
 *
 * §0.39.308 SB12 (docs/2026-10-05-build-from-the-spec-phasemap.spec) — James: "Each block is then chunked, then each
 * component is chunked. Using the register as a dependancy and file check list."
 *
 * Before this, block 11 (registry) was written and never read: codegen planned the files freehand from the prose
 * (lib/file-tree-plan.js), ordered them by layer only, and nothing checked the built repo against what the registry
 * promised. Now the registry section carries one YAML `components:` list; from it:
 *   parseRegistry(text)  -> { components, problems }  — every component checked: a safe path, a real layer, unique,
 *                           its dependencies resolve, no cycle, nothing leaning on a higher layer (§3.1)
 *   toPlan(components)   -> the file plan createFileTreeSpec takes — one file per component, dependsOn by real edges
 *   checklist(components, dir) -> what the built repo has against the promise: missing, unparsed, extra
 * Pure functions over text and a directory; the API decides when to use them.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MODULE_ID = 'nexus.lib.registry-plan';
const VERSION = '1.0.0';
const LAYERS = Object.freeze(['kernel', 'engine', 'runtime', 'test']);   // lib/file-tree-plan.js's layers, lowest first
const MAX_COMPONENTS = 400;
const IGNORE_DIRS = new Set(['node_modules', '.git', 'spec', 'proof', 'data', '.nexus']);

function _yaml() { return require('js-yaml'); }
function _safe(p) {
  const s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!s || s.startsWith('/') || /^[a-z]:/i.test(s) || s.split('/').some(seg => seg === '..' || seg === '')) return null;
  return s;
}

/** The YAML block in a registry section: a ```yaml fence holding `components:`, else the whole text if it is one. */
function _registryYaml(text) {
  const src = String(text || '');
  for (const m of src.matchAll(/```(?:ya?ml)?\s*\n([\s\S]*?)```/g)) if (/^\s*components\s*:/m.test(m[1])) return m[1];
  return /^\s*components\s*:/m.test(src) ? src : null;
}

/**
 * parseRegistry(text) -> { components:[{ id, file, layer, purpose, dependsOn:[file], exports, emits, hears, routes }],
 *                          problems:[string] }
 * components is empty when the block cannot be used; every reason is in problems, never dropped (§1.2).
 */
function parseRegistry(text) {
  const raw = _registryYaml(text);
  if (!raw) return { components: [], problems: ['the registry has no `components:` list (a ```yaml block)'] };
  let doc;
  try { doc = _yaml().load(raw); } catch (e) { return { components: [], problems: [`the registry's YAML does not parse: ${e.message.split('\n')[0]}`] }; }
  const list = doc && Array.isArray(doc.components) ? doc.components : null;
  if (!list || !list.length) return { components: [], problems: ['`components:` is empty or not a list'] };
  const problems = [], components = [], byFile = new Map(), byId = new Map();
  for (const [i, c] of list.entries()) {
    if (components.length >= MAX_COMPONENTS) { problems.push(`over ${MAX_COMPONENTS} components — the rest are left out`); break; }
    const file = c && _safe(c.file || c.path);
    const layer = c && String(c.layer || '').toLowerCase();
    const id = c && String(c.id || file || '').trim();
    if (!file) { problems.push(`component ${i + 1}${c && c.id ? ` (${c.id})` : ''}: no file, or an unsafe path`); continue; }
    if (!LAYERS.includes(layer)) { problems.push(`${file}: layer "${c.layer}" is not one of ${LAYERS.join(', ')}`); continue; }
    if (byFile.has(file)) { problems.push(`${file}: listed twice`); continue; }
    const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String);
    const comp = { id, file, layer, purpose: String(c.purpose || '').slice(0, 300) || null, rawDeps: arr(c.depends_on || c.dependsOn || c.requires),
      exports: arr(c.exports), emits: arr(c.emits || (c.events && c.events.emits)), hears: arr(c.hears || (c.events && c.events.hears)), routes: arr(c.routes) };
    byFile.set(file, comp); byId.set(id, comp);
    components.push(comp);
  }
  // dependencies: by file or by id; an end that is not a component is a gap, said
  for (const c of components) {
    c.dependsOn = [];
    for (const d of c.rawDeps) {
      const target = byFile.get(_safe(d)) || byId.get(d);
      if (!target) { problems.push(`${c.file} depends on "${d}", which is not a component in the registry`); continue; }
      if (target === c) { problems.push(`${c.file} depends on itself`); continue; }
      if (LAYERS.indexOf(target.layer) > LAYERS.indexOf(c.layer)) problems.push(`${c.file} (${c.layer}) depends on ${target.file} (${target.layer}) — a lower layer leaning on a higher one (§3.1)`);
      if (!c.dependsOn.includes(target.file)) c.dependsOn.push(target.file);
    }
    delete c.rawDeps;
  }
  const cycle = _cycle(components);
  if (cycle) problems.push(`a dependency cycle: ${cycle.join(' → ')}`);
  return { components: cycle ? [] : components, problems };
}

function _cycle(components) {
  const deps = new Map(components.map(c => [c.file, c.dependsOn]));
  const state = new Map();   // 1 visiting, 2 done
  const stack = [];
  const visit = (f) => {
    if (state.get(f) === 2) return null;
    if (state.get(f) === 1) return [...stack.slice(stack.indexOf(f)), f];
    state.set(f, 1); stack.push(f);
    for (const d of deps.get(f) || []) { const c = visit(d); if (c) return c; }
    stack.pop(); state.set(f, 2);
    return null;
  };
  for (const c of components) { const found = visit(c.file); if (found) return found; }
  return null;
}

/** toPlan(components) -> { ok, files:[{path, layer, purpose, dependsOn, source}], planSource } — file-tree-plan's plan shape. */
function toPlan(components) {
  const files = (components || []).map(c => ({ path: c.file, layer: c.layer, purpose: c.purpose, dependsOn: [...c.dependsOn], content: null, source: 'registry' }));
  return { ok: files.length > 0, files, planSource: 'registry', template: null, rejected: [], agentError: null };
}

function _walk(dir, rel = '', out = []) {
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) _walk(dir, r, out); }
    else if (!e.name.startsWith('.')) out.push(r);
  }
  return out;
}

/**
 * checklist(components, repoDir) -> { ok, components, present, missing:[file], unparsed:[{file, error}], extra:[file] }
 * Every component's file must exist with content (an empty file is missing — not built), and a JavaScript file must parse (node --check — nothing is run). A file in the
 * repo the registry does not name is listed as extra: not a failure, but the registry no longer describes the code.
 */
function checklist(components, repoDir) {
  const missing = [], unparsed = [], present = [];
  const promised = new Set();
  for (const c of components || []) {
    promised.add(c.file);
    const abs = path.join(repoDir, c.file);
    // an empty file is not built: materialize writes every unbuilt chunk as an empty file, and an empty .js parses and
    // an empty test "passes" — so emptiness counts as missing, or an unbuilt repo reads proven
    let size = -1; try { size = fs.readFileSync(abs, 'utf8').trim().length; } catch (_) { /* absent */ }
    if (size <= 0) { missing.push(c.file); continue; }
    present.push(c.file);
    if (/\.(c|m)?js$/.test(c.file)) {
      const r = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8', timeout: 15000 });
      if (r.status !== 0) unparsed.push({ file: c.file, error: String(r.stderr || 'does not parse').split('\n').filter(Boolean).slice(-1)[0] || 'does not parse' });
    }
  }
  const extra = fs.existsSync(repoDir) ? _walk(repoDir).filter(f => !promised.has(f) && !/(^|\/)(package(-lock)?\.json|README\.md|\.gitignore)$/i.test(f)) : [];
  return { ok: !missing.length && !unparsed.length, components: (components || []).length, present: present.length, missing, unparsed, extra };
}

/** The registry block's instruction to its agent — the YAML the parser reads, in one place. */
const REGISTRY_FORMAT = [
  'End the section with the components as ONE ```yaml block, exactly this shape (one entry per file the project needs):',
  '```yaml',
  'components:',
  '  - id: <project>.<area>.<name>',
  '    file: src/<area>/<name>.js',
  '    layer: kernel | engine | runtime | test',
  '    purpose: one sentence',
  '    depends_on: [src/<area>/<other>.js]   # files it needs; a lower or the same layer only',
  '    exports: [names]',
  '    emits: [events]',
  '    hears: [events]',
  '    routes: [routes or commands]',
  '```',
].join('\n');

module.exports = { parseRegistry, toPlan, checklist, REGISTRY_FORMAT, LAYERS, MODULE_ID, VERSION };
