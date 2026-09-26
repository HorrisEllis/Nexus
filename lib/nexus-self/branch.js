'use strict';
/**
 * lib/nexus-self/branch.js — editing Nexus from inside Nexus: COS branches of
 * one system's slice of the immutable base.
 * comp_id: nexus.lib.nexus-self.branch
 *
 * §0.39.261. A branch is a real COS branch (cos/playground/branch.js layout:
 * <compartment>/.nex/branches/<id>/{_branch.json, root/}) in the system's own
 * child compartment. Its root is a writable COPY of that system's files at the
 * base snapshot, at their Nexus-relative paths (guardian/server.js stays
 * guardian/server.js), so a change maps 1:1 onto the live tree.
 *
 * The base snapshot is recorded beside the root (nexus-self.json), never inside
 * it, so it can never be mistaken for a file of Nexus.
 *
 * changes(branch) compares the root against the base's blob hashes — that list
 * is exactly what the apply gate receives. workspace(branch) builds the FULL
 * tree (base, hard-linked read-only) with the branch's changes laid over it —
 * what the COS run menu runs, since no system runs alone.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const store = require('./store');
const systems = require('./systems');

const SIDE = 'nexus-self.json';

function _cos() {
  return {
    BranchEngine: require('../../cos/playground/branch.js').BranchEngine,
    compartmentPaths: require('../../cos/foundation/constants.js').compartmentPaths,
  };
}
function _branchDir(compartmentId, branchId) {
  return path.join(_cos().compartmentPaths(compartmentId).nexDir, 'branches', branchId);
}
function _walk(root, rel = '', out = []) {
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!systems.skipped(r, true)) _walk(root, r, out); }
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/** create({ system, compartment, base, label }) -> { id, root, base, system } */
function create({ system, compartment, base = null, label = null, root: storeDir = store.storeRoot() } = {}) {
  if (!systems.get(system)) throw new Error(`unknown system: ${system}`);
  if (!compartment || !compartment.id) throw new Error(`no compartment for ${system}`);
  const baseHash = base || store.head(storeDir).hash;
  if (!baseHash) throw new Error('no snapshot yet — sync the Nexus repo first');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-self-${system}-`));
  try {
    store.checkout(baseHash, tmp, { system, link: false, root: storeDir });
    const br = _cos().BranchEngine.fork({ id: compartment.id, fs: { root: tmp } }, { label: label || `${system} edit` });
    const meta = { system, base: baseHash, compartmentId: compartment.id, createdAt: Date.now() };
    fs.writeFileSync(path.join(_branchDir(compartment.id, br.id), SIDE), JSON.stringify(meta, null, 2));
    return { id: br.id, root: br.root, label: br.label, ...meta };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** get(compartment, branchId) -> { id, root, system, base, … } | null */
function get(compartment, branchId) {
  if (!/^br-[a-f0-9]{8}$/.test(String(branchId))) return null;
  const dir = _branchDir(compartment.id, branchId);
  let meta, man;
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, SIDE), 'utf8')); } catch (_) { return null; }
  try { man = JSON.parse(fs.readFileSync(path.join(dir, '_branch.json'), 'utf8')); } catch (_) { man = {}; }
  return { id: branchId, root: path.join(dir, 'root'), label: man.label || branchId, runs: man.runs || [], ...meta };
}

function list(compartment) {
  const dir = path.join(_cos().compartmentPaths(compartment.id).nexDir, 'branches');
  let names = []; try { names = fs.readdirSync(dir); } catch (_) { return []; }
  return names.map(n => get(compartment, n)).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

function _inBranch(br, rel) {
  const norm = path.posix.normalize(String(rel || '').replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!norm || norm.startsWith('..')) return null;
  if (systems.ownerOf(norm) !== br.system) return null;
  const abs = path.join(br.root, norm);
  if (!abs.startsWith(br.root + path.sep)) return null;
  return { rel: norm, abs };
}

function readFile(br, rel) {
  const p = _inBranch(br, rel);
  if (!p) return { error: `${rel} is not a ${br.system} path` };
  try { return { path: p.rel, content: fs.readFileSync(p.abs, 'utf8') }; } catch (e) { return { error: e.message }; }
}

function writeFile(br, rel, content) {
  const p = _inBranch(br, rel);
  if (!p) return { error: `${rel} is not a ${br.system} path — a branch only edits its own system` };
  if (typeof content !== 'string') return { error: 'content must be a string' };
  fs.mkdirSync(path.dirname(p.abs), { recursive: true });
  fs.writeFileSync(p.abs, content, 'utf8');
  return { ok: true, path: p.rel };
}

function deleteFile(br, rel) {
  const p = _inBranch(br, rel);
  if (!p) return { error: `${rel} is not a ${br.system} path` };
  if (!fs.existsSync(p.abs)) return { error: `not in branch: ${p.rel}` };
  fs.rmSync(p.abs, { force: true });
  return { ok: true, path: p.rel };
}

/** changes(br) -> [{ path, op:'add'|'modify'|'delete', content?: Buffer }] against the base. */
function changes(br, { root: storeDir = store.storeRoot() } = {}) {
  const snap = store.loadSnapshot(br.base, storeDir);
  const base = new Map(store.filesOf(snap, br.system).map(([p, s]) => [p, s]));
  const out = [];
  const seen = new Set();
  for (const rel of _walk(br.root)) {
    seen.add(rel);
    const buf = fs.readFileSync(path.join(br.root, rel));
    const sha = store.sha256(buf);
    const was = base.get(rel);
    if (!was) out.push({ path: rel, op: 'add', content: buf });
    else if (was !== sha) out.push({ path: rel, op: 'modify', content: buf });
  }
  for (const rel of base.keys()) if (!seen.has(rel)) out.push({ path: rel, op: 'delete', delete: true });
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** diffText(br, rel) — a unified-ish line diff of one changed text file (for the UI). */
function diffText(br, rel, { root: storeDir = store.storeRoot() } = {}) {
  const snap = store.loadSnapshot(br.base, storeDir);
  const sha = new Map(store.filesOf(snap, br.system).map(([p, s]) => [p, s])).get(rel);
  const before = sha ? store.getBlob(sha, storeDir).toString('utf8').split('\n') : [];
  let after = [];
  try { after = fs.readFileSync(path.join(br.root, rel), 'utf8').split('\n'); } catch (_) {}
  const out = [];
  let i = 0, j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++; continue; }
    const look = before.indexOf(after[j], i);
    if (j < after.length && (look === -1 || look - i > 50)) { out.push(`+${j + 1}: ${after[j]}`); j++; }
    else if (i < before.length) { out.push(`-${i + 1}: ${before[i]}`); i++; }
    if (out.length > 400) { out.push('… (diff truncated)'); break; }
  }
  return out.join('\n');
}

/**
 * workspace(br, { dir }) — the full Nexus tree at the branch's base (blobs
 * hard-linked, read-only) with the branch's changes laid over it. Returns the
 * dir; the caller removes it. Changed files are real copies (writable); every
 * unchanged file is the immutable blob itself.
 */
function workspace(br, { dir = null, root: storeDir = store.storeRoot() } = {}) {
  const ws = dir || fs.mkdtempSync(path.join(os.tmpdir(), `nexus-ws-${br.system}-`));
  store.checkout(br.base, ws, { link: true, root: storeDir });
  const ch = changes(br, { root: storeDir });
  for (const c of ch) {
    const dest = path.join(ws, c.path);
    fs.rmSync(dest, { force: true });
    if (c.op === 'delete') continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, c.content);
  }
  return { dir: ws, changed: ch.length };
}

function destroy(compartment, branchId) {
  if (!get(compartment, branchId)) return { ok: false, error: 'branch not found' };
  return _cos().BranchEngine.destroy({ id: compartment.id }, branchId);
}

function recordRun(compartment, branchId, result) {
  try { _cos().BranchEngine.recordRun({ id: compartment.id }, branchId, result); } catch (_) {}
}

module.exports = { create, get, list, readFile, writeFile, deleteFile, changes, diffText, workspace, destroy, recordRun, _sha: (b) => crypto.createHash('sha256').update(b).digest('hex') };
