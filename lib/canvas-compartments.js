'use strict';
/**
 * lib/canvas-compartments.js — a canvas as a COS compartment, each tool a nested compartment (CN3, 0.60.83)
 * comp_id: nexus.lib.canvas-compartments
 * UUID: nexus-lib-canvas-compartments-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-16-canvas-compartments-phasemap.spec (CN3_nested_compartments)
 *
 * James, 2026-10-16: "what about using cos for the canvas, then each tool a nested compartment?"
 *
 * The canvas is one compartment laid out from the COS archetype eravos-canvas (his ERAVOS canvas). Each tool is a child
 * compartment (parentId = the canvas) laid out from eravos-tool or eravos-sound-tool. A tool's compartment is the unit
 * Nexus builds, versions and tests (the coder's reading, to confirm: the tools still run together in the one canvas
 * page, sample-accurate). So the canvas can serve them, each tool's root is linked into the canvas at
 * tools/<domain>/tools/<category>/<tool>/ (a junction on Windows, a symlink elsewhere) and recorded as a mount (role
 * 'tool'). The loaders are his: the canvas's own build/index-tools.mjs writes tools/<domain>/tools/index.js from the
 * folders; this module writes the domain list, and each domain: his own where he has one (music, with the audio engine a
 * sound tool needs; dataflow), else a small index.js, domain.json and domain.js.
 * canvas.json at the canvas root lists its tools, their compartments and their acceptance lines.
 *
 *   create({ name, description, tools })      → the canvas and its tools
 *   addTool(canvas, { slug, label, domain, category, sound })
 *   show(canvas)                              → canvas.json, the compartment tree, what each tool links to
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MODULE_ID = 'nexus.lib.canvas-compartments';
const VERSION = '1.0.0';
const MANIFEST = 'canvas.json';
const SLUG = /^[a-z][a-z0-9-]*$/;

function _cb() { return require('./cos-bridge.js'); }
function _ftp() { return require('./file-tree-plan.js'); }
function _eravos() { return require('../cos/archetype/eravos.js'); }
function _slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'canvas'; }

function _write(root, files) {
  for (const f of files) {
    const abs = path.resolve(root, f.path);
    if (!abs.startsWith(path.resolve(root) + path.sep)) throw new Error(`a template file escapes the compartment: ${f.path}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content);
  }
}
function _readManifest(root) { try { return JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8')); } catch (_) { return null; } }
function _writeManifest(root, m) { fs.writeFileSync(path.join(root, MANIFEST), JSON.stringify(m, null, 2) + '\n'); }

/** _canvas(nameOrId) → { compartment, root, manifest } | { error } */
function _canvas(nameOrId) {
  const c = _cb().getCompartment(nameOrId);
  if (!c) return { error: `no canvas compartment "${nameOrId}"` };
  const root = c.fs && c.fs.root;
  const manifest = root ? _readManifest(root) : null;
  if (!manifest) return { error: `"${c.name}" is a compartment but not a canvas (no ${MANIFEST})` };
  return { compartment: c, root, manifest };
}

/** the domain's small files: index.js (his shape: domain.js, then the generated tools/index.js), domain.json, domain.js */
function _domainFiles(domain, label) {
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'cos', 'archetype', 'eravos-canvas', 'templates', 'domain', 'domain.json'), 'utf8');
  const json = tpl.split('__DOMAIN_LABEL__').join(label).split('__DOMAIN__').join(domain);
  return [
    { path: `tools/${domain}/domain.json`, content: json },
    { path: `tools/${domain}/domain.js`, content: `/* ${label} domain — domain.js: registers its mode. Written by Nexus (lib/canvas-compartments.js) in the shape of his tools/agents/domain.js. */
(function (global) {
  'use strict';
  global.Kernel.use({
    id: ${JSON.stringify(domain)}, version: '0.1.0', label: ${JSON.stringify(label)}, requires: [],
    install() {},
    shell(S) {
      if (typeof S.mode !== 'function') return;
      S.mode({ id: ${JSON.stringify(domain)}, domain: ${JSON.stringify(domain)}, label: ${JSON.stringify(label)}, icon: '◈', accent: '#00d4ff', units: [], categories: [], blurb: '' });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
` },
    { path: `tools/${domain}/index.js`, content: `/* ${label} domain. Its tools live in tools/<category>/<tool>/ (GENERATED tools/index.js, by build/index-tools.mjs). */
(function () {
  var base = (window.ERAVOS_TOOLS || '') + ${JSON.stringify(domain + '/')};
  var F = ['domain.js', 'tools/index.js'];
  for (var i = 0; i < F.length; i++) document.write('<script src="' + base + F[i] + '"><\\/script>');
})();
` },
  ];
}

/** _loaders(root, manifest) — the domain list, each domain's files, then his build/index-tools.mjs for the tool loaders */
function _loaders(root, manifest) {
  const domains = [...new Set(manifest.tools.map(t => t.domain))].sort();
  const list = fs.readFileSync(path.join(root, 'tools', 'index.js'), 'utf8')
    .replace(/var D = window\.ERAVOS_DOMAINS = \[[^\]]*\];/, `var D = window.ERAVOS_DOMAINS = ${JSON.stringify(domains)};`);
  fs.writeFileSync(path.join(root, 'tools', 'index.js'), list);
  for (const d of domains) {
    if (fs.existsSync(path.join(root, 'tools', d, 'domain.js'))) continue;
    // his own domain when there is one (music: the audio engine every sound tool runs on; dataflow), else a small generated one
    const his = _eravos().domainFiles(d);
    _write(root, his ? his.map(f => ({ path: `tools/${d}/${f.path}`, content: f.content })) : _domainFiles(d, d.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase())));
  }
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });   // his index-tools.mjs also writes tests/tools.index.js
  const out = execFileSync(process.execPath, [path.join(root, 'build', 'index-tools.mjs')], { cwd: root, encoding: 'utf8', timeout: 60000 });
  return { domains, indexTools: out.trim() };
}

/** create({ name, description, tools }) → { ok, canvas: { id, name, root }, tools: [...], domains } | { ok:false, error } */
function create({ name, description = '', tools = [] } = {}) {
  if (!name) return { ok: false, error: 'name is required' };
  const cb = _cb();
  const r = cb.createCompartment({ name: cb.uniqueName(`canvas-${_slug(name)}`), purpose: `canvas: ${name}`, runtimeId: 'html', networkIsolated: true });
  if (!r.ok) return { ok: false, error: r.error };
  const c = r.compartment, root = c.fs.root;
  const laid = _ftp().fromCosTemplate('cos-archetype:eravos-canvas', { name, description: description || `${name}: a canvas of tools` });
  if (!laid.ok) return { ok: false, error: (laid.errors || []).join('; ') };
  _write(root, laid.files);
  _writeManifest(root, { schema: 'nexus.canvas/1', name, description, compartmentId: c.id, archetype: 'eravos-canvas', createdAt: Date.now(), tools: [] });
  const added = [];
  for (const t of tools) {
    const a = addTool(c.id, t, { loaders: false });
    if (!a.ok) return { ok: false, error: `tool ${t.slug || t.label}: ${a.error}`, canvas: { id: c.id, name: c.name, root }, tools: added };
    added.push(a.tool);
  }
  const L = _loaders(root, _readManifest(root));
  return { ok: true, canvas: { id: c.id, name: c.name, root }, tools: added, domains: L.domains };
}

/** addTool(canvas, { slug, label, domain, category, sound }) → { ok, tool } — one nested compartment, linked in */
function addTool(canvasNameOrId, { slug, label, domain = 'custom', category = 'custom', sound = false } = {}, { loaders = true } = {}) {
  const K = _canvas(canvasNameOrId);
  if (K.error) return { ok: false, error: K.error };
  slug = slug || _slug(label);
  for (const [k, v] of [['tool id', slug], ['domain', domain], ['category', category]]) if (!SLUG.test(v)) return { ok: false, error: `${k} "${v}": lower-case-with-dashes` };
  label = label || slug;
  if (sound && domain !== 'music') return { ok: false, error: `a sound tool runs on the music domain's audio engine (his tools/music/core): put it in domain music, not ${domain}` };
  const { compartment: canvas, root, manifest } = K;
  if (manifest.tools.some(t => t.slug === slug && t.domain === domain)) return { ok: false, error: `${domain}/${slug} is already on this canvas` };
  const link = path.join(root, 'tools', domain, 'tools', category, slug);
  if (fs.existsSync(link)) return { ok: false, error: `tools/${domain}/tools/${category}/${slug} exists in the canvas` };
  const cb = _cb();
  const r = cb.createCompartment({ name: cb.uniqueName(`${canvas.name}--${slug}`), purpose: `tool ${label} (${domain}/${category}) on canvas ${manifest.name}`, runtimeId: 'html', networkIsolated: true, parentId: canvas.id });
  if (!r.ok) return { ok: false, error: r.error };
  const child = r.compartment, troot = child.fs.root;
  const archetype = sound ? 'eravos-sound-tool' : 'eravos-tool';
  const laid = _ftp().fromCosTemplate(`cos-archetype:${archetype}`, { name: label, vars: { slug, domain, category } });
  if (!laid.ok) return { ok: false, error: (laid.errors || []).join('; ') };
  _write(troot, laid.files);
  // the category's own file, in the canvas (his new-tool.mjs writes it once per category)
  const catJson = path.join(root, 'tools', domain, 'tools', category, 'category.json');
  if (!fs.existsSync(catJson)) {
    const v = _eravos().toolVars({ slug, domain, category, name: label });
    fs.mkdirSync(path.dirname(catJson), { recursive: true });
    fs.writeFileSync(catJson, fs.readFileSync(path.join(root, 'templates', 'category', 'category.json'), 'utf8').split('__CATEGORY_LABEL__').join(v.categoryLabel).split('__CATEGORY__').join(category));
  }
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(troot, link, process.platform === 'win32' ? 'junction' : 'dir');
  cb.mountPath(canvas.id, { path: troot, role: 'tool', writable: true });
  const spec = laid.files.find(f => f.path.endsWith('.spec'));
  const tj = JSON.parse(laid.files.find(f => f.path === 'tool.json').content);
  const tool = { slug, label, id: tj.id, domain, category, archetype, compartmentId: child.id, compartment: child.name, root: troot,
    linkedAt: `tools/${domain}/tools/${category}/${slug}`, acceptance: _eravos().acceptance(spec && spec.content), addedAt: Date.now() };
  manifest.tools.push(tool);
  _writeManifest(root, manifest);
  const L = loaders ? _loaders(root, manifest) : null;
  return { ok: true, tool, ...(L ? { domains: L.domains } : {}) };
}

/** show(canvas) → { ok, canvas, tree, tools: [{ …, linked }] } */
function show(canvasNameOrId) {
  const K = _canvas(canvasNameOrId);
  if (K.error) return { ok: false, error: K.error };
  const tree = _cb().tree(K.compartment.id);
  const tools = K.manifest.tools.map(t => { let linked = false; try { linked = fs.realpathSync(path.join(K.root, t.linkedAt)) === fs.realpathSync(t.root); } catch (_) {} return { ...t, linked }; });
  return { ok: true, canvas: { id: K.compartment.id, name: K.compartment.name, title: K.manifest.name, description: K.manifest.description, root: K.root }, tree, tools };
}

/** list() → every compartment that is a canvas */
function list() {
  return _cb().listCompartments().filter(c => c.fs && c.fs.root && fs.existsSync(path.join(c.fs.root, MANIFEST)))
    .map(c => { const m = _readManifest(c.fs.root) || {}; return { id: c.id, name: c.name, title: m.name || c.name, tools: (m.tools || []).length }; });
}

module.exports = { MODULE_ID, VERSION, MANIFEST, create, addTool, show, list };
