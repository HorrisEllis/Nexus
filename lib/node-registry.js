'use strict';
/**
 * lib/node-registry.js — P33a: a node registry any system runs over its own nodes, into its own store, with all the history (0.60.130)
 * comp_id: nexus.lib.node-registry
 * UUID: nexus-lib-node-registry-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-09-11-sovereign-node-architecture-phasemap.spec P33 (every system runs its node registry);
 *      docs/2026-10-17-system-drawbridge-phasemap.spec addendum d (P33a)
 *
 * James, 2026-10-17: "each system, reads, writes, and manages its nodes. each system has a database for each index of nodes
 * with all the history. listener, schemas for all the  node types, the database. nodes for all persistant data."
 * James, 2026-09-12 (lib/node-index.js): "in each data folder we use a jaa database for each node type."
 *
 * Stands on, not beside (§8.6):
 *   - guardian/lib/node-registry.js, the one registry that runs: its per-file rules are kept exactly (parse with
 *     lib/node-export.js, the folder's type must match, lib/node-schemas.js checkPayload, a _ledger.jsonl line per change, the
 *     index, a bus event). What changes: it is an INSTANCE per system (Guardian's is one module-level registry), and it indexes
 *     into the system's OWN store, not the central cortex one.
 *   - lib/node-index.js indexNode/removeNode/queryNodes/history: nodes_<type> (the index) and nodes_<type>_ledger (all the
 *     history: every add, change and removal, append-only).
 *   - lib/jaa-store.js JaaStore at <system>/data/node-index, with the query → all adapter intelligence, copilot and versionium
 *     each wrote for themselves (held once here).
 *
 *   storeFor(system, { root })           → the system's own store (one per folder, cached)
 *   createNodeRegistry({ system, root, types, bus, quiet })
 *     .scan()                → every node file indexed now: { types, indexed, invalid, removed }
 *     .start()               → scan, then the listener: a watch per type folder (a node dropped in goes live; removed, it goes)
 *     .stop()
 *     .list(type) / .get(type, id)       → from the system's own index (survives a restart)
 *     .history(type, id)                 → every recorded change of one node, oldest first
 *     .stats()                           → per type: nodes in the folder, rows in the index, ledger entries
 * Events: <system>.node.added · .changed · .removed · .invalid, on the bus handed in (nothing is emitted without one).
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.node-registry';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');
const LEDGER_FILE = '_ledger.jsonl';
const SKIP_TYPES = new Set(['_archive']);

const _stores = new Map();
/** storeFor(system, { root, fresh }) — fresh: a new view read from disk now, not cached (a reader in another process) */
function storeFor(system, { root = ROOT, fresh = false } = {}) {
  const dir = path.join(root, system, 'data', 'node-index');
  if (!fresh && _stores.has(dir)) return _stores.get(dir);
  const { JaaStore } = require('./jaa-store.js');
  const store = new JaaStore(dir);
  const adapted = {
    dir, store,
    insert: (t, row) => store.insert(t, row),
    upsert: (t, row, key) => store.upsert(t, row, key),
    get: (t, where) => store.get(t, where),
    query: (t, where) => store.all(t, where),
    update: (t, where, vals) => store.update(t, where, vals),
    delete: (t, where) => store.delete(t, where),
    count: (t, where) => store.count(t, where),
    flush: () => { try { store.flushAll(); } catch (_) {} },
  };
  if (!fresh) _stores.set(dir, adapted);
  return adapted;
}

function _types(nodesDir) {
  try { return fs.readdirSync(nodesDir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_TYPES.has(e.name)).map(e => e.name).sort(); }
  catch (_) { return []; }
}
const _idOf = (file) => { const b = path.basename(file); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };

function createNodeRegistry({ system, root = ROOT, types = null, bus = null, quiet = true, fresh = false } = {}) {
  if (!system) throw new Error('createNodeRegistry: system is required');
  const nodesDir = path.join(root, system, 'data', 'nodes');
  const NX = require('./node-export.js'), NS = require('./node-schemas.js'), NI = require('./node-index.js');
  const db = storeFor(system, { root, fresh });
  const watchers = [];
  const debounce = new Map();
  const log = (m) => { if (!quiet) console.log(`[${system}/node-registry] ${m}`); };
  const emit = (ev, data) => { try { if (bus && typeof bus.emit === 'function') bus.emit(`${system}.node.${ev}`, { system, ...data }); } catch (_) {} };
  const ledger = (type, entry) => { try { fs.appendFileSync(path.join(nodesDir, type, LEDGER_FILE), JSON.stringify({ ts: Date.now(), type, ...entry }) + '\n'); } catch (_) {} };
  const typeList = () => types || _types(nodesDir);
  const indexed = (type) => { try { return NI.queryNodes(type, null, db) || []; } catch (_) { return []; } };

  /** one file: the same rules as guardian/lib/node-registry.js _processFile, into this system's own store */
  function processFile(type, file) {
    const name = path.basename(file);
    if (name === LEDGER_FILE || name.startsWith('.')) return { skipped: true };
    if (!fs.existsSync(file)) {
      const id = _idOf(name);
      const was = indexed(type).some(r => r.id === id);
      if (!was) return { skipped: true };
      try { NI.removeNode(type, id, db); } catch (_) {}
      ledger(type, { action: 'deleted', file: name, id });
      emit('removed', { type, id, file: name });
      log(`${type}/${name} removed`);
      return { removed: true, id };
    }
    let doc;
    try { doc = NX.importFromFile(file); }
    catch (e) { ledger(type, { action: 'invalid', file: name, error: e.message }); emit('invalid', { type, file: name, why: e.message }); return { invalid: true, why: `does not parse: ${e.message}` }; }
    if (doc.type !== type) {
      ledger(type, { action: 'type_mismatch', file: name, declaredType: doc.type, folderType: type });
      emit('invalid', { type, file: name, why: `declares type ${doc.type}` });
      return { invalid: true, why: `declares type "${doc.type}" in the ${type}/ folder` };
    }
    const check = NS.checkPayload(type, doc.payload);
    if (!check.ok) {
      ledger(type, { action: 'schema_invalid', file: name, id: doc.id, missing: check.missing, wrongType: check.wrongType });
      const why = `fails schema.${type}:${check.missing.length ? ` missing ${check.missing.join(', ')}` : ''}${(check.wrongType || []).length ? ` wrong type ${check.wrongType.map(w => `${w.field} (${w.got || w.actual || typeof w} not ${w.expected || w.want || '?'})`).join(', ')}` : ''}`;
      emit('invalid', { type, id: doc.id, file: name, why });
      return { invalid: true, why };
    }
    const prior = indexed(type).find(r => r.id === doc.id);
    // unchanged = the same content: the history records changes, not re-reads (a boot rescan must not log every node as changed)
    const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
    if (prior && same(prior.payload, doc.payload) && same(prior.summary, doc.summary) && same(prior.context, doc.context) && same(prior.tags, doc.tags) && prior.system === doc.system) return { unchanged: true, id: doc.id };
    NI.indexNode(type, doc, file, db);
    ledger(type, { action: prior ? 'changed' : 'added', file: name, id: doc.id });
    emit(prior ? 'changed' : 'added', { type, id: doc.id, file: name });
    log(`${type}/${name} ${prior ? 'changed' : 'added'}`);
    return { [prior ? 'changed' : 'added']: true, id: doc.id };
  }

  function scan() {
    const out = { system, types: {}, indexed: 0, unchanged: 0, invalid: [], removed: 0 };
    for (const type of typeList()) {
      const dir = path.join(nodesDir, type);
      let files = []; try { files = fs.readdirSync(dir).filter(f => f !== LEDGER_FILE && !f.startsWith('.')); } catch (_) {}
      const present = new Set(files.map(_idOf));
      const t = { files: files.length, indexed: 0, unchanged: 0, invalid: 0, removed: 0 };
      for (const f of files) {
        const r = processFile(type, path.join(dir, f));
        if (r.added || r.changed) t.indexed++; else if (r.unchanged) t.unchanged++; else if (r.invalid) { t.invalid++; out.invalid.push({ type, file: f, why: r.why }); }
      }
      // a node whose file is gone while nothing listened: the index catches up, and the history says so
      for (const row of indexed(type)) if (!present.has(row.id)) { const r = processFile(type, path.join(dir, `${row.id}.${type}`)); if (r.removed) t.removed++; }
      out.types[type] = t; out.indexed += t.indexed; out.unchanged += t.unchanged; out.removed += t.removed;
    }
    db.flush();
    return out;
  }

  function start() {
    const r = scan();
    for (const type of typeList()) {
      const dir = path.join(nodesDir, type);
      try {
        watchers.push(fs.watch(dir, (ev, filename) => {
          if (!filename) return;
          const key = `${type}/${filename}`, now = Date.now();
          if (now - (debounce.get(key) || 0) < 300) return;
          debounce.set(key, now);
          setTimeout(() => { processFile(type, path.join(dir, filename)); db.flush(); }, 50);
        }));
      } catch (e) { r.invalid.push({ type, why: `the listener could not watch ${dir}: ${e.message}` }); }
    }
    return { ...r, listening: watchers.length };
  }
  function stop() { for (const w of watchers) { try { w.close(); } catch (_) {} } watchers.length = 0; debounce.clear(); db.flush(); }

  const list = (type) => indexed(type).map(r => r.doc || r);
  const get = (type, id) => { const r = indexed(type).find(x => x.id === id); return r ? (r.doc || r) : null; };
  const history = (type, id) => { try { return NI.history(type, id, db) || []; } catch (_) { return []; } };
  function stats() {
    const out = {};
    for (const type of typeList()) {
      let files = 0; try { files = fs.readdirSync(path.join(nodesDir, type)).filter(f => f !== LEDGER_FILE && !f.startsWith('.')).length; } catch (_) {}
      let ledgerRows = 0; try { ledgerRows = db.count(`nodes_${type}_ledger`, {}); } catch (_) {}
      out[type] = { files, indexed: indexed(type).length, history: ledgerRows };
    }
    return { system, nodesDir: path.relative(root, nodesDir), store: path.relative(root, db.dir), types: out };
  }

  return { system, nodesDir, store: db, processFile, scan, start, stop, list, get, history, stats };
}

// §0.60.131 P33b — each system runs its own listener, in its own process: the one writer of its node database (N8).
// startForSystem(system, { bus, root, delayMs, force }) → { registry, stop } — off the boot path (after delayMs), a failure said,
// never fatal; not in a test process (a suite that spawns a server must not rewrite the real tree's databases — N19) unless force.
// ownsItsDatabase(system) → true when the system runs as its own process (lib/system-registry.js knows its entry): then the
// boot sync (lib/system-nodes.js) writes its node FILES but leaves the database to the system's own listener.
function ownsItsDatabase(system, { root = ROOT } = {}) {
  try { const SR = require('./system-registry.js'); return SR.list().some(s => SR.folderOf(s.name) === system && (s.port || s.healthUrl)); }
  catch (_) { return false; }
}
function startForSystem(system, { bus = null, root = ROOT, delayMs = 4000, force = false, log = console.log } = {}) {
  const handle = { registry: null, started: false, stop: () => { clearTimeout(t); if (handle.registry) handle.registry.stop(); } };
  if (!force) { try { if (require('./test-sandbox.js').isTestProcess()) { handle.skipped = 'a test process: the real tree\'s node database is not touched'; return handle; } } catch (_) {} }
  const t = setTimeout(() => {
    try {
      handle.registry = createNodeRegistry({ system, root, bus });
      const r = handle.registry.start();
      handle.started = true;
      log(`[${system}] node registry: ${r.indexed} indexed, ${r.unchanged} unchanged, ${r.removed} removed, ${r.invalid.length} invalid · listening on ${r.listening} type folder(s) · ${path.relative(root, handle.registry.store.dir)}${bus ? '' : ' · no bus: its node events are not emitted (DB4)'}`);
    } catch (e) { handle.error = e.message; log(`[${system}] node registry did not start (non-fatal): ${e.message}`); }
  }, delayMs);
  if (t.unref) t.unref();
  return handle;
}

module.exports = { MODULE_ID, VERSION, storeFor, createNodeRegistry, startForSystem, ownsItsDatabase };
