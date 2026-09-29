/**
 * idearium/repo/living-spec.js — a repo's living model: the .spec files of its spec folder (0.39.271 S1).
 * UUID: nexus-idearium-repo-living-spec-v1-0000-2026-0927-jamesbrooks-001
 * comp_id: nexus.idearium.repo.living-spec
 * Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (S1)
 *
 * James: "the spec tab is for the .spec in the spec folder, the living model."
 * docs/architecture-spec/architecture-spec.spec (SPEC_IS_LIVING_MODEL): a .spec is
 * edited in place as the real system changes, with version_history as the audit
 * trail and dated addenda for drift. Before this the Spec tab showed a nexus
 * system's spec files as a bare list, and every other repo's spec-engine chunk
 * manifest (the build plan, not the model).
 *
 * WHICH files (read, never guessed):
 *   a nexus system  → nexus-self specsFor(system): its spec/ dir (core: docs/ and
 *                     architecture-spec/) from the immutable base — phasemaps left
 *                     out (they are the Phases tab); primary <dir>/spec/<name>.spec,
 *                     for core the architecture spec.
 *   all of NEXUS    → every system's primary spec, architecture spec first.
 *   any other repo  → every *.spec under a spec/ or specs/ folder, plus root *.spec,
 *                     read from the repo's own directory; phasemaps left out.
 *
 * parseSpec(text) — js-yaml when it loads (a spec that is not valid YAML says where
 * it breaks, §1.2, and is still shown); the living-model parts are pulled out: meta,
 * each top-level section with its shape, version_history, gaps, and the addenda
 * (comment banners `# ── ADDENDUM …` / `## ADDENDUM …` with their text).
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const MODULE_ID = 'nexus-idearium-repo-living-spec-v1-0000-2026-0927-jamesbrooks-001';
const MAX_BYTES = 2 * 1024 * 1024;
const isPhasemap = (p) => /phase-?map.*\.spec$/.test(String(p).split('/').pop());
let _yaml = null;
try { _yaml = require('js-yaml'); } catch (_) { /* parse falls back to the regex reader */ }

function _title(text) {
  const m = String(text).slice(0, 4000).match(/^\s*(?:name|title|spec|id)\s*:\s*["']?([^\n"']+)/mi) || String(text).match(/^#\s+(.+)$/m);
  return m ? m[1].trim().slice(0, 160) : null;
}

/** listSpecs({ repo, repoDir }) -> { scope, specs:[{path,bytes,title,system?}], primary, error? } */
export async function listSpecs({ repo, repoDir }) {
  const ns = repo && repo.nexusSelf;
  if (ns && (ns.role === 'system' || ns.role === 'parent')) {
    const NS = await import('./nexus-self.js');
    const systems = require('../../lib/nexus-self/systems.js');
    if (ns.role === 'system') {
      const r = NS.specsFor(ns.system);
      const specs = (r.specs || []).filter(s => !isPhasemap(s.path)).map(s => ({ path: s.path, bytes: s.bytes, title: s.title, system: ns.system }));
      const s = systems.get(ns.system) || { dirs: [] };
      const want = ns.system === 'core' ? ['docs/architecture-spec/architecture-spec.spec'] : (s.dirs || []).map(d => `${d}/spec/${d.split('/').pop()}.spec`);
      const primary = (specs.find(x => want.includes(x.path)) || specs.find(x => /\/spec\/[^/]+\.spec$/.test(x.path)) || specs[0] || {}).path || null;
      return { scope: 'nexus-system', specs, primary };
    }
    // all of NEXUS: each system's primary spec
    const specs = [];
    for (const name of systems.names()) {
      const r = NS.specsFor(name);
      const list = (r.specs || []).filter(s => !isPhasemap(s.path));
      const s = systems.get(name) || { dirs: [] };
      const want = name === 'core' ? ['docs/architecture-spec/architecture-spec.spec'] : (s.dirs || []).map(d => `${d}/spec/${d.split('/').pop()}.spec`);
      const hit = list.find(x => want.includes(x.path));
      if (hit) specs.push({ path: hit.path, bytes: hit.bytes, title: hit.title, system: name });
    }
    specs.sort((a, b) => (a.system === 'core') ? -1 : (b.system === 'core') ? 1 : a.system.localeCompare(b.system));
    return { scope: 'nexus-all', specs, primary: (specs[0] || {}).path || null };
  }
  // any other repo — its own spec folder(s)
  const paths = new Set();
  for (const f of (repo && repo.files) || []) {
    const p = f && f.path; if (typeof p !== 'string' || !p.endsWith('.spec') || isPhasemap(p)) continue;
    if (/(^|\/)specs?\//.test(p) || !p.includes('/')) paths.add(p);
  }
  if (repoDir && fs.existsSync(repoDir)) {
    const walk = (dir, rel, depth) => {
      if (depth > 6) return;
      let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        if (e.name.startsWith('.') || ['node_modules', 'data', 'indexes', 'chunks', 'dist', 'build'].includes(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r, depth + 1);
        else if (e.name.endsWith('.spec') && !isPhasemap(r) && (/(^|\/)specs?\//.test(r) || !rel)) paths.add(r);
      }
    };
    walk(repoDir, '', 0);
  }
  const specs = [];
  for (const p of [...paths].sort()) {
    let bytes = null, title = null;
    try { const abs = path.join(repoDir, p); const st = fs.statSync(abs); bytes = st.size; title = _title(fs.readFileSync(abs, 'utf8').slice(0, 4000)); } catch (_) {}
    specs.push({ path: p, bytes, title });
  }
  const base = String(repo && repo.name || '').split('/').pop().toLowerCase();
  const primary = (specs.find(s => s.path.toLowerCase().endsWith(`spec/${base}.spec`)) || specs.find(s => /(^|\/)specs?\//.test(s.path)) || specs[0] || {}).path || null;
  return { scope: 'repo', specs, primary };
}

/** readSpec({ repo, repoDir, specPath }) -> { path, text, bytes, parsed } | { error } */
export async function readSpec({ repo, repoDir, specPath }) {
  const list = await listSpecs({ repo, repoDir });
  const hit = list.specs.find(s => s.path === specPath);
  if (!hit) return { error: `${specPath} is not one of this repo's spec files` };
  let text;
  const ns = repo && repo.nexusSelf;
  if (ns && (ns.role === 'system' || ns.role === 'parent')) {
    const NS = await import('./nexus-self.js');
    const r = NS.fileText(specPath);
    if (r.error) return { error: r.error };
    text = r.content;
  } else {
    const root = path.resolve(repoDir); const abs = path.resolve(root, specPath);
    if (abs !== root && !abs.startsWith(root + path.sep)) return { error: 'path outside the repo' };
    try { const st = fs.statSync(abs); if (st.size > MAX_BYTES) return { error: `over the ${MAX_BYTES}-byte limit` }; text = fs.readFileSync(abs, 'utf8'); }
    catch (e) { return { error: e.message }; }
  }
  return { path: specPath, bytes: Buffer.byteLength(text), system: hit.system || null, text, parsed: parseSpec(text) };
}

function _shape(v) {
  if (Array.isArray(v)) return { kind: 'list', size: v.length };
  if (v && typeof v === 'object') return { kind: 'map', size: Object.keys(v).length, keys: Object.keys(v).slice(0, 40) };
  return { kind: typeof v, size: String(v ?? '').length };
}

/** parseSpec(text) -> { ok, error, root, meta, sections, versionHistory, gaps, addenda, lines } */
export function parseSpec(text) {
  const src = String(text || '');
  const lines = src.split('\n');
  const out = { ok: false, error: null, root: null, meta: null, sections: [], versionHistory: [], gaps: [], addenda: [], lines: lines.length };

  // addenda: comment banners, with the comment lines that follow them
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*#+\s*(?:[─—=-]+\s*)?(.*\bADDENDUM\b.*?)\s*[─—=-]*\s*$/i);
    if (!m) continue;
    const body = [];
    for (let k = i + 1; k < lines.length && k < i + 60; k++) {
      const c = lines[k].match(/^\s*#\s?(.*)$/);
      if (!c) break;
      if (/\bADDENDUM\b/i.test(c[1])) break;
      body.push(c[1]);
    }
    const date = (m[1].match(/\b(20\d\d-\d\d-\d\d)\b/) || [])[1] || null;
    out.addenda.push({ line: i + 1, title: m[1].replace(/[─—=]+/g, '').trim(), date, text: body.join('\n').trim().slice(0, 3000) });
  }

  let doc = null;
  if (_yaml) {
    try { doc = _yaml.load(src); out.ok = true; }
    catch (e) { out.error = { message: String(e.reason || e.message).split('\n')[0], line: e.mark ? e.mark.line + 1 : null }; }
  } else out.error = { message: 'js-yaml is not installed — shown as text', line: null };

  if (doc && typeof doc === 'object') {
    const rootKey = Object.keys(doc).length === 1 ? Object.keys(doc)[0] : null;
    const body = rootKey && doc[rootKey] && typeof doc[rootKey] === 'object' ? doc[rootKey] : doc;
    out.root = rootKey;
    out.meta = body.meta && typeof body.meta === 'object' ? body.meta : null;
    for (const [k, v] of Object.entries(body)) out.sections.push({ key: k, ..._shape(v), value: v });
    const vh = body.version_history || body.history || (out.meta && out.meta.version_history);
    if (Array.isArray(vh)) out.versionHistory = vh.slice(-80);
    else if (vh && typeof vh === 'object') out.versionHistory = Object.entries(vh).map(([version, v]) => (v && typeof v === 'object' ? { version, ...v } : { version, note: v })).slice(-80);
    const g = body.gaps || body.open_gaps || body.known_gaps;
    if (Array.isArray(g)) out.gaps = g.slice(0, 200);
    else if (g && typeof g === 'object') out.gaps = Object.entries(g).map(([id, v]) => (v && typeof v === 'object' ? { id, ...v } : { id, note: v })).slice(0, 200);
  } else {
    // not YAML (or not loaded): the top-level keys by indentation, so the tab still has a shape
    const top = lines.map((l, i) => ({ l, i })).filter(x => /^\s{0,2}[A-Za-z_][\w-]*:/.test(x.l));
    out.sections = top.slice(0, 60).map(x => ({ key: x.l.trim().split(':')[0], kind: 'text', size: 0, line: x.i + 1 }));
    const g = (k) => (src.match(new RegExp(`^\\s{2,6}${k}:\\s*["']?([^\\n"']+)`, 'm')) || [])[1] || null;
    out.meta = { name: g('name'), version: g('version'), status: g('status'), uuid: g('uuid') };
  }
  return out;
}
