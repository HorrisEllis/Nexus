'use strict';
/**
 * lib/repo-history.js — 0.60.7 — Versionium, managed per repo: every version of a project in one index, any two compared,
 * one file brought back, and a project's past imported as real versions.
 *
 * James (2026-10-13): "can you add history import tool to the repos. like maybe with versionium. i want real versions with
 * the versionium tab. like a full index of versions, versions, revisions from the work surface, diffs, backups/snapshots,
 * etc. like full management system for versionium backend, then with the api, expand the idearium ui repo tab."
 *
 * Nothing new is stored beside Versionium; this reads and writes what it already keeps:
 *   - snapshots     commits on branch repo-<uuid>, system idearium.repo (idearium/repo/snapshot.js, lib/repo-versions.js)
 *   - backups       the snapshots a restore takes first ("pre-restore snapshot …", idearium/api repo.snapshot.restore)
 *   - staging       commits on repo-<uuid>@staging (lib/code-edit.js stage)
 *   - history       commits on repo-<uuid>@history: the project's past, imported here. Versionium cannot back-date a
 *                   commit (engine.js commit: wall is always now), so the original date, author and id ride in
 *                   state.imported, and the index orders by them. Its own branch keeps the live branch's head and the
 *                   snapshot list untouched (versionium/lib/files.js headOfRepo reads repo-<uuid> only).
 *   - revisions     the work surface's injects (lib/repo-inject.js): proposed, staged, applied, rejected, reverted
 *
 * The transport `v(method, path, body, timeout)` is idearium/api/index.js _vcall (throws the real error), passed in, so a
 * test hands a fake one.
 *
 * Importing history (PL2, PL3 of docs/2026-10-13-projects-raid-and-gates-phasemap.spec):
 *   - a zip that carries .git → each commit on its first-parent line is a version (git read commands only, on a copy,
 *     with hooks and fsmonitor switched off: the .git came from outside)
 *   - a zip without one → the zip is one version; several are ordered by version, then date
 *     (cli/import-history.js scanZip/orderScans, the importer built for Nexus's own archives)
 *   - secrets (CK-060) are scanned before anything is stored; a finding stops the import until allowSecrets
 *   - idempotent: a version whose original id (git sha, zip sha256) is already in the history is skipped
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = '1.0.0';
const SYSTEM = 'idearium.repo';
const STAGE_BATCH_BYTES = 8 * 1024 * 1024;

const branchOf = (repoUuid) => `repo-${repoUuid}`;
const historyBranch = (repoUuid) => `${branchOf(repoUuid)}@history`;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const qs = (o) => new URLSearchParams(o).toString();
const _err = (status, message, extra = {}) => Object.assign(new Error(message), { status }, extra);

// ── the index ────────────────────────────────────────────────────────────────────────────────────────────────────────

function kindOf(c, repoUuid) {
  const main = branchOf(repoUuid);
  if (c.branch === `${main}@history`) return 'history';
  if (c.branch === `${main}@staging`) return 'staging';
  if (c.branch !== main) return 'branch';
  return /^pre-restore/i.test(c.message || '') ? 'backup' : 'snapshot';
}

function entryOf(c, repoUuid) {
  const st = c.state || {};
  const imp = st.imported || null;
  const at = imp && imp.date ? Date.parse(imp.date) || c.wall : c.wall;
  return {
    kind: kindOf(c, repoUuid), id: c.commitId, branch: c.branch, parentId: c.parentId || null, at, wall: c.wall || null,
    message: c.message || '', causedBy: c.causedBy || null,
    fileCount: (st.files && (st.files.fileCount ?? st.files.counts?.total)) ?? (imp && imp.fileCount) ?? null,
    imported: imp, who: (st.provenance && st.provenance.who) || (imp && imp.author) || null,
  };
}

function revisionOf(n) {
  return {
    kind: 'revision', id: n.uuid || n.id, at: n.appliedAt || n.createdAt || 0, status: n.status, path: n.path, op: n.op,
    message: `${n.op || 'write'} ${n.path || ''}`.trim(), who: n.hatName || n.agentId || n.source || null,
    hasBefore: n.before != null, contentSha256: n.contentSha256 || null,
  };
}

/** index(v, repoUuid, { injects }) → every version of the repo, newest first, with counts by kind. */
async function index(v, repoUuid, { injects = [], limit = 1000 } = {}) {
  const main = branchOf(repoUuid);
  const b = await v('GET', '/api/versionium/branches');
  const mine = (b.branches || []).filter(x => x.branch === main || x.branch.startsWith(`${main}@`));
  if (!mine.some(x => x.branch === main)) mine.unshift({ branch: main });
  const entries = [];
  for (const br of mine) {
    const h = await v('GET', `/api/versionium/history?${qs({ branch: br.branch, n: String(limit) })}`);
    for (const c of h.commits || []) entries.push(entryOf(c, repoUuid));
  }
  for (const n of injects) entries.push(revisionOf(n));
  entries.sort((a, b2) => (b2.at || 0) - (a.at || 0));
  const counts = {};
  for (const e of entries) counts[e.kind] = (counts[e.kind] || 0) + 1;
  return { repoUuid, branches: mine.map(x => ({ branch: x.branch, head: x.headCommitId || null, forkedFrom: x.forkedFrom || null })), counts, entries };
}

// ── diff between any two versions ('working' is the repo on disk now) ─────────────────────────────────────────────────

const isText = (buf) => buf.length < 1024 * 1024 && !buf.subarray(0, 8000).includes(0);

/**
 * diff(v, repoUuid, a, b, { path, working, maxPatches }) → { a, b, counts, files:[{path, status, bytesA, bytesB, patch?}] }
 * working: { tree() → [{path, sha256, bytes}], read(path) → Buffer } for the version 'working'.
 */
async function diff(v, repoUuid, a, b, { path: only = null, working = null, maxPatches = 40, context = 3, maxLines = 400 } = {}) {
  if (!a || !b) throw _err(400, 'diff needs two versions: a and b (a commit id, or "working")');
  const side = async (id) => {
    if (id === 'working') {
      if (!working) throw _err(400, 'the working copy is not readable here');
      const files = await working.tree();
      return { files, read: async (p) => working.read(p) };
    }
    const t = await v('GET', `/api/versionium/files/tree?${qs({ repository: repoUuid, commitId: id })}`, undefined, 30000);
    return {
      files: t.files || [],
      read: async (p) => Buffer.from((await v('GET', `/api/versionium/files/content?${qs({ repository: repoUuid, commitId: id, path: p })}`, undefined, 30000)).content_b64, 'base64'),
    };
  };
  const [A, B] = [await side(a), await side(b)];
  const ma = new Map(A.files.map(f => [f.path, f])), mb = new Map(B.files.map(f => [f.path, f]));
  const files = [];
  for (const p of new Set([...ma.keys(), ...mb.keys()])) {
    if (only && p !== only) continue;
    const fa = ma.get(p), fb = mb.get(p);
    if (fa && fb && fa.sha256 === fb.sha256) continue;
    files.push({ path: p, status: !fa ? 'added' : !fb ? 'removed' : 'changed', bytesA: fa ? fa.bytes : null, bytesB: fb ? fb.bytes : null });
  }
  files.sort((x, y) => (x.path < y.path ? -1 : 1));
  const { unifiedDiff } = require('./code-edit.js');
  let patched = 0;
  for (const f of files) {
    if (patched >= maxPatches) { f.patch = null; f.note = `no patch: over ${maxPatches} files; ask for this one with path=`; continue; }
    const ba = f.status === 'added' ? Buffer.alloc(0) : await A.read(f.path);
    const bb = f.status === 'removed' ? Buffer.alloc(0) : await B.read(f.path);
    if (!isText(ba) || !isText(bb)) { f.patch = null; f.note = 'binary or over 1 MB: sizes only'; continue; }
    f.patch = unifiedDiff(ba.toString('utf8'), bb.toString('utf8'), { path: f.path, context, maxLines });
    patched++;
  }
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const f of files) counts[f.status]++;
  return { repoUuid, a, b, counts, files };
}

/** restoreFile(v, repoUuid, commitId, path, write) → one file put back as it was at that version (write(path, Buffer)). */
async function restoreFile(v, repoUuid, commitId, file, write) {
  if (!commitId || !file) throw _err(400, 'restore needs a version (commitId) and a path');
  const d = await v('GET', `/api/versionium/files/content?${qs({ repository: repoUuid, commitId, path: file })}`, undefined, 30000);
  const buf = Buffer.from(d.content_b64, 'base64');
  if (sha256(buf) !== d.sha256) throw _err(502, `${file} at ${commitId}: the bytes versionium sent do not match its own hash`);
  await write(file, buf);
  return { repoUuid, commitId, path: file, sha256: d.sha256, bytes: buf.length };
}

// ── importing a project's past ───────────────────────────────────────────────────────────────────────────────────────

const SKIP_RX = /(^|\/)(\.git|node_modules)(\/|$)/;

// git, read-only, on a .git that came from outside: no system/global config, no hooks, no fsmonitor
function _git(gitDir, args, input) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', `safe.directory=*`, '--git-dir', gitDir, ...args], {
    input, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0' },
  });
}

function _catBlobs(gitDir, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const buf = _git(gitDir, ['cat-file', '--batch'], shas.join('\n') + '\n');
  let off = 0;
  while (off < buf.length) {
    const nl = buf.indexOf(10, off);
    const head = buf.subarray(off, nl).toString('utf8').split(' ');
    const size = parseInt(head[2], 10);
    if (head[1] === 'missing' || !Number.isFinite(size)) { off = nl + 1; continue; }
    out.set(head[0], buf.subarray(nl + 1, nl + 1 + size));
    off = nl + 1 + size + 1;
  }
  return out;
}

/** the versions inside one zip: its git commits when it carries .git, else itself. Each version loads its files lazily. */
function _versionsOfZip(zipName, buffer, tmp) {
  const Zip = require('./zip.js');
  const { scanZip } = require('../cli/import-history.js');
  const zfile = path.join(tmp, `z-${crypto.randomBytes(4).toString('hex')}.zip`);
  fs.writeFileSync(zfile, buffer);
  const scan = { ...scanZip(zfile), name: zipName };
  if (scan.error) throw _err(400, `${zipName}: ${scan.error}`);
  const entries = new Zip(buffer).getEntries().filter(e => !e.isDirectory);
  const names = entries.map(e => e.entryName.replace(/\\/g, '/'));
  // the project root: scanZip's (package.json / lib/version.js), else one folder every file sits in
  let root = scan.root || '';
  if (!root) {
    const tops = new Set(names.map(n => n.split('/')[0]));
    if (tops.size === 1 && names.every(n => n.includes('/'))) root = `${[...tops][0]}/`;
  }
  const out = [];
  if (scan.hasGit) {
    const gitDir = path.join(tmp, `g-${crypto.randomBytes(4).toString('hex')}`);
    const pre = `${root}.git/`;
    for (const e of entries) {
      const n = e.entryName.replace(/\\/g, '/');
      if (!n.startsWith(pre)) continue;
      const rel = n.slice(pre.length);
      if (!rel || rel.split('/').some(s => s === '..' || s === '')) continue;
      if (rel.startsWith('hooks/')) continue;
      const dest = path.join(gitDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
    }
    let log = '';
    try { log = _git(gitDir, ['log', '--first-parent', '--reverse', '--format=%H%x1f%aI%x1f%an%x1f%s', 'HEAD']).toString('utf8'); }
    catch (e) { throw _err(400, `${zipName}: its .git could not be read: ${String(e.stderr || e.message).trim().slice(0, 200)}`); }
    for (const line of log.split('\n').filter(Boolean)) {
      const [sha, date, author, subject] = line.split('\x1f');
      out.push({
        source: 'git', zip: zipName, originalId: sha, date, author, message: subject || '(no message)', version: null,
        load: () => {
          const ls = _git(gitDir, ['ls-tree', '-r', '-z', sha]).toString('utf8').split('\0').filter(Boolean);
          const items = ls.map(l => { const [meta, p] = l.split('\t'); const [mode, type, oid] = meta.split(' '); return { mode, type, oid, path: p }; })
            .filter(x => x.type === 'blob' && x.mode !== '120000' && !SKIP_RX.test(x.path));
          return { items, read: (wanted) => _catBlobs(gitDir, wanted.map(x => x.oid)) };
        },
        keyOf: (x) => `git:${x.oid}`,
      });
    }
  }
  // the zip's own files: the only version when there is no .git; after the commits, its working tree when that differs
  out.push({
    source: 'zip', zip: zipName, originalId: scan.sha256, date: scan.date, author: null, version: scan.version,
    message: scan.hasGit ? `${zipName} — the files as zipped (after its git history)` : `${zipName}${scan.version ? ` — v${scan.version}` : ''}`,
    workingTreeOf: scan.hasGit,
    load: () => {
      const items = [];
      entries.forEach((e, i) => {
        const n = names[i];
        if (!n.startsWith(root)) return;
        const p = n.slice(root.length);
        if (!p || SKIP_RX.test(p)) return;
        items.push({ path: p, entry: e, oid: `${i}` });
      });
      return { items, read: (wanted) => new Map(wanted.map(x => [x.oid, x.entry.getData()])) };
    },
    keyOf: (x) => `zip:${scan.sha256}:${x.oid}`,
  });
  out.scan = scan;
  return out;
}

/**
 * importHistory(v, repoUuid, { zips:[{name, buffer}], dryRun, allowSecrets, maxFileBytes })
 *   → { ok, dryRun, versions:[{message, date, source, files, skipped?, commitId?}], secrets:[...], imported, skipped }
 */
async function importHistory(v, repoUuid, { zips = [], dryRun = false, allowSecrets = false, maxFileBytes = null } = {}) {
  if (!repoUuid) throw _err(400, 'repoUuid is required');
  if (!zips.length) throw _err(400, 'drop one or more zips: a project with its .git, or several versions of it');
  const IC = require('./import-checks.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-history-'));
  try {
    const { orderScans } = require('../cli/import-history.js');
    const groups = zips.map(z => _versionsOfZip(z.name, z.buffer, tmp));
    const ordered = orderScans(groups.map(g => g.scan)).map(s => groups.find(g => g.scan === s));
    const versions = ordered.flat();

    let limitBytes = maxFileBytes;
    if (!limitBytes) { try { limitBytes = (await v('GET', '/api/versionium/files/limits')).maxFileBytes; } catch (_) { limitBytes = 2 * 1024 * 1024; } }
    const already = new Set();
    try {
      const h = await v('GET', `/api/versionium/history?${qs({ branch: historyBranch(repoUuid), n: '1000' })}`);
      for (const c of h.commits || []) if (c.state && c.state.imported && c.state.imported.originalId) already.add(c.state.imported.originalId);
    } catch (_) { /* no history yet */ }

    // pass 1: read every version's tree (content read once per distinct blob), scan new content for secrets
    const meta = new Map();   // key → { sha256, bytes }
    const secrets = [];
    let prevHash = null;
    for (const ver of versions) {
      const { items, read } = ver.load();
      const fresh = items.filter(x => !meta.has(ver.keyOf(x)));
      const bufs = read(fresh);
      for (const x of fresh) {
        const buf = bufs.get(x.oid) || Buffer.alloc(0);
        meta.set(ver.keyOf(x), { sha256: sha256(buf), bytes: buf.length });
        for (const f of IC.scanSecrets(buf, x.path)) secrets.push({ ...f, version: ver.message, source: ver.source });
      }
      ver.tree = items.map(x => ({ path: x.path, ...meta.get(ver.keyOf(x)) })).filter(f => f.bytes <= limitBytes);
      ver.tooLarge = items.length - ver.tree.length;
      const hash = sha256(Buffer.from(JSON.stringify(ver.tree.map(f => [f.path, f.sha256]).sort())));
      if (ver.workingTreeOf && hash === prevHash) ver.skipped = 'the zipped files are the last commit, unchanged';
      else if (already.has(ver.originalId)) ver.skipped = 'already in this repo\'s history';
      prevHash = hash;
    }
    const summary = versions.map(x => ({ message: x.message, date: x.date, source: x.source, zip: x.zip, author: x.author, version: x.version,
      originalId: x.originalId, files: x.tree.length, tooLarge: x.tooLarge, skipped: x.skipped || null }));
    const todo = versions.filter(x => !x.skipped);
    if (dryRun) return { ok: true, dryRun: true, repoUuid, branch: historyBranch(repoUuid), versions: summary, secrets, wouldImport: todo.length };
    if (secrets.length && !allowSecrets) {
      return { ok: false, code: 'SECRETS', repoUuid, versions: summary, secrets,
        error: `${secrets.length} possible credential(s) in the history (${secrets.slice(0, 3).map(s => `${s.path}: ${s.kind}`).join('; ')}); nothing was stored. Look at them; import again with allowSecrets to keep them in the history.` };
    }

    // pass 2: one commit per version on repo-<uuid>@history; content staged in batches, then the file layer recorded
    let prev = new Map();
    const lastCommit = await (async () => { try { const h = await v('GET', `/api/versionium/history?${qs({ branch: historyBranch(repoUuid), n: '1' })}`); return (h.commits || [])[0] || null; } catch (_) { return null; } })();
    if (lastCommit) { try { prev = new Map(((await v('GET', `/api/versionium/files/tree?${qs({ repository: repoUuid, commitId: lastCommit.commitId })}`)).files || []).map(f => [f.path, f.sha256])); } catch (_) {} }
    for (const ver of todo) {
      const st = { repository: repoUuid, kind: 'history',
        imported: { source: ver.source, originalId: ver.originalId, date: ver.date, author: ver.author, version: ver.version, zip: ver.zip, fileCount: ver.tree.length, tooLarge: ver.tooLarge },
        files: { fileCount: ver.tree.length } };
      const c = await v('POST', '/api/versionium/commit', { branch: historyBranch(repoUuid), system: SYSTEM, message: `history: ${ver.message}`, causedBy: 'history-import', state: st });
      const commitId = (c.commit && c.commit.commitId) || c.commitId;
      if (!commitId) throw _err(502, `versionium made no commit for ${ver.message}`);
      const changed = ver.tree.filter(f => prev.get(f.path) !== f.sha256);
      const { items, read } = ver.load();
      const byPath = new Map(items.map(x => [x.path, x]));
      let batch = [], size = 0;
      const flush = async () => { if (batch.length) await v('POST', '/api/versionium/files/stage', { contents: batch }, 120000); batch = []; size = 0; };
      for (let i = 0; i < changed.length; i += 200) {
        const slice = changed.slice(i, i + 200).map(f => byPath.get(f.path));
        const bufs = read(slice);
        for (const x of slice) {
          const buf = bufs.get(x.oid) || Buffer.alloc(0);
          if (size + buf.length > STAGE_BATCH_BYTES) await flush();
          batch.push({ path: x.path, content_b64: buf.toString('base64') }); size += buf.length;
        }
      }
      await flush();
      const r = await v('POST', '/api/versionium/files/record', { repository: repoUuid, commitId, tree: ver.tree, contents: [], mode: 'delta' }, 120000);
      if (r && r.ok === false) throw _err(502, `${ver.message}: versionium kept the commit ${commitId} but not its files (${r.code || r.error})`);
      ver.commitId = commitId;
      prev = new Map(ver.tree.map(f => [f.path, f.sha256]));
    }
    return { ok: true, dryRun: false, repoUuid, branch: historyBranch(repoUuid), imported: todo.length, skipped: versions.length - todo.length,
      versions: versions.map((x, i) => ({ ...summary[i], commitId: x.commitId || null })), secrets };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { VERSION, SYSTEM, branchOf, historyBranch, kindOf, index, diff, restoreFile, importHistory };
