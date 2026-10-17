'use strict';
/**
 * idearium/lib/projects-folder.cjs — COSA14: his projects folder, found and brought into Idearium (0.60.139)
 * comp_id: nexus.idearium.lib.projects-folder
 * Map: docs/2026-10-15-cos-app-phasemap.spec (addendum 2026-10-17, COSA14_his_projects_folder)
 *
 * James, 2026-10-17, with a screenshot of D:\Projects (38 folders: Behavior Engine, BodyOS, Bridge Mesh, Clear-glass, Cobalt,
 * Co-create, …): "these are all my projects i have so far. way more. in some folders. i was hoping to use idearium and cos to
 * manage them" · 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed."
 *
 * Idearium could take a project only as an uploaded zip (POST /api/repos/import). Nothing read a folder on his disk. This:
 *   scan(root, { depth, skipDirs })  → every project under his folder, also inside group folders ("in some folders"):
 *       a folder is a PROJECT when it carries a marker (package.json, .git, pyproject.toml, Cargo.toml, go.mod, a .sln, a .spec,
 *       index.html, requirements.txt, …) or a README beside code; it is not descended into (its subfolders are its own). A folder
 *       with no marker whose subfolders hold projects is a GROUP and is descended into, up to depth. A folder of files with no
 *       marker (notes, ideas, docs) is a project too, marked `files` (weak: true) — his words, "these are all my projects". Only an
 *       empty folder is NOT RECOGNIZED, and it is listed, never dropped (§1.2).
 *   zipFolder(dir, { skipDirs, maxFiles, maxTotalBytes }) → the folder as a zip Buffer (lib/zip.js), with the same skip rules and
 *       caps as an uploaded zip (lib/project-import.config.js), so the import is the SAME door: repo.import-archive (§8.6).
 *   readState / writeState → { root, imported: { <abs path>: { uuid, at } } } in Idearium's data dir: what the folder is and what
 *       came in from it, kept across restarts (§2.1).
 * Nothing here writes into his folder: it is read, never changed.
 */
const fs = require('fs');
const path = require('path');

const MODULE_ID = 'nexus.idearium.lib.projects-folder';
const VERSION = '1.0.0';
const STRONG = ['package.json', 'pyproject.toml', 'setup.py', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'CMakeLists.txt', 'composer.json', 'Gemfile', 'deno.json', 'index.html', 'manifest.json'];
const STRONG_EXT = /\.(sln|csproj|vcxproj|spec|phasemap\.spec|uproject|xcodeproj|godot|unity)$/i;
const CODE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|kt|cs|cpp|c|h|swift|rb|php|lua|gd|sh|ps1|html|css)$/i;
const DEFAULT_SKIP = ['node_modules', '.git', '.svn', 'dist', 'build', '__pycache__', '.next', '.venv', 'venv', 'target', 'bin', 'obj', '.idea', '.vs'];

function _entries(dir) { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; } }

/** what marks this folder as a project (empty: not one) */
function markersOf(dir) {
  const ents = _entries(dir);
  const names = new Set(ents.map(e => e.name));
  const m = [];
  if (names.has('.git')) m.push('.git');
  for (const s of STRONG) if (names.has(s)) m.push(s);
  for (const e of ents) if (STRONG_EXT.test(e.name)) m.push(e.name);
  if (!m.length && [...names].some(n => /^readme(\.(md|txt))?$/i.test(n)) && ents.some(e => e.isFile() && CODE_EXT.test(e.name))) m.push('README + code');
  return m.slice(0, 6);
}

/** a quick size of a project: files and bytes, skipping what an import skips, capped so a huge folder costs little to look at */
function sizeOf(dir, { skipDirs = DEFAULT_SKIP, cap = 20000 } = {}) {
  let files = 0, bytes = 0, capped = false;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of _entries(d)) {
      if (e.isDirectory()) { if (!skipDirs.includes(e.name)) stack.push(path.join(d, e.name)); continue; }
      if (!e.isFile()) continue;
      files++; try { bytes += fs.statSync(path.join(d, e.name)).size; } catch (_) {}
      if (files >= cap) { capped = true; return { files, bytes, capped }; }
    }
  }
  return { files, bytes, capped };
}

function scan(root, { depth = 3, skipDirs = DEFAULT_SKIP, sizes = true } = {}) {
  root = path.resolve(String(root || ''));
  let st; try { st = fs.statSync(root); } catch (e) { return { ok: false, error: `no folder at ${root}` }; }
  if (!st.isDirectory()) return { ok: false, error: `${root} is not a folder` };
  const projects = [], groups = [], notRecognized = [];
  const visit = (dir, level, group) => {
    for (const e of _entries(dir)) {
      if (!e.isDirectory() || e.name.startsWith('.') || skipDirs.includes(e.name)) continue;
      const p = path.join(dir, e.name), rel = path.relative(root, p).split(path.sep).join('/');
      const m = markersOf(p);
      if (m.length) { projects.push({ name: e.name, path: p, rel, group, markers: m, ...(sizes ? { size: sizeOf(p, { skipDirs }) } : {}) }); continue; }
      const before = projects.length;
      if (level < depth) visit(p, level + 1, rel);
      if (projects.length > before) { groups.push({ rel, projects: projects.length - before }); continue; }
      // his words: "these are all my projects". A folder of files with no marker (notes, ideas, docs) is a project too, marked so
      const sz = sizeOf(p, { skipDirs, cap: 2000 });
      if (sz.files) projects.push({ name: e.name, path: p, rel, group, markers: ['files'], weak: true, ...(sizes ? { size: sz } : {}) });
      else notRecognized.push({ rel, why: 'empty: no files in it (after the skipped folders)' });
    }
  };
  visit(root, 1, null);
  return { ok: true, root, projects, groups, notRecognized, counts: { projects: projects.length, groups: groups.length, notRecognized: notRecognized.length } };
}

/** the folder as a zip, with the import's own skip rules and caps (the same door as an uploaded zip) */
function zipFolder(dir, { skipDirs = DEFAULT_SKIP, maxFiles = 20000, maxTotalBytes = 512 * 1024 * 1024, maxFileBytes = 64 * 1024 * 1024 } = {}) {
  const Zip = require('../../lib/zip.js');
  const items = [], skipped = [];
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of _entries(d)) {
      const p = path.join(d, e.name), rel = path.relative(dir, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (skipDirs.includes(e.name)) skipped.push({ rel, why: 'skipped folder (the import skips it too)' }); else stack.push(p); continue; }
      if (!e.isFile()) continue;
      let size = 0; try { size = fs.statSync(p).size; } catch (_) { continue; }
      if (size > maxFileBytes) { skipped.push({ rel, why: `${(size / 1048576).toFixed(0)} MB, over the ${(maxFileBytes / 1048576).toFixed(0)} MB per-file cap` }); continue; }
      if (items.length >= maxFiles) return { ok: false, error: `more than ${maxFiles} files (after skipping ${skipDirs.join(', ')}): too big to bring in whole — import a part of it`, files: items.length };
      if (bytes + size > maxTotalBytes) return { ok: false, error: `over ${(maxTotalBytes / 1048576).toFixed(0)} MB (after skipping ${skipDirs.join(', ')}): too big to bring in whole`, bytes };
      let data; try { data = fs.readFileSync(p); } catch (err) { skipped.push({ rel, why: `could not read it: ${err.code || err.message}` }); continue; }
      items.push({ path: rel, data }); bytes += size;
    }
  }
  if (!items.length) return { ok: false, error: 'nothing to bring in: no files outside the skipped folders' };
  return { ok: true, buf: Zip.create(items), files: items.length, bytes, skipped: skipped.slice(0, 50), skippedCount: skipped.length };
}

function _stateFile() {
  const { ideariumDataDir } = require('./data-dir.cjs');
  return path.join(ideariumDataDir(), 'my-projects-folder.json');
}
function readState() { try { return JSON.parse(fs.readFileSync(_stateFile(), 'utf8')); } catch (_) { return { root: null, imported: {} }; } }
function writeState(next) {
  const f = _stateFile(); fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(next, null, 2)); fs.renameSync(tmp, f);
  return next;
}

module.exports = { MODULE_ID, VERSION, DEFAULT_SKIP, markersOf, sizeOf, scan, zipFolder, readState, writeState };
