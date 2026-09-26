'use strict';
/**
 * versionium/lib/store.js — versionium's own, real, sovereign data store.
 * UUID: nexus-versionium-store-v1-0000-2026-0902-jamesbrooks-001
 *
 * §VS1 2026-09-02 — James: "needs its own data folder." Before this
 * migration, versionium_commits/branches/calendar lived in CORTEX's
 * shared jaaDB tables (data/cortex/memory/) — real, but not sovereign
 * data, exactly the thing this phase exists to fix. This is a genuine,
 * separate JaaStore instance (same real class guardian/loom/every other
 * sovereign system already uses — guardian/jaa-store.js's JaaStore),
 * pointed at versionium's own directory, not cortex's shared one and not
 * a shared-dir-with-prefix the way guardian does it (guardian/server.js's
 * own `new JaaStore(CORTEX_STORE_DIR, {tablePrefix:'guardian_'})` — a
 * deliberate, different choice guardian made to share cortex's physical
 * files; versionium's own commit/branch/calendar tables were never meant
 * to be shared, so true separation is the right call here, not copied
 * blind from guardian's pattern).
 *
 * §HONEST EXCEPTION — event_log is NOT versionium's own data; it's this
 * codebase's real, shared, cross-system causal log, written to directly
 * by cortex, guardian, orchestrator, bridge, and others from their own
 * separate processes today (confirmed: jaa-db.js's own header documents
 * this as the established, already-live multi-process-shares-one-file-
 * store convention, not something new introduced here). versionium/lib/
 * causality.js deliberately keeps reading/writing event_log through
 * cortex's own jaaDB module for exactly that reason — see that file's
 * own comment. Only versionium's true OWN tables move here.
 */
const { JaaStore } = require('../../guardian/jaa-store');
const crypto = require('crypto');
const config = require('../config.js');

let _store = null;
function _getStore() {
  if (!_store) _store = new JaaStore(config.DATA_DIR);
  return _store;
}

function uid() { return crypto.randomUUID(); }

const jaaDB = {
  insert:  (table, row)          => _getStore().insert(table, row),
  upsert:  (table, row, key)     => _getStore().upsert(table, row, key),
  get:     (table, where)        => _getStore().get(table, where),
  getById: (table, id)           => _getStore().get(table, { id }),
  // §MATCHED to cortex/memory/jaa-db.js's own real, bugfixed shape —
  // JaaStore itself has no query()/tail(), only all(). Copied exactly,
  // not reinvented, including the same real ordering fix that file's own
  // header documents (Map iteration order is already chronological; no
  // sort needed or safe to add).
  query:   (table, where, opts)  => _getStore().all(table, where, typeof opts === 'number' ? { limit: opts } : opts),
  tail:    (table, n)            => { const rows = _getStore().all(table, {}); const nn = n || 10; return rows.slice(-nn).reverse(); },
  update:  (table, where, vals)  => _getStore().update(table, where, vals),
  delete:  (table, where)        => _getStore().delete(table, where),
  count:   (table, where)        => _getStore().count(table, where),
  uid,
};

module.exports = { jaaDB, uid, _getStore };
