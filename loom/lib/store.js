'use strict';
/**
 * loom/lib/store.js — Loom's own store: its four tables, brought home once from Cortex's (whose rows are kept, §0.3).
 * comp_id: nexus.loom.lib.store
 * 0.60.241 LM2 (docs/2026-10-24-loom-into-cos-phasemap.spec LM_D2). James, 2026-10-10: "all data is the relative systems job to create,
 * read, manage" · 2026-10-24: "Do it." (Loom first, into its compartment)
 * Stands on lib/system-store.js (IM6): loom/data/jaa, or the test sandbox's; jaaDB's call shapes, so each user changes one require.
 * Readers outside Loom read through Loom's routes (/api/hooks…, /api/phasemap/history), never this store (LM3).
 */
const TABLES = ['hooks', 'hook_bindings', 'loom_changelog', 'phasemap_history'];
let _s = null;
function store() {
  return _s || (_s = require('../../lib/system-store.js').openStore('loom', { tables: TABLES, migrate: TABLES.map(table => ({ table })) }));
}
module.exports = { TABLES, store };
