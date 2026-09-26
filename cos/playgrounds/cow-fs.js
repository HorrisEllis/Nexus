/**
 * playgrounds/cow-fs.js
 * COMPARTMENT OS — Copy-on-Write Filesystem Layer (spec §67)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * SCOPE NOTE, flagged: "copy-on-write" in spec's Playground.fs.mode means
 * lazy duplication on first write — true COW needs filesystem-level
 * support (Btrfs/ZFS reflinks, Windows ReFS block cloning) that isn't
 * portably reachable from Node. What this delivers is the same END-USER
 * GUARANTEE — the source compartment's files are never touched by
 * anything that happens inside the playground — via an EAGER full copy
 * at creation time instead of lazy-on-write. Slower for large trees,
 * correct for every tree size. If real lazy COW matters later (large
 * compartments, frequent playground creation), that's the seam: swap
 * this module's internals for platform-specific reflink calls, keep the
 * same three functions' signatures.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FS_MODES = Object.freeze(['cow', 'fresh', 'readonly']);

/**
 * Recursively copies a directory tree. Skips common noise (node_modules,
 * .git, the COS WAL/nex dirs) — copying those into every playground would
 * be slow and pointless.
 * @param {string} src
 * @param {string} dest
 */
function copyTree(src, dest) {
  const SKIP = new Set(['node_modules', '.git', '.cos-wal', '.nex', '.cos-manifest.json']);
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(src)) return;

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      // fs.copyFileSync does NOT preserve mtime — the copy gets a fresh
      // mtime at copy time. diffAgainstSource() detects real edits by
      // mtime divergence, so an untouched copy would look "changed" the
      // instant it was created unless the source's mtime is restored here.
      const srcStat = fs.statSync(srcPath);
      fs.utimesSync(destPath, srcStat.atime, srcStat.mtime);
    }
  }
}

/**
 * Sets up a playground compartment's filesystem root according to mode.
 *   'cow'      — eager copy of sourceRoot into newRoot (see header note)
 *   'fresh'    — empty newRoot
 * 'readonly' is enforced by the caller setting fs.writable = [] on the
 * resulting compartment config — this module just creates the directory.
 *
 * @param {'cow'|'fresh'|'readonly'} mode
 * @param {string} newRoot
 * @param {string|null} sourceRoot  required for 'cow' and 'readonly'
 */
function setupPlaygroundFs(mode, newRoot, sourceRoot = null) {
  if (!FS_MODES.includes(mode)) {
    throw new Error(`setupPlaygroundFs: unknown mode "${mode}"`);
  }
  if (mode === 'fresh') {
    fs.mkdirSync(newRoot, { recursive: true });
    return;
  }
  if (!sourceRoot) {
    throw new Error(`setupPlaygroundFs: mode "${mode}" requires a sourceRoot`);
  }
  copyTree(sourceRoot, newRoot);
}

/**
 * Counts files changed/added in the playground copy versus its original
 * source — used by the UI's "Changes: +3 files" display. Cheap mtime/size
 * comparison, not a content hash (good enough for a status line, not a
 * security boundary).
 * @param {string} playgroundRoot
 * @param {string} sourceRoot
 * @returns {{ changed: number, added: number }}
 */
function diffAgainstSource(playgroundRoot, sourceRoot) {
  const SKIP = new Set(['node_modules', '.git', '.cos-wal', '.nex', '.cos-manifest.json']);
  let added = 0, changed = 0;
  if (!fs.existsSync(playgroundRoot)) return { changed: 0, added: 0 };

  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const rel = path.join(base, entry.name);
      const pgPath = path.join(playgroundRoot, rel);
      const srcPath = path.join(sourceRoot, rel);
      if (entry.isDirectory()) {
        walk(pgPath, rel);
        continue;
      }
      if (!fs.existsSync(srcPath)) {
        added++;
        continue;
      }
      const a = fs.statSync(pgPath);
      const b = fs.statSync(srcPath);
      if (a.size !== b.size) {
        changed++;
        continue;
      }
      // Same size — mtime alone isn't reliable here (utimesSync rounds to
      // whatever precision the filesystem supports, often whole seconds,
      // so a freshly-copied untouched file could still show a few ms of
      // drift). Byte comparison is exact and these are source-code-sized
      // files, so the cost is negligible.
      if (!fs.readFileSync(pgPath).equals(fs.readFileSync(srcPath))) {
        changed++;
      }
    }
  };
  walk(playgroundRoot, '');
  return { changed, added };
}

module.exports = {
  FS_MODES,
  copyTree,
  setupPlaygroundFs,
  diffAgainstSource,
};
