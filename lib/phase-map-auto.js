'use strict';
/**
 * lib/phase-map-auto.js — MP1: every phase mapped to its files and dependencies by Nexus, with no model.
 * comp_id: nexus.lib.phase-map-auto
 *
 * James, 2026-10-15: "begin on the pipeline. The speccing, mapping, listener. It doesn't know how to map. Nexus needs to
 * generate dependancies for each phase, with files. The agent keeps having to find context, with tools. Need them all
 * mapped. Need that be automatic for every new phase from any project."
 *
 * Measured before building (Nexus, 2026-10-15): 898 open phases; 436 name their files; 196 more name real paths in their
 * own words; 266 name none. idearium/repo/phase-mapping.js (0.60.29) asks a model for all of them and writes only when
 * the model scores well — the cheap evidence was never used first. This reads it first (deterministic before any model,
 * docs/CLAUDE.md); a model is left only for phases with no evidence at all (MP4, the 0.60.29 flow).
 *
 * mapPhase(phase, env) → {
 *   files:    [{ path, why, exists }]  why: declared | named in the phase | defines <name> | names the module <w> | new
 *   requires: [{ path, by }]           what those files require (one hop)
 *   consumers:[{ path, of }]           who requires them (one hop) — what a change can break
 *   specs:    [path]                   declared specs, plus the specs that own the files (env.specsOf)
 *   source:   'declared' | 'evidence' | 'none'   — 'none' is the only case a model is asked (MP4)
 * }
 * mapPhases(phases, env) also adds phase → phase dependencies: a phase waits on the nearest earlier phase in its map that
 * changes a file it changes (lib/phase-files.js depsFor, hubs excluded), unless it declares its own depends_on.
 *
 * env (all optional; each a lookup, never a guess):
 *   exists(path) / dirExists(dir)   the repo's tree
 *   definedIn(name) → [path]        where a name is defined (code-intel definitions, or the tree scan below)
 *   filesNamed(word) → [path]       the files whose name is that word (used only when one or two carry it)
 *   requiresOf(path) → [path]       a file's local requires/imports
 *   consumersOf(path) → [path]      the files that require it
 *   specsOf(path) → [path]          the specs that own a file
 */
const fs = require('fs');
const path = require('path');
const PF = require('./phase-files.js');

const VERSION = '1.0.0';
const LIMITS = Object.freeze({ files: 25, names: 30, perName: 3, requires: 12, consumers: 12 });

// a code name worth looking up: `backticked`, a call foo(), a dotted member a.b(), or camelCase / snake_case with 2+ parts
const NAME_RE = /`([A-Za-z_$][\w$.]{2,80})(?:\(\))?`|\b([a-z_$][\w$]*[A-Z][\w$]*|[a-z]+_[a-z0-9_]+)\s*\(|\b([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]+)\(/g;
const COMMON = new Set(['console.log', 'JSON.parse', 'JSON.stringify', 'Object.keys', 'Date.now', 'Promise.all', 'module.exports', 'require', 'process.env', 'fs.readFileSync', 'fs.writeFileSync', 'path.join']);

/** the code names a phase's own words mention (deduplicated, capped) */
function namesIn(body) {
  const out = [];
  for (const m of String(body || '').matchAll(NAME_RE)) {
    let n = m[1] || m[2] || m[3];
    if (!n || COMMON.has(n) || /\.(js|mjs|cjs|ts|json|spec|md|yaml|yml|html|css)$/.test(n)) continue;
    n = n.replace(/\(\)$/, '');
    if (!out.includes(n)) out.push(n);
    if (out.length >= LIMITS.names) break;
  }
  return out;
}

// generic words a file can be named that say nothing about which file a phase means
const STEM_STOP = new Set(['index', 'server', 'config', 'utils', 'types', 'store', 'state', 'client', 'routes', 'main', 'module', 'engine', 'loader', 'runner', 'helpers', 'common', 'schema', 'service', 'manager', 'handler', 'registry', 'bridge', 'adapter', 'plugin', 'plugins', 'events', 'tools', 'window', 'boot', 'phase', 'phases', 'spec', 'specs', 'build', 'tests', 'agent', 'agents', 'model', 'models', 'memory', 'ledger', 'policy', 'session', 'settings', 'context', 'stream', 'search', 'chunks', 'graph', 'notes', 'tasks']);
/** hyphenated words of the phase's prose that could be a module's name ("phase-files", "end-state"). Single words are
 *  not used: measured on Nexus, "guardian", "listener", "automation" each matched files the phase did not mean. */
function wordsIn(body) {
  const out = [];
  for (const m of String(body || '').toLowerCase().matchAll(/\b([a-z][a-z0-9]+(?:-[a-z0-9]+)+)\b/g)) {
    const w = m[1]; if (STEM_STOP.has(w) || out.includes(w)) continue;
    out.push(w); if (out.length >= 60) break;
  }
  return out;
}

function _listOf(body, key) {
  const m = String(body || '').match(new RegExp(`^\\s+${key}:\\s*\\[([^\\]]*)\\]`, 'm'));
  return m ? m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
}

function mapPhase(phase, env = {}) {
  const exists = env.exists || (() => false), dirExists = env.dirExists || (() => false);
  const files = []; const seen = new Set();
  const add = (p, why) => {
    const clean = String(p).replace(/\s*\(new\)\s*$/, '').replace(/^\.\//, '');
    if (!clean || seen.has(clean) || files.length >= LIMITS.files) return;
    seen.add(clean); files.push({ path: clean, why, exists: !!exists(clean) });
  };
  const declared = phase.files || [];
  for (const f of declared) add(f, 'declared');
  let source = declared.length ? 'declared' : 'none';
  if (!declared.length) {
    for (const c of PF.candidates(phase.body, { exists, dirExists })) {
      if (c.exists) add(c.path, 'named in the phase');
      else if (c.folder) add(c.path, 'named in the phase — in an existing folder (new)');
    }
    if (env.definedIn) for (const n of namesIn(phase.body)) {
      const where = (env.definedIn(n) || []).slice(0, LIMITS.perName);
      if (where.length && where.length <= LIMITS.perName) for (const w of where) add(w, `defines ${n}`);
    }
    // a module named by its plain name ("the officiator", "phase-files") — only when exactly one or two files carry it
    if (env.filesNamed) for (const w of wordsIn(phase.body)) {
      const where = env.filesNamed(w) || [];
      if (where.length && where.length <= 2) for (const x of where) add(x, `names the module ${w}`);
    }
    if (files.length) source = 'evidence';
  }
  const real = files.filter(f => f.exists).map(f => f.path);
  const requires = [], consumers = [];
  for (const f of real) {
    for (const r of (env.requiresOf ? env.requiresOf(f) || [] : [])) if (!seen.has(r) && !requires.some(x => x.path === r) && requires.length < LIMITS.requires) requires.push({ path: r, by: f });
    for (const c of (env.consumersOf ? env.consumersOf(f) || [] : [])) if (!seen.has(c) && !consumers.some(x => x.path === c) && consumers.length < LIMITS.consumers) consumers.push({ path: c, of: f });
  }
  const specs = [...new Set([...(phase.specs || _listOf(phase.body, 'specs')), ...real.flatMap(f => (env.specsOf ? env.specsOf(f) || [] : []))])];
  return { id: phase.id, map: phase.map, source, files, requires, consumers, specs };
}

/** mapPhases(phases, env) — mapPhase for each, plus phase → phase dependencies from shared files */
function mapPhases(phases = [], env = {}) {
  const mapped = phases.map(p => ({ phase: p, m: mapPhase(p, env) }));
  const withFiles = mapped.map(({ phase, m }) => ({ ...phase, files: m.files.map(f => f.path) }));
  const hubs = PF.hubsOf(withFiles);
  const byMap = new Map();
  for (const p of withFiles) (byMap.get(p.map) || byMap.set(p.map, []).get(p.map)).push(p);
  const deps = new Map();   // map::id → [{ on, file }] — depsFor returns { id: [{ on, file }] } per map
  for (const [map, list] of byMap) for (const [id, ds] of Object.entries(PF.depsFor(list, { hubs }))) deps.set(`${map}::${id}`, ds);
  return mapped.map(({ phase, m }) => {
    const own = Array.isArray(phase.dependsOn) ? phase.dependsOn : String(phase.dependsOn || '').split(/[\s,]+/).filter(Boolean);
    const inferred = own.length ? [] : (deps.get(`${phase.map}::${phase.id}`) || []);
    return { ...m, dependsOn: own, dependsOnInferred: inferred };
  });
}

// ── env from a tree on disk (any project, no index needed) ──────────────────────────────────────────────────────
const SRC_RE = /\.(c?js|mjs|ts|tsx|jsx)$/;
const SKIP = new Set(['node_modules', '.git', 'data', '_archive', 'dist', 'build', 'indexes']);
const REQ_RE = /(?:require\(\s*|import\(\s*|from\s+|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
const DEF_RE = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\(|[A-Za-z_$][\w$]*\s*=>))/gm;

/** envFromTree(root, { specsOf }) — walks the source files once: requires, consumers, and where each name is defined */
function envFromTree(root, { specsOf = null, maxFiles = 20000 } = {}) {
  const files = [];
  (function walk(dir, rel) {
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (files.length >= maxFiles) return;
      if (e.isDirectory()) { if (!SKIP.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name); }
      else if (SRC_RE.test(e.name)) files.push(rel ? `${rel}/${e.name}` : e.name);
    }
  })(root, '');
  const set = new Set(files), req = new Map(), cons = new Map(), defs = new Map();
  const resolve = (from, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const c of [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.ts`, `${base}/index.js`]) if (set.has(c)) return c;
    return null;
  };
  for (const f of files) {
    let text; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    const out = [];
    for (const m of text.matchAll(REQ_RE)) { const r = resolve(f, m[1]); if (r && r !== f && !out.includes(r)) out.push(r); }
    req.set(f, out);
    for (const r of out) (cons.get(r) || cons.set(r, []).get(r)).push(f);
    for (const m of text.matchAll(DEF_RE)) { const n = m[1] || m[2] || m[3]; if (n && n.length > 2) (defs.get(n) || defs.set(n, []).get(n)).push(f); }
  }
  const stems = new Map();   // file stem (no extension, lower case) → paths; tests are not what a phase means by a module
  for (const f of files) { if (/(^|\/)tests?\//.test(f)) continue; const st = path.posix.basename(f).replace(/\.[^.]+$/, '').toLowerCase(); (stems.get(st) || stems.set(st, []).get(st)).push(f); }
  const isFile = (p) => { try { return fs.statSync(path.join(root, p)).isFile(); } catch (_) { return false; } };
  const isDir = (p) => { try { return !!p && fs.statSync(path.join(root, p)).isDirectory(); } catch (_) { return false; } };
  return {
    exists: isFile, dirExists: isDir,
    definedIn: (name) => { const tail = String(name).split('.').pop(); return [...new Set(defs.get(name) || defs.get(tail) || [])]; },
    filesNamed: (w) => stems.get(String(w).toLowerCase()) || [],
    requiresOf: (p) => req.get(p) || [],
    consumersOf: (p) => cons.get(p) || [],
    specsOf: specsOf || (() => []),
    stats: { files: files.length, names: defs.size },
  };
}

/** specsOfNexus(path) — the Nexus specs that own a file: its system's spec dirs (lib/nexus-self/systems.js), file-named first */
function specsOfNexus(root) {
  let NS = null; try { NS = require('./nexus-self/systems.js'); } catch (_) { return () => []; }
  const cache = new Map();
  const listDir = (d) => { if (cache.has(d)) return cache.get(d); let v = []; try { v = fs.readdirSync(path.join(root, d)).filter(n => n.endsWith('.spec') && !/phase-?map/.test(n)).map(n => `${d}/${n}`); } catch (_) {} cache.set(d, v); return v; };
  return (p) => {
    const sys = NS.get(NS.ownerOf(p)); if (!sys || sys.name === 'core') return [];
    const all = (sys.specDirs || []).flatMap(listDir);
    const stem = path.basename(p).replace(/\.[^.]+$/, '');
    const named = all.filter(s => path.basename(s).includes(stem));
    return (named.length ? named : all.filter(s => path.basename(s, '.spec') === sys.name || path.basename(s, '.spec') === (sys.dirs || [])[0])).slice(0, 3);
  };
}

// ── MP2: automatic, for every phase of any repo — cached by its maps' text, so a new or edited phase is mapped the
// first time it is read and nothing is recomputed while the maps are unchanged ─────────────────────────────────────
const _envCache = new Map();   // root → { at, env }
const _mapCache = new Map();   // root|textHash → results
const ENV_TTL_MS = 60000;
function _hash(s) { return require('crypto').createHash('sha1').update(s).digest('hex').slice(0, 16); }

/** forMaps({ root, maps, specsOf }) → { byKey: Map('map::id' → mapping), stats } — maps: [{ path, text }] */
function forMaps({ root, maps = [], specsOf = null, now = Date.now() } = {}) {
  const key = `${root}|${_hash(maps.map(m => `${m.path}\n${m.text}`).join('\u0000'))}`;
  const hit = _mapCache.get(key); if (hit) return hit;
  let e = _envCache.get(root);
  if (!e || now - e.at > ENV_TTL_MS) { e = { at: now, env: envFromTree(root, { specsOf }) }; _envCache.set(root, e); }
  const phases = []; for (const m of maps) for (const p of PF.phasesOf(m.text, m.path)) phases.push(p);
  const byKey = new Map(mapPhases(phases, e.env).map(r => [`${r.map}::${r.id}`, r]));
  const out = { byKey, stats: { phases: phases.length, files: e.env.stats.files } };
  if (_mapCache.size > 20) _mapCache.clear();
  _mapCache.set(key, out);
  return out;
}

/** newKeys(stateFile, keys) — the keys never seen before for this repo (the listener's "a new phase appeared"); records them */
function newKeys(stateFile, keys = []) {
  let seen = []; try { seen = JSON.parse(fs.readFileSync(stateFile, 'utf8')).seen || []; } catch (_) {}
  const had = new Set(seen); const fresh = keys.filter(k => !had.has(k));
  if (fresh.length) { try { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify({ seen: [...had, ...fresh] })); } catch (_) {} }
  return seen.length ? fresh : [];   // the first read of a repo is its baseline, not a flood of "new" phases
}

// ── MP3: the mapping as a build's context, so the agent starts with it instead of finding it with tools ────────────
/**
 * contextText(mapped, { focus, max, exportsOf }) → text (or '' when nothing is mapped).
 * Compact on purpose — a chunked build for a small model has a budget: paths, why, the names each file exports
 * (exportsOf), one hop of requires / used by, the phases it waits on, the specs. No code (the agent reads lines it needs).
 * focus: one file (a chunked build) — only that file's relations are listed.
 */
function contextText(mapped, { focus = null, max = 900, exportsOf = null } = {}) {
  if (!mapped || !(mapped.files || []).length) return '';
  const files = focus ? mapped.files.filter(f => f.path === focus) : mapped.files;
  const rel = (list, key) => (list || []).filter(x => !focus || x[key] === focus);
  const lines = [];
  for (const f of files) {
    const ex = f.exists && exportsOf ? (exportsOf(f.path) || []).slice(0, 8) : [];
    lines.push(`- ${f.path}${f.exists ? '' : ' (new)'} — ${f.why}${ex.length ? `; exports ${ex.join(', ')}` : ''}`);
  }
  const req = rel(mapped.requires, 'by'), use = rel(mapped.consumers, 'of');
  if (req.length) lines.push(`requires: ${req.map(r => r.path).join(', ')}`);
  if (use.length) lines.push(`used by (a change can break these): ${use.map(c => c.path).join(', ')}`);
  if ((mapped.dependsOnInferred || []).length && !focus) lines.push(`waits on: ${mapped.dependsOnInferred.map(d => `${d.on} (both change ${d.file})`).join('; ')}`);
  if ((mapped.specs || []).length) lines.push(`specs: ${mapped.specs.join(', ')}`);
  let t = lines.join('\n');
  if (t.length > max) t = `${t.slice(0, max - 2).replace(/\n[^\n]*$/, '')}\n…`;
  return t;
}

/** exportsOfTree(root) — the names a file exports (code-intel's chunker), cached by path */
function exportsOfTree(root) {
  const cache = new Map();
  let CH = null; try { CH = require('./code-intel/chunker.js'); } catch (_) { return () => []; }
  return (p) => {
    if (cache.has(p)) return cache.get(p);
    let v = []; try { v = CH.exportedNames(fs.readFileSync(path.join(root, p), 'utf8')) || []; } catch (_) {}
    v = [...new Set(v)]; cache.set(p, v); return v;
  };
}

module.exports = { VERSION, LIMITS, namesIn, wordsIn, mapPhase, forMaps, newKeys, contextText, exportsOfTree, mapPhases, envFromTree, specsOfNexus };
