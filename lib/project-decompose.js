'use strict';
/**
 * lib/project-decompose.js — a whole project → components in the component store, each one packable with its
 * dependencies as one organized zip.
 * component_id: lib.project-decompose
 *
 * James, 2026-10-13: "i want to be able to copy projects and decompose them into components for the component store
 * with the dependancies zipped together in a organized structured way. like make a tool for it, as well as a way to
 * drag and drop zips to do it automatically."
 *
 * Reuse, not a second store (§8.6): lib/component-store.js already keeps one file as one component — content-addressed,
 * versioned, its relative requires resolved to other components (pinned at the version it was stored with) and its
 * npm packages named — and closure(id) walks its dependencies. What it never had is a way to take a WHOLE project in.
 *
 *   decompose({ files, project })      every code file put in the store (order does not matter: a require stored
 *                                      before its target is pinned when the target arrives — component-store's
 *                                      _pinPending); the project's package.json versions kept beside the store so a
 *                                      bundle can name them. → { project, components[], skipped[], npm, stats }
 *   fromZip(buf, project)              a dropped .zip → files (lib/zip-ingest.js, the importer's own bounds) → decompose
 *   fromDir(dir, project)              a folder on disk (node_modules, .git and build output skipped) → decompose
 *   bundle(ref)                        one component and every component it requires, as a zip:
 *                                        <name>/component.json  the root's manifest + the closure, versions pinned
 *                                        <name>/<path>          each file at its project path, so its requires still resolve
 *                                        <name>/package.json    the npm packages the closure uses, at the project's versions
 *                                        <name>/README.md       what it is, what it needs, how to require it
 *                                      → { filename, buffer, files, closure }
 * Nothing here runs a project's code; only text is read.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'lib.project-decompose';
const VERSION = '1.0.0';
const CODE_EXT = /\.(?:[cm]?js|jsx|ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache', 'vendor']);
const MAX_FILE = 512 * 1024;
const MAX_FILES = 4000;

function _cs() { return require('./component-store.js'); }
const _slug = (s) => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
const _norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');

function _projectsFile() { return path.join(_cs().storeDir(), 'projects.json'); }
function _projects() { try { return JSON.parse(fs.readFileSync(_projectsFile(), 'utf8')); } catch (_) { return {}; } }
function _saveProject(slug, rec) {
  const all = _projects(); all[slug] = { ...(all[slug] || {}), ...rec };
  fs.mkdirSync(path.dirname(_projectsFile()), { recursive: true });
  const tmp = `${_projectsFile()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n'); fs.renameSync(tmp, _projectsFile());
}

/** the common top folder a zip of a project usually has (my-app/src/…): stripped so paths start at the project */
function _stripCommonRoot(files) {
  const firsts = new Set(files.map(f => _norm(f.path).split('/')[0]));
  if (firsts.size !== 1 || files.some(f => !_norm(f.path).includes('/'))) return files;
  const root = [...firsts][0] + '/';
  return files.map(f => ({ ...f, path: _norm(f.path).slice(root.length) }));
}

/**
 * decompose({ files: [{ path, content }], project }) — every code file into the store.
 */
function decompose({ files = [], project } = {}) {
  if (!project) throw Object.assign(new Error('project (a name) is required'), { status: 400 });
  const CS = _cs();
  const slug = _slug(project);
  const list = _stripCommonRoot(files.filter(f => f && f.path));
  const components = [], skipped = [];
  let npmVersions = {};
  const pkg = list.find(f => _norm(f.path) === 'package.json');
  if (pkg) { try { const j = JSON.parse(pkg.content); npmVersions = { ...(j.peerDependencies || {}), ...(j.devDependencies || {}), ...(j.dependencies || {}) }; } catch (_) { skipped.push({ path: 'package.json', why: 'not valid JSON' }); } }
  for (const f of list) {
    const rel = _norm(f.path);
    if (rel.split('/').some(seg => SKIP_DIRS.has(seg))) { skipped.push({ path: rel, why: 'dependency or build folder' }); continue; }
    if (!CODE_EXT.test(rel)) continue;
    if (typeof f.content !== 'string' || !f.content.trim()) { skipped.push({ path: rel, why: 'empty' }); continue; }
    if (f.truncated) { skipped.push({ path: rel, why: 'too large to store whole' }); continue; }
    try { const r = CS.put({ project: slug, path: rel, content: f.content, builtBy: { via: MODULE_ID } }); components.push({ id: r.id, version: r.version, path: rel, created: r.created }); }
    catch (e) { skipped.push({ path: rel, why: e.message }); }
  }
  // the dependency picture after every file is in (a require put before its target was pinned when the target arrived)
  const out = components.map(c => { const m = CS.manifest(c.id, c.version) || {}; return { ...c, dependencies: Object.keys(m.dependencies || {}).length, unresolved: (m.unresolved || []).map(u => u.spec), npm: m.npm || [] }; });
  const npm = [...new Set(out.flatMap(c => c.npm))].sort();
  _saveProject(slug, { name: project, npmVersions, components: out.length, decomposedAt: new Date().toISOString() });
  return { project: slug, components: out, skipped, npm, npmVersions,
    stats: { files: list.length, components: out.length, created: out.filter(c => c.created).length, unresolved: out.reduce((n, c) => n + c.unresolved.length, 0), skipped: skipped.length } };
}

/** fromZip(buf, project) — a dropped .zip (the importer's own extraction and bounds) */
function fromZip(buf, project) {
  const { extractZipToFiles } = require('./zip-ingest.js');
  const r = extractZipToFiles({ buf, maxFiles: MAX_FILES, maxBytesPerFile: MAX_FILE, maxTotalBytes: 64 * 1024 * 1024, realFiles: false, includeBinary: false });
  if (!r.ok) throw Object.assign(new Error(r.error || 'the zip could not be read'), { status: 400 });
  const out = decompose({ files: r.included, project });
  return { ...out, zip: { entries: r.stats.entries, omitted: r.omitted.length } };
}

/** fromDir(dir, project) — a folder on disk */
function fromDir(dir, project) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw Object.assign(new Error(`no folder at ${dir}`), { status: 400 });
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(d, e.name)); continue; }
      const abs = path.join(d, e.name), rel = path.relative(root, abs).split(path.sep).join('/');
      if (!(CODE_EXT.test(rel) || rel === 'package.json')) continue;
      const st = fs.statSync(abs);
      files.push({ path: rel, content: st.size > MAX_FILE ? '' : fs.readFileSync(abs, 'utf8'), truncated: st.size > MAX_FILE });
    }
  })(root);
  return decompose({ files, project: project || path.basename(root) });
}

/** bundle(ref) — the component and its whole require closure as one organized zip */
function bundle(ref, { version = null } = {}) {
  const CS = _cs();
  const g = CS.get(ref, version);
  if (!g) throw Object.assign(new Error(`no stored component ${ref}`), { status: 404 });
  const closure = CS.closure(g.id, g.version);
  const name = `${g.manifest.namespace}-${path.posix.basename(g.manifest.path).replace(/\.(?:[cm]?js|jsx|ts|tsx)$/, '')}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const proj = _projects()[g.manifest.namespace] || {};
  const files = [], npm = new Set(), items = [];
  for (const c of closure) {
    const m = CS.manifest(c.id, c.version);
    const got = CS.get(c.id, c.version);
    if (!m || !got) continue;
    files.push({ path: `${name}/${m.path}`, content: got.content });
    (m.npm || []).forEach(p => npm.add(p));
    items.push({ id: m.id, version: m.version, path: m.path, purpose: m.purpose || null, unresolved: (m.unresolved || []).map(u => u.spec) });
  }
  const deps = Object.fromEntries([...npm].sort().map(p => [p, (proj.npmVersions || {})[p] || '*']));
  const root = items[0] || { path: g.manifest.path };
  const manifestOut = { format: 'nexus.component-bundle/1', root: { id: g.id, version: g.version, path: g.manifest.path, purpose: g.manifest.purpose || null },
    project: g.manifest.namespace, closure: items, npm: deps, bundledAt: new Date().toISOString() };
  files.push({ path: `${name}/component.json`, content: JSON.stringify(manifestOut, null, 2) + '\n' });
  files.push({ path: `${name}/package.json`, content: JSON.stringify({ name, version: g.version, private: true, main: root.path, dependencies: deps }, null, 2) + '\n' });
  const unresolved = items.flatMap(i => i.unresolved.map(u => `${i.path} → ${u}`));
  files.push({ path: `${name}/README.md`, content: [
    `# ${name}`, '', ...(g.manifest.purpose ? [g.manifest.purpose, ''] : []),
    `From project **${g.manifest.namespace}**, \`${g.manifest.path}\` (version ${g.version}).`, '',
    `## What is in here`, '', ...items.map(i => `- \`${i.path}\`${i.id === g.id ? ' — the component' : ''}`), '',
    `## Needs`, '', Object.keys(deps).length ? Object.entries(deps).map(([p, v]) => `- ${p} ${v}`).join('\n') : '- nothing from npm', '',
    unresolved.length ? `## Not found when it was stored\n\n${unresolved.map(u => `- ${u}`).join('\n')}\n` : '',
    `## Use`, '', '```js', `const m = require('./${name}/${root.path.replace(/\.(?:[cm]?js|jsx|ts|tsx)$/, '')}');`, '```', '',
  ].filter(x => x !== null).join('\n') });
  const { createZip } = require('./zip-writer.js');
  return { filename: `${name}-${g.version}.zip`, buffer: createZip(files.map(f => ({ path: f.path, content: f.content }))), files: files.map(f => f.path), closure: items.map(i => i.id) };
}

/** projects() — the projects decomposed so far, with their npm versions */
function projects() { return _projects(); }

module.exports = { MODULE_ID, VERSION, decompose, fromZip, fromDir, bundle, projects };
