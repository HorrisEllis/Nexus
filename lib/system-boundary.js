'use strict';
/**
 * lib/system-boundary.js — DB1: every require() that crosses from one system into another, counted, with a ratchet (0.60.126)
 * comp_id: nexus.lib.system-boundary
 * UUID: nexus-lib-system-boundary-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec (DB1_the_census_and_the_ratchet)
 *
 * James, 2026-10-17: "i want to eventually have the component registry for each system be the interaction contract and event
 * bus, with handshake verification. basically the spine of each system, like looms component registry but as the drawbridge
 * for each compartment for each system, the only way to interact between systems."
 *
 * Before the drawbridge can be the only way, the other ways have to be seen. A system is a top-level folder of the repo. A
 * crossing is a relative require()/import in one system's file that lands in another system's folder. Each is one of:
 *   system  — system to system (idearium → cortex): the drawbridge's work (DB3/DB6)
 *   upward  — lib/ reaching up into a system (lib → cortex): a kernel depending on what sits on it
 *   kernel  — a system using lib/ (idearium → lib): allowed while DB0a ("is lib/ a system?") is open
 *
 *   scan({ root })                → { files, crossings: [{ from, to, fromSystem, toSystem, kind }] }
 *   census({ root })              → { files, total, byKind, pairs: [{ pair, kind, count }] }
 *   check({ root, baseline })     → { ok, added: [edge], closed: [edge], counts } — the ratchet: ok only when nothing new
 *   baseline({ root })            → the baseline document (the system and upward edges as they are), for writing once
 *
 * The ratchet holds the edges (from file → to file), not counts per pair, so a move cannot hide a new crossing behind a closed
 * one. Limits, said: a require() built from a variable is not seen; HTTP calls between systems are not crossings here (they go
 * through a route, which is the door already).
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.system-boundary';
const VERSION = '1.0.0';
const BASELINE = 'contracts/drawbridge-baseline.json';
const KERNEL = 'lib';
// folders that are not systems: state, docs, tests, build scripts, vendored and archived code
const NOT_SYSTEMS = new Set(['node_modules', '_archive', 'data', 'docs', 'tests', 'scripts', 'skills', 'products', 'meta-archive']);
const SKIP_DIRS = new Set(['node_modules', '_archive', 'data', 'vendor', 'tests', '__tests__', 'dist', 'build', 'out']);
const JS = /\.(c|m)?js$/;
const REQ = /(?:\brequire|\bimport)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;

function systems(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !NOT_SYSTEMS.has(e.name))
    .map(e => e.name).sort();
}

function kindOf(fromSystem, toSystem) {
  if (toSystem === KERNEL) return 'kernel';
  if (fromSystem === KERNEL) return 'upward';
  return 'system';
}

function _walk(dir, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) _walk(p, out);
    else if (JS.test(e.name) && !/\.test\.(c|m)?js$/.test(e.name) && !/\.min\.js$/.test(e.name)) out.push(p);
  }
}

// the file a require() lands on, as Node resolves it: the path, path.js/.cjs/.mjs/.json, or path/index.js — so one file has one name
function _file(root, abs) {
  for (const c of [abs, `${abs}.js`, `${abs}.cjs`, `${abs}.mjs`, `${abs}.json`, path.join(abs, 'index.js')]) {
    try { if (fs.statSync(c).isFile()) return path.relative(root, c).split(path.sep).join('/'); } catch (_) {}
  }
  return path.relative(root, abs).split(path.sep).join('/');
}

function scan({ root } = {}) {
  root = path.resolve(root || process.cwd());
  const sys = new Set(systems(root));
  const files = [];
  for (const s of sys) _walk(path.join(root, s), files);
  const crossings = [];
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const from = path.relative(root, f).split(path.sep).join('/');
    const fromSystem = from.split('/')[0];
    const seen = new Set();
    for (const m of src.matchAll(REQ)) {
      const to = _file(root, path.resolve(path.dirname(f), m[1] || m[2]));
      const toSystem = to.split('/')[0];
      if (!toSystem || toSystem === '..' || toSystem === fromSystem || !sys.has(toSystem)) continue;
      const key = `${from} -> ${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      crossings.push({ from, to, fromSystem, toSystem, kind: kindOf(fromSystem, toSystem) });
    }
  }
  crossings.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
  return { root, files: files.length, crossings };
}

function census({ root } = {}) {
  const s = scan({ root });
  const byKind = { system: 0, upward: 0, kernel: 0 };
  const pairs = new Map();
  for (const c of s.crossings) {
    byKind[c.kind]++;
    const k = `${c.fromSystem} -> ${c.toSystem}`;
    const p = pairs.get(k) || { pair: k, kind: c.kind, count: 0 };
    p.count++; pairs.set(k, p);
  }
  return { files: s.files, total: s.crossings.length, byKind, pairs: [...pairs.values()].sort((a, b) => b.count - a.count) };
}

const edgeOf = (c) => `${c.from} -> ${c.to}`;
const ratcheted = (c) => c.kind !== 'kernel';   // DB0a open: lib/ used by a system is allowed

function baseline({ root } = {}) {
  const s = scan({ root });
  return {
    _: 'DB1 (docs/2026-10-17-system-drawbridge-phasemap.spec): the crossings between systems that existed when the drawbridge ratchet began, 2026-10-17. It may only shrink: a move to the drawbridge removes its line; a new crossing fails tests/modules/test-system-boundary.test.js. kernel crossings (a system using lib/) are not held while DB0a is open.',
    date: new Date().toISOString().slice(0, 10),
    edges: s.crossings.filter(ratcheted).map(edgeOf),
  };
}

function readBaseline(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8')); } catch (_) { return null; }
}

function check({ root, baseline: base } = {}) {
  root = path.resolve(root || process.cwd());
  base = base || readBaseline(root);
  const s = scan({ root });
  const now = s.crossings.filter(ratcheted);
  if (!base) return { ok: false, why: `no baseline at ${BASELINE} — write one with baseline()`, added: [], closed: [], counts: { now: now.length } };
  const held = new Set(base.edges || []);
  const nowSet = new Set(now.map(edgeOf));
  const added = now.filter(c => !held.has(edgeOf(c))).map(c => ({ edge: edgeOf(c), kind: c.kind, pair: `${c.fromSystem} -> ${c.toSystem}` }));
  const closed = [...held].filter(e => !nowSet.has(e));
  return { ok: added.length === 0, added, closed, counts: { baseline: held.size, now: now.length, added: added.length, closed: closed.length } };
}

module.exports = { MODULE_ID, VERSION, BASELINE, KERNEL, systems, kindOf, scan, census, check, baseline, readBaseline };
