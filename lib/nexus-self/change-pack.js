'use strict';
/**
 * lib/nexus-self/change-pack.js — a change to Nexus as one zip he drags into the Versionium tab, applied through the gate (0.60.225).
 * comp_id: nexus.lib.nexus-self.change-pack
 *
 * James, 2026-10-28, asked for the changes: "no patch file. unless idearium can run it. like i can drag it into the versionium tab and import"
 *
 * Nexus's own repos are immutable (idearium/repo: "edit on a COS branch … and apply through the gate"), so a dropped zip of files could be
 * imported as a version but never put back. A change pack is that zip with its base written in it:
 *   nexus-change.json  { schema: 'nexus.change-pack/1', from, to, version, made, files: [{ path, before: sha256|null, after: sha256|null }] }
 *   <path> …           the after-content of every file that is not deleted
 * Applying it checks each file on HIS disk against `before` — the file this change was made against:
 *   live == before → apply · live == after → already there, skipped · anything else → CONFLICT, and nothing at all is written
 * then writes system by system through lib/nexus-self/apply.js (scoped, recorded before writing, atomic per file, ledgered, re-snapshotted,
 * each apply rolled back by its id). Nothing here goes around the gate.
 *
 *   build({ from, to, cwd, version }) → Buffer            (the maker's side: reads git; never data/**)
 *   read(buffer)                     → { ok, manifest, files: Map(path → Buffer) } | { ok:false, error }   every after-hash verified
 *   isPack(buffer)                   → bool
 *   check(pack, { liveRoot })        → { ok, systems: { <sys>: { apply: [], already: [], conflicts: [] } }, errors, counts }
 *   applyPack(pack, { liveRoot, root, reason, by }) → { ok, applies: [{ system, applyId, files }], skipped } | { ok:false, … }
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const Zip = require('../zip.js');
const systems = require('./systems.js');

const MODULE_ID = 'nexus.lib.nexus-self.change-pack';
const SCHEMA = 'nexus.change-pack/1';
const MANIFEST = 'nexus-change.json';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const NEVER = /(^|\/)data\//;   // state, not code: never in a pack (CLAUDE.md)

function _git(cwd, args, opts = {}) { return execFileSync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024, ...opts }); }

function build({ from, to = 'HEAD', cwd = systems.ROOT, version = null } = {}) {
  if (!from) throw new Error('build needs from (the commit the receiver has)');
  const lines = _git(cwd, ['diff', '--name-status', '--no-renames', from, to]).toString('utf8').split('\n').filter(Boolean);
  const files = [], entries = [];
  for (const l of lines) {
    const [st, p] = l.split('\t');
    if (!p || NEVER.test(p)) continue;
    const blob = (rev) => { try { return _git(cwd, ['show', `${rev}:${p}`], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) { return null; } };
    const b = st === 'A' ? null : blob(from), a = st === 'D' ? null : blob(to);
    files.push({ path: p, before: b ? sha(b) : null, after: a ? sha(a) : null });
    if (a) entries.push({ path: p, data: a });
  }
  const manifest = { schema: SCHEMA, from: _git(cwd, ['rev-parse', from]).toString().trim(), to: _git(cwd, ['rev-parse', to]).toString().trim(),
    version, made: new Date().toISOString(), files };
  return Zip.create([{ path: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2)) }, ...entries]);
}

function isPack(buffer) {
  try { return new Zip(buffer).getEntries().some(e => e.entryName === MANIFEST); } catch (_) { return false; }
}

function read(buffer) {
  let zip; try { zip = new Zip(buffer); } catch (e) { return { ok: false, error: `not a zip: ${e.message}` }; }
  const ents = zip.getEntries();
  const me = ents.find(e => e.entryName === MANIFEST);
  if (!me) return { ok: false, error: `no ${MANIFEST}: not a change pack` };
  let manifest; try { manifest = JSON.parse(me.getData().toString('utf8')); } catch (e) { return { ok: false, error: `${MANIFEST} does not parse: ${e.message}` }; }
  if (manifest.schema !== SCHEMA || !Array.isArray(manifest.files)) return { ok: false, error: `${MANIFEST} is not ${SCHEMA}` };
  const byName = new Map(ents.filter(e => !e.isDirectory).map(e => [e.entryName, e]));
  const files = new Map();
  for (const f of manifest.files) {
    if (!f || typeof f.path !== 'string' || f.path.startsWith('/') || f.path.split('/').includes('..') || NEVER.test(f.path)) return { ok: false, error: `path not allowed: ${f && f.path}` };
    if (f.after === null) continue;
    const e = byName.get(f.path);
    if (!e) return { ok: false, error: `${f.path} is listed but not in the zip` };
    const buf = e.getData();
    if (sha(buf) !== f.after) return { ok: false, error: `${f.path} does not match its hash in ${MANIFEST} (damaged or edited)` };
    files.set(f.path, buf);
  }
  return { ok: true, manifest, files };
}

function _live(liveRoot, rel) { const p = path.join(liveRoot, rel); try { return fs.statSync(p).isFile() ? sha(fs.readFileSync(p)) : null; } catch (_) { return null; } }

function check(pack, { liveRoot = systems.ROOT } = {}) {
  const out = { ok: true, systems: {}, errors: [], counts: { apply: 0, already: 0, conflicts: 0 } };
  for (const f of pack.manifest.files) {
    const sys = systems.ownerOf(f.path);
    if (!sys) { out.errors.push(`${f.path}: no system owns it`); continue; }
    if (systems.skipped(f.path, false)) { out.errors.push(`${f.path}: a path Nexus never versions (${[...systems.SKIP_DIRS].join(', ')})`); continue; }
    const s = out.systems[sys] || (out.systems[sys] = { apply: [], already: [], conflicts: [] });
    const live = _live(liveRoot, f.path);
    if (live === f.after) { s.already.push(f.path); out.counts.already++; }
    else if (live === f.before) { s.apply.push(f.path); out.counts.apply++; }
    else { s.conflicts.push({ path: f.path, why: live === null ? 'missing on this machine' : f.before === null ? 'exists here but this change adds it' : 'changed here since the version this change was made against' }); out.counts.conflicts++; }
  }
  out.ok = !out.errors.length && !out.counts.conflicts;
  return out;
}

function applyPack(pack, { liveRoot = systems.ROOT, root, reason = '', by = 'person' } = {}) {
  const c = check(pack, { liveRoot });
  if (!c.ok) return { ok: false, errors: c.errors, conflicts: Object.values(c.systems).flatMap(s => s.conflicts), check: c };
  const store = require('./store.js'), A = require('./apply.js');
  const rootOpt = root ? { root } : {};
  const base = store.snapshot({ liveRoot, ...rootOpt }).hash;   // the live tree now; each file was just checked against the pack's own base
  const applies = [];
  const why = reason || `change pack ${String(pack.manifest.from).slice(0, 8)}..${String(pack.manifest.to).slice(0, 8)}${pack.manifest.version ? ` (${pack.manifest.version})` : ''}`;
  for (const [system, s] of Object.entries(c.systems)) {
    if (!s.apply.length) continue;
    const changes = s.apply.map(p => { const f = pack.manifest.files.find(x => x.path === p); return f.after === null ? { path: p, delete: true } : { path: p, content: pack.files.get(p) }; });
    const r = A.apply({ system, base, changes, reason: why, by, liveRoot, ...rootOpt });
    if (!r.ok) return { ok: false, errors: r.errors || [], conflicts: r.conflicts || [], applies, failedAt: system, note: applies.length ? `applied before the failure: ${applies.map(a => a.applyId).join(', ')} — each rolls back by its id` : undefined };
    applies.push({ system, applyId: r.applyId, files: r.applied.length });
  }
  return { ok: true, applies, skipped: c.counts.already };
}

module.exports = { MODULE_ID, SCHEMA, MANIFEST, build, isPack, read, check, applyPack };

// node lib/nexus-self/change-pack.js <from> [to] [out.zip] — the maker's side
if (require.main === module) {
  const [from, to = 'HEAD', out = 'nexus.zip'] = process.argv.slice(2);
  if (!from) { console.log('usage: node lib/nexus-self/change-pack.js <from> [to] [out.zip]'); process.exit(1); }
  let version = null; try { version = fs.readFileSync(path.join(systems.ROOT, 'VERSION'), 'utf8').trim(); } catch (_) {}
  const buf = build({ from, to, version });
  fs.writeFileSync(out, buf);
  const p = read(buf);
  console.log(`${out}: ${p.manifest.files.length} file(s) ${p.manifest.from.slice(0, 8)}..${p.manifest.to.slice(0, 8)}${version ? ` (${version})` : ''}, ${buf.length} bytes`);
}
