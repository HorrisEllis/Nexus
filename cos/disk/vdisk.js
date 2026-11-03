'use strict';
/**
 * cos/disk/vdisk.js — a compartment's virtual disk: one qcow2 file holding its metadata, its files, all its data and its snapshots (DK6, DK7, 0.60.383).
 * Spec: cos/spec/cos-manager.spec MOD-COS-VDISK · Map: docs/2026-11-02-cos-disk-phasemap.spec DK_D3, DK6, DK7.
 *
 * James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data, snapshots, system state."
 *
 * <system>.qcow2 — QEMU's own disk format (the one cos/compartment/qemu-runtime.js boots), compressed clusters, one ext4 filesystem labelled
 * with the system's name:
 *   /.cos/disk.json    the metadata (nexus.cos.disk/1, kind 'virtual'): declaration, spec files by hash, coverage, the kernel it runs on, every file
 *   /.cos/spec/…       the system's spec and declaration, copied in
 *   /code/<system>/…   its files
 *   /state/<system>/…  all its data (on by default here: a virtual disk is the whole machine; withState:false leaves it out)
 * Snapshots are qcow2 internal snapshots in the same file. refresh() writes the system's current files into the disk's active layer and keeps
 * every snapshot (qemu-img convert -n: proved before building, 2026-11-03). Nothing needs root: the filesystem is written with mke2fs -d (a
 * folder into ext4) and read with debugfs, from a raw copy qemu-img makes. A host without qemu-img, mke2fs or debugfs is said by tools(), and
 * nothing is faked (DK_D3's problem: on Windows, e2fsprogs come from WSL or the QEMU environment fills the disk — his call).
 * With a VM running, a snapshot that keeps its memory and CPU too (QMP savevm) is DK8.
 *
 *   createVDisks({ root, dir, disks, run, env }) → { tools(), make(system, { withState, by, size }), refresh(system, { by }), info(system),
 *     verify(system, { snapshot }), extract(system, out, { layers, snapshot }), snapshot(system, tag, { by }), snapshots(system),
 *     revert(system, tag, { by }), dropSnapshot(system, tag, { by }), list(), pathOf(system) }
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const err = (msg, code = 400) => Object.assign(new Error(msg), { code });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function which(names, env = process.env) {
  const dirs = [...(env.COS_E2FS_DIR ? [env.COS_E2FS_DIR] : []), ...String(env.PATH || '').split(path.delimiter), ...(env === process.env ? ['/usr/sbin', '/sbin', '/usr/bin'] : [])];
  for (const n of names) for (const d of dirs) { if (!d) continue; const f = path.join(d, process.platform === 'win32' ? `${n}.exe` : n); try { if (fs.statSync(f).isFile()) return f; } catch (_) {} }
  return null;
}

function createVDisks({ root = path.resolve(__dirname, '..', '..'), dir = null, disks = null, run = null, env = process.env } = {}) {
  const D = disks || require('./disk.js').createDisks({ root, ...(dir ? { dir } : {}) });
  const DIR = dir || D.dir;
  const exec = run || ((bin, args, opts = {}) => execFileSync(bin, args, { encoding: opts.encoding === null ? null : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 256 * 1024 * 1024, ...opts }));

  function tools() {
    let qemuImg = null; if (env === process.env) { try { const h = require('../testenv/host.js').qemu(); if (h && h.found && h.img) qemuImg = h.img; } catch (_) {} }
    qemuImg = qemuImg || which(['qemu-img'], env);
    const mke2fs = which(['mke2fs', 'mkfs.ext4'], env), debugfs = which(['debugfs'], env);
    const missing = [...(!qemuImg ? ['qemu-img'] : []), ...(!mke2fs ? ['mke2fs'] : []), ...(!debugfs ? ['debugfs'] : [])];
    const why = !missing.length ? null : `${missing.join(', ')} not on this host. qemu-img comes with QEMU; mke2fs and debugfs are e2fsprogs (Linux, or WSL on Windows${process.platform === 'win32' ? ' — not found here' : ''}; COS_E2FS_DIR names their folder). Until then COS can still make the compressed .disk.`;
    return { ok: !missing.length, qemuImg, mke2fs, debugfs, missing, why };
  }
  const need = () => { const t = tools(); if (!t.ok) throw err(t.why, 501); return t; };
  const pathOf = (system) => { if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(system || ''))) throw err(`a system's name, not "${system}"`); return path.join(DIR, `${system}.qcow2`); };
  const must = (system) => { const f = pathOf(system); if (!fs.existsSync(f)) throw err(`${system} has no virtual disk yet`, 404); return f; };
  const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `cos-vdisk-${tag}-`));
  const record = (system, by, message, change) => { try { require('../../lib/versionium-record.js').record({ kind: 'cos.vdisk', system, by, message, change }).catch(() => {}); } catch (_) {} };

  // the system's files, its data and its metadata, laid out as the disk's filesystem, in a folder mke2fs reads
  function stageFor(system, { withState, by }) {
    const c = D.collect(system, { withState, by, kind: 'virtual' });
    const st = tmpDir('stage');
    for (const e of c.entries) { const dest = path.join(st, e.layer, e.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(e.abs, dest); try { fs.chmodSync(dest, e.mode || 0o644); } catch (_) {} }
    fs.mkdirSync(path.join(st, '.cos', 'spec'), { recursive: true });
    for (const s of c.spec) { const src = path.join(root, s.path), dest = path.join(st, '.cos', 'spec', s.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    fs.writeFileSync(path.join(st, '.cos', 'disk.json'), JSON.stringify(c.manifest, null, 2) + '\n');
    const bytes = c.entries.reduce((a, e) => a + e.bytes, 0);
    return { st, c, bytes };
  }
  // the filesystem's size: room for what is there, its growth, and ext4's own tables; the qcow2 stays as small as what is written
  const sizeFor = (bytes, size) => size || `${Math.max(256, Math.ceil((bytes * 3 + 128 * 1048576) / 1048576 / 64) * 64)}M`;
  function fsImage(t, st, system, size) {
    const raw = path.join(path.dirname(st), `${path.basename(st)}.raw`);
    exec(t.mke2fs, ['-q', '-F', '-t', 'ext4', '-L', system.slice(0, 16), '-E', 'root_owner=0:0', '-d', st, raw, size]);
    return raw;
  }

  async function make(system, { withState = true, by = null, size = null } = {}) {
    const t = need(); const out = pathOf(system);
    if (fs.existsSync(out)) throw err(`${system} has a virtual disk already: refresh it (its snapshots are kept), or drop it first`, 409);
    const { st, c, bytes } = stageFor(system, { withState, by });
    try {
      const raw = fsImage(t, st, system, sizeFor(bytes, size));
      fs.mkdirSync(DIR, { recursive: true });
      exec(t.qemuImg, ['convert', '-c', '-f', 'raw', '-O', 'qcow2', raw, out]);
      fs.rmSync(raw, { force: true });
    } finally { fs.rmSync(st, { recursive: true, force: true }); }
    record(system, by, `COS: ${system}'s virtual disk made (${c.entries.length} files${withState ? ', with its data' : ''})`, { disk: path.basename(out), contentHash: c.contentHash });
    return { ok: true, system, file: path.basename(out), path: out, files: c.entries.length, withState: !!withState, contentHash: c.contentHash, ...qinfo(t, out), metadata: { declaredBy: c.D.declaredBy, spec: c.spec.length, coverage: c.manifest.metadata.coverage } };
  }

  // the system's current files and data written into the disk's active layer; every snapshot inside stays (qemu-img convert -n)
  async function refresh(system, { by = null, withState = true } = {}) {
    const t = need(); const out = must(system);
    const { st, c, bytes } = stageFor(system, { withState, by });
    const virt = qinfo(t, out).virtualSize;
    try {
      if (bytes * 3 > virt) throw err(`${system} has grown past its disk (${Math.round(virt / 1048576)} MB): make a larger one`, 409);
      const raw = fsImage(t, st, system, `${Math.floor(virt / 1024)}k`);   // mke2fs reads a bare number as blocks, not bytes
      exec(t.qemuImg, ['convert', '-n', '-f', 'raw', '-O', 'qcow2', raw, out]);
      fs.rmSync(raw, { force: true });
    } finally { fs.rmSync(st, { recursive: true, force: true }); }
    record(system, by, `COS: ${system}'s virtual disk refreshed (${c.entries.length} files)`, { disk: path.basename(out), contentHash: c.contentHash });
    return { ok: true, system, files: c.entries.length, contentHash: c.contentHash, ...qinfo(t, out) };
  }

  function qinfo(t, file) {
    const j = JSON.parse(exec(t.qemuImg, ['info', '--output=json', '-U', file]));
    return { format: j.format, virtualSize: j['virtual-size'], actualSize: j['actual-size'] ?? fs.statSync(file).size,
      snapshots: (j.snapshots || []).map(s => ({ tag: s.name, id: s.id, at: s['date-sec'] ? new Date(s['date-sec'] * 1000).toISOString() : null, vmState: s['vm-state-size'] || 0 })) };
  }
  // a raw copy (the active layer, or one snapshot) that debugfs can read without mounting
  function rawOf(t, file, snapshot) {
    const raw = path.join(tmpDir('read'), 'disk.raw');
    exec(t.qemuImg, ['convert', '-U', ...(snapshot ? ['-l', `snapshot.name=${snapshot}`] : []), '-O', 'raw', file, raw]);
    return raw;
  }
  const dbg = (t, raw, cmd) => exec(t.debugfs, ['-R', cmd, raw], { encoding: null }).toString('utf8');

  function info(system) {
    const t = need(); const f = must(system); const q = qinfo(t, f); const raw = rawOf(t, f);
    try { const meta = JSON.parse(dbg(t, raw, 'cat /.cos/disk.json')); const { files, ...head } = meta; return { ok: true, system, file: path.basename(f), ...q, metadata: { ...head, fileCount: files.length } }; }
    finally { fs.rmSync(path.dirname(raw), { recursive: true, force: true }); }
  }
  function extract(system, out, { layers = ['code', 'state'], snapshot = null } = {}) {
    const t = need(); const f = must(system); const raw = rawOf(t, f, snapshot); const base = path.resolve(out);
    try {
      fs.mkdirSync(base, { recursive: true });
      for (const l of [...layers, '.cos']) { try { exec(t.debugfs, ['-R', `rdump /${l} ${base}`, raw]); } catch (_) { /* a layer the disk does not hold */ } }
      return { ok: true, into: base, layers, snapshot };
    } finally { fs.rmSync(path.dirname(raw), { recursive: true, force: true }); }
  }
  function verify(system, { snapshot = null } = {}) {
    const out = tmpDir('verify');
    try {
      extract(system, out, { snapshot });
      const meta = JSON.parse(fs.readFileSync(path.join(out, '.cos', 'disk.json'), 'utf8'));
      const changed = [], missing = [];
      for (const fl of meta.files) { const p = path.join(out, fl.layer, fl.path); if (!fs.existsSync(p)) { missing.push(fl.path); continue; } if (sha(fs.readFileSync(p)) !== fl.sha256) changed.push(fl.path); }
      return { ok: !changed.length && !missing.length, system, snapshot, files: meta.files.length, changed, missing };
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  }

  const who = (by) => { if (!by) throw err('say who acts: { "by": "person" | "rule:<id>" }'); if (/^agent:/.test(String(by))) throw err('an agent proposes; a disk\'s snapshots are a person\'s or a rule\'s', 403); };
  function snapshot(system, tag, { by } = {}) {
    who(by); const t = need(); const f = must(system);
    if (!TAG.test(String(tag || ''))) throw err(`a snapshot's name: letters, digits, dot, dash, underscore — not "${tag}"`);
    if (qinfo(t, f).snapshots.some(s => s.tag === tag)) throw err(`${system} already has a snapshot "${tag}"`, 409);
    exec(t.qemuImg, ['snapshot', '-c', tag, f]); record(system, by, `COS: ${system} snapshot ${tag}`, { disk: path.basename(f), snapshot: tag });
    return { ok: true, system, tag, snapshots: qinfo(t, f).snapshots };
  }
  const snapshots = (system) => { const t = need(); return { ok: true, system, snapshots: qinfo(t, must(system)).snapshots }; };
  function revert(system, tag, { by } = {}) {
    who(by); const t = need(); const f = must(system);
    if (!qinfo(t, f).snapshots.some(s => s.tag === tag)) throw err(`${system} has no snapshot "${tag}"`, 404);
    exec(t.qemuImg, ['snapshot', '-a', tag, f]); record(system, by, `COS: ${system} reverted to snapshot ${tag}`, { disk: path.basename(f), snapshot: tag });
    return { ok: true, system, tag, note: 'the disk is back at the snapshot; the system\'s live folder is unchanged until the disk is opened (DK4)' };
  }
  function dropSnapshot(system, tag, { by } = {}) {
    who(by); const t = need(); const f = must(system);
    if (!qinfo(t, f).snapshots.some(s => s.tag === tag)) throw err(`${system} has no snapshot "${tag}"`, 404);
    exec(t.qemuImg, ['snapshot', '-d', tag, f]); record(system, by, `COS: ${system} snapshot ${tag} dropped`, { disk: path.basename(f), snapshot: tag });
    return { ok: true, system, tag, snapshots: qinfo(t, f).snapshots };
  }
  const list = () => { let fsz = []; try { fsz = fs.readdirSync(DIR).filter(f => f.endsWith('.qcow2')); } catch (_) {} return fsz.map(f => ({ system: f.replace(/\.qcow2$/, ''), file: f, bytes: fs.statSync(path.join(DIR, f)).size })); };

  return { tools, make, refresh, info, verify, extract, snapshot, snapshots, revert, dropSnapshot, list, pathOf, dir: DIR };
}

module.exports = { createVDisks, MODULE_ID: 'cos.vdisk', VERSION: '1.0.0' };
