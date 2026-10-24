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
const BASELINE = 'lib/contracts/drawbridge-baseline.json';
const KERNEL = 'lib';
// folders that are not systems: state, docs, tests, build scripts, vendored and archived code
const NOT_SYSTEMS = new Set(['node_modules', '_archive', 'data', 'docs', 'tests', 'scripts', 'skills', 'products', 'meta-archive']);
const SKIP_DIRS = new Set(['node_modules', '_archive', 'data', 'vendor', 'tests', '__tests__', 'dist', 'build', 'out']);
// 0.60.249 LM4 (from brave-cori) — what a compartment mounts beside its own folder, besides lib/ and node_modules/. Brave-cori folded
// non-system folders and kept the language (emerge + warp) at the top level; on main RF2 moved all of them into lib/, which is mounted,
// so both are empty here. When warp becomes a system (CS19, his CS_D11), LANGUAGE_PATHS names its folder.
const FOLDED = {};
const LANGUAGE_PATHS = [];
const JS = /\.(c|m)?js$/;
const { stripComments } = require('./capability-spec.js');   // the character scanner (strings, templates and regexes left whole)
const REQ = /(?:\b_?require|\bimport)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;

function systems(root) {
  // 0.60.247 — a folder with no code is no system: an empty emerge/input and bridge/input (made by the contract queue from a system's name)
  // had been counted as two sovereign systems
  // had been counted as two sovereign systems. A folder Idearium's list names (lib/nexus-self/systems.js) is a system even with no code
  // of its own (components is a store).
  let listed = new Set(); try { listed = new Set(require('./nexus-self/systems.js').SYSTEMS.flatMap(x => [x.name, ...(x.dirs || [])])); } catch (_) {}
  const hasCode = (d) => { const out = []; _walk(d, out); return out.length > 0; };
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !NOT_SYSTEMS.has(e.name) && (listed.has(e.name) || hasCode(path.join(root, e.name))))
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
    src = stripComments(src);   // 0.60.244 SV0: a require written in a comment is no crossing (intelligence/alk/index.js:122 was one)
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

// §0.60.129 DB17 — James, 2026-10-17: "all system relevant files should stay with the system."
// homes({ root, shared }) → which files in a shared folder (lib/, hooks/, service/, contracts/ …) belong to ONE system:
//   used by exactly one system and by nothing else in its own folder, or named for one system (hooks/cortex.hooks.js).
// A census only: it moves nothing. Each move is a proposal (a moved file leaves a re-export behind, so nothing breaks).
const SHARED = ['lib', 'hooks', 'service', 'contracts', 'components', 'architecture-spec', 'seams'];
const NAMED_FOLDERS = ['hooks', 'service'];
function homes({ root, shared = SHARED } = {}) {
  root = path.resolve(root || process.cwd());
  const sys = systems(root);
  const sysSet = new Set(sys);
  const users = new Map();   // file in a shared folder → Set of the folders whose files require it
  const files = [];
  for (const s of sys) _walk(path.join(root, s), files);
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    src = stripComments(src);   // 0.60.244 SV0: a require written in a comment is no crossing (intelligence/alk/index.js:122 was one)
    const from = path.relative(root, f).split(path.sep).join('/');
    for (const m of src.matchAll(REQ)) {
      const to = _file(root, path.resolve(path.dirname(f), m[1] || m[2]));
      const top = to.split('/')[0];
      if (!shared.includes(top) || to === from) continue;
      if (!users.has(to)) users.set(to, new Set());
      users.get(to).add(from.split('/')[0] === top ? `${top}:` + from : from.split('/')[0]);
    }
  }
  const out = [];
  for (const top of shared) {
    const own = []; _walk(path.join(root, top), own);
    for (const f of own) {
      const rel = path.relative(root, f).split(path.sep).join('/');
      const u = users.get(rel) || new Set();
      const outside = [...u].filter(x => !x.includes(':'));
      const inside = [...u].filter(x => x.includes(':')).length;
      // named for a system only where per-system naming is the folder's convention (hooks/cortex.hooks.js, service/cortex-service.js);
      // lib/agent-tools/tools/*/versionium-commit.js is a tool ABOUT versionium, loaded by the agent-tools registry, not versionium's file
      const named = NAMED_FOLDERS.includes(top) && sys.find(s => s !== top && !shared.includes(s) && new RegExp(`(^|[/._-])${s.replace(/[-]/g, '\\-')}([._-]|$)`).test(path.basename(rel)));
      let home = null, why = null;
      if (outside.length === 1 && !inside && sysSet.has(outside[0]) && !shared.includes(outside[0])) { home = outside[0]; why = `used only by ${outside[0]}`; }
      else if (named && (!outside.length || (outside.length === 1 && outside[0] === named))) { home = named; why = `named for ${named}${outside.length ? ', used only by it' : ', used by nothing yet'}`; }
      out.push({ file: rel, folder: top, home, why, users: outside, insideUsers: inside });
    }
  }
  const moves = out.filter(x => x.home);
  const byHome = {};
  for (const m of moves) (byHome[m.home] = byHome[m.home] || []).push(m.file);
  return { files: out.length, moves: moves.length, byHome, list: moves, unused: out.filter(x => !x.users.length && !x.insideUsers && !x.home).map(x => x.file) };
}

// §0.60.133 IM1 — James, 2026-10-17: "need to get the systems soveriegn again like we were talking about."
// sovereignty({ root, system }) → per system: is it sovereign (nothing it requires is in another system's folder; lib/ is the
// kernel while DB0a is open), and what stands in the way, each blocker named by what it is:
//   data       its tables kept in cortex's one store (cortex/memory/jaa-db.js) → its own store (lib/system-store.js, IM6)
//   primitive  a building block every system uses, living in one system's folder → the kernel (IM4; the coder's list, his to confirm)
//   capability another system's capability, required as a file → that system's route (IM3 / DB6)
// The primitive list is a reading, not a fact of the tree: it is data here, and his to change.
// 0.60.241 RF2: these folders moved into lib/ — the old paths still match (baselines and installed releases carry them)
const PRIMITIVES = [/^(lib\/)?nexus\/nexus-(bus|connect)\.js$/, /^(lib\/)?warp\/core\//, /^(lib\/)?siso\//, /^(lib\/)?warp\/index\.js$/, /^(lib\/)?hooks\/index\.js$/];
function blockerOf(to) {
  if (/^cortex\/memory\/jaa-db\.js$/.test(to)) return 'data';
  if (PRIMITIVES.some(r => r.test(to))) return 'primitive';
  return 'capability';
}
function sovereignty({ root, system = null } = {}) {
  root = path.resolve(root || process.cwd());
  const s = scan({ root });
  const rows = [];
  for (const sys of systems(root)) {
    if (system && sys !== system) continue;
    if (sys === KERNEL) continue;
    const out = s.crossings.filter(c => c.fromSystem === sys && c.kind !== 'kernel');
    const inn = s.crossings.filter(c => c.toSystem === sys && c.kind !== 'kernel');
    const kernel = s.crossings.filter(c => c.fromSystem === sys && c.kind === 'kernel').length;
    const blockers = { data: [], primitive: [], capability: [] };
    for (const c of out) blockers[blockerOf(c.to)].push({ from: c.from, to: c.to, system: c.toSystem });
    // 0.60.244 SV0 — sovereign is his CS_D7 both ways: it loads no other system's code AND no other system (nor core) loads its code.
    // Until 0.60.241 it meant only the first, and loom's cos-compartment template sealed on it. inFrom says which side still blocks.
    const inFrom = { systems: inn.filter(c => c.kind !== 'upward').length, core: inn.filter(c => c.kind === 'upward').length };
    const sovereign = out.length === 0 && inn.length === 0;
    const has = (f) => fs.existsSync(path.join(root, sys, f));
    const registry = has('registry-components.js'), compartment = has('compartment.json');
    const step = !sovereign ? 'crossings' : !registry ? 'registry' : !compartment ? 'compartment' : 'ready';   // CS_D7's road, as far as files show it
    rows.push({ system: sys, sovereign, outClean: out.length === 0, out: out.length, in: inn.length, inFrom, kernel, registry, compartment, step, blockers: { data: blockers.data.length, primitive: blockers.primitive.length, capability: blockers.capability.length }, ...(system ? { list: blockers } : {}) });
  }
  rows.sort((a, b) => (a.sovereign === b.sovereign ? a.out - b.out || a.in - b.in : a.sovereign ? -1 : 1));
  return { ok: true, sovereign: rows.filter(r => r.sovereign).map(r => r.system), systems: rows };
}

module.exports = { MODULE_ID, VERSION, BASELINE, KERNEL, SHARED, PRIMITIVES, FOLDED, LANGUAGE_PATHS, systems, kindOf, scan, census, check, baseline, readBaseline, homes, blockerOf, sovereignty };

// §0.60.134 — `node lib/system-boundary.js sovereign <system> [--root <dir>]`: exits 0 when the system is sovereign, 1 with its
// blockers when it is not. A COS compartment's intent checks its end state with this (loom/templates/cos-compartment.js).
if (require.main === module) {
  const [cmd, sys] = process.argv.slice(2);
  const ri = process.argv.indexOf('--root');
  const root = ri > 0 ? process.argv[ri + 1] : path.resolve(__dirname, '..');
  if (cmd !== 'sovereign' || !sys) { console.log('usage: node lib/system-boundary.js sovereign <system> [--root <dir>]'); process.exit(2); }
  const r = sovereignty({ root, system: sys }).systems[0];
  if (!r) { console.log(`${sys}: not a system under ${root}`); process.exit(2); }
  if (r.sovereign) { console.log(`${sys}: sovereign — nothing it requires is in another system's folder`); process.exit(0); }
  console.log(`${sys}: not sovereign — ${r.out} crossing(s): data ${r.blockers.data} · primitive ${r.blockers.primitive} · capability ${r.blockers.capability}`);
  for (const [k, xs] of Object.entries(r.list || {})) for (const x of xs) console.log(`  ${k.padEnd(10)} ${x.from} -> ${x.to}`);
  process.exit(1);
}
