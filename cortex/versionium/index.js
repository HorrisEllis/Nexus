'use strict';
// ── versionium/index.js ───────────────────────────────────────────────────────
// UUID: mod-versionium-v5-0000-4000-0000-000000000001
//
// Causal version control. Reads artifacts + shape_samples for sigma deviations.
// Auto-commits when sigma > threshold. Writes to versionium_commits/branches.
//
// §M1: init(cfg) + stop() + setDeps(deps).
// §M2: reads: artifacts, shape_samples. writes: versionium_commits, versionium_branches,
//      versionium_file_index, versionium_calendar, event_log.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID     = 'versionium';
const SIGMA_THRESH  = 0.7;

let _interval  = null;
let _cfg       = {};
let _fileStore = null;
let _fileRefs  = null;

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 3000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

function setDeps({ fileStore, fileRefs }) {
  _fileStore = fileStore;
  _fileRefs  = fileRefs;
}

async function _tick() {
  try {
    // Check shape samples for sigma spikes
    const samples = jaaDB.tail('shape_samples', 20);
    const sigmaSpike = samples.find(s => (s.sigma || 0) > SIGMA_THRESH && !s.committed);

    if (sigmaSpike) {
      await _autoCommit(sigmaSpike);
    }

  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

async function _autoCommit(trigger) {
  const now      = Date.now();
  const commitId = 'vtm-' + uid().slice(0, 8);
  const branch   = 'main';

  // Get or create HEAD
  const branches = jaaDB.query('versionium_branches', r => r.branch === branch, 1);
  const parentId = branches[0]?.headCommitId || null;

  // Write commit
  const commit = jaaDB.insert('versionium_commits', {
    uuid:      commitId,
    commitId,
    parentId,
    branch,
    message:   `auto-commit: shape deviation sigma ${trigger.sigma?.toFixed(2)} at ${trigger.module || 'unknown'}`,
    wall:      now,
    source:    MODULE_ID,
    causedBy:  trigger.uuid,
  });

  // Store commit object in FileStore if available
  if (_fileStore) {
    try {
      const hash = _fileStore.put({ commitId, parentId, branch, trigger, wall: now });
      _fileRefs?.set(`versionium/commits/${commitId}`, hash);
    } catch {}
  }

  // Update branch HEAD
  if (branches.length) {
    jaaDB.update('versionium_branches', branches[0].uuid, {
      headCommitId: commitId,
      updatedAt:    now,
    });
  } else {
    jaaDB.insert('versionium_branches', {
      uuid:         branch + ':branch',
      branch,
      headCommitId: commitId,
      createdAt:    now,
      updatedAt:    now,
      source:       MODULE_ID,
    });
  }

  // Calendar entry
  const date = new Date(now).toISOString().slice(0, 10);
  jaaDB.insert('versionium_calendar', {
    uuid:     uid(),
    date,
    commitId,
    branch,
    source:   MODULE_ID,
    causedBy: trigger.uuid,
    ts:       now,
  });

  // Mark sample as committed
  jaaDB.update('shape_samples', trigger.uuid, { committed: true, commitId });

  jaaDB.insert('event_log', {
    uuid:     uid(),
    type:     'versionium.committed',
    payload:  { commitId, branch, parentId, sigma: trigger.sigma },
    source:   MODULE_ID,
    causedBy: trigger.uuid,
    ts:       now,
  });

  return commit;
}

// ── Manual commit API ─────────────────────────────────────────────────────────
function commit({ message, branch = 'main', causedBy = null } = {}) {
  const now      = Date.now();
  const commitId = 'vtm-' + uid().slice(0, 8);
  const branches = jaaDB.query('versionium_branches', r => r.branch === branch, 1);
  const parentId = branches[0]?.headCommitId || null;

  const c = jaaDB.insert('versionium_commits', {
    uuid: commitId, commitId, parentId, branch,
    message: message || 'manual commit',
    wall: now, source: MODULE_ID, causedBy,
  });

  if (branches.length) {
    jaaDB.update('versionium_branches', branches[0].uuid, { headCommitId: commitId, updatedAt: now });
  } else {
    jaaDB.insert('versionium_branches', { uuid: branch + ':branch', branch, headCommitId: commitId, createdAt: now, updatedAt: now, source: MODULE_ID });
  }

  jaaDB.insert('event_log', { uuid: uid(), type: 'versionium.committed', payload: { commitId, branch, parentId }, source: MODULE_ID, causedBy, ts: now });
  return c;
}

module.exports = { init, stop, setDeps, commit };
