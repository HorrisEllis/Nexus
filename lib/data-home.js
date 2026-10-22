'use strict';
/**
 * lib/data-home.js — one resolver for every system's own data, and each system bringing its data home (DL2, 0.60.207).
 * comp_id: nexus.lib.data-home
 * UUID: nexus-data-home-v1-0000-2026-1021-001
 * Spec: docs/data-layout.spec MOD-DATA-HOME · Map: docs/2026-10-21-data-layout-phasemap.spec DL2_one_resolver
 *
 * James, 2026-10-21: "need all data in the data folder migrated to each relative system" · "no data folder in the root."
 * 2026-10-22: "start the data migration. look at the phases, any migrating data to the respective systems, and make each system
 * responsible for it's own data."
 *
 * Writers use this instead of path.join(ROOT, 'data', …):
 *   home(system, kind, ...rest) → <folder>/data/<kind>/…            a system's own data, by kind
 *   ledger(system, at)          → <folder>/data/event_ledgers/<YYYY-MM-DD_HH-mm-ss>.ledger
 *   nodes(system, type)         → <folder>/data/nodes/<type>/
 *   memory(name, ...rest)       → cortex/data/memory/<name>/…         his "each memory system is in cortex"
 *   dir(system)                 → <folder>/data
 * In a test process each resolves under the sandbox (<sandbox>/systems/<folder>/…, the layout lib/system-store.js uses), so a
 * test never writes the real tree. Never a path under the root data/.
 *
 * Each system responsible for its own data:
 *   bringHome(system, { root, by })  the root data/ files the ownership table (docs/data-layout.spec `ownership:`) gives this
 *     system are moved into <folder>/data through lib/data-clearup.js — manifest first, copy, sha256 equal, then the source goes;
 *     a file whose old path code still names waits (skipped-refs) and is listed; one his call (ask) is never moved. The result is
 *     recorded in <folder>/data/.home.json. A system calls it once at its own boot; nothing to move costs one directory read.
 *   status(system)                   what .home.json says, and what is still waiting in the root data/ for it
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.data-home';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = '.home.json';

// 0.60.208 DL3 — the systems whose code has been rewired to this resolver, one step at a time (docs/2026-10-21-data-layout-phasemap.spec
// DL3; SS1 for guardian). A shared writer that builds data/<system>/… from a variable (lib/ledger-writer.js) asks this, so a rewired
// system's files go home and a system not yet rewired keeps its old place — no system's log is split across two folders mid-migration.
const REWIRED = Object.freeze(new Set(['guardian']));
function rewired(system) { return REWIRED.has(String(system || '')); }

// owners in the ownership table that are not in the system registry, kept with their folder (erosmancer, warp)
const EXTRA = Object.freeze(['erosmancer', 'warp']);

function _sr() { return require('./system-registry.js'); }
function _sandbox() { const s = process.env.NEXUS_TEST_SANDBOX; try { return s && path.isAbsolute(s) && fs.statSync(s).isDirectory() ? s : null; } catch (_) { return null; } }
const _isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };

/** SYSTEMS() → every system name that has a folder to own data in */
function SYSTEMS({ root = ROOT } = {}) {
  const names = [];
  try { for (const s of _sr().list()) if (_sr().folderOf(s.name)) names.push(s.name); } catch (_) {}
  for (const x of EXTRA) if (_isDir(path.join(root, x)) && !names.includes(x)) names.push(x);
  return names;
}

/** folder(system) → its folder at the root; GATE-DH-001: an unknown system is an error naming the known ones */
function folder(system, { root = ROOT } = {}) {
  const n = String(system || '');
  let f = null;
  try { f = _sr().folderOf(n); } catch (_) {}
  if (!f && EXTRA.includes(n) && _isDir(path.join(root, n))) f = n;
  if (!f) throw new Error(`data-home: unknown system "${n}" — known: ${SYSTEMS({ root }).join(', ')}`);
  return f;
}

/** dir(system) → <folder>/data, or <sandbox>/systems/<folder> in a test (GATE-DH-002) */
function dir(system, { root = ROOT } = {}) {
  const f = folder(system, { root });
  const sb = _sandbox();
  return sb ? path.join(sb, 'systems', f) : path.join(root, f, 'data');
}

function home(system, kind, ...rest) {
  if (!kind) throw new Error('data-home: home(system, kind) needs a kind (store, event_ledgers, nodes, memory, …)');
  return path.join(dir(system), String(kind), ...rest.map(String));
}

function _stamp(at) {
  const d = new Date(at), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
function ledger(system, at = Date.now()) { return home(system, 'event_ledgers', `${_stamp(at)}.ledger`); }
function nodes(system, type) { if (!type) throw new Error('data-home: nodes(system, type) needs a type'); return home(system, 'nodes', type); }
function memory(name, ...rest) { if (!name) throw new Error('data-home: memory(name) needs a name'); return home('cortex', 'memory', name, ...rest); }

/** the root data/ files the ownership table gives this system, read without walking the whole tree when there are none */
/** _owns(system) → the root data/ paths this system's ownership rules name that exist now (no census, no hashing: a boot costs stats) */
function _owns(system, { root = ROOT } = {}) {
  const dataDir = path.join(root, 'data');
  const out = [];
  let rules = []; try { rules = require('./data-clearup.js').loadRules(root); } catch (_) { return null; }
  for (const r of rules) {
    if (r.owner !== system && r.owner !== '<system>') continue;
    const head = String(r.match).split('*')[0].replace('<system>', system).replace(/\/$/, '');
    if (r.owner === '<system>' && !String(r.match).includes('<system>')) continue;
    if (head && fs.existsSync(path.join(dataDir, head))) out.push(head);
  }
  return out;
}

function _pending(system, { root = ROOT } = {}) {
  const dataDir = path.join(root, 'data');
  if (!_isDir(dataDir)) return null;
  const owned = _owns(system, { root });
  if (owned && !owned.length) return { census: null, moves: [], owned };
  const C = require('./data-clearup.js');
  const c = C.census({ root, dataDir, ...(owned ? { only: owned } : {}) });
  const moves = C.plan(c, { onlyOwner: system });
  return { census: c, moves, owned };
}

function _record(system, rec, { root = ROOT } = {}) {
  const d = dir(system, { root });
  try { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, HOME_FILE), JSON.stringify(rec, null, 2)); } catch (e) { rec.recordError = e.message; }
  return rec;
}

/**
 * bringHome(system, { root, by, force, fresh }) → { system, moved, archived, waiting:[{from, why}], asked, conflicts, failed, manifest, said }
 * GATE: a test process never moves the real tree (said, not done) unless force; no root data/ → nothing to do, said.
 */
function bringHome(system, { root = ROOT, by = null, force = false, fresh = false, log = null } = {}) {
  folder(system, { root });   // an unknown system throws before anything is read
  const who = by || `system:${system}`;
  const base = { system, at: Date.now(), by: who, moved: 0, archived: 0, waiting: [], asked: [], conflicts: [], failed: [], manifest: null };
  if (!force) { try { if (require('./test-sandbox.js').isTestProcess()) return { ...base, said: 'a test process: the real tree is not moved' }; } catch (_) {} }
  // a boot re-reads only when something could have changed: another release (code that named a path may now be rewired) or
  // other paths waiting in the root data/. Same release, same paths, nothing moved last time → the last record stands.
  const version = (() => { try { return require('./version.js').system; } catch (_) { return null; } })();
  let last = null; try { last = JSON.parse(fs.readFileSync(path.join(dir(system, { root }), HOME_FILE), 'utf8')); } catch (_) {}
  const owned = _isDir(path.join(root, 'data')) ? _owns(system, { root }) : [];
  const key = JSON.stringify((owned || []).slice().sort());
  if (!fresh && last && last.version === version && last.key === key && !last.moved) return { ...last, said: `unchanged since ${new Date(last.at).toISOString()}: ${last.said}`, cached: true };
  base.version = version; base.key = key;
  let p;
  try { p = _pending(system, { root }); }
  catch (e) { return _record(system, { ...base, said: `could not read the root data/: ${e.message}` }, { root }); }
  if (!p) return { ...base, said: 'no root data/ folder: nothing waits to come home' };
  const planned = p.moves.filter(m => m.status === 'planned');
  const waiting = p.moves.filter(m => m.status === 'skipped-refs').map(m => ({ from: m.from, why: m.why }));
  const asked = p.moves.filter(m => m.status === 'ask').map(m => ({ from: m.from, why: m.why }));
  if (!planned.length) {
    const said = p.moves.length ? `${p.moves.length} file(s) of ${system} in the root data/: ${waiting.length} wait for code that still names them, ${asked.length} his call` : `nothing of ${system} in the root data/`;
    return p.moves.length ? _record(system, { ...base, waiting, asked, said }, { root }) : { ...base, said };
  }
  const r = require('./data-clearup.js').apply(planned, { root, by: who });
  const rec = { ...base, moved: r.moves.length, archived: r.archived.length, waiting, asked,
    conflicts: r.conflicts.map(m => ({ from: m.from, to: m.to, why: m.why })), failed: r.failed.map(m => ({ from: m.from, why: m.why })), manifest: r.manifestPath,
    said: `${system} brought ${r.moves.length} file(s) home (${r.archived.length} duplicate(s) archived)${waiting.length ? `; ${waiting.length} wait for rewiring` : ''}${r.conflicts.length ? `; ${r.conflicts.length} conflict(s) left in place` : ''}` };
  if (typeof log === 'function') { try { log(`[data-home] ${rec.said} — manifest ${rec.manifest}`); } catch (_) {} }
  return _record(system, rec, { root });
}

/** status(system) → { system, dir, last (.home.json), waiting: count in the root data/ by status } — reads; moves nothing */
function status(system, { root = ROOT, census = null } = {}) {
  const d = dir(system, { root });
  let last = null; try { last = JSON.parse(fs.readFileSync(path.join(d, HOME_FILE), 'utf8')); } catch (_) {}
  let pending = null;
  try {
    const C = require('./data-clearup.js');
    const c = census || (_isDir(path.join(root, 'data')) ? C.census({ root, dataDir: path.join(root, 'data') }) : null);
    if (c) { const ms = C.plan(c, { onlyOwner: system }); pending = {}; for (const m of ms) pending[m.status] = (pending[m.status] || 0) + 1; }
  } catch (e) { pending = { error: e.message }; }
  return { system, folder: folder(system, { root }), dir: path.relative(root, d) || d, last, pending };
}

/**
 * atBoot(system) — the one line each system's entry runs first, before anything opens its data. Quiet unless it moved something,
 * left a conflict or failure, or found files waiting for the first time this release (§1.2: said once, not every boot).
 */
function atBoot(system, { log = console.log } = {}) {
  try {
    const r = bringHome(system, { log: null });
    if (r.moved || r.failed.length || r.conflicts.length || (r.waiting.length && !r.cached)) log(`[${system}] data-home: ${r.said}${r.manifest ? ` — manifest ${r.manifest}` : ''}`);
    return r;
  } catch (e) { try { console.warn(`[${system}] data-home: its data was not brought home: ${e.message}`); } catch (_) {} return null; }
}

module.exports = { MODULE_ID, VERSION, HOME_FILE, REWIRED, rewired, SYSTEMS, folder, dir, home, ledger, nodes, memory, bringHome, status, atBoot };
