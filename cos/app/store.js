'use strict';
/**
 * cos/app/store.js — COS as an application: the version store and zip import (COSA1, 0.60.87)
 * comp_id: cos.app.store
 * UUID: cos-app-store-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-cos-app-phasemap.spec (COSA1_version_store_and_import)
 *
 * James, 2026-10-15: "cos exe for my pc to run nexus on, so i can just replace the zip each time. so i can manage them better ... like cos as a windnows
 * application for running my projects"  · 2026-10-16: "lets do the cos applicatoin"
 *
 * Layout under <root> (Windows %LOCALAPPDATA%\COS, elsewhere ~/.local/share/cos, or COS_APP_ROOT / --root):
 *   inbox/                          drop a zip here (inbox/done, inbox/failed with the reason)
 *   projects/<project>/
 *     versions/<version>/           one folder per release, side by side, never overwritten
 *     data/                         the ONE persistent data folder; every version's data/ is a link to it
 *     state.json                    { versions: { v: { sha256, bytes, verified, importedAt } }, current, previous }
 *     trash/                        a removed version is moved here, not deleted (§0.3)
 *
 * Why the data link: 37 Nexus modules compute their data folder from their own location, so replacing the folder from a zip would wipe jobs, hats and
 * registries. A Windows directory junction (no admin needed) makes every version see the same data. COSA5 (one data root) is the proper fix; this carries it until then.
 *
 * This module only manages files. It never runs the project (COSA3), never switches `current` (COSA4), and never downloads (COSA7).
 * Zip reading is lib/zip.js (CRC-checked, refuses any entry outside the folder it extracts into).
 */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const Zip = require('../../lib/zip.js');

const MODULE_ID = 'cos.app.store';
const LIMITS = { maxZipBytes: 600 * 1024 * 1024, maxEntries: 60000, maxUncompressed: 3 * 1024 ** 3 };
const SEMVER = /^\d+\.\d+\.\d+$/, PROJECT = /^[a-z0-9][a-z0-9_-]{0,40}$/;

function defaultRoot() {
  if (process.env.COS_APP_ROOT) return process.env.COS_APP_ROOT;
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'COS');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'cos');
}
const P = (root, project) => ({
  project: path.join(root, 'projects', project), versions: path.join(root, 'projects', project, 'versions'), data: path.join(root, 'projects', project, 'data'),
  state: path.join(root, 'projects', project, 'state.json'), trash: path.join(root, 'projects', project, 'trash'),
});
const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function readState(root, project) { try { return JSON.parse(fs.readFileSync(P(root, project).state, 'utf8')); } catch (_) { return { project, versions: {}, current: null, previous: null }; } }
function writeState(root, project, st) { const f = P(root, project).state; fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(st, null, 2)); fs.renameSync(t, f); }
const sha256File = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rmrf = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };

/** checksumFor(zipPath, { sha256, sums }) → { expected, source } | null. `sums` is a SHA256SUMS file ("<hex>  <name>"); else <zip>.sha256 beside it. */
function checksumFor(zipPath, { sha256 = null, sums = null } = {}) {
  if (sha256) return { expected: String(sha256).trim().toLowerCase(), source: 'given' };
  const base = path.basename(zipPath);
  const files = [sums, zipPath + '.sha256', path.join(path.dirname(zipPath), 'SHA256SUMS')].filter(Boolean);
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    for (const line of text.split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim()) || (f.endsWith('.sha256') ? /^([0-9a-fA-F]{64})\s*$/.exec(line.trim()) : null); if (m && (!m[2] || path.basename(m[2]) === base)) return { expected: m[1].toLowerCase(), source: path.basename(f) }; }
  }
  return null;
}

function _badName(n) { return !n || /(^|[\\/])\.\.([\\/]|$)/.test(n) || /^([\\/]|[A-Za-z]:)/.test(n) || n.includes('\0'); }

/** inspect(zipPath, limits) → { ok, project, version, top, entries, uncompressed } | { ok:false, error }. Reads the zip's list only; extracts nothing. */
function inspect(zipPath, limits = LIMITS) {
  let st; try { st = fs.statSync(zipPath); } catch (_) { return { ok: false, error: `no such file: ${zipPath}` }; }
  if (!st.isFile()) return { ok: false, error: `not a file: ${zipPath}` };
  if (st.size > limits.maxZipBytes) return { ok: false, error: `the zip is ${(st.size / 1048576).toFixed(0)} MB, over the ${(limits.maxZipBytes / 1048576).toFixed(0)} MB limit` };
  let zip; try { zip = new Zip(zipPath); } catch (e) { return { ok: false, error: `not a readable zip: ${e.message}` }; }
  let entries; try { entries = zip.getEntries(); } catch (e) { return { ok: false, error: `not a readable zip: ${e.message}` }; }
  if (!entries.length) return { ok: false, error: 'the zip is empty' };
  if (entries.length > limits.maxEntries) return { ok: false, error: `${entries.length} entries, over the ${limits.maxEntries} limit` };
  let total = 0; const tops = new Set();
  for (const e of entries) {
    const n = e.entryName; if (_badName(n)) return { ok: false, error: `refused: an entry would land outside the folder (${JSON.stringify(n).slice(0, 80)})` };
    total += (e.header && e.header.size) || 0; tops.add(n.split(/[\\/]/)[0]);
  }
  if (total > limits.maxUncompressed) return { ok: false, error: `unpacks to ${(total / 1048576).toFixed(0)} MB, over the ${(limits.maxUncompressed / 1048576).toFixed(0)} MB limit` };
  if (tops.size !== 1) return { ok: false, error: `expected one top folder (nexus-<version>/), found ${tops.size}: ${[...tops].slice(0, 3).join(', ')}` };
  const top = [...tops][0]; const m = /^([a-z0-9][a-z0-9_-]*?)-(\d+\.\d+\.\d+)$/.exec(top);
  if (!m) return { ok: false, error: `the top folder "${top}" is not <project>-<version> (like nexus-0.60.65)` };
  const vEntry = entries.find(e => e.entryName.replace(/\\/g, '/') === `${top}/VERSION`);
  if (!vEntry) return { ok: false, error: `no ${top}/VERSION file inside (a release zip from scripts/release-zip.js has one)` };
  const inside = zip.readAsText(vEntry).trim();
  if (!SEMVER.test(inside)) return { ok: false, error: `VERSION says "${inside.slice(0, 40)}", not a version` };
  if (inside !== m[2]) return { ok: false, error: `the folder says ${m[2]} but VERSION says ${inside}: refused, it is not the release it claims to be` };
  if (!PROJECT.test(m[1])) return { ok: false, error: `"${m[1]}" is not a usable project name` };
  return { ok: true, project: m[1], version: inside, top, entries: entries.length, uncompressed: total, zip };
}

/** linkData(versionDir, dataDir) — make versionDir/data the junction/symlink to the persistent data folder; anything real that was there moves in first, never overwriting. */
function linkData(versionDir, dataDir) {
  fs.mkdirSync(dataDir, { recursive: true }); const link = path.join(versionDir, 'data'); const moved = [];
  let ls = null; try { ls = fs.lstatSync(link); } catch (_) {}
  if (ls && !ls.isSymbolicLink()) {
    const walk = (d, rel = '') => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n), r = path.join(rel, n), s = fs.statSync(f);
      if (s.isDirectory()) walk(f, r); else { const to = path.join(dataDir, r); if (!fs.existsSync(to)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f, to); moved.push(r); } } } };
    walk(link); rmrf(link);
  } else if (ls) fs.unlinkSync(link);
  fs.symlinkSync(dataDir, link, 'junction');
  const ok = fs.lstatSync(link).isSymbolicLink() && fs.realpathSync(link) === fs.realpathSync(dataDir);
  if (!ok) throw new Error('the data link did not resolve to the persistent data folder');
  return { link, moved };
}

/**
 * importZip(root, zipPath, { sha256, sums, requireChecksum, project, limits }) → { ok, project, version, verified, already? } | { ok:false, error }
 * Order: inspect (nothing extracted) → checksum → same-version rule → extract to a temp folder → rename into place → data link → record. A failure leaves nothing half-installed.
 */
function importZip(root, zipPath, opts = {}) {
  const limits = { ...LIMITS, ...(opts.limits || {}) };
  const ins = inspect(zipPath, limits); if (!ins.ok) return ins;
  if (opts.project && opts.project !== ins.project) return { ok: false, error: `this zip is project "${ins.project}", not "${opts.project}"` };
  const sum = checksumFor(zipPath, opts); const actual = sha256File(zipPath);
  if (sum && sum.expected !== actual) return { ok: false, error: `checksum mismatch (${sum.source}): expected ${sum.expected.slice(0, 12)}…, the zip is ${actual.slice(0, 12)}…: refused, nothing was extracted` };
  if (!sum && opts.requireChecksum) return { ok: false, error: 'no checksum to verify this zip against (give --sha256, or put SHA256SUMS beside it): refused' };
  const paths = P(root, ins.project); const st = readState(root, ins.project); const have = st.versions[ins.version];
  if (have) {
    if (have.sha256 === actual && fs.existsSync(path.join(paths.versions, ins.version))) return { ok: true, already: true, project: ins.project, version: ins.version, verified: !!have.verified, note: 'this version is already installed (same content): nothing changed' };
    return { ok: false, error: `version ${ins.version} is already installed with different content (${String(have.sha256).slice(0, 12)}… vs ${actual.slice(0, 12)}…): refused, it will not be overwritten. Remove it first if it is the one you want to replace.` };
  }
  fs.mkdirSync(paths.versions, { recursive: true });
  const tmp = path.join(paths.versions, `.incoming-${process.pid}-${Date.now()}`); const dest = path.join(paths.versions, ins.version);
  try {
    fs.mkdirSync(tmp, { recursive: true }); ins.zip.extractAllTo(tmp, true);
    const got = path.join(tmp, ins.top); if (!fs.existsSync(path.join(got, 'VERSION'))) throw new Error('extraction did not produce the release folder');
    const link = linkData(got, paths.data);
    fs.renameSync(got, dest);
    st.versions[ins.version] = { sha256: actual, bytes: fs.statSync(zipPath).size, entries: ins.entries, verified: !!sum, verifiedBy: sum ? sum.source : null, importedAt: new Date().toISOString(), dataMoved: link.moved.length };
    writeState(root, ins.project, st);
    return { ok: true, project: ins.project, version: ins.version, verified: !!sum, entries: ins.entries, dataMoved: link.moved.length, note: sum ? `verified against ${sum.source}` : 'NOT verified: no checksum was given or found beside the zip' };
  } catch (e) { rmrf(dest); return { ok: false, error: `import failed and was cleaned up: ${e.message}` }; }
  finally { rmrf(tmp); }
}

/** list(root, project?) → every project's versions, newest first, with current/previous and whether each version's data link is intact. */
function list(root, project = null) {
  const dir = path.join(root, 'projects'); let names = []; try { names = fs.readdirSync(dir).filter(n => PROJECT.test(n)); } catch (_) {}
  if (project) names = names.filter(n => n === project);
  return names.map(name => { const st = readState(root, name), p = P(root, name);
    const versions = Object.keys(st.versions).sort((a, b) => cmpVer(b, a)).map(v => { const d = path.join(p.versions, v); let linked = false; try { linked = fs.realpathSync(path.join(d, 'data')) === fs.realpathSync(p.data); } catch (_) {}
      return { version: v, present: fs.existsSync(d), current: st.current === v, previous: st.previous === v, verified: !!st.versions[v].verified, dataLinked: linked, importedAt: st.versions[v].importedAt }; });
    return { project: name, current: st.current, previous: st.previous, data: p.data, versions }; });
}

/** remove(root, project, version) — moves it to trash/ (never deletes); refuses the current version. The record stays, marked removed, so nothing is silently forgotten. */
function remove(root, project, version) {
  const st = readState(root, project); if (!st.versions[version]) return { ok: false, error: `no version ${version} of ${project}` };
  if (st.current === version) return { ok: false, error: `${version} is the current version: switch first` };
  const p = P(root, project); const from = path.join(p.versions, version); fs.mkdirSync(p.trash, { recursive: true });
  const to = path.join(p.trash, `${version}-${Date.now()}`);
  if (fs.existsSync(from)) { try { fs.unlinkSync(path.join(from, 'data')); } catch (_) {} fs.renameSync(from, to); }   // the data link goes first: trash must never hold a path into the live data
  delete st.versions[version]; if (st.previous === version) st.previous = null; writeState(root, project, st);
  return { ok: true, moved: to };
}

/** scanInbox(root, opts) — import every .zip in inbox/: done ones move to inbox/done/, refused ones to inbox/failed/ with <name>.why.txt. "Replace the zip each time" = drop it here. */
function scanInbox(root, opts = {}) {
  const inbox = path.join(root, 'inbox'); fs.mkdirSync(inbox, { recursive: true }); const out = [];
  for (const n of fs.readdirSync(inbox).filter(n => /\.zip$/i.test(n)).sort()) {
    const f = path.join(inbox, n); const r = importZip(root, f, opts); const sub = path.join(inbox, r.ok ? 'done' : 'failed'); fs.mkdirSync(sub, { recursive: true });
    fs.renameSync(f, path.join(sub, n)); if (!r.ok) fs.writeFileSync(path.join(sub, n + '.why.txt'), r.error + '\n');
    out.push({ file: n, ...r, zip: undefined });
  }
  return out;
}

function status(root) {
  const projects = list(root); let pending = 0; try { pending = fs.readdirSync(path.join(root, 'inbox')).filter(n => /\.zip$/i.test(n)).length; } catch (_) {}
  return { root, platform: process.platform, projects, inbox: { path: path.join(root, 'inbox'), pending } };
}

module.exports = { MODULE_ID, LIMITS, defaultRoot, checksumFor, inspect, importZip, linkData, list, remove, scanInbox, status, cmpVer };
