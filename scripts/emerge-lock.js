#!/usr/bin/env node
'use strict';
/**
 * scripts/emerge-lock.js — Nexus's emerge/ is a snapshot of the Emerge repo's emerge/ at one commit; this checks it, or writes the lock.
 * EAS3 (docs/2026-10-31-emerge-as-a-system-phasemap.spec, MOD-EAS-NEXUS-PLACE in docs/emerge-system.spec). 0.60.339.
 * James, 2026-11-01: "the github repo not the one in lib already. i want that done now. then i want to start being able to use it."
 *
 *   node scripts/emerge-lock.js                      check: every locked file present and byte-for-byte its hash; exit 1 naming each one not
 *   node scripts/emerge-lock.js --write --source <dir> --commit <sha>   write emerge/EMERGE.lock.json from what is in emerge/ now
 *
 * The Emerge repo is the one source (behavioral contract: the snapshot changes only by a new lock). Two kinds of file are not held to
 * their hash, each said in the lock:
 *   state     Emerge's runtime folders (data/, input/, processing/, done/, failed/, output/): what it writes while it runs is state, not code
 *   overlays  a file Nexus adds on top of the snapshot, with its own hash and why (emerge/compartment.json's runtime, so COS can run it)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'emerge');
const LOCK = path.join(DIR, 'EMERGE.lock.json');
const STATE = ['data/', 'input/', 'processing/', 'done/', 'failed/', 'output/'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else out.push(path.relative(DIR, p).split(path.sep).join('/'));
  }
  return out;
}
const isState = (rel) => STATE.some(s => rel.startsWith(s));

/** check() → { ok, changed: [rel], missing: [rel], extra: [rel], overlays } */
function check({ dir = DIR } = {}) {
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'EMERGE.lock.json'), 'utf8'));
  const changed = [], missing = [], extra = [];
  for (const [rel, h] of Object.entries(lock.files)) {
    const f = path.join(dir, rel);
    if (!fs.existsSync(f)) { if (!isState(rel)) missing.push(rel); continue; }
    if (isState(rel)) continue;
    const want = lock.overlays && lock.overlays[rel] ? lock.overlays[rel].sha256 : h;
    if (sha(f) !== want) changed.push(rel);
  }
  for (const [rel, o] of Object.entries(lock.overlays || {})) if (!(rel in lock.files)) { const f = path.join(dir, rel); if (!fs.existsSync(f)) missing.push(rel); else if (sha(f) !== o.sha256) changed.push(rel); }
  for (const rel of walk(dir)) if (rel !== 'EMERGE.lock.json' && !(rel in lock.files) && !(lock.overlays || {})[rel] && !isState(rel)) extra.push(rel);
  return { ok: !changed.length && !missing.length && !extra.length, changed, missing, extra, commit: lock.commit, files: Object.keys(lock.files).length };
}

function write({ source, commit, overlays = {} }) {
  const files = {};
  for (const rel of walk(DIR).filter(r => r !== 'EMERGE.lock.json').sort()) files[rel] = overlays[rel] ? overlays[rel].upstream : sha(path.join(DIR, rel));
  const lock = { schema: 'nexus.emerge-lock/1', source, commit, path: 'emerge/', lockedAt: new Date().toISOString().slice(0, 10), state: STATE,
    note: 'the Emerge repo is the one source; this snapshot changes only by a new lock (scripts/emerge-lock.js --write)', files, overlays };
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
  return lock;
}

if (require.main === module) {
  const a = process.argv.slice(2), val = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--write')) {
    const prev = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : {};
    const l = write({ source: val('source') || prev.source, commit: val('commit') || prev.commit, overlays: prev.overlays || {} });
    console.log(`emerge/EMERGE.lock.json written: ${Object.keys(l.files).length} files at ${l.commit}`);
  } else {
    const r = check();
    if (r.ok) { console.log(`emerge/ matches its lock: ${r.files} files at ${r.commit}`); process.exit(0); }
    for (const k of ['changed', 'missing', 'extra']) for (const f of r[k]) console.log(`  ${k}: emerge/${f}`);
    console.log(`emerge/ does not match its lock (Emerge ${r.commit}): take the change in the Emerge repo, then a new lock`); process.exit(1);
  }
}

module.exports = { check, write, STATE };
