'use strict';
/**
 * lib/nexus-self/store.js — the immutable base: content-addressed blobs and
 * append-only snapshots of the live Nexus tree.
 * comp_id: nexus.lib.nexus-self.store
 *
 * §0.39.261 — "immutable". What that means here, concretely:
 *
 *   objects/ab/cdef…   one blob per distinct file content, named by its sha256.
 *                      Written once, chmod 0444, never rewritten: a blob's name
 *                      IS its content, so there is nothing to update.
 *   snapshots/<h>.json one tree per snapshot: every file's path -> blob sha,
 *                      grouped by owning system. <h> is the hash of the tree
 *                      itself, so the same tree always gets the same name.
 *                      Written once, 0444.
 *   HEAD.json          the only mutable file: which snapshot is current, plus
 *                      the append-only list of every snapshot that has been.
 *   applies/<id>.json  the record of each change the apply gate wrote to the
 *                      live tree (before -> after blob per path), so any apply
 *                      can be audited or rolled back.
 *   index.json         a hash cache (path -> mtime/size/sha). An optimisation
 *                      only: a file whose mtime+size moved is always re-hashed.
 *
 * Nothing in this file writes to the live tree. That is the apply gate's job
 * (lib/nexus-self/apply.js), and only there.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const systems = require('./systems');

const MODULE_ID = 'nexus-self-store';
const VERSION = '1.0.0';

function storeRoot() {
  if (process.env.NEXUS_SELF_DIR) return process.env.NEXUS_SELF_DIR;
  return path.join(require('../../idearium/lib/data-dir.cjs').ideariumDataDir(), 'nexus-self');
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const canon = (v) => JSON.stringify(v, Object.keys(v).sort());

function _paths(root = storeRoot()) {
  return {
    root,
    objects: path.join(root, 'objects'),
    snapshots: path.join(root, 'snapshots'),
    applies: path.join(root, 'applies'),
    head: path.join(root, 'HEAD.json'),
    index: path.join(root, 'index.json'),
  };
}

function blobPath(sha, root = storeRoot()) {
  return path.join(_paths(root).objects, sha.slice(0, 2), sha.slice(2));
}

/** putBlob(buf) -> sha. Idempotent; an existing blob is never touched. */
function putBlob(buf, root = storeRoot()) {
  const sha = sha256(buf);
  const p = blobPath(sha, root);
  if (fs.existsSync(p)) return sha;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, buf);
  try { fs.chmodSync(tmp, 0o444); } catch (_) {}
  try { fs.renameSync(tmp, p); }
  catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} if (!fs.existsSync(p)) throw e; }
  return sha;
}

/** getBlob(sha) -> Buffer. Throws when missing — a snapshot naming a blob that is not there is corruption, never an empty file. */
function getBlob(sha, root = storeRoot()) {
  const p = blobPath(sha, root);
  const buf = fs.readFileSync(p);
  if (sha256(buf) !== sha) throw new Error(`[${MODULE_ID}] blob ${sha.slice(0, 12)} is corrupt (content hash differs)`);
  return buf;
}

function _readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; } }
function _writeJsonAtomic(p, obj, mode = null) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  if (mode) try { fs.chmodSync(tmp, mode); } catch (_) {}
  fs.renameSync(tmp, p);
}

/** walkLive(liveRoot) -> [{ rel, abs, size, mtimeMs }] for every file in the base. */
function walkLive(liveRoot = systems.ROOT) {
  const out = [];
  const walk = (dirRel) => {
    let ents;
    try { ents = fs.readdirSync(path.join(liveRoot, dirRel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;              // never follow out of the tree
      if (e.isDirectory()) { if (!systems.skipped(rel, true)) walk(rel); continue; }
      if (!e.isFile() || systems.skipped(rel, false)) continue;
      let st; try { st = fs.statSync(path.join(liveRoot, rel)); } catch (_) { continue; }
      out.push({ rel, abs: path.join(liveRoot, rel), size: st.size, mtimeMs: st.mtimeMs });
    }
  };
  walk('');
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/**
 * snapshot({ liveRoot }) -> { hash, created, systems:{ name:{ hash, fileCount, bytes } }, stats }
 * Hashes the live tree (re-using index.json for unchanged mtime+size), stores
 * every new blob, and writes the snapshot tree once. Returns the existing
 * snapshot unchanged when the tree has not moved (created:false).
 */
function snapshot({ liveRoot = systems.ROOT, root = storeRoot() } = {}) {
  const P = _paths(root);
  fs.mkdirSync(P.objects, { recursive: true });
  const index = _readJson(P.index, {});
  const nextIndex = {};
  const bySystem = {};
  let hashed = 0, reused = 0, bytes = 0;

  for (const f of walkLive(liveRoot)) {
    const prev = index[f.rel];
    let sha;
    if (prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs && fs.existsSync(blobPath(prev.sha, root))) {
      sha = prev.sha; reused++;
    } else {
      let buf; try { buf = fs.readFileSync(f.abs); } catch (_) { continue; }
      sha = putBlob(buf, root); hashed++;
    }
    nextIndex[f.rel] = { size: f.size, mtimeMs: f.mtimeMs, sha };
    const sys = systems.ownerOf(f.rel);
    (bySystem[sys] = bySystem[sys] || []).push([f.rel, sha, f.size]);
    bytes += f.size;
  }

  const sysSummary = {};
  for (const name of systems.names()) {
    const files = bySystem[name] || [];
    sysSummary[name] = { hash: sha256(JSON.stringify(files.map(([p, s]) => [p, s]))), fileCount: files.length, bytes: files.reduce((n, f) => n + f[2], 0) };
  }
  const hash = sha256(canon(Object.fromEntries(Object.entries(sysSummary).map(([k, v]) => [k, v.hash]))));
  const snapPath = path.join(P.snapshots, `${hash}.json`);
  const stats = { files: Object.keys(nextIndex).length, bytes, hashed, reused };
  _writeJsonAtomic(P.index, nextIndex);

  let created = false;
  if (!fs.existsSync(snapPath)) {
    _writeJsonAtomic(snapPath, { hash, createdAt: Date.now(), systems: sysSummary, files: bySystem }, 0o444);
    created = true;
  }
  const head = _readJson(P.head, { hash: null, history: [] });
  if (head.hash !== hash) {
    head.history = [...(head.history || []), { hash, at: Date.now(), from: head.hash || null }];
    head.hash = hash;
    head.updatedAt = Date.now();
    _writeJsonAtomic(P.head, head);
  }
  return { hash, created, systems: sysSummary, stats };
}

function head(root = storeRoot()) { return _readJson(_paths(root).head, { hash: null, history: [] }); }

/** loadSnapshot(hash) -> the full tree, or null. */
function loadSnapshot(hash, root = storeRoot()) {
  if (!hash) return null;
  return _readJson(path.join(_paths(root).snapshots, `${hash}.json`), null);
}

/** filesOf(snap, system) -> [[path, sha, size]] for one system (or all when system is null). */
function filesOf(snap, system = null) {
  if (!snap) return [];
  if (system) return snap.files[system] || [];
  return Object.values(snap.files).flat();
}

/**
 * checkout(hash, destDir, { system, link }) — materialize a snapshot (or one
 * system of it) into destDir. link:true hard-links the read-only blobs instead
 * of copying them (instant, zero extra bytes); a filesystem that refuses the
 * link gets a copy. Linked files are read-only, so a run that tries to write
 * over base code fails loudly instead of corrupting a blob shared by every
 * snapshot.
 */
function checkout(hash, destDir, { system = null, link = true, root = storeRoot() } = {}) {
  const snap = loadSnapshot(hash, root);
  if (!snap) throw new Error(`[${MODULE_ID}] snapshot ${String(hash).slice(0, 12)} not found`);
  let linked = 0, copied = 0;
  for (const [rel, sha] of filesOf(snap, system)) {
    const dest = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const src = blobPath(sha, root);
    if (link) {
      try { fs.linkSync(src, dest); linked++; continue; } catch (_) { /* cross-device or no hardlinks — copy */ }
    }
    fs.copyFileSync(src, dest);
    try { fs.chmodSync(dest, 0o644); } catch (_) {}
    copied++;
  }
  return { hash, dir: destDir, linked, copied, files: linked + copied };
}

module.exports = {
  MODULE_ID, VERSION, storeRoot, sha256, blobPath, putBlob, getBlob,
  walkLive, snapshot, head, loadSnapshot, filesOf, checkout, _paths,
};
