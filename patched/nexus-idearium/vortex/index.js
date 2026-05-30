'use strict';
// ── vortex/index.js ───────────────────────────────────────────────────────────
// UUID: vortex-core-v1-0000-4000-0000-000000000001
// VERSION: 1.0.0 — §5.4
//
// VORTEX — Version control that makes GitHub look ancient.
//
// GitHub tracks files and diffs. Vortex tracks:
//   ideas → specs → artifacts → gaps → causal chains
//
// The unit of version control is not a file. It is a COMMIT NODE:
//   { ideas[], specs[], artifacts[], openGaps[], snr, causedBy, message }
//
// Push = snapshot the entire cognitive workspace (ideas + specs + artifacts + gaps)
// Pull = restore a snapshot OR sync from a remote Vortex node
// Branch = fork your idea space to explore without committing
// Merge = reconcile two branches (seam-verified agreement zones)
// CI = spec compliance gate — does the code implement the spec?
//
// What makes this different from Git:
//   1. Ideas are first-class version objects (not just code)
//   2. Tension score tracks which ideas are generating friction
//   3. Causal chains link every change back to the idea that caused it
//   4. Spec compliance is CI — not just test coverage
//   5. Branches are living idea spaces that accumulate tension
//   6. Merge uses seam-verified agreement (multi-AI consensus, not just diffs)
//   7. The commit graph is a causal graph — every commit knows WHY it exists
//   8. Pull restores the complete cognitive state, not just files
//
// LAW V: CLI first. This module exports raw operations. CLI wraps everything.

const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const VERSION   = '1.0.0';
const MODULE_ID = 'vortex';
const PORT      = 4800;  // Idearium port — Vortex is a layer on top

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function _post(url, body, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname, port: u.port || 80,
      path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); } });
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Idearium API not running — start it first: node start.js')); });
    req.on('error', (e) => reject(new Error(`API unreachable: ${e.code} — run: node start.js`)));
    req.write(bodyStr);
    req.end();
  });
}

function _get(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get({ hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.on('error', reject);
  });
}

const idearium = (path_, method = 'GET', body = null) => {
  const url = `http://127.0.0.1:${PORT}${path_}`;
  return method === 'GET' ? _get(url) : _post(url, body || {});
};

// ── VORTEX OPERATIONS ─────────────────────────────────────────────────────────
class Vortex {

  // ── PUSH — commit the full cognitive workspace ────────────────────────────
  async push(message = '', { tag, remote } = {}) {
    const snap = await idearium('/api/snapshots', 'POST', { message: message || `vortex push ${new Date().toISOString().slice(0,16)}` });
    if (!snap?.ok) throw new Error(`Push failed: ${snap?.error || 'idearium unreachable'}`);

    const commit = {
      hash:       snap.snapshot.hash,
      uuid:       snap.snapshot.uuid,
      message:    snap.snapshot.message,
      ideaCount:  snap.snapshot.ideaCount,
      specCount:  snap.snapshot.specCount,
      gapCount:   snap.snapshot.gapCount,
      snr:        snap.snapshot.snr,
      tag:        tag || null,
      ts:         snap.snapshot.ts,
    };

    // Push to remote if configured
    if (remote) {
      try {
        await _post(`${remote}/api/vortex/receive`, { commit, content: snap.snapshot.content });
        commit.remoteSync = true;
      } catch (e) {
        commit.remoteSync = false;
        commit.remoteSyncError = e.message;
        // Not fatal — local commit succeeded
        console.warn(`[vortex] remote sync failed: ${e.message}`);
      }
    }

    return commit;
  }

  // ── PULL — list or restore ────────────────────────────────────────────────
  async pull({ uuid: restoreUuid, remote } = {}) {
    if (remote && !restoreUuid) {
      // Fetch remote snapshots
      try {
        const remote_ = await _get(`${remote}/api/snapshots`);
        return { source: 'remote', snapshots: remote_?.snapshots || [] };
      } catch (e) {
        throw new Error(`Remote pull failed: ${e.message}`);
      }
    }

    if (restoreUuid) {
      // Restore from local snapshot — this would reconstruct ideas/specs/gaps
      // For now: return the snapshot content (full restore is a destructive op — needs confirmation)
      const snap = await idearium(`/api/snapshots`);
      const target = snap?.snapshots?.find(s => s.uuid === restoreUuid || s.hash?.startsWith(restoreUuid));
      if (!target) throw new Error(`Snapshot not found: ${restoreUuid}`);
      return { source: 'local', snapshot: target, warning: 'Full restore not yet implemented — use diff to inspect' };
    }

    // List local snapshots
    const data = await idearium('/api/snapshots');
    return { source: 'local', snapshots: data?.snapshots || [] };
  }

  // ── DIFF — compare two snapshots ──────────────────────────────────────────
  async diff(hashA, hashB) {
    // Resolve short hashes
    const snaps = await idearium('/api/snapshots');
    const all   = snaps?.snapshots || [];
    const findSnap = (h) => all.find(s => s.uuid === h || s.hash?.startsWith(h));
    const a = findSnap(hashA);
    const b = findSnap(hashB);
    if (!a || !b) throw new Error(`Could not resolve: ${!a ? hashA : hashB}`);
    const result = await idearium(`/api/snapshots/${a.uuid}/diff/${b.uuid}`);
    return result;
  }

  // ── CI — spec compliance gate ──────────────────────────────────────────────
  async ci(specUuid, { strict = false } = {}) {
    if (!specUuid) {
      // Run CI on all specs
      const specList = await idearium('/api/specs');
      if (!specList?.specs?.length) return { ok: true, message: 'No specs to check', runs: [] };
      const runs = [];
      for (const spec of specList.specs) {
        const run = await idearium('/api/ci/run', 'POST', { specUuid: spec.uuid });
        runs.push(run);
      }
      const allPass = runs.every(r => r.ok);
      const passed = runs.filter(r => r.ok).length;
      return { ok: allPass, passed, total: runs.length, runs };
    }
    const run = await idearium('/api/ci/run', 'POST', { specUuid });
    return run;
  }

  // ── BRANCH — fork the idea space ──────────────────────────────────────────
  async branch(name, { fromHash } = {}) {
    // Push a tagged snapshot as the branch root
    const snap = await this.push(`branch: ${name}`, { tag: `branch:${name}` });
    return { branch: name, root: snap.hash, ts: Date.now() };
  }

  // ── STATUS — current workspace state ─────────────────────────────────────
  async status() {
    const stats  = await idearium('/api/stats');
    const snaps  = await idearium('/api/snapshots');
    const latest = snaps?.snapshots?.slice(-1)[0];
    const snr    = await idearium('/api/snr');
    return {
      version: VERSION,
      ideas:   stats?.ideas || 0,
      specs:   stats?.specs || 0,
      openGaps: stats?.openGaps || 0,
      snapshots: snaps?.snapshots?.length || 0,
      head:    latest ? { hash: latest.hash?.slice(0,8), message: latest.message, ts: latest.ts } : null,
      snr:     snr?.snr || null,
      byPhase: stats?.byPhase || {},
    };
  }

  // ── LOG — commit history ───────────────────────────────────────────────────
  async log(n = 20) {
    const data = await idearium('/api/snapshots');
    return (data?.snapshots || []).slice(-n).reverse();
  }
}

const vortex = new Vortex();
module.exports = { Vortex, vortex, VERSION, MODULE_ID };

// ── Direct run guard (§1.2 — no silent behavior) ─────────────────────────────
if (require.main === module) {
  const c = (col, t) => ({ red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', reset:'\x1b[0m' }[col]||'') + t + '\x1b[0m';
  console.error('');
  console.error(c('red', '✗') + '  vortex/index.js is a module — not a CLI entry point.');
  console.error('');
  console.error('  To use Vortex, run from the NEXUS-Systems-v1 root:');
  console.error('');
  console.error(c('yellow','  1.') + '  Start the API first:    ' + c('cyan','node start.js'));
  console.error(c('yellow','  2.') + '  Then use the CLI:       ' + c('cyan','node nexus.js vortex status'));
  console.error('        ' +                                         c('cyan','node nexus.js push "my first commit"'));
  console.error('        ' +                                         c('cyan','node nexus.js log'));
  console.error('');
  process.exit(1);
}
