'use strict';
/**
 * versionium/lib/files.js — the per-file layer under a repo snapshot (MCO-B).
 * UUID: nexus-versionium-files-v1-0000-2026-0920-jamesbrooks-001
 * Spec: versionium/spec/versionium.file-versioning.spec (written first, §8.5).
 *
 * plan()    — given the hashes of a repo's files, which contents does
 *             versionium need, which paths were deleted.
 * record()  — attach file rows to an existing repo-snapshot commit.
 * tree()    — the files (path, sha256, bytes) as of a commit, plus treeHash.
 * content() — one file's exact bytes as of a commit, every step verified.
 *
 * §NOTHING IS TRUSTED. A delta is stored only after applying it to the
 * previous bytes and matching the new bytes' sha256. Every read re-verifies
 * each step against the hashes the rows carry. A blob that fails its hash, a
 * row that is missing, or a delta that no longer applies is an Error naming
 * the file. It is never a quietly different file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { jaaDB } = require('./store.js');
const config = require('../config.js');
const td = require('./text-diff.js');

const T_FULL = 'file_snapshots';
const T_DELTA = 'file_delta';
const T_COMMITS = 'versionium_commits';
const REPO_SYSTEM = 'idearium.repo'; // the system idearium/repo/snapshot.js commits under
const ALL = 1e9; // JaaStore.all() treats no limit as unlimited; explicit for readers

class FilesError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

function treeHash(entries) {
  return sha256(entries.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(e => `${e.path}\t${e.sha256}\n`).join(''));
}

// A repo-relative path only: no absolute, no traversal, no NUL, no empty
// segment. These strings become keys and, later, restore targets.
function validPath(p) {
  if (typeof p !== 'string' || !p || p.length > 1024) return false;
  if (p.includes('\0') || p.includes('\\') || p.startsWith('/')) return false;
  return p.split('/').every(seg => seg && seg !== '.' && seg !== '..');
}

// ── blob store (content-addressed, raw bytes) ─────────────────────────────
function blobPath(sha) { return path.join(config.FILE_BLOB_DIR, sha.slice(0, 2), sha); }

function putBlob(buf, sha) {
  const p = blobPath(sha);
  if (fs.existsSync(p)) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, p);
  return true;
}

function getBlob(sha, file) {
  let buf;
  try { buf = fs.readFileSync(blobPath(sha)); }
  catch (e) { throw new FilesError('BLOB_MISSING', `stored copy of ${file} is missing (sha256 ${sha.slice(0, 12)}…)`, { file }); }
  if (sha256(buf) !== sha) throw new FilesError('BLOB_CORRUPT', `stored copy of ${file} fails its sha256 — refusing to return it`, { file });
  return buf;
}

// ── commit chain ──────────────────────────────────────────────────────────
function getCommit(commitId) {
  return jaaDB.get(T_COMMITS, { commitId }) || null;
}

/** commitIds from the oldest ancestor to `commitId` inclusive. */
function chainTo(commitId) {
  const out = []; const seen = new Set();
  let cur = commitId;
  while (cur) {
    if (seen.has(cur)) throw new FilesError('CHAIN_CYCLE', `commit chain loops at ${cur}`);
    seen.add(cur);
    const c = getCommit(cur);
    if (!c) throw new FilesError('NO_COMMIT', `no commit ${cur}`);
    out.push(cur);
    cur = c.parentId || null;
  }
  return out.reverse();
}

function headOfRepo(repository) {
  const rows = jaaDB.query(T_COMMITS, r => r.branch === `repo-${repository}` && r.system === REPO_SYSTEM, ALL);
  return rows.length ? rows[rows.length - 1].commitId : null;
}

// ── events for a repository, restricted to a chain ────────────────────────
// -> Map(path -> [event ...]) ordered oldest first
function eventsFor(repository, chain) {
  const order = new Map(chain.map((id, i) => [id, i]));
  const byPath = new Map();
  const push = (path_, ev) => { if (!byPath.has(path_)) byPath.set(path_, []); byPath.get(path_).push(ev); };
  for (const r of jaaDB.query(T_FULL, x => x.repository === repository && order.has(x.commit_ref), ALL)) {
    push(r.file_path, { kind: r.kind, row: r, ord: order.get(r.commit_ref), ts: r.ts });
  }
  for (const r of jaaDB.query(T_DELTA, x => x.repository === repository && order.has(x.commit_ref), ALL)) {
    push(r.file_path, { kind: 'delta', row: r, ord: order.get(r.commit_ref), ts: r.ts });
  }
  for (const list of byPath.values()) list.sort((a, b) => a.ord - b.ord || a.ts - b.ts);
  return byPath;
}

function lastAnchor(list) {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].kind === 'full' || list[i].kind === 'deleted') return i;
  return -1;
}

// The file's state at the end of `list`: { sha256, bytes } or null (deleted /
// never existed), plus how many deltas sit on top of the last full copy.
function replay(list, file, wantBytes = true) {
  if (!list || !list.length) return { state: null, deltas: 0 };
  const a = lastAnchor(list);
  if (a === -1) throw new FilesError('CHAIN_BROKEN', `${file}: deltas exist with no full copy before them`, { file });
  let cur = null; let deltas = 0;
  for (let i = a; i < list.length; i++) {
    const ev = list[i];
    if (ev.kind === 'deleted') { cur = null; deltas = 0; }
    else if (ev.kind === 'full') { cur = wantBytes ? getBlob(ev.row.sha256, file) : { sha: ev.row.sha256, lazy: true, bytes: ev.row.bytes }; deltas = 0; }
    else {
      if (!wantBytes) { cur = { sha: ev.row.result_sha256, lazy: true, bytes: ev.row.result_bytes }; deltas++; continue; }
      if (!cur) throw new FilesError('CHAIN_BROKEN', `${file}: a delta applies to a file that does not exist`, { file });
      if (sha256(cur) !== ev.row.base_sha256) throw new FilesError('CHAIN_BROKEN', `${file}: a delta's base does not match the previous version`, { file });
      let next;
      try { next = Buffer.from(td.apply(cur.toString('utf8'), ev.row.diff), 'utf8'); }
      catch (e) { throw new FilesError('DELTA_FAILED', `${file}: a stored delta no longer applies (${e.message})`, { file }); }
      if (sha256(next) !== ev.row.result_sha256) throw new FilesError('DELTA_FAILED', `${file}: applying a stored delta does not reproduce its recorded sha256`, { file });
      cur = next; deltas++;
    }
  }
  if (cur === null) return { state: null, deltas };
  return wantBytes ? { state: { sha256: sha256(cur), bytes: cur }, deltas } : { state: { sha256: cur.sha, bytes: cur.bytes }, deltas };
}

/** files as of a commit, without reading any content. */
function tree(repository, commitId) {
  const chain = chainTo(commitId);
  const files = [];
  for (const [file, list] of eventsFor(repository, chain)) {
    const { state } = replay(list, file, false);
    if (state) files.push({ path: file, sha256: state.sha256, bytes: state.bytes });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { repository, commitId, files, treeHash: treeHash(files) };
}

/** one file's exact bytes as of a commit. */
function content(repository, commitId, file) {
  const chain = chainTo(commitId);
  const list = eventsFor(repository, chain).get(file);
  const { state } = replay(list, file, true);
  if (!state) throw new FilesError('NOT_IN_TREE', `${file} is not part of ${commitId}`, { file });
  return { path: file, sha256: state.sha256, bytes: state.bytes };
}

function normalizeTree(t) {
  if (!Array.isArray(t)) throw new FilesError('BAD_INPUT', 'tree must be an array of {path, sha256, bytes}');
  const seen = new Set(); const out = [];
  for (const e of t) {
    if (!e || !validPath(e.path)) throw new FilesError('BAD_PATH', `unsafe or invalid path: ${JSON.stringify(e && e.path)}`);
    if (!HEX64.test(e.sha256 || '')) throw new FilesError('BAD_INPUT', `${e.path}: sha256 must be 64 lowercase hex characters`);
    if (!Number.isInteger(e.bytes) || e.bytes < 0) throw new FilesError('BAD_INPUT', `${e.path}: bytes must be a non-negative integer`);
    if (seen.has(e.path)) throw new FilesError('BAD_INPUT', `duplicate path in tree: ${e.path}`);
    seen.add(e.path);
    out.push({ path: e.path, sha256: e.sha256, bytes: e.bytes });
  }
  return out;
}

function baseFiles(baseCommitId, repository) {
  if (!baseCommitId) return new Map();
  return new Map(tree(repository, baseCommitId).files.map(f => [f.path, f]));
}

/**
 * plan({ repository, tree }) -> what versionium needs before record().
 * tooLarge paths must be left out of the tree the caller commits: they are
 * not kept, and a snapshot must not claim to restore what it did not keep.
 */
function plan({ repository, tree: t } = {}) {
  if (!repository) throw new FilesError('BAD_INPUT', 'repository is required');
  const entries = normalizeTree(t);
  const baseCommitId = headOfRepo(repository);
  const base = baseFiles(baseCommitId, repository);
  const tooLarge = entries.filter(e => e.bytes > config.FILE_MAX_BYTES).map(e => e.path);
  const kept = entries.filter(e => e.bytes <= config.FILE_MAX_BYTES);
  const keptPaths = new Set(kept.map(e => e.path));
  const need = kept.filter(e => !base.has(e.path) || base.get(e.path).sha256 !== e.sha256).map(e => e.path);
  return {
    baseCommitId, maxFileBytes: config.FILE_MAX_BYTES, maxRecordBytes: config.FILE_MAX_RECORD_BYTES,
    need, unchanged: kept.length - need.length, tooLarge,
    deleted: [...base.keys()].filter(p => !keptPaths.has(p)).sort(),
  };
}

function rowsForCommit(repository, commitId) {
  return {
    full: jaaDB.query(T_FULL, r => r.repository === repository && r.commit_ref === commitId, ALL),
    delta: jaaDB.query(T_DELTA, r => r.repository === repository && r.commit_ref === commitId, ALL),
  };
}

function dropRowsForCommit(repository, commitId) {
  jaaDB.delete(T_FULL, r => r.repository === repository && r.commit_ref === commitId);
  jaaDB.delete(T_DELTA, r => r.repository === repository && r.commit_ref === commitId);
}

/**
 * record({ repository, commitId, tree, contents:[{path, content_b64}] })
 * Attaches the file layer to an existing repo-snapshot commit. `tree` is the
 * COMPLETE set of kept files at that commit. Idempotent: recording the same
 * tree again returns alreadyRecorded, and a partial earlier attempt is
 * repaired (its rows can belong to no other commit).
 */
function record({ repository, commitId, tree: t, contents = [], mode = 'delta' } = {}) {
  if (!repository || !commitId) throw new FilesError('BAD_INPUT', 'repository and commitId are required');
  // idearium's pipeline.snapshot_mode. 'full' stores every changed file as a full copy (no deltas).
  if (mode !== 'delta' && mode !== 'full') throw new FilesError('BAD_INPUT', `mode must be 'delta' or 'full', got ${JSON.stringify(mode)}`);
  const commit = getCommit(commitId);
  if (!commit) throw new FilesError('NO_COMMIT', `no commit ${commitId}`);
  if (commit.system !== REPO_SYSTEM || !commit.state || commit.state.repository !== repository) {
    throw new FilesError('WRONG_COMMIT', `${commitId} is not a repo snapshot of ${repository} — refusing to attach files to it`);
  }
  const entries = normalizeTree(t);
  for (const e of entries) if (e.bytes > config.FILE_MAX_BYTES) throw new FilesError('TOO_LARGE', `${e.path} is ${e.bytes} bytes, over the ${config.FILE_MAX_BYTES} limit — leave it out of the tree (see plan().tooLarge)`);
  const wantHash = treeHash(entries);

  const existing = rowsForCommit(repository, commitId);
  if (existing.full.length + existing.delta.length > 0) {
    let same = false;
    try { same = tree(repository, commitId).treeHash === wantHash; } catch (_) { same = false; }
    if (same) return { ok: true, alreadyRecorded: true, commitId, treeHash: wantHash, counts: { full: existing.full.filter(r => r.kind === 'full').length, delta: existing.delta.length, deleted: existing.full.filter(r => r.kind === 'deleted').length } };
    dropRowsForCommit(repository, commitId); // partial/conflicting earlier attempt
  }

  const provided = new Map();
  for (const c of contents) {
    if (!c || !validPath(c.path)) throw new FilesError('BAD_PATH', `unsafe or invalid path in contents: ${JSON.stringify(c && c.path)}`);
    provided.set(c.path, Buffer.from(String(c.content_b64 || ''), 'base64'));
  }

  const parentId = commit.parentId || null;
  const parentChain = parentId ? chainTo(parentId) : [];
  const parentEvents = parentId ? eventsFor(repository, parentChain) : new Map();
  const baseMap = baseFiles(parentId, repository);
  const keptPaths = new Set(entries.map(e => e.path));

  // what needs content, and is it there and is it what the tree says
  const changed = entries.filter(e => !baseMap.has(e.path) || baseMap.get(e.path).sha256 !== e.sha256);
  // 0.39.263 — content staged ahead (stage(), in batches under the per-request cap) is
  // taken from the blob store: content-addressed, re-verified by getBlob
  for (const e of changed) {
    if (provided.has(e.path) || !HEX64.test(e.sha256) || !fs.existsSync(blobPath(e.sha256))) continue;
    try { provided.set(e.path, getBlob(e.sha256, e.path)); } catch (_) { /* corrupt staged copy: stays missing */ }
  }
  const missing = changed.filter(e => !provided.has(e.path)).map(e => e.path);
  if (missing.length) return { ok: false, code: 'MISSING_CONTENT', missing };
  for (const e of changed) {
    const buf = provided.get(e.path);
    if (buf.length !== e.bytes || sha256(buf) !== e.sha256) {
      throw new FilesError('HASH_MISMATCH', `${e.path}: the content sent does not match the sha256/bytes in the tree`, { file: e.path });
    }
  }

  // build every row in memory first; nothing is written unless all of it works
  const now = Date.now();
  const fullRows = []; const deltaRows = []; const blobs = [];
  let storedBytes = 0, rawBytes = 0;
  for (const e of changed) {
    const buf = provided.get(e.path);
    rawBytes += buf.length;
    let prev = null; let deltas = 0;
    const list = parentEvents.get(e.path);
    if (list) { const r = replay(list, e.path, true); prev = r.state; deltas = r.deltas; }

    let asDelta = null;
    if (mode === 'delta' && prev && deltas < config.FILE_KEYFRAME_INTERVAL && td.isDiffable(prev.bytes) && td.isDiffable(buf)) {
      const a = prev.bytes.toString('utf8'), b = buf.toString('utf8');
      const d = td.diff(a, b);
      let proven = false;
      try { proven = d !== '' && sha256(Buffer.from(td.apply(a, d), 'utf8')) === e.sha256; } catch (_) { proven = false; }
      if (proven && d.length < buf.length * config.FILE_DELTA_MAX_RATIO) asDelta = d;
    }
    if (asDelta !== null) {
      deltaRows.push({
        uuid: jaaDB.uid(), repository, file_path: e.path, commit_ref: commitId, diff: asDelta,
        base_sha256: prev.sha256, result_sha256: e.sha256, result_bytes: buf.length,
        bytes_saved: buf.length - asDelta.length, ts: now,
      });
      storedBytes += asDelta.length;
    } else {
      fullRows.push({ uuid: jaaDB.uid(), repository, file_path: e.path, commit_ref: commitId, kind: 'full', sha256: e.sha256, bytes: buf.length, ts: now });
      blobs.push([buf, e.sha256]);
      storedBytes += buf.length;
    }
  }
  const deleted = [...baseMap.keys()].filter(p => !keptPaths.has(p)).sort();
  for (const p of deleted) {
    fullRows.push({ uuid: jaaDB.uid(), repository, file_path: p, commit_ref: commitId, kind: 'deleted', sha256: null, bytes: 0, ts: now });
  }

  for (const [buf, sha] of blobs) putBlob(buf, sha);
  for (const r of fullRows) jaaDB.insert(T_FULL, r);
  for (const r of deltaRows) jaaDB.insert(T_DELTA, r);

  // the layer must now reproduce exactly the tree it was given
  const got = tree(repository, commitId).treeHash;
  if (got !== wantHash) {
    dropRowsForCommit(repository, commitId);
    throw new FilesError('TREE_MISMATCH', `after recording, the file layer's tree hash (${got.slice(0, 12)}…) does not equal the tree sent (${wantHash.slice(0, 12)}…); rows removed`);
  }
  return {
    ok: true, alreadyRecorded: false, commitId, treeHash: wantHash,
    counts: { full: fullRows.filter(r => r.kind === 'full').length, delta: deltaRows.length, deleted: deleted.length, unchanged: entries.length - changed.length },
    bytes: { raw: rawBytes, stored: storedBytes, saved: rawBytes - storedBytes },
  };
}

/** the limits a caller needs BEFORE it reads or hashes anything. */
function limits() {
  return { maxFileBytes: config.FILE_MAX_BYTES, maxRecordBytes: config.FILE_MAX_RECORD_BYTES, keyframeInterval: config.FILE_KEYFRAME_INTERVAL };
}

/**
 * stage({ contents:[{path, content_b64}] }) — put file content into the blob store
 * ahead of record(), so a repo whose first version is larger than one request
 * (FILE_MAX_RECORD_BYTES) is recorded in batches. Content-addressed and verified:
 * the sha256 is computed here, never taken from the caller. A staged blob no
 * commit ever references is inert. 0.39.263.
 */
function stage({ contents = [] } = {}) {
  let staged = 0, already = 0, bytes = 0;
  const out = [];
  for (const c of contents) {
    if (!c || !validPath(c.path)) throw new FilesError('BAD_PATH', `unsafe or invalid path in contents: ${JSON.stringify(c && c.path)}`);
    const buf = Buffer.from(String(c.content_b64 || ''), 'base64');
    if (buf.length > config.FILE_MAX_BYTES) throw new FilesError('TOO_LARGE', `${c.path} is ${buf.length} bytes, over the ${config.FILE_MAX_BYTES} limit`);
    const sha = sha256(buf);
    if (putBlob(buf, sha)) { staged++; bytes += buf.length; } else already++;
    out.push({ path: c.path, sha256: sha });
  }
  return { ok: true, staged, already, bytes, files: out };
}

/**
 * versions(file, { repository }) — every commit in which this path was written
 * (or deleted), newest first: [{ repository, commitId, sha256, kind, wall }].
 * sha256 is the file's content AS OF that commit (a delta row's result hash), so
 * a caller holding a file's bytes can find the version that holds exactly them —
 * what loom used `git log -1 -- <file>` for (0.39.263, James: "loom depends on
 * the .git i want versionium to hold the history for each repo").
 */
function versions(file, { repository = null, limit = 200 } = {}) {
  if (!validPath(file)) throw new FilesError('BAD_PATH', `unsafe or invalid path: ${JSON.stringify(file)}`);
  const match = (r) => r.file_path === file && (!repository || r.repository === repository);
  const out = [];
  for (const r of jaaDB.query(T_FULL, match, ALL)) out.push({ repository: r.repository, commitId: r.commit_ref, sha256: r.sha256 || null, kind: r.kind === 'deleted' ? 'deleted' : 'full', ts: r.ts });
  for (const r of jaaDB.query(T_DELTA, match, ALL)) out.push({ repository: r.repository, commitId: r.commit_ref, sha256: r.result_sha256, kind: 'delta', ts: r.ts });
  for (const v of out) { const c = getCommit(v.commitId); v.wall = c ? c.wall : v.ts; v.message = c ? c.message : null; delete v.ts; }
  // §0.39.359 — commits made in the same millisecond tie on wall; the later one is the one further down its chain
  // (VH-002 failed under load with three commits in one ms)
  const depth = new Map();
  const d = (id) => { if (!depth.has(id)) { let n = 0; try { n = chainTo(id).length; } catch (_) { n = 0; } depth.set(id, n); } return depth.get(id); };
  return out.sort((a, b) => ((b.wall || 0) - (a.wall || 0)) || (d(b.commitId) - d(a.commitId))).slice(0, limit);
}

module.exports = { plan, record, stage, tree, content, limits, versions, treeHash, sha256, validPath, FilesError, T_FULL, T_DELTA, REPO_SYSTEM };
