'use strict';
/**
 * tests/modules/_purge-test-rows.js — cleanup helper for tests that write
 * through lib/component-ledger.js.
 *
 * §ROOT CAUSE 2026-07-24. Several suites correctly removed their
 * data/ledger/<system>/ directories in a finally block and still leaked,
 * because component-ledger.write() lands in THREE places: the physical day
 * file, the JAA `component_ledger` mirror, and an `event_log` breadcrumb.
 * Deleting the directory removed one of the three. The other two accumulated
 * in the live store, and eventually surfaced as phantom systems — literally
 * visible as nodes in the alk-lattice brain view, which is how they were
 * found.
 *
 * That is worth stating plainly: a test polluted the instrument used to
 * observe the system. The view was right; the test was wrong.
 *
 * Tests must use collision-proof system names (a timestamp suffix) and call
 * purgeTestRows(name) in a finally block. Matching is EXACT-PREFIX on the
 * system/source/component field so a real system can never be caught by it —
 * a cleanup helper that could delete real rows would be far worse than the
 * pollution it fixes.
 */
const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '../../data/cortex/memory');
const TABLES = ['event_log', 'component_ledger'];

/**
 * Remove every row whose system/source/component starts with `prefix`.
 * @param {string} prefix a collision-proof test system name
 * @returns {object} { [table]: removedCount }
 *
 * §ROOT-CAUSE FIXED 2026-09-13 — James's own live boot log showed THREE
 * real bl7-<timestamp> batches (300 rows total, exactly 100 each — one
 * per real test run) still actively polluting cortex/intelligence's
 * pattern-crystallization engine, DESPITE this function running in every
 * one of those test runs' own finally block. Traced, not guessed: this
 * function only ever edited the on-disk component_ledger.json/
 * event_log.json files directly — but component-ledger.js's write() (the
 * function that created the pollution) inserts through the real, live
 * cortex/memory/jaa-db.js singleton, which keeps its own in-memory Map
 * and a debounced (1500ms) dirty-flush timer per table (guardian/
 * jaa-store.js's real _schedule()/_flush()). The 100 rows this test just
 * wrote were STILL sitting dirty in that same process's memory, flush
 * already scheduled, at the exact moment this function edited the file
 * out from under it — ~1.5s later the real, already-scheduled flush
 * fired, read/merged live memory (never told the file had changed), and
 * wrote the polluted rows straight back, resurrecting exactly what this
 * function had just removed. Reproduced against the real numbers: 3
 * real bl7-* batches survived, matching 3 real test runs, matching this
 * exact race every single time.
 *
 * Real fix: purge through jaaDB.delete() FIRST (the same real object
 * component-ledger.js wrote through) — its own real, already-built
 * _pendingDeletes mechanism (guardian/jaa-store.js, §MULTI-PROCESS FIX
 * 2026-07-18) exists for exactly this "don't let a scheduled flush
 * resurrect a row this process just legitimately deleted" problem, just
 * never reached from here. The direct file edit below stays too, now as
 * a real, additional safety net for rows a DIFFERENT, already-exited
 * process left behind (this process's own jaaDB require has no memory of
 * those — nothing to resurrect them from — so the file edit alone is
 * correct and sufficient for that case).
 */
function purgeTestRows(prefix) {
  if (!prefix || typeof prefix !== 'string' || prefix.length < 6) {
    throw new Error(`purgeTestRows: refusing an unsafe prefix "${prefix}" — must be a collision-proof test name`);
  }
  const out = {};

  // Pass 1 — the real, live jaaDB singleton (fixes the in-memory/
  // scheduled-flush race for rows THIS process just wrote). Not folded
  // into `out`'s totals — pass 2 below re-reads the file as the real,
  // authoritative "what's actually gone from disk" count (§2.1); this
  // pass's own job is purely to stop a future flush resurrecting rows
  // pass 2 is about to remove, not to be counted twice for the same rows.
  try {
    const { jaaDB } = require('../../cortex/memory/jaa-db.js');
    const pred = (r) => String(r.system || r.source || r.systemId || r.component || '').startsWith(prefix);
    for (const t of TABLES) {
      try { jaaDB.delete(t, pred); }
      catch (_) { /* table not loaded in this process — pass 2 below still covers it */ }
    }
  } catch (_) { /* jaaDB unavailable in this process — pass 2 is still real and correct */ }

  // Pass 2 — direct file edit, the real, authoritative disk-state purge.
  for (const t of TABLES) {
    const f = path.join(STORE, `${t}.json`);
    if (!fs.existsSync(f)) continue;
    let rows;
    try { rows = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }
    if (!Array.isArray(rows)) continue;
    const keep = rows.filter(r => {
      const owner = String(r.system || r.source || r.systemId || r.component || '');
      return !owner.startsWith(prefix);
    });
    out[t] = rows.length - keep.length;
    if (out[t] > 0) {
      // Atomic — the live store is read by other processes while tests run.
      const tmp = `${f}.${process.pid}.purge.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(keep), 'utf8');
      fs.renameSync(tmp, f);
    }
  }
  return out;
}

module.exports = { purgeTestRows };
