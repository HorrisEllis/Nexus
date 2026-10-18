'use strict';
/**
 * products/flight-recorder/lib/project.js — FR4a: the flight recorder over any project folder, on its own.
 * Product: flight-recorder   (part of products/flight-recorder; the branch tool carries every file tagged so)
 * Map: docs/2026-10-16-repo-carve-phasemap.spec (FR4_stands_alone)
 *
 * James, 2026-10-17: "Okay. Keep going." (FR4, after FR1-FR3). The record (FR1), the test before it lands (FR2) and the undo
 * (FR3) were built for Idearium's repos. This opens a plain folder instead: everything the flight recorder keeps goes in
 * <project>/.flight-recorder/ — no Idearium, no Versionium server, no Nexus checkout (it runs from a carved copy).
 *
 * Every store is placed by an env var read when its module loads (§FR4 found), so open() points them into the project FIRST
 * and only then loads the code:
 *   NEXUS_INJECT_DIR     changes (.inject nodes)        JAA_DATA_DIR          activity log, settings
 *   RUN_STATE_DIR        runs                           VERSIONIUM_DATA_DIR   versions and their file blobs
 * One process opens one project (the stores are process-wide). The code is Nexus's own, required relatively from the product's
 * place in the tree (products/flight-recorder/lib → the root), which a carved copy keeps.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '1.0.0';
const ROOT = path.resolve(__dirname, '..', '..', '..');   // Nexus, or the carved copy's root
const HOME = '.flight-recorder';
const SKIP = new Set([HOME, '.git', 'node_modules']);
let _open = null;

function _env(home) {
  return { NEXUS_INJECT_DIR: path.join(home, 'changes'), JAA_DATA_DIR: path.join(home, 'store'), RUN_STATE_DIR: path.join(home, 'runs'),
    VERSIONIUM_DATA_DIR: path.join(home, 'versions'), VERSIONIUM_FILE_BLOB_DIR: path.join(home, 'versions', 'file-blobs') };
}

function _safe(dir, rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!r || r.startsWith('/') || /^[A-Za-z]:/.test(r) || r.split('/').includes('..') || r.split('/')[0] === HOME) return null;
  return r;
}

/** the files of the project as a version sees them (the recorder's own folder, .git and node_modules left out) */
function files(dir) {
  const out = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(r); else if (e.isFile()) out.push(r);
    }
  })('');
  return out.sort();
}

/** open(dir, { create }) → the project: { dir, home, repo, layer, RI, CE, CR, PE, RV } */
function open(dir, { create = false } = {}) {
  dir = path.resolve(dir);
  if (_open) { if (_open.dir === dir) return _open; throw new Error(`this process already opened ${_open.dir}: one project per process`); }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`no such folder: ${dir}`);
  const home = path.join(dir, HOME), meta = path.join(home, 'project.json');
  if (!fs.existsSync(meta)) {
    if (!create) throw new Error(`no flight recorder in ${dir} — run: flight-recorder init`);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(meta, JSON.stringify({ id: `fr-${crypto.randomUUID().slice(0, 12)}`, name: path.basename(dir), createdAt: new Date().toISOString(), recorder: VERSION }, null, 2) + '\n');
    fs.writeFileSync(path.join(home, '.gitignore'), '*\n');   // the recorder's state is not the project's code
  }
  const info = JSON.parse(fs.readFileSync(meta, 'utf8'));
  delete process.env.NEXUS_TEST_SANDBOX;
  Object.assign(process.env, _env(home), { NEXUS_EVIDENCE: 'off' });   // evidence runs when asked (`test`), not behind a write
  // plain relative requires, AFTER the env is set: the branch tool follows these to carry what the product needs (a computed
  // path is invisible to it — the first carved copy lacked lib/repo-activity.js that way, found by FS-02)
  const RI = require('../../../lib/repo-inject.js'), CE = require('../../../lib/code-edit.js'), CR = require('../../../lib/change-record.js');
  const PE = require('../../../lib/proposal-evidence.js'), RV = require('../../../lib/repo-versions.js');
  const repo = { uuid: info.id, name: info.name };

  // a repo layer over the folder: what the changes code reads and writes through; every write tells the versions it happened
  const read = (u, p) => { const r = _safe(dir, p); if (!r) return { error: `not a path in the project: ${p}` }; const f = path.join(dir, r); return fs.existsSync(f) && fs.statSync(f).isFile() ? { path: r, content: fs.readFileSync(f, 'utf8') } : { error: `file not found: ${r}` }; };
  const layer = {
    readFile: read, readTextFile: read,
    writeTextFile(u, p, text) { const r = _safe(dir, p); if (!r) return { error: `not a path in the project: ${p}` }; fs.mkdirSync(path.dirname(path.join(dir, r)), { recursive: true }); fs.writeFileSync(path.join(dir, r), text); RV.touched(repo.uuid, r, 'write'); return { ok: true }; },
    deleteTextFile(u, p) { const r = _safe(dir, p); if (!r) return { error: `not a path in the project: ${p}` }; try { fs.unlinkSync(path.join(dir, r)); } catch (_) {} RV.touched(repo.uuid, r, 'delete'); return { ok: true }; },
    deleteFile(u, p) { return this.deleteTextFile(u, p); },
    refresh() { return { ok: true }; },
  };
  RI.setEvidenceRoot(() => dir);                                    // FR2: tested in the project's own tree
  RV.setCommitter((o) => require('./versions.js').commit({ ...o, dir, repo }));   // every write settles into a version, in-process
  _open = { version: VERSION, dir, home, info, repo, layer, RI, CE, CR, PE, RV };
  return _open;
}

/** flush() — write every store this process touched to disk (a command ends with process.exit, which skips the stores' own flush) */
// §FR6 0.60.144 — the store's own home since 0.60.130 is lib/jaa-store.js (guardian/jaa-store.js is a re-export kept for old
// requirers). Reached through the old path inside a try, the carve read it as optional and cut it, so the copy lacked a file
// the product must carry and test-flight-recorder-standalone failed 0/6 on 0.60.142.
function flush() { if (!_open) return 0; try { return require('../../../lib/jaa-store.js').flushAllStores(); } catch (_) { return 0; } }

module.exports = { VERSION, ROOT, HOME, open, files, flush, _env };
