'use strict';
/**
 * lib/project-spine.js — a project's component registry as its spine: every component, every wire, and where each wire came from.
 * comp_id: nexus.lib.project-spine
 * UUID: nexus-lib-project-spine-v1-0000-2026-1029-jamesbrooks-001
 * Spec: docs/project-spine.spec MOD-SPINE · Map: docs/2026-10-29-finish-any-project-phasemap.spec FA2
 *
 * James, 2026-10-29: "refactor tool for the architecture to use the component registry as the spine, decomposition tool for breaking
 * up each component into it's own file and wire it into the spine." The coder's reading (FA_D2, to confirm) is IN3, his plan of
 * 2026-10-19, carried to every project: one registry file per project, nexus.spine.json at its root, names every component and every
 * wire; refactors are asked of it by component id (lib/project-refactor.js); after any change it is checked against the code.
 *
 * Reuse (§8.6, NC0): the adapters (lib/adapters/*) read each file; require resolution is Node's (the path, .js/.cjs/.mjs/.json,
 * /index.js — as lib/repo-carve.js resolves). Evidence on every wire: discovered:<adapter>, declared:<by>, or unknown.
 *
 *   scan({ files: [{ path, content }], project })  → Spine
 *   merge(old, next)                               → next with old's declared edges carried over
 *   check(spine, files)                            → { ok, added, gone, wiresAdded, wiresGone }
 *   text(spine)                                    → nexus.spine.json (stable: sorted)
 */

const path = require('path');
const { builtinModules } = require('module');
const A = require('./adapters/contract.js');

const MODULE_ID = 'nexus.lib.project-spine';
const VERSION = '1.0.0';
const SPINE_FILE = 'nexus.spine.json';
const SKIP = /(^|\/)(node_modules|\.git|_archive)\//;
const BUILTIN = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);

function componentId(project, p) {
  const base = String(p).replace(/\\/g, '/').replace(/\.[^./]+$/, '').replace(/[^A-Za-z0-9_/.-]+/g, '_').replace(/\//g, '.');
  return `${String(project || 'project').replace(/[^A-Za-z0-9_-]+/g, '-')}.${base}`;
}

/** resolve(fromPath, spec, paths) → the repo path a relative require/use/link reaches, or null */
function resolve(fromPath, spec, paths) {
  const s = String(spec || '');
  const has = paths instanceof Set ? (p) => paths.has(p) : (p) => paths.includes(p);
  const dir = path.posix.dirname(String(fromPath).replace(/\\/g, '/'));
  const tryAll = (base) => {
    for (const c of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}.ts`, `${base}/index.js`, `${base}/index.mjs`]) if (has(c)) return c;
    return null;
  };
  if (/^\.{1,2}\//.test(s)) return tryAll(path.posix.normalize(path.posix.join(dir, s)));
  if (s.startsWith('/')) return tryAll(s.slice(1));
  return null;
}

function _isPackage(spec) { return !/^[./]/.test(spec) && !BUILTIN.has(spec) && /^(@[\w.-]+\/)?[\w.-]+/.test(spec); }
function _pkgName(spec) { const m = /^(@[\w.-]+\/[\w.-]+|[\w.-]+)/.exec(spec); return m ? m[1] : spec; }

/** scan({ files, project }) → the Spine. files: [{ path, content }] — the repo's text files */
function scan({ files = [], project = 'project' } = {}) {
  const list = files.filter(f => f && f.path && !SKIP.test(String(f.path).replace(/\\/g, '/'))).map(f => ({ path: String(f.path).replace(/\\/g, '/'), content: f.content }));
  const paths = new Set(list.map(f => f.path));
  const components = new Map();
  const wires = []; const npm = new Set(); const problems = []; let unknown = 0;
  const addComponent = (p, adapter, extra = {}) => {
    if (!components.has(p)) components.set(p, { id: componentId(project, p), path: p, name: path.posix.basename(p).replace(/\.[^.]+$/, ''), language: adapter ? adapter.language : 'unknown', adapter: adapter ? adapter.id : 'unknown', exports: [], units: 0, declared: [], ...extra });
    return components.get(p);
  };
  for (const f of list) {
    const ad = A.forFile(f.path);
    if (!ad) continue;
    if (typeof f.content !== 'string') { problems.push(`${f.path}: not read as text`); continue; }
    const c = addComponent(f.path, ad);
    try { c.exports = ad.symbols(f.content, f.path) || []; } catch (e) { problems.push(`${f.path}: symbols — ${e.message}`); }
    try { c.units = ad.units(f.content, f.path).length; } catch (e) { problems.push(`${f.path}: units — ${e.message}`); }
    let deps = [];
    try { deps = ad.dependencies(f.content, f.path); } catch (e) { problems.push(`${f.path}: dependencies — ${e.message}`); }
    const seen = new Set();
    for (const d of deps) {
      if (ad.id === 'javascript' && !/^[./]/.test(d.spec)) { if (_isPackage(d.spec)) npm.add(_pkgName(d.spec)); continue; }
      let to = resolve(f.path, d.spec, paths);
      let evidence = `discovered:${ad.id}`;
      if (!to && ad.id === 'documents') {
        // a document names files loosely: from the repo's root, or by a unique tail
        const s = d.spec.replace(/^\.\//, '');
        if (paths.has(s)) to = s;
        else { const tail = [...paths].filter(p => p.endsWith(`/${s}`)); if (tail.length === 1) { to = tail[0]; evidence = 'discovered:documents (by name)'; } }
        if (!to) continue;   // prose naming a file that is not in the repo (an example path) is not a wire
      }
      const key = `${to || d.spec}|${d.kind}`; if (seen.has(key)) continue; seen.add(key);
      if (to) { if (!components.has(to)) addComponent(to, A.forFile(to)); wires.push({ from: c.id, fromPath: f.path, to: componentId(project, to), toPath: to, kind: d.kind === 'link' || d.kind === 'reference' ? 'reference' : d.kind, evidence, spec: d.spec, line: d.line }); }
      else { unknown++; wires.push({ from: c.id, fromPath: f.path, to: d.spec, toPath: null, kind: d.kind, evidence: 'unknown', spec: d.spec, line: d.line }); }
    }
  }
  const comps = [...components.values()].sort((a, b) => a.path.localeCompare(b.path));
  wires.sort((a, b) => a.fromPath.localeCompare(b.fromPath) || String(a.toPath || a.to).localeCompare(String(b.toPath || b.to)) || (a.line - b.line));
  return { project, version: 1, components: comps, wires, npm: [...npm].sort(), unknown, problems, scannedAt: new Date().toISOString(),
    stats: { components: comps.length, wires: wires.length, byAdapter: comps.reduce((m, c) => (m[c.adapter] = (m[c.adapter] || 0) + 1, m), {}) } };
}

/** merge(old, next) — old's declared edges (what code cannot show) carried over to the components that still exist */
function merge(old, next) {
  if (!old || !Array.isArray(old.components)) return next;
  const byPath = new Map(next.components.map(c => [c.path, c]));
  for (const oc of old.components) { const nc = byPath.get(oc.path); if (nc && Array.isArray(oc.declared) && oc.declared.length) nc.declared = oc.declared; }
  const ids = new Set(next.components.map(c => c.id));
  const declaredWires = (old.wires || []).filter(w => String(w.evidence || '').startsWith('declared') && ids.has(w.from));
  return { ...next, wires: [...next.wires, ...declaredWires] };
}

/** declare(spine, { from, to, kind, by }) — an edge the code cannot show (HTTP, spawn), kept in the registry next to its component */
function declare(spine, { from, to, kind = 'declared', by = 'james' } = {}) {
  const c = spine.components.find(x => x.id === from || x.path === from);
  if (!c) return { ok: false, error: `no component ${from}` };
  const w = { from: c.id, fromPath: c.path, to, toPath: (spine.components.find(x => x.id === to || x.path === to) || {}).path || null, kind, evidence: `declared:${by}`, spec: to };
  c.declared = [...(c.declared || []), { to, kind, by }];
  spine.wires.push(w);
  return { ok: true, wire: w };
}

const _wkey = (w) => `${w.fromPath}→${w.toPath || w.to}|${w.kind}`;

/** check(spine, files) — the registry against the code: what the code has that the spine lacks, and what the spine has that is gone */
function check(spine, files) {
  if (!spine || !Array.isArray(spine.components)) return { ok: false, error: 'no spine yet — write one first', added: [], gone: [], wiresAdded: [], wiresGone: [] };
  const now = scan({ files, project: spine.project });
  const had = new Set(spine.components.map(c => c.path)); const has = new Set(now.components.map(c => c.path));
  const hw = new Set(spine.wires.filter(w => !String(w.evidence).startsWith('declared')).map(_wkey)); const nw = new Set(now.wires.map(_wkey));
  const added = [...has].filter(p => !had.has(p)); const gone = [...had].filter(p => !has.has(p));
  const wiresAdded = [...nw].filter(k => !hw.has(k)); const wiresGone = [...hw].filter(k => !nw.has(k));
  return { ok: !added.length && !gone.length && !wiresAdded.length && !wiresGone.length, added, gone, wiresAdded, wiresGone, now: now.stats };
}

/** text(spine) — the file written at the repo's root; stable, so an unchanged tree writes the same bytes but for scannedAt */
function text(spine) {
  const out = { ...spine }; delete out.problems;
  return `${JSON.stringify(out, null, 2)}\n`;
}

function read(textOrNull) { try { return textOrNull ? JSON.parse(textOrNull) : null; } catch (_) { return null; } }

/** consumers(spine, path) — the components whose wires reach this path (who uses it) */
function consumers(spine, p) { return spine.wires.filter(w => w.toPath === p).map(w => ({ path: w.fromPath, spec: w.spec, line: w.line, kind: w.kind })); }

module.exports = { MODULE_ID, VERSION, SPINE_FILE, componentId, resolve, scan, merge, declare, check, text, read, consumers };
