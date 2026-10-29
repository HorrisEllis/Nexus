'use strict';
/**
 * versionium/lib/changelogs.js — where Nexus's release changelogs live, said once (0.60.274; Versionium's own since 0.60.277, his (a)).
 * component_id: versionium.lib.changelogs
 *
 * James, 2026-10-29, choosing (a): "a" — Versionium owns the changelogs and the release logic that reads them (§5.15). Other systems ask
 * Versionium's routes (GET /api/versionium/nexus/changelog); only Versionium's own code, scripts and tests require this.
 *
 * James, 2026-10-28: "can we move the changelogs to versionium and idearium"
 *
 * The CHANGELOG-<version>.md files moved from the repository root into versionium/changelogs/ (Versionium keeps the
 * releases; Idearium's Releases view reads them through GET /api/releases/changelog). Every reader asks here, never
 * the root by name. The root is still read after the new home, so a tree from before the move (his older copy) works.
 *
 *   DIR                     'versionium/changelogs'
 *   list(root?)             → [{ name, version, rel, abs }]  every CHANGELOG*.md, the new home first, one per name
 *   find(root?, name)       → { name, rel, abs } | null
 *   forVersion(root?, v)    → { name, rel, abs } | null   CHANGELOG-<v>.md
 *   read(root?, v)          → { version, name, rel, text } | null
 *   pathFor(v)              → 'versionium/changelogs/CHANGELOG-<v>.md' — where a new one is written
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');   // 0.60.277 VS1 — in versionium/lib: the repository root is two up
const DIR = 'versionium/changelogs';
const NAME = /^CHANGELOG.*\.md$/;

function _places(root) { return [DIR, '']; }

function list(root = ROOT) {
  const seen = new Map();
  for (const rel of _places(root)) {
    let names = []; try { names = fs.readdirSync(path.join(root, rel)); } catch (_) {}
    for (const n of names) {
      if (!NAME.test(n) || seen.has(n)) continue;
      const m = /^CHANGELOG-(\d+\.\d+\.\d+)/.exec(n);
      seen.set(n, { name: n, version: m ? m[1] : null, rel: rel ? `${rel}/${n}` : n, abs: path.join(root, rel, n) });
    }
  }
  return [...seen.values()];
}

function find(root = ROOT, name) {
  for (const rel of _places(root)) {
    const abs = path.join(root, rel, name);
    if (fs.existsSync(abs)) return { name, rel: rel ? `${rel}/${name}` : name, abs };
  }
  return null;
}

function forVersion(root = ROOT, version) { return version ? find(root, `CHANGELOG-${String(version).replace(/^v/, '')}.md`) : null; }

function read(root = ROOT, version) {
  const f = forVersion(root, version);
  if (!f) return null;
  return { version: String(version).replace(/^v/, ''), name: f.name, rel: f.rel, text: fs.readFileSync(f.abs, 'utf8') };
}

function pathFor(version) { return `${DIR}/CHANGELOG-${String(version).replace(/^v/, '')}.md`; }

module.exports = { DIR, list, find, forVersion, read, pathFor, MODULE_ID: 'versionium.lib.changelogs' };
