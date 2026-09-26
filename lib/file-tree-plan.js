'use strict';
/**
 * lib/file-tree-plan.js — plan a project's file tree before anything is built.
 * UUID: nexus-file-tree-plan-v1-0000-2026-0921-jamesbrooks-001
 * Version: 0.1.0
 *
 * §FILE-TREE-FIRST 2026-09-21 — James: "i feel the file tree needs to be
 * generated first with the list of files, the kernel, engine and runtime.
 * like i want all the templates from cos available for the promote to spec
 * menu."
 *
 * What a promoted spec was: the same 10 DOCUMENT sections for every idea
 * (00-meta.md … 09-tests.md), whatever it was — a DAW became "02-axioms.md".
 * Nothing said which files the project is. What it is now: a list of real
 * files, each in one layer, each with a purpose, decided BEFORE any content
 * is generated, and built bottom-up:
 *
 *   kernel   core state, types and invariants — no I/O, depends on nothing
 *   engine   the domain logic, built on the kernel
 *   runtime  entrypoints, I/O, wiring, config, UI, CLI, server
 *   test     tests of the layers above
 *
 * Two real sources, merged:
 *   1. A COS template — an archetype (one compartment's fsTemplate: real
 *      files with real content) or a blueprint (several roles, each an
 *      archetype, laid out as one directory per role). Read LIVE from
 *      cos/archetype and cos/blueprint every time, never copied, so a
 *      template added to COS appears here with no change to this file.
 *   2. The agent — given the idea and the template's files, it plans the
 *      rest of the tree. Its job is to understand the idea; nobody hands it
 *      a list. Its answer is validated (safe paths, known layers, a bound on
 *      size) and never trusted blind.
 *
 * A template file keeps its template content (it becomes a completed chunk
 * that costs no dispatch). An agent-planned file starts empty and is built.
 * If the agent cannot be reached, the plan is the template's files alone and
 * says so — it is never padded with an invented skeleton.
 */

const path = require('path');

const MODULE_ID = 'file-tree-plan';
const VERSION = '0.1.0';
const LAYERS = Object.freeze(['kernel', 'engine', 'runtime', 'test']);
const LAYER_ORDER = Object.freeze({ kernel: 0, engine: 1, runtime: 2, test: 3 });
const MAX_FILES = 80;

const ROOT = path.resolve(__dirname, '..');
function _arch() { return require(path.join(ROOT, 'cos', 'archetype', 'index.js')); }
function _bp()   { return require(path.join(ROOT, 'cos', 'blueprint', 'index.js')); }
function _safe(p) { return require(path.join(ROOT, 'guardian', 'lib', 'code-artifact.js'))._safeRelative(String(p || '')); }

// ── COS templates ─────────────────────────────────────────────────────────────
function _files(archetype) {
  const t = archetype && (archetype.fsTemplate || archetype.fs_template);
  const list = t && (Array.isArray(t.files) ? t.files : Array.isArray(t) ? t : []);
  return (list || []).filter(f => f && f.path && !f.binary);
}

/**
 * listCosTemplates() — every COS archetype and blueprint, as promote-menu
 * entries. Shape matches spec-engine's listTemplates() entries so the menu
 * renders them with no special case: { id, name, label, type, description,
 * source, fileCount }.
 */
function listCosTemplates() {
  const out = [];
  let archetypes = [], blueprints = [];
  try { archetypes = _arch().listArchetypes(); } catch (_) { archetypes = []; }
  try { blueprints = _bp().listBlueprints(); } catch (_) { blueprints = []; }
  for (const a of archetypes) {
    out.push({
      id: `cos-archetype:${a.name}`, name: a.name, label: `COS · ${a.name}`, type: 'filetree',
      description: a.description || `COS archetype "${a.name}"`,
      source: 'cos-archetype', fileCount: _files(a).length,
    });
  }
  for (const b of blueprints) {
    const roles = (b.nodes || []).map(n => n.role || n.name).filter(Boolean);
    out.push({
      id: `cos-blueprint:${b.name}`, name: b.name, label: `COS · ${b.name} (${roles.length} roles)`, type: 'filetree',
      description: b.description || `COS blueprint "${b.name}": ${roles.join(', ')}`,
      source: 'cos-blueprint', roles,
    });
  }
  return out;
}

function isCosTemplate(id) { return typeof id === 'string' && /^cos-(archetype|blueprint):/.test(id); }

// ── Eravos mods ("organisms" pre-rename, per eravos.spec §2026-09-20) ───────
// §BUILT 2026-09-21 — James: "add eravos organisms to architecture &
// features — select any combination." Same real shape as a COS archetype
// (one unit, real starting files) from a different, already-real catalog:
// eravos/ui/mods/<name>/ — one schema/schema.json + one <name>.engine.js
// per mod, read LIVE (never copied), same discipline as listCosTemplates().
// nexus-shared is excluded: it is eravos/ui/mods/nexus-shared/nexus-node-
// core.js alone, no schema.json — a shared library every NEXUS-facing mod
// requires, not itself a spawnable unit (checked directly: every other
// mod dir has exactly {schema/schema.json, <name>.engine.js}; this one
// doesn't, and calling it a template would offer someone a "mod" with no
// real schema behind it).
const EROS_ROOT = path.join(ROOT, 'eravos', 'ui', 'mods');
function _modDirs() {
  try { return require('fs').readdirSync(EROS_ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
  catch (_) { return []; }
}
function _modFiles(modName) {
  const dir = path.join(EROS_ROOT, modName);
  const schemaPath = path.join(dir, 'schema', 'schema.json');
  const enginePath = path.join(dir, `${modName}.engine.js`);
  const fs = require('fs');
  if (!fs.existsSync(schemaPath) || !fs.existsSync(enginePath)) return null; // not a real, complete mod — nexus-shared and any future non-standard dir
  let schema = null;
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (_) { schema = null; }
  return {
    schema,
    files: [
      { path: 'schema/schema.json', content: fs.readFileSync(schemaPath, 'utf8') },
      { path: `${modName}.engine.js`, content: fs.readFileSync(enginePath, 'utf8') },
    ],
  };
}

/** listEravosMods() — every real, complete eravos mod, as promote-menu entries. */
function listEravosMods() {
  const out = [];
  for (const name of _modDirs()) {
    const m = _modFiles(name);
    if (!m) continue;
    const label = (m.schema && m.schema.label) || name;
    const icon = (m.schema && m.schema.icon) ? `${m.schema.icon} ` : '';
    out.push({
      id: `eravos-mod:${name}`, name, label: `Eravos · ${icon}${label}`, type: 'filetree',
      description: (m.schema && m.schema.description) || `Eravos mod "${name}"`,
      source: 'eravos-mod', fileCount: m.files.length,
    });
  }
  return out;
}

function isEravosMod(id) { return typeof id === 'string' && /^eravos-mod:/.test(id); }
/** isFileTreeTemplate(id) — either real catalog this module reads from. */
function isFileTreeTemplate(id) { return isCosTemplate(id) || isEravosMod(id); }

/**
 * fromEravosMod(id, { name }) -> { ok, template, files:[{path,layer,purpose,content,source}] }
 * Same shape as fromCosTemplate — a mod's two files land at the project
 * root (a mod IS the compartment, same as a COS archetype), substituted
 * with the same {{name}} convention so a mod started fresh under a new
 * project name doesn't carry the catalog example's literal name through.
 */
function fromEravosMod(id, { name = 'project' } = {}) {
  const m = String(id || '').match(/^eravos-mod:(.+)$/);
  if (!m) return { ok: false, errors: [`not an eravos mod id: ${id}`] };
  const mod = _modFiles(m[1]);
  if (!mod) return { ok: false, errors: [`no eravos mod "${m[1]}"`] };
  const vars = _vars(name);
  const files = [];
  for (const f of mod.files) {
    const p = _safe(f.path);
    if (!p) continue;
    files.push({ path: p, layer: layerFor(p), purpose: `from eravos mod ${m[1]}`, content: _subst(f.content, vars), source: 'eravos-mod' });
  }
  const label = (mod.schema && mod.schema.label) || m[1];
  return { ok: true, template: { kind: 'eravos-mod', name: label, description: (mod.schema && mod.schema.description) || null }, files };
}

/**
 * Deterministic layer for a TEMPLATE file (the agent assigns its own files'
 * layers). Rules follow what each file is, not what it is called hopefully:
 * tests are test; entrypoints, manifests and config are runtime; the rest of
 * a template's code is engine. Nothing is guessed into kernel — a template
 * that ships no kernel file does not get one invented.
 */
function layerFor(p) {
  const f = p.toLowerCase(), base = path.basename(f);
  if (/(^|\/)(tests?|__tests__|spec)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(base)) return 'test';
  if (/^(index|main|server|app|agent|worker|scheduler|proxy|cli|boot)\.[a-z]+$/.test(base)) return 'runtime';
  if (/\.(json|ya?ml|toml|ini|txt|env|example|cosignore|gitignore|gitkeep)$/.test(base) || base.startsWith('.')) return 'runtime';
  return 'engine';
}

function _vars(name) { return { name, NAME: name, projectName: name, instanceName: name }; }
function _subst(str, vars) {
  try { return _bp().substituteTemplate(String(str), vars); }
  catch (_) { return String(str).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m)); }
}

/**
 * fromCosTemplate(id, { name }) -> { ok, template, files:[{path,layer,purpose,content,source}] }
 */
function fromCosTemplate(id, { name = 'project' } = {}) {
  const m = String(id || '').match(/^cos-(archetype|blueprint):(.+)$/);
  if (!m) return { ok: false, errors: [`not a COS template id: ${id}`] };
  const vars = _vars(name);
  const files = [];
  const add = (rel, f, via) => {
    const p = _safe(rel);
    if (!p) return;
    files.push({ path: p, layer: layerFor(p), purpose: via, content: _subst(f.content ?? '', vars), source: 'cos-template' });
  };
  if (m[1] === 'archetype') {
    const a = _arch().getArchetype(m[2]);
    if (!a) return { ok: false, errors: [`no COS archetype "${m[2]}"`] };
    for (const f of _files(a)) add(f.path, f, `from COS archetype ${a.name}`);
    return { ok: true, template: { kind: 'archetype', name: a.name, description: a.description || null }, files };
  }
  const b = _bp().getBlueprint(m[2]);
  if (!b) return { ok: false, errors: [`no COS blueprint "${m[2]}"`] };
  for (const node of b.nodes || []) {
    const role = node.role || node.name;
    const archRef = node.archetype || node.archetypeId || node.archetypeName;
    const a = archRef ? _arch().getArchetype(archRef) : null;
    if (!role || !a) continue;
    const why = (node.overrides && node.overrides.purpose) || `role ${role}`;
    for (const f of _files(a)) add(`${role}/${f.path}`, f, `${why} (COS ${a.name}, blueprint ${b.name})`);
  }
  return { ok: true, template: { kind: 'blueprint', name: b.name, description: b.description || null, roles: (b.nodes || []).map(n => n.role || n.name) }, files };
}

// ── The agent's plan ──────────────────────────────────────────────────────────
function planPrompt({ name, description, templateName = null, templateFiles = [] }) {
  return [
    `Plan the complete file tree for this project BEFORE any code is written.`,
    ``,
    `Project: ${name}`,
    `What it is: ${description || '(no description given — infer from the name)'}`,
    templateName ? `Starting template: ${templateName}` : '',
    templateFiles.length ? `Files the template already provides (keep them, do not repeat them):\n${templateFiles.map(f => `- ${f.path} [${f.layer}]`).join('\n')}` : '',
    ``,
    `Organise every file into exactly one layer:`,
    `- kernel: core state, types, invariants. No I/O. Depends on nothing else in the project.`,
    `- engine: the domain logic, built only on the kernel.`,
    `- runtime: entrypoints, I/O, wiring, configuration, UI, CLI or server.`,
    `- test: tests of the other layers.`,
    ``,
    `Reply with ONLY a JSON array, no prose, no code fence, one object per file:`,
    `[{"path":"src/kernel/state.js","layer":"kernel","purpose":"one sentence"}]`,
    `Repo-relative paths only. Real, specific files for THIS project — at most ${MAX_FILES}.`,
  ].filter(Boolean).join('\n');
}

/**
 * parsePlan(text) -> { files:[{path,layer,purpose}], rejected:[{entry,reason}] }
 * Tolerates a fenced or prose-wrapped reply by taking the outermost JSON
 * array; validates every entry and says why each rejected one was rejected.
 */
function parsePlan(text) {
  const src = String(text || '');
  const start = src.indexOf('['), end = src.lastIndexOf(']');
  if (start < 0 || end <= start) return { files: [], rejected: [{ entry: null, reason: 'no JSON array in the reply' }] };
  let arr;
  try { arr = JSON.parse(src.slice(start, end + 1)); }
  catch (e) { return { files: [], rejected: [{ entry: null, reason: `plan is not valid JSON: ${e.message}` }] }; }
  if (!Array.isArray(arr)) return { files: [], rejected: [{ entry: null, reason: 'plan is not an array' }] };
  const files = [], rejected = [], seen = new Set();
  for (const e of arr) {
    const p = e && _safe(e.path);
    const layer = e && String(e.layer || '').toLowerCase();
    if (!p) { rejected.push({ entry: e, reason: 'missing or unsafe path' }); continue; }
    if (!LAYERS.includes(layer)) { rejected.push({ entry: e, reason: `unknown layer "${e.layer}"` }); continue; }
    if (seen.has(p)) { rejected.push({ entry: e, reason: 'duplicate path' }); continue; }
    if (files.length >= MAX_FILES) { rejected.push({ entry: e, reason: `over the ${MAX_FILES}-file bound` }); continue; }
    seen.add(p);
    files.push({ path: p, layer, purpose: String(e.purpose || '').slice(0, 300) || null, content: null, source: 'agent-plan' });
  }
  return { files, rejected };
}

/** merge(templateFiles, agentFiles) — template files win on a path clash (they carry real content). */
function merge(templateFiles = [], agentFiles = []) {
  const byPath = new Map();
  for (const f of agentFiles) byPath.set(f.path, f);
  for (const f of templateFiles) byPath.set(f.path, { ...byPath.get(f.path), ...f, purpose: (byPath.get(f.path) || {}).purpose || f.purpose });
  return [...byPath.values()].sort((a, b) => (LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]) || a.path.localeCompare(b.path));
}

/**
 * writeTreeNode(manifest, dir) — the planned tree as a .filetree NODE
 * (James: "no md files. only node types"). One node per spec, id = spec
 * uuid, payload = the files by layer with their purposes and build order.
 */
const TREE_DIR = path.join(ROOT, 'idearium', 'data', 'nodes', 'filetree');
function writeTreeNode(manifest, dir = process.env.NEXUS_FILETREE_DIR || TREE_DIR) {
  const ft = manifest && manifest.fileTree;
  if (!ft || !Array.isArray(ft.files)) throw new Error('manifest has no fileTree');
  const nx = require(path.join(ROOT, 'lib', 'node-export.js'));
  require('fs').mkdirSync(dir, { recursive: true });
  const byLayer = Object.fromEntries(LAYERS.map(l => [l, ft.files.filter(f => f.layer === l)]));
  return nx.exportToFile('filetree', manifest.uuid, {
    schema: 'nexus.filetree/1', specUuid: manifest.uuid, name: manifest.name, description: manifest.description || null,
    planSource: ft.planSource, template: ft.template || null, layers: byLayer,
    buildOrder: LAYERS.filter(l => byLayer[l].length), rejected: ft.rejected || 0, createdAt: Date.now(),
  }, { system: 'nexus.lib.file-tree-plan', summary: `${manifest.name}: ${ft.files.length} files · ${LAYERS.map(l => `${l} ${byLayer[l].length}`).join(' · ')}`, context: manifest.ideaUuid || null }, dir);
}

/**
 * plan({ name, description, templateId, ask }) — the whole step.
 *   ask: async (prompt) -> string   the agent (injected; this module has no transport)
 * Returns { ok, files, template, planSource, rejected, agentError }.
 */
async function plan({ name, description = '', templateId = null, templateIds = null, ask = null } = {}) {
  if (!name) return { ok: false, errors: ['name is required'] };
  // One template or several (the promote picker is multi-select), from
  // either real catalog (COS or eravos mods). Several are merged
  // file-by-file; a later one does not silently overwrite an earlier
  // one's file at the same path — that is refused.
  const ids = [...new Set([...(templateIds || []), ...(templateId ? [templateId] : [])])].filter(isFileTreeTemplate);
  let template = null, templateFiles = [];
  const seenPath = new Map();
  for (const id of ids) {
    const t = isEravosMod(id) ? fromEravosMod(id, { name }) : fromCosTemplate(id, { name });
    if (!t.ok) return t;
    for (const f of t.files) {
      if (seenPath.has(f.path)) return { ok: false, errors: [`${f.path} is provided by both ${seenPath.get(f.path)} and ${id} — pick one, or a blueprint that already combines them`] };
      seenPath.set(f.path, id);
      templateFiles.push(f);
    }
    template = template ? { kind: 'combined', name: `${template.name} + ${t.template.name}` } : t.template;
  }
  let agentFiles = [], rejected = [], agentError = null;
  if (typeof ask === 'function') {
    try {
      const reply = await ask(planPrompt({ name, description, templateName: template && `${template.kind} ${template.name}`, templateFiles }));
      const parsed = parsePlan(reply);
      agentFiles = parsed.files; rejected = parsed.rejected;
      if (!agentFiles.length) agentError = rejected[0] ? rejected[0].reason : 'the agent planned no files';
    } catch (e) { agentError = e.message; }
  } else agentError = 'no agent available to plan';
  const files = merge(templateFiles, agentFiles);
  if (!files.length) return { ok: false, errors: [`no file tree: ${agentError || 'template has no files'}`], template, rejected, agentError };
  const planSource = agentFiles.length ? (templateFiles.length ? 'template + agent' : 'agent') : 'template only';
  return { ok: true, files, template, planSource, rejected, agentError };
}

module.exports = {
  MODULE_ID, VERSION, LAYERS, LAYER_ORDER, MAX_FILES,
  listCosTemplates, isCosTemplate, fromCosTemplate,
  listEravosMods, isEravosMod, fromEravosMod, isFileTreeTemplate, layerFor,
  planPrompt, parsePlan, merge, writeTreeNode, plan, TREE_DIR,
};
