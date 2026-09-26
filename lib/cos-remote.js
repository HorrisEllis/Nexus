'use strict';
/**
 * lib/cos-remote.js — push and pull COS compartments to a remote.
 * UUID: nexus-cos-remote-v1-0000-2026-0926-jamesbrooks-001
 * Version: 0.1.0
 *
 * §0.39.265 — James: "i didn't necessarily mean just git. i meant like push
 * pull for the compartments remotely."
 *
 * A compartment gets REMOTES, the way a git repo does. A remote is a place
 * bundles are kept, and every machine that can reach it can push to it and pull
 * from it:
 *
 *   folder   a path — a USB drive, a network share (\\server\share\…), or a
 *            OneDrive / Dropbox / Google Drive folder that syncs by itself
 *   ssh      user@host:path  or  ssh://user@host:port/path — any server you can
 *            ssh into (a VPS, a NAS, another PC with OpenSSH). Nothing to install
 *            there: it only needs sh, cat, mkdir, mv, ls.
 *
 * WHAT TRAVELS — the compartment's own folder (fs.root) and, when it has one,
 * its PROJECT mount (for an Idearium repo that is the repo's folder, .git
 * included), plus its identity (name, purpose, runtime, isolation). What does
 * NOT travel: vault secrets and SSH keys (they are machine-bound on purpose —
 * register them again on the other machine), .cos-manifest.json (it holds this
 * machine's absolute paths), node_modules and caches.
 *
 * ON THE REMOTE:  <dir>/<compartment name>/bundle.zip      the latest push
 *                                          bundle.prev.zip the one before it
 *                                          meta.json       written LAST — the commit point
 *
 * SAFETY — each side's content is a hash (every file's sha256), and every
 * remote remembers the hash both sides last agreed on (the "base"). From that:
 *   in-sync | ahead (only this machine changed) | behind (only the remote
 *   changed) | diverged (both) | not-pushed
 * Push refuses behind/diverged, pull refuses ahead/diverged, unless forced —
 * and a forced or ordinary pull first zips what it replaces into
 * <COS>/.cos/remote-backups/. Nothing is overwritten without a copy.
 *
 * Pack/unpack of a big compartment is CPU and disk heavy, so callers run it
 * out of process: runIsolated(op, args) spawns this file and reads one JSON
 * result, leaving the caller's event loop free.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const MODULE_ID = 'cos-remote';
const VERSION = '0.1.0';
const FORMAT = 'nexus.cos-bundle/1';
const MAX_BYTES = 1024 ** 3;                 // 1 GB of files per bundle
const SKIP_DIRS = new Set(['node_modules', '.cos-testenv', '.nex', '__pycache__', '.venv', 'venv', '.cache', '.pytest_cache', '.nexus-ci-runs']);
const SKIP_FILES = new Set(['.cos-manifest.json', '.DS_Store', 'Thumbs.db']);
const NAME_RE = /^[\w.-]{1,120}$/;

function _K() { return require('../cos/foundation/constants.js'); }
function _stateDir() { return _K().COS_STATE_DIR; }
function _remotesFile() { return path.join(_stateDir(), 'remotes.json'); }
function _bridge() { return require('./cos-bridge.js'); }
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ── remotes (per compartment, in COS's own state dir) ───────────────────────
function _readRemotes() { try { return JSON.parse(fs.readFileSync(_remotesFile(), 'utf8')); } catch (_) { return {}; } }
function _writeRemotes(all) {
  fs.mkdirSync(_stateDir(), { recursive: true });
  const p = _remotesFile();
  fs.writeFileSync(p + '.tmp', JSON.stringify(all, null, 2));
  fs.renameSync(p + '.tmp', p);
}

/** parseLocation(loc) -> { ok, kind:'folder', dir } | { ok, kind:'ssh', target, port, dir } | { ok:false, error } */
function parseLocation(loc) {
  const s = String(loc || '').trim();
  if (!s) return { ok: false, error: 'a location is required — a folder path, or user@host:path for ssh' };
  if (/[\r\n\0]/.test(s)) return { ok: false, error: 'invalid location' };
  let m = s.match(/^ssh:\/\/([\w.-]+)@([\w.-]+)(?::(\d{1,5}))?(\/.*)?$/i);
  if (m) return { ok: true, kind: 'ssh', target: `${m[1]}@${m[2]}`, port: m[3] ? +m[3] : null, dir: _sshDir(m[4] || 'nexus-compartments') };
  m = s.match(/^([\w.-]+)@([\w.-]+):(.*)$/);
  if (m) return { ok: true, kind: 'ssh', target: `${m[1]}@${m[2]}`, port: null, dir: _sshDir(m[3] || 'nexus-compartments') };
  if (/^file:\/\//i.test(s)) return { ok: true, kind: 'folder', dir: path.resolve(decodeURIComponent(s.replace(/^file:\/\/\/?/i, process.platform === 'win32' ? '' : '/'))) };
  if (path.isAbsolute(s) || /^\\\\[^\\]+\\/.test(s)) return { ok: true, kind: 'folder', dir: path.resolve(s) };
  return { ok: false, error: 'use an absolute folder path (e.g. D:\\nexus-remote, \\\\nas\\share\\nexus, a OneDrive folder) or user@host:path for ssh' };
}
function _sshDir(p) {
  let d = String(p || '').replace(/^\/~\//, '').replace(/^~\//, '').replace(/\/+$/, '');   // ~/x → x (ssh commands run in the home dir)
  if (!d || d === '~') d = 'nexus-compartments';
  if (/['"`$\\]/.test(d)) throw new Error('the remote path may not contain quotes, $, ` or \\');
  return d;
}

function listRemotes(compartmentId) {
  const r = (_readRemotes()[compartmentId] || {}).remotes || {};
  return Object.entries(r).map(([name, v]) => ({ name, ...v }));
}
function addRemote(compartmentId, { name = 'origin', location, keyAlias = null } = {}) {
  if (!/^[a-z][\w-]{0,39}$/i.test(String(name))) return { ok: false, error: 'remote name: letters, digits, - and _ (e.g. origin, nas, onedrive)' };
  let loc;
  try { loc = parseLocation(location); } catch (e) { return { ok: false, error: e.message }; }
  if (!loc.ok) return loc;
  const all = _readRemotes();
  const c = all[compartmentId] = all[compartmentId] || { remotes: {} };
  const prev = c.remotes[name];
  c.remotes[name] = { kind: loc.kind, location: String(location).trim(), keyAlias: loc.kind === 'ssh' ? (keyAlias || null) : null,
    // a changed location starts over: the old base described a different place
    base: prev && prev.location === String(location).trim() ? prev.base : null,
    addedAt: prev ? prev.addedAt : Date.now(), lastPush: prev ? prev.lastPush || null : null, lastPull: prev ? prev.lastPull || null : null };
  _writeRemotes(all);
  return { ok: true, name, ...c.remotes[name] };
}
function removeRemote(compartmentId, name) {
  const all = _readRemotes();
  if (!all[compartmentId] || !all[compartmentId].remotes[name]) return { ok: false, error: `no remote named "${name}"` };
  delete all[compartmentId].remotes[name];
  _writeRemotes(all);
  return { ok: true, name };
}
function _setRemoteFields(compartmentId, name, fields) {
  const all = _readRemotes();
  const c = all[compartmentId] = all[compartmentId] || { remotes: {} };
  c.remotes[name] = { ...(c.remotes[name] || {}), ...fields };
  _writeRemotes(all);
}

// ── transports ──────────────────────────────────────────────────────────────
const _q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function _ssh(loc, command, { input = null, keyPath = null, timeoutMs = 300000 } = {}) {
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15'];
  if (keyPath) args.push('-i', keyPath, '-o', 'IdentitiesOnly=yes');
  if (loc.port) args.push('-p', String(loc.port));
  args.push(loc.target, command);
  return new Promise((resolve) => {
    let child;
    try { child = spawn('ssh', args, { windowsHide: true }); } catch (e) { resolve({ code: null, stdout: Buffer.alloc(0), stderr: e.message }); return; }
    const out = [], err = [];
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    const t = setTimeout(() => { try { child.kill(); } catch (_) {} }, timeoutMs);
    child.on('error', e => { clearTimeout(t); resolve({ code: null, stdout: Buffer.concat(out), stderr: /ENOENT/.test(e.message) ? 'ssh is not installed (Windows: Settings → Optional features → OpenSSH Client)' : e.message }); });
    child.on('close', code => { clearTimeout(t); resolve({ code, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString().trim() }); });
    if (input) child.stdin.end(input); else child.stdin.end();
  });
}

function transport(loc, { keyPath = null } = {}) {
  if (loc.kind === 'folder') {
    return {
      async read(rel) { try { return fs.readFileSync(path.join(loc.dir, rel)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
      async write(rel, buf) {
        const p = path.join(loc.dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p + '.tmp', buf);
        fs.renameSync(p + '.tmp', p);
      },
      async copy(fromRel, toRel) { const a = path.join(loc.dir, fromRel); if (fs.existsSync(a)) fs.copyFileSync(a, path.join(loc.dir, toRel)); },
      async list() { try { return fs.readdirSync(loc.dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (_) { return []; } },
    };
  }
  const full = (rel) => `${loc.dir}/${rel}`;
  const fail = (r, what) => new Error(`${what} on ${loc.target} failed: ${r.stderr || `exit ${r.code}`}`);
  return {
    async read(rel) {
      const r = await _ssh(loc, `if [ -f ${_q(full(rel))} ]; then cat -- ${_q(full(rel))}; else exit 3; fi`, { keyPath });
      if (r.code === 3) return null;
      if (r.code !== 0) throw fail(r, 'reading');
      return r.stdout;
    },
    async write(rel, buf) {
      const f = full(rel);
      const r = await _ssh(loc, `mkdir -p -- ${_q(path.posix.dirname(f))} && cat > ${_q(f + '.tmp')} && mv -f -- ${_q(f + '.tmp')} ${_q(f)}`, { input: buf, keyPath, timeoutMs: 900000 });
      if (r.code !== 0) throw fail(r, 'writing');
    },
    async copy(fromRel, toRel) {
      const r = await _ssh(loc, `if [ -f ${_q(full(fromRel))} ]; then cp -f -- ${_q(full(fromRel))} ${_q(full(toRel))}; fi`, { keyPath });
      if (r.code !== 0) throw fail(r, 'copying');
    },
    async list() {
      const r = await _ssh(loc, `if [ -d ${_q(loc.dir)} ]; then ls -1 -- ${_q(loc.dir)}; fi`, { keyPath });
      if (r.code !== 0) throw fail(r, 'listing');
      return r.stdout.toString().split('\n').map(x => x.trim()).filter(Boolean);
    },
  };
}

// ── local content ───────────────────────────────────────────────────────────
// In a PROJECT part (an Idearium repo folder), Idearium's own index files —
// atlas, chunks/, indexes/, graph, proof, the source manifest — are rebuilt on
// every machine and carry timestamps; sending them would make every pull look
// like a local change. They neither travel nor get deleted by a pull.
function _walk(dir, { part = 'root' } = {}) {
  const out = [];
  const G = part === 'project' ? require('./repo-git.js') : null;
  const isInternal = (r) => !!G && G.isInternal(dir, r);
  const walk = (rel) => {
    let ents; try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !isInternal(r)) walk(r); continue; }
      if (e.isFile() && !SKIP_FILES.has(e.name) && !isInternal(r)) out.push(r);
    }
  };
  if (dir && fs.existsSync(dir)) walk('');
  return out.sort();
}

/** the parts of a compartment that travel: its own folder, and its project mount if it has one */
function partsOf(comp) {
  const parts = [];
  if (comp && comp.fs && comp.fs.root) parts.push({ part: 'root', dir: comp.fs.root });
  const pm = comp && comp.fs && Array.isArray(comp.fs.mounts) ? comp.fs.mounts.find(m => m.role === 'project' && m.writable !== false && m.path) : null;
  if (pm) parts.push({ part: 'project', dir: pm.path });
  return parts;
}

/** localContent(comp) -> { files:[{part,path,sha256,size}], contentHash, bytes } */
function localContent(comp, { withData = false } = {}) {
  const files = [], data = [];
  let bytes = 0;
  for (const { part, dir } of partsOf(comp)) {
    for (const rel of _walk(dir, { part })) {
      const buf = fs.readFileSync(path.join(dir, rel));
      bytes += buf.length;
      if (bytes > MAX_BYTES) throw new Error(`the compartment is over ${Math.round(MAX_BYTES / 1024 ** 2)} MB — too big to bundle`);
      files.push({ part, path: rel, sha256: sha256(buf), size: buf.length });
      if (withData) data.push(buf);
    }
  }
  return { files, contentHash: contentHash(files), bytes, data };
}
function contentHash(files) { return sha256(JSON.stringify(files.map(f => [f.part, f.path, f.sha256]))); }

function _state(localHash, remoteHash, base) {
  if (!remoteHash) return 'not-pushed';
  if (localHash === remoteHash) return 'in-sync';
  if (base && remoteHash === base) return 'ahead';
  if (base && localHash === base) return 'behind';
  return 'diverged';
}

async function _remoteMeta(t, name) {
  const b = await t.read(`${name}/meta.json`);
  if (!b) return null;
  try { return JSON.parse(b.toString('utf8')); } catch (_) { throw new Error(`the remote's meta.json for "${name}" is unreadable`); }
}

function _comp(idOrName) {
  const c = _bridge().getCompartment(idOrName);
  if (!c) throw new Error(`compartment not found: ${idOrName}`);
  return c;
}
function _remoteOf(comp, remoteName) {
  const r = listRemotes(comp.id).find(x => x.name === remoteName);
  if (!r) throw new Error(`this compartment has no remote named "${remoteName}"`);
  return r;
}
function _check(name) { if (!NAME_RE.test(name)) throw new Error(`compartment name "${name}" cannot be used on a remote`); return name; }

// ── operations ──────────────────────────────────────────────────────────────
async function status({ compartment, remote, keyPath = null }) {
  const comp = _comp(compartment), r = _remoteOf(comp, remote);
  const t = transport(parseLocation(r.location), { keyPath });
  const [meta, local] = [await _remoteMeta(t, _check(comp.name)), localContent(comp)];
  // what differs, file by file (remote meta stores [part, path, sha256, size])
  const diff = [];
  if (meta && meta.contentHash !== local.contentHash) {
    const rem = new Map(meta.files.map(f => [`${f[0]}/${f[1]}`, f[2]]));
    const loc = new Map(local.files.map(f => [`${f.part}/${f.path}`, f.sha256]));
    for (const [k, h] of loc) if (!rem.has(k)) diff.push({ path: k, change: 'only here' }); else if (rem.get(k) !== h) diff.push({ path: k, change: 'different' });
    for (const k of rem.keys()) if (!loc.has(k)) diff.push({ path: k, change: 'only on the remote' });
  }
  return { ok: true, compartment: comp.name, remote, location: r.location, kind: r.kind, diff: diff.slice(0, 200), diffCount: diff.length,
    state: _state(local.contentHash, meta && meta.contentHash, r.base), localHash: local.contentHash, remoteHash: meta ? meta.contentHash : null, base: r.base || null,
    local: { files: local.files.length, bytes: local.bytes }, remoteInfo: meta ? { pushedAt: meta.pushedAt, from: meta.from, files: meta.files.length, bytes: meta.bytes } : null };
}

async function push({ compartment, remote, keyPath = null, force = false }) {
  const comp = _comp(compartment), r = _remoteOf(comp, remote), name = _check(comp.name);
  const t = transport(parseLocation(r.location), { keyPath });
  const meta = await _remoteMeta(t, name);
  const local = localContent(comp, { withData: true });
  const state = _state(local.contentHash, meta && meta.contentHash, r.base);
  if (state === 'in-sync') { _setRemoteFields(comp.id, remote, { base: local.contentHash }); return { ok: true, state, nothingToPush: true, contentHash: local.contentHash }; }
  if ((state === 'behind' || state === 'diverged') && !force) {
    return { ok: false, state, error: state === 'behind'
      ? 'the remote has a newer version than this machine — pull first (or push with force to overwrite it)'
      : 'this machine and the remote have both changed since they last agreed — pull (which keeps a backup of this machine\'s version) or push with force to overwrite the remote' };
  }
  const Zip = require('./zip.js');
  const z = new Zip();
  const bundleMeta = {
    format: FORMAT, name, purpose: comp.purpose || '', runtimeId: comp.runtimeId || null, networkIsolated: comp.networkIsolated !== false,
    contentHash: local.contentHash, files: local.files, bytes: local.bytes, pushedAt: Date.now(),
    from: { host: os.hostname(), compartmentId: comp.id }, previous: meta ? meta.contentHash : null,
  };
  z.addFile('cos-bundle.json', JSON.stringify(bundleMeta, null, 2));
  local.files.forEach((f, i) => z.addFile(`${f.part}/${f.path}`, local.data[i]));
  const buf = z.toBuffer();
  if (meta) await t.copy(`${name}/bundle.zip`, `${name}/bundle.prev.zip`);
  await t.write(`${name}/bundle.zip`, buf);
  const { files, ...slim } = bundleMeta;
  await t.write(`${name}/meta.json`, Buffer.from(JSON.stringify({ ...slim, files: files.map(f => [f.part, f.path, f.sha256, f.size]), bundleBytes: buf.length, bundleSha256: sha256(buf) }, null, 2)));
  _setRemoteFields(comp.id, remote, { base: local.contentHash, lastPush: Date.now() });
  return { ok: true, state, forced: !!force && state !== 'ahead' && state !== 'not-pushed', contentHash: local.contentHash, files: local.files.length, bytes: local.bytes, bundleBytes: buf.length };
}

function _backup(comp) {
  const local = localContent(comp, { withData: true });
  if (!local.files.length) return null;
  const Zip = require('./zip.js');
  const z = new Zip();
  local.files.forEach((f, i) => z.addFile(`${f.part}/${f.path}`, local.data[i]));
  const dir = path.join(_stateDir(), 'remote-backups');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${comp.name}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  fs.writeFileSync(p, z.toBuffer());
  return p;
}

/** apply a bundle's part onto a folder: the folder ends up exactly the bundle's files (skipped dirs untouched) */
function _applyPart(dir, entries, part = 'root') {
  const want = new Map(entries.map(e => [e.path, e.data]));
  const changed = [];
  for (const rel of _walk(dir, { part })) {
    if (!want.has(rel)) { fs.rmSync(path.join(dir, rel), { force: true }); changed.push({ status: 'D', path: rel }); }
  }
  for (const [rel, data] of want) {
    const p = path.resolve(dir, rel);
    if (p !== path.resolve(dir) && !p.startsWith(path.resolve(dir) + path.sep)) throw new Error(`refused ${rel}: outside the compartment`);
    let same = false;
    try { same = fs.readFileSync(p).equals(data); } catch (_) {}
    if (same) continue;
    const existed = fs.existsSync(p);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
    changed.push({ status: existed ? 'M' : 'A', path: rel });
  }
  return changed;
}

async function _download(t, name) {
  const meta = await _remoteMeta(t, name);
  if (!meta) throw new Error(`the remote has no compartment named "${name}"`);
  const buf = await t.read(`${name}/bundle.zip`);
  if (!buf) throw new Error(`the remote has meta.json but no bundle.zip for "${name}"`);
  if (meta.bundleSha256 && sha256(buf) !== meta.bundleSha256) throw new Error('the downloaded bundle does not match its checksum — the push may still be in progress; try again');
  const Zip = require('./zip.js');
  const z = new Zip(buf);
  const bm = JSON.parse(z.readAsText('cos-bundle.json'));
  if (bm.format !== FORMAT) throw new Error(`not a compartment bundle (${bm.format || 'no format'})`);
  const parts = {};
  const entries = new Map(z.getEntries().map(e => [e.entryName, e]));
  for (const f of bm.files) {
    const e = entries.get(`${f.part}/${f.path}`);
    if (!e) throw new Error(`the bundle is missing ${f.part}/${f.path}`);
    const data = e.getData();
    if (sha256(data) !== f.sha256) throw new Error(`${f.part}/${f.path} failed its checksum`);
    (parts[f.part] = parts[f.part] || []).push({ path: f.path, data });
  }
  if (contentHash(bm.files) !== bm.contentHash) throw new Error('the bundle\'s content hash does not match its files');
  return { meta, bm, parts };
}

/**
 * pull({ compartment, remote })            into an existing compartment, from one of its remotes
 * pull({ location, name, keyPath })        a compartment this machine does not have yet (creates it)
 * The project part of a NEW compartment is extracted to projectDir for the
 * caller to adopt (Idearium imports it as a repo and mounts it).
 */
async function pull({ compartment = null, remote = null, location = null, name = null, keyPath = null, force = false, projectDir = null }) {
  if (compartment) {
    const comp = _comp(compartment), r = _remoteOf(comp, remote), cname = _check(comp.name);
    const t = transport(parseLocation(r.location), { keyPath });
    const meta = await _remoteMeta(t, cname);
    if (!meta) return { ok: false, error: `nothing has been pushed to "${remote}" for this compartment yet` };
    const local = localContent(comp);
    const state = _state(local.contentHash, meta.contentHash, r.base);
    if (state === 'in-sync') { _setRemoteFields(comp.id, remote, { base: meta.contentHash }); return { ok: true, state, upToDate: true }; }
    if ((state === 'ahead' || state === 'diverged') && !force) {
      return { ok: false, state, error: state === 'ahead'
        ? 'this machine has changes the remote does not — push them first (or pull with force to replace them; a backup is kept)'
        : 'this machine and the remote have both changed — pull with force to take the remote\'s version (this machine\'s is backed up first), or push with force to keep yours' };
    }
    const { parts } = await _download(t, cname);
    const backup = _backup(comp);
    const changed = {};
    for (const { part, dir } of partsOf(comp)) changed[part] = _applyPart(dir, parts[part] || [], part);
    _setRemoteFields(comp.id, remote, { base: meta.contentHash, lastPull: Date.now() });
    return { ok: true, state, compartmentId: comp.id, name: comp.name, backup, changed, from: meta.from, pushedAt: meta.pushedAt };
  }
  // a compartment this machine does not have
  const loc = parseLocation(location);
  if (!loc.ok) return loc;
  const cname = _check(String(name || ''));
  if (_bridge().getCompartment(cname)) return { ok: false, error: `a compartment named "${cname}" already exists here — pull into it from its Remotes instead` };
  const t = transport(loc, { keyPath });
  const { meta, bm, parts } = await _download(t, cname);
  const created = _bridge().createCompartment({ name: cname, purpose: bm.purpose || `pulled from ${location}`, runtimeId: bm.runtimeId || null, networkIsolated: bm.networkIsolated !== false });
  if (!created.ok) return { ok: false, error: `could not create the compartment: ${created.error}` };
  const comp = created.compartment;
  _applyPart(comp.fs.root, parts.root || []);
  let project = null;
  if (parts.project && parts.project.length) {
    const dir = projectDir || fs.mkdtempSync(path.join(os.tmpdir(), 'cos-pull-project-'));
    _applyPart(dir, parts.project, 'project');
    project = { dir, files: parts.project.length };
  }
  addRemote(comp.id, { name: 'origin', location, keyAlias: null });
  _setRemoteFields(comp.id, 'origin', { base: meta.contentHash, lastPull: Date.now() });
  return { ok: true, state: 'new', compartmentId: comp.id, name: comp.name, root: comp.fs.root, project, from: meta.from, pushedAt: meta.pushedAt, files: bm.files.length };
}

/** browse({ location }) -> every compartment kept at a remote */
async function browse({ location, keyPath = null }) {
  const loc = parseLocation(location);
  if (!loc.ok) return loc;
  const t = transport(loc, { keyPath });
  const names = (await t.list()).filter(n => NAME_RE.test(n));
  const out = [];
  for (const n of names) {
    let m = null;
    try { m = await _remoteMeta(t, n); } catch (_) {}
    if (m) out.push({ name: n, purpose: m.purpose || '', pushedAt: m.pushedAt, from: m.from, files: m.files.length, bytes: m.bytes, contentHash: m.contentHash, here: !!_bridge().getCompartment(n) });
  }
  return { ok: true, location, kind: loc.kind, compartments: out };
}

// ── out of process ──────────────────────────────────────────────────────────
// Every op answers { ok:false, error } rather than throwing — a remote that is
// unreachable or a bundle that fails its checksum is a result the caller shows.
const _safe = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return { ok: false, error: e.message }; } };
const OPS = { status: _safe(status), push: _safe(push), pull: _safe(pull), browse: _safe(browse) };

/** runIsolated(op, args) — the op in a child process; resolves with its JSON result. */
function runIsolated(op, args, { timeoutMs = 1800000 } = {}) {
  if (!OPS[op]) return Promise.resolve({ ok: false, error: `unknown op ${op}` });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [__filename, '--run'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const t = setTimeout(() => { try { child.kill(); } catch (_) {} }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(t);
      const line = out.trim().split('\n').reverse().find(l => l.startsWith('{"__cosRemote":'));
      if (!line) { resolve({ ok: false, error: `the ${op} process ended without a result (exit ${code})${err ? `: ${err.trim().split('\n').pop()}` : ''}` }); return; }
      try { resolve(JSON.parse(line).__cosRemote); } catch (e) { resolve({ ok: false, error: `unreadable ${op} result: ${e.message}` }); }
    });
    child.stdin.end(JSON.stringify({ op, args }));
  });
}

if (require.main === module && process.argv[2] === '--run') {
  let input = '';
  process.stdin.on('data', d => { input += d; });
  process.stdin.on('end', async () => {
    let result;
    try { const { op, args } = JSON.parse(input); result = await OPS[op](args); }
    catch (e) { result = { ok: false, error: e.message }; }
    process.stdout.write(`\n${JSON.stringify({ __cosRemote: result })}\n`);
  });
}

module.exports = { MODULE_ID, VERSION, FORMAT, parseLocation, listRemotes, addRemote, removeRemote, partsOf, localContent, contentHash,
  transport, status: OPS.status, push: OPS.push, pull: OPS.pull, browse: OPS.browse, runIsolated, _state };
