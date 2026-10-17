'use strict';
/**
 * lib/system-store.js — a system's OWN database, and its tables brought home from cortex's (IM6 / DS2, 0.60.133)
 * comp_id: nexus.lib.system-store
 * UUID: nexus-lib-system-store-v1-0000-2026-1017-jamesbrooks-001
 * Map: docs/2026-10-17-infrastructure-migration-phasemap.spec (IM5, IM6); docs/2026-10-05-cli-data-code-phasemap.spec DS2;
 *      docs/2026-09-29-nex-node-store-phasemap.spec I5 (one store per system), N17 (data moves to its owning system)
 *
 * James, 2026-10-17: "need to get the systems soveriegn again like we were talking about" · 2026-10-10 (architecture spec):
 * "cortex data is clumped together instead of being decoupled. like all data is the relative systems job to create, read,
 * manage".
 *
 * 46 require()s across the systems reach cortex/memory/jaa-db.js: each is a system keeping its tables in cortex's one store.
 * A system is not sovereign while its data lives in another system. This opens the system's own store (lib/jaa-store.js
 * JaaStore at <system>/data/jaa, the convention guardian and clear-glass already use) with jaaDB's call shapes
 * (insert / query / get / update / upsert / delete / count), so a system moves home by changing one require.
 *
 * Its tables come home once: migrate: [{ table }] copies the rows of each table from cortex's store into the system's own,
 * the first time the system's table is empty, and records it (settings row `migrated.<table>`: rows, from, at). The rows in
 * cortex's store are NOT removed: nothing is lost (§0.3), and the old copy is archived later, once nothing reads it (IM2).
 *
 *   openStore(system, { root, tables, migrate }) → the adapted store (cached per directory)
 *   storeDir(system, { root })                   → where it lives: <system>/data/jaa, or <sandbox>/systems/<system>/jaa in a test
 *   migrationsOf(system)                         → what was brought home, when, and from where
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.lib.system-store';
const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..');

function _sandbox() { const s = process.env.NEXUS_TEST_SANDBOX; try { return s && path.isAbsolute(s) && fs.statSync(s).isDirectory() ? s : null; } catch (_) { return null; } }
function storeDir(system, { root = ROOT } = {}) {
  const sb = _sandbox();
  return sb ? path.join(sb, 'systems', system, 'jaa') : path.join(root, system, 'data', 'jaa');
}
function cortexDir({ root = ROOT } = {}) { return process.env.JAA_DATA_DIR || path.join(root, 'data', 'cortex', 'memory'); }

const _open = new Map();

function _adapt(store, dir) {
  return {
    dir, store,
    insert: (t, row) => store.insert(t, row),
    upsert: (t, row, key) => store.upsert(t, row, key),
    get: (t, where) => store.get(t, where),
    query: (t, where, opts) => store.all(t, where || {}, opts || {}),
    all: (t, where, opts) => store.all(t, where || {}, opts || {}),
    update: (t, where, vals) => store.update(t, where, vals),
    delete: (t, where) => store.delete(t, where),
    count: (t, where) => store.count(t, where || {}),
    flush: () => { try { store.flushAll(); } catch (_) {} },
  };
}

/** the rows of one table in cortex's store, read only (a JaaStore over cortex's folder, that table alone) */
function _cortexRows(table, opts) {
  const dir = cortexDir(opts);
  if (!fs.existsSync(dir)) return { rows: [], from: dir, why: 'cortex has no store here' };
  try {
    const { JaaStore } = require('./jaa-store.js');
    const src = new JaaStore(dir, { tables: [table], settings: false });
    return { rows: src.all(table, {}), from: dir };
  } catch (e) { return { rows: [], from: dir, why: e.message }; }
}

function openStore(system, { root = ROOT, tables = null, migrate = [] } = {}) {
  if (!system) throw new Error('openStore: system is required');
  const dir = storeDir(system, { root });
  if (_open.has(dir)) return _open.get(dir);
  const { JaaStore } = require('./jaa-store.js');
  fs.mkdirSync(dir, { recursive: true });
  const store = new JaaStore(dir, tables ? { tables: [...new Set([...tables, 'settings'])] } : {});
  const db = _adapt(store, dir);
  db.migrations = [];
  for (const m of migrate) {
    const table = typeof m === 'string' ? m : m.table;
    const key = `migrated.${table}`;
    let done = null; try { const v = store.getSetting(key, null); done = v ? JSON.parse(v) : null; } catch (_) { done = null; }   // settings hold strings: the record is JSON
    if (done) { db.migrations.push({ table, ...done, already: true }); continue; }
    if (store.count(table, {}) > 0) { db.migrations.push({ table, rows: 0, why: 'the system already holds rows of its own; nothing copied' }); continue; }
    const src = _cortexRows(table, { root });
    for (const row of src.rows) store.insert(table, { ...row });
    const rec = { rows: src.rows.length, from: path.relative(root, src.from) || src.from, at: new Date().toISOString(), ...(src.why ? { why: src.why } : {}) };
    try { store.setSetting(key, JSON.stringify(rec)); } catch (_) {}
    db.migrations.push({ table, ...rec });
  }
  db.flush();
  _open.set(dir, db);
  return db;
}

function migrationsOf(system, opts) { const db = _open.get(storeDir(system, opts)); return db ? db.migrations : null; }

module.exports = { MODULE_ID, VERSION, storeDir, cortexDir, openStore, migrationsOf };
