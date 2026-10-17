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
 *   verify(plan, { root })  → { ok, loaded, of, failed, skipped }               does the carve load alone (CV2b)
 *   PRESETS                                                                       named seed lists (flight_recorder), with their cut
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.repo-carve';
const VERSION = '1.2.0';   // 1.2.0 (0.60.116 PB1): products from products/*/product.json, header tags, must
// 1.1.0 (0.60.113): how each link loads, assets, the tangle, cut, verify
const LIMITS = Object.freeze({ files: 2000, bytes: 40 * 1024 * 1024 });
const SKIP_DIRS = new Set(['node_modules', 'data', '.git', '_archive', 'dist']);
const SRC = /\.(js|cjs|mjs|json)$/;
const BUILTIN = new Set(require('module').builtinModules.map(m => m.replace(/^node:/, '').split('/')[0]));
const REQ = /(?:require\(\s*|import\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;

// §PB1 0.60.116 — James, 2026-10-17: "I agree, with the recommendation" (build the product in Nexus with a real boundary). A
// product is products/<name>/product.json (seeds, cut, must); a file that is part of one says so in its header
// (`Product: <name>`) and is added as a seed, so a new piece cannot be forgotten. The hand-written list this replaced went
// stale: it never carried lib/change-record.js (FR1) or lib/run-state.js, and the cut dropped lib/test-map.js (FR2). Kept:
const PRESET_0_60_113 = Object.freeze({ flight_recorder: { name: 'flight-recorder', cut: ['optional'],
  seeds: ['versionium', 'intelligence/rfr2', 'intelligence/causal', 'cos/testenv', 'cos/compartment',
    'lib/code-edit.js', 'lib/repo-history.js', 'lib/repo-inject.js', 'lib/repo-versions.js', 'lib/activity-log', 'lib/diagnostic-causal.js'] } });
const TAG = /^[\s*/#]*Product:\s*([a-z0-9][a-z0-9_-]*(?:\s*,\s*[a-z0-9][a-z0-9_-]*)*)/im;   // names, then anything (a note)
const NEXUS = path.resolve(__dirname, '..');

/** products(root) → { name: manifest } from products/<name>/product.json (a broken manifest is said, not skipped) */
function products(root = NEXUS) {
  const out = {}; const dir = path.join(root, 'products');
  let names = []; try { names = fs.readdirSync(dir); } catch (_) { return out; }
  for (const n of names) {
    const f = path.join(dir, n, 'product.json');
    if (!fs.existsSync(f)) continue;
    try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); out[m.name || n] = { ...m, name: m.name || n, dir: `products/${n}` }; }
    catch (e) { out[n] = { name: n, dir: `products/${n}`, error: `products/${n}/product.json does not parse: ${e.message}` }; }
  }
  return out;
}

/** tagged(root, name) → files whose header says `Product: <name>` (the first 40 lines; node_modules, data, _archive skipped) */
function tagged(root = NEXUS, name) {
  const out = [];
  (function walk(rel) {
    let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(r); continue; }
      if (!/\.(js|cjs|mjs)$/.test(e.name)) continue;
      let head = ''; try { const fd = fs.openSync(path.join(root, r), 'r'); const b = Buffer.alloc(4096); const n = fs.readSync(fd, b, 0, 4096, 0); fs.closeSync(fd); head = b.slice(0, n).toString('utf8').split('\n').slice(0, 40).join('\n'); } catch (_) { continue; }
      const m = head.match(TAG);
      if (m && m[1].split(/[\s,]+/).filter(Boolean).includes(name)) out.push(r);
    }
  })('');
  return out.sort();
}

/** preset(name, root) → { name, why, cut, seeds (the manifest's and every tagged file), must, tagged } | null */
function preset(name, root = NEXUS) {
  const all = products(root);
  const key = String(name || '');
  const m = all[key] || all[key.replace(/_/g, '-')] || null;
  if (!m) return null;
  if (m.error) return { name: m.name, error: m.error };
  const t = tagged(root, m.name);
  return { name: m.name, why: m.why || null, cut: m.cut || [], seeds: [...new Set([...(m.seeds || []), ...t])], must: m.must || [], tagged: t, manifest: `${m.dir}/product.json` };
}

/** PRESETS — the products, read from their manifests each time (kept as the name callers already use) */
const PRESETS = new Proxy({}, {
  get: (_, k) => (typeof k === 'string' ? preset(k) || undefined : undefined),
  ownKeys: () => Object.keys(products()), has: (_, k) => !!preset(String(k)),
  getOwnPropertyDescriptor: (_, k) => (preset(String(k)) ? { enumerable: true, configurable: true, value: preset(String(k)) } : undefined),
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

/**
 * how a require loads (CV2a; 'asset' is data read beside the file, never cut): 'load' — at the top of the file, so the file cannot load without it; 'lazy' — inside a function,
 * so only when that function runs; 'optional' — inside a try, so the code already runs without it. Read from the text, not
 * run: a heuristic, said as one (a try is found by walking up to 12 lines back to an unclosed `try {`).
 */
const SKIP_LOAD = /(^|\/)(server|cli|main|bin)\.js$|(^|\/)tests?\//;
const RANK = { optional: 0, lazy: 1, load: 2, asset: 3 };
const ASSET = /path\.(?:join|resolve)\(\s*__dirname((?:\s*,\s*['"][^'"]*['"])+)\s*\)/g;
function _assetFiles(root, rel, out = [], cap = 500) {
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (out.length >= cap || e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) _assetFiles(root, `${rel}/${e.name}`, out, cap); else out.push(`${rel}/${e.name}`);
  }
  return out;
}
function _kindAt(lines, i, col) {
  const before = lines[i].slice(0, col);
  if (/\btry\s*\{/.test(before) && !/\}\s*catch/.test(before)) return 'optional';
  let bal = 0;
  for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
    const l = lines[j]; bal += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (bal > 0 && /\btry\s*\{/.test(l)) return 'optional';
    if (bal > 0 && /^\S/.test(l)) break;   // reached the top-level statement that opens this block
  }
  if ((before.match(/\{/g) || []).length > (before.match(/\}/g) || []).length) return 'lazy';   // `function f() { return require(…) }` on one line
  return /^\s/.test(lines[i]) ? 'lazy' : 'load';
}

/** what a file requires, comments left out: local files (resolved, with how each loads), npm packages, relative ones to nothing */
function _outside(root, rel, text, resolved) {
  const npm = [], missing = [], local = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[i])) continue;   // a comment loads nothing
    for (const m of lines[i].matchAll(REQ)) {
      const s = m[1];
      if (s.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(rel), s));
        if (base === '..' || base.startsWith('../')) { missing.push(s); continue; }   // above Nexus: never read
        const hit = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}/index.js`].find(c => resolved.has(c) || fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile());
        if (!hit) { missing.push(s); continue; }
        if (hit === rel) continue;
        const kind = _kindAt(lines, i, m.index), had = local.find(x => x.path === hit);
        if (!had) local.push({ path: hit, kind }); else if (RANK[kind] > RANK[had.kind]) had.kind = kind;   // the strongest way it loads
      } else if (!s.startsWith('/') && !s.includes('${')) {
        const name = s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0];
        if (!BUILTIN.has(name.replace(/^node:/, '')) && !name.startsWith('node:')) npm.push(name);
      }
    }
    // CV2a 'asset': data the file reads beside itself (path.join(__dirname, 'node-schemas')), not a require. Found by loading the
    // carve alone: intelligence/lib/domain-nodes.js → lib/node-schemas.js reads lib/node-schemas/. State under data/ is never carried.
    for (const m of lines[i].matchAll(ASSET)) {
      const parts = [...m[1].matchAll(/['"]([^'"]*)['"]/g)].map(x => x[1]);
      const t = path.posix.normalize(path.posix.join(path.posix.dirname(rel), ...parts));
      if (!t || t === '.' || t === '..' || t.startsWith('../') || SKIP_DIRS.has(t.split('/')[0]) || t.split('/').some(x => SKIP_DIRS.has(x))) continue;
      let st; try { st = fs.statSync(path.join(root, t)); } catch (_) { continue; }
      const list = st.isFile() ? [t] : _assetFiles(root, t);
      for (const a of list) if (a !== rel && !local.some(x => x.path === a)) local.push({ path: a, kind: 'asset' });
    }
  }
  return { npm, missing, local };
}

function plan({ root, seeds = [], cut = [], must = [] } = {}) {
  const cutKinds = new Set((Array.isArray(cut) ? cut : [cut]).filter(k => k === 'optional' || k === 'lazy'));
  if (!root) return { ok: false, error: 'root required' };
  root = path.resolve(root);
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
  const npm = new Map(), missing = [], edges = [], cutEdges = []; let bytes = 0;
  while (queue.length) {
    const f = queue.shift();
    if (pulledBy.size > LIMITS.files) return { ok: false, error: `the carve passed ${LIMITS.files} files: name a smaller part` };
    let text = ''; try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { continue; }
    bytes += Buffer.byteLength(text);
    if (bytes > LIMITS.bytes) return { ok: false, error: `the carve passed ${LIMITS.bytes / 1048576} MB: name a smaller part` };
    if (!/\.(js|cjs|mjs)$/.test(f)) continue;
    const o = _outside(root, f, text, pulledBy);
    for (const r of o.local) {
      edges.push({ from: f, to: r.path, kind: r.kind });
      if (pulledBy.has(r.path)) continue;
      if (cutKinds.has(r.kind)) { cutEdges.push({ from: f, to: r.path, kind: r.kind }); continue; }
      pulledBy.set(r.path, f); queue.push(r.path);
    }
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
  // CV2a the tangle: each link from a named file to one outside the seeds, with how many files come in only through it
  const kindOf = new Map(edges.map(e => [`${e.from}>${e.to}`, e.kind]));
  const through = new Map();
  for (const f of files) {
    if (!f.pulledBy) continue;
    let x = f; const seen = new Set();
    while (x.pulledBy && pulledBy.get(x.pulledBy) !== null && !seen.has(x.path)) { seen.add(x.path); x = { path: x.pulledBy, pulledBy: pulledBy.get(x.pulledBy) }; }
    const k = `${x.pulledBy}>${x.path}`; through.set(k, (through.get(k) || 0) + 1);
  }
  const tangle = [...through].map(([k, n]) => { const [from, to] = k.split('>'); return { from, to, files: n, kind: kindOf.get(k) || 'load' }; })
    .sort((a, b) => b.files - a.files || a.from.localeCompare(b.from));
  const left = cutEdges.filter(e => !pulledBy.has(e.to));   // a file another link still needs is not left out
  // a package Nexus installs is a dependency; one only named in the code (a string COS's test detection looks for, say) is listed, not installed
  const all = [...npm].sort();
  return { ok: true, version: VERSION, seeds: list, files, seeded: start.length, pulledIn: files.length - start.length,
    npm: Object.fromEntries(all.filter(([, v]) => v)), npmNamedOnly: all.filter(([, v]) => !v).map(([n]) => n), missing, bySystem, lines, bytes,
    cut: [...cutKinds], leftOut: left, tangle,
    // §PB1 — every file the product must carry, and the ones the copy lacks (with the link that left it out, when one did)
    must, mustMissing: must.filter(m => !pulledBy.has(m)).map(m => ({ path: m, leftOutBy: (cutEdges.find(e => e.to === m) || {}).from || null })) };
}

function build(p, { root, name, nexusVersion = null, commit = null, quote = null, why = null, verified = null } = {}) {
  const out = p.files.map(f => ({ path: f.path, content: fs.readFileSync(path.join(root, f.path), 'utf8') }));
  const dependencies = { ...p.npm };
  out.push({ path: 'package.json', content: JSON.stringify({ name, version: '0.1.0', private: true, description: why || `carved from Nexus ${nexusVersion || ''}`.trim(), dependencies }, null, 2) + '\n' });
  out.push({ path: 'CARVED.json', content: JSON.stringify({ carvedFrom: 'nexus', nexusVersion, commit, at: new Date().toISOString(), seeds: p.seeds, npmNamedOnly: p.npmNamedOnly || [],
    counts: { files: p.files.length, seeded: p.seeded, pulledIn: p.pulledIn, lines: p.lines }, bySystem: p.bySystem, npm: p.npm, missing: p.missing,
    cut: p.cut || [], leftOut: p.leftOut || [], tangle: p.tangle || [], verified: verified ? { ok: verified.ok, loaded: verified.loaded, of: verified.of, failed: verified.failed, skipped: verified.skipped } : null,
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
    ...((p.cut || []).length ? [`- Left out (${p.cut.join(', ')} requires, which the code runs without): ${(p.leftOut || []).length} link(s)${(p.leftOut || []).length ? `, e.g. ${p.leftOut.slice(0, 3).map(e => `${e.from} → ${e.to}`).join('; ')}` : ''}`] : []),
    ...(verified ? [`- Loads alone: ${verified.ok ? 'yes' : 'NO'}, ${verified.loaded}/${verified.of} named files loaded in an empty folder${verified.failed.length ? ` (failed: ${verified.failed.map(f => f.path).join(', ')})` : ''}${verified.skipped.length ? `; skipped ${verified.skipped.map(f => f.path).join(', ')} (starts a server or CLI)` : ''}`] : []),
    `- Requires that resolve to nothing: ${p.missing.length}${p.missing.length ? ` (${p.missing.slice(0, 5).map(m => `${m.from} → ${m.spec}`).join('; ')})` : ''}`, '',
    'CARVED.json lists every file with the file whose require pulled it in. Files from systems other than the seeds are the',
    'tangle to cut next (docs/2026-10-16-repo-carve-phasemap.spec CV2, with the refactor tool RF0–RF2).', '',
  ].join('\n') });
  return out;
}

/**
 * verify(plan, { root, files? }) — CV2b: does the carve stand alone? Writes it to an empty folder (Nexus's node_modules linked in,
 * nothing else of Nexus reachable), then ONE child process loads every named .js file there and says which threw and why. A file
 * that starts a server or a CLI when loaded is skipped by name, never passed. Loading is not running: it proves the requires
 * are all there, not that the code works.
 */
function verify(p, { root, files = null, timeoutMs = 120000 } = {}) {
  const os = require('os'), { spawnSync } = require('child_process');
  root = path.resolve(root);   // a relative root made the node_modules link point at itself
  const t0 = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-verify-'));
  try {
    for (const f of files || build(p, { root, name: 'carve-verify' })) { const to = path.join(dir, f.path); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, f.content); }
    if (fs.existsSync(path.join(root, 'node_modules'))) fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
    const named = p.files.filter(f => !f.pulledBy && /\.(js|cjs)$/.test(f.path)).map(f => f.path);
    const skipped = named.filter(f => SKIP_LOAD.test(f)).map(f => ({ path: f, why: 'starts a server or a CLI when loaded' }));
    const load = named.filter(f => !SKIP_LOAD.test(f));
    const script = `const r=[];for(const f of ${JSON.stringify(load)}){try{require('./'+f);r.push([f,null])}catch(e){r.push([f,String(e&&e.message||e).split('\\n')[0].slice(0,200)])}}process.stdout.write('@@'+JSON.stringify(r));process.exit(0)`;
    const run = spawnSync(process.execPath, ['-e', script], { cwd: dir, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NEXUS_DATA_ROOT: path.join(dir, 'data'), NEXUS_TEST_SANDBOX: '1', NODE_PATH: '' } });
    const at = (run.stdout || '').lastIndexOf('@@');
    if (at < 0) return { ok: false, error: `the load check did not finish (${run.error ? run.error.message : `exit ${run.status}`}): ${String(run.stderr || '').split('\n').filter(Boolean).slice(-1)[0] || ''}`.trim(), ms: Date.now() - t0 };
    const res = JSON.parse(run.stdout.slice(at + 2));
    const failed = res.filter(([, e]) => e).map(([f, e]) => ({ path: f, error: e }));
    return { ok: !failed.length, loaded: res.length - failed.length, of: res.length, failed, skipped, ms: Date.now() - t0 };
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
}

module.exports = { MODULE_ID, VERSION, LIMITS, PRESETS, PRESET_0_60_113, products, tagged, preset, plan, build, verify };
