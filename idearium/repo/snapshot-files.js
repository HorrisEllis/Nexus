/**
 * idearium/repo/snapshot-files.js — the repo's files as raw bytes, for the
 * per-file layer under a repo snapshot (MCO-B).
 * UUID: nexus-idearium-repo-snapshot-files-v1-0000-2026-0920-jamesbrooks-001
 * Spec: versionium/spec/versionium.file-versioning.spec.
 *
 * What is captured: every path in the repo record's file list, plus the paths
 * the source layer owns (an imported project's real files, binaries included),
 * that exists on disk as a regular file, read as bytes. Not chunk text, not pipeline
 * artifacts (they are not in the file list). A file that cannot be captured
 * is LISTED with a reason. It is never silently dropped, and it is never part
 * of the tree hash, so a snapshot cannot claim to restore what it did not keep.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadSourceManifest, sourcePathSet } from './source-files.js';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Same rules as versionium/lib/files.js validPath(); versionium re-checks.
export function validPath(p) {
  if (typeof p !== 'string' || !p || p.length > 1024) return false;
  if (p.includes('\0') || p.includes('\\') || p.startsWith('/')) return false;
  return p.split('/').every(seg => seg && seg !== '.' && seg !== '..');
}

// Must equal versionium/lib/files.js treeHash() — asserted in the tests.
export function treeHashOf(entries) {
  return sha256(Buffer.from(entries.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(e => `${e.path}\t${e.sha256}\n`).join(''), 'utf8'));
}

/**
 * collectFiles(repo, repoDir, maxBytes)
 * -> { entries:[{path,sha256,bytes}], buffers: Map(path -> Buffer), skipped:[{path, reason}] }
 */
export function collectFiles(repo, repoDir, maxBytes) {
  const entries = []; const buffers = new Map(); const skipped = [];
  const root = path.resolve(repoDir);
  // The repo's tree is the chunk-derived file list PLUS the source layer's
  // files. An imported project keeps its real bytes there (binaries included)
  // and those files are NOT in repo.files: found by the MCO-C end-to-end run,
  // where the baseline of an imported zip silently lacked its one binary.
  const paths = [];
  const seen = new Set();
  const add = (rel) => { if (!seen.has(rel)) { seen.add(rel); paths.push(rel); } };
  for (const f of (repo && repo.files) || []) add(f && f.path);
  const man = loadSourceManifest(repoDir);
  if (man && man.unreadable) {
    skipped.push({ path: '.idearium-sources.json', reason: 'source manifest unreadable — source-only files (binaries) may be missing from this snapshot' });
  } else {
    for (const rel of sourcePathSet(man)) add(rel);
  }
  for (const rel of paths) {
    if (!validPath(rel)) { skipped.push({ path: String(rel), reason: 'unsafe or invalid path' }); continue; }
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) { skipped.push({ path: rel, reason: 'resolves outside the repo directory' }); continue; }
    let st;
    try { st = fs.lstatSync(abs); } catch (_) { skipped.push({ path: rel, reason: 'not on disk' }); continue; }
    if (!st.isFile()) { skipped.push({ path: rel, reason: 'not a regular file (symlinks are not followed)' }); continue; }
    if (st.size > maxBytes) { skipped.push({ path: rel, reason: `over the ${maxBytes}-byte per-file limit (${st.size} bytes)` }); continue; }
    let buf;
    try { buf = fs.readFileSync(abs); } catch (e) { skipped.push({ path: rel, reason: `unreadable: ${e.code || e.message}` }); continue; }
    entries.push({ path: rel, sha256: sha256(buf), bytes: buf.length });
    buffers.set(rel, buf);
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { entries, buffers, skipped };
}

export { sha256 };
