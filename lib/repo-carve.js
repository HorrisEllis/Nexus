'use strict';
/**
 * lib/repo-carve.js — CV1: branch a part of Nexus into its own Idearium repo. The files named, everything they require, and a
 * record of why each one came along. Nothing in Nexus moves or is deleted (§0.3); the carve is a copy you can make again.
 * comp_id: nexus.lib.repo-carve
 * Map: docs/2026-10-16-repo-carve-phasemap.spec (CV1_carve_backend_route_command_ui)
 *
 * James, 2026-10-16: "look at rfr2. versionium. event ledgers. causal graph. cos test env. its a product?" · then: "can you
 * branch it into a idearium repo?" (The product reading and the working name are the coder's, to confirm.)
 *
 * Reuse (§8.6): the repo is made by Idearium's repo.ingest, and a require resolves the way lib/phase-map-auto.js envFromTree
 * resolves it (same candidates: the path, .js/.cjs/.mjs, /index.js). The tree scanner itself is not used for the closure: it
 * counts a require written in a comment (right for mapping a phase, wrong for a copy: it would carry files nothing loads; found
 * by CV-01). This module adds what neither says: which npm packages, which requires resolve to nothing, what pulled each file in.
 *
 *   plan({ root, seeds }) → { ok, seeds, files: [{ path, pulledBy }], npm: { name: version }, npmNamedOnly, missing: [{ from, spec }],
 *                                   bySystem, lines, bytes } | { ok:false, error }
 *   build(plan, { root, name, version, commit, quote }) → [{ path, content }]   the files plus package.json, CARVED.json, README.md
 *   PRESETS                                                                       named seed lists (flight_recorder)
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.repo-carve';
const VERSION = '1.0.0';
const LIMITS = Object.freeze({ files: 2000, bytes: 40 * 1024 * 1024 });
const SKIP_DIRS = new Set(['node_modules', 'data', '.git', '_archive', 'dist']);
const SRC = /\.(js|cjs|mjs|json)$/;
const BUILTIN = new Set(require('module').builtinModules.map(m => m.replace(/^node:/, '').split('/')[0]));
const REQ = /(?:require\(\s*|import\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;

const PRESETS = Object.freeze({
  flight_recorder: {
    name: 'flight-recorder',
    why: 'an undo button and flight recorder for AI coding agents: tested in a throwaway env, versioned, causally recorded, replayable',
    seeds: ['versionium', 'intelligence/rfr2', 'intelligence/causal', 'cos/testenv', 'cos/compartment',
      'lib/code-edit.js', 'lib/repo-history.js', 'lib/repo-inject.js', 'lib/repo-versions.js', 'lib/activity-log', 'lib/diagnostic-causal.js'],
  },
});

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
function _safe(root, rel) {
  const r = norm(rel);
  if (!r || r.startsWith('/') || /^[A-Za-z]:/.test(r) || r.split('/').includes('..')) return null;
  const abs = path.resolve(root, r);
  return abs === path.resolve(root) || abs.startsWith(path.resolve(root) + path.sep) ? r : null;
}

function _walk(root, rel, out) {
  const abs = path.join(root, rel);
  let st; try { st = fs.statSync(abs); } catch (_) { return false; }
  if (st.isFile()) { out.push(rel); return true; }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) _walk(root, r, out); else if (SRC.test(e.name) || /\.(md|spec|ya?ml|html|css)$/.test(e.name)) out.push(r);
  }
  return true;
}

/** what a file requires, comments left out: local files (resolved), npm packages, and relative ones that point at nothing */
function _outside(root, rel, text, resolved) {
  const npm = [], missing = [], local = [];
  const code = text.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');   // a comment loads nothing
  for (const m of code.matchAll(REQ)) {
    const s = m[1];
    if (s.startsWith('.')) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), s));
      if (base === '..' || base.startsWith('../')) { missing.push(s); continue; }   // above Nexus: never read
      const hit = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}/index.js`].find(c => resolved.has(c) || fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile());
      if (hit) { if (hit !== rel && !local.includes(hit)) local.push(hit); } else missing.push(s);
    } else if (!s.startsWith('/') && !s.includes('${')) {
      const name = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
      if (!BUILTIN.has(name.replace(/^node:/, '')) && !name.startsWith('node:')) npm.push(name);
    }
  }
  return { npm, missing, local };
}

function plan({ root, seeds = [] } = {}) {
  if (!root) return { ok: false, error: 'root required' };
  const list = (Array.isArray(seeds) ? seeds : [seeds]).map(String).filter(Boolean);
  if (!list.length) return { ok: false, error: 'name at least one file or folder to carve' };
  const start = [];
  for (const s of list) {
    const r = _safe(root, s);
    if (!r) return { ok: false, error: `"${s}" is not a path inside Nexus` };
    if (!_walk(root, r, start)) return { ok: false, error: `"${s}" does not exist in Nexus` };
  }
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch (_) {}
  const pins = { ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}), ...(pkg.dependencies || {}) };

  const pulledBy = new Map(); const queue = [];
  for (const f of start) if (!pulledBy.has(f)) { pulledBy.set(f, null); queue.push(f); }
  const npm = new Map(), missing = []; let bytes = 0;
  while (queue.length) {
    const f = queue.shift();
    if (pulledBy.size > LIMITS.files) return { ok: false, error: `the carve passed ${LIMITS.files} files: name a smaller part` };
    let text = ''; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    bytes += Buffer.byteLength(text);
    if (bytes > LIMITS.bytes) return { ok: false, error: `the carve passed ${LIMITS.bytes / 1048576} MB: name a smaller part` };
    if (!/\.(js|cjs|mjs)$/.test(f)) continue;
    const o = _outside(root, f, text, pulledBy);
    const next = o.local;
    for (const r of next) if (!pulledBy.has(r)) { pulledBy.set(r, f); queue.push(r); }
    for (const n of o.npm) if (!npm.has(n)) npm.set(n, pins[n] || null);
    for (const s of o.missing) if (!missing.some(m => m.from === f && m.spec === s)) missing.push({ from: f, spec: s });
  }
  const files = [...pulledBy].map(([p, by]) => ({ path: p, pulledBy: by })).sort((a, b) => a.path.localeCompare(b.path));
  const bySystem = {}; let lines = 0;
  for (const f of files) {
    const k = f.path.includes('/') ? f.path.split('/')[0] : '(root)';
    bySystem[k] = (bySystem[k] || 0) + 1;
    try { lines += fs.readFileSync(path.join(root, f.path), 'utf8').split('\n').length; } catch (_) {}
  }
  // a package Nexus installs is a dependency; one only named in the code (a string COS's test detection looks for, say) is listed, not installed
  const all = [...npm].sort();
  return { ok: true, version: VERSION, seeds: list, files, seeded: start.length, pulledIn: files.length - start.length,
    npm: Object.fromEntries(all.filter(([, v]) => v)), npmNamedOnly: all.filter(([, v]) => !v).map(([n]) => n), missing, bySystem, lines, bytes };
}

function build(p, { root, name, nexusVersion = null, commit = null, quote = null, why = null } = {}) {
  const out = p.files.map(f => ({ path: f.path, content: fs.readFileSync(path.join(root, f.path), 'utf8') }));
  const dependencies = { ...p.npm };
  out.push({ path: 'package.json', content: JSON.stringify({ name, version: '0.1.0', private: true, description: why || `carved from Nexus ${nexusVersion || ''}`.trim(), dependencies }, null, 2) + '\n' });
  out.push({ path: 'CARVED.json', content: JSON.stringify({ carvedFrom: 'nexus', nexusVersion, commit, at: new Date().toISOString(), seeds: p.seeds, npmNamedOnly: p.npmNamedOnly || [],
    counts: { files: p.files.length, seeded: p.seeded, pulledIn: p.pulledIn, lines: p.lines }, bySystem: p.bySystem, npm: p.npm, missing: p.missing,
    files: p.files }, null, 2) + '\n' });
  const sys = Object.entries(p.bySystem).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  out.push({ path: 'README.md', content: [
    `# ${name}`, '',
    ...(quote ? [`James: ${quote}`, ''] : []),
    ...(why ? [why, ''] : []),
    `Carved from Nexus ${nexusVersion || ''}${commit ? ` at ${String(commit).slice(0, 12)}` : ''}. Nothing was moved out of Nexus; this is a copy that can be made again.`, '',
    `- Seeds: ${p.seeds.join(', ')}`,
    `- ${p.files.length} files (${p.seeded} named, ${p.pulledIn} pulled in by their requires), ${p.lines} lines`,
    `- By system: ${sys}`,
    `- npm: ${Object.keys(p.npm).join(', ') || 'none'}${(p.npmNamedOnly || []).length ? ` (named in the code but not installed by Nexus: ${p.npmNamedOnly.join(', ')})` : ''}`,
    `- Requires that resolve to nothing: ${p.missing.length}${p.missing.length ? ` (${p.missing.slice(0, 5).map(m => `${m.from} → ${m.spec}`).join('; ')})` : ''}`, '',
    'CARVED.json lists every file with the file whose require pulled it in. Files from systems other than the seeds are the',
    'tangle to cut next (docs/2026-10-16-repo-carve-phasemap.spec CV2, with the refactor tool RF0–RF2).', '',
  ].join('\n') });
  return out;
}

module.exports = { MODULE_ID, VERSION, LIMITS, PRESETS, plan, build };
