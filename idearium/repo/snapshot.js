/**
 * idearium/repo/snapshot.js — repository snapshots (§33), MCO3.
 * UUID: nexus-idearium-repo-snapshot-v1-0000-2026-0920-jamesbrooks-001
 *
 * Spec: idearium/spec/idearium.repo-snapshot.spec (written first, §8.5).
 *
 * §33 says a snapshot must record: source hash, Git commit (0.39.263: the repo's
 * versionium commit chain — see versionField), atlas version,
 * chunk index version, graph version, dependency state, environment, test
 * state, verification state. This module builds that record from the
 * artifacts the import pipeline already wrote, and commits it through
 * versionium's existing commit pipeline. It adds no store of its own and
 * changes nothing in versionium.
 *
 * §UNKNOWN IS NOT ZERO. All nine keys are ALWAYS present. A value that
 * cannot be determined carries `available:false` and a reason. It is never
 * omitted, never 0, never ''. That is what makes "the file layer was not
 * asked" distinguishable from "there is no earlier version".
 *
 * §NOT VERSIONS THAT DO NOT EXIST. atlas.json and chunks/index.json declare
 * no version. This module does not invent one. Their identity is their
 * content hash (and their own generatedAt where they carry it), recorded as
 * such, with declaredVersion:null. graph.json does declare one, and it is
 * recorded.
 *
 * §TRANSPORT IS INJECTED. commitRepoSnapshot() takes a `commit` function
 * and knows nothing about HTTP or ports. The API layer passes one that
 * posts to versionium; the test passes versionium's real engine.commit().
 * Same record either way, so what is proven in-process is what the server
 * ships.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { readLazyVerification } from './verify-lazy.js';
import { collectFiles, treeHashOf } from './snapshot-files.js';

export const MODULE_ID = 'nexus-idearium-repo-snapshot-v1-0000-2026-0920-jamesbrooks-001';
export const SCHEMA_VERSION = '1.0.0';

// Repo snapshots commit under their OWN system. IdeaOS.snapshots() and
// restoreSnapshot() read history?system=idearium; a repo snapshot under
// that system would show up in the idea snapshot list, and restoring it
// would blank ideas/specs/gaps. See the spec's hazard_found.
export const SNAPSHOT_SYSTEM = process.env.IDEARIUM_SNAPSHOT_SYSTEM || 'idearium.repo';
export const STATE_KIND = 'repo-snapshot';

// §0.39.263 — James: "loom depends on the .git i want versionium to hold the history
// for each repo." §33's "Git commit" is now the repo's VERSIONIUM commit chain
// (versionCommit): a repo's history is its snapshots on branch repo-<uuid>, and
// nothing here reads a .git. Records written before this carry gitCommit instead;
// readers (summarizeRepoSnapshots, the Versionium tab) accept either.
export const MUST_RECORD = Object.freeze([
  'sourceHash', 'versionCommit', 'atlasVersion', 'chunkIndexVersion', 'graphVersion',
  'dependencyState', 'environment', 'testState', 'verificationState',
]);

const MAX_LISTED = 50; // cap on failed-file lists carried in a record

const MANIFEST_BASENAMES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'requirements.txt', 'pyproject.toml', 'Pipfile', 'Pipfile.lock', 'poetry.lock',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock',
  'Gemfile', 'Gemfile.lock', 'pom.xml', 'build.gradle', 'composer.json', 'composer.lock',
]);
const LOCKFILE_BASENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Pipfile.lock', 'poetry.lock',
  'go.sum', 'Cargo.lock', 'Gemfile.lock', 'composer.lock',
]);

export function snapshotBranch(repoUuid) { return `repo-${repoUuid}`; }

function sha256(x) { return crypto.createHash('sha256').update(x).digest('hex'); }

// { ok, value } | { ok:false, missing:true } | { ok:false, error }
function readJson(p) {
  if (!fs.existsSync(p)) return { ok: false, missing: true };
  try { return { ok: true, value: JSON.parse(fs.readFileSync(p, 'utf8')) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function unavailable(reason, extra = {}) { return { available: false, reason, ...extra }; }

// ── sourceHash ────────────────────────────────────────────────────────────
function hashEntries(entries) {
  return sha256(
    entries.filter(e => e.contentHash)
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map(e => `${e.path}\t${e.contentHash}\n`).join('')
  );
}

function sourceHashField(repoDir, filesIdx, repo) {
  if (!filesIdx.ok) return unavailable(filesIdx.missing ? 'no indexes/files.json — repo has not been indexed' : `indexes/files.json unreadable: ${filesIdx.error}`);
  const entries = filesIdx.value;
  const hashed = entries.filter(e => e.contentHash);
  const indexedHash = hashEntries(entries);

  // Re-derive from the files as they are on disk now. contentHash in the
  // index is sha256 of the utf8 text (import-pipeline.js sha256()).
  const disk = []; const missing = []; const mismatched = [];
  for (const e of hashed) {
    let text;
    try { text = fs.readFileSync(path.join(repoDir, e.path), 'utf8'); }
    catch (_) { missing.push(e.path); continue; }
    const h = sha256(Buffer.from(text, 'utf8'));
    if (h !== e.contentHash) mismatched.push(e.path);
    disk.push({ path: e.path, contentHash: h });
  }
  const diskHash = hashEntries(disk);
  const fresh = missing.length === 0 && mismatched.length === 0;
  return {
    available: true,
    value: indexedHash,
    algorithm: 'sha256 over sorted "path<TAB>contentHash" lines of indexed files',
    indexedFileCount: hashed.length,
    unhashedFileCount: entries.length - hashed.length,
    diskHash,
    fresh, // false = the atlas/chunks/graph in this record describe OLDER source
    mismatched: mismatched.slice(0, MAX_LISTED), missing: missing.slice(0, MAX_LISTED),
    repoRootHash: repo?.rootHash || null,
  };
}

// ── versionCommit ─────────────────────────────────────────────────────────
// Where this snapshot sits in the repo's own history, which lives in versionium:
// branch repo-<uuid>, parent = the snapshot before it. The parent is known once
// versionium's file layer has planned the snapshot (plan().baseCommitId, filled in
// by commitRepoSnapshot); without a file layer it is stated as not asked.
function versionField(repo) {
  return {
    available: true, source: 'versionium', branch: snapshotBranch(repo.uuid),
    parent: null, parentKnown: false,
    note: 'the repo\'s history is its versionium snapshots on this branch; the commit this record becomes is the version',
  };
}

// ── atlas / chunk index / graph ───────────────────────────────────────────
function fileIdentity(p) {
  if (!fs.existsSync(p)) return null;
  return { sha256: sha256(fs.readFileSync(p)), bytes: fs.statSync(p).size };
}

function atlasField(repoDir) {
  const p = path.join(repoDir, 'atlas.json');
  const id = fileIdentity(p);
  if (!id) return unavailable('no atlas.json — repo has not been through the import pipeline');
  const j = readJson(p);
  return {
    available: true, declaredVersion: null,
    identity: 'sha256 of atlas.json (the file declares no version)',
    sha256: id.sha256, generatedAt: j.ok ? (j.value.generatedAt ?? null) : null,
    fileCount: j.ok ? (j.value.fileCount ?? null) : null,
  };
}

function chunkIndexField(repoDir) {
  const p = path.join(repoDir, 'chunks', 'index.json');
  const id = fileIdentity(p);
  if (!id) return unavailable('no chunks/index.json — repo has not been chunked');
  const j = readJson(p);
  return {
    available: true, declaredVersion: null,
    identity: 'sha256 of chunks/index.json (the file declares no version)',
    sha256: id.sha256, chunkCount: j.ok && Array.isArray(j.value) ? j.value.length : null,
  };
}

function graphField(repoDir) {
  const p = path.join(repoDir, 'graph.json');
  const id = fileIdentity(p);
  if (!id) return unavailable('no graph.json — the GRAPHING step has not produced one');
  const j = readJson(p);
  if (!j.ok) return unavailable(`graph.json unreadable: ${j.error}`, { sha256: id.sha256 });
  const g = j.value;
  return {
    available: true, declaredVersion: g.version ?? null, sha256: id.sha256,
    generatedAt: g.generatedAt ?? null,
    nodeCount: g.nodeCount ?? null, edgeCount: g.edgeCount ?? null,
    unresolvedCount: g.unresolvedCount ?? null,
  };
}

// ── dependencyState ───────────────────────────────────────────────────────
function dependencyField(repoDir, filesIdx) {
  if (!filesIdx.ok) return unavailable('no indexes/files.json — cannot enumerate manifests');
  const manifests = filesIdx.value
    .filter(e => MANIFEST_BASENAMES.has(path.basename(e.path)))
    .map(e => ({ path: e.path, sha256: e.contentHash || null, lockfile: LOCKFILE_BASENAMES.has(path.basename(e.path)) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  let declared = null;
  const rootPkg = path.join(repoDir, 'package.json');
  if (fs.existsSync(rootPkg)) {
    const j = readJson(rootPkg);
    declared = j.ok
      ? { source: 'package.json', dependencies: Object.keys(j.value.dependencies || {}).length,
          devDependencies: Object.keys(j.value.devDependencies || {}).length,
          optionalDependencies: Object.keys(j.value.optionalDependencies || {}).length }
      : { source: 'package.json', error: `unreadable: ${j.error}` };
  }
  return {
    available: true, manifests, declared,
    lockfilePresent: manifests.some(m => m.lockfile),
    // null, not false, when there is no package.json: "not installed" is a
    // claim about a Node project; a Python repo has no node_modules to lack.
    nodeModulesPresent: declared ? fs.existsSync(path.join(repoDir, 'node_modules')) : null,
  };
}

// ── environment ───────────────────────────────────────────────────────────
function environmentField(repo) {
  return {
    available: true,
    compartmentId: repo?.compartmentId || null,
    host: { node: process.version, platform: process.platform, arch: process.arch },
    capturedBy: 'the process taking this snapshot',
    runtime: null,
    runtimeReason: 'the repo runtime is owned by its Compartment (§32) and is not resolved by the snapshot',
  };
}

// ── verificationState / testState ─────────────────────────────────────────
function tierState(t) {
  if (t.status === 'not_applicable') return 'not_applicable';
  return t.passed ? 'passed' : 'failed';
}

function verificationField(repoDir) {
  const v = readJson(path.join(repoDir, 'verification.json'));
  if (!v.ok) return unavailable(v.missing ? 'no verification.json' : `verification.json unreadable: ${v.error}`);
  const lazy = readLazyVerification(repoDir);
  const tiers = (v.value.tiers || []).map(t => ({
    level: t.level, name: t.name, state: tierState(t), failures: (t.failures || []).length,
  }));
  let lazyInfo;
  if (!lazy) {
    lazyInfo = { present: false };
  } else if (lazy.status === 'pending') {
    lazyInfo = { present: true, status: 'pending' };
    for (const level of ['L6', 'L7', 'L8']) tiers.push({ level, state: 'pending', failures: 0 });
  } else {
    lazyInfo = { present: true, status: lazy.status, finishedAt: lazy.finishedAt ?? null, scopedTo: (lazy.scopedTo || []).length };
    for (const t of lazy.tiers || []) tiers.push({ level: t.level, name: t.name, state: tierState(t), failures: (t.failures || []).length });
  }
  return {
    available: true, status: v.value.status ?? null, level: v.value.level ?? null,
    tiers, lazy: lazyInfo,
    failedTiers: tiers.filter(t => t.state === 'failed').map(t => t.level),
  };
}

function testField(repoDir) {
  const lazy = readLazyVerification(repoDir);
  if (!lazy) return unavailable('no verification.lazy.json — the lazy L6 pass has not been scheduled for this repo');
  if (lazy.status === 'pending') return unavailable('lazy verification has not finished', { status: 'pending' });
  const l6 = (lazy.tiers || []).find(t => t.level === 'L6');
  if (!l6) return unavailable(`lazy verification finished (${lazy.status}) without an L6 tier`);
  const found = l6.testsFound ?? 0; const ran = l6.testsRun ?? 0;
  // "passed" with zero tests found would be a claim nothing supports.
  const status = found === 0 ? 'no_tests' : ran === 0 ? 'not_run' : (l6.passed ? 'passed' : 'failed');
  const failed = (l6.results || []).filter(r => r.status === 'failed').map(r => r.file);
  return {
    available: true, status, testsFound: found, testsRun: ran, testsSkipped: l6.testsSkipped ?? 0,
    failedCount: failed.length, failed: failed.slice(0, MAX_LISTED), lazyFinishedAt: lazy.finishedAt ?? null,
  };
}

// ── the record ────────────────────────────────────────────────────────────
export function buildSnapshotRecord({ repo, repoDir, now = Date.now() } = {}) {
  if (!repo || !repo.uuid) return { ok: false, code: 'NO_REPO', error: 'repo record with a uuid is required' };
  if (!repoDir || !fs.existsSync(repoDir)) return { ok: false, code: 'NO_DIR', error: `repo directory does not exist: ${repoDir}` };
  if (!fs.existsSync(path.join(repoDir, 'atlas.json'))) {
    return { ok: false, code: 'NOT_INDEXED', error: 'repo has not been through the import pipeline (no atlas.json) — run POST /api/repos/:uuid/chunk first' };
  }
  const filesIdx = readJson(path.join(repoDir, 'indexes', 'files.json'));
  const mustRecord = {
    sourceHash:        sourceHashField(repoDir, filesIdx, repo),
    versionCommit:     versionField(repo),
    atlasVersion:      atlasField(repoDir),
    chunkIndexVersion: chunkIndexField(repoDir),
    graphVersion:      graphField(repoDir),
    dependencyState:   dependencyField(repoDir, filesIdx),
    environment:       environmentField(repo),
    testState:         testField(repoDir),
    verificationState: verificationField(repoDir),
  };
  return {
    ok: true,
    record: {
      kind: STATE_KIND, schema: SCHEMA_VERSION,
      repository: repo.uuid, repoName: repo.name || null, takenAt: now,
      mustRecord,
    },
  };
}

// { complete, missing[] } — a key counts only if present AND carries a
// boolean `available`, so a bare null or an empty object does not pass.
export function verifyMustRecord(state) {
  const mr = state && state.mustRecord;
  const missing = MUST_RECORD.filter(k => !mr || typeof mr[k] !== 'object' || mr[k] === null || typeof mr[k].available !== 'boolean');
  return { complete: missing.length === 0, missing };
}

export function isRepoSnapshotState(state) {
  return !!state && typeof state === 'object' && state.kind === STATE_KIND;
}

/**
 * commitRepoSnapshot({ repo, repoDir, commit, message, causedBy, fileLayer })
 * `commit` is async-or-sync: ({message, branch, causedBy, system, state})
 * => commit row, or { error }. Never receives anything but the record.
 *
 * `fileLayer` (optional, MCO-B) = { limits(), plan(entries), record({commitId, tree, contents, mode}), stage?(contents) }
 * stage (0.39.263): content over one request's cap is staged in batches first, then recorded.
 * `snapshotMode` is idearium's pipeline.snapshot_mode: 'delta' (default) or 'full'.
 * — versionium's per-file layer. Without it this behaves exactly as MCO3: the
 * derived-state record only, no files, and the snapshot cannot restore.
 * With it the repo's raw bytes are captured too. Everything that can fail
 * BEFORE the commit (limits, plan, size cap) fails before it, so a refusal
 * leaves no snapshot behind. If the commit succeeds and only the file record
 * fails, the commit stays and the result says so (code FILES_RECORD_FAILED).
 */
export async function commitRepoSnapshot({ repo, repoDir, commit, message = null, causedBy = null, now, fileLayer = null, snapshotMode = 'delta', provenance = null } = {}) {
  if (typeof commit !== 'function') return { ok: false, code: 'NO_TRANSPORT', error: 'commit function is required' };
  const built = buildSnapshotRecord({ repo, repoDir, now });
  if (!built.ok) return built;
  const check = verifyMustRecord(built.record);
  if (!check.complete) return { ok: false, code: 'INCOMPLETE', error: `record is missing §33 fields: ${check.missing.join(', ')}` };
  if (provenance) built.record.provenance = provenance;   // §0.40.0 VR1 — who, why, which files, the desktop checkpoint before it

  let kept = null; let contents = null;
  if (fileLayer) {
    try {
      const limits = await fileLayer.limits();
      const col = collectFiles(repo, repoDir, limits.maxFileBytes);
      const plan = await fileLayer.plan(col.entries);
      const tooLarge = new Set(plan.tooLarge || []);
      kept = col.entries.filter(e => !tooLarge.has(e.path));
      const need = new Set(plan.need || []);
      const needBytes = kept.filter(e => need.has(e.path)).reduce((n, e) => n + e.bytes, 0);
      const needed = kept.filter(e => need.has(e.path));
      if (needBytes > limits.maxRecordBytes) {
        if (typeof fileLayer.stage !== 'function') {
          return { ok: false, code: 'FILES_TOO_BIG', error: `changed content is ${needBytes} bytes, over the per-snapshot limit of ${limits.maxRecordBytes} (VERSIONIUM_FILE_MAX_RECORD_BYTES) — no snapshot was made` };
        }
        // 0.39.263 — over one request: stage the content in batches under the cap
        // (versionium verifies each by hash), then record with nothing inline.
        let batch = [], size = 0;
        const flush = async () => { if (batch.length) await fileLayer.stage(batch); batch = []; size = 0; };
        for (const e of needed) {
          const b64 = col.buffers.get(e.path).toString('base64');
          if (size + b64.length > limits.maxRecordBytes && batch.length) await flush();
          batch.push({ path: e.path, content_b64: b64 }); size += b64.length;
        }
        await flush();
        contents = [];
      } else {
        contents = needed.map(e => ({ path: e.path, content_b64: col.buffers.get(e.path).toString('base64') }));
      }
      built.record.mustRecord.versionCommit.parent = plan.baseCommitId || null;
      built.record.mustRecord.versionCommit.parentKnown = true;
      built.record.files = {
        layer: 'versionium', treeHash: treeHashOf(kept), fileCount: kept.length,
        totalBytes: kept.reduce((n, e) => n + e.bytes, 0), changedFiles: need.size,
        deletedFiles: (plan.deleted || []).length, baseCommitId: plan.baseCommitId || null,
        skipped: [...col.skipped, ...[...tooLarge].map(p => ({ path: p, reason: 'over the per-file limit' }))],
      };
    } catch (e) {
      return { ok: false, code: 'FILES_PLAN_FAILED', error: `the file layer was not available before commit — no snapshot was made: ${e.message}` };
    }
  }

  let row;
  try {
    row = await commit({
      message: message || `repo snapshot: ${repo.name || repo.uuid}`,
      branch: snapshotBranch(repo.uuid), causedBy, system: SNAPSHOT_SYSTEM, state: built.record,
    });
  } catch (e) {
    return { ok: false, code: 'COMMIT_FAILED', error: `versionium commit threw: ${e.message}` };
  }
  if (!row || row.error) return { ok: false, code: 'COMMIT_FAILED', error: row?.error || 'versionium returned no commit' };

  let filesResult = null;
  if (fileLayer) {
    try {
      filesResult = await fileLayer.record({ commitId: row.commitId, tree: kept, contents, mode: snapshotMode });
    } catch (e) {
      return {
        ok: false, code: 'FILES_RECORD_FAILED', commit: row, record: built.record,
        error: `snapshot ${row.commitId} was committed but its file layer was NOT recorded (${e.message}); it cannot restore files. Take a new snapshot.`,
      };
    }
    if (!filesResult || filesResult.treeHash !== built.record.files.treeHash) {
      return {
        ok: false, code: 'FILES_RECORD_FAILED', commit: row, record: built.record,
        error: `snapshot ${row.commitId} was committed but the file layer's tree hash does not match the snapshot's; it cannot restore files. Take a new snapshot.`,
      };
    }
  }
  return { ok: true, commit: row, record: built.record, files: filesResult };
}

// Newest first. Only this repo's repo-snapshot commits — never an idea
// snapshot, never another repo's.
export function summarizeRepoSnapshots(rows, repoUuid) {
  return (rows || [])
    .filter(r => r && r.system === SNAPSHOT_SYSTEM && isRepoSnapshotState(r.state) && r.state.repository === repoUuid)
    .sort((a, b) => (b.wall || 0) - (a.wall || 0))
    .map(r => {
      const m = r.state.mustRecord || {};
      return {
        commitId: r.commitId || r.uuid, ts: r.wall ?? null, message: r.message ?? null,
        sourceHash: m.sourceHash?.available ? m.sourceHash.value : null,
        fresh: m.sourceHash?.available ? m.sourceHash.fresh : null,
        parentCommit: m.versionCommit?.available ? (m.versionCommit.parent || null) : null,
        gitCommit: m.gitCommit?.available ? m.gitCommit.commit : null,   // records from before 0.39.263 only
        verification: m.verificationState?.available ? m.verificationState.status : null,
        tests: m.testState?.available ? m.testState.status : null,
        // MCO-B: has a file layer (a restore may be possible), and how big. Whether
        // the layer was actually recorded is checked by restore, not assumed here.
        files: r.state.files ? { count: r.state.files.fileCount, bytes: r.state.files.totalBytes } : null,
        // §0.47.0 OS1 — what the commit touched and who stands behind it (VR1's provenance), so a file's history and the
        // Code tab can be read from the list (null for baselines and records from before 0.40.0)
        provenance: r.state.provenance ? { by: r.state.provenance.by || [], refs: r.state.provenance.refs || [], files: r.state.provenance.files || [], checkpoint: r.state.provenance.checkpoint || null } : null,
      };
    });
}
