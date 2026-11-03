'use strict';
/**
 * cos/disk/disk.js — a compartment's disk: its metadata (the spec and its declaration) and its content in one compressed file (DK1, 0.60.381).
 * Spec: cos/spec/cos-manager.spec MOD-COS-DISK · Map: docs/2026-11-02-cos-disk-phasemap.spec DK1, DK_D0–DK_D2.
 *
 * James, 2026-11-02: "Cos is the wmware. The compartments are the virtual machines/disks. Like can we use the .spec as the virtual machine
 * disk?" · "That's what it was supposed to be. Use the spec as metadata then have the actual file be a compressed or virtual disk or envirement."
 *
 * <system>-<version>-<hash>.disk = gzip(tar):
 *   disk.json   the metadata, first: schema nexus.cos.disk/1, the system, the declaration (compartment.json or <system>.cos, as written), its spec
 *               files (paths and hashes), every file (layer, path, sha256, bytes, mode), the layers, and the base it was made against
 *   code/…      the system's folder without its state
 *   state/…     its data folders, only when asked (data is his: never in a release)
 * The base (lib/, the kernel, at a Nexus version and commit) is named, not copied: a linked clone on a shared base image. COS's disks are COS's
 * data (cos/data/disks, COS_DISKS overrides), never a system's folder, never committed. Every disk made is recorded in Versionium (§17.12).
 *
 *   createDisks({ root, dir, now }) → { pack(system, { withState, by }), inspect(file), verify(file), unpack(file, out, { layers }), list({ system }),
 *     coverage(system), dir }
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { TarWriter, readTar, DEFAULT_SKIP } = require('../testenv/tar.js');

const SCHEMA = 'nexus.cos.disk/1';
const err = (msg, code = 400) => Object.assign(new Error(msg), { code });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function createDisks({ root = path.resolve(__dirname, '..', '..'), dir = null, now = () => new Date() } = {}) {
  const DIR = dir || process.env.COS_DISKS || path.join(process.env.COS_MANAGER_DATA ? path.dirname(process.env.COS_MANAGER_DATA) : path.join(root, 'cos', 'data'), 'disks');
  const INDEX = path.join(DIR, 'index.json');
  const readIndex = () => { try { const j = JSON.parse(fs.readFileSync(INDEX, 'utf8')); return Array.isArray(j) ? j : []; } catch (_) { return []; } };
  const writeIndex = (rows) => { fs.mkdirSync(DIR, { recursive: true }); const t = `${INDEX}.tmp-${process.pid}`; fs.writeFileSync(t, JSON.stringify(rows, null, 2)); fs.renameSync(t, INDEX); };
  const fileOf = (name) => { const b = path.basename(String(name || '')); if (!/^[a-z0-9][a-z0-9._-]*\.disk$/i.test(b)) throw err(`not a disk name: "${name}"`); const f = path.join(DIR, b); if (!fs.existsSync(f)) throw err(`no disk ${b} in ${DIR}`, 404); return f; };

  // what the system is: its folder, its declaration as written, its spec files, its state folders
  function describe(system) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(system || ''))) throw err(`a system's name, not "${system}"`);
    const folder = path.join(root, system);
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw err(`no folder ${system}/ in ${root}`, 404);
    let declaration = null, declaredBy = null;
    try { const n = require('js-yaml').load(fs.readFileSync(path.join(folder, `${system}.cos`), 'utf8')); if (n && n.type === 'cos') { declaration = n.payload; declaredBy = `${system}/${system}.cos`; } } catch (_) {}
    if (!declaration) { try { declaration = JSON.parse(fs.readFileSync(path.join(folder, 'compartment.json'), 'utf8')); declaredBy = `${system}/compartment.json`; } catch (_) {} }
    const state = new Set([`${system}/data`]);
    const d = declaration || {};
    for (const v of Object.values(d.data || {})) if (typeof v === 'string' && v.startsWith(`${system}/`)) state.add(v.replace(/\/+$/, ''));
    for (const v of ((d.repo && d.repo.state) || [])) if (typeof v === 'string' && v.startsWith(`${system}/`)) state.add(v.replace(/\/+$/, ''));
    return { system, folder, declaration, declaredBy, state: [...state].sort() };
  }

  function walk(folder, rel0) {   // every regular file under the folder, sorted, without what never travels (.git, node_modules, caches)
    const files = [], skipped = [];
    const go = (rel) => {
      let ents; try { ents = fs.readdirSync(path.join(folder, rel), { withFileTypes: true }); } catch (e) { skipped.push(`${rel || '.'}: ${e.code}`); return; }
      ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const e of ents) {
        if (DEFAULT_SKIP.has(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name; const abs = path.join(folder, r);
        let st; try { st = fs.lstatSync(abs); } catch (_) { skipped.push(r); continue; }
        if (st.isSymbolicLink()) { skipped.push(`${rel0}/${r} (a link: not followed)`); continue; }
        if (st.isDirectory()) go(r); else if (st.isFile()) files.push({ rel: `${rel0}/${r}`, abs, st });
      }
    };
    go(''); return { files, skipped };
  }

  async function pack(system, { withState = false, by = null } = {}) {
    if (!by) throw err('say who makes it: { "by": "person" | "rule:<id>" }');
    if (/^agent:/.test(String(by))) throw err('an agent proposes; a disk is made by a person or a rule', 403);
    const D = describe(system);
    const { files, skipped } = walk(D.folder, system);
    const inState = (rel) => D.state.some(s => rel === s || rel.startsWith(s + '/'));
    const entries = [];
    for (const f of files) {
      const layer = inState(f.rel) ? 'state' : 'code';
      if (layer === 'state' && !withState) continue;
      const buf = fs.readFileSync(f.abs);
      entries.push({ layer, path: f.rel, sha256: sha(buf), bytes: buf.length, mode: f.st.mode & 0o777, abs: f.abs });
    }
    let version = null, commit = null;
    try { version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim(); } catch (_) {}
    try { commit = require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) {}
    const spec = entries.filter(e => e.layer === 'code' && (/\.spec$/.test(e.path) || e.path === D.declaredBy)).map(e => ({ path: e.path, sha256: e.sha256 }));
    const sum = (l) => { const x = entries.filter(e => e.layer === l); return { files: x.length, bytes: x.reduce((a, e) => a + e.bytes, 0) }; };
    const contentHash = sha(entries.map(e => `${e.layer} ${e.path} ${e.sha256}`).join('\n')).slice(0, 12);
    const manifest = {
      schema: SCHEMA, system, kind: 'archive', created: now().toISOString(), by, contentHash,
      metadata: { declaredBy: D.declaredBy, declaration: D.declaration, spec, coverage: coverage(system, entries) },
      base: { kernel: 'lib', nexus: version, commit, note: 'named, not copied: the disk runs on a Nexus kernel of this version (a linked clone on a shared base image)' },
      layers: { code: sum('code'), state: withState ? { ...sum('state'), folders: D.state } : null },
      files: entries.map(({ abs, ...e }) => e), skipped,
    };
    fs.mkdirSync(DIR, { recursive: true });
    const name = `${system}-${version || 'unversioned'}-${contentHash}${withState ? '-with-state' : ''}.disk`;
    const tmp = path.join(DIR, `.${name}.tar-${process.pid}`), out = path.join(DIR, name);
    const fd = fs.openSync(tmp, 'w'); const w = new TarWriter(fd);
    try {
      const mj = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
      w.entry({ path: 'disk.json', mode: 0o644, size: mj.length, mtime: Date.now() / 1000, type: '0' }); w._write(mj); w._write(Buffer.alloc((512 - (mj.length % 512)) % 512));
      for (const e of entries) { const st = fs.statSync(e.abs); w.file(`${e.layer}/${e.path}`, e.abs, { mode: e.mode, size: st.size, mtimeMs: st.mtimeMs }); }
      w.end();
    } finally { fs.closeSync(fd); }
    await new Promise((res, rej) => { const src = fs.createReadStream(tmp), gz = zlib.createGzip({ level: 9 }), dst = fs.createWriteStream(out); src.pipe(gz).pipe(dst); dst.on('finish', res); dst.on('error', rej); gz.on('error', rej); src.on('error', rej); });
    fs.rmSync(tmp, { force: true });
    const bytes = fs.statSync(out).size, diskSha = sha(fs.readFileSync(out));
    const row = { file: name, system, created: manifest.created, by, bytes, sha256: diskSha, files: entries.length, withState: !!withState, nexus: version, contentHash };
    writeIndex([row, ...readIndex().filter(r => r.file !== name)]);
    try { require('../../lib/versionium-record.js').record({ kind: 'cos.disk', system, by, message: `COS: ${system}'s disk ${name} (${entries.length} files${withState ? ', with its data' : ''})`, change: { disk: row } }).catch(() => {}); } catch (_) {}
    return { ok: true, ...row, path: out, layers: manifest.layers, metadata: { declaredBy: D.declaredBy, spec: spec.length, coverage: manifest.metadata.coverage }, skipped };
  }

  const read = (file) => { const f = path.isAbsolute(file) ? file : fileOf(file); return readTar(zlib.gunzipSync(fs.readFileSync(f))); };
  function inspect(file) {
    const ents = read(file); const m = ents.find(e => e.path === 'disk.json');
    if (!m) throw err('not a disk: no disk.json inside', 422);
    const manifest = JSON.parse(m.data.toString('utf8'));
    if (manifest.schema !== SCHEMA) throw err(`not a disk this COS reads: schema ${manifest.schema}`, 422);
    const { files, ...head } = manifest; return { ok: true, ...head, fileCount: files.length, files };
  }
  function verify(file) {
    const ents = read(file); const m = ents.find(e => e.path === 'disk.json'); if (!m) throw err('not a disk: no disk.json inside', 422);
    const manifest = JSON.parse(m.data.toString('utf8')); const got = new Map(ents.filter(e => e.type === '0' && e.path !== 'disk.json').map(e => [e.path, e]));
    const bad = [], missing = [];
    for (const f of manifest.files) { const e = got.get(`${f.layer}/${f.path}`); if (!e) { missing.push(f.path); continue; } got.delete(`${f.layer}/${f.path}`); if (sha(e.data) !== f.sha256) bad.push(f.path); }
    const extra = [...got.keys()];
    return { ok: !bad.length && !missing.length && !extra.length, system: manifest.system, files: manifest.files.length, changed: bad, missing, extra };
  }
  function unpack(file, out, { layers = ['code'] } = {}) {
    if (!out) throw err('say where: unpack(file, folder)');
    const base = path.resolve(out); const ents = read(file); let n = 0;
    for (const e of ents) {
      if (e.type !== '0' || e.path === 'disk.json') continue;
      const layer = e.path.split('/')[0]; if (!layers.includes(layer)) continue;
      const rel = e.path.slice(layer.length + 1); const dest = path.resolve(base, rel);
      if (!dest.startsWith(base + path.sep)) throw err(`refused: "${e.path}" would leave ${base}`, 422);
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.data, { mode: e.mode || 0o644 }); n++;
    }
    return { ok: true, files: n, into: base, layers };
  }
  const list = ({ system = null } = {}) => readIndex().filter(r => (!system || r.system === system) && fs.existsSync(path.join(DIR, r.file)));

  // how much of the disk its spec can rebuild: the share of its code files a spec module's path names (the measure scripts/systems-report.js
  // uses), so COS can say how far the metadata is from being the whole disk
  function coverage(system, entries = null) {
    const code = (entries || walk(path.join(root, system), system).files.map(f => ({ layer: 'code', path: f.rel }))).filter(e => e.layer === 'code' && /\.(js|mjs|cjs|ts|py|html|css)$/.test(e.path));
    const named = new Set();
    const specs = []; for (const d of [path.join(root, system, 'spec'), path.join(root, 'docs')]) { try { for (const f of fs.readdirSync(d)) if (f.endsWith('.spec')) specs.push(path.join(d, f)); } catch (_) {} }
    for (const f of specs) { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch (_) { continue; } for (const m of t.matchAll(/\bpath:\s*['"]?([\w./-]+)/g)) if (m[1].startsWith(`${system}/`)) named.add(m[1]); }
    const hit = code.filter(e => named.has(e.path)).length;
    return { codeFiles: code.length, namedBySpec: hit, pct: code.length ? Math.round(hit / code.length * 100) : 0 };
  }

  return { pack, inspect, verify, unpack, list, coverage, describe, dir: DIR };
}

module.exports = { createDisks, SCHEMA, MODULE_ID: 'cos.disk', VERSION: '1.0.0' };
