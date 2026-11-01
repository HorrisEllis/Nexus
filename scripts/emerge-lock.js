#!/usr/bin/env node
'use strict';
/**
 * scripts/emerge-lock.js — Nexus's emerge/ is the Emerge repo, whole, at one commit; its node emerge/emerge.cos holds every file's hash.
 * EAS3 (docs/2026-10-31-emerge-as-a-system-phasemap.spec, MOD-EAS-NEXUS-PLACE). 0.60.339; 0.60.340 the lock is in the .cos node.
 * James, 2026-11-01: "the github repo not the one in lib already. i want that done now." · "with the proper file structrure and persistent
 * data" · "no .json files. only nodes. use .cos"
 *
 *   node scripts/emerge-lock.js                      check: every locked file present and byte-for-byte its hash; exit 1 naming each one not
 *   node scripts/emerge-lock.js --write [--commit <sha>]   take what is in emerge/ now as the new lock (after taking a new Emerge commit)
 *
 * The Emerge repo is the one source: the snapshot changes only by a new lock. Not held to a hash, each said in the node:
 *   state          what Emerge writes while it runs (emerge/emerge/data/, input/, processing/, done/, failed/, output/)
 *   emerge.cos     Nexus's own node beside the repo (what the compartment is, its lock, how COS runs it), never part of the repo
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'emerge');
const NODE = path.join(DIR, 'emerge.cos');
const STATE = ['emerge/data/', 'emerge/input/', 'emerge/processing/', 'emerge/done/', 'emerge/failed/', 'emerge/output/'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(p, out); } else out.push(path.relative(DIR, p).split(path.sep).join('/'));
  }
  return out;
}
const isState = (rel, state = STATE) => state.some(s => rel.startsWith(s));
const readNode = (dir = DIR) => yaml.load(fs.readFileSync(path.join(dir, 'emerge.cos'), 'utf8'));

/** check() → { ok, changed: [rel], missing: [rel], extra: [rel], commit, files } */
function check({ dir = DIR } = {}) {
  const repo = readNode(dir).payload.repo, state = repo.state || STATE;
  const changed = [], missing = [], extra = [];
  for (const [rel, h] of Object.entries(repo.files)) {
    if (isState(rel, state)) continue;
    const f = path.join(dir, rel);
    if (!fs.existsSync(f)) missing.push(rel); else if (sha(f) !== h) changed.push(rel);
  }
  for (const rel of walk(dir)) if (rel !== 'emerge.cos' && !(rel in repo.files) && !isState(rel, state)) extra.push(rel);
  return { ok: !changed.length && !missing.length && !extra.length, changed, missing, extra, commit: repo.commit, files: Object.keys(repo.files).length };
}

/** write({ commit }) — the files in emerge/ now become the lock, in the node; everything else in the node is kept */
function write({ commit } = {}) {
  const node = readNode();
  const files = {};
  for (const rel of walk(DIR).filter(r => r !== 'emerge.cos').sort()) files[rel] = sha(path.join(DIR, rel));
  node.payload.repo = { ...node.payload.repo, commit: commit || node.payload.repo.commit, lockedAt: new Date().toISOString().slice(0, 10), state: STATE, files };
  fs.writeFileSync(NODE, yaml.dump(node, { lineWidth: 160, noRefs: true }));
  return node.payload.repo;
}

if (require.main === module) {
  const a = process.argv.slice(2), val = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--write')) { const r = write({ commit: val('commit') }); console.log(`emerge/emerge.cos locked: ${Object.keys(r.files).length} files at ${r.commit}`); }
  else {
    const r = check();
    if (r.ok) { console.log(`emerge/ matches its lock: ${r.files} files at ${r.commit}`); process.exit(0); }
    for (const k of ['changed', 'missing', 'extra']) for (const f of r[k]) console.log(`  ${k}: emerge/${f}`);
    console.log(`emerge/ does not match its lock (Emerge ${r.commit}): take the change in the Emerge repo, then a new lock`); process.exit(1);
  }
}

module.exports = { check, write, readNode, STATE };
