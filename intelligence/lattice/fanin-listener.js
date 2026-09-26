'use strict';
/**
 * intelligence/lattice/fanin-listener.js — wires associative-lattice.js to
 * ledger-fanin. This is build_order_v0_2 steps 8 and 9 from
 * docs/nexus-relationship-shape.spec, and nothing else:
 *
 *   8. Event-triggered recompute — piggyback on real system events
 *   9. Background sweep for low-traffic pairs (default 10 min)
 *
 * Before this file, associative-lattice.js's own header said it plainly:
 * "nothing in guardian/cortex/idearium/etc calls updateEdge() yet." It was
 * real and callable, wired to nothing. This connects it to lib/ledger-fanin
 * (§8.6, already the single place every system's events fan in — see its
 * own header) instead of inventing a second event-collection mechanism.
 *
 * ── Listener (step 8) ───────────────────────────────────────────────────
 * Every component-ledger row already carries {system, component, action,
 * causedBy, ts, intent}. A row is a cross-system RELATIONSHIP event only
 * when causedBy names a *different* system than the one that logged it —
 * self-caused rows (causedBy === system, or null) are one system's own
 * internal activity, not a pair. Inventing an edge for those would be
 * exactly the "fabricated-mapping mistake" associative-lattice.js's own
 * header already calls out and refuses to do — so this doesn't either.
 *
 * ── Poll reconciler (step 9) ────────────────────────────────────────────
 * The listener only sees events emitted *after* it subscribes — nothing
 * before boot, and nothing from a system that doesn't route through
 * component-ledger.write() yet. The spec's own background-sweep step
 * exists for exactly this: catch pairs the live stream missed. This reads
 * the ledger folders directly (data/ledger/<system>/<command>/<date>.jsonl)
 * and treats each row's own `ts` as the source of truth for what's already
 * been applied — not file position, not wall-clock poll time — so a
 * restart replays only what's actually new, and replaying an already-seen
 * row is a harmless idempotent re-update, not a double-count (CFR fields
 * are current-state, not accumulators).
 */

const fs   = require('fs');
const path = require('path');

const LEDGER_ROOT = path.join(__dirname, '..', '..', 'data', 'ledger');
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 min — matches the spec's own default

// A system's own internal name for itself, when it differs from its ledger
// directory name. Found empirically by running pollReconcile against the
// real ledger and checking what it produced (see commit note) — clear-glass
// logs causedBy:'clear-glass' on its own rows, but its ledger directory is
// 'cg'; erosmancer-os logs causedBy:'erosmancer-os', ledger directory 'eros'.
// Without this, those rows looked like cross-system edges (cg→clear-glass)
// when they're actually one system referring to itself.
const SYSTEM_ALIASES = { 'clear-glass': 'cg', 'erosmancer-os': 'eros' };

const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _knownSystems = null; // lazy — computed once from the real ledger directory listing
function _getKnownSystems() {
  if (_knownSystems) return _knownSystems;
  _knownSystems = new Set();
  try {
    for (const ent of fs.readdirSync(LEDGER_ROOT, { withFileTypes: true })) {
      if (ent.isDirectory()) _knownSystems.add(ent.name);
    }
  } catch (_) { /* leave empty — _deriveEdge will then reject everything, safe default */ }
  return _knownSystems;
}

function _normalizeSystem(name) {
  return SYSTEM_ALIASES[name] || name;
}

let _lastSeenTs = 0;      // watermark — only rows newer than this get replayed on sweep
let _sweepTimer = null;

/**
 * _deriveEdge(row) — the one place "is this row a relationship event"
 * gets decided. Returns { from, to, eventType, sigmaScore } or null.
 * Kept as a named, single function so the mapping rule is auditable in
 * one place, not scattered across call sites.
 */
function _deriveEdge(row) {
  if (!row || !row.system || !row.causedBy) return null;
  if (_UUID_RE.test(row.causedBy)) return null; // entity/session/contract ref, not a system

  const from = _normalizeSystem(row.system);
  const to   = _normalizeSystem(row.causedBy);
  if (to === from) return null; // self-caused (incl. via alias) — not a pair

  const known = _getKnownSystems();
  if (!known.has(from) || !known.has(to)) return null; // not a real system on both sides

  const eventType = row.component || row.action || row.type || 'unknown';
  const sigmaScore = (row.sigma && typeof row.sigma.score === 'number') ? row.sigma.score : 0;
  return { from, to, eventType, sigmaScore };
}

/**
 * _applyRow(row, lattice) — shared by both the listener and the sweep, so
 * "what counts as a relationship event" can't drift between the two paths.
 */
async function _applyRow(row, lattice) {
  const edge = _deriveEdge(row);
  if (!edge) return null;
  const result = await lattice.updateEdge(edge.from, edge.to, edge.eventType, edge.sigmaScore);
  if (typeof row.ts === 'number' && row.ts > _lastSeenTs) _lastSeenTs = row.ts;
  return result;
}

/**
 * attachListener(fanin, lattice) — step 8. Subscribes to the fan-in the
 * same way activity-log/intelligence/autopilot/co-pilot already do in
 * lib/ledger-fanin/boot.js (§1.2 — isolated; a throw here doesn't break
 * fan-out to the other four).
 */
function attachListener(fanin, lattice) {
  fanin.subscribe('lattice', (row) => {
    _applyRow(row, lattice).catch(() => {}); // fire-and-forget, matches other fan-in consumers' own discipline
  });
  return { ok: true };
}

/**
 * _walkLedgerFiles() — every <date>.jsonl under every
 * data/ledger/<system>/<system>.<command>/ folder. Cheap directory walk,
 * not a watch — this runs once per sweep, not per file change.
 */
function _walkLedgerFiles() {
  const files = [];
  let systems;
  try { systems = fs.readdirSync(LEDGER_ROOT, { withFileTypes: true }); } catch (_) { return files; }
  for (const sysEnt of systems) {
    if (!sysEnt.isDirectory()) continue;
    const sysDir = path.join(LEDGER_ROOT, sysEnt.name);
    let components;
    try { components = fs.readdirSync(sysDir, { withFileTypes: true }); } catch (_) { continue; }
    for (const compEnt of components) {
      if (!compEnt.isDirectory()) continue;
      const compDir = path.join(sysDir, compEnt.name);
      let dates;
      try { dates = fs.readdirSync(compDir); } catch (_) { continue; }
      for (const f of dates) {
        if (f.endsWith('.jsonl')) files.push(path.join(compDir, f));
      }
    }
  }
  return files;
}

/**
 * pollReconcile(lattice) — step 9. Reads every ledger file, applies only
 * rows with ts > _lastSeenTs (the watermark, updated as rows are applied —
 * see header on why ts is the source of truth here, not file offsets).
 * Returns a summary instead of throwing, so a scheduled sweep failure is
 * visible without taking down the timer loop.
 */
async function pollReconcile(lattice) {
  const startWatermark = _lastSeenTs;
  let scanned = 0, applied = 0, skipped = 0, errors = 0;

  for (const file of _walkLedgerFiles()) {
    let lines;
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch (_) { continue; }
    for (const line of lines) {
      scanned++;
      let row;
      try { row = JSON.parse(line); } catch (_) { errors++; continue; }
      if (typeof row.ts !== 'number' || row.ts <= startWatermark) { skipped++; continue; }
      try {
        const result = await _applyRow(row, lattice);
        if (result) applied++; else skipped++;
      } catch (_) { errors++; }
    }
  }

  return { scanned, applied, skipped, errors, watermarkBefore: startWatermark, watermarkAfter: _lastSeenTs };
}

/**
 * startSweep(lattice, opts) — the actual 10-minute background timer the
 * spec calls for. Call once at boot, alongside attachListener. Returns a
 * stop function (same shape as fanin.subscribe's unsubscribe return) so
 * tests and shutdown paths can clean it up.
 */
function startSweep(lattice, opts = {}) {
  const intervalMs = opts.intervalMs || SWEEP_INTERVAL_MS;
  if (_sweepTimer) clearInterval(_sweepTimer);
  _sweepTimer = setInterval(() => { pollReconcile(lattice).catch(() => {}); }, intervalMs);
  if (_sweepTimer.unref) _sweepTimer.unref(); // don't hold the process open for this alone
  return () => { clearInterval(_sweepTimer); _sweepTimer = null; };
}

function _resetForTest() { _lastSeenTs = 0; if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; } }

module.exports = {
  attachListener, pollReconcile, startSweep,
  _deriveEdge, _resetForTest, // exported for tests — same discipline as ledger-fanin's own _resetForTest
  MODULE_ID: 'lattice-fanin-listener', VERSION: '1.0.0',
};
