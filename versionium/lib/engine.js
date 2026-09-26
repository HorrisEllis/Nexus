'use strict';
/**
 * versionium/lib/engine.js — versionium's own commit/restore/calendar/
 * getState logic, migrated wholesale from cortex/versionium/index.js
 * (§VS1, docs/2026-09-02-versionium-sovereign-and-cleanup-phasemap.spec).
 * UUID: nexus-versionium-engine-v1-0000-2026-0902-jamesbrooks-001
 *
 * §MOVED, NOT REWRITTEN — every real behavior below (kernel-based
 * temporal replay, live-field sigma auto-commit, the calendar-write bug
 * fix, the SnapshotGate state-merge) is the exact same logic that lived
 * at cortex/versionium/index.js before this migration, carrying its own
 * full real history in-line rather than starting a clean slate that
 * hides how it got here. The one real change: `jaaDB` now comes from
 * this system's own sovereign store (./store.js), not cortex's shared
 * one — see store.js's own header for why, and for the one deliberate
 * exception (event_log stays on cortex's shared store, read by
 * causality.js, not this file).
 */
const { jaaDB, uid } = require('./store.js');
const { createKernel } = require('../../intelligence/rfr2/kernel');
const { snapshot: _krnSnapshot } = require('../../intelligence/rfr2/compress');
const { createReplayContext } = require('../../intelligence/rfr2/context');
const config = require('../config.js');

const MODULE_ID = 'versionium';
const SIGMA_THRESH = config.SIGMA_THRESH;
const AUTOCOMMIT_COOLDOWN_MS = config.AUTOCOMMIT_COOLDOWN_MS;

let _interval  = null;
let _cfg       = {};
let _fileStore = null;
let _fileRefs  = null;
let _fieldReader = null;
let _lastAutoCommitAt = 0;
const _kernel = createKernel({ ringCap: config.KERNEL_RING_CAP });

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? config.POLL_MS);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

function setDeps({ fileStore, fileRefs, fieldReader } = {}) {
  _fileStore  = fileStore;
  _fileRefs   = fileRefs;
  if (fieldReader) _fieldReader = fieldReader;
}

async function _tick() {
  try {
    // §VS1 2026-09-02 — the live-field trigger (cortex's own _field.
    // entropy, previously read in-process since Versionium lived inside
    // cortex's boot.js) is now injected the same way, but cortex must
    // supply it over sovereign transport since this is a separate
    // process now — see versionium/server.js's own boot wiring for the
    // real cross-process fieldReader() this receives.
    if (_fieldReader) {
      const field = await _fieldReader();
      const sigma = field?.entropy ?? 0;
      const now   = Date.now();
      if (sigma > SIGMA_THRESH && (now - _lastAutoCommitAt) >= AUTOCOMMIT_COOLDOWN_MS) {
        _lastAutoCommitAt = now;
        await _autoCommit({
          sigma, module: field?.regime || 'cortex-field',
          uuid: null, system: 'cortex',
        });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

function _kernelSnapshotFor(commitId, branch, message, causedBy) {
  try {
    _kernel.ingest('versionium.commit', { commitId, branch, message }, { source: MODULE_ID, causedBy: causedBy || null });
    return _krnSnapshot(_kernel);
  } catch (e) {
    console.warn(`[${MODULE_ID}] kernel snapshot failed for ${commitId}: ${e.message}`);
    return null;
  }
}

function _writeCalendarEntry({ commitId, branch, causedBy, ts }) {
  const date = new Date(ts).toISOString().slice(0, 10);
  jaaDB.insert('versionium_calendar', {
    uuid: uid(), date, commitId, branch, source: MODULE_ID, causedBy, ts,
  });
}

async function _autoCommit(trigger) {
  const now      = Date.now();
  const commitId = 'vtm-' + uid().slice(0, 8);
  const branch   = 'main';

  const branches = jaaDB.query('versionium_branches', r => r.branch === branch, 1);
  const parentId = branches[0]?.headCommitId || null;

  const message = `auto-commit: sigma deviation ${trigger.sigma?.toFixed(2)} at ${trigger.module || 'unknown'}`;
  const snap    = _kernelSnapshotFor(commitId, branch, message, trigger.uuid);

  const commit = jaaDB.insert('versionium_commits', {
    uuid: commitId, commitId, parentId, branch,
    system: trigger.system || null,
    message, wall: now, source: MODULE_ID, causedBy: trigger.uuid,
    snapshot: snap,
  });

  if (_fileStore) {
    try {
      const hash = _fileStore.put({ commitId, parentId, branch, trigger, wall: now });
      _fileRefs?.set(`versionium/commits/${commitId}`, hash);
    } catch {}
  }

  if (branches.length) {
    jaaDB.update('versionium_branches', branches[0].uuid, { headCommitId: commitId, updatedAt: now });
  } else {
    jaaDB.insert('versionium_branches', { uuid: branch + ':branch', branch, headCommitId: commitId, createdAt: now, updatedAt: now, source: MODULE_ID });
  }

  _writeCalendarEntry({ commitId, branch, causedBy: trigger.uuid, ts: now });

  // §VS1 — this path (live-field trigger, via _tick) never passes
  // through routes/versionium.js's own _emitEvent, so the real event log
  // event-taxonomy.js documents needs its own write here, not just on
  // the HTTP-triggered commit path.
  try {
    jaaDB.insert('versionium_events', { uuid: uid(), type: 'versionium.autocommit.triggered', payload: { sigma: trigger.sigma, regime: trigger.module }, ts: now });
    jaaDB.insert('versionium_events', { uuid: uid(), type: 'versionium.committed', payload: { commitId, branch, system: trigger.system }, ts: now });
  } catch (_) {}

  // §VS1 — event_log is the one deliberate exception (see this file's own
  // header and store.js's): a real, cross-system, shared table, written
  // through cortex's own jaaDB module even from this now-separate
  // process, matching every other sovereign system's existing
  // convention for that table.
  try {
    require('../../cortex/memory/jaa-db').jaaDB.insert('event_log', {
      uuid: uid(), type: 'versionium.committed',
      payload: { commitId, branch, parentId, sigma: trigger.sigma },
      source: MODULE_ID, causedBy: trigger.uuid, ts: now,
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] shared event_log write failed (non-fatal): ${e.message}`);
  }

  return commit;
}

function commit({ message, branch = 'main', causedBy = null, system = null, state = null } = {}) {
  const now       = Date.now();
  const commitId  = 'vtm-' + uid().slice(0, 8);
  const branches  = jaaDB.query('versionium_branches', r => r.branch === branch, 1);
  const parentId  = branches[0]?.headCommitId || null;
  const realMsg   = message || 'manual commit';
  const snap      = _kernelSnapshotFor(commitId, branch, realMsg, causedBy);
  const rawState  = state !== null ? JSON.parse(JSON.stringify(state)) : null;

  const c = jaaDB.insert('versionium_commits', {
    uuid: commitId, commitId, parentId, branch, system,
    message: realMsg, wall: now, source: MODULE_ID, causedBy,
    snapshot: snap, state: rawState,
  });

  if (branches.length) {
    jaaDB.update('versionium_branches', branches[0].uuid, { headCommitId: commitId, updatedAt: now });
  } else {
    jaaDB.insert('versionium_branches', { uuid: branch + ':branch', branch, headCommitId: commitId, createdAt: now, updatedAt: now, source: MODULE_ID });
  }

  try {
    require('../../cortex/memory/jaa-db').jaaDB.insert('event_log', {
      uuid: uid(), type: 'versionium.committed',
      payload: { commitId, branch, parentId, system },
      source: MODULE_ID, causedBy, ts: now,
    });
  } catch (e) {
    console.warn(`[${MODULE_ID}] shared event_log write failed (non-fatal): ${e.message}`);
  }

  _writeCalendarEntry({ commitId, branch, causedBy, ts: now });
  return c;
}

function restore(commitId) {
  const rows = jaaDB.query('versionium_commits', r => r.commitId === commitId, 1);
  const row  = rows[0];
  if (!row) return { error: `no commit "${commitId}"` };
  if (!row.snapshot) return { error: `commit "${commitId}" has no stored snapshot (made before real temporal replay was wired in, or its snapshot capture failed at commit time)` };

  try {
    const context = createReplayContext(row.snapshot);
    return { commit: row, context };
  } catch (e) {
    return { error: `replay context creation failed: ${e.message}` };
  }
}

function calendar(date) {
  return jaaDB.query('versionium_calendar', r => r.date === date, 100);
}

function getState(commitId) {
  const rows = jaaDB.query('versionium_commits', r => r.commitId === commitId, 1);
  const row  = rows[0];
  if (!row) return { error: `no commit "${commitId}"` };
  if (row.state === null || row.state === undefined) {
    return { error: `commit "${commitId}" has no stored state (committed without one, or predates the SnapshotGate merge)` };
  }
  return { commit: row, state: row.state };
}

module.exports = { init, stop, setDeps, commit, restore, calendar, getState };
